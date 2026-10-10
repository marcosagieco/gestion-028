import React, { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore, getFirestore, collection, query, where, onSnapshot, doc, updateDoc,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import { Car, Moon, Sun, Check, X, Clock, User, MapPin } from 'lucide-react';
import AccesosRapidos from './navegacion/AccesosRapidos';

// --- Firebase: mismo patron que OperativoPage.jsx (pagina 100% independiente). ---
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
} catch {
  db = getFirestore(fbApp);
}
if (!db) db = getFirestore(fbApp);

// Sin clave a proposito: esta pantalla la usa el equipo desde el celular y no muestra ningun numero
// del negocio (ventas, ganancias, billeteras, sueldos). Antes pedia la clave 1717 y la guardaba bajo
// la llave '028_user', la MISMA que usaba el panel de Gestion 028: quien entraba aca quedaba
// habilitado alla tambien con solo escribir la direccion del panel. El panel ahora tiene clave y
// llave propias (ver ADMIN_AUTH_KEY en App.jsx), y de aca se saco el link "Volver" que llevaba a el.

function tiempoDesde(iso) {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const hs = Math.round(min / 60);
  return `hace ${hs} hs`;
}

export default function CotizarUberPage() {
  const [dm, setDm] = useState(() => localStorage.getItem('028_dark_mode') === 'true');
  const [pendientes, setPendientes] = useState([]);
  const [resueltas, setResueltas] = useState([]);
  const [montos, setMontos] = useState({});
  const [enviando, setEnviando] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { localStorage.setItem('028_dark_mode', dm); }, [dm]);

  useEffect(() => {
    const unsubPend = onSnapshot(
      query(collection(db, 'cotizaciones_uber'), where('estado', '==', 'pendiente')),
      (snap) => {
        setPendientes(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')));
        setLoaded(true);
      },
      () => setLoaded(true)
    );
    const unsubRes = onSnapshot(
      query(collection(db, 'cotizaciones_uber'), where('estado', 'in', ['cotizado', 'no_llegamos', 'procesado'])),
      (snap) => {
        setResueltas(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.resueltoEn || '').localeCompare(a.resueltoEn || ''))
            .slice(0, 15)
        );
      },
      () => {}
    );
    return () => { unsubPend(); unsubRes(); };
  }, []);

  const confirmar = async (item) => {
    const raw = montos[item.id];
    const monto = parseFloat(raw);
    if (!raw || isNaN(monto) || monto <= 0) { alert('Cargá un monto válido antes de confirmar.'); return; }
    setEnviando((e) => ({ ...e, [item.id]: true }));
    try {
      await updateDoc(doc(db, 'cotizaciones_uber', item.id), {
        estado: 'cotizado',
        montoUber: monto,
        resueltoEn: new Date().toISOString(),
      });
    } catch (e) {
      alert('Error al confirmar: ' + e.message);
    } finally {
      setEnviando((en) => ({ ...en, [item.id]: false }));
    }
  };


  const noLlegamos = async (item) => {
    if (!window.confirm(`¿Avisarle a ${item.nombreCliente || item.telefonoCliente} que hoy por Uber no llegamos?`)) return;
    setEnviando((e) => ({ ...e, [item.id]: true }));
    try {
      await updateDoc(doc(db, 'cotizaciones_uber', item.id), {
        estado: 'no_llegamos',
        noLlegamos: true,
        resueltoEn: new Date().toISOString(),
      });
    } catch (e) {
      alert('Error al avisar: ' + e.message);
    } finally {
      setEnviando((en) => ({ ...en, [item.id]: false }));
    }
  };

  const card = dm ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200';
  const label = dm ? 'text-zinc-400' : 'text-zinc-600';
  const input = dm
    ? 'bg-[#0a0a0a] border-white/10 text-zinc-100 focus:border-indigo-500'
    : 'bg-white border-zinc-300 text-zinc-900 focus:border-indigo-500';

  const ESTADO_LABEL = { cotizado: 'Enviando al cliente…', no_llegamos: 'Enviando al cliente…', procesado: 'Ya avisado' };

  return (
    <div className={`min-h-screen ${dm ? 'bg-[#050505] text-zinc-100' : 'bg-slate-50 text-zinc-900'}`}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-[900px] mx-auto px-4 md:px-8 py-6">

        <div className="flex items-center justify-end gap-1 mb-6">
          <AccesosRapidos dm={dm} actual="uber" />
          <button onClick={() => setDm((v) => !v)} className={`p-2.5 rounded-lg ${dm ? 'hover:bg-white/5' : 'hover:bg-zinc-100'}`}>
            {dm ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#6366f1' }}>
            <Car size={17} className="text-white" />
          </div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>028 Import</p>
            <h1 className="text-2xl font-black tracking-tight leading-tight">Cotizar Uber</h1>
          </div>
        </div>

        <p className={`text-sm mb-6 ${label}`}>
          Pedidos que el bot derivó porque el cliente eligió envío Flash/Uber. Fijate la dirección
          en la app de Uber, cargá acá el precio, y confirmá — el bot le avisa al cliente solo y
          sigue la conversación. Si hoy no llegan, tocá "No llegamos" y el bot se lo avisa.
        </p>

        <div className="space-y-3 mb-8">
          {loaded && pendientes.length === 0 && (
            <div className={`rounded-2xl border p-6 text-center text-sm ${label} ${card}`}>
              No hay ninguna cotización pendiente ahora mismo.
            </div>
          )}
          {pendientes.map((item) => (
            <div key={item.id} className={`rounded-2xl border p-4 sm:p-5 ${card}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  {/* En un teléfono un nombre largo más el número no entran en una línea: se envuelven. */}
                  <p className="text-sm font-bold flex flex-wrap items-center gap-x-1.5">
                    <User size={14} className={`flex-shrink-0 ${label}`} /> {item.nombreCliente || 'Sin nombre'}
                    <span className={`font-normal break-all ${label}`}>· {item.telefonoCliente}</span>
                  </p>
                  {item.direccion && (
                    <p className={`text-sm mt-1 flex items-start gap-1.5 ${label}`}>
                      <MapPin size={14} className="flex-shrink-0 mt-0.5" />
                      <span className="min-w-0 break-words">{item.direccion}</span>
                    </p>
                  )}
                </div>
                <span className={`text-xs whitespace-nowrap flex items-center gap-1 flex-shrink-0 ${label}`}>
                  <Clock size={12} /> {tiempoDesde(item.createdAt)}
                </span>
              </div>
              {item.explicacionCaso && (
                <p className={`text-xs mb-4 ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>{item.explicacionCaso}</p>
              )}
              {/* En teléfono los tres controles no entran en una fila: el monto va arriba a lo ancho
                  y los dos botones abajo, mitad y mitad. Desde sm vuelven a la misma línea. Alto de
                  48px para poder tocarlos con el dedo, y el monto en text-base porque con menos de
                  16px el navegador del teléfono hace zoom solo al enfocarlo. */}
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="Monto Uber ($)"
                  value={montos[item.id] || ''}
                  onChange={(e) => setMontos((m) => ({ ...m, [item.id]: e.target.value }))}
                  onWheel={(e) => e.target.blur()}
                  className={`w-full sm:flex-1 h-12 rounded-xl border px-3.5 text-base sm:text-sm outline-none transition-colors ${input}`}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => confirmar(item)}
                    disabled={enviando[item.id]}
                    className="flex-1 sm:flex-none px-4 h-12 rounded-xl font-bold text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5 whitespace-nowrap"
                    style={{ background: '#6366f1' }}
                  >
                    <Check size={15} /> Confirmar
                  </button>
                  <button
                    onClick={() => noLlegamos(item)}
                    disabled={enviando[item.id]}
                    className={`flex-1 sm:flex-none px-4 h-12 rounded-xl font-bold text-sm transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5 whitespace-nowrap border ${dm ? 'border-red-500/40 text-red-400' : 'border-red-300 text-red-600'}`}
                  >
                    <X size={15} /> No llegamos
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {resueltas.length > 0 && (
          <div>
            <h3 className={`text-xs font-bold uppercase tracking-wide mb-3 ${label}`}>Últimas resueltas</h3>
            <div className={`rounded-2xl border overflow-hidden ${card}`}>
              {resueltas.map((item) => (
                <div key={item.id} className={`px-4 py-3 text-sm flex items-center gap-3 border-b last:border-b-0 ${dm ? 'border-white/[0.04]' : 'border-zinc-100'}`}>
                  <span className="flex-1 min-w-0 truncate">{item.nombreCliente || item.telefonoCliente}</span>
                  <span className={`flex-shrink-0 font-semibold ${label}`}>{item.noLlegamos ? 'No llegamos' : item.montoUber != null ? `${Number(item.montoUber).toLocaleString('es-AR')}` : '—'}</span>
                  <span className={`text-xs flex-shrink-0 text-right w-20 sm:w-28 ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>{ESTADO_LABEL[item.estado] || item.estado}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
