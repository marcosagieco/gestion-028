// Pestaña Meta Ads → «Anuncios que llegan al WhatsApp»: lo que gastó cada anuncio en Meta cruzado con lo
// que pasó en el bot (clientes que escribieron desde ese anuncio, pedidos y plata). El bot guarda en cada
// pedido el id del anuncio de Meta (publicidad.anuncioId), así que el ROAS sale por anuncio y no a ojo.
// Las cuentas están en src/inicio/metricasBot.js (metricasAnuncios).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { INICIO_ESTADISTICAS_BOT, diaLocal, metricasAnuncios } from '../inicio/metricasBot';

const pesos = (v) => (v == null ? '—' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(v));
const pct = (v, dec = 0) => (v == null ? '—' : `${(v * 100).toFixed(dec).replace('.', ',')}%`);
const veces = (v) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}x`);

// El mismo período que el selector de Meta Ads (ver metaFirebaseStats en App.jsx).
function rangoDe(metaPeriod, metaCustomRange) {
  const hoy = new Date(); hoy.setHours(23, 59, 59, 999);
  let desde, hasta = new Date(hoy);
  if (metaPeriod === 'today') { desde = new Date(hoy); desde.setHours(0, 0, 0, 0); }
  else if (metaPeriod === 'yesterday') { hasta = new Date(hoy); hasta.setDate(hasta.getDate() - 1); desde = new Date(hasta); desde.setHours(0, 0, 0, 0); }
  else if (metaPeriod === 'this_month') desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  else if (metaPeriod === 'last_month') { desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1); hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59, 999); }
  else if (metaPeriod === 'historico') desde = new Date(2026, 4, 30);
  else if (metaPeriod === 'custom') {
    const [sy, sm, sd] = metaCustomRange.start.split('-').map(Number);
    const [ey, em, ed] = metaCustomRange.end.split('-').map(Number);
    desde = new Date(sy, sm - 1, sd); hasta = new Date(ey, em - 1, ed, 23, 59, 59, 999);
  } else {
    const dias = metaPeriod === 'last_7d' ? 7 : metaPeriod === 'last_14d' ? 14 : metaPeriod === 'last_90d' ? 90 : 30;
    desde = new Date(hoy); desde.setDate(desde.getDate() - (dias - 1)); desde.setHours(0, 0, 0, 0);
  }
  return { desde, hasta };
}

// Gasto por anuncio en Meta (todas las páginas de la respuesta).
async function traerGastoPorAnuncio(desde, hasta) {
  const token = import.meta.env.VITE_META_ACCESS_TOKEN;
  const cuenta = import.meta.env.VITE_META_AD_ACCOUNT_ID;
  if (!token || !cuenta) return { filas: [], error: 'Faltan las credenciales de Meta: se muestran los datos del bot sin el gasto.' };
  const rango = encodeURIComponent(JSON.stringify({ since: diaLocal(desde), until: diaLocal(hasta) }));
  let url = `https://graph.facebook.com/v19.0/${cuenta}/insights?level=ad&fields=ad_id,ad_name,campaign_name,spend,clicks,impressions&time_range=${rango}&limit=200&access_token=${token}`;
  const filas = [];
  for (let i = 0; url && i < 10; i++) {
    const json = await (await fetch(url)).json();
    if (json.error) return { filas, error: 'Meta no devolvió el gasto por anuncio: ' + json.error.message };
    filas.push(...(json.data || []));
    url = json.paging?.next || null;
  }
  return { filas, error: '' };
}

function colorRoas(roas, dm) {
  if (roas == null) return dm ? 'bg-white/[0.05] text-zinc-500' : 'bg-zinc-100 text-zinc-400';
  if (roas >= 3) return 'bg-emerald-500/15 text-emerald-400';
  if (roas >= 1.5) return 'bg-amber-500/15 text-amber-400';
  return 'bg-rose-500/15 text-rose-400';
}

export default function AnunciosWhatsApp({ db, darkMode: dm, metaPeriod, metaCustomRange }) {
  const [estado, setEstado] = useState({ error: '', aviso: '', datos: null });
  const [cargando, setCargando] = useState(false);
  const { desde, hasta } = useMemo(() => rangoDe(metaPeriod, metaCustomRange), [metaPeriod, metaCustomRange]);
  const inicioBot = useMemo(() => new Date(`${INICIO_ESTADISTICAS_BOT}T00:00:00`), []);

  const traer = useCallback(async () => {
    if (!db) return;
    setCargando(true);
    try {
      const [stats, peds, meta] = await Promise.all([
        getDocs(query(collection(db, 'bot_estadisticas'), where('dia', '>=', diaLocal(desde)), where('dia', '<=', diaLocal(hasta)))),
        getDocs(query(collection(db, 'pedidos'), where('createdAt', '>=', desde.toISOString()), where('createdAt', '<=', hasta.toISOString()))),
        traerGastoPorAnuncio(desde, hasta),
      ]);
      const pedidos = peds.docs.map((d) => d.data()).filter((p) => p.origen === 'bot_n8n');
      setEstado({ error: '', aviso: meta.error, datos: metricasAnuncios(stats.docs.map((d) => d.data()), pedidos, meta.filas) });
    } catch (e) {
      setEstado({ error: 'No se pudieron traer los datos: ' + e.message, aviso: '', datos: null });
    } finally {
      setCargando(false);
    }
  }, [db, desde, hasta]);
  useEffect(() => { traer(); }, [traer]);

  const m = estado.datos;
  const tarjeta = `rounded-2xl border ${dm ? 'border-white/[0.06]' : 'bg-white border-zinc-200'}`;
  const fondo = dm ? { background: 'linear-gradient(145deg,#0E0E0E,#161616)', boxShadow: '0 4px 20px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)' } : {};
  const etiqueta = 'text-[10px] font-bold uppercase tracking-widest text-zinc-500';
  const fuerte = dm ? 'text-zinc-100' : 'text-zinc-900';
  const maxConv = m ? Math.max(m.conversion || 0, m.conversionOrganica || 0, 0.01) : 1;

  return (
    <div className={`${tarjeta} p-5`} style={fondo}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/10"><MessageCircle size={15} className="text-emerald-400" /></div>
          <div>
            <h3 className={`font-bold text-sm ${fuerte}`}>Anuncios que llegan al WhatsApp</h3>
            <p className="text-[11px] text-zinc-500">Lo que gastó cada anuncio cruzado con los clientes y las ventas que hizo el bot.</p>
          </div>
        </div>
        <button onClick={traer} disabled={cargando}
          className={`h-9 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 ${dm ? 'border-white/[0.07] text-zinc-300 hover:bg-white/[0.06]' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}>
          <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {estado.error && <p className="text-sm text-red-400 mb-3">{estado.error}</p>}
      {estado.aviso && <p className="text-xs text-amber-400 mb-3">{estado.aviso}</p>}
      {desde < inicioBot && <p className="text-[11px] text-zinc-500 mb-3">Los clientes por anuncio se cuentan desde el 29/10: antes de esa fecha solo hay gasto.</p>}

      {!m ? (
        <div className="h-40 rounded-xl animate-pulse" style={{ background: dm ? 'rgba(255,255,255,0.03)' : '#f4f4f5' }} />
      ) : (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className={`col-span-2 lg:col-span-1 rounded-xl p-4 border ${dm ? 'border-emerald-500/20 bg-emerald-500/[0.06]' : 'border-emerald-200 bg-emerald-50'}`}>
              <p className={etiqueta}>ROAS por WhatsApp</p>
              <p className="text-3xl font-black tracking-tight text-emerald-400 mt-1 tabular-nums">{veces(m.roas)}</p>
              <p className="text-[11px] text-zinc-500 mt-1">Cada $1 en anuncios volvió {m.roas == null ? '—' : pesos(m.roas)} en ventas</p>
            </div>
            {[
              { t: 'Inversión', v: pesos(m.gasto), a: 'Gasto en Meta del período' },
              { t: 'Ventas por WhatsApp', v: pesos(m.facturacion), a: `${m.pedidos} pedidos · ${pct(m.participacion)} de lo que vendió el bot` },
              { t: 'Costo por cliente', v: pesos(m.costoPorCliente), a: `${m.clientes} escribieron desde un anuncio` },
              { t: 'Costo por venta', v: pesos(m.costoPorVenta), a: `Ticket promedio ${pesos(m.ticket)}` },
            ].map((k) => (
              <div key={k.t} className={`rounded-xl p-4 border ${dm ? 'border-white/[0.06] bg-white/[0.02]' : 'border-zinc-200 bg-zinc-50/60'}`}>
                <p className={etiqueta}>{k.t}</p>
                <p className={`text-xl font-black tracking-tight mt-1.5 tabular-nums ${fuerte}`}>{k.v}</p>
                <p className="text-[11px] text-zinc-500 mt-1 leading-snug">{k.a}</p>
              </div>
            ))}
          </div>

          {/* Conversión con y sin publicidad */}
          <div className={`mt-3 rounded-xl p-4 border ${dm ? 'border-white/[0.06] bg-white/[0.02]' : 'border-zinc-200 bg-zinc-50/60'}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <p className={etiqueta}>¿Compran los que llegan por un anuncio?</p>
              <p className="text-[11px] text-zinc-500">{pct(m.parteDeClientes)} de los que escriben al bot vienen de un anuncio</p>
            </div>
            {[
              { n: 'Llegaron por un anuncio', v: m.conversion, c: 'bg-indigo-500' },
              { n: 'Escribieron solos', v: m.conversionOrganica, c: 'bg-emerald-500' },
            ].map((b) => (
              <div key={b.n} className="flex items-center gap-3 mb-2 last:mb-0">
                <span className="text-sm w-44 shrink-0">{b.n}</span>
                <div className={`flex-1 h-3 rounded-full ${dm ? 'bg-white/[0.06]' : 'bg-zinc-200'}`}>
                  <div className={`h-full rounded-full ${b.c}`} style={{ width: `${((b.v || 0) / maxConv) * 100}%` }} />
                </div>
                <span className={`text-sm font-black w-14 text-right tabular-nums ${fuerte}`}>{pct(b.v, 1)}</span>
              </div>
            ))}
          </div>

          {/* Por anuncio */}
          <div className="mt-5">
            <p className={`${etiqueta} mb-2`}>Por anuncio</p>
            {m.anuncios.length === 0 ? (
              <p className="text-sm text-zinc-500 py-6 text-center">No hubo anuncios con gasto o clientes en este período.</p>
            ) : (
              <>
                {/* Celular: tarjetas */}
                <div className="space-y-2 md:hidden">
                  {m.anuncios.map((a) => (
                    <div key={a.clave} className={`rounded-xl border p-3.5 ${dm ? 'border-white/[0.06] bg-white/[0.02]' : 'border-zinc-200'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`text-sm font-bold truncate ${fuerte}`}>{a.nombre}</p>
                          <p className="text-[11px] text-zinc-500 truncate">{[a.cantidadAnuncios > 1 ? `${a.cantidadAnuncios} anuncios en Meta` : null, a.campania].filter(Boolean).join(' · ') || 'Sin gasto registrado en Meta'}</p>
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded-lg text-xs font-black ${colorRoas(a.roas, dm)}`}>{veces(a.roas)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                        <div><p className="text-zinc-500">Gasto</p><p className="font-bold tabular-nums">{pesos(a.gasto)}</p></div>
                        <div><p className="text-zinc-500">Clientes</p><p className="font-bold tabular-nums">{a.clientes}</p></div>
                        <div><p className="text-zinc-500">Ventas</p><p className="font-bold tabular-nums">{pesos(a.facturacion)}</p></div>
                        <div><p className="text-zinc-500">Costo x cliente</p><p className="font-bold tabular-nums">{pesos(a.costoPorCliente)}</p></div>
                        <div><p className="text-zinc-500">Pedidos</p><p className="font-bold tabular-nums">{a.pedidos}</p></div>
                        <div><p className="text-zinc-500">Conversión</p><p className="font-bold tabular-nums">{pct(a.conversion)}</p></div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* PC: tabla */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        <th className="py-2 pr-4 text-left">Anuncio</th>
                        <th className="py-2 px-3 text-right">Gasto</th>
                        <th className="py-2 px-3 text-right">Clientes</th>
                        <th className="py-2 px-3 text-right">Costo x cliente</th>
                        <th className="py-2 px-3 text-right">Pedidos</th>
                        <th className="py-2 px-3 text-right">Conversión</th>
                        <th className="py-2 px-3 text-right">Ventas</th>
                        <th className="py-2 pl-3 text-right">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.anuncios.map((a) => (
                        <tr key={a.clave} className={`border-t ${dm ? 'border-white/[0.05] hover:bg-white/[0.02]' : 'border-zinc-100 hover:bg-zinc-50'}`}>
                          <td className="py-3 pr-4 max-w-[260px]">
                            <p className={`font-semibold truncate ${fuerte}`} title={a.nombre}>{a.nombre}</p>
                            <p className="text-[11px] text-zinc-500 truncate">{[a.cantidadAnuncios > 1 ? `${a.cantidadAnuncios} anuncios en Meta` : null, a.campania].filter(Boolean).join(' · ') || 'Sin gasto registrado en Meta'}</p>
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums">{a.gasto ? pesos(a.gasto) : '—'}</td>
                          <td className="py-3 px-3 text-right tabular-nums">{a.clientes || '—'}</td>
                          <td className="py-3 px-3 text-right tabular-nums">{pesos(a.costoPorCliente)}</td>
                          <td className="py-3 px-3 text-right tabular-nums">{a.pedidos || '—'}</td>
                          <td className="py-3 px-3 text-right tabular-nums">{pct(a.conversion)}</td>
                          <td className={`py-3 px-3 text-right font-bold tabular-nums ${fuerte}`}>{a.facturacion ? pesos(a.facturacion) : '—'}</td>
                          <td className="py-3 pl-3 text-right"><span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-black tabular-nums ${colorRoas(a.roas, dm)}`}>{veces(a.roas)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-zinc-500 mt-3">ROAS: verde de 3x para arriba, amarillo entre 1,5x y 3x, rojo debajo de 1,5x. Es sobre lo vendido, no sobre la ganancia.</p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
