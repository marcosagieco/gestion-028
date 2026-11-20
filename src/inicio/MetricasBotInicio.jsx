// Bloque «Bot de WhatsApp» de Inicio: qué vende el bot, cuánto convierte y dónde se pierden clientes,
// para el período elegido arriba en Inicio y comparado con el período anterior de igual duración.
// Las cuentas están en metricasBot.js; acá solo se traen los datos (una vez, con getDocs: nada de
// onSnapshot permanente sobre pedidos) y se dibujan.
//
// Criterio de diseño: cada número dice en una línea qué significa, un solo color de acento (índigo) y
// gris para el contexto, verde/rojo solo para «mejoró/empeoró», y nunca dos escalas en un gráfico.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine } from 'recharts';
import { RefreshCw, MessageCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { INICIO_ESTADISTICAS_BOT, calcularPeriodo, diaLocal, periodoAnterior, serieDiaria, variacion } from './metricasBot';

const ACENTO = '#6366f1';

const pesos = (v) => (v == null ? '—' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(v));
const pesosCorto = (v) => {
  if (v == null) return '—';
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1).replace('.', ',')}M`;
  if (Math.abs(v) >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
};
const pct = (v, dec = 0) => (v == null ? '—' : `${(v * 100).toFixed(dec).replace('.', ',')}%`);
const num = (v, dec = 0) => (v == null ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: dec, minimumFractionDigits: dec }));

// Marcas redondas para el eje (0, 50, 100, 150…) en vez de las que elige el gráfico (0, 55, 110…).
function marcasRedondas(max) {
  if (!(max > 0)) return [0, 1];
  const crudo = max / 4;
  const base = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * base).find((x) => x >= crudo);
  const marcas = [];
  for (let x = 0; x < max + paso; x += paso) marcas.push(Math.round(x * 100) / 100);
  return marcas;
}

// Un período que arranca antes de que existan las estadísticas se recorta al 29/10.
function recortar(desde, hasta) {
  const inicio = new Date(`${INICIO_ESTADISTICAS_BOT}T00:00:00`);
  return { desde: desde < inicio ? inicio : desde, hasta, recortado: desde < inicio };
}

async function traerPeriodo(db, desde, hasta) {
  const [stats, peds] = await Promise.all([
    getDocs(query(collection(db, 'bot_estadisticas'), where('dia', '>=', diaLocal(desde)), where('dia', '<=', diaLocal(hasta)))),
    // Solo por fecha (índice simple) y el origen se filtra acá: origen + createdAt pediría un índice compuesto.
    getDocs(query(collection(db, 'pedidos'), where('createdAt', '>=', desde.toISOString()), where('createdAt', '<=', hasta.toISOString()))),
  ]);
  return {
    dias: stats.docs.map((d) => d.data()),
    pedidos: peds.docs.map((d) => d.data()).filter((p) => p.origen === 'bot_n8n'),
  };
}

// Colores de la página en un solo lugar, para claro y oscuro.
function tema(dm) {
  return dm ? {
    panel: 'bg-[#0A0A0A] border border-white/[0.06]', tile: 'bg-white/[0.025] border-transparent', linea: 'border-white/[0.06]',
    fuerte: 'text-zinc-50', medio: 'text-zinc-400', suave: 'text-zinc-500', pista: 'bg-white/[0.06]',
    grilla: '#1c1c1f', eje: '#52525b', gris: '#3f3f46', tooltip: { bg: '#18181b', borde: '#27272a', texto: '#e4e4e7' },
    nota: 'bg-indigo-500/[0.07] border-indigo-500/20 text-zinc-300', boton: 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]',
  } : {
    panel: 'bg-white border border-zinc-200/80', tile: 'bg-zinc-50/70 border-transparent', linea: 'border-zinc-200/80',
    fuerte: 'text-zinc-900', medio: 'text-zinc-600', suave: 'text-zinc-500', pista: 'bg-zinc-200/70',
    grilla: '#f0f0f2', eje: '#a1a1aa', gris: '#d4d4d8', tooltip: { bg: '#ffffff', borde: '#e4e4e7', texto: '#18181b' },
    nota: 'bg-indigo-50 border-indigo-100 text-zinc-700', boton: 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100',
  };
}

// «▲ 12% vs los 7 días anteriores». Verde si mejoró y rojo si empeoró (en algunas, bajar es mejorar).
function Cambio({ valor, enPuntos, bajarEsMejor, contra, t }) {
  if (valor == null || !isFinite(valor)) return null;
  const quieto = Math.abs(valor) < (enPuntos ? 0.1 : 0.5);
  const sube = valor > 0;
  const bueno = bajarEsMejor ? !sube : sube;
  const Icono = quieto ? Minus : sube ? TrendingUp : TrendingDown;
  const color = quieto ? t.suave : bueno ? 'text-emerald-400' : 'text-rose-400';
  const texto = `${sube ? '+' : ''}${valor.toFixed(enPuntos ? 1 : 0).replace('.', ',')}${enPuntos ? ' pts' : '%'}`;
  return (
    <p className={`text-xs flex items-center gap-1.5 ${t.suave}`}>
      <span className={`inline-flex items-center gap-1 font-semibold ${color}`}><Icono size={13} strokeWidth={2.5} />{quieto ? 'Igual' : texto}</span>
      <span>{contra}</span>
    </p>
  );
}

function Seccion({ titulo, bajada, t, children, derecha }) {
  return (
    <section className={`pt-6 mt-6 border-t ${t.linea}`}>
      <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <h4 className={`text-[15px] font-semibold tracking-tight ${t.fuerte}`}>{titulo}</h4>
          {bajada && <p className={`text-[13px] mt-0.5 ${t.suave}`}>{bajada}</p>}
        </div>
        {derecha}
      </div>
      {children}
    </section>
  );
}

function Tile({ t, titulo, valor, explicacion, cambio }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col ${t.tile}`}>
      <p className={`text-[13px] font-medium ${t.medio}`}>{titulo}</p>
      <p className={`text-[26px] leading-none font-semibold tracking-tight mt-2.5 ${t.fuerte}`}>{valor}</p>
      <div className="mt-2.5">{cambio}</div>
      <p className={`text-xs leading-relaxed mt-auto pt-3 ${t.suave}`}>{explicacion}</p>
    </div>
  );
}

// Una razón con su barra: el relleno es el valor, la pista es el 100%.
function Medidor({ t, titulo, valor, texto, explicacion, cambio, sinBarra }) {
  return (
    <div className={`rounded-xl border p-4 ${t.tile}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={`text-[13px] font-medium ${t.medio}`}>{titulo}</p>
        <p className={`text-xl font-semibold tracking-tight ${t.fuerte}`}>{texto}</p>
      </div>
      {!sinBarra && (
        <div className={`h-1.5 rounded-full mt-3 ${t.pista}`}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, (valor || 0) * 100))}%`, background: ACENTO }} />
        </div>
      )}
      <p className={`text-xs leading-relaxed mt-3 ${t.suave}`}>{explicacion}</p>
      <div className="mt-2">{cambio}</div>
    </div>
  );
}

// Barras horizontales ordenadas, un solo color: para comparar partes entre sí.
function Ranking({ t, items, valor, derecha, total }) {
  if (!items.length) return <p className={`text-sm ${t.suave}`}>Sin datos en el período.</p>;
  const max = Math.max(...items.map(valor), 1);
  return (
    <ul className="space-y-3.5">
      {items.map((it) => (
        <li key={it.clave || it.nombre}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className={`min-w-0 truncate ${t.fuerte}`}>{it.nombre}</span>
            <span className={`shrink-0 tabular-nums ${t.medio}`}>
              {derecha(it)}{total ? <span className={`ml-2 font-semibold ${t.fuerte}`}>{pct(valor(it) / total)}</span> : null}
            </span>
          </div>
          <div className={`h-1.5 rounded-full mt-1.5 ${t.pista}`}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (valor(it) / max) * 100)}%`, background: ACENTO }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function CajaTooltip({ active, payload, label, t, formato }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs shadow-xl" style={{ background: t.tooltip.bg, border: `1px solid ${t.tooltip.borde}`, color: t.tooltip.texto }}>
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm" style={{ background: p.color || p.fill }} />
          <span className="opacity-70">{p.name}</span>
          <span className="font-semibold ml-auto pl-3 tabular-nums">{formato ? formato(p.value, p.dataKey) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

function Leyenda({ items, t }) {
  return (
    <div className="flex items-center gap-4">
      {items.map(([nombre, color]) => (
        <span key={nombre} className={`flex items-center gap-1.5 text-xs ${t.medio}`}>
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />{nombre}
        </span>
      ))}
    </div>
  );
}

export default function MetricasBotInicio({ db, darkMode: dm, rangeStart, rangeEnd }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const t = tema(dm);

  // Las flechas comparan solo días completos: hoy está en curso (las estadísticas del bot son por día y
  // se completan a la noche), así que si el período incluye hoy, la comparación va sin hoy contra la
  // misma cantidad de días inmediatamente anteriores. Y solo si ese período anterior es de después del
  // 29/10: antes no hay estadísticas y la comparación saldría torcida.
  const rango = useMemo(() => {
    if (!rangeStart || !rangeEnd) return null;
    const actual = recortar(rangeStart, rangeEnd);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const incluyeHoy = actual.hasta >= hoy;
    const compHasta = incluyeHoy ? new Date(hoy.getTime() - 1) : actual.hasta;
    const diasComp = Math.round((compHasta.getTime() + 1 - actual.desde.getTime()) / 864e5);
    let comp = null;
    if (!actual.recortado && diasComp >= 1) {
      const prev = periodoAnterior(actual.desde, compHasta);
      if (prev.desde >= new Date(`${INICIO_ESTADISTICAS_BOT}T00:00:00`)) comp = { hastaDia: diaLocal(compHasta), prev, dias: diasComp };
    }
    return { actual, comp, incluyeHoy };
  }, [rangeStart?.getTime?.(), rangeEnd?.getTime?.()]); // eslint-disable-line react-hooks/exhaustive-deps

  const traer = useCallback(async () => {
    if (!db || !rango) return;
    setCargando(true);
    setError('');
    try {
      const [actual, prev] = await Promise.all([
        traerPeriodo(db, rango.actual.desde, rango.actual.hasta),
        rango.comp ? traerPeriodo(db, rango.comp.prev.desde, rango.comp.prev.hasta) : Promise.resolve(null),
      ]);
      setDatos({ actual, prev });
    } catch (e) {
      setError('No se pudieron traer los datos del bot: ' + e.message);
    } finally {
      setCargando(false);
    }
  }, [db, rango]);
  useEffect(() => { traer(); }, [traer]);

  const m = useMemo(() => (datos ? calcularPeriodo(datos.actual.dias, datos.actual.pedidos) : null), [datos]);
  const p = useMemo(() => (datos?.prev ? calcularPeriodo(datos.prev.dias, datos.prev.pedidos) : null), [datos]);
  // El período actual recortado a los mismos días completos que se comparan.
  const mComp = useMemo(() => {
    if (!datos?.prev || !rango?.comp) return null;
    if (!rango.incluyeHoy) return m;
    const h = rango.comp.hastaDia;
    return calcularPeriodo(datos.actual.dias.filter((d) => d.dia <= h), datos.actual.pedidos.filter((x) => diaLocal(x.createdAt) <= h));
  }, [datos, rango, m]);
  const serie = useMemo(() => (datos && rango ? serieDiaria(datos.actual.dias, datos.actual.pedidos, rango.actual.desde, rango.actual.hasta) : []), [datos, rango]);
  // Para la línea de facturación: solo días terminados (hoy a medias parecería una caída).
  const serieCerrada = useMemo(() => serie.filter((d) => !d.enCurso), [serie]);
  const horas = useMemo(() => {
    if (!m) return [];
    const conPedidos = m.porHora.filter((h) => h.pedidos > 0).map((h) => h.hora);
    const desde = Math.min(9, ...conPedidos), hasta = Math.max(23, ...conPedidos);
    return m.porHora.filter((h) => h.hora >= desde && h.hora <= hasta);
  }, [m]);
  const marcasDia = useMemo(() => marcasRedondas(Math.max(0, ...serie.map((d) => Math.max(d.clientes, d.pedidos)))), [serie]);
  const marcasHora = useMemo(() => marcasRedondas(Math.max(0, ...horas.map((h) => h.pedidos))), [horas]);
  const horaPico = useMemo(() => (m ? [...m.porHora].sort((a, b) => b.pedidos - a.pedidos)[0] : null), [m]);

  const v = (campo, enPuntos) => (mComp && p ? variacion(mComp[campo], p[campo], enPuntos) : null);
  const contra = rango?.comp ? (rango.comp.dias === 1 ? 'vs el día anterior' : `vs los ${rango.comp.dias} días anteriores`) : '';
  const cambio = (campo, opciones = {}) => <Cambio valor={v(campo, opciones.enPuntos)} enPuntos={opciones.enPuntos} bajarEsMejor={opciones.bajarEsMejor} contra={contra} t={t} />;

  // La frase del embudo: dónde se pierde más gente.
  const lectura = useMemo(() => {
    if (!m || !m.clientes) return '';
    const sinResumen = Math.max(0, m.clientes - m.resumenes);
    const sinComprar = Math.max(0, m.resumenes - m.clientesConPedido);
    if (sinResumen >= sinComprar) {
      return `La mayor pérdida está al principio: ${num(sinResumen)} personas escribieron pero nunca llegaron a armar un pedido. Las que sí recibieron el resumen compraron en un ${pct(m.cierreResumen)} de los casos.`;
    }
    return `La mayor pérdida está al final: ${num(sinComprar)} personas recibieron el resumen del pedido y no compraron. Son las ventas que estuvieron más cerca de cerrarse.`;
  }, [m]);

  const tooltipBase = { cursor: { fill: dm ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' } };

  return (
    <div className={`rounded-2xl p-5 md:p-6 ${t.panel}`}>
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(99,102,241,0.12)' }}>
            <MessageCircle size={17} style={{ color: ACENTO }} />
          </div>
          <div>
            <h3 className={`text-base font-semibold tracking-tight ${t.fuerte}`}>Bot de WhatsApp</h3>
            <p className={`text-[13px] mt-0.5 ${t.suave}`}>
              Lo que vendió el bot y cómo atendió en el período elegido.
              {rango?.actual.recortado && ' Hay datos desde el 29/10.'}
              {rango?.comp && rango.incluyeHoy && ' Las flechas comparan los días ya terminados (sin hoy, que está en curso) contra los mismos días anteriores.'}
              {rango && !rango.comp && !rango.actual.recortado && (rango.incluyeHoy && rango.actual.desde >= new Date(new Date().setHours(0, 0, 0, 0))
                ? ' Hoy está en curso: la comparación aparece mañana.'
                : ' Sin comparación: el período anterior es de antes del 29/10, cuando empezaron los datos.')}
            </p>
          </div>
        </div>
        <button onClick={traer} disabled={cargando} title="Volver a traer los datos" aria-label="Actualizar"
          className={`h-9 w-9 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50 ${t.boton}`}>
          <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <p className="text-sm text-rose-400 mt-4">{error}</p>}

      {!m ? (
        <div className={`h-48 mt-6 rounded-xl animate-pulse ${t.pista}`} />
      ) : m.diasConDatos === 0 && m.pedidosTotales === 0 ? (
        <p className={`text-sm py-12 text-center ${t.suave}`}>El bot no tiene datos en este período. Los datos empiezan el 29/10.</p>
      ) : (
        <div className={`transition-opacity ${cargando ? 'opacity-60' : ''}`}>

          {/* 1. Resumen: la plata primero, después lo que la explica */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mt-6">
            <div className={`lg:col-span-4 rounded-xl border p-5 flex flex-col ${t.tile}`}>
              <p className={`text-[13px] font-medium ${t.medio}`}>Facturación del bot</p>
              <p className={`text-[40px] md:text-[44px] leading-none font-semibold tracking-tight mt-3 ${t.fuerte}`}>{pesos(m.facturacion)}</p>
              <div className="mt-3">{cambio('facturacion')}</div>
              <p className={`text-xs mt-2 ${t.suave}`}>
                {num(m.pedidos)} pedidos · {pesos(m.envios)} de envíos incluidos{m.cancelados ? ` · ${m.cancelados} cancelados aparte` : ''}
              </p>
              {serieCerrada.length > 1 && (
                <div className="mt-auto pt-5">
                <p className={`text-[11px] mb-1 ${t.suave}`}>Facturación por día{serie.length !== serieCerrada.length ? ' (sin hoy)' : ''}</p>
                <div className="h-16 -mx-1">
                  <ResponsiveContainer width="100%" height="100%" debounce={200}>
                    <AreaChart data={serieCerrada} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="botFact" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={ACENTO} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={ACENTO} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Tooltip {...tooltipBase} content={<CajaTooltip t={t} formato={(val) => pesos(val)} />} />
                      <Area type="monotone" dataKey="facturacion" name="Facturación" stroke={ACENTO} strokeWidth={2} fill="url(#botFact)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: dm ? '#0E0E0E' : '#fff' }} />
                      <XAxis dataKey="nombre" hide />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                </div>
              )}
            </div>
            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Tile t={t} titulo="Conversión" valor={pct(m.conversion, 1)} cambio={cambio('conversion', { enPuntos: true })}
                explicacion={`De cada 100 personas que escriben, ${num((m.conversion || 0) * 100)} terminan comprando.`} />
              <Tile t={t} titulo="Personas que escribieron" valor={num(m.clientes)} cambio={cambio('clientes')}
                explicacion="Se cuentan por día: si alguien escribe dos días distintos, cuenta dos veces." />
              <Tile t={t} titulo="Ticket promedio" valor={pesos(m.ticket)} cambio={cambio('ticket')}
                explicacion={`Lo que gasta cada pedido en promedio, con ${num(m.unidadesPorPedido, 1)} productos por pedido.`} />
              <Tile t={t} titulo="Ingreso por persona que escribe" valor={pesos(m.ingresoPorCliente)} cambio={cambio('ingresoPorCliente')}
                explicacion="Lo que deja en promedio cada conversación, compre o no. Sirve para saber cuánto pagar por traer a alguien." />
            </div>
          </div>

          {/* 2. Embudo */}
          <Seccion t={t} titulo="Del primer mensaje a la compra" bajada="Cuántas personas avanzan en cada paso de la charla con el bot.">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { paso: '1', nombre: 'Escribieron al bot', valor: m.clientes, deAntes: null, ancho: 1, opacidad: 0.35 },
                { paso: '2', nombre: 'Recibieron el resumen del pedido', valor: m.resumenes, deAntes: m.llegaAResumen, ancho: m.llegaAResumen, opacidad: 0.65 },
                { paso: '3', nombre: 'Compraron', valor: m.clientesConPedido, deAntes: m.cierreResumen, ancho: m.conversion, opacidad: 1 },
              ].map((e) => (
                <div key={e.paso} className={`rounded-xl border p-4 ${t.tile}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[13px] font-medium ${t.medio}`}><span className={`mr-2 ${t.suave}`}>{e.paso}</span>{e.nombre}</span>
                  </div>
                  <p className={`text-[26px] leading-none font-semibold tracking-tight mt-3 ${t.fuerte}`}>{num(e.valor)}</p>
                  <div className={`h-1.5 rounded-full mt-4 ${t.pista}`}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, (e.ancho || 0) * 100)}%`, background: ACENTO, opacity: e.opacidad }} />
                  </div>
                  <p className={`text-xs mt-2.5 ${t.suave}`}>
                    {e.deAntes == null ? 'El 100% del período' : <><span className={`font-semibold ${t.fuerte}`}>{pct(e.deAntes)}</span> de los del paso anterior</>}
                  </p>
                </div>
              ))}
            </div>
            {lectura && <p className={`text-[13px] leading-relaxed rounded-xl border px-4 py-3 mt-3 ${t.nota}`}>{lectura}</p>}
          </Seccion>

          {/* 3. Atención */}
          <Seccion t={t} titulo="Cómo atiende el bot" bajada="Qué tan bien resuelve solo y cuánto le cuesta al cliente llegar a comprar.">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <Medidor t={t} titulo="Resuelve sin ayuda" valor={m.resolucionAutomatica} texto={pct(m.resolucionAutomatica)}
                explicacion={`Charlas que el bot manejó solo. ${num(m.derivaciones)} pasaron a una persona del equipo.`}
                cambio={cambio('resolucionAutomatica', { enPuntos: true })} />
              <Medidor t={t} titulo="Abandonan tras el resumen" valor={m.abandonoResumen} texto={pct(m.abandonoResumen)}
                explicacion={`${num(m.abandonos)} personas recibieron el resumen del pedido y no compraron.`}
                cambio={cambio('abandonoResumen', { enPuntos: true, bajarEsMejor: true })} />
              <Medidor t={t} titulo="Pedidos cancelados" valor={m.tasaCancelacion} texto={pct(m.tasaCancelacion)}
                explicacion={`${num(m.cancelados)} de ${num(m.pedidosTotales)} pedidos que cargó el bot se cancelaron.`}
                cambio={cambio('tasaCancelacion', { enPuntos: true, bajarEsMejor: true })} />
              <Medidor t={t} titulo="Mensajes por persona" texto={num(m.mensajesPorCliente, 1)} sinBarra
                explicacion="Cuántos mensajes manda cada persona en promedio. Menos es mejor: llega a comprar con menos idas y vueltas."
                cambio={cambio('mensajesPorCliente', { bajarEsMejor: true })} />
            </div>
          </Seccion>

          {/* 4. Día por día: dos gráficos, cada uno con su propia escala */}
          {serie.length > 1 && (
            <Seccion t={t} titulo="Día por día" bajada="Cuánta gente escribió, cuántos pedidos salieron y qué porcentaje compró cada día.">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                <div className={`lg:col-span-3 rounded-xl border p-4 ${t.tile}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <p className={`text-[13px] font-medium ${t.medio}`}>Personas y pedidos</p>
                    <Leyenda t={t} items={[['Escribieron', t.gris], ['Pedidos', ACENTO]]} />
                  </div>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%" debounce={200}>
                      <BarChart data={serie} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barGap={3}>
                        <CartesianGrid vertical={false} stroke={t.grilla} />
                        <XAxis dataKey="nombre" stroke={t.eje} fontSize={11} tickLine={false} axisLine={false} minTickGap={8} dy={6} />
                        <YAxis stroke={t.eje} fontSize={11} tickLine={false} axisLine={false} ticks={marcasDia} domain={[0, marcasDia[marcasDia.length - 1]]} />
                        <Tooltip {...tooltipBase} content={<CajaTooltip t={t} />} />
                        <Bar dataKey="clientes" name="Escribieron" fill={t.gris} radius={[4, 4, 0, 0]} barSize={serie.length > 20 ? 6 : serie.length > 10 ? 10 : 16} />
                        <Bar dataKey="pedidos" name="Pedidos" fill={ACENTO} radius={[4, 4, 0, 0]} barSize={serie.length > 20 ? 6 : serie.length > 10 ? 10 : 16} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className={`lg:col-span-2 rounded-xl border p-4 ${t.tile}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <p className={`text-[13px] font-medium ${t.medio}`}>Conversión por día</p>
                    <span className={`text-xs ${t.suave}`}>Promedio <span className={`font-semibold ${t.fuerte}`}>{pct(m.conversion, 1)}</span></span>
                  </div>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%" debounce={200}>
                      <AreaChart data={serie} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="botConv" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={ACENTO} stopOpacity={0.22} />
                            <stop offset="100%" stopColor={ACENTO} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke={t.grilla} />
                        <XAxis dataKey="nombre" stroke={t.eje} fontSize={11} tickLine={false} axisLine={false} minTickGap={8} dy={6} />
                        <YAxis stroke={t.eje} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(x) => `${x}%`} domain={[0, (max) => Math.max(10, Math.ceil(max / 10) * 10)]} />
                        {m.conversion != null && <ReferenceLine y={Math.round(m.conversion * 1000) / 10} stroke={t.eje} strokeOpacity={0.5} />}
                        <Tooltip {...tooltipBase} content={<CajaTooltip t={t} formato={(val) => `${String(val).replace('.', ',')}%`} />} />
                        <Area type="monotone" dataKey="conversion" name="Conversión" stroke={ACENTO} strokeWidth={2} fill="url(#botConv)" connectNulls dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: dm ? '#0E0E0E' : '#fff' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </Seccion>
          )}

          {/* 5. Qué, cuándo, cómo */}
          <Seccion t={t} titulo="Qué, cuándo y cómo compran" bajada="Lo que más sale por el bot, a qué hora entran los pedidos y cómo los reciben y pagan.">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className={`rounded-xl border p-4 ${t.tile}`}>
                <p className={`text-[13px] font-medium mb-4 ${t.medio}`}>Productos que más facturan</p>
                <Ranking t={t} items={m.productos.slice(0, 6)} valor={(x) => x.monto} derecha={(x) => `${num(x.unidades)} u. · ${pesosCorto(x.monto)}`} />
              </div>
              <div className={`rounded-xl border p-4 flex flex-col ${t.tile}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                  <p className={`text-[13px] font-medium ${t.medio}`}>A qué hora entran los pedidos</p>
                  {horaPico?.pedidos > 0 && <span className={`text-xs ${t.suave}`}>Más pedidos de <span className={`font-semibold ${t.fuerte}`}>{horaPico.hora} a {horaPico.hora + 1} hs</span></span>}
                </div>
                <div className="flex-1 min-h-[200px]">
                  <ResponsiveContainer width="100%" height="100%" debounce={200}>
                    <BarChart data={horas} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap="18%">
                      <CartesianGrid vertical={false} stroke={t.grilla} />
                      <XAxis dataKey="hora" stroke={t.eje} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(h) => `${h}`} interval={1} dy={6} />
                      <YAxis stroke={t.eje} fontSize={11} tickLine={false} axisLine={false} ticks={marcasHora} domain={[0, marcasHora[marcasHora.length - 1]]} />
                      <Tooltip {...tooltipBase} content={({ active, payload, label }) => <CajaTooltip active={active} payload={payload} label={`De ${label} a ${label + 1} hs`} t={t} />} />
                      <Bar dataKey="pedidos" name="Pedidos" radius={[4, 4, 0, 0]} maxBarSize={18}>
                        {horas.map((h) => <Cell key={h.hora} fill={horaPico && h.hora === horaPico.hora && h.pedidos > 0 ? ACENTO : t.gris} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className={`rounded-xl border p-4 ${t.tile}`}>
                <p className={`text-[13px] font-medium mb-4 ${t.medio}`}>Cómo se entregan</p>
                <Ranking t={t} items={m.envio} valor={(x) => x.pedidos} total={m.pedidos} derecha={(x) => `${num(x.pedidos)} ${x.pedidos === 1 ? 'pedido' : 'pedidos'}`} />
              </div>
              <div className={`rounded-xl border p-4 ${t.tile}`}>
                <p className={`text-[13px] font-medium mb-4 ${t.medio}`}>Cómo pagan</p>
                <Ranking t={t} items={m.pago} valor={(x) => x.pedidos} total={m.pedidos} derecha={(x) => `${num(x.pedidos)} ${x.pedidos === 1 ? 'pedido' : 'pedidos'} · ${pesosCorto(x.monto)}`} />
              </div>
            </div>
          </Seccion>
        </div>
      )}
    </div>
  );
}
