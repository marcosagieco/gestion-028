import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore, getFirestore, doc, onSnapshot, setDoc,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import { Radio, Moon, Sun, Save, ArrowLeft, Check } from 'lucide-react';

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
            <h1 className={`text-sm font-black leading-tight ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>Agente IA</h1>
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
  { id: 'sin_demora',    label: 'Sin demora',          hint: 'los envios salen normal' },
  { id: 'normal',        label: 'Normal (1:30 hs aprox)', hint: 'demora habitual' },
  { id: 'demora',        label: 'Demora (2 hs aprox)',  hint: 'hay bastante pedido' },
  { id: 'demora_fuerte', label: 'Demora fuerte (mas de 3 hs)', hint: 'mejor ofrecer flash para lo urgente' },
  { id: 'solo_manana',   label: 'Solo para manana',     hint: 'ya no llegamos a despachar hoy' },
];

// Los 3 alias que rotan segun cuanta plata le entro a cada cuenta (ver relevamiento con Lucio).
// El staff avisa por el grupo cuando cambia y quien reciba el aviso lo actualiza aca.
const ALIASES = [
  { id: 'alias1', label: 'Alias 1 — Lucio (028import.gl)' },
  { id: 'alias2', label: 'Alias 2 — Marcos (028import.gal2)' },
  { id: 'alias3', label: 'Alias 3 — Financiera (CALMO.DURO.DIA)' },
];

const DEFAULTS = {
  situacion: 'sin_demora', proximaSalida: '', aliasActivo: 'alias1',
  stockNicotinaTexto: '', stockThcTexto: '',
  preciosVapesTexto: '', preciosThcTexto: '', perfumesTexto: '', appleTexto: '',
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

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSavedAt(null); };

  const guardar = async () => {
    setSaving(true);
    try {
      await setDoc(DOC_REF(), {
        situacion: SITUACIONES.some((s) => s.id === form.situacion) ? form.situacion : 'sin_demora',
        proximaSalida: (form.proximaSalida || '').trim(),
        aliasActivo: ALIASES.some((a) => a.id === form.aliasActivo) ? form.aliasActivo : 'alias1',
        stockNicotinaTexto: (form.stockNicotinaTexto || '').trim(),
        stockThcTexto: (form.stockThcTexto || '').trim(),
        preciosVapesTexto: (form.preciosVapesTexto || '').trim(),
        preciosThcTexto: (form.preciosThcTexto || '').trim(),
        perfumesTexto: (form.perfumesTexto || '').trim(),
        appleTexto: (form.appleTexto || '').trim(),
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
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6">

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
            <h1 className="text-2xl font-black tracking-tight leading-tight">Agente IA</h1>
          </div>
        </div>

        <p className={`text-sm mb-6 ${label}`}>
          Todo lo que el bot de WhatsApp necesita para responder actualizado: si hay demora en los
          envios, que alias de pago pasarle al cliente, y el stock del dia de cada categoria. Si algo
          de esto no esta al dia, el bot le va a pasar esa misma info vieja al cliente.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Demora del dia */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-3 ${label}`}>Demora de hoy</label>
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
          <div className={`rounded-2xl border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Proxima salida de moto <span className="normal-case font-normal">(opcional)</span></label>
            <p className={`text-[11px] mb-3 ${label}`}>Hora a la que sale la proxima tanda de envios. El bot la usa si el cliente pregunta cuando le llega.</p>
            <input value={form.proximaSalida} onChange={(e) => set('proximaSalida', e.target.value)}
              placeholder="16:00"
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${input}`} />
          </div>

          {/* Alias activo */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Alias a usar hoy</label>
            <p className={`text-[11px] mb-3 ${label}`}>Cual de los 3 le pasa el bot al cliente cuando llega el momento de cobrar.</p>
            <div className="space-y-2">
              {ALIASES.map((a) => {
                const sel = form.aliasActivo === a.id;
                return (
                  <button key={a.id} onClick={() => set('aliasActivo', a.id)}
                    className={`w-full rounded-xl border px-4 py-2.5 flex items-center justify-between text-left transition-colors ${
                      sel
                        ? (dm ? 'border-indigo-500/60 bg-indigo-500/15' : 'border-indigo-400 bg-indigo-50')
                        : (dm ? 'border-white/[0.08] hover:border-white/20' : 'border-zinc-200 hover:border-zinc-300')
                    }`}>
                    <span className={`text-sm font-bold ${sel ? (dm ? 'text-indigo-300' : 'text-indigo-700') : ''}`}>{a.label}</span>
                    {sel && <Check size={16} className={dm ? 'text-indigo-400' : 'text-indigo-600'} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
          {/* Stock nicotina pegado a mano */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Stock de vapes (nicotina) — texto del depósito</label>
            <p className={`text-[11px] mb-3 ${label}`}>Pegá acá tal cual el mensaje que arman a diario con el stock. El bot lo manda exactamente así (con emojis y todo) apenas alguien pregunta por vapes de nicotina en general.</p>
            <textarea value={form.stockNicotinaTexto} onChange={(e) => set('stockNicotinaTexto', e.target.value)}
              rows={8} placeholder={'STOCK ACTUALIZADO VAPES\n\n🌌 DINNER LADY GALAXY 60K\n\nCalifornia Cherry 🍒🌴 (4)\n...'}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors font-mono ${input}`} />
          </div>

          {/* Stock THC pegado a mano */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Stock de vapes (THC) — texto del depósito</label>
            <p className={`text-[11px] mb-3 ${label}`}>Igual que el de nicotina, pero para descartables y cápsulas THC.</p>
            <textarea value={form.stockThcTexto} onChange={(e) => set('stockThcTexto', e.target.value)}
              rows={8} placeholder={'STOCK ACTUALIZADO THC\n\n...'}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors font-mono ${input}`} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
          {/* Precios vapes */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Precios de vapes (nicotina) — texto</label>
            <p className={`text-[11px] mb-3 ${label}`}>La lista de precios por modelo (con combos de 2x, 5x, etc si aplica). El bot la manda tal cual cuando preguntan precio de vapes en general.</p>
            <textarea value={form.preciosVapesTexto} onChange={(e) => set('preciosVapesTexto', e.target.value)}
              rows={8} placeholder={'LISTA VAPES PRECIOS - CLIENTES\n\n✨ ELFBAR EB CREATE 40K\n💰 1x $22.000\n...'}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors font-mono ${input}`} />
          </div>

          {/* Precios THC */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Precios THC — texto</label>
            <p className={`text-[11px] mb-3 ${label}`}>Cápsulas, gummies y descartables THC con precio. El bot SOLO la usa si el cliente pregunta por THC — nunca la ofrece por su cuenta.</p>
            <textarea value={form.preciosThcTexto} onChange={(e) => set('preciosThcTexto', e.target.value)}
              rows={8} placeholder={'LISTA PRECIOS THC - CLIENTES\n\n💨 CÁPSULAS THC\n...'}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors font-mono ${input}`} />
          </div>

          {/* Perfumes */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Perfumes árabes — texto</label>
            <p className={`text-[11px] mb-3 ${label}`}>Lista completa de perfumes con precio y descripción. El bot la manda tal cual cuando preguntan por perfumes en general.</p>
            <textarea value={form.perfumesTexto} onChange={(e) => set('perfumesTexto', e.target.value)}
              rows={8} placeholder={'LISTA DE PRECIOS — PERFUMES ÁRABES\n\n✨ ECLAIRE — LATTAFA\n💰 $75.000\n...'}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors font-mono ${input}`} />
          </div>

          {/* Apple y accesorios */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Apple y accesorios — texto</label>
            <p className={`text-[11px] mb-3 ${label}`}>AirPods, cargadores, adaptadores, body splash, etc. El bot la manda tal cual cuando preguntan por accesorios Apple en general.</p>
            <textarea value={form.appleTexto} onChange={(e) => set('appleTexto', e.target.value)}
              rows={8} placeholder={'LISTA DE PRECIOS – APPLE & ACCESORIOS\n\n🎧 AIRPODS PRO GEN 3\n💰 $30.000\n...'}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors font-mono ${input}`} />
          </div>
        </div>

        <div className={`rounded-2xl border p-5 mt-5 max-w-md ${card}`}>
          <button onClick={guardar} disabled={saving || !loaded}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: savedAt ? '#10b981' : '#6366f1' }}>
            {savedAt ? <><Check size={16} /> Guardado</> : <><Save size={15} /> {saving ? 'Guardando...' : 'Guardar'}</>}
          </button>
          {savedAt && (
            <p className={`text-xs text-center mt-2 ${label}`}>El bot lo toma en la proxima consulta de un cliente.</p>
          )}
        </div>
      </div>
    </div>
  );
}
