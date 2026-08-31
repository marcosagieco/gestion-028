// --- MOTOR DE PROYECCIÓN: regresión lineal + promedio móvil + estacionalidad semanal/mensual +
// calendario comercial argentino + detección de ciclos ---
// Funciones puras, sin dependencias de React. Usado por Inicio (facturación) y Meta Ads (spend/revenue/CPA).

export const PROJECTION_CUTOFF_DATE = '2026-06-01';
export const MIN_DAYS_REQUIRED = 21;
export const NEAR_HORIZON_DAYS = 14;
export const FAR_HORIZON_DAYS = 60; // horizonte total; tramo lejano = días 15..60

const NEAR_BAND_FACTOR = 1.0;
const FAR_BAND_FACTOR = 2.2; // ensanchamiento más agresivo pasado el día 14

const DOW_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_LABELS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

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
    filter = () => true,
  } = options;
  // OJO: "valueOf" no se puede destructurar con un default normal (`valueOf = () => 1`) — TODO
  // objeto plano hereda Object.prototype.valueOf, que no es undefined, así que la desestructuración
  // agarra ESE método nativo en vez de nuestro default cuando el caller no pasa uno propio (rompe
  // silenciosamente, sin tirar error consistente). Por eso se resuelve a mano acá.
  const valueOf = Object.prototype.hasOwnProperty.call(options, 'valueOf') ? options.valueOf : () => 1;

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

// Igual que buildDailySeries, pero sin fecha de corte fija: arranca en la fecha real del primer
// registro que matchea el filtro (no antes — no tiene sentido "rellenar con ceros" años previos a
// que el negocio existiera) y llega hasta ayer. Se usa SOLO para detectar estacionalidad mensual y
// ciclos recurrentes, que necesitan ver TODO el historial disponible, no solo la ventana reciente
// que usa la regresión de tendencia (PROJECTION_CUTOFF_DATE).
export function buildFullHistoryDailySeries(items, options = {}) {
  const { dateOf = (it) => it.date, filter = () => true } = options;
  // Ver el comentario en buildDailySeries: no destructurar "valueOf" con default normal.
  const valueOf = Object.prototype.hasOwnProperty.call(options, 'valueOf') ? options.valueOf : () => 1;

  let minKey = null;
  const totals = {};
  for (const it of items) {
    if (!filter(it)) continue;
    const raw = dateOf(it);
    if (!raw) continue;
    const d = new Date(raw);
    if (isNaN(d.getTime())) continue;
    const key = dayKey(d);
    totals[key] = (totals[key] || 0) + (valueOf(it) || 0);
    if (minKey == null || key < minKey) minKey = key;
  }
  if (minKey == null) return [];

  const endDate = yesterdayKey();
  const series = [];
  let cursor = minKey;
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

// --- Estacionalidad mensual (real, calculada de TODO el historial disponible) ---
// Mismo principio que computeSeasonality, pero agrupando por mes calendario en vez de día de
// semana, sobre una ventana móvil larga (30 días) para no confundirse con la estacionalidad
// semanal ni con el crecimiento normal del negocio. Nunca inventa un índice para un mes del que no
// hay suficientes datos reales: ese mes queda en `null` en vez de asumir cualquier cosa.
export const MIN_DAYS_FOR_MONTHLY_SEASONALITY = 120; // ~4 meses mínimos de historial total
const MIN_DAYS_PER_MONTH_FOR_INDEX = 10; // por mes, para confiar en su índice individual

export function computeMonthlySeasonality(fullSeries) {
  const series = trimLeadingZeros(fullSeries || []);
  if (series.length < MIN_DAYS_FOR_MONTHLY_SEASONALITY) return null;

  const rawValues = series.map((r) => r.value);
  const trend = movingAverage(rawValues, 30);
  const monthOf = series.map((r) => parseDay(r.date).getMonth());

  const sums = new Array(12).fill(0);
  const counts = new Array(12).fill(0);
  for (let i = 0; i < rawValues.length; i++) {
    if (trend[i] <= 0) continue;
    sums[monthOf[i]] += rawValues[i] / trend[i];
    counts[monthOf[i]] += 1;
  }

  const rawIndex = sums.map((s, i) => (counts[i] >= MIN_DAYS_PER_MONTH_FOR_INDEX ? s / counts[i] : null));
  const validValues = rawIndex.filter((v) => v != null);
  if (validValues.length < 4) return null; // hace falta variedad de meses distintos para que el índice tenga sentido

  const mean = validValues.reduce((a, b) => a + b, 0) / validValues.length;
  const index = rawIndex.map((v) => (v == null ? null : (mean > 0 ? v / mean : 1)));
  return index.map((v, i) => ({ month: i, label: MONTH_LABELS[i], index: v, hasData: v != null, daysObserved: counts[i] }));
}

// --- Calendario comercial argentino: fechas que se recalculan cada año (no hardcodeadas a un año
// puntual) para que siga andando solo en años futuros sin mantenimiento. Multiplicadores
// conservadores y documentados — se aplican SOLO al tramo proyectado, nunca a datos reales. ---
function nthWeekdayOfMonth(year, month, weekday, n) {
  const d = new Date(year, month, 1, 12, 0, 0);
  let count = 0;
  while (d.getMonth() === month) {
    if (d.getDay() === weekday) {
      count += 1;
      if (count === n) return dayKey(d);
    }
    d.setDate(d.getDate() + 1);
  }
  return null;
}

function lastWeekdayOfMonth(year, month, weekday) {
  const d = new Date(year, month + 1, 0, 12, 0, 0); // último día del mes
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
  return dayKey(d);
}

export function getSeasonalEvents(year) {
  const events = [];

  const diaNino = nthWeekdayOfMonth(year, 7, 0, 3); // 3er domingo de agosto
  if (diaNino) events.push({ name: 'Día del Niño', start: addDays(diaNino, -6), end: diaNino, multiplier: 1.20, emoji: '🧸' });

  const primavera = `${year}-09-21`; // Día de la Primavera / del Estudiante, fecha fija
  events.push({ name: 'Día de la Primavera', start: addDays(primavera, -3), end: addDays(primavera, 1), multiplier: 1.15, emoji: '🌸' });

  const aguinaldoJun = `${year}-06-18`; // vencimiento legal 1ra cuota SAC
  events.push({ name: 'Aguinaldo (1ra cuota)', start: addDays(aguinaldoJun, -2), end: addDays(aguinaldoJun, 7), multiplier: 1.10, emoji: '💰' });

  const diaMadre = nthWeekdayOfMonth(year, 9, 0, 3); // 3er domingo de octubre
  if (diaMadre) events.push({ name: 'Día de la Madre', start: addDays(diaMadre, -10), end: diaMadre, multiplier: 1.30, emoji: '💐' });

  const cyberStart = nthWeekdayOfMonth(year, 10, 1, 1); // aprox. primer lunes de noviembre — CACE define la fecha exacta cada año
  if (cyberStart) events.push({ name: 'Cyber Monday (aprox.)', start: cyberStart, end: addDays(cyberStart, 2), multiplier: 1.35, emoji: '💻' });

  const blackFriday = lastWeekdayOfMonth(year, 10, 5); // último viernes de noviembre
  events.push({ name: 'Black Friday', start: blackFriday, end: addDays(blackFriday, 3), multiplier: 1.45, emoji: '🛍️' });

  // Aguinaldo 2da cuota (vence 18/12) y Fiestas se solapan casi siempre — se tratan como una sola
  // ventana ascendente hacia Nochebuena en vez de dos multiplicadores separados pisándose.
  events.push({ name: 'Aguinaldo + Fiestas', start: `${year}-12-10`, end: `${year}-12-24`, multiplier: 1.40, emoji: '🎄' });
  events.push({ name: 'Año Nuevo', start: `${year}-12-26`, end: `${year}-12-31`, multiplier: 1.15, emoji: '🎆' });

  return events;
}

// Multiplica el forecast (mid/low/high) de los días que caen dentro de alguna ventana comercial
// conocida. Si dos ventanas se solapan para el mismo día, se queda con el multiplicador más alto y
// junta los nombres. El techo (`high`) se ensancha un poco extra en fechas pico: hay más
// incertidumbre real en cuánto puede llegar a vender un Black Friday que un martes cualquiera.
export function applyKnownSeasonality(forecastAll) {
  if (!forecastAll || forecastAll.length === 0) return forecastAll;
  const years = [...new Set(forecastAll.map((f) => parseDay(f.date).getFullYear()))];
  const events = years.flatMap((y) => getSeasonalEvents(y));
  return forecastAll.map((f) => {
    const matches = events.filter((e) => f.date >= e.start && f.date <= e.end);
    if (matches.length === 0) return f;
    const best = matches.reduce((a, b) => (b.multiplier > a.multiplier ? b : a));
    return {
      ...f,
      forecast: f.forecast * best.multiplier,
      low: f.low * best.multiplier,
      high: f.high * best.multiplier * 1.05,
      seasonalEvent: { name: matches.map((m) => m.name).join(' + '), emoji: best.emoji, multiplier: best.multiplier },
    };
  });
}

// --- Detección de ciclos recurrentes ("cada tantas semanas quietas, viene un repunte") ---
// Agrupa el historial completo por semana (lunes a domingo), busca semanas "pico" (bien por encima
// de su tendencia de 4 semanas) y mide qué tan parejo es el espacio entre picos consecutivos. Si el
// patrón no es lo bastante regular, o no hay suficiente historial, devuelve detected:false en vez
// de inventar un ciclo — esto es una pista informativa, nunca se usa para ajustar los números del
// pronóstico (a diferencia de la estacionalidad mensual/comercial, que sí es más confiable).
export const MIN_WEEKS_FOR_CYCLE_DETECTION = 10;
const SPIKE_THRESHOLD = 1.4; // semana "pico" = al menos 40% por encima de su tendencia local
const MIN_CONSISTENCY = 0.4; // 1 = espaciado perfectamente regular, 0 = totalmente errático

function mondayOf(dateStr) {
  const d = parseDay(dateStr);
  const offset = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - offset);
  return dayKey(d);
}

export function detectCyclicPattern(fullSeries) {
  const series = trimLeadingZeros(fullSeries || []);
  if (series.length < MIN_WEEKS_FOR_CYCLE_DETECTION * 7) return { detected: false, reason: 'insufficient_history' };

  const weekMap = {};
  for (const r of series) {
    const wk = mondayOf(r.date);
    weekMap[wk] = (weekMap[wk] || 0) + r.value;
  }
  const weeks = Object.entries(weekMap).sort((a, b) => a[0].localeCompare(b[0])).map(([key, value]) => ({ key, value }));
  if (weeks.length < MIN_WEEKS_FOR_CYCLE_DETECTION) return { detected: false, reason: 'insufficient_history' };

  const values = weeks.map((w) => w.value);
  const trend = movingAverage(values, 4);

  const spikeIdx = [];
  for (let i = 0; i < values.length; i++) {
    if (trend[i] > 0 && values[i] >= trend[i] * SPIKE_THRESHOLD) spikeIdx.push(i);
  }
  if (spikeIdx.length < 3) return { detected: false, reason: 'no_repeating_spikes' };

  const gaps = [];
  for (let i = 1; i < spikeIdx.length; i++) gaps.push(spikeIdx[i] - spikeIdx[i - 1]);
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const gapVariance = gaps.reduce((a, g) => a + (g - avgGap) ** 2, 0) / gaps.length;
  const gapStdDev = Math.sqrt(gapVariance);
  const consistency = avgGap > 0 ? Math.max(0, 1 - gapStdDev / avgGap) : 0;

  if (consistency < MIN_CONSISTENCY || avgGap < 1.5) return { detected: false, reason: 'irregular_pattern' };

  const lastSpikeIdx = spikeIdx[spikeIdx.length - 1];
  const weeksSinceLastSpike = values.length - 1 - lastSpikeIdx;
  const weeksUntilNextExpected = Math.max(0, Math.round(avgGap) - weeksSinceLastSpike);
  const nextExpectedDate = addDays(weeks[weeks.length - 1].key, weeksUntilNextExpected * 7);

  return {
    detected: true,
    avgGapWeeks: avgGap,
    consistency,
    spikesFound: spikeIdx.length,
    weeksSinceLastSpike,
    weeksUntilNextExpected,
    nextExpectedDate,
  };
}

// Pipeline completo: promedio móvil -> regresión sobre la serie suavizada -> estacionalidad semanal
// + mensual -> calendario comercial -> sigma de residuales -> bandas de error que crecen con la
// raíz del horizonte -> stats derivados. `farHorizonDays` es el horizonte TOTAL (días
// 1..farHorizonDays); el tramo de baja confianza es siempre desde NEAR_HORIZON_DAYS+1 hasta
// farHorizonDays (por defecto 60, pero se puede estirar, ej. hasta fin de año, sin tocar el resto
// del pipeline). `fullHistorySeries` (opcional) es la serie SIN corte de fecha — si se pasa, se usa
// para calcular estacionalidad mensual real y detectar ciclos recurrentes, con todo el historial
// disponible en vez de solo la ventana reciente que usa la regresión de tendencia.
export function computeProjection(rawSeries, options = {}) {
  const { farHorizonDays = FAR_HORIZON_DAYS, fullHistorySeries = null, applySeasonalEvents = false } = options;
  const series = trimLeadingZeros(rawSeries);
  if (!hasEnoughHistory(series)) {
    const currentValue = rawSeries.length > 0 ? rawSeries[rawSeries.length - 1].value : 0;
    return { insufficientData: true, currentValue, history: series, forecastNear: [], forecastFar: [], seasonality: null, stats: null, monthlySeasonality: null, cyclePattern: null };
  }

  const rawValues = series.map((r) => r.value);
  const dowValues = series.map((r) => r.dow);
  const n = rawValues.length;

  const smoothed = movingAverage(rawValues, 7);
  const { predict } = linearRegression(smoothed);
  const trendValues = smoothed.map((_, i) => predict(i));
  const seasonality = computeSeasonality(rawValues, trendValues, dowValues);

  // Estacionalidad mensual y ciclos, con TODO el historial disponible (no solo `series`, que arranca
  // en PROJECTION_CUTOFF_DATE) — ambos gracefully degradan a null/detected:false si no hay bastante data.
  const monthlySeasonality = fullHistorySeries ? computeMonthlySeasonality(fullHistorySeries) : null;
  const cyclePattern = fullHistorySeries ? detectCyclicPattern(fullHistorySeries) : null;
  const monthlyIndexByMonth = monthlySeasonality
    ? Object.fromEntries(monthlySeasonality.filter((m) => m.hasData).map((m) => [m.month, m.index]))
    : {};

  const residuals = rawValues.map((v, i) => v - trendValues[i]);
  const meanResidual = residuals.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? residuals.reduce((a, b) => a + (b - meanResidual) ** 2, 0) / (n - 1) : 0;
  const sigma = Math.sqrt(variance);

  const lastDate = series[n - 1].date;

  const bandHalfWidth = (d) => {
    if (d <= NEAR_HORIZON_DAYS) return sigma * NEAR_BAND_FACTOR * Math.sqrt(d);
    return sigma * NEAR_BAND_FACTOR * Math.sqrt(NEAR_HORIZON_DAYS) + sigma * FAR_BAND_FACTOR * Math.sqrt(d - NEAR_HORIZON_DAYS);
  };

  let forecastAll = [];
  for (let step = 1; step <= farHorizonDays; step++) {
    const x = n - 1 + step;
    const date = addDays(lastDate, step);
    const dateObj = parseDay(date);
    const dow = dateObj.getDay();
    const monthFactor = monthlyIndexByMonth[dateObj.getMonth()] ?? 1;
    const trend = predict(x) * seasonality[dow] * monthFactor;
    const half = bandHalfWidth(step);
    forecastAll.push({
      date,
      dow,
      forecast: Math.max(0, trend),
      low: Math.max(0, trend - half),
      high: Math.max(0, trend + half),
    });
  }

  if (applySeasonalEvents) {
    forecastAll = applyKnownSeasonality(forecastAll);
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

  // Próximos eventos comerciales que caen dentro del horizonte proyectado — para mostrarlos como
  // lista en la UI, aunque applySeasonalEvents esté apagado en esta métrica puntual.
  const upcomingEvents = [];
  if (forecastAll.length > 0) {
    const years = [...new Set(forecastAll.map((f) => parseDay(f.date).getFullYear()))];
    const allEvents = years.flatMap((y) => getSeasonalEvents(y));
    const horizonStart = forecastAll[0].date;
    const horizonEnd = forecastAll[forecastAll.length - 1].date;
    for (const e of allEvents) {
      if (e.end >= horizonStart && e.start <= horizonEnd) upcomingEvents.push(e);
    }
    upcomingEvents.sort((a, b) => a.start.localeCompare(b.start));
  }

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
    monthlySeasonality,
    cyclePattern,
    upcomingEvents,
    stats: {
      avgDaily,
      weeklyGrowthPct,
      endOfMonthEstimate,
      bestDay: { dow: bestDayIdx, label: DOW_LABELS[bestDayIdx], index: seasonality[bestDayIdx] },
      reliability,
    },
  };
}
