import { useEffect, useState } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore, getFirestore, collection, query, orderBy, onSnapshot,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import CierreCaja from './reparto/CierreCaja';
import { REPARTIDORES } from './reparto/repartidores';

// /pedidos/reparto/cierre-de-caja — el cierre de caja del depósito con las tres motos, en su propio
// link. Sin clave, igual que /pedidos/reparto (de donde se entra). Mismo patrón de Firebase
// self-contenido que RepartoDeposito.jsx.
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

const TODOS_LOS_TURNOS = REPARTIDORES.map(r => r.id);

export default function CierreCajaPage() {
  const [dm] = useState(() => localStorage.getItem('028_dark_mode') === 'true');
  const [pedidos, setPedidos] = useState([]);

  useEffect(() => { document.title = 'Cierre de caja · 028'; }, []);
  useEffect(() => {
    const q = query(collection(db, 'pedidos'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => setPedidos(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => console.error('pedidos:', err));
  }, []);

  return (
    <CierreCaja dm={dm} db={db} pedidos={pedidos} repartidores={TODOS_LOS_TURNOS} puedeCerrar
      volverA="/pedidos/reparto" volverLabel="Volver a Pedidos reparto" />
  );
}
