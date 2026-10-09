import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore, getFirestore, collection, query, where, orderBy, limit, onSnapshot,
  doc, setDoc, addDoc, increment,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import {
  ScanBarcode, Moon, Sun, Trash2, CheckCircle, XCircle, Loader2, PackagePlus,
  PackageMinus, Pencil, Search, X, History,
} from 'lucide-react';

// --- Firebase: mismo patrón self-contenido que PedidosPage.jsx / RepartoMoto.jsx ---
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
  db = initializeFirestore(fbApp, {
    experimentalForceLongPolling: true,
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch { db = getFirestore(fbApp); }
if (!db) db = getFirestore(fbApp);

// Sin clave a propósito, mismo criterio que Pedidos y Reparto: la usa el depósito desde el celular
// o desde la compu al lado de la lectora, no hace falta loguearse cada vez. No muestra ningún
// número del negocio (ventas, ganancias, billeteras) — solo stock entrando y saliendo.

const formatMoney = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);
const rid = () => Math.random().toString(36).slice(2, 11);
const accountLabel = (acc) => {
  if (acc === 'SIN_CUENTA') return 'Sin cuenta';
  if (acc === 'GALICIA_GIECO') return 'Galicia Gieco';
  if (acc === 'MERCADO_PAGO') return 'Mercado Pago';
  if (acc === 'CUENTA_RECAUDADORA') return 'Cuenta Recaudadora';
  return acc;
};
const ACCOUNTS = ['LEMON', 'AHORROS', 'GALICIA', 'GALICIA_GIECO', 'MERCADO_PAGO', 'CUENTA_RECAUDADORA', 'EFECTIVO', 'USDT', 'USD', 'SIN_CUENTA'];
const BATCH_CATEGORIES = ['THC', 'APPLE', 'PERFUMES', 'NICOTINA'];

// Única vía para mover saldos de billetera — mismo patrón y mismo motivo que applyWalletDeltas en
// App.jsx (increment() en vez de leer+escribir el objeto entero, así una escritura de acá no pisa
// lo que otra pantalla mueva al mismo tiempo).
async function applyWalletDeltas(deltas) {
  const patch = {};
  for (const [acc, delta] of Object.entries(deltas || {})) {
    if (!acc || !delta || !Number.isFinite(delta)) continue;
    patch[acc] = increment(delta);
  }
  if (Object.keys(patch).length === 0) return;
  await setDoc(doc(db, 'settings', 'wallets'), patch, { merge: true });
}

const formatFechaHora = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const formatFechaCorta = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
};

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
function CajaEscaneo({ dm, onScan, disabled }) {
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
function RegistrarCodigoModal({ dm, codigo, productosConocidos, onGuardar, onCancelar }) {
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
            <input value={product} onChange={e => setProduct(e.target.value)} autoFocus list="escaner-productos"
              placeholder="Ej: Elfbar Ice"
              className={`h-12 border rounded-xl px-3.5 w-full text-base outline-none mt-1 ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'}`} />
            <datalist id="escaner-productos">{productosConocidos.map(p => <option key={p.product} value={p.product} />)}</datalist>
          </div>
          <div>
            <label className={`text-xs font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Variante / sabor (opcional)</label>
            <input value={variant} onChange={e => setVariant(e.target.value)} list="escaner-variantes"
              placeholder="Ej: Cherry Strazz"
              className={`h-12 border rounded-xl px-3.5 w-full text-base outline-none mt-1 ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'}`} />
            <datalist id="escaner-variantes">{variantesDelProducto.map(v => <option key={v} value={v} />)}</datalist>
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

// Una fila de la sesión (entrada o salida) — cantidad siempre editable (sirve tanto para escanear
// unidad por unidad como para escanear una vez y tipear el total que llegó), costo solo en Entrada.
function FilaSesion({ dm, item, mostrarCosto, onCambiar, onQuitar }) {
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
        <span className={`text-xs font-bold w-20 text-right flex-shrink-0 ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>{formatMoney(total)}</span>
      )}
      <button onClick={onQuitar} className={`p-2 -m-1 rounded-lg flex-shrink-0 ${dm ? 'text-zinc-600 hover:text-red-400 hover:bg-red-500/10' : 'text-zinc-400 hover:text-red-500 hover:bg-red-50'}`}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export default function EscanerPage() {
  const [dm, setDm] = useState(() => localStorage.getItem('028_dark_mode') === 'true');
  useEffect(() => { localStorage.setItem('028_dark_mode', dm); }, [dm]);
  const [tab, setTab] = useState('entrada'); // 'entrada' | 'salida' | 'codigos'
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 2800); };

  // Códigos ya aprendidos — se escuchan en vivo (son pocos, entran todos de una, y así un código
  // recién registrado en esta misma pestaña o en otro celular se reconoce al instante).
  const [codigosBarra, setCodigosBarra] = useState({}); // { [codigo]: { product, variant } }
  useEffect(() => {
    return onSnapshot(collection(db, 'codigosBarra'), snap => {
      const mapa = {};
      snap.forEach(d => { mapa[d.id] = d.data(); });
      setCodigosBarra(mapa);
    }, () => {});
  }, []);

  // Stock real (todos los lotes), solo para armar las sugerencias de producto/variante al registrar
  // un código nuevo — así el nombre que se carga acá coincide con el que ya usan Ventas y Pedidos,
  // en vez de inventar una variación más del mismo nombre.
  const [batches, setBatches] = useState([]);
  useEffect(() => {
    return onSnapshot(collection(db, 'batches'), snap => setBatches(snap.docs.map(d => d.data())), () => {});
  }, []);
  const productosConocidos = useMemo(() => {
    const mapa = new Map();
    batches.forEach(b => (b.items || []).forEach(it => {
      if (!it.product) return;
      if (!mapa.has(it.product)) mapa.set(it.product, new Set());
      if (it.variant && it.variant !== 'Único') mapa.get(it.product).add(it.variant);
    }));
    return Array.from(mapa.entries()).map(([product, vs]) => ({ product, variantes: Array.from(vs).sort() })).sort((a, b) => a.product.localeCompare(b.product));
  }, [batches]);

  // Código recién escaneado que no se reconoce — mientras esto no sea null, el modal de registro
  // está abierto. `destino` dice a qué sesión (entrada/salida) va a parar una vez confirmado.
  const [codigoSinRegistrar, setCodigoSinRegistrar] = useState(null); // { codigo, destino }

  const registrarCodigo = async ({ product, variant }) => {
    const { codigo, destino } = codigoSinRegistrar;
    await setDoc(doc(db, 'codigosBarra', codigo), { codigo, product, variant, createdAt: new Date().toISOString() });
    agregarASesion(destino, { codigo, product, variant });
    setCodigoSinRegistrar(null);
    showToast(`Registrado: ${product}${variant !== 'Único' ? ' · ' + variant : ''}`);
  };

  // ── Sesión de ENTRADA ──────────────────────────────────────────────────────────────────────
  const [sesionEntrada, setSesionEntrada] = useState([]);
  const [nombreLote, setNombreLote] = useState('');
  const [cuentaLote, setCuentaLote] = useState('');
  const [categoriaLote, setCategoriaLote] = useState('');
  const [sinGastoLote, setSinGastoLote] = useState(false);
  const [creandoLote, setCreandoLote] = useState(false);

  // ── Sesión de SALIDA ───────────────────────────────────────────────────────────────────────
  const [sesionSalida, setSesionSalida] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [pedidoSel, setPedidoSel] = useState(null);
  const [busquedaPedido, setBusquedaPedido] = useState('');
  const [guardandoSalida, setGuardandoSalida] = useState(false);
  useEffect(() => {
    // Solo los que todavía se pueden estar empaquetando — entregados/finalizados/cancelados no
    // tiene sentido ofrecerlos acá.
    const q = query(collection(db, 'pedidos'), where('estado', 'in', ['pendiente', 'armado']));
    return onSnapshot(q, snap => setPedidos(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
  }, []);
  const pedidosFiltrados = useMemo(() => {
    const t = busquedaPedido.trim().toLowerCase();
    if (!t) return [];
    return pedidos.filter(p => `${p.cliente || ''} ${p.mensaje || ''}`.toLowerCase().includes(t)).slice(0, 8);
  }, [pedidos, busquedaPedido]);

  // Agrega (o suma +1 si ya estaba) un ítem a la sesión que corresponda. Compartido entre Entrada y
  // Salida: el único código que cambia entre una y otra es qué lista de estado se actualiza.
  const agregarASesion = (destino, { codigo, product, variant }) => {
    const setSesion = destino === 'entrada' ? setSesionEntrada : setSesionSalida;
    setSesion(prev => {
      const existe = prev.find(it => it.codigo === codigo);
      if (existe) return prev.map(it => it.codigo === codigo ? { ...it, cantidad: (parseInt(it.cantidad) || 0) + 1 } : it);
      return [...prev, { uid: rid(), codigo, product, variant, cantidad: 1, costo: '' }];
    });
  };

  const handleScan = (destino) => (codigoCrudo) => {
    const codigo = codigoCrudo.trim();
    if (!codigo) return;
    const conocido = codigosBarra[codigo];
    if (conocido) { agregarASesion(destino, { codigo, product: conocido.product, variant: conocido.variant }); return; }
    setCodigoSinRegistrar({ codigo, destino });
  };

  const cambiarFilaEntrada = (uid, patch) => setSesionEntrada(s => s.map(it => it.uid === uid ? { ...it, ...patch } : it));
  const quitarFilaEntrada = (uid) => setSesionEntrada(s => s.filter(it => it.uid !== uid));
  const cambiarFilaSalida = (uid, patch) => setSesionSalida(s => s.map(it => it.uid === uid ? { ...it, ...patch } : it));
  const quitarFilaSalida = (uid) => setSesionSalida(s => s.filter(it => it.uid !== uid));

  const totalEntrada = sesionEntrada.reduce((s, it) => s + (parseFloat(it.costo) || 0) * (parseInt(it.cantidad) || 0), 0);
  const puedeCrearLote = sesionEntrada.length > 0 && cuentaLote && !creandoLote &&
    sesionEntrada.every(it => (parseInt(it.cantidad) || 0) > 0 && (parseFloat(it.costo) || 0) > 0);

  // Mismo resultado que armar el lote a mano en Gestión 028 (Lotes → Agregar producto), ítem por
  // ítem: cada producto escaneado queda con su propio id, su costo y su stock inicial = lo
  // escaneado. Si el lote no está marcado "sin gasto", cada ítem con costo anota un movimiento de
  // "stock" en Gastos y la cuenta elegida se descuenta — igual que hace Gestión 028, para que la
  // plata y el stock queden sincronizados sin que haya que repetir la carga a mano después.
  const handleCrearLote = async () => {
    if (!puedeCrearLote) return;
    setCreandoLote(true);
    try {
      const nowIso = new Date().toISOString();
      const nombre = nombreLote.trim() || `Escaneo ${formatFechaCorta(nowIso)}`;
      const items = sesionEntrada.map(it => ({
        id: Date.now() + '-' + rid(),
        product: it.product,
        variant: it.variant || 'Único',
        costArs: parseFloat(it.costo) || 0,
        initialStock: parseInt(it.cantidad) || 0,
        currentStock: parseInt(it.cantidad) || 0,
        codigoBarra: it.codigo,
      }));
      const batchRef = await addDoc(collection(db, 'batches'), {
        name: nombre, createdAt: nowIso, items,
        account: cuentaLote, category: categoriaLote || null, skipExpense: sinGastoLote,
      });
      if (!sinGastoLote) {
        for (const it of items) {
          const itemCost = it.costArs * it.initialStock;
          if (itemCost <= 0) continue;
          await addDoc(collection(db, 'cashFlow'), {
            type: 'stock', account: cuentaLote, date: nowIso,
            description: `Compra stock: ${it.product}${it.variant !== 'Único' ? ' / ' + it.variant : ''} (${nombre})`,
            amount: itemCost, batchId: batchRef.id, batchName: nombre, itemId: it.id,
          });
        }
        if (totalEntrada > 0) await applyWalletDeltas({ [cuentaLote]: -totalEntrada });
      }
      showToast(`Lote "${nombre}" creado con ${items.length} producto${items.length === 1 ? '' : 's'}`);
      setSesionEntrada([]); setNombreLote(''); setCuentaLote(''); setCategoriaLote(''); setSinGastoLote(false);
    } catch (e) {
      showToast('Error al crear el lote: ' + e.message, 'error');
    } finally {
      setCreandoLote(false);
    }
  };

  // Salida: SOLO un registro, a propósito — no toca currentStock ni billeteras. Si mañana hace
  // falta que también descuente stock, hay que decidir antes de qué lote exacto sale cada unidad
  // (el mismo producto puede estar repartido en varios lotes) — hasta que se defina eso, esto es
  // nada más que una bitácora de qué salió empaquetado y cuándo.
  const handleGuardarSalida = async () => {
    if (sesionSalida.length === 0 || guardandoSalida) return;
    setGuardandoSalida(true);
    try {
      await addDoc(collection(db, 'salidasDeposito'), {
        pedidoId: pedidoSel?.id || null,
        clienteTexto: pedidoSel ? (pedidoSel.cliente || (pedidoSel.mensaje || '').split('\n')[0].slice(0, 60)) : null,
        items: sesionSalida.map(it => ({ codigo: it.codigo, product: it.product, variant: it.variant, cantidad: parseInt(it.cantidad) || 0 })),
        createdAt: new Date().toISOString(),
      });
      showToast('Registro de salida guardado');
      setSesionSalida([]); setPedidoSel(null); setBusquedaPedido('');
    } catch (e) {
      showToast('Error al guardar: ' + e.message, 'error');
    } finally {
      setGuardandoSalida(false);
    }
  };

  // Historial de salidas — últimas 30, para que el registro sirva de algo (si nadie lo puede ver
  // después, es lo mismo que no anotarlo).
  const [historialSalidas, setHistorialSalidas] = useState([]);
  useEffect(() => {
    if (tab !== 'salida') return;
    return onSnapshot(query(collection(db, 'salidasDeposito'), orderBy('createdAt', 'desc'), limit(30)),
      snap => setHistorialSalidas(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
  }, [tab]);

  const [busquedaCodigos, setBusquedaCodigos] = useState('');
  const codigosLista = useMemo(() => {
    const t = busquedaCodigos.trim().toLowerCase();
    return Object.entries(codigosBarra)
      .map(([codigo, v]) => ({ codigo, ...v }))
      .filter(c => !t || c.codigo.includes(t) || c.product.toLowerCase().includes(t) || (c.variant || '').toLowerCase().includes(t))
      .sort((a, b) => a.product.localeCompare(b.product));
  }, [codigosBarra, busquedaCodigos]);
  const [editandoCodigo, setEditandoCodigo] = useState(null); // codigo en edición
  const [editProduct, setEditProduct] = useState('');
  const [editVariant, setEditVariant] = useState('');
  const guardarEdicionCodigo = async (codigo) => {
    if (!editProduct.trim()) return;
    await setDoc(doc(db, 'codigosBarra', codigo), { codigo, product: editProduct.trim(), variant: editVariant.trim() || 'Único', createdAt: codigosBarra[codigo]?.createdAt || new Date().toISOString() });
    setEditandoCodigo(null);
    showToast('Código actualizado');
  };

  return (
    <div className={`min-h-screen ${dm ? 'bg-[#050505] text-zinc-100' : 'bg-slate-50 text-zinc-900'}`} style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className={`sticky top-0 z-20 border-b backdrop-blur-xl ${dm ? 'bg-[#101010]/90 border-white/[0.06]' : 'bg-white/90 border-zinc-200'}`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#6366f1' }}><ScanBarcode size={16} className="text-white" /></div>
            <p className="font-black text-base tracking-tight truncate">Escáner de depósito</p>
          </div>
          <button onClick={() => setDm(v => !v)} className={`p-2.5 rounded-lg flex-shrink-0 transition-colors ${dm ? 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06]' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}>
            {dm ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
        <div className="px-4 pb-3 flex gap-2">
          {[
            { id: 'entrada', label: 'Entrada', icon: PackagePlus },
            { id: 'salida', label: 'Salida', icon: PackageMinus },
            { id: 'codigos', label: 'Códigos', icon: History },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all ${
                tab === t.id ? 'text-white' : (dm ? 'bg-white/[0.04] text-zinc-400' : 'bg-zinc-100 text-zinc-500')
              }`}
              style={tab === t.id ? { background: '#6366f1' } : undefined}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>

        {/* ─── ENTRADA ─── */}
        {tab === 'entrada' && (
          <>
            <CajaEscaneo dm={dm} onScan={handleScan('entrada')} disabled={!!codigoSinRegistrar} />

            {sesionEntrada.length === 0 ? (
              <div className={`rounded-3xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 text-center ${dm ? 'border-white/[0.08] bg-white/[0.02]' : 'border-zinc-200 bg-zinc-50'}`}>
                <PackagePlus size={32} className={dm ? 'text-zinc-600' : 'text-zinc-300'} />
                <p className={`text-sm font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-500'}`}>Escaneá lo que va entrando — acá se va a ir armando la lista.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <span className={`text-[11px] font-black uppercase tracking-widest px-1 ${dm ? 'text-zinc-600' : 'text-zinc-400'}`}>Escaneado ({sesionEntrada.length})</span>
                  {sesionEntrada.map(it => (
                    <FilaSesion key={it.uid} dm={dm} item={it} mostrarCosto
                      onCambiar={p => cambiarFilaEntrada(it.uid, p)} onQuitar={() => quitarFilaEntrada(it.uid)} />
                  ))}
                </div>

                <div className={`rounded-2xl border p-4 space-y-3 ${dm ? 'bg-[#101010] border-white/[0.07]' : 'bg-white border-zinc-200'}`}>
                  <input value={nombreLote} onChange={e => setNombreLote(e.target.value)} placeholder={`Nombre del lote (ej: Escaneo ${formatFechaCorta(new Date().toISOString())})`}
                    className={`h-12 border rounded-xl px-3.5 w-full text-base outline-none ${dm ? 'bg-[#0a0a0a] border-white/[0.07] text-zinc-100 placeholder-zinc-600' : 'bg-white border-zinc-200 text-zinc-900'}`} />
                  <div className="flex gap-2">
                    <select value={cuentaLote} onChange={e => setCuentaLote(e.target.value)}
                      className={`h-12 flex-1 border rounded-xl px-3 text-sm font-semibold outline-none ${dm ? 'bg-[#0a0a0a] border-white/[0.07] text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'}`}>
                      <option value="">-- Cuenta de compra --</option>
                      {ACCOUNTS.map(a => <option key={a} value={a}>{accountLabel(a)}</option>)}
                    </select>
                    <select value={categoriaLote} onChange={e => setCategoriaLote(e.target.value)}
                      className={`h-12 w-32 border rounded-xl px-3 text-sm font-semibold outline-none ${dm ? 'bg-[#0a0a0a] border-white/[0.07] text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'}`}>
                      <option value="">Categoría</option>
                      {BATCH_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <label className={`flex items-center gap-2 text-xs font-medium cursor-pointer ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>
                    <input type="checkbox" checked={sinGastoLote} onChange={e => setSinGastoLote(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                    No registrar como gasto en la billetera
                  </label>
                  {totalEntrada > 0 && (
                    <div className="flex justify-between items-center px-1">
                      <span className={`text-xs font-semibold ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>Total del lote</span>
                      <span className="text-lg font-black">{formatMoney(totalEntrada)}</span>
                    </div>
                  )}
                  <button onClick={handleCrearLote} disabled={!puedeCrearLote}
                    className="w-full h-14 rounded-xl font-black text-base text-white bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {creandoLote ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />} Crear lote
                  </button>
                  {!cuentaLote && <p className="text-[11px] text-amber-500 text-center">Elegí de qué cuenta sale la compra para poder crear el lote.</p>}
                </div>
              </>
            )}
          </>
        )}

        {/* ─── SALIDA ─── */}
        {tab === 'salida' && (
          <>
            <div className={`rounded-2xl border p-3 ${dm ? 'bg-[#101010] border-white/[0.07]' : 'bg-white border-zinc-200'}`}>
              {pedidoSel ? (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`text-[10px] font-black uppercase tracking-wide ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>Empaquetando el pedido de</p>
                    <p className={`text-sm font-bold truncate ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>{pedidoSel.cliente || (pedidoSel.mensaje || '').split('\n')[0]}</p>
                  </div>
                  <button onClick={() => setPedidoSel(null)} className={`p-2 rounded-lg flex-shrink-0 ${dm ? 'text-zinc-500 hover:bg-white/[0.06]' : 'text-zinc-400 hover:bg-zinc-100'}`}><X size={16} /></button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${dm ? 'text-zinc-600' : 'text-zinc-400'}`} />
                  <input value={busquedaPedido} onChange={e => setBusquedaPedido(e.target.value)}
                    placeholder="Buscar el pedido que se está empaquetando (opcional)..."
                    className={`h-11 w-full pl-9 pr-3 border rounded-xl text-sm outline-none ${dm ? 'bg-[#0a0a0a] border-white/[0.07] text-zinc-100 placeholder-zinc-600' : 'bg-white border-zinc-200 text-zinc-900'}`} />
                  {pedidosFiltrados.length > 0 && (
                    <div className={`mt-1.5 rounded-xl border overflow-hidden divide-y ${dm ? 'bg-[#161616] border-white/[0.1] divide-white/[0.06]' : 'bg-white border-zinc-200 divide-zinc-100'}`}>
                      {pedidosFiltrados.map(p => (
                        <button key={p.id} onClick={() => { setPedidoSel(p); setBusquedaPedido(''); }}
                          className={`w-full text-left px-3 py-2.5 text-sm ${dm ? 'hover:bg-white/[0.06] text-zinc-200' : 'hover:bg-zinc-50 text-zinc-800'}`}>
                          <span className="font-semibold">{p.cliente || 'Sin nombre'}</span>
                          <span className={`block text-[11px] truncate ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>{(p.mensaje || '').slice(0, 70)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className={`text-[11px] mt-1.5 ${dm ? 'text-zinc-600' : 'text-zinc-400'}`}>Si no lo elegís, el registro queda igual guardado, sin pedido asociado.</p>
                </div>
              )}
            </div>

            <CajaEscaneo dm={dm} onScan={handleScan('salida')} disabled={!!codigoSinRegistrar} />

            {sesionSalida.length === 0 ? (
              <div className={`rounded-3xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 text-center ${dm ? 'border-white/[0.08] bg-white/[0.02]' : 'border-zinc-200 bg-zinc-50'}`}>
                <PackageMinus size={32} className={dm ? 'text-zinc-600' : 'text-zinc-300'} />
                <p className={`text-sm font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-500'}`}>Escaneá lo que vas metiendo en la bolsa.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <span className={`text-[11px] font-black uppercase tracking-widest px-1 ${dm ? 'text-zinc-600' : 'text-zinc-400'}`}>Escaneado ({sesionSalida.length})</span>
                  {sesionSalida.map(it => (
                    <FilaSesion key={it.uid} dm={dm} item={it} mostrarCosto={false}
                      onCambiar={p => cambiarFilaSalida(it.uid, p)} onQuitar={() => quitarFilaSalida(it.uid)} />
                  ))}
                </div>
                <button onClick={handleGuardarSalida} disabled={guardandoSalida}
                  className="w-full h-14 rounded-xl font-black text-base text-white bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 flex items-center justify-center gap-2">
                  {guardandoSalida ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />} Guardar registro de salida
                </button>
                <p className={`text-[11px] text-center ${dm ? 'text-zinc-600' : 'text-zinc-400'}`}>Esto queda anotado como registro — no descuenta stock. El stock se descuenta como siempre, al cargar la venta.</p>
              </>
            )}

            {historialSalidas.length > 0 && (
              <div className="pt-2 space-y-2">
                <span className={`text-[11px] font-black uppercase tracking-widest px-1 ${dm ? 'text-zinc-600' : 'text-zinc-400'}`}>Últimas salidas registradas</span>
                {historialSalidas.map(h => (
                  <div key={h.id} className={`rounded-xl border p-3 ${dm ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-white border-zinc-200'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm font-bold truncate ${dm ? 'text-zinc-200' : 'text-zinc-800'}`}>{h.clienteTexto || 'Sin pedido asociado'}</p>
                      <span className={`text-[11px] flex-shrink-0 ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>{formatFechaHora(h.createdAt)}</span>
                    </div>
                    <p className={`text-xs mt-1 ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>
                      {(h.items || []).map(it => `${it.cantidad}x ${it.product}${it.variant && it.variant !== 'Único' ? ' ' + it.variant : ''}`).join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── CÓDIGOS APRENDIDOS ─── */}
        {tab === 'codigos' && (
          <>
            <div className="relative">
              <Search size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${dm ? 'text-zinc-600' : 'text-zinc-400'}`} />
              <input value={busquedaCodigos} onChange={e => setBusquedaCodigos(e.target.value)}
                placeholder="Buscar por código o producto..."
                className={`h-11 w-full pl-9 pr-3 border rounded-xl text-sm outline-none ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100 placeholder-zinc-600' : 'bg-white border-zinc-200 text-zinc-900'}`} />
            </div>
            {codigosLista.length === 0 ? (
              <div className={`rounded-3xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 text-center ${dm ? 'border-white/[0.08] bg-white/[0.02]' : 'border-zinc-200 bg-zinc-50'}`}>
                <History size={32} className={dm ? 'text-zinc-600' : 'text-zinc-300'} />
                <p className={`text-sm font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-500'}`}>Todavía no se registró ningún código.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {codigosLista.map(c => (
                  <div key={c.codigo} className={`rounded-xl border p-3 ${dm ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-white border-zinc-200'}`}>
                    {editandoCodigo === c.codigo ? (
                      <div className="space-y-2">
                        <input value={editProduct} onChange={e => setEditProduct(e.target.value)} placeholder="Producto"
                          className={`h-10 w-full border rounded-lg px-2.5 text-sm outline-none ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'}`} />
                        <input value={editVariant} onChange={e => setEditVariant(e.target.value)} placeholder="Variante (opcional)"
                          className={`h-10 w-full border rounded-lg px-2.5 text-sm outline-none ${dm ? 'bg-[#101010] border-white/[0.07] text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'}`} />
                        <div className="flex gap-2">
                          <button onClick={() => guardarEdicionCodigo(c.codigo)} className="flex-1 h-9 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs">Guardar</button>
                          <button onClick={() => setEditandoCodigo(null)} className={`px-3 h-9 rounded-lg text-xs font-bold ${dm ? 'text-zinc-400 hover:bg-white/[0.06]' : 'text-zinc-500 hover:bg-zinc-100'}`}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-bold truncate ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>{c.product}{c.variant && c.variant !== 'Único' ? ` · ${c.variant}` : ''}</p>
                          <p className={`text-[11px] font-mono ${dm ? 'text-zinc-600' : 'text-zinc-400'}`}>{c.codigo}</p>
                        </div>
                        <button onClick={() => { setEditandoCodigo(c.codigo); setEditProduct(c.product); setEditVariant(c.variant === 'Único' ? '' : c.variant); }}
                          className={`p-2 rounded-lg flex-shrink-0 ${dm ? 'text-zinc-500 hover:bg-white/[0.06]' : 'text-zinc-400 hover:bg-zinc-100'}`}>
                          <Pencil size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {codigoSinRegistrar && (
        <RegistrarCodigoModal dm={dm} codigo={codigoSinRegistrar.codigo} productosConocidos={productosConocidos}
          onGuardar={registrarCodigo} onCancelar={() => setCodigoSinRegistrar(null)} />
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 z-50 border max-w-[90vw] ${toast.type === 'error' ? 'bg-red-600/95 border-red-500 text-white' : 'bg-zinc-900/95 border-white/10 text-white'}`}>
          {toast.type === 'error' ? <XCircle size={16} /> : <CheckCircle size={16} className="text-emerald-400" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
