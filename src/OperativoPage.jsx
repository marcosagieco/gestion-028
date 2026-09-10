import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore, getFirestore, doc, onSnapshot, setDoc,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import { Radio, Moon, Sun, Save, ArrowLeft, Power } from 'lucide-react';

// --- Firebase: mismo patron que PedidosPage.jsx / FacturasPage.jsx (pagina 100% independiente). ---
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

// Mismo login que el resto del sistema (clave 1717).
const AUTH_KEY = '028_user';
const AUTH_PWD = '1717';

function Login({ dm, onAuth }) {
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    if (pwd === AUTH_PWD) { localStorage.setItem(AUTH_KEY, 'Admin'); onAuth(); }
    else { setErr(true); setPwd(''); }
  };
  return (
    <div className={`min-h-screen flex items-center justify-center px-4 ${dm ? 'bg-[#050505]' : 'bg-slate-50'}`}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className={`w-full max-w-sm rounded-2xl border p-8 shadow-xl ${dm ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200'}`}>
        <div className="flex items-center gap-3 mb-7">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#6366f1' }}>
            <Radio size={17} className="text-white" />
          </div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>028 Import</p>
            <h1 className={`text-sm font-black leading-tight ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>Estado operativo</h1>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>Clave de seguridad</label>
            <input type="password" value={pwd} autoFocus
              onChange={(e) => { setPwd(e.target.value); setErr(false); }}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${dm ? 'bg-[#0a0a0a] border-white/10 text-zinc-100 focus:border-indigo-500' : 'bg-white border-zinc-300 text-zinc-900 focus:border-indigo-500'}`} />
            {err && <p className="text-xs text-red-500 mt-1.5">Clave incorrecta</p>}
          </div>
          <button type="submit" className="w-full rounded-xl py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90" style={{ background: '#6366f1' }}>
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}

const DOC_REF = () => doc(db, 'settings', 'operativo');

const DEFAULTS = {
  abierto: true,
  horarioAtencion: '12:00-20:00',
  demoraEstimadaMin: 90,
  mensajeDemora: '',
  proximaSalida: '',
};

export default function OperativoPage() {
  const [dm, setDm] = useState(() => localStorage.getItem('028_dark_mode') === 'true');
  const [authed, setAuthed] = useState(() => !!localStorage.getItem(AUTH_KEY));
  const [form, setForm] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => { localStorage.setItem('028_dark_mode', dm); }, [dm]);

  useEffect(() => {
    if (!authed) return;
    const unsub = onSnapshot(DOC_REF(), (snap) => {
      if (snap.exists()) setForm({ ...DEFAULTS, ...snap.data() });
      setLoaded(true);
    }, () => setLoaded(true));
    return unsub;
  }, [authed]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const guardar = async () => {
    setSaving(true);
    try {
      await setDoc(DOC_REF(), {
        abierto: !!form.abierto,
        horarioAtencion: form.horarioAtencion.trim() || DEFAULTS.horarioAtencion,
        demoraEstimadaMin: Math.max(0, parseInt(form.demoraEstimadaMin) || 0),
        mensajeDemora: form.mensajeDemora.trim(),
        proximaSalida: form.proximaSalida.trim(),
        actualizadoEn: new Date().toISOString(),
      }, { merge: true });
      setSavedAt(Date.now());
    } catch (e) {
      alert('Error al guardar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!authed) return <Login dm={dm} onAuth={() => setAuthed(true)} />;

  const card = dm ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200';
  const input = dm
    ? 'bg-[#0a0a0a] border-white/10 text-zinc-100 focus:border-indigo-500'
    : 'bg-white border-zinc-300 text-zinc-900 focus:border-indigo-500';
  const label = dm ? 'text-zinc-400' : 'text-zinc-600';

  return (
    <div className={`min-h-screen ${dm ? 'bg-[#050505] text-zinc-100' : 'bg-slate-50 text-zinc-900'}`}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-lg mx-auto px-4 py-6">

        <div className="flex items-center justify-between mb-6">
          <Link to="/" className={`flex items-center gap-1.5 text-xs font-semibold ${label} hover:opacity-80`}>
            <ArrowLeft size={14} /> Volver
          </Link>
          <button onClick={() => setDm((v) => !v)} className={`p-2 rounded-lg ${dm ? 'hover:bg-white/5' : 'hover:bg-zinc-100'}`}>
            {dm ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#6366f1' }}>
            <Radio size={17} className="text-white" />
          </div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>028 Import</p>
            <h1 className="text-base font-black leading-tight">Estado operativo</h1>
          </div>
        </div>

        <p className={`text-xs mb-5 ${label}`}>
          Lo que cargues acá lo lee el bot de WhatsApp para avisarle a los clientes por tiempos y demoras del día.
        </p>

        <div className={`rounded-2xl border p-5 space-y-5 ${card}`}>

          {/* Abierto / cerrado */}
          <button onClick={() => set('abierto', !form.abierto)}
            className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${
              form.abierto
                ? (dm ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-emerald-300 bg-emerald-50')
                : (dm ? 'border-red-500/40 bg-red-500/10' : 'border-red-300 bg-red-50')
            }`}>
            <span className="flex items-center gap-2 text-sm font-bold">
              <Power size={15} className={form.abierto ? 'text-emerald-500' : 'text-red-500'} />
              {form.abierto ? 'Abierto — tomando pedidos' : 'Cerrado'}
            </span>
            <span className={`text-xs font-semibold ${label}`}>tocá para cambiar</span>
          </button>

          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${label}`}>Horario de atención</label>
            <input value={form.horarioAtencion} onChange={(e) => set('horarioAtencion', e.target.value)}
              placeholder="12:00-20:00"
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${input}`} />
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${label}`}>Demora estimada de hoy (minutos)</label>
            <input type="number" min="0" step="15" value={form.demoraEstimadaMin}
              onChange={(e) => set('demoraEstimadaMin', e.target.value)}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${input}`} />
            <p className={`text-[11px] mt-1 ${label}`}>Ej: 90 = "sale con demora de ~1:30 hs". 120 = "~2 hs".</p>
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${label}`}>Próxima salida (opcional)</label>
            <input value={form.proximaSalida} onChange={(e) => set('proximaSalida', e.target.value)}
              placeholder="16:00"
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${input}`} />
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${label}`}>Mensaje libre para el bot (opcional)</label>
            <textarea rows={2} value={form.mensajeDemora} onChange={(e) => set('mensajeDemora', e.target.value)}
              placeholder='Ej: "hoy despachamos recién a las 15 hs"'
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors resize-none ${input}`} />
          </div>

          <button onClick={guardar} disabled={saving || !loaded}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#6366f1' }}>
            <Save size={15} /> {saving ? 'Guardando…' : 'Guardar'}
          </button>

          {savedAt && (
            <p className="text-xs text-center text-emerald-500 font-semibold">
              Guardado — el bot lo toma en la próxima consulta
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
