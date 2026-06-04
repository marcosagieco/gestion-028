import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, getFirestore, collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, Download, Search, ExternalLink, Receipt, Moon, Sun } from 'lucide-react';

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
  db = initializeFirestore(fbApp, { experimentalForceLongPolling: true });
} catch {
  db = getFirestore(fbApp);
}

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

export default function FacturasPage() {
  const [dm, setDm]               = useState(() => localStorage.getItem('028_dark_mode') === 'true');
  const [facturas, setFacturas]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  useEffect(() => { localStorage.setItem('028_dark_mode', dm); }, [dm]);

  useEffect(() => {
    const q = query(collection(db, 'facturas'), orderBy('fechaEmision', 'desc'));
    return onSnapshot(q,
      snap  => { setFacturas(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      err   => { console.error('facturas:', err); setLoading(false); }
    );
  }, []);

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
            <button onClick={() => setDm(v => !v)}
              className={`p-1.5 rounded-lg transition-colors
                ${dm ? 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06]'
                     : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}>
              {dm ? <Sun size={14} /> : <Moon size={14} />}
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
                    <tr key={f.id} className={`border-t transition-colors ${tRow}`}>

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
