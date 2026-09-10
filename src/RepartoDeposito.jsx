import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore, getFirestore, collection, query, orderBy, onSnapshot,
  doc, getDoc, setDoc, updateDoc, writeBatch, runTransaction,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import { Link } from 'react-router-dom';
import {
  Bike, ArrowLeft, Moon, Sun, ChevronDown, ChevronRight, GripVertical,
  MapPin, Lock, CheckCircle, XCircle, Loader2, PartyPopper, Clock, Trash2, AlertTriangle,
} from 'lucide-react';
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import { ZONAS_POR_ID, DEPOSITO_ORIGEN } from './reparto/zonas';
import { computeRecorrido, ordenAPersistir } from './reparto/recorridoEngine';
import { loadGoogleMaps, MAP_DARK_STYLE, MAP_LIGHT_STYLE } from './reparto/googleMapsLoader';

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
  // Caché persistente (IndexedDB), mismo criterio que el dashboard principal (App.jsx) y que
  // RepartoMoto.jsx — sin esto, el panel del depósito queda en blanco apenas se corta la señal.
  // Con la caché, el último recorrido conocido queda disponible al instante sin internet, y las
  // escrituras (reordenar una parada, borrar un pedido del reparto) quedan en cola y se mandan
  // solas apenas vuelve la conexión. persistentMultipleTabManager permite que esta pantalla y
  // otra pestaña del sistema compartan la caché sin pisarse si están abiertas a la vez.
  db = initializeFirestore(fbApp, {
    experimentalForceLongPolling: true,
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch { db = getFirestore(fbApp); }
if (!db) db = getFirestore(fbApp);

const AUTH_KEY = '028_user';
const AUTH_PWD = '1717';

// Tamaño normal vs. tamaño al pasar el mouse por la fila correspondiente en la lista — la animación
// interpola entre ambos a mano con requestAnimationFrame (los Marker clásicos de Google Maps no
// tienen transición CSS, hay que redibujar el ícono frame a frame para que se vea suave).
const STOP_MARKER_BASE_SCALE = 15;
const STOP_MARKER_HOVER_SCALE = 22;
const STOP_MARKER_BASE_FONT = 12;
const STOP_MARKER_HOVER_FONT = 16;

// Traba compartida para que, si este panel está abierto a la vez en la compu del depósito y en un
// celular, solo UNO de los dos llame a Routes API (que se factura por llamada) y escriba el orden
// cuando entra un pedido nuevo o se abre el panel — sin esto, las dos pantallas recalculaban a la
// vez, duplicando la llamada, y quedaba guardado el orden de la que terminara última, sin ningún
// criterio. Es un documento en Firestore (recorridos/lockRecalculo) con una expiración corta: cada
// panel intenta "tomarlo" con una transacción (atómica — dos transacciones a la vez, una gana), y
// solo el que lo consigue sigue adelante. Si la pestaña que lo tomó se cuelga o pierde señal a
// mitad de camino, el lock vence solo a los 20s y no deja el recálculo trabado para siempre.
const RECALC_LOCK_TIMEOUT_MS = 20000;

async function tomarLockRecalculo() {
  try {
    return await runTransaction(db, async (t) => {
      const lockRef = doc(db, 'recorridos', 'lockRecalculo');
      const snap = await t.get(lockRef);
      const vigenteHasta = snap.exists() ? (snap.data().vigenteHasta || 0) : 0;
      if (vigenteHasta > Date.now()) return false; // otro panel ya lo tiene y todavía no venció
      t.set(lockRef, { vigenteHasta: Date.now() + RECALC_LOCK_TIMEOUT_MS });
      return true;
    });
  } catch {
    // Si la transacción falla (ej. sin señal), no bloqueamos el cálculo local — preferible el
    // riesgo de duplicar una llamada a Google antes que dejar a Norman sin recorrido calculado.
    return true;
  }
}

// Libera el lock apenas termina, sin esperar a que vença solo — así el próximo recálculo (otro
// pedido nuevo, el otro panel) no tiene que esperar los 20s completos si este ya terminó antes.
async function liberarLockRecalculo() {
  try { await setDoc(doc(db, 'recorridos', 'lockRecalculo'), { vigenteHasta: 0 }, { merge: true }); } catch {}
}

function animarEscalaMarcador(marker, agrandar) {
  if (!marker) return;
  const icon = marker.getIcon();
  if (!icon) return;
  const label = marker.getLabel();
  const fromScale = icon.scale || STOP_MARKER_BASE_SCALE;
  const toScale = agrandar ? STOP_MARKER_HOVER_SCALE : STOP_MARKER_BASE_SCALE;
  if (Math.abs(fromScale - toScale) < 0.1) return;
  const fromFont = (label && typeof label === 'object' && parseInt(label.fontSize)) || STOP_MARKER_BASE_FONT;
  const toFont = agrandar ? STOP_MARKER_HOVER_FONT : STOP_MARKER_BASE_FONT;
  if (marker.__scaleRaf) cancelAnimationFrame(marker.__scaleRaf);
  if (agrandar) marker.setZIndex(999); // encima de todo mientras crece
  const start = performance.now();
  const duration = 180;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cúbico
    marker.setIcon({ ...icon, scale: fromScale + (toScale - fromScale) * eased });
    if (label && typeof label === 'object') {
      marker.setLabel({ ...label, fontSize: `${fromFont + (toFont - fromFont) * eased}px` });
    }
    if (t < 1) {
      marker.__scaleRaf = requestAnimationFrame(step);
    } else if (!agrandar) {
      marker.setZIndex(marker.__baseZIndex || 1);
    }
  };
  marker.__scaleRaf = requestAnimationFrame(step);
}

// Hora en que se mandó el mensaje del pedido (createdAt) — solo hora:minuto, no hace falta la
// fecha completa acá (todo lo que aparece en este panel es del reparto de hoy).
const formatHora = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

function LoginReparto({ dm, onAuth }) {
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
            <h1 className={`text-sm font-black leading-tight ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>Reparto en Moto</h1>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Clave de seguridad</label>
            <input type="password" value={pwd} autoFocus onChange={e => { setPwd(e.target.value); setErr(false); }} placeholder="••••••••••••"
              className={`w-full px-3 py-3 text-base rounded-xl border outline-none transition-all focus:ring-2 focus:ring-indigo-500/30 ${err ? 'border-red-500/60 bg-red-500/5' : dm ? 'bg-[#1a1a1a] border-white/[0.08] text-zinc-100 placeholder-zinc-600' : 'bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400'}`} />
            {err && <p className="text-xs text-red-400 mt-1.5 font-medium">Clave incorrecta</p>}
          </div>
          <button type="submit" className="w-full h-12 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]" style={{ background: '#6366f1' }}>Ingresar</button>
        </form>
      </div>
    </div>
  );
}

// Una parada arrastrable de la lista. La posición 1 se vuelve no-arrastrable (disabled en
// useSortable) cuando el repartidor ya salió — dnd-kit se encarga de que no reaccione al drag,
// acá solo hace falta marcarla visualmente distinta (candado + sin agarradera). El bloqueo se
// puede sacar a mano tocando "Desbloquear" (ver handleDesbloquear) para corregir el orden igual.
function StopRow({ dm, pedido, index, locked, expanded, onToggleExpand, onBorrar, onDesbloquear, onHoverStart, onHoverEnd }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pedido.id, disabled: locked });
  const style = {
    transform: DndCSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  const zona = ZONAS_POR_ID[pedido.direccion?.zona];
  const caliente = zona?.temperatura === 'caliente';

  return (
    <div ref={setNodeRef} style={style} onMouseEnter={() => onHoverStart(pedido.id)} onMouseLeave={() => onHoverEnd(pedido.id)}
      className={`p-4 transition-colors ${locked ? (dm ? 'bg-indigo-500/[0.06]' : 'bg-indigo-50') : (dm ? 'hover:bg-white/[0.03]' : 'hover:bg-zinc-50')}`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black flex-shrink-0 ${locked ? 'bg-indigo-500 text-white' : (dm ? 'bg-white/[0.08] text-zinc-300' : 'bg-zinc-100 text-zinc-600')}`}>
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {locked && (
              <button onClick={() => onDesbloquear(pedido)} title="Desbloquear esta parada para poder moverla"
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-indigo-400 hover:text-indigo-300">
                <Lock size={11}/> En camino · Desbloquear
              </button>
            )}
            <span className={`flex items-center gap-1 text-[10px] font-bold ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>
              <Clock size={11}/> {formatHora(pedido.createdAt)}
            </span>
            {zona && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${caliente ? 'bg-red-500/10 text-red-400' : 'bg-sky-500/10 text-sky-400'}`}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: caliente ? '#f87171' : '#38bdf8' }}/>
                {zona.nombre.replace(/^Zona \S+ — /, '')}
              </span>
            )}
            {/* Norman ya intentó esta parada antes y no se pudo — se anota en el pedido desde
                RepartoMoto (botón "No pude entregar"), esto solo lo muestra acá también para que
                depósito lo vea sin tener que preguntarle. */}
            {pedido.intentosFallidos?.length > 0 && (
              <span title={pedido.intentosFallidos[pedido.intentosFallidos.length - 1].motivo}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${dm ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                <AlertTriangle size={10}/> {pedido.intentosFallidos.length === 1 ? '1 intento fallido' : `${pedido.intentosFallidos.length} intentos fallidos`}
              </span>
            )}
          </div>
          <p className={`text-sm font-bold leading-snug ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>{pedido.direccion?.texto}</p>
          {pedido.direccion?.referencias && (
            <p className={`text-xs mt-0.5 ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>{pedido.direccion.referencias}</p>
          )}
          <button onClick={() => onToggleExpand(pedido.id)} className={`flex items-center gap-1 text-xs font-bold mt-2 ${dm ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-700'}`}>
            {expanded ? 'Ocultar mensaje' : 'Ver mensaje original'} {expanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
          </button>
          {expanded && (
            <p className={`text-xs mt-2 whitespace-pre-wrap rounded-lg p-2.5 ${dm ? 'bg-white/[0.03] text-zinc-400' : 'bg-zinc-50 text-zinc-600'}`}>{pedido.mensaje}</p>
          )}
        </div>
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          {locked ? (
            <div className="p-2"><Lock size={16} className="text-indigo-400"/></div>
          ) : (
            <button {...attributes} {...listeners} className={`p-2 -m-1 rounded-lg cursor-grab active:cursor-grabbing touch-none ${dm ? 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06]' : 'text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100'}`}>
              <GripVertical size={18}/>
            </button>
          )}
          <button onClick={() => onBorrar(pedido)} title="Borrar pedido del reparto"
            className={`p-2 -m-1 rounded-lg transition-colors active:scale-90 ${dm ? 'text-zinc-600 hover:text-red-400 hover:bg-red-500/10' : 'text-zinc-400 hover:text-red-500 hover:bg-red-50'}`}>
            <Trash2 size={16}/>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RepartoDeposito() {
  const [dm, setDm] = useState(() => localStorage.getItem('028_dark_mode') === 'true');
  const [auth, setAuth] = useState(() => !!localStorage.getItem(AUTH_KEY));
  const [pedidos, setPedidos] = useState([]);
  const [recorrido, setRecorrido] = useState(null);
  const [repartidorActivo, setRepartidorActivo] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [computing, setComputing] = useState(false);
  const [toast, setToast] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const seenIdsRef = useRef(new Set());
  const firstLoadRef = useRef(true);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const markersByIdRef = useRef({});
  const origenMarkerRef = useRef(null);
  // El script de Google Maps tarda en cargar; si las paradas ya llegaron de Firestore ANTES de
  // que el mapa termine de crearse, el efecto que dibuja los puntos corre una vez con
  // mapRef.current todavía en null, no dibuja nada, y como stopsOrdenadas no cambia por sí solo
  // (recién cuando entra/sale un pedido), los puntos quedaban sin aparecer hasta que pasara algo
  // más. mapReady fuerza a que ese efecto se vuelva a correr apenas el mapa esté listo.
  const [mapReady, setMapReady] = useState(false);

  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3000); };
  useEffect(() => { localStorage.setItem('028_dark_mode', dm); }, [dm]);

  useEffect(() => {
    const q = query(collection(db, 'pedidos'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => setPedidos(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => console.error('pedidos:', err));
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, 'recorridos', 'activo'), snap => {
      setRecorrido(snap.exists() ? snap.data() : { estado: 'en_deposito', salidaEn: null, paradaCongelada: null });
    }, err => console.error('recorrido:', err));
  }, []);

  // Norman se marca activo/inactivo desde su propia pantalla (arriba a la derecha) — acá solo se
  // muestra, es de solo lectura.
  useEffect(() => {
    return onSnapshot(doc(db, 'recorridos', 'repartidor'), snap => {
      setRepartidorActivo(snap.exists() ? snap.data().activo !== false : true);
    }, err => console.error('repartidor:', err));
  }, []);

  // Paradas activas de moto: armadas (ya empaquetadas), no entregadas todavía, con dirección cargada.
  const stopsRaw = useMemo(() =>
    pedidos.filter(p => p.tipoEnvio === 'moto' && p.estado === 'armado' && p.direccion),
    [pedidos]);

  const stopsOrdenadas = useMemo(() =>
    [...stopsRaw].sort((a, b) => (a.ordenRecorrido ?? 999) - (b.ordenRecorrido ?? 999)),
    [stopsRaw]);

  const enCalle = recorrido?.estado === 'en_calle';
  const paradaCongeladaId = enCalle ? recorrido?.paradaCongelada : null;

  // --- Mapa (columna derecha, solo visible en pantallas grandes — ver JSX) ---
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
      origenMarkerRef.current = new maps.Marker({
        map: mapRef.current,
        position: { lat: DEPOSITO_ORIGEN.lat, lng: DEPOSITO_ORIGEN.lng },
        icon: { path: maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#a1a1aa', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
        title: 'Depósito',
        zIndex: 1,
      });
      setMapReady(true);
    }).catch(err => console.error('Google Maps no cargó:', err));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Repinta el mapa ya creado al tocar el toggle de modo claro/oscuro — la creación de arriba solo
  // corre una vez, así que el cambio de estilo en caliente necesita este segundo efecto aparte.
  useEffect(() => {
    mapRef.current?.setOptions({ styles: dm ? MAP_DARK_STYLE : MAP_LIGHT_STYLE });
  }, [dm]);

  // Mismos marcadores numerados que en la pantalla del motomensajero — se redibujan enteros cada
  // vez que cambia el orden, así no quedan marcadores fantasma con la librería clásica de Marker.
  useEffect(() => {
    if (!mapRef.current || typeof window === 'undefined' || !window.google) return;
    const maps = window.google.maps;
    markersRef.current.forEach(m => m.setMap(null));
    markersByIdRef.current = {};
    markersRef.current = stopsOrdenadas.map((p, i) => {
      const caliente = ZONAS_POR_ID[p.direccion?.zona]?.temperatura === 'caliente';
      const marker = new maps.Marker({
        map: mapRef.current,
        position: { lat: p.direccion.lat, lng: p.direccion.lng },
        label: { text: String(i + 1), color: '#fff', fontWeight: '700', fontSize: `${STOP_MARKER_BASE_FONT}px` },
        zIndex: i + 2,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: STOP_MARKER_BASE_SCALE,
          fillColor: p.id === paradaCongeladaId ? '#6366f1' : (caliente ? '#f87171' : '#38bdf8'),
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
      });
      marker.__baseZIndex = i + 2;
      markersByIdRef.current[p.id] = marker;
      return marker;
    });

    const bounds = new maps.LatLngBounds();
    bounds.extend({ lat: DEPOSITO_ORIGEN.lat, lng: DEPOSITO_ORIGEN.lng });
    stopsOrdenadas.forEach(p => bounds.extend({ lat: p.direccion.lat, lng: p.direccion.lng }));
    mapRef.current.fitBounds(bounds, 60);

    // Si ya había una fila en hover cuando se redibujaron los marcadores (ej. cambió el orden),
    // el nuevo marcador de esa parada arranca en tamaño normal — lo re-agranda de una.
    if (hoveredId && markersByIdRef.current[hoveredId]) {
      animarEscalaMarcador(markersByIdRef.current[hoveredId], true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsOrdenadas, paradaCongeladaId, mapReady]);

  // Anima el marcador correspondiente cada vez que cambia qué fila está en hover — agranda el
  // nuevo, achica el que se acaba de dejar de hoverear (si el efecto de arriba ya lo recreó, esto
  // es un no-op inofensivo sobre el marcador nuevo que ya está en tamaño base).
  useEffect(() => {
    Object.entries(markersByIdRef.current).forEach(([id, marker]) => {
      animarEscalaMarcador(marker, id === hoveredId);
    });
  }, [hoveredId]);

  // Recalcula y persiste el orden. Se llama solo al montar (abrir el panel) y cuando aparece un
  // pedido nuevo en el grupo — nunca en cada render ni por ningún timer. Antes de llamar a Routes
  // API intenta tomar el lock compartido (ver comentario junto a tomarLockRecalculo): si otro
  // panel ya está calculando en este mismo momento, esta llamada se corta acá, sin gastar una
  // llamada a Google — el resultado del que sí calculó llega solo por el onSnapshot de pedidos.
  const recalcularYGuardar = async (lista) => {
    if (lista.length === 0) return;
    const tieneLock = await tomarLockRecalculo();
    if (!tieneLock) return;
    setComputing(true);
    try {
      const ordenado = await computeRecorrido({ pedidos: lista, paradaCongeladaId });
      const ordenMap = ordenAPersistir(ordenado);
      const batch = writeBatch(db);
      ordenado.forEach((p, i) => {
        // La parada congelada no se toca (ni su orden ni ordenManual); el resto, si veníamos en
        // modo auto, se guarda tal cual salió del cálculo (ordenManual se deja como estaba).
        if (p.id === paradaCongeladaId) return;
        batch.update(doc(db, 'pedidos', p.id), { ordenRecorrido: i + 1 });
      });
      await batch.commit();
    } catch (e) {
      console.error('Error calculando recorrido:', e);
      showToast('No se pudo calcular el recorrido: ' + e.message, 'error');
    } finally {
      setComputing(false);
      await liberarLockRecalculo();
    }
  };

  // Trigger 1: abrir el panel — recalcula una vez al montar si hay paradas.
  useEffect(() => {
    if (!auth || !firstLoadRef.current) return;
    if (stopsRaw.length === 0) return;
    firstLoadRef.current = false;
    seenIdsRef.current = new Set(stopsRaw.map(p => p.id));
    recalcularYGuardar(stopsRaw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, stopsRaw.length]);

  // Trigger 2: entra un pedido nuevo al recorrido — recalcula solo cuando aparece un id que no
  // había visto antes (no cuando uno desaparece por haberse entregado: eso lo recalcula y persiste
  // quien marca la entrega, en la pantalla del motomensajero, para no duplicar la llamada).
  useEffect(() => {
    if (firstLoadRef.current) return;
    const currentIds = new Set(stopsRaw.map(p => p.id));
    const hayNuevo = [...currentIds].some(id => !seenIdsRef.current.has(id));
    seenIdsRef.current = currentIds;
    if (hayNuevo) recalcularYGuardar(stopsRaw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsRaw]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  );

  // Reordenar a mano: se persiste directo (sin llamar a Routes API — el usuario ya decidió el
  // orden, no hace falta que Google lo "corrija"). Marca ordenManual=true en todo lo que no sea
  // la parada congelada, así un pedido nuevo que entre después se agrega al final sin tocar esto.
  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = stopsOrdenadas.map(p => p.id);
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    // La parada congelada nunca participa del drag (useSortable la tiene disabled), pero por las
    // dudas se la excluye acá también de cualquier reordenamiento resultante.
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

  // Borra un pedido del reparto: se cancela (mismo estado que "Cancelar pedido" en /pedidos, así
  // queda su historial en Cancelados) y se saca de la lista de paradas. Si era la parada congelada
  // (el repartidor ya venía en camino para ahí), no queda "colgada" — se recalcula el recorrido de
  // lo que queda arrancando de cero (paradaCongeladaId null) y se anota la nueva parada 1 como
  // congelada, igual que hace la pantalla del motomensajero al marcar una entrega.
  const handleBorrarPedido = async (pedido) => {
    if (!window.confirm(`¿Borrar "${pedido.direccion?.texto || 'este pedido'}" del reparto? Se cancela el pedido.`)) return;
    const wasFrozen = pedido.id === paradaCongeladaId;
    try {
      await updateDoc(doc(db, 'pedidos', pedido.id), {
        estado: 'cancelado',
        canceladoAt: new Date().toISOString(),
        motivoCancelacion: 'Borrado desde el panel de reparto',
      });
      const restantes = stopsRaw.filter(p => p.id !== pedido.id);
      if (restantes.length === 0) {
        if (wasFrozen) await setDoc(doc(db, 'recorridos', 'activo'), { estado: 'en_deposito', salidaEn: null, paradaCongelada: null });
      } else if (wasFrozen) {
        const ordenado = await computeRecorrido({ pedidos: restantes, paradaCongeladaId: null });
        const batch = writeBatch(db);
        ordenado.forEach((p, i) => batch.update(doc(db, 'pedidos', p.id), { ordenRecorrido: i + 1 }));
        await batch.commit();
        await setDoc(doc(db, 'recorridos', 'activo'), { estado: recorrido?.estado || 'en_calle', salidaEn: recorrido?.salidaEn || null, paradaCongelada: ordenado[0].id });
      } else {
        await recalcularYGuardar(restantes);
      }
      showToast('Pedido borrado del reparto');
    } catch (e) {
      showToast('Error al borrar: ' + e.message, 'error');
    }
  };

  // Desbloqueo manual y puntual de la parada congelada: por defecto queda fija mientras Norman
  // está en la calle (ver StopRow), pero a veces hace falta corregir el orden igual (se cargó mal,
  // cambió de planes, etc.). Solo saca el candado — no toca el orden ni el estado del recorrido —
  // así que vuelve a quedar arrastrable como cualquier otra parada hasta que Norman entregue de
  // nuevo (ahí RepartoMoto vuelve a congelar la nueva parada 1 automáticamente).
  const handleDesbloquear = async (pedido) => {
    if (!window.confirm(`¿Desbloquear "${pedido.direccion?.texto || 'esta parada'}"? Se va a poder mover de lugar aunque Norman ya haya salido para ahí.`)) return;
    try {
      await setDoc(doc(db, 'recorridos', 'activo'), { estado: recorrido?.estado || 'en_calle', salidaEn: recorrido?.salidaEn || null, paradaCongelada: null });
      showToast('Parada desbloqueada');
    } catch (e) {
      showToast('Error al desbloquear: ' + e.message, 'error');
    }
  };

  // Sin clave — esta pantalla (y /pedidos y /reparto) queda sin login a propósito, la usan
  // Jero/depósito directo desde el celular. El resto del sistema sigue pidiendo clave.

  return (
    <div className={`min-h-screen ${dm ? 'bg-[#050505] text-zinc-100' : 'bg-slate-50 text-zinc-900'}`} style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className={`sticky top-0 z-20 border-b backdrop-blur-xl ${dm ? 'bg-[#101010]/90 border-white/[0.06]' : 'bg-white/90 border-zinc-200'}`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-[1400px] mx-auto px-4 lg:max-w-none lg:mx-0 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link to="/pedidos" className={`p-2 -ml-2 rounded-lg transition-colors ${dm ? 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06]' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}><ArrowLeft size={18}/></Link>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#6366f1' }}><Bike size={16} className="text-white" /></div>
            <p className="font-black text-sm tracking-tight truncate">Reparto en Moto</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setDm(v => !v)} className={`p-2.5 rounded-lg transition-colors ${dm ? 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06]' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}>{dm ? <Sun size={17}/> : <Moon size={17}/>}</button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-4 lg:max-w-none lg:mx-0 lg:flex lg:items-start lg:gap-6" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>

        {/* Columna izquierda: estado + lista de paradas (siempre visible, es lo que se usa en el celular).
            En pantallas grandes va pegada al borde izquierdo de la pantalla (el contenedor de arriba
            ya no está centrado con max-width en lg), con ancho fijo angosto tipo panel lateral. */}
        <div className="max-w-lg mx-auto lg:mx-0 lg:max-w-none lg:w-[560px] lg:flex-shrink-0 space-y-4">

          {/* Estado del repartidor: fundamental para saber si la parada 1 se puede mover */}
          <div className={`rounded-2xl border p-4 flex items-center gap-3 ${enCalle ? (dm ? 'bg-emerald-500/[0.08] border-emerald-500/30' : 'bg-emerald-50 border-emerald-200') : (dm ? 'bg-[#141414] border-white/[0.07]' : 'bg-white border-zinc-200')}`}>
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${enCalle ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`}/>
            <div className="min-w-0">
              <p className={`text-sm font-black ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>{enCalle ? 'Norman está en la calle' : 'Norman está en el depósito'}</p>
              <p className="text-[11px] text-zinc-500">{enCalle ? 'La parada 1 quedó fija — está yendo para ahí (se puede desbloquear abajo)' : 'Todavía no salió a repartir: se puede mover cualquier parada'}</p>
            </div>
            <span className={`flex items-center gap-1.5 h-7 pl-2 pr-2.5 rounded-full text-[11px] font-bold flex-shrink-0 ml-auto ${
              repartidorActivo
                ? (dm ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-700')
                : (dm ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-200 text-zinc-600')
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${repartidorActivo ? 'bg-emerald-400' : 'bg-zinc-500'}`}/>
              {repartidorActivo ? 'Activo' : 'Inactivo'}
            </span>
            {computing && <Loader2 size={16} className="animate-spin text-zinc-500 flex-shrink-0"/>}
          </div>

          {stopsOrdenadas.length === 0 ? (
            <div className={`rounded-3xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 text-center ${dm ? 'border-white/[0.08] bg-white/[0.02]' : 'border-zinc-200 bg-zinc-50'}`}>
              <PartyPopper size={32} className={dm ? 'text-zinc-600' : 'text-zinc-300'} />
              <p className={`text-sm font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-500'}`}>No hay paradas de moto armadas ahora mismo.</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={stopsOrdenadas.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <div className={`rounded-3xl border overflow-hidden divide-y ${dm ? 'bg-[#141414] border-white/[0.07] divide-white/[0.07]' : 'bg-white border-zinc-200 divide-zinc-100'}`}>
                  {stopsOrdenadas.map((p, i) => (
                    <StopRow key={p.id} dm={dm} pedido={p} index={i} locked={p.id === paradaCongeladaId}
                      expanded={expandedId === p.id} onToggleExpand={id => setExpandedId(cur => cur === id ? null : id)}
                      onBorrar={handleBorrarPedido} onDesbloquear={handleDesbloquear}
                      onHoverStart={setHoveredId} onHoverEnd={id => setHoveredId(cur => cur === id ? null : cur)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Columna derecha: mapa — solo en pantallas grandes (computadora), en el celular no aporta
            tanto como la lista y se prioriza el espacio para eso. */}
        <div className="hidden lg:block lg:flex-1 lg:sticky lg:top-[76px] lg:self-start">
          <div ref={mapDivRef} className={`w-full rounded-3xl border overflow-hidden ${dm ? 'border-white/[0.07] bg-[#141414]' : 'border-zinc-200 bg-zinc-100'}`} style={{ height: 'calc(100vh - 100px)' }} />
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 z-50 border max-w-[90vw] ${toast.type === 'error' ? 'bg-red-600/95 border-red-500 text-white' : 'bg-zinc-900/95 border-white/10 text-white'}`}>
          {toast.type === 'error' ? <XCircle size={16}/> : <CheckCircle size={16} className="text-emerald-400"/>}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
