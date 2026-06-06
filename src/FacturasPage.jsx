import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, getFirestore, collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, Download, Search, ExternalLink, Receipt, Moon, Sun, FileSpreadsheet, Package } from 'lucide-react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const fbApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
// Usar getFirestore si ya fue inicializado por App.jsx (chunk separado vía lazy)
let db;
try {
  db = initializeFirestore(fbApp, { experimentalForceLongPolling: true });
} catch {
  db = getFirestore(fbApp);
}
if (!db) db = getFirestore(fbApp);

const formatMoney = n =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);

const fmtDate = s => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

// Ver PDF: abrir en nueva pestaña (inline)
// Descargar PDF: misma URL con &dl=1 → Content-Disposition: attachment
const dlUrl = pdfUrl => pdfUrl
  ? (pdfUrl.includes('?') ? pdfUrl + '&dl=1' : pdfUrl + '?dl=1')
  : null;

function exportarExcel(facturas) {
  const hoy = new Date().toISOString().slice(0, 10);
  const rows = facturas.map(f => ({
    'Fecha emisión':        f.fechaEmision   ? fmtDate(f.fechaEmision)   : '—',
    'Receptor / Cliente':   f.receptorNombre ?? '—',
    'Tipo comprobante':     f.tipoComprobante ?? '—',
    'Punto de venta':       f.puntoVenta != null ? String(f.puntoVenta).padStart(5, '0') : '—',
    'Número comprobante':   f.nroComprobante != null ? String(f.nroComprobante).padStart(8, '0') : '—',
    'Comprobante completo': f.comprobanteFormateado ?? '—',
    'Importe total':        f.importeTotal ?? 0,
    'CAE':                  f.cae ?? '—',
    'Vencimiento CAE':      f.vencimientoCAE ? fmtDate(f.vencimientoCAE) : '—',
    'Estado':               f.estado ?? '—',
    'Documento receptor':   f.docNro != null ? String(f.docNro) : '—',
    'Código ARCA receptor': f.docTipo != null ? `${f.docTipo} / ${f.docNro ?? 0}` : '—',
    'Link PDF':             f.pdfUrl ?? '—',
    'Link QR':              f.qrUrl  ?? '—',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  // Ancho de columnas
  ws['!cols'] = [
    { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 14 },
    { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 20 },
    { wch: 16 }, { wch: 10 }, { wch: 20 }, { wch: 22 },
    { wch: 50 }, { wch: 80 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Facturas');
  XLSX.writeFile(wb, `facturas-028-${hoy}.xlsx`);
}

async function descargarZIP(facturas, setZipLoading) {
  setZipLoading(true);
  try {
    const zip  = new JSZip();
    const hoy  = new Date().toISOString().slice(0, 10);
    await Promise.all(facturas.map(async f => {
      if (!f.pdfUrl) return;
      try {
        const res  = await fetch(f.pdfUrl);
        if (!res.ok) return;
        const blob = await res.blob();
        const name = `factura-c-${f.comprobanteFormateado || f.cae}.pdf`;
        zip.file(name, blob);
      } catch { /* skip si falla un PDF individual */ }
    }));
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `facturas-028-seleccionadas-${hoy}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } finally {
    setZipLoading(false);
  }
}

const FACTURAS_KEY = '028_facturas_auth';
const FACTURAS_PWD = 'seguridad0288';

function LoginFacturas({ dm, onAuth }) {
  const [pwd, setPwd]   = useState('');
  const [err, setErr]   = useState(false);
  const [show, setShow] = useState(false);

  const submit = e => {
    e.preventDefault();
    if (pwd === FACTURAS_PWD) {
      localStorage.setItem(FACTURAS_KEY, 'true');
      window.location.reload();
    } else {
      setErr(true);
      setPwd('');
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 ${dm ? 'bg-[#050505]' : 'bg-slate-50'}`}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className={`w-full max-w-sm rounded-2xl border p-8 shadow-xl
        ${dm ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200'}`}>

        <div className="flex items-center gap-3 mb-7">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#6366f1' }}>
            <Receipt size={17} className="text-white" />
          </div>
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>028 Import</p>
            <h1 className={`text-sm font-black leading-tight ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>Portal de Facturas</h1>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${dm ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Contraseña
            </label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={pwd}
                onChange={e => { setPwd(e.target.value); setErr(false); }}
                placeholder="••••••••••••"
                autoFocus
                className={`w-full px-3 py-2.5 pr-10 text-sm rounded-xl border outline-none transition-all
                  focus:ring-2 focus:ring-indigo-500/30
                  ${err ? 'border-red-500/60 bg-red-500/5' : dm
                    ? 'bg-[#1a1a1a] border-white/[0.08] text-zinc-100 placeholder-zinc-600'
                    : 'bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400'}`}
              />
              <button type="button" onClick={() => setShow(v => !v)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs
                  ${dm ? 'text-zinc-600 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}>
                {show ? 'ocultar' : 'ver'}
              </button>
            </div>
            {err && <p className="text-xs text-red-400 mt-1.5 font-medium">Contraseña incorrecta</p>}
          </div>

          <button type="submit"
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all
              hover:opacity-90 active:scale-[0.98]"
            style={{ background: '#6366f1' }}>
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
}

export default function FacturasPage() {
  const [dm, setDm]               = useState(() => localStorage.getItem('028_dark_mode') === 'true');
  const [auth, setAuth]           = useState(() => localStorage.getItem(FACTURAS_KEY) === 'true');
  const [facturas, setFacturas]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [selected, setSelected]   = useState(new Set());
  const [zipLoading, setZipLoading] = useState(false);

  useEffect(() => { localStorage.setItem('028_dark_mode', dm); }, [dm]);
  useEffect(() => { setSelected(new Set()); }, [search, fechaDesde, fechaHasta]);

  // Arrancar el listener siempre, independiente del auth.
  // Así los datos están listos en cuanto el usuario ingresa la contraseña.
  useEffect(() => {
    const q = query(collection(db, 'facturas'), orderBy('fechaEmision', 'desc'));
    return onSnapshot(q,
      snap  => { setFacturas(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      err   => { console.error('facturas:', err); setLoading(false); }
    );
  }, []);

  if (!auth) return <LoginFacturas dm={dm} onAuth={() => setAuth(true)} />;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return facturas.filter(f => {
      if (q) {
        const match = [f.comprobanteFormateado, f.cae, f.receptorNombre,
                       String(f.nroComprobante ?? '')]
          .some(v => (v || '').toLowerCase().includes(q));
        if (!match) return false;
      }
      if (fechaDesde && f.fechaEmision < fechaDesde) return false;
      if (fechaHasta && f.fechaEmision > fechaHasta) return false;
      return true;
    });
  }, [facturas, search, fechaDesde, fechaHasta]);

  // ── Clases base ──────────────────────────────────────────────────────────────
  const bg      = dm ? 'bg-[#050505] text-zinc-100' : 'bg-slate-50 text-zinc-900';
  const card    = dm ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200/80';
  const inp     = dm ? 'bg-[#1a1a1a] border-white/[0.08] text-zinc-100 placeholder-zinc-600'
                     : 'bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400';
  const tHead   = dm ? 'bg-[#0d0d0d] text-zinc-500' : 'bg-zinc-50 text-zinc-500';
  const tRow    = dm ? 'border-white/[0.05] hover:bg-white/[0.02]' : 'border-zinc-100 hover:bg-zinc-50/80';
  const btnGhost = dm
    ? 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300 border border-white/[0.08]'
    : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 border border-zinc-200';

  return (
    <div className={`min-h-screen ${bg}`} style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div className={`sticky top-0 z-10 border-b backdrop-blur-xl
        ${dm ? 'bg-[#101010]/90 border-white/[0.06]' : 'bg-white/90 border-zinc-200'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/"
              className={`p-1.5 rounded-lg transition-colors
                ${dm ? 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06]'
                     : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}>
              <ArrowLeft size={16} />
            </Link>
            <div className="flex items-center gap-2">
              <Receipt size={15} className="text-indigo-500" />
              <span className="font-bold text-sm tracking-tight">Facturas emitidas</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full
              ${dm ? 'bg-white/[0.06] text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>
              {filtered.length} {filtered.length === 1 ? 'factura' : 'facturas'}
            </span>
            {filtered.length > 0 && (
              <button
                onClick={() => exportarExcel(filtered)}
                title="Exportar todas las visibles a Excel"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors
                  ${dm ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                       : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                <FileSpreadsheet size={13} />
                Excel
              </button>
            )}

            <button onClick={() => setDm(v => !v)}
              className={`p-1.5 rounded-lg transition-colors
                ${dm ? 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06]'
                     : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}>
              {dm ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              onClick={() => { localStorage.removeItem(FACTURAS_KEY); setAuth(false); }}
              title="Cerrar sesión"
              className={`p-1.5 rounded-lg text-xs transition-colors
                ${dm ? 'text-zinc-600 hover:text-red-400 hover:bg-red-500/10'
                     : 'text-zinc-400 hover:text-red-500 hover:bg-red-50'}`}>
              Salir
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">

        {/* ── Filtros ── */}
        <div className={`rounded-xl border p-4 ${card}`}>
          <div className="flex flex-wrap gap-3">

            {/* Búsqueda texto */}
            <div className="relative flex-1 min-w-[220px]">
              <Search size={13} className={`absolute left-3 top-1/2 -translate-y-1/2
                ${dm ? 'text-zinc-600' : 'text-zinc-400'}`} />
              <input
                type="text"
                placeholder="Buscar por comprobante, CAE o receptor…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={`w-full pl-8 pr-3 py-2 text-sm rounded-lg border outline-none
                  focus:ring-1 focus:ring-indigo-500/40 transition-all ${inp}`}
              />
            </div>

            {/* Fecha desde */}
            <div className="flex items-center gap-2">
              <span className={`text-xs whitespace-nowrap ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>Desde</span>
              <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                className={`px-3 py-2 text-sm rounded-lg border outline-none
                  focus:ring-1 focus:ring-indigo-500/40 transition-all ${inp}`} />
            </div>

            {/* Fecha hasta */}
            <div className="flex items-center gap-2">
              <span className={`text-xs whitespace-nowrap ${dm ? 'text-zinc-500' : 'text-zinc-500'}`}>Hasta</span>
              <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                className={`px-3 py-2 text-sm rounded-lg border outline-none
                  focus:ring-1 focus:ring-indigo-500/40 transition-all ${inp}`} />
            </div>

            {/* Limpiar */}
            {(search || fechaDesde || fechaHasta) && (
              <button onClick={() => { setSearch(''); setFechaDesde(''); setFechaHasta(''); }}
                className={`px-3 py-2 text-xs rounded-lg transition-all ${btnGhost}`}>
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* ── Barra de acciones de selección ── */}
        {selected.size > 0 && (() => {
          const selFacturas = filtered.filter(f => selected.has(f.id));
          return (
            <div className={`rounded-xl border px-4 py-3 flex flex-wrap items-center gap-3
              ${dm ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-indigo-50 border-indigo-200'}`}>
              <span className={`text-xs font-bold ${dm ? 'text-indigo-300' : 'text-indigo-700'}`}>
                {selected.size} {selected.size === 1 ? 'seleccionada' : 'seleccionadas'}
              </span>
              <button
                onClick={() => exportarExcel(selFacturas)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                  ${dm ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                       : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}>
                <FileSpreadsheet size={13} />
                Exportar Excel
              </button>
              <button
                disabled={zipLoading}
                onClick={() => descargarZIP(selFacturas, setZipLoading)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                  ${dm ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                       : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                {zipLoading
                  ? <><div className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> Generando ZIP…</>
                  : <><Package size={13} /> Descargar ZIP</>}
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className={`ml-auto text-xs transition-colors
                  ${dm ? 'text-zinc-600 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}>
                Limpiar selección
              </button>
            </div>
          );
        })()}

        {/* ── Tabla ── */}
        <div className={`rounded-xl border overflow-hidden ${card}`}>
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2.5">
              <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              <span className={`text-sm ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>Cargando facturas…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Receipt size={30} className={dm ? 'text-zinc-700' : 'text-zinc-300'} />
              <p className={`text-sm font-medium ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {facturas.length === 0
                  ? 'No hay facturas emitidas aún'
                  : 'Sin resultados para los filtros aplicados'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-[11px] font-bold uppercase tracking-wide ${tHead}`}>
                    <th className="pl-4 pr-3 py-3 text-center w-10">
                      {(() => {
                        const allSel = filtered.length > 0 && filtered.every(f => selected.has(f.id));
                        const someSel = selected.size > 0 && !allSel;
                        return (
                          <button
                            onClick={() => allSel ? setSelected(new Set()) : setSelected(new Set(filtered.map(f => f.id)))}
                            title={allSel ? 'Deseleccionar todas' : 'Seleccionar todas'}
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all mx-auto
                              ${allSel
                                ? 'bg-indigo-500 border-indigo-500'
                                : someSel
                                ? 'bg-indigo-500/40 border-indigo-400'
                                : (dm ? 'border-zinc-600 hover:border-indigo-400 bg-transparent' : 'border-zinc-300 hover:border-indigo-400 bg-transparent')}`}>
                            {allSel && <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-none stroke-white stroke-2"><polyline points="1,4 4,7 9,1"/></svg>}
                            {someSel && <div className="w-2 h-0.5 bg-white rounded" />}
                          </button>
                        );
                      })()}
                    </th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">Fecha</th>
                    <th className="px-4 py-3 text-left">Receptor</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">Tipo</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">Comprobante</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">Importe</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">CAE</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Estado</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(f => (
                    <tr key={f.id}
                      className={`border-t transition-colors ${tRow} ${selected.has(f.id) ? (dm ? 'bg-indigo-500/[0.07]' : 'bg-indigo-50/60') : ''}`}>

                      {/* Checkbox */}
                      <td className="pl-4 pr-3 py-3 text-center">
                        <button
                          onClick={() => setSelected(prev => {
                            const next = new Set(prev);
                            next.has(f.id) ? next.delete(f.id) : next.add(f.id);
                            return next;
                          })}
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all mx-auto
                            ${selected.has(f.id)
                              ? 'bg-indigo-500 border-indigo-500'
                              : (dm ? 'border-zinc-600 hover:border-indigo-400 bg-transparent' : 'border-zinc-300 hover:border-indigo-400 bg-transparent')}`}>
                          {selected.has(f.id) && (
                            <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-none stroke-white stroke-2">
                              <polyline points="1,4 4,7 9,1"/>
                            </svg>
                          )}
                        </button>
                      </td>

                      {/* Fecha */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs tabular-nums ${dm ? 'text-zinc-300' : 'text-zinc-700'}`}>
                          {fmtDate(f.fechaEmision)}
                        </span>
                      </td>

                      {/* Receptor */}
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${dm ? 'text-zinc-200' : 'text-zinc-800'}`}>
                          {f.receptorNombre || '—'}
                        </span>
                      </td>

                      {/* Tipo */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full
                          ${dm ? 'bg-indigo-500/15 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
                          {f.tipoComprobante}
                        </span>
                      </td>

                      {/* Comprobante */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs font-mono ${dm ? 'text-zinc-300' : 'text-zinc-700'}`}>
                          {f.comprobanteFormateado}
                        </span>
                      </td>

                      {/* Importe */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className={`text-xs font-semibold tabular-nums
                          ${dm ? 'text-zinc-100' : 'text-zinc-900'}`}>
                          {formatMoney(f.importeTotal)}
                        </span>
                      </td>

                      {/* CAE */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-[11px] font-mono ${dm ? 'text-zinc-500' : 'text-zinc-400'}`}>
                          {f.cae}
                        </span>
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full
                          bg-emerald-500/15 text-emerald-500">
                          {f.estado || 'emitida'}
                        </span>
                      </td>

                      {/* Acciones PDF */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          {f.pdfUrl ? (
                            <>
                              <a href={f.pdfUrl} target="_blank" rel="noopener noreferrer"
                                title="Ver PDF"
                                className={`p-1.5 rounded-lg transition-colors
                                  ${dm ? 'text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10'
                                       : 'text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50'}`}>
                                <ExternalLink size={14} />
                              </a>
                              <a href={dlUrl(f.pdfUrl)} target="_blank" rel="noopener noreferrer"
                                title="Descargar PDF"
                                className={`p-1.5 rounded-lg transition-colors
                                  ${dm ? 'text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10'
                                       : 'text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                                <Download size={14} />
                              </a>
                            </>
                          ) : (
                            <span className={`text-[10px] ${dm ? 'text-zinc-700' : 'text-zinc-300'}`}>
                              Sin PDF
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pie */}
        {!loading && filtered.length > 0 && (
          <p className={`text-[11px] text-center ${dm ? 'text-zinc-700' : 'text-zinc-400'}`}>
            {filtered.length === facturas.length
              ? `${facturas.length} ${facturas.length === 1 ? 'factura' : 'facturas'} en total`
              : `Mostrando ${filtered.length} de ${facturas.length} facturas`}
          </p>
        )}
      </div>
    </div>
  );
}
