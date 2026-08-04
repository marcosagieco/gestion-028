// --- MOTOR DE PROYECCIÓN: regresión lineal + promedio móvil + estacionalidad semanal ---
// Funciones puras, sin dependencias de React. Usado por Inicio (facturación) y Meta Ads (spend/revenue/CPA).

export const PROJECTION_CUTOFF_DATE = '2026-06-01';
export const MIN_DAYS_REQUIRED = 21;
export const NEAR_HORIZON_DAYS = 14;
export const FAR_HORIZON_DAYS = 60; // horizonte total; tramo lejano = días 15..60

const NEAR_BAND_FACTOR = 1.0;
const FAR_BAND_FACTOR = 2.2; // ensanchamiento más agresivo pasado el día 14

const DOW_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // mediodía local: evita bordes de DST
};

const addDays = (key, n) => {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

const yesterdayKey = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKey(d);
};

// Construye una serie diaria ascendente, zero-filled, entre cutoffDate y endDate (default: ayer,
// para no incluir el día actual todavía parcial). `items` puede ser cualquier arreglo (ventas, datos de Meta, etc.).
export function buildDailySeries(items, options = {}) {
  const {
    cutoffDate = PROJECTION_CUTOFF_DATE,
    endDate = yesterdayKey(),
    dateOf = (it) => it.date,
    valueOf = () => 1,
    filter = () => true,
  } = options;

  const totals = {};
  for (const it of items) {
    if (!filter(it)) continue;
    const raw = dateOf(it);
    if (!raw) continue;
    const d = new Date(raw);
    if (isNaN(d.getTime())) continue;
    const key = dayKey(d);
    if (key < cutoffDate || key > endDate) continue;
    totals[key] = (totals[key] || 0) + (valueOf(it) || 0);
  }

  const series = [];
  let cursor = cutoffDate;
  while (cursor <= endDate) {
    const d = parseDay(cursor);
    series.push({ date: cursor, value: totals[cursor] || 0, dow: d.getDay() });
    cursor = addDays(cursor, 1);
  }
  return series;
}

// Serie de ratio día a día (ej. CPA = spend/clientes). Forward-fill cuando el denominador es 0
// para no fabricar ceros ni romper la continuidad día a día que necesita la regresión.
export function buildRatioSeries(numeratorSeries, denominatorSeries) {
  let lastValid = 0;
  return numeratorSeries.map((row, i) => {
    const denom = denominatorSeries[i]?.value ?? 0;
    let value;
    if (denom > 0) {
      value = row.value / denom;
      lastValid = value;
    } else {
      value = lastValid;
    }
    return { date: row.date, value, dow: row.dow };
  });
}

export function hasEnoughHistory(series, minDays = MIN_DAYS_REQUIRED) {
  return series.length >= minDays;
}

// Recorta los días iniciales en 0 antes de la primera aparición real de la métrica. Necesario
// porque buildDailySeries rellena con 0 desde PROJECTION_CUTOFF_DATE para poder alinear por índice
// series independientes (ver buildRatioSeries) — sin este recorte, una métrica que recién empezó a
// registrarse hace poco (ej. clientes fijos por ads) parecería tener meses de historial en vez de días.
function trimLeadingZeros(series) {
  const idx = series.findIndex((r) => r.value !== 0);
  return idx === -1 ? [] : series.slice(idx);
}

// Promedio móvil final (trailing), con ventana parcial en los primeros días.
export function movingAverage(values, windowSize = 7) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = values.slice(start, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

// Regresión lineal por mínimos cuadrados sobre índice x = 0..n-1.
export function linearRegression(values) {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0, predict: () => 0 };
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept, predict: (x) => intercept + slope * x };
}

// Índice de estacionalidad por día de semana: promedio de (real/tendencia) por dow, normalizado a media 1.
export function computeSeasonality(rawValues, trendValues, dowValues) {
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  for (let i = 0; i < rawValues.length; i++) {
    const trend = trendValues[i];
    if (trend <= 0) continue;
    sums[dowValues[i]] += rawValues[i] / trend;
    counts[dowValues[i]] += 1;
  }
  const raw = sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : 1));
  const mean = raw.reduce((a, b) => a + b, 0) / 7;
  return mean > 0 ? raw.map((v) => v / mean) : raw;
}

// Pipeline completo: promedio móvil -> regresión sobre la serie suavizada -> estacionalidad ->
// sigma de residuales -> bandas de error que crecen con la raíz del horizonte -> stats derivados.
// `farHorizonDays` es el horizonte TOTAL (días 1..farHorizonDays); el tramo de baja confianza es
// siempre desde NEAR_HORIZON_DAYS+1 hasta farHorizonDays (por defecto 60, pero se puede estirar,
// ej. hasta fin de año, sin tocar el resto del pipeline).
export function computeProjection(rawSeries, options = {}) {
  const { farHorizonDays = FAR_HORIZON_DAYS } = options;
  const series = trimLeadingZeros(rawSeries);
  if (!hasEnoughHistory(series)) {
    const currentValue = rawSeries.length > 0 ? rawSeries[rawSeries.length - 1].value : 0;
    return { insufficientData: true, currentValue, history: series, forecastNear: [], forecastFar: [], seasonality: null, stats: null };
  }

  const rawValues = series.map((r) => r.value);
  const dowValues = series.map((r) => r.dow);
  const n = rawValues.length;

  const smoothed = movingAverage(rawValues, 7);
  const { predict } = linearRegression(smoothed);
  const trendValues = smoothed.map((_, i) => predict(i));
  const seasonality = computeSeasonality(rawValues, trendValues, dowValues);

  const residuals = rawValues.map((v, i) => v - trendValues[i]);
  const meanResidual = residuals.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? residuals.reduce((a, b) => a + (b - meanResidual) ** 2, 0) / (n - 1) : 0;
  const sigma = Math.sqrt(variance);

  const lastDate = series[n - 1].date;

  const bandHalfWidth = (d) => {
    if (d <= NEAR_HORIZON_DAYS) return sigma * NEAR_BAND_FACTOR * Math.sqrt(d);
    return sigma * NEAR_BAND_FACTOR * Math.sqrt(NEAR_HORIZON_DAYS) + sigma * FAR_BAND_FACTOR * Math.sqrt(d - NEAR_HORIZON_DAYS);
  };

  const forecastAll = [];
  for (let step = 1; step <= farHorizonDays; step++) {
    const x = n - 1 + step;
    const date = addDays(lastDate, step);
    const dow = parseDay(date).getDay();
    const trend = predict(x) * seasonality[dow];
    const half = bandHalfWidth(step);
    forecastAll.push({
      date,
      dow,
      forecast: Math.max(0, trend),
      low: Math.max(0, trend - half),
      high: Math.max(0, trend + half),
    });
  }

  const forecastNear = forecastAll.slice(0, NEAR_HORIZON_DAYS);
  const forecastFar = forecastAll.slice(NEAR_HORIZON_DAYS);

  const last7 = rawValues.slice(-7);
  const prev7 = rawValues.slice(-14, -7);
  const avgDaily = last7.reduce((a, b) => a + b, 0) / last7.length;
  const avgPrev7 = prev7.length > 0 ? prev7.reduce((a, b) => a + b, 0) / prev7.length : null;
  const weeklyGrowthPct = avgPrev7 && avgPrev7 !== 0 ? ((avgDaily - avgPrev7) / avgPrev7) * 100 : null;

  const lastD = parseDay(lastDate);
  const year = lastD.getFullYear();
  const month = lastD.getMonth();
  const monthStartKey = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const mtdActual = series.filter((r) => r.date >= monthStartKey).reduce((a, r) => a + r.value, 0);
  const monthForecasts = forecastAll.filter((f) => {
    const fd = parseDay(f.date);
    return fd.getFullYear() === year && fd.getMonth() === month;
  });
  const endOfMonthEstimate = {
    low: mtdActual + monthForecasts.reduce((a, f) => a + f.low, 0),
    mid: mtdActual + monthForecasts.reduce((a, f) => a + f.forecast, 0),
    high: mtdActual + monthForecasts.reduce((a, f) => a + f.high, 0),
  };

  const bestDayIdx = seasonality.reduce((best, v, i) => (v > seasonality[best] ? i : best), 0);

  // Confiabilidad = qué tan parejas fueron las ventas diarias respecto a la tendencia (coeficiente
  // de variación = sigma/promedio). Ventas muy irregulares día a día -> proyección menos confiable,
  // más allá de lo que ya muestran las bandas de error.
  const cv = avgDaily > 0 ? sigma / avgDaily : null;
  const reliability = cv == null ? null : { level: cv < 0.3 ? 'Alta' : cv < 0.6 ? 'Media' : 'Baja', cv };

  return {
    insufficientData: false,
    currentValue: rawValues[n - 1],
    history: series,
    forecastNear,
    forecastFar,
    seasonality,
    stats: {
      avgDaily,
      weeklyGrowthPct,
      endOfMonthEstimate,
      bestDay: { dow: bestDayIdx, label: DOW_LABELS[bestDayIdx], index: seasonality[bestDayIdx] },
      reliability,
    },
  };
}
