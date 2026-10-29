// Pestaña «Bot» del panel: estadísticas del bot de WhatsApp por día. Las cuenta n8n cada hora («028 v2 -
// estadísticas», con lo que anota el bot) y el backend las guarda en bot_estadisticas/{AAAA-MM-DD}.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { RefreshCw } from 'lucide-react';

// Los motivos de derivar del bot, como los lee el equipo.
const MOTIVOS = {
  reclamo: 'Reclamo de un pedido',
  devolucion_o_cambio: 'Devolución o cambio',
  producto_con_falla: 'Producto con falla',
  cambio_de_pedido_armado: 'Cambio de un pedido ya armado',
  retiro_en_persona: 'Quiere retirar en persona',
  precio_mayorista: 'Negociar precio mayorista',
  consulta_medica_o_legal: 'Consulta médica o legal',
  canje_o_colaboracion: 'Canje o colaboración',
  diferencia_precio_web: 'Diferencia con el precio de la web',
  cliente_apurado: 'Cliente apurado (muchas consultas)',
  error_del_agente: 'El bot falló al responder',
};

const PERIODOS = [{ dias: 7, label: 'Últimos 7 días' }, { dias: 30, label: 'Últimos 30 días' }];
const porcentaje = (parte, total) => (total > 0 ? Math.round((parte / total) * 100) + '%' : '-');
const fechaCorta = (dia) => `${dia.slice(8)}/${dia.slice(5, 7)}`;

export default function BotEstadisticas({ db, darkMode }) {
  const [dias, setDias] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [periodo, setPeriodo] = useState(7);

  const traer = useCallback(async () => {
    if (!db) return;
    setCargando(true);
    setError('');
    try {
      const snap = await getDocs(query(collection(db, 'bot_estadisticas'), orderBy('dia', 'desc'), limit(30)));
      setDias(snap.docs.map((d) => d.data()));
    } catch (e) {
      setError('No se pudieron traer las estadísticas: ' + e.message);
    } finally {
      setCargando(false);
    }
  }, [db]);
  useEffect(() => { traer(); }, [traer]);

  const visibles = useMemo(() => dias.slice(0, periodo), [dias, periodo]);
  const totales = useMemo(() => visibles.reduce((t, d) => {
    t.clientes += d.clientes || 0;
    t.mensajes += d.mensajes || 0;
    t.resumenes += d.resumenes || 0;
    t.pedidos += d.pedidos || 0;
    t.clientesConPedido += d.clientesConPedido || 0;
    t.abandonos += d.abandonos || 0;
    t.derivaciones += d.totalDerivaciones || 0;
    for (const [motivo, n] of Object.entries(d.derivaciones || {})) t.porMotivo[motivo] = (t.porMotivo[motivo] || 0) + n;
    return t;
  }, { clientes: 0, mensajes: 0, resumenes: 0, pedidos: 0, clientesConPedido: 0, abandonos: 0, derivaciones: 0, porMotivo: {} }), [visibles]);
  const motivos = Object.entries(totales.porMotivo).sort((a, b) => b[1] - a[1]);

  const tarjeta = `rounded-2xl border p-4 ${darkMode ? 'border-white/[0.07]' : 'bg-white border-zinc-200'}`;
  const fondo = darkMode ? { background: 'linear-gradient(145deg,#121212,#1A1A1A)' } : {};
  const suave = darkMode ? 'text-zinc-500' : 'text-zinc-500';

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight">Bot de WhatsApp</h2>
          <p className={`text-xs mt-0.5 ${suave}`}>
            Cuántos clientes le escriben al bot, cuántos compran y cuándo pasa una charla al equipo. Se actualiza cada hora.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {PERIODOS.map((p) => (
            <button key={p.dias} onClick={() => setPeriodo(p.dias)}
              className={`h-10 px-3.5 rounded-xl text-sm font-bold transition-colors ${periodo === p.dias ? 'bg-indigo-500 text-white' : (darkMode ? 'bg-white/[0.06] text-zinc-300' : 'bg-zinc-100 text-zinc-600')}`}>
              {p.label}
            </button>
          ))}
          <button onClick={traer} disabled={cargando} title="Volver a pedir las estadísticas"
            className={`h-10 px-3 rounded-xl border text-sm font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 ${darkMode ? 'border-white/[0.07] text-zinc-300 hover:bg-white/[0.06]' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}>
            <RefreshCw size={14} className={cargando ? 'animate-spin' : ''}/> Actualizar
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {!cargando && !error && dias.length === 0 ? (
        <div className={`rounded-3xl border-2 border-dashed p-12 text-center ${darkMode ? 'border-white/[0.08]' : 'border-zinc-200 bg-zinc-50'}`}>
          <p className="text-sm font-semibold text-zinc-500">Todavía no hay estadísticas. Empiezan a contarse desde el 29/10 y se actualizan cada hora.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: 'Clientes que escribieron', valor: String(totales.clientes), color: 'text-indigo-400', ayuda: 'Por día: un cliente que escribe dos días cuenta dos veces' },
              { label: 'Mensajes recibidos', valor: String(totales.mensajes), color: 'text-sky-400' },
              { label: 'Pedidos que cargó el bot', valor: String(totales.pedidos), color: 'text-emerald-400' },
              { label: 'Compran de los que escriben', valor: porcentaje(totales.clientesConPedido, totales.clientes), color: darkMode ? 'text-zinc-200' : 'text-zinc-800' },
              { label: 'Recibieron el resumen y no compraron', valor: String(totales.abandonos), color: 'text-amber-400', ayuda: `De ${totales.resumenes} que recibieron un resumen` },
            ].map((t) => (
              <div key={t.label} className={tarjeta} style={fondo} title={t.ayuda || ''}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 leading-tight">{t.label}</p>
                <p className={`text-xl font-black mt-1.5 tracking-tight ${t.color}`}>{t.valor}</p>
                {t.ayuda && <p className={`text-[11px] mt-1 ${suave}`}>{t.ayuda}</p>}
              </div>
            ))}
          </div>

          <div className={`${tarjeta} overflow-x-auto`} style={fondo}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-left">
                  <th className="py-2 pr-3">Día</th>
                  <th className="py-2 pr-3 text-right">Clientes</th>
                  <th className="py-2 pr-3 text-right">Mensajes</th>
                  <th className="py-2 pr-3 text-right">Resúmenes</th>
                  <th className="py-2 pr-3 text-right">Pedidos</th>
                  <th className="py-2 pr-3 text-right">Compran</th>
                  <th className="py-2 pr-3 text-right">Sin comprar</th>
                  <th className="py-2 text-right">Al equipo</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((d) => (
                  <tr key={d.dia} className={`border-t ${darkMode ? 'border-white/[0.05]' : 'border-zinc-100'}`}>
                    <td className="py-2 pr-3 font-semibold">{fechaCorta(d.dia)}</td>
                    <td className="py-2 pr-3 text-right">{d.clientes || 0}</td>
                    <td className="py-2 pr-3 text-right">{d.mensajes || 0}</td>
                    <td className="py-2 pr-3 text-right">{d.resumenes || 0}</td>
                    <td className="py-2 pr-3 text-right font-bold text-emerald-400">{d.pedidos || 0}</td>
                    <td className="py-2 pr-3 text-right">{porcentaje(d.clientesConPedido || 0, d.clientes || 0)}</td>
                    <td className="py-2 pr-3 text-right text-amber-400">{d.abandonos || 0}</td>
                    <td className="py-2 text-right">{d.totalDerivaciones || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={tarjeta} style={fondo}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Por qué el bot pasó charlas al equipo</p>
            {motivos.length === 0 ? (
              <p className={`text-sm mt-2 ${suave}`}>No pasó ninguna charla al equipo en este período.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {motivos.map(([motivo, n]) => (
                  <li key={motivo} className="flex items-center justify-between text-sm">
                    <span>{MOTIVOS[motivo] || motivo}</span>
                    <span className="font-bold">{n} <span className={`font-normal ${suave}`}>({porcentaje(n, totales.derivaciones)})</span></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
