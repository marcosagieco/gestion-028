import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore, getFirestore, collection, query, where, orderBy, limit, onSnapshot,
  doc, setDoc, addDoc, deleteDoc,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import {
  ScanBarcode, Moon, Sun, CheckCircle, XCircle, Loader2, PackagePlus,
  PackageMinus, Pencil, Trash2, Search, X, History,
} from 'lucide-react';
import { rid, useCodigosBarra, derivarProductosConocidos, registrarCodigoBarra, agregarAEscaneo } from './escaneo/datos';
import { CajaEscaneo, RegistrarCodigoModal, FilaEscaneada } from './escaneo/componentes';

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
const accountLabel = (acc) => {
  if (acc === 'SIN_CUENTA') return 'Sin cuenta';
  if (acc === 'GALICIA_GIECO') return 'Galicia Gieco';
  if (acc === 'MERCADO_PAGO') return 'Mercado Pago';
  if (acc === 'CUENTA_RECAUDADORA') return 'Cuenta Recaudadora';
  return acc;
};
const ACCOUNTS = ['LEMON', 'AHORROS', 'GALICIA', 'GALICIA_GIECO', 'MERCADO_PAGO', 'CUENTA_RECAUDADORA', 'EFECTIVO', 'USDT', 'USD', 'SIN_CUENTA'];
const BATCH_CATEGORIES = ['THC', 'APPLE', 'PERFUMES', 'NICOTINA'];

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

export default function EscanerPage() {
  const [dm, setDm] = useState(() => localStorage.getItem('028_dark_mode') === 'true');
  useEffect(() => { localStorage.setItem('028_dark_mode', dm); }, [dm]);
  const [tab, setTab] = useState('entrada'); // 'entrada' | 'salida' | 'codigos'
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 2800); };

  // Códigos ya aprendidos — se escuchan en vivo (son pocos, entran todos de una, y así un código
  // recién registrado en esta misma pestaña, en /pedidos o en otro celular se reconoce al instante).
  const codigosBarra = useCodigosBarra(db); // { [codigo]: { product, variant } }

  // Stock real (todos los lotes), solo para armar las sugerencias de producto/variante al registrar
  // un código nuevo — así el nombre que se carga acá coincide con el que ya usan Ventas y Pedidos,
  // en vez de inventar una variación más del mismo nombre.
  const [batches, setBatches] = useState([]);
  useEffect(() => {
    return onSnapshot(collection(db, 'batches'), snap => setBatches(snap.docs.map(d => d.data())), () => {});
  }, []);
  const productosConocidos = useMemo(() => derivarProductosConocidos(batches), [batches]);

  // Código recién escaneado que no se reconoce — mientras esto no sea null, el modal de registro
  // está abierto. `destino` dice a qué sesión (entrada/salida) va a parar una vez confirmado.
  const [codigoSinRegistrar, setCodigoSinRegistrar] = useState(null); // { codigo, destino }

  const registrarCodigo = async ({ product, variant }) => {
    const { codigo, destino } = codigoSinRegistrar;
    await registrarCodigoBarra(db, { codigo, product, variant });
    agregarASesion(destino, { codigo, product, variant });
    setCodigoSinRegistrar(null);
    showToast(`Registrado: ${product}${variant !== 'Único' ? ' · ' + variant : ''}`);
  };

  // ── Sesión de ENTRADA ──────────────────────────────────────────────────────────────────────
  const [sesionEntrada, setSesionEntrada] = useState([]);
  const [nombreLote, setNombreLote] = useState('');
  const [cuentaLote, setCuentaLote] = useState('');
  const [categoriaLote, setCategoriaLote] = useState('');
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
  const agregarASesion = (destino, item) => agregarAEscaneo(destino === 'entrada' ? setSesionEntrada : setSesionSalida, item);

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
  const puedeCrearLote = sesionEntrada.length > 0 && !creandoLote &&
    sesionEntrada.every(it => (parseInt(it.cantidad) || 0) > 0 && (parseFloat(it.costo) || 0) > 0);

  // Mismo resultado que armar el lote a mano en Gestión 028 (Lotes → Agregar producto), ítem por
  // ítem: cada producto escaneado queda con su propio id, su costo y su stock inicial = lo
  // escaneado. Va siempre con skipExpense: un lote que entra por acá nunca anota gasto ni descuenta
  // de ninguna billetera — la plata de las compras se carga aparte. La cuenta queda sólo como dato
  // de dónde se compró, y Gestión 028 respeta ese skipExpense si después le agregan ítems al lote.
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
      await addDoc(collection(db, 'batches'), {
        name: nombre, createdAt: nowIso, items,
        account: cuentaLote || null, category: categoriaLote || null, skipExpense: true,
      });
      showToast(`Lote "${nombre}" creado con ${items.length} producto${items.length === 1 ? '' : 's'}`);
      setSesionEntrada([]); setNombreLote(''); setCuentaLote(''); setCategoriaLote('');
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

  // Borrar sólo olvida a qué producto apuntaba ese código: no toca stock, lotes ni salidas ya
  // registradas. Si se vuelve a escanear, lo va a pedir de nuevo como si fuera código nuevo.
  const [confirmarBorrado, setConfirmarBorrado] = useState(null);
  const borrarCodigo = async (codigo) => {
    await deleteDoc(doc(db, 'codigosBarra', codigo));
    setConfirmarBorrado(null);
    showToast('Código borrado');
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
                    <FilaEscaneada key={it.uid} dm={dm} item={it} mostrarCosto
                      onCambiar={p => cambiarFilaEntrada(it.uid, p)} onQuitar={() => quitarFilaEntrada(it.uid)} />
                  ))}
                </div>

                <div className={`rounded-2xl border p-4 space-y-3 ${dm ? 'bg-[#101010] border-white/[0.07]' : 'bg-white border-zinc-200'}`}>
                  <input value={nombreLote} onChange={e => setNombreLote(e.target.value)} placeholder={`Nombre del lote (ej: Escaneo ${formatFechaCorta(new Date().toISOString())})`}
                    className={`h-12 border rounded-xl px-3.5 w-full text-base outline-none ${dm ? 'bg-[#0a0a0a] border-white/[0.07] text-zinc-100 placeholder-zinc-600' : 'bg-white border-zinc-200 text-zinc-900'}`} />
                  <div className="flex gap-2">
                    <select value={cuentaLote} onChange={e => setCuentaLote(e.target.value)}
                      className={`h-12 flex-1 border rounded-xl px-3 text-sm font-semibold outline-none ${dm ? 'bg-[#0a0a0a] border-white/[0.07] text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'}`}>
                      <option value="">-- Cuenta de compra (opcional) --</option>
                      {ACCOUNTS.map(a => <option key={a} value={a}>{accountLabel(a)}</option>)}
                    </select>
                    <select value={categoriaLote} onChange={e => setCategoriaLote(e.target.value)}
                      className={`h-12 w-32 border rounded-xl px-3 text-sm font-semibold outline-none ${dm ? 'bg-[#0a0a0a] border-white/[0.07] text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'}`}>
                      <option value="">Categoría</option>
                      {BATCH_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <p className={`text-[11px] leading-relaxed px-1 ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>
                    Este lote no se anota como gasto ni descuenta de ninguna billetera. La cuenta es sólo para dejar registrado de dónde se compró.
                  </p>
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
                    <FilaEscaneada key={it.uid} dm={dm} item={it} mostrarCosto={false}
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
                        {confirmarBorrado === c.codigo ? (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className={`text-[11px] font-semibold ${dm ? 'text-zinc-400' : 'text-zinc-500'}`}>¿Borrar?</span>
                            <button onClick={() => borrarCodigo(c.codigo)} className="h-9 px-3 rounded-lg bg-red-500 hover:bg-red-400 text-white font-bold text-xs">Sí</button>
                            <button onClick={() => setConfirmarBorrado(null)} className={`h-9 px-2.5 rounded-lg text-xs font-bold ${dm ? 'text-zinc-400 hover:bg-white/[0.06]' : 'text-zinc-500 hover:bg-zinc-100'}`}>No</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => { setEditandoCodigo(c.codigo); setEditProduct(c.product); setEditVariant(c.variant === 'Único' ? '' : c.variant); }}
                              className={`p-2 rounded-lg ${dm ? 'text-zinc-500 hover:bg-white/[0.06]' : 'text-zinc-400 hover:bg-zinc-100'}`}>
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => setConfirmarBorrado(c.codigo)}
                              className={`p-2 rounded-lg ${dm ? 'text-zinc-600 hover:text-red-400 hover:bg-red-500/10' : 'text-zinc-400 hover:text-red-500 hover:bg-red-50'}`}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
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
