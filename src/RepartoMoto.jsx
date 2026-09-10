import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore, getFirestore, collection, query, orderBy, onSnapshot,
  doc, setDoc, updateDoc, writeBatch,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import {
  Bike, Moon, Sun, ChevronDown, ChevronRight, Navigation, CheckCircle2,
  Lock, XCircle, PartyPopper, Loader2, History, X, Clock, AlertTriangle, GripVertical,
} from 'lucide-react';
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import { loadGoogleMaps, MAP_DARK_STYLE, MAP_LIGHT_STYLE } from './reparto/googleMapsLoader';
import { ZONAS_POR_ID, DEPOSITO_ORIGEN } from './reparto/zonas';
import { computeRecorrido, ordenAPersistir } from './reparto/recorridoEngine';
import { costoMotomensajeriaDe, medirCostoMotomensajeriaReal } from './reparto/motomensajeria';

// --- Firebase: mismo patrón self-contenido que PedidosPage.jsx ---
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
  // Caché persistente (IndexedDB) igual que el dashboard principal (App.jsx) — sin esto, la
  // pantalla queda en blanco apenas se corta la señal, justo cuando más se usa (Norman en la
  // calle, a veces en subte o en un ascensor). Con la caché, lo último que se sincronizó queda
  // disponible al instante aunque no haya internet, y las escrituras (marcar una entrega, etc.)
  // quedan en cola y se mandan solas apenas vuelve la señal. persistentMultipleTabManager permite
  // que esta pantalla y otra pestaña/página del sistema compartan la caché sin pisarse si están
  // abiertas al mismo tiempo en el mismo navegador.
  db = initializeFirestore(fbApp, {
    experimentalForceLongPolling: true,
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch { db = getFirestore(fbApp); }
if (!db) db = getFirestore(fbApp);

// Avisa al agente de IA (n8n) que un pedido cambio de estado en el reparto, para que le escriba
// al cliente ("tu pedido llego" / "fue entregado"). Fire-and-forget: nunca bloquea ni rompe el
// flujo del repartidor. Si VITE_N8N_ENTREGA_WEBHOOK no esta seteada, no hace nada.
const N8N_ENTREGA_WEBHOOK = import.meta.env.VITE_N8N_ENTREGA_WEBHOOK || '';
function notificarEntregaAgente(pedido, evento) {
  if (!N8N_ENTREGA_WEBHOOK || !pedido?.telefono) return;
  try {
    fetch(N8N_ENTREGA_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pedidoId: pedido.id,
        telefono: pedido.telefono,
        cliente: pedido.cliente || null,
        evento, // 'entregado' | 'llegue'
        direccion: pedido.direccion?.texto || null,
        ts: new Date().toISOString(),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* noop */ }
}

const AUTH_KEY = '028_user';
const AUTH_PWD = '1717';

function LoginMoto({ dm, onAuth }) {
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState(false);
  const submit = e => {
    e.preventDefault();
    if (pwd === AUTH_PWD) { localStorage.setItem(AUTH_KEY, 'Admin'); onAuth(); }
    else { setErr(true); setPwd(''); }
  };
  return (
    <div className={`min-h-screen flex items-center justify-center px-4 ${dm ? 'bg-[#050505]' : 'bg-slate-50'}`} style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className={`w-full max-w-sm rounded-2xl border p-8 shadow-xl ${dm ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200'}`}>
        <div className="flex items-center gap-3 mb-7">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#6366f1' }}><Bike size={17} className="text-white" /></div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>028 Import</p>
            <h1 className={`text-sm font-black leading-tight ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>Mi Recorrido</h1>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Clave de seguridad</label>
            <input type="password" value={pwd} autoFocus onChange={e => { setPwd(e.target.value); setErr(false); }} placeholder="••••••••••••"
              className={`w-full px-3 py-3 text-base rounded-xl border outline-none transition-all focus:ring-2 focus:ring-indigo-500/30 ${err ? 'border-red-500/60 bg-red-500/5' : dm ? 'bg-[#1a1a1a] border-white/[0.08] text-zinc-100 placeholder-zinc-600' : 'bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400'}`} />
            {err && <p className="text-xs text-red-400 mt-1.5 font-medium">Clave incorrecta</p>}
          </div>
          <button type="submit" className="w-full h-14 rounded-xl text-base font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]" style={{ background: '#6366f1' }}>Ingresar</button>
        </form>
      </div>
    </div>
  );
}

const comoLlegarUrl = (destino) => `https://www.google.com/maps/dir/?api=1&destination=${destino.lat},${destino.lng}&travelmode=driving`;

// Helpers de fecha/moneda para el historial de entregas — mismo criterio que RepartoDeposito
// (formatHora) y PedidosPage (formatMoney), reescritos acá para no importar entre pantallas.
const safeTime = (dateStr) => { const t = new Date(dateStr).getTime(); return isNaN(t) ? 0 : t; };
const formatHora = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};
const formatMoney = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val || 0);
// Encabezado de grupo del historial: "Hoy" / "Ayer" / fecha corta — comparando solo el día, no la hora.
const formatDiaLabel = (dateStr) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Sin fecha';
  const hoy = new Date(); const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mismoDia(d, hoy)) return 'Hoy';
  if (mismoDia(d, ayer)) return 'Ayer';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: hoy.getFullYear() !== d.getFullYear() ? 'numeric' : undefined });
};
// Monto de la venta ya cerrada por depósito (venta.items) — mientras Norman no la finaliza en
// /pedidos todavía no hay precio cargado, así que puede no existir.
const montoVenta = (pedido) => pedido.venta?.items?.reduce((s, it) => s + (it.precio || 0) * (it.unidades || 0), 0) ?? null;

// Cartel de confirmación centrado, reutilizado para "¿ya terminaste el día?" y "¿ya lo entregaste?"
// — pensado para dedo/pulgar en la calle, botones grandes.
function ConfirmModal({ dm, title, text, confirmLabel = 'Aceptar', onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in duration-150"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        className={`w-full max-w-xs rounded-3xl border p-5 shadow-2xl animate-in zoom-in-95 duration-150 ${dm ? 'bg-[#161616] border-white/[0.1]' : 'bg-white border-zinc-200'}`}>
        {title && <p className={`text-lg font-black text-center mb-1.5 ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>{title}</p>}
        {text && <p className={`text-sm text-center leading-snug mb-4 ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>{text}</p>}
        <div className="flex flex-col gap-2 mt-1">
          <button onClick={onConfirm}
            className="w-full h-14 rounded-2xl font-black text-base text-white transition-all active:scale-[0.97] bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center gap-2">
            <CheckCircle2 size={18}/> {confirmLabel}
          </button>
          <button onClick={onCancel}
            className={`w-full h-11 rounded-xl font-bold text-sm transition-all ${dm ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-700'}`}>
            Todavía no
          </button>
        </div>
      </div>
    </div>
  );
}

// Cartel para registrar una entrega fallida (cliente no atendió, rechazó el pedido, no había
// nadie, etc.) — antes la única salida de una parada era marcarla "Entregado", así que una
// entrega fallida solo se podía mentir como entregada o dejar el pedido colgado en el recorrido
// para siempre. Pide motivo siempre (el botón de confirmar queda deshabilitado sin texto): sin
// motivo, el registro no dice nada útil ni a Norman ni a depósito.
function EntregaFallidaModal({ dm, pedido, onConfirm, onCancel }) {
  const [motivo, setMotivo] = useState('');
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 animate-in fade-in duration-150"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        className={`w-full max-w-sm rounded-3xl border p-5 shadow-2xl animate-in zoom-in-95 duration-150 ${dm ? 'bg-[#161616] border-white/[0.1]' : 'bg-white border-zinc-200'}`}>
        <p className={`text-lg font-black text-center mb-1.5 ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>¿Por qué no se pudo entregar?</p>
        <p className={`text-sm text-center leading-snug mb-4 ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>{pedido.direccion?.texto}</p>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} autoFocus
          placeholder="Ej: no atendió, no había nadie, rechazó el pedido..."
          className={`w-full rounded-xl border p-3 text-sm resize-none outline-none transition-all focus:ring-2 focus:ring-amber-500/30 mb-4 ${dm ? 'bg-[#101010] border-white/[0.08] text-zinc-100 placeholder-zinc-600' : 'bg-white border-zinc-200 text-zinc-900'}`} />
        <div className="flex flex-col gap-2">
          <button onClick={() => onConfirm(motivo.trim())} disabled={!motivo.trim()}
            className="w-full h-14 rounded-2xl font-black text-base text-white transition-all active:scale-[0.97] bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            <AlertTriangle size={18}/> Registrar intento fallido
          </button>
          <button onClick={onCancel}
            className={`w-full h-11 rounded-xl font-bold text-sm transition-all ${dm ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-700'}`}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// Fila arrastrable de la vista previa "Recorrido de hoy" (antes de tocar "Salí a repartir") —
// mismo patrón de useSortable que StopRow en RepartoDeposito.jsx, pero con la versión chica de la
// tarjeta que ya tenía esta pantalla (sin acciones, solo para mirar el orden). Acá nunca hay
// parada congelada (recién se congela la primera al salir), así que todas se pueden mover.
function PreviewStopRow({ dm, pedido, index }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pedido.id });
  const style = {
    transform: DndCSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const zona = ZONAS_POR_ID[pedido.direccion?.zona];
  const caliente = zona?.temperatura === 'caliente';
  return (
    <div ref={setNodeRef} style={style}
      className={`rounded-xl border p-3 flex items-center gap-3 ${dm ? 'bg-[#141414] border-white/[0.07]' : 'bg-white border-zinc-200'}`}>
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black flex-shrink-0 ${dm ? 'bg-white/[0.08] text-zinc-300' : 'bg-zinc-100 text-zinc-600'}`}>{index + 1}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold truncate ${dm ? 'text-zinc-200' : 'text-zinc-800'}`}>{pedido.direccion?.texto}</p>
        {zona && <span className={`text-[10px] font-bold ${caliente ? 'text-red-400' : 'text-sky-400'}`}>{zona.nombre.replace(/^Zona \S+ — /, '')}</span>}
      </div>
      <button {...attributes} {...listeners} className={`p-2 -m-1 rounded-lg flex-shrink-0 cursor-grab active:cursor-grabbing touch-none ${dm ? 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06]' : 'text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100'}`}>
        <GripVertical size={18}/>
      </button>
    </div>
  );
}

// Fila arrastrable de "Después" (con el recorrido ya activo) — misma tarjeta grande de siempre
// (zona, intentos fallidos, mensaje, Cómo llegar / Entregado / No pude entregar), con una
// agarradera nueva para reordenar. La parada congelada ("Próxima parada", más arriba) nunca entra
// acá: no se renderiza como fila de esta lista, así que no hace falta bloquearla por separado.
function RestoStopRow({ dm, pedido, index, expanded, onToggleExpand, entregandoId, marcandoFallidaId, onConfirmEntrega, onFallida }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pedido.id });
  const style = {
    transform: DndCSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const zona = ZONAS_POR_ID[pedido.direccion?.zona];
  const caliente = zona?.temperatura === 'caliente';
  return (
    <div ref={setNodeRef} style={style} className={`rounded-2xl border p-4 ${dm ? 'bg-[#141414] border-white/[0.07]' : 'bg-white border-zinc-200'}`}>
      <div className="flex items-start gap-3">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black flex-shrink-0 ${dm ? 'bg-white/[0.08] text-zinc-300' : 'bg-zinc-100 text-zinc-600'}`}>{index + 2}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {zona && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${caliente ? 'bg-red-500/10 text-red-400' : 'bg-sky-500/10 text-sky-400'}`}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: caliente ? '#f87171' : '#38bdf8' }}/>
                {zona.nombre.replace(/^Zona \S+ — /, '')}
              </span>
            )}
            {pedido.intentosFallidos?.length > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${dm ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                <AlertTriangle size={10}/> {pedido.intentosFallidos.length}
              </span>
            )}
          </div>
          <p className={`text-base font-bold leading-snug ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>{pedido.direccion.texto}</p>
          {pedido.direccion.referencias && <p className={`text-sm mt-0.5 ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>{pedido.direccion.referencias}</p>}
          <button onClick={onToggleExpand}
            className={`flex items-center gap-1.5 text-base font-bold mt-2 ${dm ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-800'}`}>
            {expanded ? 'Ocultar mensaje' : 'Ver mensaje'} {expanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
          </button>
          {expanded && (
            <p className={`text-base mt-2 whitespace-pre-wrap rounded-lg p-2.5 ${dm ? 'bg-white/[0.03] text-zinc-400' : 'bg-zinc-50 text-zinc-600'}`}>{pedido.mensaje}</p>
          )}
        </div>
        <button {...attributes} {...listeners} className={`p-2 -m-1 rounded-lg flex-shrink-0 cursor-grab active:cursor-grabbing touch-none ${dm ? 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06]' : 'text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100'}`}>
          <GripVertical size={18}/>
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        <a href={comoLlegarUrl(pedido.direccion)} target="_blank" rel="noopener noreferrer"
          className={`flex-1 h-11 rounded-xl font-bold text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 ${dm ? 'bg-white/[0.06] text-zinc-200 hover:bg-white/10' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}>
          <Navigation size={15}/> Cómo llegar
        </a>
        <button onClick={onConfirmEntrega} disabled={!!entregandoId}
          className="flex-1 h-11 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.97] bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 flex items-center justify-center gap-1.5">
          <CheckCircle2 size={15}/> Entregado
        </button>
        <button onClick={onFallida} disabled={marcandoFallidaId === pedido.id} title="No pude entregar"
          className={`flex-shrink-0 h-11 w-11 rounded-xl border transition-all active:scale-[0.97] disabled:opacity-50 flex items-center justify-center ${dm ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' : 'border-amber-200 text-amber-600 hover:bg-amber-50'}`}>
          <AlertTriangle size={16}/>
        </button>
      </div>
    </div>
  );
}

export default function RepartoMoto() {
  const [dm, setDm] = useState(() => localStorage.getItem('028_dark_mode') === 'true');
  // Único botón de modo claro/oscuro de esta pantalla — antes solo lo respetaba (mapa incluido)
  // pero para cambiarlo había que ir a otra pantalla. Al sol del mediodía en la calle, el modo
  // claro se lee mucho mejor, así que el repartidor necesita poder tocarlo desde acá mismo.
  useEffect(() => { localStorage.setItem('028_dark_mode', dm); }, [dm]);
  const [pedidos, setPedidos] = useState([]);
  const [recorrido, setRecorrido] = useState(null);
  const [userPos, setUserPos] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [salioLoading, setSalioLoading] = useState(false);
  const [entregandoId, setEntregandoId] = useState(null);
  // Pedido con la parada que se va a marcar como intento fallido, mientras se pide el motivo
  // (EntregaFallidaModal) — distinto de confirmEntregaPedido porque ahí no hace falta escribir
  // nada, solo confirmar.
  const [fallidaPedido, setFallidaPedido] = useState(null);
  const [marcandoFallidaId, setMarcandoFallidaId] = useState(null);
  const [toast, setToast] = useState(null);
  // Norman se marca "inactivo" a mano cuando termina su turno/no está disponible — documento aparte
  // de recorridos/activo a propósito, para no interferir con esa lógica (parada congelada, etc.) ni
  // depender de tocarla en cada setDoc que ya existe ahí.
  const [repartidorActivo, setRepartidorActivo] = useState(true);
  const [togglingActivo, setTogglingActivo] = useState(false);
  const [showEndDayConfirm, setShowEndDayConfirm] = useState(false);
  const [confirmEntregaPedido, setConfirmEntregaPedido] = useState(null);
  const [showHistorial, setShowHistorial] = useState(false);
  // 'todos' muestra todo agrupado por día (como antes); un label puntual (ver historialGrupos)
  // filtra a solo ese día — así se puede mirar la plata de una fecha en particular sin desplazarse.
  const [filtroDiaHistorial, setFiltroDiaHistorial] = useState('todos');

  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const computedOnceRef = useRef(false);
  // El script de Google Maps tarda en cargar; si los pedidos ya llegaron de Firestore ANTES de
  // que el mapa termine de crearse, el efecto que dibuja los puntos corre una vez con
  // mapRef.current todavía en null, no dibuja nada, y como stopsOrdenadas no vuelve a cambiar
  // solo (no cambia hasta que entre/salga un pedido), los puntos quedaban sin aparecer hasta que
  // pasara algo más. mapReady fuerza a que ese efecto se vuelva a correr apenas el mapa esté listo.
  const [mapReady, setMapReady] = useState(false);

  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    const q = query(collection(db, 'pedidos'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => setPedidos(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => console.error('pedidos:', err));
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, 'recorridos', 'activo'), snap => {
      setRecorrido(snap.exists() ? snap.data() : { estado: 'en_deposito', salidaEn: null, paradaCongelada: null });
    }, err => console.error('recorrido:', err));
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, 'recorridos', 'repartidor'), snap => {
      setRepartidorActivo(snap.exists() ? snap.data().activo !== false : true);
    }, err => console.error('repartidor:', err));
  }, []);

  // El botón de arriba solo sirve para pasar de Activo a Inactivo — la única forma de volver a
  // Activo es tocando "Salí a repartir" (ver handleSalir), nunca tocando este botón de nuevo. Si
  // ya está inactivo, tocarlo no hace nada.
  const handleToggleActivo = () => {
    if (togglingActivo || !repartidorActivo) return;
    if (stopsOrdenadas.length === 0) {
      setShowEndDayConfirm(true);
      return;
    }
    aplicarToggleActivo(false);
  };

  const aplicarToggleActivo = async (nuevoActivo) => {
    setTogglingActivo(true);
    try {
      await setDoc(doc(db, 'recorridos', 'repartidor'), { activo: nuevoActivo, updatedAt: new Date().toISOString() });
      // Al terminar el día (pasa a inactivo) el recorrido queda reseteado, para que la próxima vez
      // que tenga pedidos vuelva a arrancar de cero mostrando "Salí a repartir".
      if (!nuevoActivo) {
        await setDoc(doc(db, 'recorridos', 'activo'), { estado: 'en_deposito', salidaEn: null, paradaCongelada: null });
      }
    } catch (e) {
      showToast('Error al cambiar el estado: ' + e.message, 'error');
    } finally {
      setTogglingActivo(false);
    }
  };

  const handleConfirmEndDay = () => {
    setShowEndDayConfirm(false);
    aplicarToggleActivo(false);
  };

  // Ubicación en vivo — solo para centrar el mapa y mostrar el punto azul. Nunca dispara un
  // recálculo de recorrido ni se escribe en Firestore por cada tick (eso sería carísimo); la
  // única vez que la posición se guarda es al marcar una entrega (ubicacionEntrega).
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      pos => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => console.warn('GPS:', err.message),
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const stopsRaw = useMemo(() =>
    pedidos.filter(p => p.tipoEnvio === 'moto' && p.estado === 'armado' && p.direccion),
    [pedidos]);
  const stopsOrdenadas = useMemo(() =>
    [...stopsRaw].sort((a, b) => (a.ordenRecorrido ?? 999) - (b.ordenRecorrido ?? 999)),
    [stopsRaw]);

  // Historial de entregas de Norman: todo lo que ya salió de "armado" hacia adelante (entregado en
  // la calle, y finalizado una vez que depósito le carga el precio en /pedidos), más reciente
  // primero, agrupado por día para que sea fácil de recorrer con el dedo.
  const historialGrupos = useMemo(() => {
    const entregas = pedidos
      .filter(p => p.tipoEnvio === 'moto' && (p.estado === 'entregado' || p.estado === 'finalizado') && p.direccion)
      .sort((a, b) => safeTime(b.entregadoEn || b.finalizadoAt) - safeTime(a.entregadoEn || a.finalizadoAt));
    const grupos = [];
    for (const p of entregas) {
      const fechaRef = p.entregadoEn || p.finalizadoAt;
      const label = formatDiaLabel(fechaRef);
      let grupo = grupos.find(g => g.label === label);
      if (!grupo) { grupo = { label, items: [], totalMotomensajeria: 0 }; grupos.push(grupo); }
      grupo.items.push(p);
      grupo.totalMotomensajeria += costoMotomensajeriaDe(p)?.monto || 0;
    }
    return grupos;
  }, [pedidos]);

  // Total general de plata de motomensajería en TODO el historial cargado (todos los días juntos)
  // — lo que se muestra arriba de todo cuando el filtro está en "Todos".
  const historialTotalGeneral = useMemo(() =>
    historialGrupos.reduce((s, g) => s + g.totalMotomensajeria, 0),
    [historialGrupos]);

  // Si el día elegido en el filtro ya no existe (ej. se filtró "Hoy" y cambió la fecha), se vuelve
  // solo a "Todos" en vez de quedar mostrando una lista vacía sin explicación.
  useEffect(() => {
    if (filtroDiaHistorial !== 'todos' && !historialGrupos.some(g => g.label === filtroDiaHistorial)) {
      setFiltroDiaHistorial('todos');
    }
  }, [historialGrupos, filtroDiaHistorial]);

  const gruposVisibles = filtroDiaHistorial === 'todos'
    ? historialGrupos
    : historialGrupos.filter(g => g.label === filtroDiaHistorial);
  const totalVisible = filtroDiaHistorial === 'todos'
    ? historialTotalGeneral
    : (gruposVisibles[0]?.totalMotomensajeria || 0);

  const enCalle = recorrido?.estado === 'en_calle';

  // Único trigger de cálculo que le corresponde a esta pantalla: si hay paradas que TODAVÍA nunca
  // se ordenaron (nadie abrió el panel del depósito antes), se calculan acá para no dejar a Norman
  // con una lista sin ningún orden. Si ya venían calculadas (caso normal), no se vuelve a llamar a
  // Routes API por el simple hecho de abrir esta pantalla — esa llamada ya la hizo el depósito.
  useEffect(() => {
    if (computedOnceRef.current || stopsRaw.length === 0) return;
    const hayNuncaCalculada = stopsRaw.some(p => p.ordenRecorrido == null);
    if (!hayNuncaCalculada) { computedOnceRef.current = true; return; }
    computedOnceRef.current = true;
    (async () => {
      try {
        const paradaCongeladaId = enCalle ? recorrido?.paradaCongelada : null;
        const ordenado = await computeRecorrido({ pedidos: stopsRaw, paradaCongeladaId });
        const batch = writeBatch(db);
        ordenado.forEach((p, i) => { if (p.id !== paradaCongeladaId) batch.update(doc(db, 'pedidos', p.id), { ordenRecorrido: i + 1 }); });
        await batch.commit();
      } catch (e) { console.error('Error calculando recorrido inicial:', e); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsRaw.length]);

  // --- Mapa ---
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(maps => {
      if (cancelled || !mapDivRef.current || mapRef.current) return;
      mapRef.current = new maps.Map(mapDivRef.current, {
        center: { lat: DEPOSITO_ORIGEN.lat, lng: DEPOSITO_ORIGEN.lng },
        zoom: 13,
        styles: dm ? MAP_DARK_STYLE : MAP_LIGHT_STYLE,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
      });
      setMapReady(true);
    }).catch(err => console.error('Google Maps no cargó:', err));
    return () => { cancelled = true; };
  }, []);

  // Repinta el mapa ya creado al tocar el toggle de modo claro/oscuro — la creación de arriba solo
  // corre una vez, así que el cambio de estilo en caliente necesita este segundo efecto aparte.
  // Mismo patrón que RepartoDeposito.jsx.
  useEffect(() => {
    mapRef.current?.setOptions({ styles: dm ? MAP_DARK_STYLE : MAP_LIGHT_STYLE });
  }, [dm]);

  // Redibuja los marcadores numerados cada vez que cambia el orden de paradas. Los marcadores
  // viejos se sacan del mapa antes de poner los nuevos — es la única forma simple y confiable de
  // no acumular marcadores fantasma con la librería clásica de Marker.
  useEffect(() => {
    if (!mapRef.current || typeof window === 'undefined' || !window.google) return;
    const maps = window.google.maps;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = stopsOrdenadas.map((p, i) => {
      const caliente = ZONAS_POR_ID[p.direccion?.zona]?.temperatura === 'caliente';
      return new maps.Marker({
        map: mapRef.current,
        position: { lat: p.direccion.lat, lng: p.direccion.lng },
        label: { text: String(i + 1), color: '#fff', fontWeight: '700', fontSize: '12px' },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: 15,
          fillColor: i === 0 ? '#6366f1' : (caliente ? '#f87171' : '#38bdf8'),
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
      });
    });

    if (stopsOrdenadas.length > 0) {
      const bounds = new maps.LatLngBounds();
      stopsOrdenadas.forEach(p => bounds.extend({ lat: p.direccion.lat, lng: p.direccion.lng }));
      if (userPos) bounds.extend(userPos);
      mapRef.current.fitBounds(bounds, 60);
    }
  }, [stopsOrdenadas, userPos, mapReady]);

  // Punto azul de "dónde estoy" — se actualiza en su propio marcador aparte de los numerados.
  useEffect(() => {
    if (!mapRef.current || !userPos || typeof window === 'undefined' || !window.google) return;
    const maps = window.google.maps;
    if (!userMarkerRef.current) {
      userMarkerRef.current = new maps.Marker({
        map: mapRef.current,
        icon: { path: maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#3b82f6', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
        zIndex: 999,
      });
    }
    userMarkerRef.current.setPosition(userPos);
  }, [userPos, mapReady]);

  const handleSalir = async () => {
    if (stopsOrdenadas.length === 0 || salioLoading) return;
    setSalioLoading(true);
    try {
      await setDoc(doc(db, 'recorridos', 'activo'), {
        estado: 'en_calle',
        salidaEn: new Date().toISOString(),
        paradaCongelada: stopsOrdenadas[0].id,
      });
      // Salir a repartir implica estar activo — si venía marcado inactivo (ej. de un turno
      // anterior que no reactivó a mano), esto lo pone en Activo solo, sin que haga falta tocar
      // el botón de arriba a la derecha aparte.
      if (!repartidorActivo) {
        await setDoc(doc(db, 'recorridos', 'repartidor'), { activo: true, updatedAt: new Date().toISOString() });
      }
    } catch (e) {
      showToast('Error al salir a repartir: ' + e.message, 'error');
    } finally {
      setSalioLoading(false);
    }
  };

  const getPosicionActual = () => new Promise(resolve => {
    if (!navigator.geolocation) { resolve(userPos); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(userPos),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  });

  // Marca la entrega, cierra la parada, y recalcula el resto del recorrido saliendo desde donde
  // se acaba de entregar — este es el único disparador de Routes API que le toca a esta pantalla
  // además del cálculo inicial de arriba (que casi nunca se llega a usar).
  const handleEntregado = async (pedido) => {
    if (entregandoId) return;
    setEntregandoId(pedido.id);
    try {
      const posEntrega = await getPosicionActual();
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, 'pedidos', pedido.id), {
        estado: 'entregado',
        entregadoEn: nowIso,
        ubicacionEntrega: posEntrega ? { lat: posEntrega.lat, lng: posEntrega.lng } : null,
      });

      // Avisa al agente de IA para que le escriba al cliente. No bloquea nada.
      notificarEntregaAgente(pedido, 'entregado');

      // Plata de la motomensajería: se mide la distancia REAL por calle acá, una sola vez, y se
      // guarda en el pedido para que el historial no tenga que volver a llamar a Google nunca más.
      // Corre aparte, sin bloquear el resto del flujo (el repartidor no tiene por qué esperarla) —
      // si falla o Google no responde, el historial cae solo al estimado en línea recta.
      medirCostoMotomensajeriaReal(pedido.direccion)
        .then(costo => { if (costo) return updateDoc(doc(db, 'pedidos', pedido.id), { motomensajeria: costo }); })
        .catch(err => console.error('motomensajería real:', err));

      const restantes = stopsRaw.filter(p => p.id !== pedido.id);
      if (restantes.length === 0) {
        await setDoc(doc(db, 'recorridos', 'activo'), { estado: 'en_deposito', salidaEn: null, paradaCongelada: null });
      } else {
        const origin = posEntrega || { lat: pedido.direccion.lat, lng: pedido.direccion.lng };
        const ordenado = await computeRecorrido({ pedidos: restantes, paradaCongeladaId: null, origin });
        const batch = writeBatch(db);
        ordenado.forEach((p, i) => batch.update(doc(db, 'pedidos', p.id), { ordenRecorrido: i + 1 }));
        await batch.commit();
        await setDoc(doc(db, 'recorridos', 'activo'), { estado: 'en_calle', salidaEn: recorrido?.salidaEn || nowIso, paradaCongelada: ordenado[0].id });
      }
      showToast('Entrega registrada');
    } catch (e) {
      showToast('Error al marcar la entrega: ' + e.message, 'error');
    } finally {
      setEntregandoId(null);
    }
  };

  // Registra un intento de entrega que no se pudo concretar (no atendió, rechazó el pedido, no
  // había nadie) — a diferencia de handleEntregado, el pedido NO se cierra: sigue "armado" y
  // sigue en stopsRaw, solo se anota el motivo en su historial de intentos y se recalcula el
  // recorrido saliendo de donde se intentó, para que la parada vuelva a competir por orden con el
  // resto en vez de quedar congelada ahí para siempre. No se cobra motomensajería por el intento:
  // solo se paga el km real cuando la entrega se concreta (ver medirCostoMotomensajeriaReal en
  // handleEntregado) — así el costo del viaje queda igual que hoy, y esto no le agrega plata a
  // pagar de más a la motomensajería.
  const handleEntregaFallida = async (pedido, motivo) => {
    if (marcandoFallidaId || !motivo?.trim()) return;
    setMarcandoFallidaId(pedido.id);
    try {
      const posActual = await getPosicionActual();
      const nowIso = new Date().toISOString();
      const intentos = [...(pedido.intentosFallidos || []), { motivo: motivo.trim(), fecha: nowIso }];
      await updateDoc(doc(db, 'pedidos', pedido.id), { intentosFallidos: intentos });

      // Recalcula el recorrido con TODAS las paradas de siempre (esta incluida, sin quitarla) —
      // a diferencia de handleEntregado, que la sacaba de la lista al entregar.
      const origin = posActual || { lat: pedido.direccion.lat, lng: pedido.direccion.lng };
      const ordenado = await computeRecorrido({ pedidos: stopsRaw, paradaCongeladaId: null, origin });
      const batch = writeBatch(db);
      ordenado.forEach((p, i) => batch.update(doc(db, 'pedidos', p.id), { ordenRecorrido: i + 1 }));
      await batch.commit();
      await setDoc(doc(db, 'recorridos', 'activo'), { estado: 'en_calle', salidaEn: recorrido?.salidaEn || nowIso, paradaCongelada: ordenado[0].id });

      showToast('Intento fallido registrado — el pedido vuelve a la cola');
    } catch (e) {
      showToast('Error al registrar el intento: ' + e.message, 'error');
    } finally {
      setMarcandoFallidaId(null);
    }
  };

  // Sin clave — esta pantalla (y /pedidos y /pedidos/reparto) queda sin login a propósito, la
  // usan Norman/depósito directo desde el celular. El resto del sistema sigue pidiendo clave.
  const proxima = stopsOrdenadas[0];
  const resto = stopsOrdenadas.slice(1);

  const paradaCongeladaId = enCalle ? recorrido?.paradaCongelada : null;

  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  // Reordenar a mano, mismo criterio que el panel de depósito (RepartoDeposito.jsx): se persiste
  // directo, sin llamar a Routes API — Norman ya decidió el orden, no hace falta que Google lo
  // "corrija". Marca ordenManual=true en todo lo que no sea la parada congelada, así un pedido
  // nuevo que entre después se agrega al final sin tocar este orden a mano. La parada congelada
  // (si el recorrido ya está activo) ni siquiera aparece en la lista arrastrable — no hace falta
  // excluirla acá aparte, aunque igual se la protege por las dudas.
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = stopsOrdenadas.map(p => p.id);
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    if (ids[oldIndex] === paradaCongeladaId || ids[newIndex] === paradaCongeladaId) return;

    const nuevoOrden = arrayMove(stopsOrdenadas, oldIndex, newIndex);
    try {
      const batch = writeBatch(db);
      nuevoOrden.forEach((p, i) => {
        if (p.id === paradaCongeladaId) return;
        batch.update(doc(db, 'pedidos', p.id), { ordenRecorrido: i + 1, ordenManual: true });
      });
      await batch.commit();
    } catch (e) {
      showToast('Error al reordenar: ' + e.message, 'error');
    }
  };

  return (
    <div className={`min-h-screen ${dm ? 'bg-[#050505] text-zinc-100' : 'bg-slate-50 text-zinc-900'}`} style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className={`sticky top-0 z-20 border-b backdrop-blur-xl ${dm ? 'bg-[#101010]/90 border-white/[0.06]' : 'bg-white/90 border-zinc-200'}`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#6366f1' }}><Bike size={16} className="text-white" /></div>
            <p className="font-black text-base tracking-tight truncate">Mi Recorrido</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Norman se marca activo/inactivo acá — no bloquea nada del flujo, es solo para que
                depósito sepa si está disponible (se ve reflejado en /pedidos/reparto). */}
            {/* Inactivo: no reacciona al toque — la única forma de volver a Activo es "Salí a
                repartir", nunca tocando este botón de nuevo. */}
            <button onClick={handleToggleActivo} disabled={togglingActivo || !repartidorActivo}
              className={`flex items-center gap-1.5 h-8 pl-2 pr-3 rounded-full text-xs font-bold transition-all active:scale-[0.97] disabled:opacity-60 ${
                repartidorActivo
                  ? (dm ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-700')
                  : (dm ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-200 text-zinc-600')
              }`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${repartidorActivo ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`}/>
              {togglingActivo ? '...' : (repartidorActivo ? 'Activo' : 'Inactivo')}
            </button>
            <button onClick={() => setShowHistorial(true)} title="Historial de entregas"
              className={`p-2.5 rounded-lg transition-colors ${dm ? 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06]' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}><History size={19}/></button>
            <button onClick={() => setDm(v => !v)} title={dm ? 'Modo claro' : 'Modo oscuro'}
              className={`p-2.5 rounded-lg transition-colors ${dm ? 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06]' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}>{dm ? <Sun size={19}/> : <Moon size={19}/>}</button>
          </div>
        </div>
      </div>

      {/* Mapa */}
      <div ref={mapDivRef} className="w-full h-[38vh] bg-zinc-900" />

      <div className="px-4 py-4 space-y-3" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>

        {stopsOrdenadas.length === 0 ? (
          <div className={`rounded-3xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 text-center ${dm ? 'border-white/[0.08] bg-white/[0.02]' : 'border-zinc-200 bg-zinc-50'}`}>
            <PartyPopper size={36} className={dm ? 'text-zinc-600' : 'text-zinc-300'} />
            <p className={`text-base font-bold ${dm ? 'text-zinc-300' : 'text-zinc-600'}`}>No hay paradas para repartir ahora.</p>
          </div>
        ) : !enCalle ? (
          <>
            <button onClick={handleSalir} disabled={salioLoading}
              className="w-full h-20 rounded-3xl font-black text-2xl text-white transition-all active:scale-[0.97] bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 flex items-center justify-center gap-3">
              {salioLoading ? <Loader2 size={26} className="animate-spin"/> : <Bike size={28}/>}
              Salí a repartir
            </button>
            {/* Antes de salir, solo vista previa del recorrido — sin "Cómo llegar" ni "Entregado":
                esas acciones aparecen recién cuando el recorrido pasa a estar activo. Sí se puede
                arrastrar para acomodar el orden a gusto antes de salir. */}
            <div className="space-y-2 mt-3">
              <span className={`text-[11px] font-black uppercase tracking-widest px-1 ${dm ? 'text-zinc-600' : 'text-zinc-400'}`}>Recorrido de hoy ({stopsOrdenadas.length}) · mantené apretado para reordenar</span>
              <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={stopsOrdenadas.map(p => p.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {stopsOrdenadas.map((p, i) => (
                      <PreviewStopRow key={p.id} dm={dm} pedido={p} index={i} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </>
        ) : null}

        {/* Próxima parada: bien grande, arriba de todo, imposible de confundir — recién visible
            una vez que el recorrido está activo (tocó "Salí a repartir"). */}
        {enCalle && proxima && (
          <div className={`rounded-3xl border-2 p-5 ${dm ? 'bg-indigo-500/[0.08] border-indigo-500/40' : 'bg-indigo-50 border-indigo-300'}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-9 h-9 rounded-xl bg-[#6366f1] text-white flex items-center justify-center font-black text-lg flex-shrink-0">1</span>
              <span className={`text-xs font-black uppercase tracking-widest ${dm ? 'text-indigo-300' : 'text-indigo-600'}`}>Próxima parada</span>
              {enCalle && <Lock size={14} className="text-indigo-400 ml-auto"/>}
            </div>
            {proxima.intentosFallidos?.length > 0 && (
              <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-full mb-1.5 ${dm ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                <AlertTriangle size={11}/> {proxima.intentosFallidos.length === 1 ? '1 intento fallido' : `${proxima.intentosFallidos.length} intentos fallidos`}
              </span>
            )}
            <p className={`text-2xl font-black leading-snug ${dm ? 'text-zinc-50' : 'text-zinc-900'}`}>{proxima.direccion.texto}</p>
            {proxima.direccion.referencias && <p className={`text-base mt-1 ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>{proxima.direccion.referencias}</p>}
            <p className={`text-sm font-bold mt-1 ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>{ZONAS_POR_ID[proxima.direccion.zona]?.nombre.replace(/^Zona \S+ — /, '')}</p>

            <button onClick={() => setExpandedId(cur => cur === proxima.id ? null : proxima.id)}
              className={`flex items-center gap-1.5 text-lg font-bold mt-3 ${dm ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-800'}`}>
              {expandedId === proxima.id ? 'Ocultar mensaje' : 'Ver mensaje original'} {expandedId === proxima.id ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
            </button>
            {expandedId === proxima.id && (
              <p className={`text-lg mt-2 whitespace-pre-wrap rounded-xl p-3 ${dm ? 'bg-white/[0.04] text-zinc-300' : 'bg-white text-zinc-600'}`}>{proxima.mensaje}</p>
            )}

            <div className="flex flex-col gap-2.5 mt-4">
              <a href={comoLlegarUrl(proxima.direccion)} target="_blank" rel="noopener noreferrer"
                className="w-full h-16 rounded-2xl font-black text-lg text-white transition-all active:scale-[0.97] bg-[#6366f1] hover:bg-[#4f46e5] flex items-center justify-center gap-2">
                <Navigation size={22}/> Cómo llegar
              </a>
              <button onClick={() => setConfirmEntregaPedido(proxima)} disabled={entregandoId === proxima.id}
                className="w-full h-16 rounded-2xl font-black text-lg text-white transition-all active:scale-[0.97] bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 flex items-center justify-center gap-2">
                {entregandoId === proxima.id ? <Loader2 size={22} className="animate-spin"/> : <CheckCircle2 size={22}/>}
                {entregandoId === proxima.id ? 'Guardando...' : 'Entregado'}
              </button>
              <button onClick={() => setFallidaPedido(proxima)} disabled={marcandoFallidaId === proxima.id}
                className={`w-full h-11 rounded-xl font-bold text-sm border transition-all active:scale-[0.97] disabled:opacity-60 flex items-center justify-center gap-1.5 ${dm ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' : 'border-amber-200 text-amber-600 hover:bg-amber-50'}`}>
                <AlertTriangle size={15}/> No pude entregar
              </button>
            </div>
          </div>
        )}

        {/* Resto de las paradas: mismo patrón, más chico. La parada congelada (arriba, "Próxima
            parada") no participa acá — se puede reordenar libremente todo lo demás. */}
        {enCalle && resto.length > 0 && (
          <div className="space-y-2.5">
            <span className={`text-[11px] font-black uppercase tracking-widest px-1 ${dm ? 'text-zinc-600' : 'text-zinc-400'}`}>Después ({resto.length}) · mantené apretado para reordenar</span>
            <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={resto.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2.5">
                  {resto.map((p, i) => (
                    <RestoStopRow key={p.id} dm={dm} pedido={p} index={i}
                      expanded={expandedId === p.id} onToggleExpand={() => setExpandedId(cur => cur === p.id ? null : p.id)}
                      entregandoId={entregandoId} marcandoFallidaId={marcandoFallidaId}
                      onConfirmEntrega={() => setConfirmEntregaPedido(p)} onFallida={() => setFallidaPedido(p)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 z-50 border max-w-[90vw] ${toast.type === 'error' ? 'bg-red-600/95 border-red-500 text-white' : 'bg-zinc-900/95 border-white/10 text-white'}`}>
          {toast.type === 'error' ? <XCircle size={16}/> : <CheckCircle2 size={16} className="text-emerald-400"/>}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {confirmEntregaPedido && (
        <ConfirmModal dm={dm} title="¿Ya lo entregaste?" text={confirmEntregaPedido.direccion?.texto}
          confirmLabel="Sí, entregado"
          onConfirm={() => { const p = confirmEntregaPedido; setConfirmEntregaPedido(null); handleEntregado(p); }}
          onCancel={() => setConfirmEntregaPedido(null)} />
      )}

      {fallidaPedido && (
        <EntregaFallidaModal dm={dm} pedido={fallidaPedido}
          onConfirm={(motivo) => { const p = fallidaPedido; setFallidaPedido(null); handleEntregaFallida(p, motivo); }}
          onCancel={() => setFallidaPedido(null)} />
      )}

      {showEndDayConfirm && (
        <ConfirmModal dm={dm} title="¿Ya terminaste el día?" text="No te quedan más paradas pendientes — vas a pasar a Inactivo."
          onConfirm={handleConfirmEndDay} onCancel={() => setShowEndDayConfirm(false)} />
      )}

      {showHistorial && (
        <div className={`fixed inset-0 z-[200] flex flex-col ${dm ? 'bg-[#050505] text-zinc-100' : 'bg-slate-50 text-zinc-900'}`} style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
          <div className={`sticky top-0 z-10 border-b flex items-center gap-3 px-4 h-14 flex-shrink-0 ${dm ? 'bg-[#101010]/90 border-white/[0.06] backdrop-blur-xl' : 'bg-white/90 border-zinc-200 backdrop-blur-xl'}`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <button onClick={() => setShowHistorial(false)} className={`p-2 -ml-2 rounded-lg transition-colors ${dm ? 'text-zinc-400 hover:bg-white/[0.06]' : 'text-zinc-500 hover:bg-zinc-100'}`}><X size={22}/></button>
            <p className="font-black text-lg tracking-tight">Historial de entregas</p>
          </div>

          {historialGrupos.length > 0 && (
            <div className={`flex-shrink-0 px-4 pt-4 pb-2 space-y-3 border-b ${dm ? 'border-white/[0.06]' : 'border-zinc-200'}`}>
              {/* Total grande, siempre visible arriba de todo — cambia según el día elegido abajo. */}
              <div className={`rounded-3xl border-2 p-5 text-center ${dm ? 'bg-indigo-500/[0.08] border-indigo-500/40' : 'bg-indigo-50 border-indigo-300'}`}>
                <p className={`text-xs font-black uppercase tracking-widest ${dm ? 'text-indigo-300' : 'text-indigo-600'}`}>
                  {filtroDiaHistorial === 'todos' ? 'Total de todo el historial' : `Total · ${filtroDiaHistorial}`}
                </p>
                <p className={`text-4xl font-black mt-1 ${dm ? 'text-zinc-50' : 'text-zinc-900'}`}>{formatMoney(totalVisible)}</p>
              </div>

              {/* Chips para elegir qué día mirar — "Todos" vuelve a la vista agrupada de siempre. */}
              <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
                <button onClick={() => setFiltroDiaHistorial('todos')}
                  className={`flex-shrink-0 h-9 px-4 rounded-full text-sm font-bold transition-all ${filtroDiaHistorial === 'todos' ? 'bg-indigo-500 text-white' : (dm ? 'bg-white/[0.06] text-zinc-300' : 'bg-zinc-100 text-zinc-600')}`}>
                  Todos
                </button>
                {historialGrupos.map(g => (
                  <button key={g.label} onClick={() => setFiltroDiaHistorial(g.label)}
                    className={`flex-shrink-0 h-9 px-4 rounded-full text-sm font-bold transition-all ${filtroDiaHistorial === g.label ? 'bg-indigo-500 text-white' : (dm ? 'bg-white/[0.06] text-zinc-300' : 'bg-zinc-100 text-zinc-600')}`}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
            {historialGrupos.length === 0 ? (
              <div className={`rounded-3xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 text-center mt-4 ${dm ? 'border-white/[0.08] bg-white/[0.02]' : 'border-zinc-200 bg-zinc-50'}`}>
                <History size={36} className={dm ? 'text-zinc-600' : 'text-zinc-300'} />
                <p className={`text-base font-bold ${dm ? 'text-zinc-300' : 'text-zinc-600'}`}>Todavía no hay entregas registradas.</p>
              </div>
            ) : gruposVisibles.map(grupo => (
              <div key={grupo.label} className="space-y-2.5">
                {/* Con un día puntual elegido en los chips de arriba, este encabezado es redundante
                    con el total grande (que ya dice el mismo día) — solo se muestra en "Todos". */}
                {filtroDiaHistorial === 'todos' && (
                  <div className="flex items-center justify-between gap-2 px-1">
                    <span className={`text-sm font-black uppercase tracking-widest ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>{grupo.label} ({grupo.items.length})</span>
                    <span className={`flex items-center gap-1.5 text-sm font-black px-2.5 py-1 rounded-full ${dm ? 'bg-indigo-500/10 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}>
                      <Bike size={13}/> {formatMoney(grupo.totalMotomensajeria)}
                    </span>
                  </div>
                )}
                {grupo.items.map(p => {
                  const monto = montoVenta(p);
                  const moto = costoMotomensajeriaDe(p);
                  return (
                    <div key={p.id} className={`rounded-2xl border p-4 ${dm ? 'bg-[#141414] border-white/[0.07]' : 'bg-white border-zinc-200'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className={`text-lg font-bold leading-snug ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>{p.direccion?.texto}</p>
                          <p className={`flex items-center gap-1 text-sm font-bold mt-1 ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>
                            <Clock size={13}/> {formatHora(p.entregadoEn || p.finalizadoAt)}
                          </p>
                          <button onClick={() => setExpandedId(cur => cur === p.id ? null : p.id)}
                            className={`flex items-center gap-1.5 text-base font-bold mt-2 ${dm ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-700'}`}>
                            {expandedId === p.id ? 'Ocultar mensaje' : 'Ver mensaje original'} {expandedId === p.id ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                          </button>
                          {expandedId === p.id && (
                            <p className={`text-base mt-2 whitespace-pre-wrap rounded-xl p-3 ${dm ? 'bg-white/[0.04] text-zinc-300' : 'bg-zinc-50 text-zinc-600'}`}>{p.mensaje}</p>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {monto !== null ? (
                            <span className="text-lg font-black text-emerald-500">{formatMoney(monto)}</span>
                          ) : (
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${dm ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>Sin cerrar</span>
                          )}
                        </div>
                      </div>
                      {/* Plata de la motomensajería por este envío: $1000/km real manejado desde el
                          depósito, mínimo $3000 — ver reparto/motomensajeria.js. Si todavía no hay
                          medición real guardada (pedidos viejos, o falló la llamada a Google en su
                          momento), se avisa "aprox." y se usa línea recta como respaldo. */}
                      {moto && (
                        <div className={`flex items-center justify-between gap-2 mt-3 pt-3 border-t ${dm ? 'border-white/[0.06]' : 'border-zinc-100'}`}>
                          <span className={`flex items-center gap-1.5 text-sm font-bold ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>
                            <Bike size={14}/> {moto.km.toFixed(1)} km
                            {moto.exacto ? (
                              <span className={`text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full ${dm ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>Exacto</span>
                            ) : (
                              <span className={`text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full ${dm ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>Aprox.</span>
                            )}
                          </span>
                          <span className={`text-base font-black ${dm ? 'text-indigo-300' : 'text-indigo-600'}`}>{formatMoney(moto.monto)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
