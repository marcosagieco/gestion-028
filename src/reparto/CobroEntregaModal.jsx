import React, { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Camera, Plus, Trash2, Loader2, X } from 'lucide-react';
import { METODOS_COBRO, METODO_POR_ID, aCobrarDe, comprimirFoto, formatARS, formatUSD } from './cobro';

// Cartel de "Entregado": antes de cerrar la entrega, el repartidor anota cómo pagó el cliente
// (uno o varios métodos, con su monto) y, si quiere, adjunta la foto del comprobante. La foto es
// siempre opcional; si una transferencia queda sin foto, el cierre de caja lo avisa para revisarlo.
// Pensado para el dedo en la calle: botones grandes, teclado numérico.

const nuevaLinea = (medioPago = '', monto = '') => ({ uid: Math.random().toString(36).slice(2), medioPago, monto, detalle: '' });

export default function CobroEntregaModal({ dm, pedido, onConfirm, onCancel }) {
  const esperado = useMemo(() => aCobrarDe(pedido), [pedido]);
  const [yaPagado, setYaPagado] = useState(esperado.yaPagado);
  const [lineas, setLineas] = useState(() => [nuevaLinea(
    pedido.medioPago === 'efectivo' || pedido.medioPago === 'mitad y mitad' ? 'efectivo' : pedido.medioPago === 'transferencia' ? 'alias3' : '',
    esperado.aCobrar ? String(esperado.aCobrar) : '',
  )]);
  const [fotos, setFotos] = useState([]); // data URLs ya comprimidas
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const actualizar = (uid, cambios) => setLineas(ls => ls.map(l => l.uid === uid ? { ...l, ...cambios } : l));
  // "15.000" = 15000 (punto de miles), "12,5" y "12.5" = 12,5 (para dólares).
  const montoNum = (l) => parseFloat(String(l.monto).replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0;

  const hayTransferencia = !yaPagado && lineas.some(l => METODO_POR_ID[l.medioPago]?.transferencia);
  const lineasOk = lineas.every(l => l.medioPago && montoNum(l) > 0 && (!METODO_POR_ID[l.medioPago]?.conDetalle || l.detalle.trim()));
  const valido = yaPagado || lineasOk;

  const sumaARS = lineas.filter(l => METODO_POR_ID[l.medioPago]?.moneda !== 'USD').reduce((s, l) => s + montoNum(l), 0);
  const sumaUSD = lineas.filter(l => METODO_POR_ID[l.medioPago]?.moneda === 'USD').reduce((s, l) => s + montoNum(l), 0);
  const diferencia = !yaPagado && esperado.aCobrar != null && sumaUSD === 0 && lineasOk ? sumaARS - esperado.aCobrar : 0;

  const agregarFoto = async (e) => {
    const archivos = Array.from(e.target.files || []);
    e.target.value = '';
    if (!archivos.length) return;
    setProcesandoFoto(true);
    setError('');
    try {
      for (const f of archivos.slice(0, 4 - fotos.length)) {
        const data = await comprimirFoto(f);
        setFotos(fs => [...fs, data]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoFoto(false);
    }
  };

  const confirmar = () => {
    if (!valido) return;
    onConfirm({
      yaPagado,
      pagos: yaPagado ? [] : lineas.map(l => ({ medioPago: l.medioPago, monto: montoNum(l), ...(METODO_POR_ID[l.medioPago]?.conDetalle ? { detalle: l.detalle.trim() } : {}) })),
      fotos,
    });
  };

  const texto = dm ? 'text-zinc-100' : 'text-zinc-900';
  const suave = dm ? 'text-zinc-400' : 'text-zinc-600';
  const caja = dm ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-zinc-50 border-zinc-200';

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        className={`w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border p-5 shadow-2xl ${dm ? 'bg-[#161616] border-white/[0.1]' : 'bg-white border-zinc-200'}`}
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <p className={`text-xl font-black ${texto}`}>¿Cómo pagó?</p>
          <button onClick={onCancel} className={`p-1.5 -m-1.5 rounded-lg ${suave}`}><X size={20}/></button>
        </div>
        <p className={`text-sm leading-snug mb-3 ${suave}`}>{pedido.direccion?.texto}</p>

        {esperado.total != null && (
          <div className={`rounded-2xl border p-3 mb-3 ${caja}`}>
            <div className="flex justify-between text-sm"><span className={suave}>Total del pedido</span><span className={`font-bold ${texto}`}>{formatARS(esperado.total)}</span></div>
            {!esperado.yaPagado && esperado.aCobrar !== esperado.total && (
              <div className="flex justify-between text-sm mt-1"><span className={suave}>A cobrar</span><span className={`font-black ${texto}`}>{formatARS(esperado.aCobrar)}</span></div>
            )}
            {esperado.nota && <p className={`text-xs mt-1.5 ${suave}`}>{esperado.nota}</p>}
          </div>
        )}

        <button type="button" onClick={() => setYaPagado(v => !v)}
          className={`w-full h-12 rounded-xl border font-bold text-sm mb-3 transition-all ${yaPagado
            ? 'bg-emerald-500 border-transparent text-white'
            : (dm ? 'border-white/[0.1] text-zinc-300' : 'border-zinc-200 text-zinc-600')}`}>
          {yaPagado ? '✓ Ya estaba pagado, no cobré nada' : 'Ya estaba pagado (no cobré nada)'}
        </button>

        {!yaPagado && (
          <div className="space-y-3">
            {lineas.map((l, i) => {
              const metodo = METODO_POR_ID[l.medioPago];
              return (
                <div key={l.uid} className={`rounded-2xl border p-3 ${caja}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-black uppercase tracking-widest ${suave}`}>{lineas.length > 1 ? `Pago ${i + 1}` : 'Método de pago'}</span>
                    {lineas.length > 1 && (
                      <button type="button" onClick={() => setLineas(ls => ls.filter(x => x.uid !== l.uid))} className="p-1 -m-1 text-rose-400"><Trash2 size={16}/></button>
                    )}
                  </div>
                  {/* Alias 3 arriba, ocupando la fila entera (es el que se usa siempre). "A mi cuenta":
                      el cliente le transfirió al motomensajero en vez de a 028, se lo rinde en el cierre.
                      "Otro": cualquier otra forma, escrita a mano. */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {METODOS_COBRO.map(m => {
                      const sel = l.medioPago === m.id;
                      return (
                        <button key={m.id} type="button" onClick={() => actualizar(l.uid, { medioPago: m.id })}
                          className={`${m.recomendado ? 'col-span-2 h-14' : 'h-11'} rounded-xl border text-sm font-bold transition-all active:scale-[0.97] ${sel
                            ? 'bg-indigo-500 border-transparent text-white'
                            : m.recomendado
                              ? (dm ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-200' : 'bg-indigo-50 border-indigo-300 text-indigo-700')
                              : (dm ? 'bg-[#101010] border-white/[0.08] text-zinc-300' : 'bg-white border-zinc-200 text-zinc-700')}`}>
                          {m.labelRepartidor || m.label}
                          {m.recomendado && <span className={`block text-[11px] font-black uppercase tracking-widest ${sel ? 'text-white/80' : 'opacity-70'}`}>★ Recomendado</span>}
                        </button>
                      );
                    })}
                  </div>
                  {metodo?.conDetalle && (
                    <input value={l.detalle} onChange={e => actualizar(l.uid, { detalle: e.target.value })} autoFocus
                      placeholder="¿Cómo pagó? Ej: Mercado Pago, alias 1…"
                      className={`w-full mt-2 h-12 px-3 rounded-xl border outline-none text-[15px] ${dm ? 'bg-[#101010] border-white/[0.08] text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'}`} />
                  )}
                  <label className={`flex items-center gap-2 mt-2 h-12 px-3 rounded-xl border ${dm ? 'bg-[#101010] border-white/[0.08]' : 'bg-white border-zinc-200'}`}>
                    <span className={`text-sm font-bold ${suave}`}>{metodo?.moneda === 'USD' ? 'US$' : '$'}</span>
                    <input value={l.monto} onChange={e => actualizar(l.uid, { monto: e.target.value.replace(/[^\d.,]/g, '') })}
                      inputMode="decimal" placeholder="¿Cuánto pagó?"
                      className={`flex-1 bg-transparent outline-none text-lg font-bold ${texto}`} />
                  </label>
                </div>
              );
            })}

            {lineas.length < 4 && (
              <button type="button" onClick={() => setLineas(ls => [...ls, nuevaLinea()])}
                className={`w-full h-11 rounded-xl border border-dashed text-sm font-bold flex items-center justify-center gap-1.5 ${dm ? 'border-white/[0.15] text-zinc-300' : 'border-zinc-300 text-zinc-600'}`}>
                <Plus size={16}/> Pagó una parte con otro método
              </button>
            )}

            {lineasOk && (
              <div className="flex justify-between items-baseline px-1">
                <span className={`text-sm ${suave}`}>Cobraste</span>
                <span className={`text-lg font-black ${texto}`}>
                  {[sumaARS > 0 && formatARS(sumaARS), sumaUSD > 0 && formatUSD(sumaUSD)].filter(Boolean).join(' + ')}
                </span>
              </div>
            )}
            {diferencia !== 0 && (
              <p className={`text-sm font-bold px-1 ${dm ? 'text-amber-400' : 'text-amber-600'}`}>
                {diferencia < 0 ? `Faltan ${formatARS(-diferencia)} para lo que había que cobrar.` : `Son ${formatARS(diferencia)} más de lo que había que cobrar.`}
              </p>
            )}
          </div>
        )}

        {/* Foto del comprobante */}
        <div className="mt-4">
          <p className={`text-xs font-black uppercase tracking-widest mb-2 ${suave}`}>
            Foto del comprobante (opcional)
          </p>
          {fotos.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-2">
              {fotos.map((f, i) => (
                <div key={i} className="relative">
                  <img src={f} alt="" className="w-full h-20 object-cover rounded-xl" />
                  <button type="button" onClick={() => setFotos(fs => fs.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center"><X size={13}/></button>
                </div>
              ))}
            </div>
          )}
          {fotos.length < 4 && (
            <button type="button" onClick={() => inputRef.current?.click()} disabled={procesandoFoto}
              className={`w-full h-14 rounded-2xl border-2 font-black text-base flex items-center justify-center gap-2 transition-all active:scale-[0.97] ${
                hayTransferencia && fotos.length === 0
                  ? (dm ? 'border-indigo-500/60 text-indigo-300 bg-indigo-500/10' : 'border-indigo-400 text-indigo-600 bg-indigo-50')
                  : (dm ? 'border-white/[0.1] text-zinc-300' : 'border-zinc-200 text-zinc-600')}`}>
              {procesandoFoto ? <Loader2 size={20} className="animate-spin"/> : <Camera size={20}/>}
              {fotos.length ? 'Agregar otra foto' : 'Sacar o elegir foto'}
            </button>
          )}
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={agregarFoto} />
          {error && <p className="text-sm font-bold text-rose-500 mt-2">{error}</p>}
        </div>

        <button onClick={confirmar} disabled={!valido || procesandoFoto}
          className="w-full h-16 mt-5 rounded-2xl font-black text-lg text-white transition-all active:scale-[0.97] bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          <CheckCircle2 size={22}/> Entregado
        </button>
        {!valido && (
          <p className={`text-xs text-center mt-2 ${suave}`}>
            {lineas.some(l => METODO_POR_ID[l.medioPago]?.conDetalle && !l.detalle.trim()) ? 'Escribí cómo pagó.' : 'Elegí cómo pagó y cuánto.'}
          </p>
        )}
      </div>
    </div>
  );
}
