import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ScanBarcode, CheckCircle, Loader2, Trash2 } from 'lucide-react';

// Componentes de escaneo compartidos entre /escaner (EscanerPage.jsx) y el paso de "escanear antes
// de empaquetar" en /pedidos (PedidosPage.jsx). Las funciones sin JSX (lectura/escritura de
// Firestore) viven aparte, en escaneo/datos.js — ver ese archivo para por qué están separados.

// ───────────────────────────────────────────────────────────────────────────────────────────
// Caja de escaneo: un cuadro de texto grande, siempre enfocado, donde "escribe" la lectora (son
// lectoras USB/Bluetooth tipo teclado — escanean, tipean el número solas y mandan Enter, como si
// alguien lo hubiera tecleado a mano y apretado Enter). Funciona igual tipeando a mano, por si hay
// que cargar un código que no escanea bien.
//
// A propósito NO se re-enfoca sola todo el tiempo: si lo hiciera, le robaría el foco a los campos
// de cantidad/costo apenas alguien toca uno para corregirlo a mano. Se enfoca al abrir la pantalla
// y de nuevo después de cada escaneo (que es cuando de verdad hace falta seguir escaneando); si el
// operario tocó otro campo, alcanza con un click acá para retomar.
export function CajaEscaneo({ dm, onScan, disabled }) {
  const [valor, setValor] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    const codigo = valor.trim();
    setValor('');
    if (codigo) onScan(codigo);
    inputRef.current?.focus();
  };

  return (
    <div onClick={() => inputRef.current?.focus()}
      className={`rounded-2xl border-2 border-dashed p-4 flex items-center gap-3 cursor-text transition-colors ${dm ? 'border-indigo-500/40 bg-indigo-500/[0.06]' : 'border-indigo-300 bg-indigo-50'}`}>
      <ScanBarcode size={26} className={`flex-shrink-0 ${dm ? 'text-indigo-400' : 'text-indigo-600'}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-[10px] font-black uppercase tracking-widest ${dm ? 'text-indigo-300' : 'text-indigo-600'}`}>Escaneá acá</p>
        <input ref={inputRef} value={valor} disabled={disabled}
          onChange={e => setValor(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="Apuntá la pistola y dispará — o escribí el código a mano"
          className={`w-full bg-transparent text-lg font-bold outline-none mt-0.5 ${dm ? 'text-zinc-100 placeholder-zinc-600' : 'text-zinc-900 placeholder-zinc-400'}`} />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// Cartel para registrar un código que nunca se había escaneado. Sin esto confirmado no hay forma
// de sumarlo a la sesión — un código sin producto asignado no sirve para nada. Una vez guardado acá
// queda para siempre: la próxima vez que se escanee este mismo código, ya se reconoce solo.
export function RegistrarCodigoModal({ dm, codigo, productosConocidos, onGuardar, onCancelar }) {
  const [product, setProduct] = useState('');
  const [variant, setVariant] = useState('');
  const [saving, setSaving] = useState(false);
  const variantesDelProducto = useMemo(() => {
    const p = productosConocidos.find(x => x.product.toLowerCase() === product.trim().toLowerCase());
    return p ? p.variantes : [];
  }, [product, productosConocidos]);

  const guardar = async () => {
    if (!product.trim() || saving) return;
    setSaving(true);
    try { await onGuardar({ product: product.trim(), variant: variant.trim() || 'Único' }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} onClick={onCancelar}>
      <div onClick={e => e.stopPropagation()} className={`w-full max-w-sm rounded-3xl border p-5 ${dm ? 'bg-[#161616] border-white/[0.1]' : 'bg-white border-zinc-200'}`}>
        <p className={`text-lg font-black ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>Código nuevo</p>
        <p className={`text-xs mt-1 mb-4 ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>
          Este código (<span className="font-mono font-bold">{codigo}</span>) todavía no está asociado a ningún producto. Decime qué es — de acá en más se va a reconocer solo.
        </p>
        <div className="space-y-3">
          <div>
            <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Producto</label>
            <input value={product} onChange={e => setProduct(e.target.value)} autoFocus list="escaneo-productos"
              placeholder="Ej: Elfbar Ice"
              className={`h-12 border rounded-xl px-3.5 w-full text-base outline-none mt-1 ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'}`} />
            <datalist id="escaneo-productos">{productosConocidos.map(p => <option key={p.product} value={p.product} />)}</datalist>
          </div>
          <div>
            <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Variante / sabor (opcional)</label>
            <input value={variant} onChange={e => setVariant(e.target.value)} list="escaneo-variantes"
              placeholder="Ej: Cherry Strazz"
              className={`h-12 border rounded-xl px-3.5 w-full text-base outline-none mt-1 ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'}`} />
            <datalist id="escaneo-variantes">{variantesDelProducto.map(v => <option key={v} value={v} />)}</datalist>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={guardar} disabled={!product.trim() || saving}
            className="flex-1 h-12 rounded-xl font-bold text-white bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} Guardar y seguir
          </button>
          <button onClick={onCancelar} className={`px-4 h-12 rounded-xl font-bold text-sm ${dm ? 'text-zinc-400 hover:bg-white/[0.06]' : 'text-zinc-500 hover:bg-zinc-100'}`}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// Una fila de la sesión de escaneo — cantidad siempre editable (sirve tanto para escanear unidad
// por unidad como para escanear una vez y tipear el total), costo solo cuando `mostrarCosto` (lo
// usa Entrada en /escaner; Salida y el escaneo de /pedidos no muestran costo).
export function FilaEscaneada({ dm, item, mostrarCosto, onCambiar, onQuitar }) {
  const total = (parseFloat(item.costo) || 0) * (parseInt(item.cantidad) || 0);
  return (
    <div className={`rounded-xl border p-3 flex items-center gap-3 ${dm ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-zinc-50 border-zinc-200'}`}>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold truncate ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>
          {item.product}{item.variant && item.variant !== 'Único' ? ` · ${item.variant}` : ''}
        </p>
        <p className={`text-[11px] font-mono ${dm ? 'text-zinc-600' : 'text-zinc-400'}`}>{item.codigo}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className={`text-[10px] font-bold uppercase ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>Cant.</span>
        <input type="number" inputMode="numeric" min="1" value={item.cantidad} onWheel={e => e.target.blur()}
          onChange={e => onCambiar({ cantidad: e.target.value })}
          className={`h-10 w-16 border rounded-lg px-2 text-center text-sm font-bold outline-none ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'}`} />
      </div>
      {mostrarCosto && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-[10px] font-bold ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>$</span>
          <input type="number" inputMode="decimal" min="0" value={item.costo} onWheel={e => e.target.blur()}
            onChange={e => onCambiar({ costo: e.target.value })} placeholder="costo c/u"
            className={`h-10 w-24 border rounded-lg px-2 text-sm font-bold outline-none ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100 placeholder-zinc-600' : 'bg-white border-zinc-200 text-zinc-900'}`} />
        </div>
      )}
      {mostrarCosto && total > 0 && (
        <span className={`text-xs font-bold w-20 text-right flex-shrink-0 ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>
          {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(total)}
        </span>
      )}
      <button onClick={onQuitar} className={`p-2 -m-1 rounded-lg flex-shrink-0 ${dm ? 'text-zinc-600 hover:text-red-400 hover:bg-red-500/10' : 'text-zinc-400 hover:text-red-500 hover:bg-red-50'}`}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}
