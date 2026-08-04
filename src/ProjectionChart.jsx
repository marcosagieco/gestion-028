import { useState } from 'react';
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// --- Proyección: color real (indigo existente en toda la app) vs. acento nuevo de "estimación" ---
const ACTUAL_COLOR = '#6366f1';

const EstimateBadge = ({ darkMode }) => (
  <span
    className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0"
    style={darkMode
      ? { background: 'rgba(252,219,0,0.12)', color: '#fcdb00' }
      : { background: 'rgba(252,219,0,0.14)', color: '#8a6d00' }}
  >
    Estimación
  </span>
);

const AccumulatingBadge = ({ darkMode }) => (
  <span className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0 ${darkMode ? 'bg-zinc-500/15 text-zinc-400' : 'bg-zinc-200 text-zinc-600'}`}>
    Acumulando datos
  </span>
);

export function ProjectionStatCard({ darkMode, label, value, sublabel, badge }) {
  return (
    <div className={`rounded-2xl border p-3 sm:p-4 flex flex-col gap-1 min-w-0 ${darkMode ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-zinc-500 leading-tight">{label}</span>
        {badge === 'estimate' && <EstimateBadge darkMode={darkMode} />}
        {badge === 'accumulating' && <AccumulatingBadge darkMode={darkMode} />}
      </div>
      <div className={`text-base sm:text-lg font-bold tracking-tight leading-tight break-all ${darkMode ? 'text-zinc-50' : 'text-zinc-900'}`}>{value}</div>
      {sublabel && <div className="text-[10px] sm:text-[11px] text-zinc-500">{sublabel}</div>}
    </div>
  );
}

// Tarjeta con selector de fecha: total histórico real (todas las ventas, sin límite de corte) más lo
// proyectado entre hoy y la fecha elegida. Si la fecha elegida ya pasó, muestra el total real sin más.
function CumulativeProjectionCard({ darkMode, label, allTimeTotal, projection, valueFormatter, minDate, maxDate, defaultDate }) {
  const [targetDate, setTargetDate] = useState(defaultDate);
  const lastHistoryDate = projection?.history?.length ? projection.history[projection.history.length - 1].date : null;
  const isFuture = lastHistoryDate != null && targetDate > lastHistoryDate;

  let mid = allTimeTotal, low = allTimeTotal, high = allTimeTotal;
  if (isFuture && projection && !projection.insufficientData) {
    const relevant = [...projection.forecastNear, ...projection.forecastFar].filter((f) => f.date <= targetDate);
    mid += relevant.reduce((a, f) => a + f.forecast, 0);
    low += relevant.reduce((a, f) => a + f.low, 0);
    high += relevant.reduce((a, f) => a + f.high, 0);
  }

  const inputClass = `rounded-lg border px-2 py-1 text-xs font-semibold outline-none ${darkMode ? 'bg-[#0D0D0D] border-white/[0.1] text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'}`;

  return (
    <div className={`rounded-2xl border p-3 sm:p-4 flex flex-col gap-2 ${darkMode ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-zinc-500 leading-tight">{label}</span>
        <div className="flex items-center gap-2">
          {isFuture && <EstimateBadge darkMode={darkMode} />}
          <input type="date" value={targetDate} min={minDate} max={maxDate}
            onChange={(e) => setTargetDate(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div className={`text-lg sm:text-xl font-bold tracking-tight ${darkMode ? 'text-zinc-50' : 'text-zinc-900'}`}>{valueFormatter(mid)}</div>
      <div className="text-[10px] sm:text-[11px] text-zinc-500">
        {isFuture
          ? `Histórico real + proyectado · rango estimado: ${valueFormatter(low)} – ${valueFormatter(high)}`
          : 'Histórico real hasta hoy'}
      </div>
    </div>
  );
}

// Aplana history + forecastNear + forecastFar en filas de un solo ComposedChart, duplicando el
// punto límite de cada tramo (último real / último forecast cercano) para que las líneas se
// toquen en el empalme sin depender de connectNulls.
function buildChartRows(projection) {
  const { history, forecastNear, forecastFar } = projection;
  const rows = [];

  history.forEach((h, i) => {
    const row = { date: h.date, actual: h.value, nearMid: null, nearLow: null, nearHigh: null, nearBandWidth: null, farMid: null, farLow: null, farHigh: null, farBandWidth: null };
    if (i === history.length - 1) {
      row.nearMid = h.value;
      row.nearLow = h.value;
      row.nearHigh = h.value;
      row.nearBandWidth = 0;
    }
    rows.push(row);
  });

  forecastNear.forEach((f, i) => {
    const row = {
      date: f.date, actual: null,
      nearMid: f.forecast, nearLow: f.low, nearHigh: f.high, nearBandWidth: f.high - f.low,
      farMid: null, farLow: null, farHigh: null, farBandWidth: null,
    };
    if (i === forecastNear.length - 1) {
      row.farMid = f.forecast;
      row.farLow = f.low;
      row.farHigh = f.high;
      row.farBandWidth = f.high - f.low;
    }
    rows.push(row);
  });

  forecastFar.forEach((f) => {
    rows.push({
      date: f.date, actual: null,
      nearMid: null, nearLow: null, nearHigh: null, nearBandWidth: null,
      farMid: f.forecast, farLow: f.low, farHigh: f.high, farBandWidth: f.high - f.low,
    });
  });

  return rows;
}

function ChartTooltip({ active, payload, label, darkMode, valueFormatter }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  let entry = null;
  if (row.actual != null) entry = { label: 'Real', value: row.actual };
  else if (row.nearMid != null) entry = { label: 'Proyección (alta confianza)', value: row.nearMid, range: [row.nearLow, row.nearHigh] };
  else if (row.farMid != null) entry = { label: 'Proyección (baja confianza)', value: row.farMid, range: [row.farLow, row.farHigh] };
  if (!entry) return null;

  return (
    <div className={`rounded-lg border px-3 py-2 text-[11px] shadow-xl ${darkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-white border-zinc-200 text-zinc-700'}`}>
      <div className="text-zinc-500 mb-1">{String(label).slice(5).replace('-', '/')}</div>
      <div><span className="font-bold">{valueFormatter(entry.value)}</span><span className="text-zinc-500"> · {entry.label}</span></div>
      {entry.range && <div className="text-zinc-500">rango: {valueFormatter(entry.range[0])} – {valueFormatter(entry.range[1])}</div>}
    </div>
  );
}

// Gráfico de proyección: línea sólida real + punteada de alta confianza (14d) con banda angosta +
// tenue de baja confianza (más allá) con banda ancha. Si la métrica no tiene suficiente historial
// (ver projectionEngine.hasEnoughHistory), muestra solo el valor actual con badge "Acumulando datos".
// `views`: opcional, arreglo de { key, label, title?, cumulativeLabel?, projection, valueFormatter,
// axisFormatter?, allTimeTotal? } para togglear entre métricas (ej. Facturación/Unidades/Ganancia)
// dentro del mismo gráfico. Sin `views`, se comporta como un gráfico de una sola métrica (Meta Ads).
export default function ProjectionChart({
  darkMode, title, subtitle, projection, valueFormatter = (v) => v, axisFormatter, compact = false,
  views, cumulativeMinDate, cumulativeMaxDate, cumulativeDefaultDate,
}) {
  const [activeViewIndex, setActiveViewIndex] = useState(0);
  const isMultiView = Array.isArray(views) && views.length > 0;
  const activeView = isMultiView ? views[Math.min(activeViewIndex, views.length - 1)] : null;

  const effProjection = isMultiView ? activeView.projection : projection;
  const effValueFormatter = isMultiView ? activeView.valueFormatter : valueFormatter;
  const effAxisFormatter = isMultiView ? (activeView.axisFormatter || activeView.valueFormatter) : (axisFormatter || valueFormatter);
  const effTitle = isMultiView ? (activeView.title || title) : title;

  const cardClass = `rounded-2xl border p-3 sm:p-4 ${darkMode ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200'}`;

  const viewToggle = isMultiView && (
    <div className="flex justify-end mb-2">
      <div className={`flex items-center p-1 rounded-lg border ${darkMode ? 'bg-zinc-900/60 border-white/[0.06]' : 'bg-zinc-100 border-zinc-200'}`}>
        {views.map((v, i) => (
          <button key={v.key} type="button" onClick={() => setActiveViewIndex(i)}
            className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all duration-150 ${
              i === activeViewIndex
                ? (darkMode ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'bg-white text-zinc-900 shadow-sm')
                : 'text-zinc-500 hover:text-zinc-400'
            }`}>{v.label}</button>
        ))}
      </div>
    </div>
  );

  if (!effProjection || effProjection.insufficientData) {
    const weeks = Math.floor((effProjection?.history?.length || 0) / 7);
    return (
      <div className={cardClass}>
        {viewToggle}
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-zinc-500 leading-tight">{effTitle}</span>
          <AccumulatingBadge darkMode={darkMode} />
        </div>
        <div className={`text-lg sm:text-xl font-bold tracking-tight ${darkMode ? 'text-zinc-50' : 'text-zinc-900'}`}>
          {effValueFormatter(effProjection?.currentValue || 0)}
        </div>
        <div className="text-[10px] sm:text-[11px] text-zinc-500 mt-1">
          {weeks} semana{weeks !== 1 ? 's' : ''} de historial · faltan datos para proyectar
        </div>
      </div>
    );
  }

  const fmtAxis = effAxisFormatter;
  const gridColor = darkMode ? '#1F1F1F' : '#e4e4e7';
  const textColor = darkMode ? '#71717a' : '#a1a1aa';
  const projColor = darkMode ? '#fcdb00' : '#8a6d00';

  const rows = buildChartRows(effProjection);
  const lastHistoryDate = effProjection.history[effProjection.history.length - 1].date;
  const tickFormatter = (d) => d.slice(5).replace('-', '/');
  const lastForecastDate = effProjection.forecastFar.length > 0
    ? effProjection.forecastFar[effProjection.forecastFar.length - 1].date
    : effProjection.forecastNear[effProjection.forecastNear.length - 1]?.date;
  const lastForecastLabel = lastForecastDate ? `${lastForecastDate.slice(8, 10)}/${lastForecastDate.slice(5, 7)}` : '';

  const chart = (
    <div className={`w-full ${compact ? 'h-[140px]' : 'h-[260px]'} p-2 rounded-xl border ${darkMode ? 'bg-[#0D0D0D] border-[#1F1F1F]' : 'bg-white border-zinc-200'}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
          <XAxis dataKey="date" stroke={textColor} fontSize={10} tickLine={false} axisLine={false} dy={10} minTickGap={24} tickFormatter={tickFormatter} />
          <YAxis stroke={textColor} fontSize={10} tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={44} />
          <Tooltip content={<ChartTooltip darkMode={darkMode} valueFormatter={effValueFormatter} />} cursor={{ stroke: textColor, strokeWidth: 1, strokeDasharray: '3 3' }} />
          <ReferenceLine x={lastHistoryDate} stroke={textColor} strokeDasharray="3 3" />

          <Area dataKey="nearLow" stackId="near" stroke="none" fill="transparent" isAnimationActive={false} />
          <Area dataKey="nearBandWidth" stackId="near" stroke="none" fill={projColor} fillOpacity={0.14} isAnimationActive={false} />
          <Area dataKey="farLow" stackId="far" stroke="none" fill="transparent" isAnimationActive={false} />
          <Area dataKey="farBandWidth" stackId="far" stroke="none" fill={projColor} fillOpacity={0.07} isAnimationActive={false} />

          <Line type="monotone" dataKey="actual" stroke={ACTUAL_COLOR} strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="nearMid" stroke={projColor} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="farMid" stroke={projColor} strokeOpacity={0.45} strokeWidth={2} strokeDasharray="2 4" dot={false} connectNulls={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );

  if (compact) {
    return (
      <div className={cardClass}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-zinc-500 leading-tight">{effTitle}</span>
          <EstimateBadge darkMode={darkMode} />
        </div>
        {chart}
      </div>
    );
  }

  const legend = (
    <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-zinc-500">
      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: ACTUAL_COLOR }} />Real</span>
      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: projColor }} />Proyección 14 días (alta confianza)</span>
      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full opacity-45" style={{ background: projColor }} />Proyección hasta el {lastForecastLabel} (baja confianza)</span>
    </div>
  );

  const stats = effProjection.stats;
  return (
    <div className={cardClass}>
      {viewToggle}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <h3 className={`font-bold text-sm ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>{effTitle}</h3>
          {subtitle && <p className="text-[11px] text-zinc-500">{subtitle}</p>}
        </div>
        <EstimateBadge darkMode={darkMode} />
      </div>
      <div className="flex flex-col lg:flex-row gap-4 mt-3">
        <div className="flex-1 min-w-0">
          {chart}
          {legend}
        </div>
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 lg:w-[200px] flex-shrink-0">
            <ProjectionStatCard darkMode={darkMode} label="Estimado fin de mes"
              value={effValueFormatter(stats.endOfMonthEstimate.mid)}
              sublabel={`${effValueFormatter(stats.endOfMonthEstimate.low)} – ${effValueFormatter(stats.endOfMonthEstimate.high)}`}
              badge="estimate" />
            <ProjectionStatCard darkMode={darkMode} label="Tendencia semanal"
              value={stats.weeklyGrowthPct != null ? `${stats.weeklyGrowthPct >= 0 ? '+' : ''}${stats.weeklyGrowthPct.toFixed(1)}%` : '—'}
              sublabel="vs. semana previa" badge="estimate" />
            <ProjectionStatCard darkMode={darkMode} label="Promedio diario"
              value={effValueFormatter(stats.avgDaily)} sublabel="últimos 7 días" badge="estimate" />
            <ProjectionStatCard darkMode={darkMode} label="Mejor día proyectado"
              value={stats.bestDay.label} sublabel="mayor estacionalidad" badge="estimate" />
            {stats.reliability && (
              <ProjectionStatCard darkMode={darkMode} label="Confiabilidad"
                value={stats.reliability.level} sublabel="según variación diaria" />
            )}
          </div>
        )}
      </div>
      {isMultiView && activeView.allTimeTotal != null && (
        <div className={`mt-4 pt-4 border-t border-dashed ${darkMode ? 'border-white/[0.08]' : 'border-zinc-200'}`}>
          <CumulativeProjectionCard
            darkMode={darkMode}
            label={activeView.cumulativeLabel || `${effTitle} — histórico completo`}
            allTimeTotal={activeView.allTimeTotal}
            projection={effProjection}
            valueFormatter={effValueFormatter}
            minDate={cumulativeMinDate}
            maxDate={cumulativeMaxDate}
            defaultDate={cumulativeDefaultDate}
          />
        </div>
      )}
    </div>
  );
}
