import React, { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore, getFirestore, doc, onSnapshot, setDoc,
  persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import { Bot, Moon, Sun, Save, Check, X, Plus } from 'lucide-react';
import AccesosRapidos from './navegacion/AccesosRapidos';

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

// Sin clave a proposito: esta pantalla la usa el equipo desde el celular y no muestra ningun numero
// del negocio (ventas, ganancias, billeteras, sueldos). Antes pedia la clave 1717 y la guardaba bajo
// la llave '028_user', la MISMA que usaba el panel de Gestion 028: quien entraba aca quedaba
// habilitado alla tambien con solo escribir la direccion del panel. El panel ahora tiene clave y
// llave propias (ver ADMIN_AUTH_KEY en App.jsx), y de aca se saco el link "Volver" que llevaba a el.

const DOC_REF = () => doc(db, 'settings', 'operativo');

// Cada opcion mapea a una frase fija que usa el bot (DEMORAS en functions/bot/salidas.js).
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
  { id: 'alias3', label: 'Alias 3 — Financiera (tamelake358sa.eluter)' },
  { id: 'alias4', label: 'Alias 4 — Cuenta Recaudadora (CVU ...2947)' },
];

// Fechas "AAAA-MM-DD" en hora de Buenos Aires (las mismas que usa el backend).
const hoyBA = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const fechaLinda = (f) => { const [a, m, d] = f.split('-').map(Number); return `${DIAS[new Date(a, m - 1, d).getDay()]} ${d}/${m}`; };

// Campaña (por ejemplo CYBER 028): entre su inicio y su fin el bot usa estas listas en lugar de las de
// siempre y aplica el envío gratis. Se prende y se apaga sola por la fecha (functions/bot/campania.js).
const CAMPANIA_VACIA = {
  activa: false, nombre: '', inicio: '', fin: '', lanzamientoHasta: '', envioGratisDesde: '', mensaje: '',
  preciosVapesTexto: '', appleTexto: '', mysteryBoxTexto: '',
};
// "AAAA-MM-DDTHH:mm" de ahora en Buenos Aires, para comparar con las fechas de la campaña.
const ahoraBA = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date()).replace(' ', 'T');
const estadoCampania = (c) => {
  if (!c.activa) return { texto: 'Apagada: el bot usa las listas de siempre.', color: 'text-zinc-500' };
  if (!c.inicio || !c.fin) return { texto: 'Falta el inicio o el fin.', color: 'text-amber-500' };
  const ahora = ahoraBA();
  if (ahora < c.inicio) return { texto: 'Programada: arranca sola el ' + c.inicio.replace('T', ' a las ') + '.', color: 'text-sky-500' };
  if (ahora > c.fin) return { texto: 'Terminó: el bot ya usa las listas de siempre.', color: 'text-zinc-500' };
  return { texto: 'Activa ahora: el bot usa estas listas hasta el ' + c.fin.replace('T', ' a las ') + '.', color: 'text-emerald-500' };
};

const DEFAULTS = {
  situacion: 'sin_demora', salidasMoto: { primera: '15:00', segunda: '17:00' }, aliasActivo: 'alias1', limitePorTanda: 10, diasSinDespacho: [],
  stockNicotinaTexto: '', stockThcTexto: '',
  preciosVapesTexto: '', preciosThcTexto: '', perfumesTexto: '', appleTexto: '',
  preciosMayoristaTexto: '', ofertasTexto: '', combosBateriasTexto: '', combosBateriasTitulo: 'Combos y baterias', dolarMayorista: '',
  campania: CAMPANIA_VACIA,
  // Envío gratis de siempre: solo moto en CABA, con productos desde `desde` (functions/bot/campania.js).
  envioGratis: { activo: false, desde: 100000 },
  // Clientes que pueden retirar en persona: un teléfono por renglón, con el nombre si se quiere (functions/bot/envios.js).
  retiroPermitidoTexto: '',
  // Tarifa fija del Flash por tramos de distancia (functions/bot/envios.js). Apagada, el depósito cotiza cada Flash.
  tarifaFlash: { activa: false, tramosTexto: 'Hasta 3 km: $3.000\nHasta 6 km: $6.500\nHasta 10 km: $8.000\nHasta 15 km: $10.000\nHasta 25 km: $15.000' },
  // Salida extra de moto: se prende y se apaga; va con la moto de la noche (functions/bot/salidas.js).
  salidaExtraMoto: { activa: false, hora: '20:00' },
};

export default function OperativoPage() {
  const [dm, setDm] = useState(() => localStorage.getItem('028_dark_mode') === 'true');
  const [form, setForm] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [nuevoDia, setNuevoDia] = useState('');

  useEffect(() => { localStorage.setItem('028_dark_mode', dm); }, [dm]);

  useEffect(() => {
    const unsub = onSnapshot(DOC_REF(), (snap) => {
      if (snap.exists()) setForm({ ...DEFAULTS, ...snap.data(), salidasMoto: { ...DEFAULTS.salidasMoto, ...snap.data().salidasMoto }, campania: { ...CAMPANIA_VACIA, ...snap.data().campania }, envioGratis: { ...DEFAULTS.envioGratis, ...snap.data().envioGratis }, tarifaFlash: { ...DEFAULTS.tarifaFlash, ...snap.data().tarifaFlash }, salidaExtraMoto: { ...DEFAULTS.salidaExtraMoto, ...snap.data().salidaExtraMoto } });
      setLoaded(true);
    }, () => setLoaded(true));
    return unsub;
  }, []);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSavedAt(null); };
  const setCampania = (k, v) => { setForm((f) => ({ ...f, campania: { ...f.campania, [k]: v } })); setSavedAt(null); };
  const campania = form.campania || CAMPANIA_VACIA;
  const envioGratis = { ...DEFAULTS.envioGratis, ...form.envioGratis };
  const setEnvioGratis = (k, v) => set('envioGratis', { ...envioGratis, [k]: v });
  const tarifaFlash = { ...DEFAULTS.tarifaFlash, ...form.tarifaFlash };
  const setTarifaFlash = (k, v) => set('tarifaFlash', { ...tarifaFlash, [k]: v });
  const salidaExtra = { ...DEFAULTS.salidaExtraMoto, ...form.salidaExtraMoto };
  const setSalidaExtra = (k, v) => set('salidaExtraMoto', { ...salidaExtra, [k]: v });
  // Los tramos tal como los lee el bot: «Hasta 3 km: $3.000» (km pegados a «km», precio después del «$»).
  const tramosLeidos = String(tarifaFlash.tramosTexto || '').split('\n').map((l) => {
    const km = l.match(/(\d+(?:[.,]\d+)?)\s*km/i); const precio = l.match(/\$\s*(\d[\d.]*)/);
    return km && precio ? { hasta: Number(km[1].replace(',', '.')), monto: Number(precio[1].replace(/\./g, '')) } : null;
  }).filter((t) => t && t.hasta > 0 && t.monto > 0).sort((a, b) => a.hasta - b.hasta);

  // Los días que ya pasaron no se muestran ni se guardan.
  const diasSinDespacho = (form.diasSinDespacho || []).filter((d) => d >= hoyBA()).sort();
  const agregarDia = () => {
    if (!nuevoDia || nuevoDia < hoyBA() || diasSinDespacho.includes(nuevoDia)) return;
    set('diasSinDespacho', [...diasSinDespacho, nuevoDia].sort());
    setNuevoDia('');
  };

  const guardar = async () => {
    const horarios = [form.salidasMoto?.primera, form.salidasMoto?.segunda];
    if (horarios.some((h) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(h || '') || h > '20:00') || horarios[0] >= horarios[1]) {
      alert('La tarde y la tarde-noche tienen que tener horarios distintos y ordenados, hasta las 20:00.');
      return;
    }
    // La noche tiene que quedar después de la tarde-noche y hasta las 20:00 (si no, el bot no la ofrecería).
    if (salidaExtra.activa && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(salidaExtra.hora || '') || salidaExtra.hora > '20:00' || salidaExtra.hora <= horarios[1])) {
      alert(`La noche tiene que ser después de la tarde-noche (${horarios[1]}) y hasta las 20:00.`);
      return;
    }
    if (form.dolarMayorista != null && form.dolarMayorista !== '' && !(Number.isFinite(Number(form.dolarMayorista)) && Number(form.dolarMayorista) > 0)) {
      alert('El valor del dolar debe ser mayor que cero.');
      return;
    }
    if (tarifaFlash.activa && !tramosLeidos.length) {
      alert('Para prender la tarifa del Flash cargá al menos un tramo, por ejemplo «Hasta 3 km: $3.000».');
      return;
    }
    if (envioGratis.activo && !(Number(envioGratis.desde) > 0)) {
      alert('Para prender el envío gratis poné desde qué monto (por ejemplo 100000).');
      return;
    }
    if (campania.activa && (!campania.inicio || !campania.fin || campania.inicio >= campania.fin)) {
      alert('La campaña necesita un inicio y un fin, y el fin tiene que ser después del inicio.');
      return;
    }
    setSaving(true);
    try {
      await setDoc(DOC_REF(), {
        situacion: SITUACIONES.some((s) => s.id === form.situacion) ? form.situacion : 'sin_demora',
        salidasMoto: { primera: horarios[0], segunda: horarios[1] },
        proximaSalida: '',
        limitePorTanda: Number(form.limitePorTanda) > 0 ? Number(form.limitePorTanda) : 10,
        diasSinDespacho,
        aliasActivo: ALIASES.some((a) => a.id === form.aliasActivo) ? form.aliasActivo : 'alias1',
        stockNicotinaTexto: (form.stockNicotinaTexto || '').trim(),
        stockThcTexto: (form.stockThcTexto || '').trim(),
        preciosVapesTexto: (form.preciosVapesTexto || '').trim(),
        preciosThcTexto: (form.preciosThcTexto || '').trim(),
        perfumesTexto: (form.perfumesTexto || '').trim(),
        appleTexto: (form.appleTexto || '').trim(),
        preciosMayoristaTexto: (form.preciosMayoristaTexto || '').trim(),
        ofertasTexto: (form.ofertasTexto || '').trim(),
        combosBateriasTexto: (form.combosBateriasTexto || '').trim(),
        combosBateriasTitulo: (form.combosBateriasTitulo || '').trim() || 'Combos y baterias',
        dolarMayorista: Number(form.dolarMayorista) > 0 ? Number(form.dolarMayorista) : null,
        envioGratis: { activo: envioGratis.activo === true, desde: Number(envioGratis.desde) > 0 ? Number(envioGratis.desde) : null },
        retiroPermitidoTexto: (form.retiroPermitidoTexto || '').trim(),
        tarifaFlash: { activa: tarifaFlash.activa === true, tramosTexto: (tarifaFlash.tramosTexto || '').trim() },
        salidaExtraMoto: { activa: salidaExtra.activa === true, hora: salidaExtra.hora || '20:00' },
        campania: {
          activa: campania.activa === true,
          nombre: (campania.nombre || '').trim(),
          inicio: campania.inicio || '', fin: campania.fin || '', lanzamientoHasta: campania.lanzamientoHasta || '',
          envioGratisDesde: Number(campania.envioGratisDesde) > 0 ? Number(campania.envioGratisDesde) : null,
          mensaje: (campania.mensaje || '').trim(),
          preciosVapesTexto: (campania.preciosVapesTexto || '').trim(),
          appleTexto: (campania.appleTexto || '').trim(),
          mysteryBoxTexto: (campania.mysteryBoxTexto || '').trim(),
        },
        actualizadoEn: new Date().toISOString(),
      }, { merge: true });
      setSavedAt(Date.now());
    } catch (e) {
      alert('Error al guardar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };


  const card = dm ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200';
  const label = dm ? 'text-zinc-400' : 'text-zinc-600';
  const input = dm
    ? 'bg-[#0a0a0a] border-white/10 text-zinc-100 focus:border-indigo-500'
    : 'bg-white border-zinc-300 text-zinc-900 focus:border-indigo-500';

  return (
    <div className={`min-h-screen ${dm ? 'bg-[#050505] text-zinc-100' : 'bg-slate-50 text-zinc-900'}`}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6">

        <div className="flex items-center justify-end gap-1 mb-6">
          <AccesosRapidos dm={dm} actual="operativo" />
          <button onClick={() => setDm((v) => !v)} className={`p-2 rounded-lg ${dm ? 'hover:bg-white/5' : 'hover:bg-zinc-100'}`}>
            {dm ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#6366f1' }}>
            <Bot size={17} className="text-white" />
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
            <p className={`text-[11px] mb-3 ${label}`}>Esta es la demora base. El bot la sube solo segun la cola: desde 5 pedidos dice 2 hs, desde 8 dice 2:30 hs, y con mas de 10 dice mas de 3 hs.</p>
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

          {/* Salidas de motomensajeria */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <p className={`block text-xs font-bold uppercase tracking-wide mb-3 ${label}`}>Salidas de motomensajeria</p>
            {/* Cada salida es un turno con su propio motomensajero y su link (reparto/repartidores.js). */}
            {[['primera', 'Tarde', '/reparto-tarde'], ['segunda', 'Tarde-noche', '/reparto-tarde-noche']].map(([id, nombre, link]) => (
              <label key={id} className="block mb-4">
                <span className={`block text-sm mb-2 ${label}`}>{nombre} <span className="opacity-60">· {link}</span></span>
                <input type="time" max="20:00" value={form.salidasMoto?.[id] || DEFAULTS.salidasMoto[id]}
                  onChange={(e) => set('salidasMoto', { ...DEFAULTS.salidasMoto, ...form.salidasMoto, [id]: e.target.value })}
                  className={`w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none ${input}`} />
              </label>
            ))}
            {/* Noche: se prende y se apaga; la lleva su propia moto (/reparto-noche), con el mismo cupo */}
            <div className={`pt-3 border-t ${dm ? 'border-white/[0.06]' : 'border-zinc-200'}`}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className={`text-sm ${label}`}>Noche <span className="opacity-60">· /reparto-noche</span></span>
                <button type="button" role="switch" aria-checked={salidaExtra.activa === true} aria-label="Moto de la noche"
                  onClick={() => setSalidaExtra('activa', !salidaExtra.activa)}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${salidaExtra.activa ? 'bg-emerald-500' : (dm ? 'bg-white/15' : 'bg-zinc-300')}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${salidaExtra.activa ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              <p className={`text-[11px] mb-3 ${label}`}>Prendida, el bot la ofrece y en /pedidos se puede elegir. Tiene su propia moto (/reparto-noche) y el mismo cupo. Queda prendida hasta que la apaguen. Tiene que ser después de la tarde-noche y hasta las 20:00.</p>
              <input type="time" max="20:00" value={salidaExtra.hora || '20:00'}
                onChange={(e) => setSalidaExtra('hora', e.target.value)}
                className={`w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none ${input}`} />
            </div>
          </div>

          {/* Envío gratis: interruptor que lee el bot */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className={`text-xs font-bold uppercase tracking-wide ${label}`}>Envío gratis</p>
              <button type="button" role="switch" aria-checked={envioGratis.activo === true} aria-label="Envío gratis"
                onClick={() => setEnvioGratis('activo', !envioGratis.activo)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${envioGratis.activo ? 'bg-emerald-500' : (dm ? 'bg-white/15' : 'bg-zinc-300')}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${envioGratis.activo ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            <p className={`text-[11px] mb-3 ${label}`}>Solo motomensajería en CABA. El bot lo avisa y lo descuenta solo cuando los productos llegan al monto.</p>
            <label className={`block text-sm mb-2 ${label}`}>Desde ($)
              <input type="number" min="1" step="1000" value={envioGratis.desde ?? ''}
                onChange={(e) => setEnvioGratis('desde', e.target.value)}
                className={`mt-2 w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none ${input}`} />
            </label>
            <p className={`text-xs font-bold ${envioGratis.activo ? 'text-emerald-500' : 'text-zinc-500'}`}>
              {envioGratis.activo
                ? `Prendido: envío gratis en CABA desde $${Number(envioGratis.desde || 0).toLocaleString('es-AR')}.`
                : 'Apagado: el envío se cobra siempre.'}
            </p>
          </div>

          {/* Tarifa fija del Flash por distancia */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className={`text-xs font-bold uppercase tracking-wide ${label}`}>Tarifa del Flash</p>
              <button type="button" role="switch" aria-checked={tarifaFlash.activa === true} aria-label="Tarifa del Flash"
                onClick={() => setTarifaFlash('activa', !tarifaFlash.activa)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${tarifaFlash.activa ? 'bg-emerald-500' : (dm ? 'bg-white/15' : 'bg-zinc-300')}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${tarifaFlash.activa ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            <p className={`text-[11px] mb-3 ${label}`}>Prendida, el bot le da al cliente el precio del Flash al instante según los km por calle desde el depósito, sin cotizarlo acá. Más lejos que el último tramo no hay Flash: ofrece correo. Un tramo por renglón.</p>
            <textarea value={tarifaFlash.tramosTexto || ''} onChange={(e) => setTarifaFlash('tramosTexto', e.target.value)}
              rows={5} className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors font-mono ${input}`} />
            <p className={`text-xs font-bold mt-2 ${tarifaFlash.activa ? 'text-emerald-500' : 'text-zinc-500'}`}>
              {tarifaFlash.activa
                ? (tramosLeidos.length ? `Prendida: ${tramosLeidos.length} tramos, hasta ${tramosLeidos[tramosLeidos.length - 1].hasta} km.` : 'Falta cargar los tramos.')
                : 'Apagada: el Flash lo cotiza el depósito.'}
            </p>
          </div>

          {/* Clientes que pueden retirar en persona */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Pueden retirar en persona</label>
            <p className={`text-[11px] mb-3 ${label}`}>Un teléfono por renglón, con el nombre si querés. A estos clientes el bot les ofrece retirar: carga el pedido en la columna Retiro y ustedes le confirman el lugar y la hora. Al resto le dice que no hay local.</p>
            <textarea value={form.retiroPermitidoTexto || ''} onChange={(e) => set('retiroPermitidoTexto', e.target.value)}
              rows={5} placeholder={'11 6445 7972 Martin\n11 2592 0325 Lukita'}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors font-mono ${input}`} />
          </div>

          {/* Limite de pedidos por tanda */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Pedidos maximos por tanda</label>
            <input type="number" min="1" max="99" value={form.limitePorTanda}
              onChange={(e) => set('limitePorTanda', e.target.value)}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${input}`} />
          </div>

          {/* Dias sin despacho */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Dias sin despacho</label>
            <p className={`text-[11px] mb-3 ${label}`}>Feriados o dias que no se trabaja. Ese dia el bot sigue vendiendo, pero avisa que sale el proximo dia con despacho (ej. "sale el lunes"). Agregalo y toca Guardar. Los dias que ya pasaron se borran solos.</p>
            <div className="flex gap-2 mb-3">
              <input type="date" value={nuevoDia} min={hoyBA()} onChange={(e) => setNuevoDia(e.target.value)}
                className={`flex-1 min-w-0 rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${input}`} />
              <button onClick={agregarDia} disabled={!nuevoDia}
                className="px-3.5 rounded-xl font-bold text-sm text-white flex items-center gap-1 disabled:opacity-50"
                style={{ background: '#6366f1' }}>
                <Plus size={15} /> Agregar
              </button>
            </div>
            {diasSinDespacho.length === 0
              ? <p className={`text-xs ${label}`}>Ninguno: se despacha todos los dias.</p>
              : (
                <div className="space-y-2">
                  {diasSinDespacho.map((d) => (
                    <div key={d} className={`rounded-xl border px-4 py-2 flex items-center justify-between text-sm ${dm ? 'border-white/[0.08]' : 'border-zinc-200'}`}>
                      <span className="font-bold capitalize">{fechaLinda(d)}</span>
                      <button onClick={() => set('diasSinDespacho', diasSinDespacho.filter((x) => x !== d))}
                        className={`p-1 rounded-lg ${dm ? 'hover:bg-white/5 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`} title="Quitar">
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* Alias activo */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Alias a usar hoy</label>
            <p className={`text-[11px] mb-3 ${label}`}>Cual de los 4 le pasa el bot al cliente cuando llega el momento de cobrar.</p>
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

          {/* Precios mayorista */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Precios mayorista — texto</label>
            <label className={`block text-sm mb-3 ${label}`}>Pesos por dolar
              <input type="number" min="0.01" step="0.01" value={form.dolarMayorista ?? ''}
                onChange={(e) => set('dolarMayorista', e.target.value)}
                className={`mt-2 w-full rounded-lg border px-3.5 py-2.5 outline-none ${input}`} />
            </label>
            <textarea value={form.preciosMayoristaTexto} onChange={(e) => set('preciosMayoristaTexto', e.target.value)}
              rows={8} placeholder={'LISTA MAYORISTA\n\nDesde 10 unidades: ...\nDesde 50 unidades: ...\n...'}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors font-mono ${input}`} />
          </div>

          {/* Ofertas temporales */}
          <div className={`rounded-2xl border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Ofertas temporales — texto</label>
            <p className={`text-[11px] mb-3 ${label}`}>Promos puntuales. Escribí cada una con el nombre del producto como figura en las listas y el precio en formato <b>2x $45.000</b>: así el sistema la cobra solo. El bot la menciona cuando viene al caso. <b>Dejalo vacío cuando no haya promo vigente</b> y el bot no la nombra nunca.</p>
            <textarea value={form.ofertasTexto} onChange={(e) => set('ofertasTexto', e.target.value)}
              rows={8} placeholder={`✨ OFERTAS DE LA SEMANA

🔥 ELFBAR ICE KING 2x $45.000
Hasta el domingo`}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors font-mono ${input}`} />
          </div>
          <div className={`rounded-lg border p-5 ${card}`}>
            <label className={`block text-xs font-bold uppercase tracking-wide mb-2 ${label}`}>Nombre del apartado
              <input value={form.combosBateriasTitulo} onChange={(e) => set('combosBateriasTitulo', e.target.value)}
                className={`mt-2 w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none ${input}`} />
            </label>
            <label className={`block text-sm mt-4 mb-2 ${label}`}>{form.combosBateriasTitulo || 'Combos y baterias'}</label>
            <textarea aria-label="Informacion de combos y baterias" value={form.combosBateriasTexto}
              onChange={(e) => set('combosBateriasTexto', e.target.value)} rows={8}
              className={`w-full rounded-lg border px-3.5 py-2.5 text-sm outline-none font-mono ${input}`} />
          </div>
        </div>

        {/* Campaña: listas y envío gratis que valen solo entre el inicio y el fin */}
        <div className={`rounded-2xl border p-5 mt-5 ${card}`}>
          <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
            <div>
              <p className={`text-xs font-bold uppercase tracking-wide ${label}`}>Campaña (por ejemplo CYBER 028)</p>
              <p className={`text-[11px] mt-1 max-w-2xl ${label}`}>
                Entre el inicio y el fin, el bot usa estas listas en lugar de las de arriba y aplica el envío gratis en CABA (solo moto).
                Se prende y se apaga sola por la fecha. Una lista vacía no reemplaza la de siempre.
                Para precios por cantidad escribí <b>2x $25.000 c/u</b>: con <b>c/u</b>, todas las unidades valen el precio del escalón más alto al que llega (4 unidades pagan el de 3).
              </p>
              <p className={`text-xs font-bold mt-2 ${estadoCampania(campania).color}`}>{estadoCampania(campania).texto}</p>
            </div>
            <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input type="checkbox" checked={campania.activa === true} onChange={(e) => setCampania('activa', e.target.checked)} className="w-4 h-4" />
              Campaña prendida
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
            {[
              ['nombre', 'Nombre', 'text', 'CYBER 028'],
              ['inicio', 'Empieza', 'datetime-local'],
              ['fin', 'Termina', 'datetime-local'],
              ['lanzamientoHasta', 'Envío gratis sin mínimo hasta', 'datetime-local'],
              ['envioGratisDesde', 'Envío gratis desde ($)', 'number', '100000'],
            ].map(([campo, texto, tipo, ejemplo]) => (
              <label key={campo} className={`block text-sm ${label}`}>{texto}
                <input type={tipo} value={campania[campo] ?? ''} placeholder={ejemplo || ''} onChange={(e) => setCampania(campo, e.target.value)}
                  className={`mt-2 w-full min-w-0 rounded-lg border px-3 py-2.5 text-sm outline-none ${input}`} />
              </label>
            ))}
          </div>
          <p className={`text-[11px] mb-4 ${label}`}>
            «Envío gratis sin mínimo hasta»: desde que empieza hasta esa hora, el envío en CABA es gratis sin mínimo si paga por transferencia (el lanzamiento).
            La Mystery Box siempre tiene envío gratis en CABA.
          </p>
          <label className={`block text-sm mb-4 ${label}`}>Qué tiene que saber y decir el bot (sorteo, comunidad, cómo se llama la campaña)
            <textarea value={campania.mensaje} onChange={(e) => setCampania('mensaje', e.target.value)} rows={4}
              placeholder={'CYBER 028, del lunes 2 al miércoles 4 de noviembre.\nSorteo: $50.000 para gastar en la web. Para participar: comprá durante el Cyber y sumate a la comunidad de WhatsApp.'}
              className={`mt-2 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none ${input}`} />
          </label>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[
              ['preciosVapesTexto', 'Precios de descartables de la campaña'],
              ['appleTexto', 'Apple y accesorios de la campaña (con los combos)'],
              ['mysteryBoxTexto', 'Mystery Box'],
            ].map(([campo, texto]) => (
              <label key={campo} className={`block text-sm ${label}`}>{texto}
                <textarea value={campania[campo]} onChange={(e) => setCampania(campo, e.target.value)} rows={10}
                  className={`mt-2 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none font-mono ${input}`} />
              </label>
            ))}
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
