import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore, getFirestore, doc, onSnapshot, setDoc,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import { Radio, Moon, Sun, Save, ArrowLeft, Power, Check } from 'lucide-react';

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
            <h1 className={`text-sm font-black leading-tight ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>Estado del dia</h1>
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

// Cada opcion mapea a una frase fija que usa el bot (ver 028_system_prompt.md).
// El staff solo elige una — el bot nunca ve texto libre.
const SITUACIONES = [
  { id: 'sin_demora',    label: 'Sin demora',       hint: 'los envios salen normal' },
  { id: 'normal',        label: 'Normal (~1:30h)',  hint: 'demora habitual' },
  { id: 'demora',        label: 'Demora (~2h)',     hint: 'hay bastante pedido' },
  { id: 'demora_fuerte', label: 'Demora fuerte (+3h)', hint: 'mejor ofrecer flash para lo urgente' },
  { id: 'solo_manana',   label: 'Solo para manana', hint: 'ya no llegamos a despachar hoy' },
];

const DEFAULTS = { abierto: true, situacion: 'sin_demora', proximaSalida: '' };

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

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSavedAt(null); };

  const guardar = async () => {
    setSaving(true);
    try {
      await setDoc(DOC_REF(), {
        abierto: !!form.abierto,
        situacion: SITUACIONES.some((s) => s.id === form.situacion) ? form.situacion : 'sin_demora',
        proximaSalida: (form.proximaSalida || '').trim(),
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
  const label = dm ? 'text-zinc-400' : 'text-zinc-600';
  const input = dm
    ? 'bg-[#0a0a0a] border-white/10 text-zinc-100 focus:border-indigo-500'
    : 'bg-white border-zinc-300 text-zinc-900 focus:border-indigo-500';

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

        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#6366f1' }}>
            <Radio size={17} className="text-white" />
          </div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>028 Import</p>
            <h1 className="text-base font-black leading-tight">Estado del dia</h1>
          </div>
        </div>

        <p className={`text-xs mb-5 ${label}`}>
          Esto lo lee el bot de WhatsApp para avisarle a los clientes si estamos abiertos y si hay demora.
        </p>

        <div className={`rounded-2xl border p-5 space-y-6 ${card}`}>

          {/* Abierto / cerrado */}
          <div>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>¿Estamos tomando pedidos?</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => set('abierto', true)}
                className={`rounded-xl border px-3 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                  form.abierto
                    ? (dm ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400' : 'border-emerald-400 bg-emerald-50 text-emerald-700')
                    : (dm ? 'border-white/10 text-zinc-500' : 'border-zinc-300 text-zinc-400')
                }`}>
                <Power size={15} /> Tomando pedidos
              </button>
              <button onClick={() => set('abierto', false)}
                className={`rounded-xl border px-3 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                  !form.abierto
                    ? (dm ? 'border-red-500/50 bg-red-500/15 text-red-400' : 'border-red-400 bg-red-50 text-red-700')
                    : (dm ? 'border-white/10 text-zinc-500' : 'border-zinc-300 text-zinc-400')
                }`}>
                Cerrado hoy
              </button>
            </div>
            {!form.abierto && (
              <p className={`text-[11px] mt-2 ${label}`}>
                El bot igual toma el pedido, pero le avisa al cliente que sale al dia siguiente.
              </p>
            )}
          </div>

          {/* Demora del dia */}
          <div className={form.abierto ? '' : 'opacity-40 pointer-events-none'}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Demora de hoy</label>
            <div className="space-y-2">
              {SITUACIONES.map((s) => {
                const sel = form.situacion === s.id;
                return (
                  <button key={s.id} onClick={() => set('situacion', s.id)}
                    className={`w-full rounded-xl border px-4 py-2.5 flex items-center justify-between text-left transition-colors ${
                      sel
                        ? (dm ? 'border-indigo-500/60 bg-indigo-500/15' : 'border-indigo-400 bg-indigo-50')
                        : (dm ? 'border-white/[0.08] hover:border-white/20' : 'border-zinc-200 hover:border-zinc-300')
                    }`}>
                    <span>
                      <span className={`text-sm font-bold ${sel ? (dm ? 'text-indigo-300' : 'text-indigo-700') : ''}`}>{s.label}</span>
                      <span className={`block text-[11px] ${label}`}>{s.hint}</span>
                    </span>
                    {sel && <Check size={16} className={dm ? 'text-indigo-400' : 'text-indigo-600'} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Proxima salida */}
          <div className={form.abierto ? '' : 'opacity-40 pointer-events-none'}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Proxima salida de moto <span className="normal-case font-normal">(opcional)</span></label>
            <input value={form.proximaSalida} onChange={(e) => set('proximaSalida', e.target.value)}
              placeholder="16:00"
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${input}`} />
          </div>

          <button onClick={guardar} disabled={saving || !loaded}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: savedAt ? '#10b981' : '#6366f1' }}>
            {savedAt ? <><Check size={16} /> Guardado</> : <><Save size={15} /> {saving ? 'Guardando...' : 'Guardar'}</>}
          </button>
          {savedAt && (
            <p className={`text-xs text-center ${label}`}>El bot lo toma en la proxima consulta de un cliente.</p>
          )}
        </div>
      </div>
    </div>
  );
}
