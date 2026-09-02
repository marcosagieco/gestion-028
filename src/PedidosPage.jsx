import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, getFirestore, collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, runTransaction } from 'firebase/firestore';
import {
  ClipboardList, Plus, Clock, AlertTriangle, XCircle, CheckCircle, ChevronRight,
  ChevronDown, History, Save, Moon, Sun, LogOut, PartyPopper, Search, Trash2,
  Bike, Car, MapPin, PackageCheck, Store, Archive
} from 'lucide-react';
import AddressAutocomplete from './reparto/AddressAutocomplete';
import { ZONAS } from './reparto/zonas';

// --- Firebase: mismo patrón que FacturasPage.jsx — página 100% independiente de App.jsx,
// reutiliza la instancia si ya fue inicializada (no debería pasar acá porque esta página vive
// en su propia ruta/chunk, pero cubre el caso igual). ---
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const fbApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
let db;
try {
  db = initializeFirestore(fbApp, { experimentalForceLongPolling: true });
} catch {
  db = getFirestore(fbApp);
}
if (!db) db = getFirestore(fbApp);

// --- Utilidades (copiadas de App.jsx: esta página no importa nada de ahí a propósito) ---
const formatMoney = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);

const getTodayDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const safeDateStr = (dateStr, options) => {
  if (!dateStr) return 'Sin fecha';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Fecha inv.';
  return d.toLocaleDateString(undefined, options);
};
const safeTimeStr = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};
const safeDateTime = (dateStr) => {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};
const timeAgoStr = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'recién';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
};
const minutesSince = (dateStr) => {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 60000);
};

// Lee SOLO la primera palabra del mensaje para decidir el tipo de envío — nunca se parsea nada
// más del texto. Si no arranca con "moto"/"uber"/"retiro", tipoEnvio queda null y el pedido cae en
// "Sin clasificar" hasta que alguien lo asigne a mano; nunca se adivina.
const parseTipoEnvio = (mensaje) => {
  const primera = (mensaje || '').trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-záéíóúñ]/g, '') || '';
  if (primera === 'moto') return 'moto';
  if (primera === 'uber') return 'uber';
  if (primera === 'retiro') return 'retiro';
  return null;
};

const PAYMENT_METHOD_LABELS = { alias1: 'Alias 1', alias2: 'Alias 2', alias3: 'Alias 3', alias4: 'Alias 4', efectivo: 'Efectivo' };
const PEDIDO_TIPO_CLIENTE_OPTIONS = [
  { value: '', label: '-- Elegir --' },
  { value: 'Frecuente', label: 'Frecuente' },
  { value: 'Nuevo - Organico', label: 'Nuevo - Orgánico' },
  { value: 'Nuevo - Publicidad', label: 'Nuevo - Publicidad' },
  { value: 'Clientes - Publicidad', label: 'Clientes - Publicidad' },
  { value: 'Revendedor', label: 'Revendedor' },
  { value: 'Dropdeal', label: 'Dropdeal' },
];
const PEDIDO_TIPO_CLIENTE_LABELS = Object.fromEntries(PEDIDO_TIPO_CLIENTE_OPTIONS.map(o => [o.value, o.label]));
const PEDIDO_MEDIO_PAGO_OPTIONS = [
  { value: '', label: '-- Elegir --' },
  { value: 'alias1', label: 'Alias 1' },
  { value: 'alias2', label: 'Alias 2' },
  { value: 'alias3', label: 'Alias 3' },
  { value: 'alias4', label: 'Alias 4' },
  { value: 'efectivo', label: 'Efectivo' },
];
// Mismos nombres canónicos que normalizeSellerName en App.jsx (Ventas).
const PEDIDO_VENDEDOR_OPTIONS = [
  { value: '', label: '-- Elegir --' },
  { value: '028 Import', label: '028 Import' },
  { value: 'Delfina', label: 'Delfina' },
  { value: 'Bautista', label: 'Bauti' },
  { value: 'Jeronimo', label: 'Jero' },
];
// Umbrales (minutos) para resaltar un pedido pendiente/armado que lleva mucho tiempo sin moverse.
const PEDIDO_ALERTA_MIN = 15;
const PEDIDO_URGENTE_MIN = 30;

// Endpoint que factura desde la web — mismo camino y mismo resultado que factura por WhatsApp
// (functions/index.js → emitirFacturaWeb, que llama al mismo núcleo que usa el bot). La clave tiene
// que ser IDÉNTICA a FACTURA_WEB_KEY del lado del servidor; no es seguridad real (corre en el
// navegador), solo evita que la URL quede abierta a cualquiera que la encuentre.
const FACTURA_ENDPOINT = 'https://us-central1-gestion-028.cloudfunctions.net/emitirFacturaWeb';
const FACTURA_WEB_KEY = '028_Pedidos_Factura_2026';

// Reutiliza el mismo login que Gestión (028_user / clave 1717): si ya iniciaste sesión en el
// dashboard desde este teléfono, Pedidos abre directo sin pedir nada de nuevo.
const AUTH_KEY = '028_user';
const AUTH_PWD = '1717';

function LoginPedidos({ dm, onAuth }) {
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState(false);

  const submit = e => {
    e.preventDefault();
    if (pwd === AUTH_PWD) {
      localStorage.setItem(AUTH_KEY, 'Admin');
      onAuth();
    } else {
      setErr(true);
      setPwd('');
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 ${dm ? 'bg-[#050505]' : 'bg-slate-50'}`}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className={`w-full max-w-sm rounded-2xl border p-8 shadow-xl ${dm ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200'}`}>
        <div className="flex items-center gap-3 mb-7">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#6366f1' }}>
            <ClipboardList size={17} className="text-white" />
          </div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>028 Import</p>
            <h1 className={`text-sm font-black leading-tight ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>Pedidos del Depósito</h1>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Clave de seguridad</label>
            <input
              type="password"
              value={pwd}
              onChange={e => { setPwd(e.target.value); setErr(false); }}
              placeholder="••••••••••••"
              autoFocus
              className={`w-full px-3 py-3 text-base rounded-xl border outline-none transition-all focus:ring-2 focus:ring-indigo-500/30 ${err ? 'border-red-500/60 bg-red-500/5' : dm ? 'bg-[#1a1a1a] border-white/[0.08] text-zinc-100 placeholder-zinc-600' : 'bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400'}`}
            />
            {err && <p className="text-xs text-red-400 mt-1.5 font-medium">Clave incorrecta</p>}
          </div>
          <button type="submit"
            className="w-full h-12 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: '#6366f1' }}>
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ dm, icon: Icon, text }) {
  return (
    <div className={`rounded-3xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 text-center ${dm ? 'border-white/[0.08] bg-white/[0.02]' : 'border-zinc-200 bg-zinc-50'}`}>
      <Icon size={32} className={dm ? 'text-zinc-600' : 'text-zinc-300'} />
      <p className={`text-sm font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-500'}`}>{text}</p>
    </div>
  );
}

// Autocompletar de producto contra el stock real (colección "batches"). Escribís y va filtrando
// por coincidencia de texto en producto+variante; tocás una opción para "confirmarla" (o, si lo
// que escribiste matchea exacto y sin ambigüedad el nombre de un solo producto, queda confirmado
// solo). Mientras no haya un producto confirmado, no se puede finalizar — así nunca se guarda un
// texto libre que no corresponda a stock real.
function ProductAutocomplete({ dm, items, value, onChange, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const query = value.trim().toLowerCase();
  const matches = query.length === 0 ? [] : items.filter(it => it.label.toLowerCase().includes(query)).slice(0, 8);

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search size={16} className={dm ? 'text-zinc-500' : 'text-zinc-400'} />
        </div>
        <input
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Escribí para buscar en el stock..."
          className={`h-12 border rounded-xl pl-9 pr-3.5 w-full text-base outline-none transition-all ${
            selected ? (dm ? 'border-emerald-500/60' : 'border-emerald-400') : (dm ? 'border-white/[0.07]' : 'border-zinc-200')
          } ${dm ? 'bg-[#101010] text-zinc-100 placeholder-zinc-600 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white text-zinc-900 focus:ring-1 focus:ring-blue-100'}`}
        />
      </div>
      {open && matches.length > 0 && (
        <div className={`absolute z-10 mt-1 w-full rounded-xl border shadow-xl max-h-56 overflow-y-auto custom-scrollbar ${dm ? 'bg-[#181818] border-white/[0.1]' : 'bg-white border-zinc-200'}`}>
          {matches.map(it => (
            <button key={it.itemId} type="button" onClick={() => { onSelect(it); setOpen(false); }}
              className={`w-full text-left px-3.5 py-2.5 text-sm transition-colors ${dm ? 'hover:bg-white/[0.06] text-zinc-200' : 'hover:bg-zinc-50 text-zinc-800'}`}>
              <div className="font-semibold">{it.label}</div>
              <div className={`text-[11px] ${it.currentStock > 0 ? (dm ? 'text-zinc-500' : 'text-zinc-400') : 'text-red-400'}`}>
                {it.currentStock > 0 ? `${it.currentStock} en stock` : 'Sin stock'}
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query.length > 0 && matches.length === 0 && (
        <div className={`absolute z-10 mt-1 w-full rounded-xl border shadow-xl p-3 text-xs text-center ${dm ? 'bg-[#181818] border-white/[0.1] text-zinc-500' : 'bg-white border-zinc-200 text-zinc-400'}`}>
          Sin resultados en el stock
        </div>
      )}
      {selected && (
        <div className={`mt-1.5 text-[11px] font-semibold flex items-center gap-1 ${dm ? 'text-emerald-400' : 'text-emerald-600'}`}>
          <CheckCircle size={12}/> {selected.currentStock} unidad{selected.currentStock !== 1 ? 'es' : ''} disponible{selected.currentStock !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

// Mini cartel centrado para confirmar una acción antes de dispararla — se usa para el "Listo" de
// Pendiente, así no se marca un pedido como armado sin querer sin haberlo empaquetado de verdad.
function ConfirmMiniModal({ dm, text, confirmLabel = 'Sí, ya lo empaqueté', onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in duration-150"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        className={`w-full max-w-xs rounded-2xl border p-5 shadow-2xl animate-in zoom-in-95 duration-150 ${dm ? 'bg-[#161616] border-white/[0.1]' : 'bg-white border-zinc-200'}`}>
        <p className={`text-sm font-bold text-center leading-snug mb-4 ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>{text}</p>
        <div className="flex flex-col gap-2">
          <button onClick={onConfirm}
            className="w-full h-12 rounded-xl font-black text-sm text-white transition-all active:scale-[0.97] bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center gap-2">
            <CheckCircle size={16}/> {confirmLabel}
          </button>
          <button onClick={onCancel}
            className={`w-full h-10 rounded-xl font-bold text-sm transition-all ${dm ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-700'}`}>
            Todavía no
          </button>
        </div>
      </div>
    </div>
  );
}

// Cartel de facturación al finalizar un pedido con Alias 1 / Alias 2 — mismo criterio que WhatsApp
// (solo esos dos medios de pago tienen emisor dado de alta en ARCA). Tiene DOBLE confirmación a
// propósito antes de emitir de verdad: "¿facturás?" y, recién si dice que sí, un segundo cartel que
// explica que no se puede deshacer — para no emitir una factura real por un toque de más.
function FacturaModal({ dm, prompt, step, resultado, onNo, onSiPrimero, onVolver, onConfirmarEmision, onCerrar }) {
  if (!prompt) return null;
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in duration-150"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}>
      <div className={`w-full max-w-sm rounded-2xl border p-5 shadow-2xl animate-in zoom-in-95 duration-150 ${dm ? 'bg-[#161616] border-white/[0.1]' : 'bg-white border-zinc-200'}`}>

        {step === 'preguntar' && (
          <>
            <p className={`text-base font-bold text-center leading-snug mb-1.5 ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>
              🧾 ¿Emitís Factura C por {formatMoney(prompt.monto)} a Consumidor Final?
            </p>
            <p className={`text-xs text-center mb-4 ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>El pedido ya quedó finalizado — esto es aparte.</p>
            <div className="flex flex-col gap-2">
              <button onClick={onSiPrimero}
                className="w-full h-12 rounded-xl font-black text-sm text-white transition-all active:scale-[0.97] bg-[#6366f1] hover:bg-[#4f46e5]">
                Sí, facturar
              </button>
              <button onClick={onNo}
                className={`w-full h-10 rounded-xl font-bold text-sm transition-all ${dm ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-700'}`}>
                No, sin factura
              </button>
            </div>
          </>
        )}

        {step === 'confirmar' && (
          <>
            <p className={`text-base font-bold text-center leading-snug mb-1.5 ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>
              Vas a emitir una Factura C por {formatMoney(prompt.monto)}
            </p>
            <p className="text-xs text-center text-red-400 font-semibold mb-4">Una vez emitida no se puede anular ni editar desde acá. ¿Confirmás?</p>
            <div className="flex flex-col gap-2">
              <button onClick={onConfirmarEmision}
                className="w-full h-12 rounded-xl font-black text-sm text-white transition-all active:scale-[0.97] bg-emerald-500 hover:bg-emerald-400">
                Sí, emitir factura
              </button>
              <button onClick={onVolver}
                className={`w-full h-10 rounded-xl font-bold text-sm transition-all ${dm ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-700'}`}>
                Volver
              </button>
            </div>
          </>
        )}

        {step === 'cargando' && (
          <div className="py-6 flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '2.5px solid #6366f1', borderTopColor: 'transparent' }} />
            <p className={`text-sm font-semibold ${dm ? 'text-zinc-300' : 'text-zinc-600'}`}>Emitiendo factura con ARCA...</p>
          </div>
        )}

        {step === 'resultado' && resultado && (resultado.ok ? (
          <>
            <p className="text-base font-black text-center text-emerald-500 mb-3">🧾 Factura C emitida</p>
            <div className={`text-xs rounded-xl border p-3 space-y-1.5 mb-4 ${dm ? 'border-white/[0.07] bg-white/[0.02] text-zinc-300' : 'border-zinc-200 bg-zinc-50 text-zinc-700'}`}>
              <div className="flex justify-between gap-3"><span className="opacity-60">Número</span><span className="font-bold">{resultado.nroComprobante}</span></div>
              <div className="flex justify-between gap-3"><span className="opacity-60">CAE</span><span className="font-bold">{resultado.cae}</span></div>
              <div className="flex justify-between gap-3"><span className="opacity-60">Vence</span><span className="font-bold">{resultado.vencimientoCAE}</span></div>
            </div>
            <button onClick={onCerrar}
              className="w-full h-12 rounded-xl font-black text-sm text-white transition-all active:scale-[0.97] bg-emerald-500 hover:bg-emerald-400">
              Listo
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-center text-red-400 mb-1">No se pudo emitir la factura</p>
            <p className={`text-xs text-center mb-4 ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>{resultado.error || 'Error desconocido.'}</p>
            <div className="flex flex-col gap-2">
              <button onClick={onConfirmarEmision}
                className="w-full h-12 rounded-xl font-black text-sm text-white transition-all active:scale-[0.97] bg-[#6366f1] hover:bg-[#4f46e5]">
                Reintentar
              </button>
              <button onClick={onCerrar}
                className={`w-full h-10 rounded-xl font-bold text-sm transition-all ${dm ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-700'}`}>
                Cerrar (la venta ya quedó registrada)
              </button>
            </div>
          </>
        ))}
      </div>
    </div>
  );
}

// Tarjeta grande y centrada con el pedido que toca resolver AHORA (el más viejo de la cola,
// salvo que el usuario haya tocado otro en la fila de abajo). Es el corazón de la pantalla:
// un solo pedido a la vez, bien grande, con un botón enorme para no errarle.
// Se monta de nuevo cada vez que cambia el pedido en foco (el padre le pasa key={pedido.id}),
// así el "entered" arranca en false y dispara la animación de crecimiento apenas se pinta.
function FocusCard({ pedido, dm, eyebrow, actionLabel, actionColor, onAction, onCancel, hideCancel = false, requireConfirm = false, extraAction }) {
  const [entered, setEntered] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const mins = minutesSince(pedido.createdAt);
  const isUrgente = mins >= PEDIDO_URGENTE_MIN;
  const isAlerta = mins >= PEDIDO_ALERTA_MIN && mins < PEDIDO_URGENTE_MIN;
  return (
    <div style={{ transformOrigin: 'center top' }} className={`rounded-3xl border-2 p-5 flex flex-col gap-4 transition-all duration-300 ease-out ${entered ? 'opacity-100 scale-100' : 'opacity-0 scale-90'} ${
        isUrgente ? (dm ? 'bg-red-500/[0.08] border-red-500/50' : 'bg-red-50 border-red-300')
        : isAlerta ? (dm ? 'bg-amber-500/[0.06] border-amber-500/40' : 'bg-amber-50 border-amber-300')
        : (dm ? 'bg-[#141414] border-white/[0.1]' : 'bg-white border-zinc-200 shadow-sm')
      }`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-black uppercase tracking-widest ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>{eyebrow}</span>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {isUrgente && (
            <span className="text-[10px] font-black uppercase tracking-wider text-red-400 flex items-center gap-1 animate-pulse">
              <AlertTriangle size={12}/> Urgente
            </span>
          )}
          <span className={`flex items-center gap-1 text-xs font-bold ${isUrgente ? 'text-red-400' : isAlerta ? 'text-amber-400' : (dm ? 'text-zinc-500' : 'text-zinc-400')}`}>
            <Clock size={13}/> {timeAgoStr(pedido.createdAt)}
          </span>
          {pedido.tipoEnvio === 'moto' && (
            <span className={`flex items-center gap-1 text-xs font-bold ${dm ? 'text-indigo-400' : 'text-indigo-600'}`}>
              <Bike size={13}/> Moto
            </span>
          )}
          {pedido.tipoEnvio === 'uber' && (
            <span className={`flex items-center gap-1 text-xs font-bold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>
              <Car size={13}/> Uber
            </span>
          )}
          {pedido.tipoEnvio === 'retiro' && (
            <span className={`flex items-center gap-1 text-xs font-bold ${dm ? 'text-amber-400' : 'text-amber-600'}`}>
              <Store size={13}/> Retiro
            </span>
          )}
        </div>
      </div>

      <p className={`text-xl leading-snug whitespace-pre-wrap font-bold ${dm ? 'text-zinc-50' : 'text-zinc-900'}`}>
        {pedido.mensaje}
      </p>

      <div className="flex flex-col gap-2 mt-1">
        <button onClick={() => requireConfirm ? setShowConfirm(true) : onAction()}
          className={`w-full h-16 rounded-2xl font-black text-lg text-white transition-all active:scale-[0.97] ${actionColor}`}>
          {actionLabel}
        </button>
        {!hideCancel && (
          <button onClick={onCancel}
            className={`w-full h-11 rounded-xl font-bold text-sm border transition-all active:scale-[0.97] ${dm ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-red-200 text-red-600 hover:bg-red-50'}`}>
            Cancelar pedido
          </button>
        )}
        {extraAction && (
          <button onClick={extraAction.onClick}
            className={`w-full h-11 rounded-xl font-bold text-sm border transition-all active:scale-[0.97] ${dm ? 'border-white/[0.1] text-zinc-500 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10' : 'border-zinc-200 text-zinc-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50'}`}>
            {extraAction.label}
          </button>
        )}
      </div>
      {showConfirm && (
        <ConfirmMiniModal dm={dm} text="¿Confirmás que armaste y empaquetaste este pedido?"
          onConfirm={() => { setShowConfirm(false); onAction(); }} onCancel={() => setShowConfirm(false)} />
      )}
    </div>
  );
}

// Misma tarjeta de foco que FocusCard, pero para pedidos de moto en "pendiente": antes de poder
// marcar "Listo" hace falta cargar la dirección (con el autocompletado de Google, nunca a mano),
// referencias opcionales y la zona — recién con eso completo se habilita el botón, que además de
// pasar a "armado" guarda la dirección en el pedido para que entre al recorrido de reparto.
function MotoPendienteCard({ pedido, dm, onListo, onCancel }) {
  const [entered, setEntered] = useState(false);
  const [direccionTexto, setDireccionTexto] = useState('');
  const [direccionData, setDireccionData] = useState(null); // { texto, lat, lng, placeId }
  const [referencias, setReferencias] = useState('');
  const [zona, setZona] = useState('');
  const [zonaEsSugerida, setZonaEsSugerida] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const mins = minutesSince(pedido.createdAt);
  const isUrgente = mins >= PEDIDO_URGENTE_MIN;
  const isAlerta = mins >= PEDIDO_ALERTA_MIN && mins < PEDIDO_URGENTE_MIN;
  // La zona ya no es obligatoria para poder confirmar: si la dirección cae afuera de las 8 zonas
  // definidas, no tiene sentido forzar a elegir una igual — se deja pasar sin zona (el recorrido la
  // trata como "fría" por defecto, ver recorridoEngine.js).
  const puedeConfirmar = !!direccionData && !saving;

  const handleListo = async () => {
    if (!puedeConfirmar) return;
    setSaving(true);
    try {
      await onListo({ ...direccionData, referencias: referencias.trim() || null, zona: zona || null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ transformOrigin: 'center top' }} className={`rounded-3xl border-2 p-5 flex flex-col gap-4 transition-all duration-300 ease-out ${entered ? 'opacity-100 scale-100' : 'opacity-0 scale-90'} ${
        isUrgente ? (dm ? 'bg-red-500/[0.08] border-red-500/50' : 'bg-red-50 border-red-300')
        : isAlerta ? (dm ? 'bg-amber-500/[0.06] border-amber-500/40' : 'bg-amber-50 border-amber-300')
        : (dm ? 'bg-[#141414] border-white/[0.1]' : 'bg-white border-zinc-200 shadow-sm')
      }`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-black uppercase tracking-widest ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>
          Próximo a armar
        </span>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className={`flex items-center gap-1 text-xs font-bold ${isUrgente ? 'text-red-400' : isAlerta ? 'text-amber-400' : (dm ? 'text-zinc-500' : 'text-zinc-400')}`}>
            <Clock size={13}/> {timeAgoStr(pedido.createdAt)}
          </span>
          <span className={`flex items-center gap-1 text-xs font-bold ${dm ? 'text-indigo-400' : 'text-indigo-600'}`}>
            <Bike size={13}/> Moto
          </span>
        </div>
      </div>

      <p className={`text-lg leading-snug whitespace-pre-wrap font-bold ${dm ? 'text-zinc-50' : 'text-zinc-900'}`}>{pedido.mensaje}</p>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className={`text-xs font-semibold flex items-center gap-1.5 ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}><MapPin size={13}/> Dirección</label>
          <AddressAutocomplete dm={dm} value={direccionTexto}
            onChange={text => { setDireccionTexto(text); setDireccionData(null); }}
            onSelect={data => {
              setDireccionTexto(data.texto);
              setDireccionData(data);
              // Sugerencia automática de zona (ya viene calculada del lado de AddressAutocomplete,
              // probando todos los componentes de la dirección) — sigue siendo editable, no se
              // bloquea: en barrios que la propia configuración de zonas divide por una calle límite
              // (Devoto, Paternal, Boedo, Saavedra, Florida, Munro) no hay sugerencia y queda igual
              // que antes, para elegir a mano.
              setZona(data.zonaSugerida || '');
              setZonaEsSugerida(!!data.zonaSugerida);
            }} />
          {direccionData && <p className={`text-[11px] font-semibold flex items-center gap-1 ${dm ? 'text-emerald-400' : 'text-emerald-600'}`}><CheckCircle size={12}/> Dirección confirmada</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Referencias (opcional)</label>
          <input value={referencias} onChange={e => setReferencias(e.target.value)} placeholder="Piso, depto, timbre, portón negro..."
            className={`h-12 border rounded-xl px-3.5 w-full text-base outline-none transition-all ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100 placeholder-zinc-600 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white border-zinc-200 text-zinc-900 focus:ring-1 focus:ring-blue-100'}`} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Zona (opcional si la dirección queda afuera de estas 8)</label>
          <div className="relative">
            <select value={zona} onChange={e => { setZona(e.target.value); setZonaEsSugerida(false); }}
              className={`h-12 appearance-none w-full border rounded-xl px-3.5 pr-9 text-base outline-none cursor-pointer transition-all ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100 focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white border-zinc-200 text-zinc-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'}`}>
              <option value="">-- Elegir zona --</option>
              {ZONAS.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none"><ChevronDown size={14} className={dm ? 'text-zinc-500' : 'text-zinc-400'} /></div>
          </div>
          {zonaEsSugerida && (
            <p className={`text-[11px] font-medium ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>Sugerida según la dirección — revisá que sea correcta</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-1">
        <button onClick={() => setShowConfirm(true)} disabled={!puedeConfirmar}
          className="w-full h-16 rounded-2xl font-black text-lg text-white transition-all active:scale-[0.97] bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed">
          {saving ? 'Guardando...' : 'Listo'}
        </button>
        <button onClick={onCancel}
          className={`w-full h-11 rounded-xl font-bold text-sm border transition-all active:scale-[0.97] ${dm ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-red-200 text-red-600 hover:bg-red-50'}`}>
          Cancelar pedido
        </button>
      </div>
      {showConfirm && (
        <ConfirmMiniModal dm={dm} text="¿Confirmás que armaste y empaquetaste este pedido?"
          onConfirm={() => { setShowConfirm(false); handleListo(); }} onCancel={() => setShowConfirm(false)} />
      )}
    </div>
  );
}

// Lista vertical con el resto de la cola, apilada debajo del foco: tocás uno y pasa a ser el
// foco grande de arriba. Así se puede saltar a un pedido puntual sin depender del orden FIFO.
function NextRow({ list, dm, onFocus }) {
  if (list.length === 0) return null;
  return (
    <div className="space-y-2">
      <span className={`text-[10px] font-black uppercase tracking-widest px-1 ${dm ? 'text-zinc-600' : 'text-zinc-400'}`}>
        Siguientes ({list.length}) · <span className="lg:hidden">tocá uno para pasarlo arriba</span><span className="hidden lg:inline">hacé clic para pasarlo arriba</span>
      </span>
      <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-2.5">
        {list.map(p => {
          const mins = minutesSince(p.createdAt);
          const urgent = mins >= PEDIDO_URGENTE_MIN;
          const alert = mins >= PEDIDO_ALERTA_MIN && mins < PEDIDO_URGENTE_MIN;
          return (
            <button key={p.id} onClick={() => onFocus(p.id)}
              className={`w-full rounded-2xl border p-3.5 text-left transition-all active:scale-[0.98] lg:hover:shadow-lg lg:hover:-translate-y-0.5 ${
                urgent ? (dm ? 'bg-red-500/[0.06] border-red-500/30 lg:hover:border-red-500/50' : 'bg-red-50/70 border-red-200 lg:hover:border-red-300')
                : alert ? (dm ? 'bg-amber-500/[0.05] border-amber-500/25 lg:hover:border-amber-500/45' : 'bg-amber-50/70 border-amber-200 lg:hover:border-amber-300')
                : (dm ? 'bg-[#101010] border-white/[0.07] hover:border-white/[0.15]' : 'bg-white border-zinc-200 hover:border-zinc-300')
              }`}>
              <div className={`text-[10px] font-bold mb-1 flex items-center gap-2 ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>
                <span className="flex items-center gap-1"><Clock size={10}/>{timeAgoStr(p.createdAt)}</span>
                {p.tipoEnvio === 'moto' && (
                  <span className={`flex items-center gap-1 ${dm ? 'text-indigo-400' : 'text-indigo-600'}`}>
                    <Bike size={10}/> Moto
                  </span>
                )}
                {p.tipoEnvio === 'uber' && (
                  <span className={`flex items-center gap-1 ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    <Car size={10}/> Uber
                  </span>
                )}
                {p.tipoEnvio === 'retiro' && (
                  <span className={`flex items-center gap-1 ${dm ? 'text-amber-400' : 'text-amber-600'}`}>
                    <Store size={10}/> Retiro
                  </span>
                )}
              </div>
              <div className={`text-xs leading-snug line-clamp-3 ${dm ? 'text-zinc-300' : 'text-zinc-700'}`}>{p.mensaje}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Pedidos que llegaron sin "moto"/"uber" como primera palabra: hay que asignarles el tipo a mano
// antes de que puedan avanzar — nunca se adivina. Lista compacta, una acción rápida por pedido.
function SinClasificarSection({ list, dm, onClasificar }) {
  if (list.length === 0) return null;
  return (
    <div className="space-y-2">
      <span className={`text-[10px] font-black uppercase tracking-widest px-1 flex items-center gap-1.5 ${dm ? 'text-amber-400' : 'text-amber-600'}`}>
        <AlertTriangle size={12}/> Sin clasificar ({list.length}) · elegí cómo se envía
      </span>
      <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-2.5">
        {list.map(p => (
          <div key={p.id} className={`rounded-2xl border p-3.5 ${dm ? 'bg-amber-500/[0.05] border-amber-500/25' : 'bg-amber-50/70 border-amber-200'}`}>
            <div className={`text-xs leading-snug line-clamp-3 mb-2.5 ${dm ? 'text-zinc-300' : 'text-zinc-700'}`}>{p.mensaje}</div>
            <div className="flex gap-2">
              <button onClick={() => onClasificar(p, 'moto')}
                className={`flex-1 h-11 rounded-xl font-bold text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 text-white bg-[#6366f1] hover:bg-[#4f46e5]`}>
                <Bike size={16}/> Moto
              </button>
              <button onClick={() => onClasificar(p, 'uber')}
                className={`flex-1 h-11 rounded-xl font-bold text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 ${dm ? 'bg-white/[0.08] text-zinc-200 hover:bg-white/[0.14]' : 'bg-zinc-800 text-white hover:bg-zinc-700'}`}>
                <Car size={16}/> Uber
              </button>
              <button onClick={() => onClasificar(p, 'retiro')}
                className="flex-1 h-11 rounded-xl font-bold text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 text-white bg-amber-500 hover:bg-amber-400">
                <Store size={16}/> Retiro
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Solo se usa en la vista de PC: un tipo de envío (moto o uber) con su propio foco + cola de
// siguientes, para que en pantallas grandes moto y uber queden en bloques separados en vez de
// mezclados en una sola cola (en celular sigue todo junto, sin este componente).
function PendienteGrupo({ titulo, icon: Icon, list, dm, focusId, onFocus, onListoMoto, onListoUber, onCancel }) {
  // Las 3 columnas (Moto/Uber/Retiro) quedan siempre visibles en PC, aunque una esté vacía — así
  // el orden de las 3 no salta según qué tipo tenga pedidos en el momento.
  if (list.length === 0) {
    return (
      <div className="space-y-3">
        <span className={`text-[11px] font-black uppercase tracking-widest px-1 flex items-center gap-1.5 ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>
          <Icon size={13}/> {titulo} (0)
        </span>
        <EmptyState dm={dm} icon={Icon} text={`Sin pedidos de ${titulo} pendientes.`} />
      </div>
    );
  }
  const focus = list.find(p => p.id === focusId) || list[0];
  const rest = list.filter(p => p.id !== focus.id);
  return (
    <div className="space-y-3">
      <span className={`text-[11px] font-black uppercase tracking-widest px-1 flex items-center gap-1.5 ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>
        <Icon size={13}/> {titulo} ({list.length})
      </span>
      {focus.tipoEnvio === 'moto' ? (
        <MotoPendienteCard key={focus.id} pedido={focus} dm={dm}
          onListo={direccion => onListoMoto(focus, direccion)} onCancel={() => onCancel(focus)} />
      ) : (
        <FocusCard key={focus.id} pedido={focus} dm={dm} eyebrow="Próximo a armar" actionLabel="Listo" requireConfirm
          actionColor="bg-emerald-500 hover:bg-emerald-400"
          onAction={() => onListoUber(focus)} onCancel={() => onCancel(focus)} />
      )}
      <NextRow list={rest} dm={dm} onFocus={onFocus} />
    </div>
  );
}

export default function PedidosPage() {
  const [dm, setDm] = useState(() => localStorage.getItem('028_dark_mode') === 'true');
  const [auth, setAuth] = useState(() => !!localStorage.getItem(AUTH_KEY));
  const [pedidos, setPedidos] = useState([]);
  const [batches, setBatches] = useState([]); // stock real, solo lectura acá (se descuenta al finalizar)
  const [section, setSection] = useState('pendiente'); // 'pendiente' | 'armado' | 'finalizado'
  const [focusPendienteId, setFocusPendienteId] = useState(null);
  const [focusArmadoId, setFocusArmadoId] = useState(null);
  const [expandedFinalizadoId, setExpandedFinalizadoId] = useState(null);
  const [showNewPedidoForm, setShowNewPedidoForm] = useState(false);
  const [newPedidoText, setNewPedidoText] = useState('');
  const [savingPedido, setSavingPedido] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [finalizarTarget, setFinalizarTarget] = useState(null);
  const [finalizarForm, setFinalizarForm] = useState({ tipoCliente: '', medioPago: '', vendedor: '', envioCliente: '', costoEnvio: '', fecha: getTodayDate() });
  // Líneas de producto de la venta que se está por cerrar — arranca con una sola, pero se puede
  // sumar más (a veces se vende más de una marca/producto en el mismo pedido). Cada línea tiene su
  // propio autocompletar de stock, cantidad y precio, independiente de las demás.
  const nuevaLineaProducto = () => ({ uid: Math.random().toString(36).slice(2), producto: '', selectedProductItem: null, unidades: '1', precio: '' });
  const [finalizarItems, setFinalizarItems] = useState(() => [nuevaLineaProducto()]);
  const [savingFinalizar, setSavingFinalizar] = useState(false);
  const [showCancelados, setShowCancelados] = useState(false);
  const [pedidosBorrados, setPedidosBorrados] = useState([]);
  const [showBorrados, setShowBorrados] = useState(false);
  const [borrarEntregadoTarget, setBorrarEntregadoTarget] = useState(null);
  const [borrarEntregadoMotivo, setBorrarEntregadoMotivo] = useState('');
  const [savingBorrarEntregado, setSavingBorrarEntregado] = useState(false);
  // Facturación al finalizar (solo Alias 1 / Alias 2, igual que WhatsApp) — prompt guarda los datos
  // de la venta recién cerrada; step recorre 'preguntar' → 'confirmar' (doble confirmación antes de
  // emitir de verdad) → 'cargando' → 'resultado'.
  const [facturaPrompt, setFacturaPrompt] = useState(null); // { pedidoId, saleIds, monto, emisorId }
  const [facturaStep, setFacturaStep] = useState('preguntar');
  const [facturaResultado, setFacturaResultado] = useState(null);
  const [, setTick] = useState(0);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => { localStorage.setItem('028_dark_mode', dm); }, [dm]);

  // Refresca "hace X min" cada 30s.
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(iv);
  }, []);

  // Escucha siempre, esté o no autenticado, para que los datos ya estén listos al ingresar la clave.
  useEffect(() => {
    const q = query(collection(db, 'pedidos'), orderBy('createdAt', 'desc'));
    return onSnapshot(q,
      snap => setPedidos(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('pedidos:', err)
    );
  }, []);

  // Registro de pedidos "Entregado" que se borraron sin cargar la venta — colección aparte de
  // "pedidos" (esos documentos ya se eliminaron de ahí), así queda un historial que nadie puede
  // borrar sin querer desde acá mismo.
  useEffect(() => {
    const q = query(collection(db, 'pedidos_borrados'), orderBy('borradoAt', 'desc'));
    return onSnapshot(q,
      snap => setPedidosBorrados(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('pedidos_borrados:', err)
    );
  }, []);

  // Stock real (mismos lotes que usa Gestión), para el autocompletar de producto al finalizar.
  useEffect(() => {
    const q = query(collection(db, 'batches'), orderBy('createdAt', 'desc'));
    return onSnapshot(q,
      snap => setBatches(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('batches:', err)
    );
  }, []);

  // Lista plana de "producto + variante" vendibles, una fila por ítem de cada lote.
  const sellableItems = useMemo(() => {
    const out = [];
    for (const b of batches) {
      for (const it of (b.items || [])) {
        if (!it.product) continue;
        if (!it.currentStock || it.currentStock <= 0) continue; // sin stock: no aparece en el buscador
        out.push({
          batchId: b.id,
          batchName: b.name || 'S/N',
          itemId: it.id,
          product: it.product,
          variant: it.variant || '',
          costArs: it.costArs || 0,
          currentStock: it.currentStock || 0,
          label: it.variant ? `${it.product} - ${it.variant}` : it.product,
        });
      }
    }
    return out;
  }, [batches]);

  const pendientes = useMemo(() =>
    pedidos.filter(p => p.estado === 'pendiente').sort((a, b) => safeDateTime(a.createdAt) - safeDateTime(b.createdAt)),
    [pedidos]);
  // Sin clasificar: no arrancó con "moto" ni "uber" — bloquea el flujo normal hasta que se asigne
  // a mano. Clasificados: el resto de la cola, que sí sigue el flujo de foco + siguientes de siempre.
  const pendientesSinClasificar = useMemo(() => pendientes.filter(p => p.tipoEnvio == null), [pendientes]);
  const pendientesClasificados = useMemo(() => pendientes.filter(p => p.tipoEnvio != null), [pendientes]);
  // Mismos clasificados, separados por tipo — se usan solo en la vista de PC para mostrar moto,
  // uber y retiro en bloques separados en vez de mezclados en una sola cola (en celular sigue
  // todo junto).
  const pendientesMoto = useMemo(() => pendientesClasificados.filter(p => p.tipoEnvio === 'moto'), [pendientesClasificados]);
  const pendientesUber = useMemo(() => pendientesClasificados.filter(p => p.tipoEnvio === 'uber'), [pendientesClasificados]);
  const pendientesRetiro = useMemo(() => pendientesClasificados.filter(p => p.tipoEnvio === 'retiro'), [pendientesClasificados]);
  // "Armado" en este tablero principal es el flujo de Uber y Retiro (y pedidos viejos sin
  // tipoEnvio, para no dejar huérfano nada que ya estuviera armado antes de este cambio) — los de
  // moto pasan a manejarse desde la pantalla de Reparto una vez armados, hasta que se entregan.
  const armados = useMemo(() =>
    pedidos.filter(p => p.estado === 'armado' && p.tipoEnvio !== 'moto').sort((a, b) => safeDateTime(a.createdAt) - safeDateTime(b.createdAt)),
    [pedidos]);
  // Entregado: llegó al cliente (lo marcó el motomensajero) pero todavía no se cargó la venta —
  // quedan acá "destacados" hasta que alguien de Gestión los cierra con el mismo formulario de
  // siempre. Los más viejos entregados primero, para no dejar ninguno esperando de más.
  const entregados = useMemo(() =>
    pedidos.filter(p => p.estado === 'entregado').sort((a, b) => safeDateTime(a.entregadoEn) - safeDateTime(b.entregadoEn)),
    [pedidos]);
  const finalizados = useMemo(() =>
    pedidos.filter(p => p.estado === 'finalizado').sort((a, b) => safeDateTime(b.finalizadoAt || b.createdAt) - safeDateTime(a.finalizadoAt || a.createdAt)),
    [pedidos]);
  const cancelados = useMemo(() =>
    pedidos.filter(p => p.estado === 'cancelado').sort((a, b) => safeDateTime(b.canceladoAt || b.createdAt) - safeDateTime(a.canceladoAt || a.createdAt)),
    [pedidos]);

  // Sin clave — esta pantalla (y /pedidos/reparto y /reparto) queda sin login a propósito, la usan
  // Jero/depósito directo desde el celular. El resto del sistema sigue pidiendo clave.

  const handleCrear = async () => {
    const mensaje = newPedidoText.trim();
    if (!mensaje) return;
    setSavingPedido(true);
    try {
      await addDoc(collection(db, 'pedidos'), { mensaje, estado: 'pendiente', tipoEnvio: parseTipoEnvio(mensaje), createdAt: new Date().toISOString() });
      setNewPedidoText('');
      setShowNewPedidoForm(false);
      showToast('Pedido creado');
    } catch (e) {
      showToast('Error al crear el pedido: ' + e.message, 'error');
    } finally {
      setSavingPedido(false);
    }
  };

  // Clasificación manual de un pedido "Sin clasificar" — nunca se infiere, siempre lo elige alguien.
  const handleClasificar = async (pedido, tipo) => {
    try {
      await updateDoc(doc(db, 'pedidos', pedido.id), { tipoEnvio: tipo });
    } catch (e) {
      showToast('Error al clasificar: ' + e.message, 'error');
    }
  };

  const handleMarcarArmado = async (pedido) => {
    try {
      await updateDoc(doc(db, 'pedidos', pedido.id), { estado: 'armado', armadoAt: new Date().toISOString() });
      setFocusPendienteId(null);
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  };

  // Igual que handleMarcarArmado, pero para moto: además de pasar a "armado", guarda la dirección
  // recién cargada (dirección + referencias + zona) — con eso el pedido ya puede entrar al
  // recorrido de reparto en la pantalla de Reparto.
  const handleMarcarArmadoMoto = async (pedido, direccion) => {
    try {
      await updateDoc(doc(db, 'pedidos', pedido.id), {
        estado: 'armado',
        armadoAt: new Date().toISOString(),
        direccion,
      });
      setFocusPendienteId(null);
      showToast('Pedido armado, ya entra al recorrido de reparto');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  };

  const handleConfirmarCancelar = async () => {
    if (!cancelTarget) return;
    try {
      await updateDoc(doc(db, 'pedidos', cancelTarget.id), {
        estado: 'cancelado',
        motivoCancelacion: cancelMotivo.trim() || null,
        canceladoAt: new Date().toISOString(),
      });
      setCancelTarget(null);
      setCancelMotivo('');
      setFocusPendienteId(null);
      setFocusArmadoId(null);
      showToast('Pedido cancelado');
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  };

  // Borra el registro del pedido de Firestore para siempre (solo se usa desde el historial de
  // Cancelados o desde Finalizado, para limpiar pruebas — no toca stock, ventas ni billeteras,
  // eso ya quedó hecho cuando se finalizó/canceló; esto solo borra el registro del pedido en sí).
  const handleEliminarPedido = async (pedido) => {
    if (!window.confirm('¿Borrar este pedido para siempre? No se puede deshacer.')) return;
    try {
      await deleteDoc(doc(db, 'pedidos', pedido.id));
      showToast('Pedido borrado');
    } catch (e) {
      showToast('Error al borrar: ' + e.message, 'error');
    }
  };

  const handleAbrirBorrarEntregado = (pedido) => {
    setBorrarEntregadoMotivo('');
    setBorrarEntregadoTarget(pedido);
  };

  // Borra un pedido de "Entregado" que nunca se va a anotar como venta — a diferencia de
  // handleEliminarPedido (borrado silencioso, sin rastro, para limpiar pruebas), acá SIEMPRE queda
  // una copia completa en pedidos_borrados antes de borrar el original, con motivo y quién lo pidió
  // implícito por quedar guardado. Ese registro no tiene forma de borrarse desde la app.
  const handleConfirmarBorrarEntregado = async () => {
    if (!borrarEntregadoTarget || savingBorrarEntregado) return;
    setSavingBorrarEntregado(true);
    try {
      const { id, ...datosPedido } = borrarEntregadoTarget;
      await addDoc(collection(db, 'pedidos_borrados'), {
        ...datosPedido,
        pedidoIdOriginal: id,
        motivoBorrado: borrarEntregadoMotivo.trim() || null,
        borradoAt: new Date().toISOString(),
      });
      await deleteDoc(doc(db, 'pedidos', id));
      setBorrarEntregadoTarget(null);
      setBorrarEntregadoMotivo('');
      setFocusArmadoId(null);
      showToast('Pedido borrado — queda anotado en el registro de borrados');
    } catch (e) {
      showToast('Error al borrar: ' + e.message, 'error');
    } finally {
      setSavingBorrarEntregado(false);
    }
  };

  const handleAbrirFinalizar = (pedido) => {
    setFinalizarForm({ tipoCliente: '', medioPago: '', vendedor: '', envioCliente: '', costoEnvio: '', fecha: getTodayDate() });
    setFinalizarItems([nuevaLineaProducto()]);
    setFinalizarTarget(pedido);
  };

  const actualizarFinalizarItem = (uid, patch) => setFinalizarItems(items => items.map(it => it.uid === uid ? { ...it, ...patch } : it));
  const agregarFinalizarItem = () => setFinalizarItems(items => [...items, nuevaLineaProducto()]);
  const quitarFinalizarItem = (uid) => setFinalizarItems(items => items.length > 1 ? items.filter(it => it.uid !== uid) : items);

  // Cantidad total pedida por itemId de stock, sumando TODAS las líneas — así si el mismo producto
  // queda repartido en dos líneas (o alguien lo carga dos veces sin querer), la validación de stock
  // es sobre el total real que se va a descontar, no por línea aislada.
  const finalizarQtyPorItemId = useMemo(() => {
    const m = {};
    for (const it of finalizarItems) {
      if (!it.selectedProductItem) continue;
      const id = it.selectedProductItem.itemId;
      m[id] = (m[id] || 0) + (parseInt(it.unidades) || 0);
    }
    return m;
  }, [finalizarItems]);

  const finalizarItemEsValido = (it) => {
    const qty = parseInt(it.unidades) || 0;
    if (!it.selectedProductItem || qty <= 0 || it.precio === '') return false;
    return (finalizarQtyPorItemId[it.selectedProductItem.itemId] || 0) <= it.selectedProductItem.currentStock;
  };
  const finalizarTotalGeneral = finalizarItems.reduce((sum, it) => sum + (parseFloat(it.precio) || 0) * (parseInt(it.unidades) || 0), 0);
  const finalizarValido = finalizarForm.tipoCliente && finalizarForm.medioPago && finalizarForm.vendedor && finalizarForm.fecha &&
    finalizarItems.length > 0 && finalizarItems.every(finalizarItemEsValido);

  // Al finalizar no solo se cierra el pedido: se anota como venta real (mismo efecto que cargarla
  // a mano en Ventas) — descuenta stock del lote y, si el medio de pago es un alias, acredita la
  // billetera correspondiente, igual que hace el resto del sistema. Ahora puede haber más de un
  // producto: se crea una venta por línea (todas con el mismo ticketId, para que quede agrupado
  // como un solo pedido en Ventas) y se descuenta cada lote una sola vez al final, acumulando los
  // descuentos localmente por si dos líneas tocan el mismo lote.
  const handleConfirmarFinalizar = async () => {
    if (!finalizarTarget || !finalizarValido || savingFinalizar) return;
    setSavingFinalizar(true);
    try {
      const shippingCostArs = finalizarForm.costoEnvio !== '' ? (parseFloat(finalizarForm.costoEnvio) || 0) : 0;
      const clientShippingCharge = finalizarForm.envioCliente !== '' ? (parseFloat(finalizarForm.envioCliente) || 0) : 0;
      const shippingProfit = (clientShippingCharge && shippingCostArs) ? (clientShippingCharge - shippingCostArs) : 0;
      const isReseller = finalizarForm.tipoCliente === 'Revendedor';
      const nowIso = new Date().toISOString();
      // Fecha de la venta (para los reportes): la que se eligió en el formulario, no necesariamente
      // hoy. Se guarda con la hora actual para no romper el orden dentro del día — mismo criterio
      // que usa Gestión al cargar una venta a mano.
      const [fechaY, fechaM, fechaD] = (finalizarForm.fecha || getTodayDate()).split('-').map(Number);
      const dateStr = new Date(fechaY, fechaM - 1, fechaD, new Date().getHours(), new Date().getMinutes()).toISOString();
      const ticketId = `PED-${Date.now()}`;

      let totalSaleRawGeneral = 0;
      const ventaItems = [];
      const batchesLocal = {}; // batchId -> copia de trabajo de items, para acumular descuentos

      for (const it of finalizarItems) {
        const qty = parseInt(it.unidades) || 0;
        const unitPrice = parseFloat(it.precio) || 0;
        const totalSaleRaw = unitPrice * qty;
        totalSaleRawGeneral += totalSaleRaw;

        // 1) Venta real de esta línea
        const saleRef = await addDoc(collection(db, 'sales'), {
          batchId: it.selectedProductItem.batchId,
          batchName: it.selectedProductItem.batchName,
          itemId: it.selectedProductItem.itemId,
          productName: it.selectedProductItem.product,
          variant: it.selectedProductItem.variant,
          quantity: qty,
          unitPrice,
          totalSaleRaw,
          costArsAtSale: it.selectedProductItem.costArs || 0,
          shippingCostArs,
          clientShippingCharge,
          shippingProfit,
          medioPago: finalizarForm.medioPago,
          source: 'Pedidos',
          operationType: isReseller ? 'MAYORISTA' : 'VENTA',
          isReseller,
          isNewClient: finalizarForm.tipoCliente,
          clientName: '',
          ticketId,
          isFalla: false,
          failedValue: 0,
          isRobo: false,
          stolenValue: 0,
          seller: finalizarForm.vendedor,
          createdAt: nowIso,
          date: dateStr,
        });

        // 2) Descuento de stock, acumulado en la copia local del lote (todavía no se escribe)
        const batchId = it.selectedProductItem.batchId;
        if (!batchesLocal[batchId]) {
          const batchActual = batches.find(b => b.id === batchId);
          batchesLocal[batchId] = batchActual ? [...(batchActual.items || [])] : null;
        }
        if (batchesLocal[batchId]) {
          batchesLocal[batchId] = batchesLocal[batchId].map(x =>
            x.id === it.selectedProductItem.itemId ? { ...x, currentStock: Math.max(0, (x.currentStock || 0) - qty) } : x
          );
        }

        ventaItems.push({ producto: it.selectedProductItem.label, unidades: qty, precio: unitPrice, saleId: saleRef.id });
      }

      // Recién acá se escribe cada lote tocado, una sola vez, con todos sus descuentos ya aplicados.
      for (const [batchId, items] of Object.entries(batchesLocal)) {
        if (items) await updateDoc(doc(db, 'batches', batchId), { items });
      }

      // 3) Billetera (solo alias1-4). Cuenta Recaudadora (alias4) es la única a la que nunca se le
      // resta nada: entra la plata de la venta tal cual, más lo que se cobró de envío COMPLETO (no
      // la ganancia neta del envío como en las demás billeteras).
      const aliasWalletMap = { alias1: 'GALICIA', alias2: 'GALICIA_GIECO', alias3: 'MERCADO_PAGO', alias4: 'CUENTA_RECAUDADORA' };
      const wName = aliasWalletMap[finalizarForm.medioPago];
      if (wName) {
        const wAmount = totalSaleRawGeneral + (finalizarForm.medioPago === 'alias4' ? clientShippingCharge : Math.max(0, shippingProfit));
        const walletsRef = doc(db, 'settings', 'wallets');
        await runTransaction(db, async (t) => {
          const wSnap = await t.get(walletsRef);
          const current = wSnap.exists() ? (wSnap.data()[wName] || 0) : 0;
          t.set(walletsRef, { [wName]: current + wAmount }, { merge: true });
        });
      }

      // 4) Cierre del pedido, con referencia a las ventas recién creadas
      const pedidoIdCerrado = finalizarTarget.id;
      await updateDoc(doc(db, 'pedidos', pedidoIdCerrado), {
        estado: 'finalizado',
        finalizadoAt: nowIso,
        venta: {
          tipoCliente: finalizarForm.tipoCliente,
          items: ventaItems,
          medioPago: finalizarForm.medioPago,
          vendedor: finalizarForm.vendedor,
          envioCliente: clientShippingCharge || null,
          costoEnvio: shippingCostArs || null,
        },
      });

      setFinalizarTarget(null);
      setFinalizarItems([nuevaLineaProducto()]);
      setFocusArmadoId(null);

      // Igual que por WhatsApp: con Alias 1 o Alias 2 (los únicos con emisor dado de alta en ARCA)
      // se pregunta si se factura la venta. Con cualquier otro medio de pago no se pregunta nada.
      if (finalizarForm.medioPago === 'alias1' || finalizarForm.medioPago === 'alias2') {
        setFacturaStep('preguntar');
        setFacturaResultado(null);
        setFacturaPrompt({
          pedidoId: pedidoIdCerrado,
          saleIds: ventaItems.map(it => it.saleId),
          monto: totalSaleRawGeneral + clientShippingCharge,
          emisorId: finalizarForm.medioPago,
        });
      } else {
        showToast('Pedido finalizado y venta registrada');
      }
    } catch (e) {
      showToast('Error al finalizar: ' + e.message, 'error');
    } finally {
      setSavingFinalizar(false);
    }
  };

  // El pedido ya quedó finalizado antes de llegar a este cartel — declinar factura solo deja
  // asentado en cada venta que se decidió no facturarla, mismo campo que usa el flujo de WhatsApp.
  const handleFacturaNo = async () => {
    const p = facturaPrompt;
    if (!p) return;
    try {
      await Promise.all(p.saleIds.map(id => updateDoc(doc(db, 'sales', id), { invoiceStatus: 'sin_factura' })));
    } catch { /* no bloquea el cierre: la venta ya está registrada igual */ }
    setFacturaPrompt(null);
    showToast('Pedido finalizado y venta registrada');
  };

  const handleFacturaSiPrimero = () => setFacturaStep('confirmar');
  const handleFacturaVolver = () => setFacturaStep('preguntar');

  // Recién acá se llama de verdad a ARCA — después de las dos confirmaciones.
  const handleFacturaConfirmarEmision = async () => {
    const p = facturaPrompt;
    if (!p) return;
    setFacturaStep('cargando');
    try {
      const res = await fetch(FACTURA_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Factura-Key': FACTURA_WEB_KEY },
        body: JSON.stringify({ saleIds: p.saleIds, monto: p.monto, emisorId: p.emisorId }),
      });
      const data = await res.json();
      if (data.ok) {
        await updateDoc(doc(db, 'pedidos', p.pedidoId), {
          'venta.factura': { cae: data.cae, nroComprobante: data.nroComprobante, vencimientoCAE: data.vencimientoCAE },
        }).catch(() => {});
      }
      setFacturaResultado(data);
    } catch (e) {
      setFacturaResultado({ ok: false, error: 'No se pudo conectar con el servidor: ' + e.message });
    } finally {
      setFacturaStep('resultado');
    }
  };

  const handleFacturaCerrar = () => {
    setFacturaPrompt(null);
    setFacturaStep('preguntar');
    setFacturaResultado(null);
    showToast('Pedido finalizado y venta registrada');
  };

  // En celular, hoja que sube desde abajo (patrón táctil de siempre). En PC (lg+) esa misma hoja
  // pegada al borde inferior de una pantalla ancha se ve rota — pasa a ser un diálogo centrado,
  // con todas las esquinas redondeadas y un ancho acotado en vez de ocupar todo el borde.
  // sheetShellClassWide es para los modales con más contenido (formulario de finalizar, historial
  // de cancelados), que aprovechan un poco más de ancho en PC.
  const sheetShellBase = `w-full rounded-t-3xl lg:rounded-3xl border-t lg:border overflow-hidden max-h-[92vh] lg:max-h-[85vh] flex flex-col animate-in fade-in slide-in-from-bottom-4 lg:slide-in-from-bottom-0 lg:zoom-in-95 duration-200 ${dm ? 'border-white/[0.08]' : 'bg-white border-zinc-200'}`;
  const sheetShellClass = `${sheetShellBase} lg:max-w-lg lg:shadow-2xl`;
  const sheetShellClassWide = `${sheetShellBase} lg:max-w-2xl lg:shadow-2xl`;
  const sheetShellStyle = dm ? { background: 'linear-gradient(150deg,#111,#1a1a1a)', boxShadow: '0 -8px 60px rgba(0,0,0,0.6)' } : { boxShadow: '0 -8px 60px rgba(0,0,0,0.15)' };
  const sheetOverlayClass = 'fixed inset-0 z-[200] flex items-end lg:items-center justify-center lg:p-6 animate-in fade-in duration-200';
  const sheetHandle = (
    <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0 lg:hidden">
      <div className={`w-10 h-1 rounded-full ${dm ? 'bg-white/15' : 'bg-zinc-300'}`}/>
    </div>
  );

  return (
    <div className={`min-h-screen ${dm ? 'bg-[#050505] text-zinc-100' : 'bg-slate-50 text-zinc-900'}`}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header — sin ningún link de vuelta a Gestión, esta página es autocontenida */}
      <div className={`sticky top-0 z-20 border-b backdrop-blur-xl ${dm ? 'bg-[#101010]/90 border-white/[0.06]' : 'bg-white/90 border-zinc-200'}`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-lg mx-auto px-4 lg:max-w-none lg:mx-0 lg:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#6366f1' }}>
              <ClipboardList size={16} className="text-white" />
            </div>
            <p className="font-black text-sm tracking-tight truncate">Pedidos</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* En PC no hay FAB flotante (eso es un patrón táctil de celular) — el botón de nuevo
                pedido vive acá, en el header, junto al resto de las acciones. */}
            <button onClick={() => setShowNewPedidoForm(true)}
              className="hidden lg:flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90 active:scale-[0.97] mr-1"
              style={{ background: '#6366f1' }}>
              <Plus size={15}/> Nuevo pedido
            </button>
            <Link to="/pedidos/reparto" className={`p-2.5 rounded-lg transition-colors ${dm ? 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06]' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`} title="Reparto en moto">
              <Bike size={17}/>
            </Link>
            <button onClick={() => setShowCancelados(true)} className={`p-2.5 rounded-lg transition-colors relative ${dm ? 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06]' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`} title="Cancelados">
              <History size={17}/>
            </button>
            <button onClick={() => setShowBorrados(true)} className={`p-2.5 rounded-lg transition-colors relative ${dm ? 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06]' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`} title="Registro de borrados">
              <Archive size={17}/>
            </button>
            <button onClick={() => setDm(v => !v)} className={`p-2.5 rounded-lg transition-colors ${dm ? 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06]' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}>
              {dm ? <Sun size={17}/> : <Moon size={17}/>}
            </button>
            <button onClick={() => { localStorage.removeItem(AUTH_KEY); setAuth(false); }} className={`p-2.5 rounded-lg transition-colors ${dm ? 'text-zinc-600 hover:text-red-400 hover:bg-red-500/10' : 'text-zinc-400 hover:text-red-500 hover:bg-red-50'}`} title="Salir">
              <LogOut size={17}/>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 lg:max-w-none lg:mx-0 lg:px-6 py-4 space-y-4" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>

        {/* Selector de sección */}
        <div className={`flex gap-1.5 p-1 rounded-xl overflow-x-auto scrollbar-none ${dm ? 'bg-zinc-900/60' : 'bg-zinc-100'}`}>
          {[
            { key: 'pendiente', label: 'Pendiente', count: pendientes.length },
            { key: 'armado', label: 'Armado', count: armados.length },
            { key: 'entregado', label: 'Entregado', count: entregados.length },
            { key: 'finalizado', label: 'Finalizado', count: finalizados.length },
          ].map(s => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={`flex-1 h-11 rounded-lg text-xs font-bold transition-all active:scale-[0.97] whitespace-nowrap px-2 ${section === s.key ? (dm ? 'bg-white/[0.1] text-zinc-100' : 'bg-white text-zinc-900 shadow-sm') : `text-zinc-500 ${dm ? 'lg:hover:text-zinc-300' : 'lg:hover:text-zinc-700'}`}`}>
              {s.label}{s.count > 0 ? ` (${s.count})` : ''}
            </button>
          ))}
        </div>

        {/* PENDIENTE: primero lo sin clasificar (bloquea todo lo demás), después el más viejo ya
            clasificado en foco grande + fila con el resto. Moto usa la tarjeta con dirección. */}
        {section === 'pendiente' && (
          <>
            <SinClasificarSection list={pendientesSinClasificar} dm={dm} onClasificar={handleClasificar} />

            {/* Celular: una sola cola mezclada, como siempre. */}
            <div className="lg:hidden">
              {pendientesClasificados.length === 0
                ? (pendientesSinClasificar.length === 0 && <EmptyState dm={dm} icon={PartyPopper} text="No hay pedidos pendientes." />)
                : (() => {
                    const focus = pendientesClasificados.find(p => p.id === focusPendienteId) || pendientesClasificados[0];
                    const rest = pendientesClasificados.filter(p => p.id !== focus.id);
                    return (
                      <>
                        {focus.tipoEnvio === 'moto' ? (
                          <MotoPendienteCard key={focus.id} pedido={focus} dm={dm}
                            onListo={direccion => handleMarcarArmadoMoto(focus, direccion)} onCancel={() => setCancelTarget(focus)} />
                        ) : (
                          <FocusCard key={focus.id} pedido={focus} dm={dm} eyebrow="Próximo a armar" actionLabel="Listo" requireConfirm
                            actionColor="bg-emerald-500 hover:bg-emerald-400"
                            onAction={() => handleMarcarArmado(focus)} onCancel={() => setCancelTarget(focus)} />
                        )}
                        <NextRow list={rest} dm={dm} onFocus={setFocusPendienteId} />
                      </>
                    );
                  })()}
            </div>

            {/* PC: moto, uber y retiro cada uno en su propia columna. */}
            <div className="hidden lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
              {/* Las 3 columnas quedan siempre visibles, aunque las 3 estén vacías — nunca se
                  reemplazan por un cartel único de "no hay pedidos". */}
              <PendienteGrupo titulo="Moto" icon={Bike} list={pendientesMoto} dm={dm}
                focusId={focusPendienteId} onFocus={setFocusPendienteId}
                onListoMoto={(p, direccion) => handleMarcarArmadoMoto(p, direccion)}
                onListoUber={handleMarcarArmado} onCancel={setCancelTarget} />
              <PendienteGrupo titulo="Uber" icon={Car} list={pendientesUber} dm={dm}
                focusId={focusPendienteId} onFocus={setFocusPendienteId}
                onListoMoto={(p, direccion) => handleMarcarArmadoMoto(p, direccion)}
                onListoUber={handleMarcarArmado} onCancel={setCancelTarget} />
              <PendienteGrupo titulo="Retiro" icon={Store} list={pendientesRetiro} dm={dm}
                focusId={focusPendienteId} onFocus={setFocusPendienteId}
                onListoMoto={(p, direccion) => handleMarcarArmadoMoto(p, direccion)}
                onListoUber={handleMarcarArmado} onCancel={setCancelTarget} />
            </div>
          </>
        )}

        {/* ARMADO: mismo patrón, acción = Finalizar. Solo Uber (y pedidos viejos sin tipoEnvio) —
            los de moto armados se manejan desde /pedidos/reparto hasta que se entregan. */}
        {section === 'armado' && (
          armados.length === 0
            ? <EmptyState dm={dm} icon={PartyPopper} text="No hay pedidos armados esperando." />
            : (() => {
                const focus = armados.find(p => p.id === focusArmadoId) || armados[0];
                const rest = armados.filter(p => p.id !== focus.id);
                return (
                  <div className="lg:flex lg:items-start lg:gap-6">
                    <div className="lg:w-[560px] lg:flex-shrink-0">
                      <FocusCard key={focus.id} pedido={focus} dm={dm} eyebrow="Próximo a finalizar" actionLabel="Finalizar"
                        actionColor="bg-[#6366f1] hover:bg-[#2563eb]"
                        onAction={() => handleAbrirFinalizar(focus)} onCancel={() => setCancelTarget(focus)} />
                    </div>
                    <div className="lg:flex-1 mt-4 lg:mt-0">
                      <NextRow list={rest} dm={dm} onFocus={setFocusArmadoId} />
                    </div>
                  </div>
                );
              })()
        )}

        {/* ENTREGADO: llegó al cliente (lo marcó Norman) pero falta cargar la venta — mismo
            formulario de cierre de siempre, sin opción de cancelar (ya se entregó). */}
        {section === 'entregado' && (
          entregados.length === 0
            ? <EmptyState dm={dm} icon={PackageCheck} text="No hay entregas esperando que se cargue la venta." />
            : (() => {
                const focus = entregados.find(p => p.id === focusArmadoId) || entregados[0];
                const rest = entregados.filter(p => p.id !== focus.id);
                return (
                  <div className="lg:flex lg:items-start lg:gap-6">
                    <div className="lg:w-[560px] lg:flex-shrink-0">
                      <FocusCard key={focus.id} pedido={focus} dm={dm} eyebrow="Entregado · falta cargar la venta" actionLabel="Cargar venta"
                        actionColor="bg-emerald-500 hover:bg-emerald-400" hideCancel
                        onAction={() => handleAbrirFinalizar(focus)}
                        extraAction={{ label: 'Borrar (queda registrado)', onClick: () => handleAbrirBorrarEntregado(focus) }} />
                    </div>
                    <div className="lg:flex-1 mt-4 lg:mt-0">
                      <NextRow list={rest} dm={dm} onFocus={setFocusArmadoId} />
                    </div>
                  </div>
                );
              })()
        )}

        {/* FINALIZADO: sin acciones, lista compacta con detalle plegable */}
        {section === 'finalizado' && (
          finalizados.length === 0
            ? <EmptyState dm={dm} icon={ClipboardList} text="Todavía no finalizaste ningún pedido." />
            : (
              <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3 lg:items-start">
                {finalizados.map(p => {
                  const isExpanded = expandedFinalizadoId === p.id;
                  return (
                    <div key={p.id} className={`rounded-2xl border p-4 transition-colors ${dm ? 'bg-[#141414] border-white/[0.07] lg:hover:border-white/[0.14]' : 'bg-white border-zinc-200 lg:hover:border-zinc-300'}`}>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className={`text-xs font-bold flex items-center gap-1.5 ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>
                          <Clock size={12}/>{timeAgoStr(p.createdAt)}
                        </div>
                        <button onClick={() => handleEliminarPedido(p)} title="Borrar para siempre"
                          className={`p-1.5 rounded-lg transition-colors active:scale-90 ${dm ? 'text-zinc-600 hover:text-red-400 hover:bg-red-500/10' : 'text-zinc-400 hover:text-red-500 hover:bg-red-50'}`}>
                          <Trash2 size={14}/>
                        </button>
                      </div>
                      <p className={`text-base leading-snug whitespace-pre-wrap font-semibold ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>{p.mensaje}</p>
                      <button onClick={() => setExpandedFinalizadoId(isExpanded ? null : p.id)}
                        className={`flex items-center gap-1 text-xs font-bold mt-2 py-1 ${dm ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-700'}`}>
                        {isExpanded ? 'Ver menos' : 'Ver datos de la venta'} {isExpanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                      </button>
                      {isExpanded && p.venta && (
                        <div className={`mt-2 rounded-xl border p-3.5 text-sm space-y-2 ${dm ? 'border-white/[0.07] bg-white/[0.02]' : 'border-zinc-200 bg-zinc-50'}`}>
                          <div className="flex justify-between gap-3"><span className="opacity-60">Tipo de cliente</span><span className="font-bold text-right">{PEDIDO_TIPO_CLIENTE_LABELS[p.venta.tipoCliente] || p.venta.tipoCliente}</span></div>
                          {/* venta.items = varios productos (formato nuevo); si no está, es un pedido
                              viejo con un solo producto guardado directo en venta.producto/unidades/precio. */}
                          {(p.venta.items || [{ producto: p.venta.producto, unidades: p.venta.unidades, precio: p.venta.precio }]).map((it, idx) => (
                            <div key={idx} className={idx > 0 ? `pt-2 mt-1 border-t space-y-2 ${dm ? 'border-white/[0.06]' : 'border-zinc-200'}` : 'space-y-2'}>
                              <div className="flex justify-between gap-3"><span className="opacity-60">Producto</span><span className="font-bold text-right">{it.producto}</span></div>
                              {it.unidades != null && <div className="flex justify-between gap-3"><span className="opacity-60">Unidades</span><span className="font-bold">{it.unidades}</span></div>}
                              <div className="flex justify-between gap-3"><span className="opacity-60">{it.unidades != null ? 'Precio unitario' : 'Precio'}</span><span className="font-bold">{formatMoney(it.precio)}</span></div>
                              {it.unidades != null && <div className="flex justify-between gap-3"><span className="opacity-60">Total</span><span className="font-bold">{formatMoney(it.precio * it.unidades)}</span></div>}
                            </div>
                          ))}
                          {p.venta.items && p.venta.items.length > 1 && (
                            <div className={`flex justify-between gap-3 pt-2 mt-1 border-t ${dm ? 'border-white/[0.06]' : 'border-zinc-200'}`}>
                              <span className="opacity-60">Total general</span>
                              <span className="font-bold">{formatMoney(p.venta.items.reduce((s, it) => s + (it.precio || 0) * (it.unidades || 1), 0))}</span>
                            </div>
                          )}
                          <div className="flex justify-between gap-3"><span className="opacity-60">Medio de pago</span><span className="font-bold">{PAYMENT_METHOD_LABELS[p.venta.medioPago] || p.venta.medioPago}</span></div>
                          {p.venta.vendedor && <div className="flex justify-between gap-3"><span className="opacity-60">Vendedor</span><span className="font-bold">{p.venta.vendedor}</span></div>}
                          {p.venta.envioCliente != null && <div className="flex justify-between gap-3"><span className="opacity-60">Envío cobrado</span><span className="font-bold">{formatMoney(p.venta.envioCliente)}</span></div>}
                          {p.venta.costoEnvio != null && <div className="flex justify-between gap-3"><span className="opacity-60">Costo envío</span><span className="font-bold">{formatMoney(p.venta.costoEnvio)}</span></div>}
                          <div className={`flex justify-between gap-3 pt-2 mt-1 border-t ${dm ? 'border-white/[0.06]' : 'border-zinc-200'}`}><span className="opacity-60">Finalizado</span><span className="font-bold">{safeDateStr(p.finalizadoAt, { day: '2-digit', month: 'short' })} · {safeTimeStr(p.finalizadoAt)}</span></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
        )}
      </div>

      {/* FAB nuevo pedido: fijo abajo a la derecha, al alcance del pulgar — solo en celular, en PC
          ese botón ya vive en el header (patrón de escritorio, no un FAB flotante). */}
      <button onClick={() => setShowNewPedidoForm(true)}
        className="lg:hidden fixed right-4 z-30 w-16 h-16 rounded-full bg-[#6366f1] hover:bg-[#2563eb] text-white shadow-2xl shadow-indigo-600/40 flex items-center justify-center transition-all active:scale-90"
        style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }} title="Nuevo pedido" aria-label="Nuevo pedido">
        <Plus size={28}/>
      </button>

      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 z-50 border max-w-[90vw] ${toast.type === 'error' ? 'bg-red-600/95 border-red-500 text-white' : 'bg-zinc-900/95 border-white/10 text-white'}`}>
          {toast.type === 'error' ? <XCircle size={16}/> : <CheckCircle size={16} className="text-emerald-400"/>}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Modal: nuevo pedido */}
      {showNewPedidoForm && (
        <div className={sheetOverlayClass}
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
          onClick={() => { setShowNewPedidoForm(false); setNewPedidoText(''); }}>
          <div onClick={e => e.stopPropagation()} className={sheetShellClass} style={sheetShellStyle}>
            {sheetHandle}
            <div className={`px-5 pb-4 border-b flex-shrink-0 ${dm ? 'border-white/[0.06]' : 'border-zinc-100'}`}>
              <h3 className={`font-bold text-base ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>Nuevo pedido</h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">Escribí el mensaje tal cual como llegó</p>
            </div>
            <div className="p-5 overflow-y-auto custom-scrollbar">
              <textarea
                autoFocus
                value={newPedidoText}
                onChange={e => setNewPedidoText(e.target.value)}
                placeholder="Pegá o escribí acá el mensaje del pedido..."
                className={`w-full min-h-[45vh] rounded-xl border p-3.5 text-base outline-none resize-y leading-relaxed ${dm ? 'bg-zinc-800/50 border-zinc-700/40 text-zinc-100 placeholder-zinc-600 focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/10' : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-300/10'}`}
              />
            </div>
            <div className="p-5 pt-3 border-t flex-shrink-0 flex flex-col lg:flex-row-reverse gap-2" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
              <button onClick={handleCrear} disabled={!newPedidoText.trim() || savingPedido}
                className="w-full lg:w-auto lg:px-8 h-14 rounded-xl font-black text-base bg-[#6366f1] hover:bg-[#2563eb] disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                <Save size={18}/> Guardar pedido
              </button>
              <button onClick={() => { setShowNewPedidoForm(false); setNewPedidoText(''); }}
                className={`w-full lg:w-auto lg:px-6 h-11 lg:h-14 rounded-xl font-bold text-sm transition-all ${dm ? 'text-zinc-400 hover:text-zinc-200 lg:hover:bg-white/[0.06]' : 'text-zinc-500 hover:text-zinc-700 lg:hover:bg-zinc-100'}`}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: motivo de cancelación */}
      {cancelTarget && (
        <div className={sheetOverlayClass}
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
          onClick={() => { setCancelTarget(null); setCancelMotivo(''); }}>
          <div onClick={e => e.stopPropagation()} className={sheetShellClass} style={sheetShellStyle}>
            {sheetHandle}
            <div className={`px-5 pb-4 border-b flex-shrink-0 ${dm ? 'border-white/[0.06]' : 'border-zinc-100'}`}>
              <h3 className={`font-bold text-base ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>Cancelar pedido</h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">Contame por qué se cancela</p>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
              <p className={`text-sm rounded-xl border p-3 whitespace-pre-wrap ${dm ? 'border-white/[0.07] bg-white/[0.02] text-zinc-300' : 'border-zinc-200 bg-zinc-50 text-zinc-700'}`}>
                {cancelTarget.mensaje}
              </p>
              <div className="flex flex-col gap-1.5">
                <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Motivo (opcional)</label>
                <input
                  autoFocus
                  value={cancelMotivo}
                  onChange={e => setCancelMotivo(e.target.value)}
                  placeholder="Ej: el cliente se arrepintió"
                  className={`h-12 border rounded-xl px-3.5 w-full text-base outline-none transition-all ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100 placeholder-zinc-600 focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white border-zinc-200 text-zinc-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'}`}
                />
              </div>
            </div>
            <div className="p-5 pt-3 border-t flex-shrink-0 flex flex-col lg:flex-row-reverse gap-2" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
              <button onClick={handleConfirmarCancelar}
                className="w-full lg:w-auto lg:px-8 h-14 rounded-xl font-black text-base bg-red-500 hover:bg-red-400 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                <XCircle size={18}/> Confirmar cancelación
              </button>
              <button onClick={() => { setCancelTarget(null); setCancelMotivo(''); }}
                className={`w-full lg:w-auto lg:px-6 h-11 lg:h-14 rounded-xl font-bold text-sm transition-all ${dm ? 'text-zinc-400 hover:text-zinc-200 lg:hover:bg-white/[0.06]' : 'text-zinc-500 hover:text-zinc-700 lg:hover:bg-zinc-100'}`}>
                Volver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: borrar un pedido de Entregado (deja registro en pedidos_borrados) */}
      {borrarEntregadoTarget && (
        <div className={sheetOverlayClass}
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
          onClick={() => { if (!savingBorrarEntregado) { setBorrarEntregadoTarget(null); setBorrarEntregadoMotivo(''); } }}>
          <div onClick={e => e.stopPropagation()} className={sheetShellClass} style={sheetShellStyle}>
            {sheetHandle}
            <div className={`px-5 pb-4 border-b flex-shrink-0 ${dm ? 'border-white/[0.06]' : 'border-zinc-100'}`}>
              <h3 className={`font-bold text-base ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>Borrar pedido entregado</h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">No se va a cargar la venta — queda anotado en el registro de borrados, no se puede deshacer</p>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
              <p className={`text-sm rounded-xl border p-3 whitespace-pre-wrap ${dm ? 'border-white/[0.07] bg-white/[0.02] text-zinc-300' : 'border-zinc-200 bg-zinc-50 text-zinc-700'}`}>
                {borrarEntregadoTarget.mensaje}
              </p>
              <div className="flex flex-col gap-1.5">
                <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Motivo (opcional)</label>
                <input
                  autoFocus
                  value={borrarEntregadoMotivo}
                  onChange={e => setBorrarEntregadoMotivo(e.target.value)}
                  placeholder="Ej: pedido duplicado, error de carga..."
                  className={`h-12 border rounded-xl px-3.5 w-full text-base outline-none transition-all ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100 placeholder-zinc-600 focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white border-zinc-200 text-zinc-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'}`}
                />
              </div>
            </div>
            <div className="p-5 pt-3 border-t flex-shrink-0 flex flex-col lg:flex-row-reverse gap-2" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
              <button onClick={handleConfirmarBorrarEntregado} disabled={savingBorrarEntregado}
                className="w-full lg:w-auto lg:px-8 h-14 rounded-xl font-black text-base bg-red-500 hover:bg-red-400 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                <Trash2 size={18}/> {savingBorrarEntregado ? 'Borrando...' : 'Confirmar borrado'}
              </button>
              <button onClick={() => { setBorrarEntregadoTarget(null); setBorrarEntregadoMotivo(''); }} disabled={savingBorrarEntregado}
                className={`w-full lg:w-auto lg:px-6 h-11 lg:h-14 rounded-xl font-bold text-sm transition-all disabled:opacity-40 ${dm ? 'text-zinc-400 hover:text-zinc-200 lg:hover:bg-white/[0.06]' : 'text-zinc-500 hover:text-zinc-700 lg:hover:bg-zinc-100'}`}>
                Volver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: cierre del pedido (formulario de venta) */}
      {finalizarTarget && (
        <div className={sheetOverlayClass}
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
          onClick={() => { if (!savingFinalizar) { setFinalizarTarget(null); setSelectedProductItem(null); } }}>
          <div onClick={e => e.stopPropagation()} className={sheetShellClassWide} style={sheetShellStyle}>
            {sheetHandle}
            <div className={`px-5 pb-4 border-b flex-shrink-0 ${dm ? 'border-white/[0.06]' : 'border-zinc-100'}`}>
              <h3 className={`font-bold text-base ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>Finalizar pedido</h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">Cargá los datos de la venta para cerrar el pedido</p>
            </div>
            <div className="p-5 space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-x-4 lg:gap-y-4 overflow-y-auto custom-scrollbar">
              <div className="lg:col-span-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Mensaje original del pedido</span>
                <p className={`text-sm rounded-xl border p-3 mt-1.5 whitespace-pre-wrap ${dm ? 'border-white/[0.07] bg-white/[0.02] text-zinc-300' : 'border-zinc-200 bg-zinc-50 text-zinc-700'}`}>
                  {finalizarTarget.mensaje}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Fecha de la venta</label>
                <input type="date" value={finalizarForm.fecha} onChange={e => setFinalizarForm({ ...finalizarForm, fecha: e.target.value })}
                  className={`h-12 border rounded-xl px-3.5 w-full text-base outline-none transition-all ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100 focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white border-zinc-200 text-zinc-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'}`} />
                <p className={`text-[11px] ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>Por defecto es hoy — cambiala solo si la venta es de otro día.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Tipo de cliente</label>
                <div className="relative">
                  <select value={finalizarForm.tipoCliente} onChange={e => setFinalizarForm({ ...finalizarForm, tipoCliente: e.target.value })}
                    className={`h-12 appearance-none w-full border rounded-xl px-3.5 pr-9 text-base outline-none cursor-pointer transition-all ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100 focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white border-zinc-200 text-zinc-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'}`}>
                    {PEDIDO_TIPO_CLIENTE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <ChevronDown size={14} className={dm ? 'text-zinc-500' : 'text-zinc-400'} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Medio de pago</label>
                <div className="relative">
                  <select value={finalizarForm.medioPago} onChange={e => setFinalizarForm({ ...finalizarForm, medioPago: e.target.value })}
                    className={`h-12 appearance-none w-full border rounded-xl px-3.5 pr-9 text-base outline-none cursor-pointer transition-all ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100 focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white border-zinc-200 text-zinc-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'}`}>
                    {PEDIDO_MEDIO_PAGO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <ChevronDown size={14} className={dm ? 'text-zinc-500' : 'text-zinc-400'} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 lg:col-span-2">
                <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Vendedor</label>
                <div className="relative">
                  <select value={finalizarForm.vendedor} onChange={e => setFinalizarForm({ ...finalizarForm, vendedor: e.target.value })}
                    className={`h-12 appearance-none w-full border rounded-xl px-3.5 pr-9 text-base outline-none cursor-pointer transition-all ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100 focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white border-zinc-200 text-zinc-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'}`}>
                    {PEDIDO_VENDEDOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <ChevronDown size={14} className={dm ? 'text-zinc-500' : 'text-zinc-400'} />
                  </div>
                </div>
              </div>

              {/* Productos: una o más líneas — "+ Agregar producto" suma otra cuando el pedido trae
                  más de una marca/producto junto. Cada línea se valida y descuenta stock por separado. */}
              <div className="flex flex-col gap-3 lg:col-span-2">
                {finalizarItems.map((it, idx) => {
                  const unidadesNum = parseInt(it.unidades) || 0;
                  const excedeStock = !!it.selectedProductItem && unidadesNum > 0 &&
                    (finalizarQtyPorItemId[it.selectedProductItem.itemId] || 0) > it.selectedProductItem.currentStock;
                  return (
                    <div key={it.uid} className={`p-3 rounded-xl border space-y-3 ${dm ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-zinc-50 border-zinc-200'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>Producto {finalizarItems.length > 1 ? idx + 1 : ''}</span>
                        {finalizarItems.length > 1 && (
                          <button type="button" onClick={() => quitarFinalizarItem(it.uid)}
                            className={`p-1.5 -m-1 rounded-lg transition-colors active:scale-90 ${dm ? 'text-zinc-600 hover:text-red-400 hover:bg-red-500/10' : 'text-zinc-400 hover:text-red-500 hover:bg-red-50'}`}>
                            <Trash2 size={14}/>
                          </button>
                        )}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Busca en el stock real</label>
                        <ProductAutocomplete
                          dm={dm}
                          items={sellableItems}
                          value={it.producto}
                          selected={it.selectedProductItem}
                          onChange={text => {
                            const exact = sellableItems.find(si => si.label.toLowerCase() === text.trim().toLowerCase());
                            actualizarFinalizarItem(it.uid, { producto: text, selectedProductItem: exact || null });
                          }}
                          onSelect={item => actualizarFinalizarItem(it.uid, { producto: item.label, selectedProductItem: item })}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Unidades</label>
                          <input type="number" inputMode="numeric" min="1" value={it.unidades} onChange={e => actualizarFinalizarItem(it.uid, { unidades: e.target.value })}
                            onWheel={e => e.target.blur()}
                            className={`h-12 border rounded-xl px-3.5 w-full text-base outline-none transition-all ${
                              excedeStock ? 'border-red-500/60' : (dm ? 'border-white/[0.07]' : 'border-zinc-200')
                            } ${dm ? 'bg-[#101010] text-zinc-100 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white text-zinc-900 focus:ring-1 focus:ring-blue-100'}`}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Precio unitario</label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"><span className={`text-base font-medium ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>$</span></div>
                            <input type="number" inputMode="decimal" value={it.precio} onChange={e => actualizarFinalizarItem(it.uid, { precio: e.target.value })}
                              onWheel={e => e.target.blur()}
                              className={`h-12 border rounded-xl pl-8 pr-3.5 w-full text-base outline-none transition-all ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100 focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white border-zinc-200 text-zinc-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'}`}
                            />
                          </div>
                        </div>
                      </div>
                      {excedeStock && (
                        <p className="text-xs font-semibold text-red-400">Solo hay {it.selectedProductItem.currentStock} en stock{finalizarQtyPorItemId[it.selectedProductItem.itemId] !== unidadesNum ? ' (contando lo que ya pediste de esto en otra línea)' : ''}</p>
                      )}
                      {it.precio !== '' && unidadesNum > 0 && (
                        <p className={`text-xs font-semibold ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>Total: {formatMoney((parseFloat(it.precio) || 0) * unidadesNum)}</p>
                      )}
                    </div>
                  );
                })}

                <button type="button" onClick={agregarFinalizarItem}
                  className={`w-full h-11 rounded-xl font-bold text-sm border border-dashed transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 ${dm ? 'border-white/[0.15] text-zinc-400 hover:text-zinc-200 hover:border-white/[0.3]' : 'border-zinc-300 text-zinc-500 hover:text-zinc-700 hover:border-zinc-400'}`}>
                  <Plus size={15}/> Agregar producto
                </button>

                {finalizarItems.length > 1 && (
                  <div className={`flex justify-between items-center px-1 text-sm font-bold ${dm ? 'text-zinc-300' : 'text-zinc-700'}`}>
                    <span className="opacity-60 font-semibold">Total general</span>
                    <span>{formatMoney(finalizarTotalGeneral)}</span>
                  </div>
                )}
              </div>

              <div className={`p-3 rounded-lg border space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:col-span-2 ${dm ? 'bg-[#0D0D0D] border-[#1F1F1F]' : 'bg-zinc-50 border-zinc-200'}`}>
                <div className="flex flex-col gap-1.5">
                  <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Envío cobrado (opcional)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"><span className={`text-base font-medium ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>$</span></div>
                    <input type="number" inputMode="decimal" value={finalizarForm.envioCliente} onChange={e => setFinalizarForm({ ...finalizarForm, envioCliente: e.target.value })}
                      onWheel={e => e.target.blur()}
                      className={`h-12 border rounded-xl pl-8 pr-3.5 w-full text-base outline-none transition-all ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100 focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white border-zinc-200 text-zinc-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'}`}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Costo envío (opcional)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none"><span className={`text-base font-medium ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>$</span></div>
                    <input type="number" inputMode="decimal" value={finalizarForm.costoEnvio} onChange={e => setFinalizarForm({ ...finalizarForm, costoEnvio: e.target.value })}
                      onWheel={e => e.target.blur()}
                      className={`h-12 border rounded-xl pl-8 pr-3.5 w-full text-base outline-none transition-all ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100 focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white border-zinc-200 text-zinc-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'}`}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5 pt-3 border-t flex-shrink-0 flex flex-col lg:flex-row-reverse gap-2" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
              <button onClick={handleConfirmarFinalizar} disabled={!finalizarValido || savingFinalizar}
                className="w-full lg:w-auto lg:px-8 h-14 rounded-xl font-black text-base bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                <CheckCircle size={18}/> {savingFinalizar ? 'Guardando...' : 'Guardar y finalizar'}
              </button>
              <button onClick={() => { setFinalizarTarget(null); setSelectedProductItem(null); }} disabled={savingFinalizar}
                className={`w-full lg:w-auto lg:px-6 h-11 lg:h-14 rounded-xl font-bold text-sm transition-all disabled:opacity-40 ${dm ? 'text-zinc-400 hover:text-zinc-200 lg:hover:bg-white/[0.06]' : 'text-zinc-500 hover:text-zinc-700 lg:hover:bg-zinc-100'}`}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: historial de cancelados */}
      {showCancelados && (
        <div className={sheetOverlayClass}
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
          onClick={() => setShowCancelados(false)}>
          <div onClick={e => e.stopPropagation()} className={`${sheetShellClassWide} max-h-[88vh] lg:max-h-[80vh]`} style={sheetShellStyle}>
            {sheetHandle}
            <div className={`px-5 pb-4 border-b flex items-center justify-between flex-shrink-0 ${dm ? 'border-white/[0.06]' : 'border-zinc-100'}`}>
              <div>
                <h3 className={`font-bold text-base ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>Pedidos cancelados</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">{cancelados.length} en total</p>
              </div>
              <button onClick={() => setShowCancelados(false)} className={`p-2.5 -m-1 rounded-lg transition-all active:scale-90 ${dm ? 'text-zinc-500 hover:text-zinc-200 hover:bg-white/10' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}>
                <XCircle size={20}/>
              </button>
            </div>
            <div className="p-4 space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start overflow-y-auto custom-scrollbar" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              {cancelados.length === 0 && <div className="p-8 text-center text-sm font-medium opacity-40 italic lg:col-span-2">No hay pedidos cancelados.</div>}
              {cancelados.map(p => (
                <div key={p.id} className={`rounded-xl border p-3.5 transition-colors ${dm ? 'border-white/[0.07] bg-white/[0.02] lg:hover:border-white/[0.14]' : 'border-zinc-200 bg-zinc-50 lg:hover:border-zinc-300'}`}>
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <span className="text-[10px] font-bold text-zinc-500">{safeDateStr(p.canceladoAt, { day: '2-digit', month: 'short' })} · {safeTimeStr(p.canceladoAt)}</span>
                    <button onClick={() => handleEliminarPedido(p)} title="Borrar para siempre"
                      className={`p-1.5 -m-1 rounded-lg transition-colors active:scale-90 ${dm ? 'text-zinc-600 hover:text-red-400 hover:bg-red-500/10' : 'text-zinc-400 hover:text-red-500 hover:bg-red-50'}`}>
                      <Trash2 size={14}/>
                    </button>
                  </div>
                  <p className={`text-sm whitespace-pre-wrap ${dm ? 'text-zinc-300' : 'text-zinc-700'}`}>{p.mensaje}</p>
                  <div className={`mt-2 text-xs rounded-lg px-2.5 py-1.5 inline-block ${dm ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'}`}>
                    Motivo: {p.motivoCancelacion || 'Sin especificar'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: registro de pedidos borrados desde Entregado — solo lectura, no hay forma de
          borrar entradas de acá (es justamente el rastro de lo que se borró en otro lado). */}
      {showBorrados && (
        <div className={sheetOverlayClass}
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
          onClick={() => setShowBorrados(false)}>
          <div onClick={e => e.stopPropagation()} className={`${sheetShellClassWide} max-h-[88vh] lg:max-h-[80vh]`} style={sheetShellStyle}>
            {sheetHandle}
            <div className={`px-5 pb-4 border-b flex items-center justify-between flex-shrink-0 ${dm ? 'border-white/[0.06]' : 'border-zinc-100'}`}>
              <div>
                <h3 className={`font-bold text-base ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>Registro de borrados</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">{pedidosBorrados.length} en total · pedidos de Entregado que se borraron sin cargar la venta</p>
              </div>
              <button onClick={() => setShowBorrados(false)} className={`p-2.5 -m-1 rounded-lg transition-all active:scale-90 ${dm ? 'text-zinc-500 hover:text-zinc-200 hover:bg-white/10' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}>
                <XCircle size={20}/>
              </button>
            </div>
            <div className="p-4 space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start overflow-y-auto custom-scrollbar" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              {pedidosBorrados.length === 0 && <div className="p-8 text-center text-sm font-medium opacity-40 italic lg:col-span-2">No hay pedidos borrados.</div>}
              {pedidosBorrados.map(p => (
                <div key={p.id} className={`rounded-xl border p-3.5 ${dm ? 'border-white/[0.07] bg-white/[0.02]' : 'border-zinc-200 bg-zinc-50'}`}>
                  <span className="text-[10px] font-bold text-zinc-500">{safeDateStr(p.borradoAt, { day: '2-digit', month: 'short' })} · {safeTimeStr(p.borradoAt)}</span>
                  <p className={`text-sm whitespace-pre-wrap mt-1.5 ${dm ? 'text-zinc-300' : 'text-zinc-700'}`}>{p.mensaje}</p>
                  <div className={`mt-2 text-xs rounded-lg px-2.5 py-1.5 inline-block ${dm ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'}`}>
                    Motivo: {p.motivoBorrado || 'Sin especificar'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <FacturaModal dm={dm} prompt={facturaPrompt} step={facturaStep} resultado={facturaResultado}
        onNo={handleFacturaNo} onSiPrimero={handleFacturaSiPrimero} onVolver={handleFacturaVolver}
        onConfirmarEmision={handleFacturaConfirmarEmision} onCerrar={handleFacturaCerrar} />
    </div>
  );
}
