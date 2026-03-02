import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Trash2, Save, TrendingUp, DollarSign, Package,
  ShoppingCart, Wallet, Activity, LogOut, Moon, Sun, AlertTriangle, Calendar, Award, FolderOpen, ChevronRight, ChevronDown, Box, Users, BarChart3, CheckCircle, Clock, Settings, Truck, Home, Percent, Flame, WifiOff, Download, XCircle, Tag
} from 'lucide-react';

// --- 1. IMPORTACIONES DE FIREBASE ---
import { initializeApp } from "firebase/app";
import {
  initializeFirestore, collection, addDoc, deleteDoc, doc, updateDoc, setDoc,
  onSnapshot, query, orderBy
} from 'firebase/firestore';

// --- 2. CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCavgJ20mrE5HZHW7H7NKQ0sibs5p4Q-TU",
  authDomain: "gestion-028.firebaseapp.com",
  projectId: "gestion-028",
  storageBucket: "gestion-028.firebasestorage.app",
  messagingSenderId: "5538640148",
  appId: "1:5538640148:web:a6a34ee4e1dad97390d201"
};

let db;
try {
  const app = initializeApp(firebaseConfig);
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true
  });
} catch (error) {
  console.error("Error inicializando Firebase:", error);
}

// --- 3. COMPONENTES UI COMPACTOS ---

const Card = ({ children, className = '', darkMode }) => (
  <div className={`rounded-lg shadow-sm p-4 border transition-all duration-300 ${
    darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
  } ${className}`}>
    {children}
  </div>
);

const Button = ({ onClick, children, variant = 'primary', className = '', disabled = false, darkMode }) => {
  const baseStyle = "px-3 py-1.5 rounded-md font-bold transition-all duration-200 flex items-center justify-center gap-2 text-xs shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide";
  const variants = {
    primary: darkMode ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-slate-900 text-white hover:bg-slate-800",
    danger: "bg-red-500 text-white hover:bg-red-600",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
    outline: darkMode ? "border border-slate-600 text-slate-300 bg-transparent hover:border-slate-500" : "border border-slate-200 text-slate-700 bg-transparent hover:border-slate-800"
  };
  return <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`}>{children}</button>;
};

const Input = ({ label, symbol, darkMode, list, ...props }) => (
  <div className="flex flex-col gap-1 w-full">
    {label && <label className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</label>}
    <div className="relative">
      {symbol && <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none"><span className={`text-xs font-bold ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{symbol}</span></div>}
      <input list={list} className={`border rounded-md p-2 w-full text-sm outline-none transition-all ${darkMode ? 'bg-slate-700 border-slate-600 text-white focus:ring-2 focus:ring-blue-500' : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-2 focus:ring-slate-800'} ${symbol ? 'pl-7' : ''}`} {...props} />
    </div>
  </div>
);

const Select = ({ label, options, darkMode, ...props }) => (
  <div className="flex flex-col gap-1 w-full">
    {label && <label className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</label>}
    <div className="relative">
      <select className={`appearance-none w-full border rounded-md p-2 pr-6 text-sm outline-none cursor-pointer transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} {...props}>
        {options.map((opt, idx) => <option key={idx} value={opt.value} className={darkMode ? 'bg-slate-800' : ''}>{opt.label}</option>)}
      </select>
    </div>
  </div>
);

// Utilidad para exportar a CSV
const exportToCSV = (filename, rows) => {
  const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.map(item => `"${String(item).replace(/"/g, '""')}"`).join(",")).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPreviousDayStr = (dateStr) => {
  const [y, m, d] = dateStr.split('-');
  const date = new Date(y, m - 1, d, 12, 0, 0);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// --- COMPONENTE DE GRÁFICO EXACTO Y DINÁMICO ---
const SalesChart = ({ sales, globalMonth, darkMode }) => {
  const [metric, setMetric] = useState('revenue'); 
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const formatMoney = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
  const formatCompact = (val) => new Intl.NumberFormat('es-AR', { notation: "compact", compactDisplay: "short", maximumFractionDigits: 1 }).format(val);

  const chartData = useMemo(() => {
    const map = {};
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    if (globalMonth !== 'all') {
      const [yStr, mStr] = globalMonth.split('-');
      const y = parseInt(yStr);
      const m = parseInt(mStr);
      const daysInMonth = new Date(y, m, 0).getDate();
      
      for (let i = 1; i <= daysInMonth; i++) {
        const dayStr = String(i).padStart(2, '0');
        const key = `${yStr}-${mStr}-${dayStr}`;
        map[key] = {
          key,
          label: `${i}`,
          fullLabel: `${i} de ${monthNames[m - 1]} ${y}`,
          revenue: 0,
          quantity: 0
        };
      }
    } else {
      if (!sales || sales.length === 0) return [];
      
      const dates = sales.map(s => new Date(s.date));
      const rawMin = new Date(Math.min(...dates));
      const rawMax = new Date(Math.max(...dates));
      const minDate = new Date(rawMin.getFullYear(), rawMin.getMonth(), rawMin.getDate());
      const maxDate = new Date(rawMax.getFullYear(), rawMax.getMonth(), rawMax.getDate());

      for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${day}`;
        map[key] = {
          key,
          label: `${day}/${m}`,
          fullLabel: `${day} de ${monthNames[d.getMonth()]} ${y}`,
          revenue: 0,
          quantity: 0
        };
      }
    }

    sales.forEach(s => {
      const d = new Date(s.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (map[key]) {
        map[key].revenue += s.totalSaleRaw;
        map[key].quantity += s.quantity;
      }
    });

    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
  }, [sales, globalMonth]);

  if (chartData.length === 0) return <div className="h-40 flex items-center justify-center text-xs opacity-50">No hay ventas registradas</div>;

  const MIN_POINT_DISTANCE = 40;
  const calculatedWidth = Math.max(800, chartData.length * MIN_POINT_DISTANCE);
  
  const w = calculatedWidth;
  const h = 340; 
  const padXLeft = 15; 
  const padXRight = 40;
  const padYTop = 90; 
  const padYBottom = 40;
  const chartW = w - padXLeft - padXRight;
  const chartH = h - padYTop - padYBottom;

  const values = chartData.map(d => metric === 'revenue' ? d.revenue : d.quantity);
  const rawMax = Math.max(...values, 4);

  const getNiceScale = (maxVal, numTicks = 8) => {
    if (maxVal <= 0) return { max: 8, ticks: [2, 4, 6, 8], step: 2 };
    const roughStep = maxVal / numTicks;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalizedStep = roughStep / magnitude;
    
    let niceStep;
    if (normalizedStep < 1.5) niceStep = 1;
    else if (normalizedStep < 3.5) niceStep = 2;
    else if (normalizedStep < 7.5) niceStep = 5;
    else niceStep = 10;
    niceStep *= magnitude;
    
    const niceMax = Math.ceil(maxVal / niceStep) * niceStep;
    const ticks = [];
    for (let i = niceStep; i <= niceMax; i += niceStep) {
        ticks.push(i);
    }
    return { max: niceMax, ticks: ticks.reverse() };
  };

  const scaleData = getNiceScale(rawMax, 8); 
  const maxVal = scaleData.max;
  const yTickValues = [...scaleData.ticks, 0];

  const points = chartData.map((d, i) => {
    const val = metric === 'revenue' ? d.revenue : d.quantity;
    const x = padXLeft + (i * chartW / (chartData.length > 1 ? chartData.length - 1 : 1));
    const y = padYTop + chartH - ((val / maxVal) * chartH);
    return { ...d, x, y, val };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${h - padYBottom} L ${points[0].x} ${h - padYBottom} Z`;

  const formatYAxis = (val) => {
      if (metric === 'revenue') {
          if (val === 0) return '0';
          return '$' + formatCompact(val);
      }
      return val.toString();
  };

  return (
    <div className="w-full flex flex-col space-y-4">
      <div className="flex justify-start">
          <div className="flex items-center gap-1 bg-slate-500/10 p-1 rounded-lg w-fit">
              <button 
                  onClick={() => setMetric('revenue')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${metric === 'revenue' ? 'bg-blue-500 text-white shadow' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              >
                  Ventas ($)
              </button>
              <button 
                  onClick={() => setMetric('quantity')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${metric === 'quantity' ? 'bg-emerald-500 text-white shadow' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              >
                  Unidades (u.)
              </button>
          </div>
      </div>

      <div className="relative flex w-full border border-slate-200 dark:border-slate-700/50 rounded-xl bg-slate-50/50 dark:bg-slate-900/20 overflow-hidden shadow-inner">
          <div className={`w-[55px] md:w-[65px] flex-shrink-0 relative z-10 border-r ${darkMode ? 'border-slate-700/80 bg-slate-800' : 'border-slate-200 bg-white shadow-sm'}`}>
              {yTickValues.map(tickVal => {
                  const y = padYTop + chartH - ((tickVal / maxVal) * chartH);
                  return (
                      <div key={tickVal} className="absolute w-full text-right pr-2 pointer-events-none" style={{ top: `${y}px`, transform: 'translateY(-50%)' }}>
                          <span className={`text-[9px] md:text-[10px] font-black ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              {formatYAxis(tickVal)}
                          </span>
                      </div>
                  );
              })}
          </div>

          <div className="flex-1 overflow-x-auto custom-scrollbar relative group">
              <div style={{ minWidth: `${w}px`, height: `${h}px` }} className="relative">
                  <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="gradientArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={metric === 'revenue' ? '#3b82f6' : '#10b981'} stopOpacity="0.4" />
                        <stop offset="100%" stopColor={metric === 'revenue' ? '#3b82f6' : '#10b981'} stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {yTickValues.map(tickVal => {
                        const y = padYTop + chartH - ((tickVal / maxVal) * chartH);
                        return (
                            <line 
                                key={tickVal} 
                                x1={0} y1={y} 
                                x2={w} y2={y} 
                                stroke={darkMode ? "#334155" : "#e2e8f0"} 
                                strokeWidth={tickVal === 0 ? "2" : "1"} 
                                strokeDasharray={tickVal === 0 ? "0" : "4 4"} 
                            />
                        );
                    })}

                    {hoveredIndex !== null && (
                        <line 
                            x1={points[hoveredIndex].x} y1={padYTop} 
                            x2={points[hoveredIndex].x} y2={h - padYBottom} 
                            stroke={darkMode ? "#64748b" : "#94a3b8"} 
                            strokeWidth="1" strokeDasharray="4 4" 
                        />
                    )}

                    <path d={areaPath} fill="url(#gradientArea)" className="transition-all duration-300" />
                    <path d={linePath} fill="none" stroke={metric === 'revenue' ? '#3b82f6' : '#10b981'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-300" />

                    {points.map((p, i) => {
                      const isHovered = hoveredIndex === i;
                      let step = 1;
                      if (chartData.length > 90) step = 10;
                      else if (chartData.length > 60) step = 5;
                      else if (chartData.length > 31) step = 3;
                      else if (chartData.length > 15) step = 2;
                      
                      const showLabel = isHovered || (i % step === 0) || i === chartData.length - 1;

                      return (
                        <g key={i}>
                          <circle 
                              cx={p.x} cy={p.y} 
                              r={isHovered ? "6" : "3"} 
                              fill={darkMode ? (isHovered ? (metric==='revenue'?"#3b82f6":"#10b981") : "#1e293b") : (isHovered ? (metric==='revenue'?"#3b82f6":"#10b981") : "#ffffff")} 
                              stroke={metric === 'revenue' ? '#3b82f6' : '#10b981'} 
                              strokeWidth="2" 
                              className="transition-all duration-200 pointer-events-none" 
                          />
                          <circle 
                              cx={p.x} cy={p.y} r="25" fill="transparent" 
                              className="cursor-crosshair"
                              onMouseEnter={() => setHoveredIndex(i)}
                              onMouseLeave={() => setHoveredIndex(null)}
                              onTouchStart={() => setHoveredIndex(i)}
                          />
                          
                          {showLabel && (
                              <text 
                                  x={p.x} y={h - padYBottom + 20} 
                                  textAnchor="middle" 
                                  fill={isHovered ? (darkMode ? "#ffffff" : "#0f172a") : (darkMode ? "#64748b" : "#94a3b8")} 
                                  fontSize="10" 
                                  fontWeight={isHovered ? "bold" : "normal"}
                                  className="transition-all pointer-events-none"
                              >
                                  {p.label}
                              </text>
                          )}
                          
                          {(!isHovered && p.val > 0 && showLabel) && (
                              <text x={p.x} y={p.y - 12} textAnchor="middle" fill={darkMode ? "#64748b" : "#94a3b8"} fontSize="9" className="pointer-events-none">
                                 {metric === 'revenue' ? formatCompact(p.val) : p.val}
                              </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>

                  {hoveredIndex !== null && (
                      <div 
                          className="absolute z-10 pointer-events-none transition-all duration-100 ease-out pb-3"
                          style={{ 
                              left: hoveredIndex === 0 ? `${(points[hoveredIndex].x / w) * 100}%` : 
                                    hoveredIndex === points.length - 1 ? `calc(${(points[hoveredIndex].x / w) * 100}% - 10px)` : 
                                    `${(points[hoveredIndex].x / w) * 100}%`,
                              top: `${(points[hoveredIndex].y / h) * 100}%`,
                              transform: `translate(${hoveredIndex === 0 ? '0%' : hoveredIndex === points.length - 1 ? '-100%' : '-50%'}, -120%)`
                          }}
                      >
                          <div className={`p-3 rounded-lg shadow-xl border backdrop-blur-md whitespace-nowrap ${darkMode ? 'bg-slate-800/95 border-slate-600' : 'bg-white/95 border-slate-200'}`}>
                              <div className={`text-[10px] font-bold uppercase mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{points[hoveredIndex].fullLabel}</div>
                              <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center justify-between gap-6">
                                      <span className="text-xs font-medium opacity-70">Ingresos:</span>
                                      <span className={`text-sm font-black ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                                          {formatMoney(points[hoveredIndex].revenue)}
                                      </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-6">
                                      <span className="text-xs font-medium opacity-70">Unidades:</span>
                                      <span className="text-sm font-bold text-emerald-500">
                                          {points[hoveredIndex].quantity} u.
                                      </span>
                                  </div>
                              </div>
                          </div>
                      </div>
                  )}
              </div>
          </div>
      </div>
    </div>
  );
};

// --- 4. APP PRINCIPAL ---
export default function App() {
  const [user, setUser] = useState(() => localStorage.getItem('028_user') || null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('028_dark_mode') === 'true');
  const [isOffline, setIsOffline] = useState(false);
  
  // SISTEMA DE NOTIFICACIONES (TOAST)
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    localStorage.setItem('028_dark_mode', darkMode);
    if (darkMode) document.body.classList.add('dark'); else document.body.classList.remove('dark');
  }, [darkMode]);

  const [activeTab, setActiveTab] = useState('home'); 
  const [batches, setBatches] = useState([]);
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState(false);
  
  const [expandedBatchId, setExpandedBatchId] = useState(null);
  const [manualFinalizeDate, setManualFinalizeDate] = useState(getTodayDate());
  const [globalMonth, setGlobalMonth] = useState('all');
  const [newBatchName, setNewBatchName] = useState('');
  const [newItem, setNewItem] = useState({ product: '', variant: '', costArs: '', initialStock: '' });
  const [newSale, setNewSale] = useState({ batchId: '', itemId: '', quantity: 1, unitPrice: '', shippingCost: 0, shippingPrice: 0, source: 'Instagram', isReseller: 'No', saleDate: getTodayDate() });
  const [newExpense, setNewExpense] = useState({ description: '', amount: '', batchId: '' });
  const [selectedBatchStats, setSelectedBatchStats] = useState(null);

  // NUEVO: ESTADO PARA LOS NOMBRES OCULTOS DEL AUTOCOMPLETADO
  const [hiddenSuggestions, setHiddenSuggestions] = useState({ products: [], variants: [] });

  useEffect(() => {
    if (!user) return;
    if (firebaseConfig.apiKey === "TU_API_KEY_AQUI") { setConfigError(true); setLoading(false); return; }
    
    setLoading(true);

    try {
        const unsubBatches = onSnapshot(query(collection(db, 'batches'), orderBy('createdAt', 'desc')), (snap) => {
            setBatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsOffline(false);
        }, (error) => {
            console.error("Error fetching batches:", error);
            setIsOffline(true);
            setLoading(false); 
        });
        const unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('date', 'desc')), (snap) => {
            setSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsOffline(false);
        }, (error) => {
            console.error(error);
            setIsOffline(true);
        });
        const unsubExp = onSnapshot(query(collection(db, 'expenses'), orderBy('date', 'desc')), (snap) => {
            setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsOffline(false);
        }, (error) => {
            console.error(error);
            setIsOffline(true);
        });

        // Cargar lista de palabras ocultas (Catálogo / Diccionario)
        const unsubSettings = onSnapshot(doc(db, 'settings', 'autocomplete'), (docSnap) => {
            if (docSnap.exists()) {
                setHiddenSuggestions(docSnap.data());
            } else {
                setHiddenSuggestions({ products: [], variants: [] });
            }
        }, (error) => console.error("Error settings:", error));
        
        setLoading(false);
        return () => { 
            unsubBatches(); 
            unsubSales(); 
            unsubExp(); 
            unsubSettings();
        };
    } catch (e) {
        console.error("Error general de conexión", e);
        setIsOffline(true);
        setLoading(false);
    }
  }, [user]);

  const formatMoney = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
  const formatPercent = (val) => new Intl.NumberFormat('es-AR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val / 100);

  // AUTOCOMPLETADO (CATÁLOGO BASE) - LIMPIEZA DE DUPLICADOS Y OCULTOS
  const { uniqueProducts, uniqueVariants } = useMemo(() => {
      const prodsMap = new Map();
      const varsMap = new Map();
      
      batches.forEach(b => {
          if (b.items) {
              b.items.forEach(i => {
                  if (i.product) {
                      const p = i.product.trim();
                      const key = p.toLowerCase();
                      if (!hiddenSuggestions.products?.includes(key) && !prodsMap.has(key)) {
                          prodsMap.set(key, p);
                      }
                  }
                  if (i.variant) {
                      const v = i.variant.trim();
                      const key = v.toLowerCase();
                      if (!hiddenSuggestions.variants?.includes(key) && !varsMap.has(key)) {
                          varsMap.set(key, v);
                      }
                  }
              });
          }
      });
      return { 
          uniqueProducts: Array.from(prodsMap.values()).sort(), 
          uniqueVariants: Array.from(varsMap.values()).sort() 
      };
  }, [batches, hiddenSuggestions]);

  const monthOptions = useMemo(() => {
    const getLocalMonth = (isoString) => {
      if (!isoString) return '';
      const d = new Date(isoString);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const months = new Set();
    sales.forEach(s => months.add(getLocalMonth(s.date)));
    expenses.forEach(e => months.add(getLocalMonth(e.date)));
    batches.forEach(b => months.add(getLocalMonth(b.createdAt)));
    
    const sortedMonths = Array.from(months).filter(Boolean).sort().reverse();
    return [
      { value: 'all', label: '-- Histórico Completo --' },
      ...sortedMonths.map(m => {
        const [year, month] = m.split('-');
        const date = new Date(year, parseInt(month) - 1);
        const monthName = date.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        return { value: m, label: monthName.charAt(0).toUpperCase() + monthName.slice(1) };
      })
    ];
  }, [sales, expenses, batches]);

  // --- ANALISIS GLOBAL (INICIO) FILTRADO POR MES ---
  const globalAnalysis = useMemo(() => {
      const getLocalMonth = (isoString) => {
          if (!isoString) return '';
          const d = new Date(isoString);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      };

      const filteredSales = globalMonth === 'all' ? sales : sales.filter(s => getLocalMonth(s.date) === globalMonth);
      const filteredExpenses = globalMonth === 'all' ? expenses : expenses.filter(e => getLocalMonth(e.date) === globalMonth);
      const filteredBatches = globalMonth === 'all' ? batches : batches.filter(b => getLocalMonth(b.createdAt) === globalMonth);

      let totalRevenue = 0, itemsSold = 0, totalShippingProfit = 0;
      const sourceCounts = {};
      const typeCounts = { Revendedor: 0, Final: 0 };

      filteredSales.forEach(s => {
          totalRevenue += s.totalSaleRaw;
          itemsSold += s.quantity;
          const saleShippingProfit = s.totalSaleRaw - (s.unitPrice * s.quantity);
          totalShippingProfit += saleShippingProfit;
          const src = s.source || 'Otro';
          sourceCounts[src] = (sourceCounts[src] || 0) + 1;
          if (s.isReseller === 'Si' || s.isReseller === true) typeCounts.Revendedor++; else typeCounts.Final++;
      });

      const totalInvestment = filteredBatches.reduce((accBatch, batch) => {
          return accBatch + (batch.items || []).reduce((accItem, item) => accItem + (item.costArs * item.initialStock), 0);
      }, 0);

      const totalGlobalExpenses = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);
      const costOfSoldFiltered = filteredSales.reduce((acc, s) => acc + (s.costArsAtSale * s.quantity), 0);
      
      const grossProfit = totalRevenue - costOfSoldFiltered;
      const netProfit = grossProfit - totalGlobalExpenses;
      const cashBalance = totalRevenue - totalInvestment - totalGlobalExpenses;
      
      const globalTotalInvestment = batches.reduce((accBatch, batch) => accBatch + (batch.items || []).reduce((accItem, item) => accItem + (item.costArs * item.initialStock), 0), 0);
      const globalCostOfSold = sales.reduce((acc, s) => acc + (s.costArsAtSale * s.quantity), 0);
      const currentStockValue = globalTotalInvestment - globalCostOfSold;

      const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
      const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      // CÁLCULO COMPARATIVA MES A MES (MoM)
      let prevRevenue = null;
      let prevNetProfit = null;
      if (globalMonth !== 'all') {
          const [y, m] = globalMonth.split('-').map(Number);
          const prevDate = new Date(y, m - 2, 1);
          const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

          const prevSales = sales.filter(s => getLocalMonth(s.date) === prevMonthStr);
          const prevExpenses = expenses.filter(e => getLocalMonth(e.date) === prevMonthStr);

          let pRev = 0, pCostSold = 0;
          prevSales.forEach(s => { pRev += s.totalSaleRaw; pCostSold += (s.costArsAtSale * s.quantity); });
          const pExp = prevExpenses.reduce((acc, e) => acc + e.amount, 0);
          
          prevRevenue = pRev;
          prevNetProfit = (pRev - pCostSold) - pExp;
      }

      let daysActive = 0;
      if (globalMonth === 'all') {
          if (batches.length > 0) {
              const sortedBatches = [...batches].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
              const firstDate = new Date(sortedBatches[0].createdAt);
              const now = new Date();
              daysActive = Math.ceil(Math.abs(now - firstDate) / (1000 * 60 * 60 * 24)) || 1;
          }
      } else {
          const [y, m] = globalMonth.split('-').map(Number);
          const now = new Date();
          if (now.getFullYear() === y && now.getMonth() + 1 === m) {
              daysActive = now.getDate();
          } else {
              daysActive = new Date(y, m, 0).getDate();
          }
      }
      
      const dailyAvgItems = daysActive > 0 ? itemsSold / daysActive : 0;

      const uniqueDateStrs = [...new Set(filteredSales.map(s => {
          const d = new Date(s.date);
          return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }))].sort((a, b) => b.localeCompare(a));

      let currentStreak = 0;
      if (uniqueDateStrs.length > 0) {
          const todayStr = getTodayDate();
          const yesterdayStr = getPreviousDayStr(todayStr);
          let checkDate = '';
          if (uniqueDateStrs[0] === todayStr) { currentStreak = 1; checkDate = todayStr; } 
          else if (uniqueDateStrs[0] === yesterdayStr) { currentStreak = 1; checkDate = yesterdayStr; }

          if (currentStreak === 1) {
              for (let i = 1; i < uniqueDateStrs.length; i++) {
                  const expectedStr = getPreviousDayStr(checkDate);
                  if (uniqueDateStrs[i] === expectedStr) { currentStreak++; checkDate = expectedStr; } 
                  else break;
              }
          }
      }

      return {
          totalRevenue, totalInvestment, totalGlobalExpenses, grossProfit, grossMargin,
          totalShippingProfit, netProfit, netMargin, cashBalance, currentStockValue, 
          itemsSold, salesCount: filteredSales.length, sourceCounts, typeCounts, dailyAvgItems,
          daysActive, currentStreak, filteredSales, prevRevenue, prevNetProfit
      };
  }, [sales, batches, expenses, globalMonth]);

  // Funciones de Exportación
  const handleExportSales = () => {
      const headers = ['Fecha', 'Lote', 'Producto', 'Variante', 'Cantidad', 'Precio Unitario', 'Total Venta', 'Costo Unitario', 'Ganancia Envio', 'Origen', 'Revendedor'];
      const rows = sales.map(s => [
          new Date(s.date).toLocaleDateString(), s.batchName, s.productName, s.variant, 
          s.quantity, s.unitPrice, s.totalSaleRaw, s.costArsAtSale, 
          (s.totalSaleRaw - (s.unitPrice * s.quantity)), s.source, s.isReseller ? 'Si' : 'No'
      ]);
      exportToCSV('historial_ventas.csv', [headers, ...rows]);
      showToast('Historial de ventas descargado', 'success');
  };

  const handleExportBatches = () => {
      const headers = ['Lote', 'Fecha Creacion', 'Estado', 'Producto', 'Variante', 'Costo Unitario', 'Stock Inicial', 'Stock Actual'];
      const rows = [];
      batches.forEach(b => {
          if (!b.items || b.items.length === 0) {
              rows.push([b.name, new Date(b.createdAt).toLocaleDateString(), b.finalizedAt ? 'Finalizado' : 'Activo', '', '', '', '', '']);
          } else {
              b.items.forEach(i => {
                  rows.push([b.name, new Date(b.createdAt).toLocaleDateString(), b.finalizedAt ? 'Finalizado' : 'Activo', i.product, i.variant, i.costArs, i.initialStock, i.currentStock]);
              });
          }
      });
      exportToCSV('inventario_lotes.csv', [headers, ...rows]);
      showToast('Inventario descargado', 'success');
  };

  // --- ACCIONES DE LOTES Y ITEMS ---
  const handleCreateBatch = async () => {
    if (!newBatchName) return showToast("Ponle un nombre a la carpeta", 'error');
    try { await addDoc(collection(db, 'batches'), { name: newBatchName, createdAt: new Date().toISOString(), items: [] }); setNewBatchName(''); showToast("Carpeta creada correctamente", 'success'); } catch (e) { showToast("Error: " + e.message, 'error'); }
  };
  const handleDeleteBatch = async (id) => { if (window.confirm('¿Borrar carpeta completa? Se perderá el historial interno.')) await deleteDoc(doc(db, 'batches', id)); };

  const handleUpdateBatchStatus = async (batchId, isFinalizing) => {
    if (isFinalizing) {
        if (!manualFinalizeDate) return showToast("Selecciona una fecha", 'error');
        if (!window.confirm(`¿Confirmar que el stock se terminó el día ${manualFinalizeDate}? Esto detendrá el contador de días.`)) return;
        const [year, month, day] = manualFinalizeDate.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day, 12, 0, 0);
        try { await updateDoc(doc(db, 'batches', batchId), { finalizedAt: dateObj.toISOString() }); showToast("Lote Finalizado Correctamente", 'success'); } catch (e) { showToast("Error: " + e.message, 'error'); }
    } else {
        if (!window.confirm("¿Reactivar este lote? Volverá a contar los días para el promedio diario.")) return;
        try { await updateDoc(doc(db, 'batches', batchId), { finalizedAt: null }); showToast("Lote Reactivado", 'success'); } catch (e) { showToast("Error: " + e.message, 'error'); }
    }
  };

  const handleAddItemToBatch = async (batchId) => {
    if (!newItem.product || !newItem.costArs || !newItem.initialStock) return showToast("Faltan datos para crear el producto", 'error');
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    const newItemData = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      product: newItem.product, variant: newItem.variant || 'Único',
      costArs: parseFloat(newItem.costArs) || 0,
      initialStock: parseInt(newItem.initialStock) || 0,
      currentStock: parseInt(newItem.initialStock) || 0,
    };
    try { await updateDoc(doc(db, 'batches', batchId), { items: [...(batch.items || []), newItemData] }); setNewItem({ product: '', variant: '', costArs: '', initialStock: '' }); showToast("Producto agregado al lote", 'success'); } catch (e) { showToast("Error: " + e.message, 'error'); }
  };

  const handleDeleteItemFromBatch = async (batchId, itemId) => {
    if (!window.confirm('¿Borrar este producto del lote?')) return;
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    const updatedItems = batch.items.filter(i => i.id !== itemId);
    try { await updateDoc(doc(db, 'batches', batchId), { items: updatedItems }); showToast("Producto eliminado", 'success'); } catch (e) { showToast("Error al borrar item: " + e.message, 'error'); }
  };

  const handleAddSale = async () => {
    if (!newSale.batchId) return showToast("Debes seleccionar una Carpeta primero.", 'error');
    if (!newSale.itemId) return showToast("Debes seleccionar un Producto.", 'error');
    if (!newSale.unitPrice) return showToast("Debes ingresar el Precio de Venta.", 'error');
    
    const batch = batches.find(b => b.id === newSale.batchId);
    if (!batch) return showToast("Carpeta no encontrada", 'error');
    const itemIndex = batch.items.findIndex(i => i.id === newSale.itemId);
    if (itemIndex === -1) return showToast("Producto no encontrado", 'error');
    const item = batch.items[itemIndex];

    if (item.currentStock <= 0) return showToast(`SIN STOCK: ${item.product} agotado.`, 'error');
    const qty = parseInt(newSale.quantity) || 1;
    if (qty < 1) return showToast("La cantidad debe ser al menos 1.", 'error');
    if (item.currentStock < qty) return showToast(`Stock insuficiente. Quedan ${item.currentStock} u.`, 'error');

    const enteredPrice = parseFloat(newSale.unitPrice) || 0;
    const shippingProfit = parseFloat(newSale.shippingPrice || 0) - parseFloat(newSale.shippingCost || 0);
    const totalCashIn = (enteredPrice * qty) + shippingProfit;

    const [year, month, day] = newSale.saleDate.split('-').map(Number);
    const saleDateObj = new Date(year, month - 1, day, new Date().getHours(), new Date().getMinutes());

    const saleData = {
      date: saleDateObj.toISOString(), batchId: batch.id, batchName: batch.name, itemId: item.id,
      productName: item.product, variant: item.variant, quantity: qty, unitPrice: enteredPrice, totalSaleRaw: totalCashIn,
      costArsAtSale: item.costArs, shippingCostArs: parseFloat(newSale.shippingCost || 0),
      source: newSale.source, isReseller: newSale.isReseller === 'Si'
    };

    try {
      await addDoc(collection(db, 'sales'), saleData);
      const newItems = [...batch.items];
      newItems[itemIndex] = { ...item, currentStock: item.currentStock - qty };
      const updates = { items: newItems };
      const allZero = newItems.every(i => i.currentStock === 0);
      if (allZero && !batch.finalizedAt) updates.finalizedAt = new Date().toISOString();

      await updateDoc(doc(db, 'batches', batch.id), updates);
      if (allZero && !batch.finalizedAt) showToast("¡Stock a 0! Lote finalizado automáticamente.", 'success');
      else showToast(`Venta OK. Caja: ${formatMoney(totalCashIn)}`, 'success');
      setNewSale({ ...newSale, quantity: 1, unitPrice: '', shippingCost: 0, shippingPrice: 0 });
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const handleDeleteSale = async (sale) => {
    if (!sale || !sale.id) return;
    if (!window.confirm(`¿Eliminar venta de ${sale.productName}? El stock se devolverá.`)) return;
    try {
      await deleteDoc(doc(db, 'sales', sale.id));
      if (sale.batchId && sale.itemId) {
        const batch = batches.find(b => b.id === sale.batchId);
        if (batch) {
          const itemIndex = batch.items.findIndex(i => i.id === sale.itemId);
          if (itemIndex !== -1) {
            const newItems = [...batch.items];
            newItems[itemIndex].currentStock += sale.quantity;
            await updateDoc(doc(db, 'batches', batch.id), { items: newItems });
          }
        }
      }
      showToast("Venta eliminada y stock devuelto", 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const handleAddExpense = async () => {
    if (!newExpense.description || !newExpense.amount) return showToast('Falta descripción o monto', 'error');
    let batchName = 'General';
    if (newExpense.batchId) {
        const foundBatch = batches.find(b => b.id === newExpense.batchId);
        if (foundBatch) batchName = foundBatch.name;
    }
    await addDoc(collection(db, 'expenses'), { 
        date: new Date().toISOString(), description: newExpense.description, amount: parseFloat(newExpense.amount),
        batchId: newExpense.batchId || null, batchName: batchName
    });
    setNewExpense({ description: '', amount: '', batchId: '' });
    showToast('Gasto registrado', 'success');
  };
  const handleDeleteExpense = async (id) => {
      await deleteDoc(doc(db, 'expenses', id));
      showToast('Gasto eliminado', 'success');
  }

  const batchAnalysis = useMemo(() => {
    if (!selectedBatchStats) return null;
    const batch = batches.find(b => b.id === selectedBatchStats);
    if (!batch) return null;

    const batchSales = sales.filter(s => s.batchId === batch.id);
    const batchExpenses = expenses.filter(e => e.batchId === batch.id);
    let totalRevenue = 0, itemsSold = 0, totalShippingProfit = 0;
    const sourceCounts = {}, typeCounts = { Revendedor: 0, Final: 0 };

    batchSales.forEach(s => {
      totalRevenue += s.totalSaleRaw;
      itemsSold += s.quantity;
      const saleShippingProfit = s.totalSaleRaw - (s.unitPrice * s.quantity);
      totalShippingProfit += saleShippingProfit;
      const src = s.source || 'Otro';
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
      if (s.isReseller === 'Si' || s.isReseller === true) typeCounts.Revendedor++; else typeCounts.Final++;
    });

    const totalInvestment = (batch.items || []).reduce((acc, i) => acc + (i.costArs * i.initialStock), 0);
    const costOfSold = batchSales.reduce((acc, s) => acc + (s.costArsAtSale * s.quantity), 0);
    const grossProfit = totalRevenue - costOfSold; 
    const totalBatchExpenses = batchExpenses.reduce((acc, e) => acc + e.amount, 0);
    const netProfit = grossProfit - totalBatchExpenses;
    const cashBalance = totalRevenue - totalInvestment - totalBatchExpenses;
    const currentStockValue = totalInvestment - costOfSold;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    const createdDate = new Date(batch.createdAt);
    const endDate = batch.finalizedAt ? new Date(batch.finalizedAt) : new Date(); 
    const diffTime = Math.max(0, endDate - createdDate);
    const daysActive = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const dailyAvgItems = itemsSold / daysActive;
    const totalInitStock = (batch.items || []).reduce((acc, i) => acc + i.initialStock, 0);
    const progress = totalInitStock > 0 ? (itemsSold / totalInitStock) * 100 : 0;

    const uniqueDateStrs = [...new Set(batchSales.map(s => {
        const d = new Date(s.date);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }))].sort((a, b) => b.localeCompare(a));

    let currentStreak = 0;
    if (uniqueDateStrs.length > 0) {
        const todayStr = getTodayDate();
        const yesterdayStr = getPreviousDayStr(todayStr);
        let checkDate = '';
        if (uniqueDateStrs[0] === todayStr) { currentStreak = 1; checkDate = todayStr; } 
        else if (uniqueDateStrs[0] === yesterdayStr) { currentStreak = 1; checkDate = yesterdayStr; }

        if (currentStreak === 1) {
            for (let i = 1; i < uniqueDateStrs.length; i++) {
                const expectedStr = getPreviousDayStr(checkDate);
                if (uniqueDateStrs[i] === expectedStr) { currentStreak++; checkDate = expectedStr; } 
                else break;
            }
        }
    }

    return { 
        batch, salesCount: batchSales.length, itemsSold, totalRevenue, totalInvestment, 
        grossProfit, grossMargin, totalShippingProfit, totalBatchExpenses, netProfit, netMargin, cashBalance, 
        progress, currentStockValue, sourceCounts, typeCounts, daysActive, dailyAvgItems, currentStreak 
    };
  }, [selectedBatchStats, sales, batches, expenses]);

  const handleLogin = (e) => { 
    e.preventDefault(); 
    const val = e.target.password.value; 
    if(val === '1717') { localStorage.setItem('028_user', 'Admin'); setUser('Admin'); showToast('Bienvenido a 028 IMPORT', 'success'); } 
    else alert('Contraseña incorrecta');
  };

  if (!user) return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-colors ${darkMode ? 'bg-slate-950' : 'bg-slate-900'}`}>
      <div className={`p-6 rounded-2xl shadow-xl w-full max-w-sm text-center border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="bg-emerald-500 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"><Package size={24} className="text-slate-900" /></div>
        <h1 className={`text-xl font-black mb-1 ${darkMode ? 'text-white' : 'text-slate-800'}`}>028 IMPORT</h1>
        <p className="text-slate-400 mb-6 text-xs">Sistema de Gestión Cloud</p>
        <form onSubmit={handleLogin} className="space-y-3">
          <input type="password" name="password" placeholder="Contraseña de Acceso" className={`w-full border p-2 rounded-lg text-center font-bold text-sm outline-none focus:ring-2 ring-emerald-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}`} autoFocus />
          <button className="w-full bg-slate-900 text-white py-2 rounded-lg font-bold hover:bg-slate-800 transition text-sm">Ingresar</button>
        </form>
      </div>
    </div>
  );

  if (configError) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-white">
      <div className="max-w-lg text-center space-y-4">
        <AlertTriangle size={64} className="mx-auto text-yellow-500" />
        <h1 className="text-3xl font-bold">Falta Configuración</h1>
        <p className="text-slate-300">Debes poner las claves de Firebase en el código.</p>
        <button onClick={() => window.location.reload()} className="bg-emerald-500 text-slate-900 px-6 py-2 rounded-lg font-bold hover:bg-emerald-400">Recargar</button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen p-2 md:p-4 font-sans transition-colors duration-300 text-sm pb-24 ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-100 text-slate-800'}`}>
      
      {/* COMPONENTE TOAST DE NOTIFICACIONES */}
      {toast && (
          <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 z-50 transition-colors ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
             {toast.type === 'error' ? <XCircle size={18} /> : <CheckCircle size={18} />}
             <span className="font-bold text-xs">{toast.message}</span>
          </div>
      )}

      {/* LISTA INVISIBLE DE AUTOCOMPLETADO (DATALIST HTML5) */}
      <datalist id="products-list">
          {uniqueProducts.map(p => <option key={p} value={p} />)}
      </datalist>
      <datalist id="variants-list">
          {uniqueVariants.map(v => <option key={v} value={v} />)}
      </datalist>

      <div className="max-w-6xl mx-auto space-y-4">
        <header className={`p-4 rounded-xl shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4 transition-colors duration-300 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-slate-900 text-white'}`}>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="bg-blue-600 p-2 rounded-lg text-white"><FolderOpen size={20} strokeWidth={2.5} /></div>
            <div>
                <h1 className="text-xl font-black tracking-tight leading-none">028 IMPORT</h1>
                <div className="flex items-center gap-2">
                    <p className={`text-[10px] font-medium opacity-60`}>Gestión por Lotes | {user}</p>
                    {isOffline && (
                        <span className="flex items-center gap-1 text-[9px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full font-bold">
                            <WifiOff size={10}/> Modo Offline
                        </span>
                    )}
                </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-lg transition ${darkMode ? 'bg-slate-700 text-yellow-400' : 'bg-slate-800 text-slate-300'}`}>{darkMode ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button onClick={() => { localStorage.removeItem('028_user'); setUser(null); }} className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition"><LogOut size={16} /></button>
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
            {[
                { id: 'home', icon: Home, label: 'Inicio' }, 
                { id: 'batches', icon: FolderOpen, label: 'Lotes' }, 
                { id: 'sales', icon: ShoppingCart, label: 'Ventas' }, 
                { id: 'analysis', icon: Activity, label: 'Análisis' }, 
                { id: 'expenses', icon: Wallet, label: 'Gastos' }
            ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === tab.id ? (darkMode ? 'bg-blue-600 text-white' : 'bg-slate-800 text-white') : (darkMode ? 'bg-slate-800 text-slate-400' : 'bg-white text-slate-500')}`}><tab.icon size={14} /> {tab.label}</button>
            ))}
        </div>

        {/* --- PESTAÑA INICIO (RESUMEN GLOBAL) --- */}
        {activeTab === 'home' && (
             <div className="space-y-4 animate-in fade-in">
                <Card darkMode={darkMode} className="bg-gradient-to-r from-blue-900 to-slate-900 text-white border-none py-3 shadow-md">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h2 className="text-lg font-bold mb-0.5 flex items-center gap-2"><Activity size={18} className="text-emerald-400"/> Panel Global y Mensual</h2>
                            <p className="opacity-70 text-xs">Analizando {globalMonth === 'all' ? 'todo el historial de tu negocio' : 'el mes seleccionado'}.</p>
                        </div>
                        
                        <div className="relative w-full md:w-auto md:min-w-[220px] group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Calendar size={14} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                            </div>
                            <select 
                                className="w-full appearance-none rounded-lg py-2 pl-9 pr-10 text-sm font-bold outline-none cursor-pointer transition-all duration-300 bg-white/10 text-white border border-white/20 hover:bg-white/20 focus:ring-2 focus:ring-emerald-400 focus:border-transparent shadow-inner backdrop-blur-sm"
                                value={globalMonth} 
                                onChange={e => setGlobalMonth(e.target.value)}
                            >
                                {monthOptions.map(opt => (
                                    <option key={opt.value} value={opt.value} className="bg-slate-800 text-white font-medium">
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                <ChevronDown size={16} className="text-white/60 group-hover:text-white transition-colors" />
                            </div>
                        </div>
                    </div>
                </Card>

                <Card darkMode={darkMode} className="col-span-full">
                    <h3 className="font-bold mb-4 flex items-center gap-2 text-xs uppercase opacity-60"><TrendingUp size={14} className="text-blue-500"/> Gráfico de Rendimiento</h3>
                    <SalesChart sales={globalAnalysis.filteredSales} globalMonth={globalMonth} darkMode={darkMode} />
                </Card>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <Card darkMode={darkMode}>
                          <div className="text-[10px] font-bold uppercase opacity-50 flex justify-between">
                              Ventas {globalMonth === 'all' ? 'Totales' : 'del Mes'}
                              {globalAnalysis.prevRevenue !== null && globalAnalysis.prevRevenue > 0 && (
                                  <span className={`text-[9px] px-1 rounded ${globalAnalysis.totalRevenue >= globalAnalysis.prevRevenue ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                                      {globalAnalysis.totalRevenue >= globalAnalysis.prevRevenue ? '↑' : '↓'} {Math.abs(((globalAnalysis.totalRevenue - globalAnalysis.prevRevenue)/globalAnalysis.prevRevenue)*100).toFixed(0)}% vs Mes Ant.
                                  </span>
                              )}
                          </div>
                          <div className="text-xl font-bold text-blue-500">{formatMoney(globalAnalysis.totalRevenue)}</div>
                      </Card>
                      
                      <Card className={`border-t-2 ${globalAnalysis.grossProfit > 0 ? 'border-t-emerald-500' : 'border-t-orange-500'}`} darkMode={darkMode}>
                          <div className="text-[10px] font-bold uppercase opacity-50 flex justify-between">
                              Ganancia Bruta
                              <span className="text-xs bg-slate-500/10 px-1 rounded">{formatPercent(globalAnalysis.grossMargin)}</span>
                          </div>
                          <div className={`text-xl font-bold ${globalAnalysis.grossProfit > 0 ? 'text-emerald-500' : 'text-orange-500'}`}>{formatMoney(globalAnalysis.grossProfit)}</div>
                      </Card>

                      <Card darkMode={darkMode}>
                          <div className="text-[10px] font-bold uppercase opacity-50">Gastos {globalMonth === 'all' ? 'Totales' : 'del Mes'}</div>
                          <div className="text-xl font-bold text-red-500">{formatMoney(globalAnalysis.totalGlobalExpenses)}</div>
                      </Card>
                      
                      <Card className={`border-t-2 ${globalAnalysis.netProfit > 0 ? 'border-t-emerald-600' : 'border-t-red-500'}`} darkMode={darkMode}>
                          <div className="text-[10px] font-bold uppercase opacity-50 flex justify-between items-center flex-wrap gap-1">
                              Ganancia Neta {globalMonth === 'all' ? '(Total)' : '(Mes)'}
                              <div className="flex gap-1">
                                  {globalAnalysis.prevNetProfit !== null && globalAnalysis.prevNetProfit > 0 && (
                                      <span className={`text-[9px] px-1 rounded ${globalAnalysis.netProfit >= globalAnalysis.prevNetProfit ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                                          {globalAnalysis.netProfit >= globalAnalysis.prevNetProfit ? '↑' : '↓'} {Math.abs(((globalAnalysis.netProfit - globalAnalysis.prevNetProfit)/globalAnalysis.prevNetProfit)*100).toFixed(0)}%
                                      </span>
                                  )}
                                  <span className={`text-[10px] px-1 rounded font-bold ${globalAnalysis.netProfit > 0 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>{formatPercent(globalAnalysis.netMargin)}</span>
                              </div>
                          </div>
                          <div className={`text-2xl font-black ${globalAnalysis.netProfit > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatMoney(globalAnalysis.netProfit)}</div>
                          <div className="text-[9px] opacity-60">Dinero generado libre</div>
                      </Card>

                      <Card darkMode={darkMode}>
                          <div className="text-[10px] font-bold uppercase opacity-50">Inversión {globalMonth === 'all' ? 'Total' : 'del Mes'}</div>
                          <div className="text-xl font-bold text-red-500">{formatMoney(globalAnalysis.totalInvestment)}</div>
                          <div className="text-[9px] opacity-50">En compras realizadas</div>
                      </Card>

                       <Card darkMode={darkMode} className="border-l-2 border-l-blue-500 relative overflow-hidden">
                          <div className="text-[10px] font-bold uppercase opacity-50 flex items-center gap-1"><Package size={10}/> Valor Stock Actual</div>
                          <div className="text-xl font-bold text-blue-500">{formatMoney(globalAnalysis.currentStockValue)}</div>
                          <div className="text-[9px] opacity-50 text-blue-400">Global (No se filtra)</div>
                      </Card>

                      <Card darkMode={darkMode} className={`border-l-4 ${globalAnalysis.cashBalance >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
                          <div className="text-[10px] font-bold uppercase opacity-50 flex items-center gap-1"><Wallet size={10}/> Saldo Caja {globalMonth === 'all' ? '(Bolsillo)' : '(Mensual)'}</div>
                          <div className={`text-xl font-black ${globalAnalysis.cashBalance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatMoney(globalAnalysis.cashBalance)}</div>
                          <div className="text-[9px] opacity-50">Flujo de efectivo real</div>
                      </Card>

                      <Card darkMode={darkMode}>
                          <div className="text-[10px] font-bold uppercase opacity-50 flex justify-between">Promedio Ventas</div>
                          <div className="text-xl font-black text-purple-500">{globalAnalysis.dailyAvgItems.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">u/día</span></div>
                          <div className="flex justify-between items-center mt-0.5">
                              <div className="text-[9px] opacity-50 flex items-center gap-1"><Clock size={10}/> {globalAnalysis.daysActive} días</div>
                              {globalAnalysis.currentStreak > 0 && (
                                  <div className="text-[10px] font-bold text-orange-500 flex items-center gap-0.5" title="Racha actual de ventas">
                                      <Flame size={12}/> {globalAnalysis.currentStreak} días
                                  </div>
                              )}
                          </div>
                      </Card>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-in slide-in-from-bottom-8">
                    <Card darkMode={darkMode}>
                      <h3 className="font-bold mb-3 flex items-center gap-2 text-xs"><Users size={14}/> Ventas por Origen</h3>
                      <div className="space-y-2">
                        {Object.entries(globalAnalysis.sourceCounts).map(([source, count]) => (
                          <div key={source} className="flex items-center justify-between">
                            <span className="text-xs opacity-80">{source}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{width: `${(count/globalAnalysis.salesCount)*100}%`}}></div></div>
                              <span className="font-bold text-xs w-6 text-right">{count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Card darkMode={darkMode}>
                      <h3 className="font-bold mb-3 flex items-center gap-2 text-xs"><BarChart3 size={14}/> Tipo Cliente</h3>
                      <div className="flex gap-4 items-center justify-center h-24">
                        <div className="text-center w-1/2">
                          <div className="text-2xl font-bold text-emerald-500">{globalAnalysis.typeCounts.Final}</div>
                          <div className="text-[10px] opacity-60 uppercase mt-0.5">Consumidor Final</div>
                        </div>
                        <div className="h-8 w-[1px] bg-slate-300"></div>
                        <div className="text-center w-1/2">
                          <div className="text-2xl font-bold text-purple-500">{globalAnalysis.typeCounts.Revendedor}</div>
                          <div className="text-[10px] opacity-60 uppercase mt-0.5">Revendedor</div>
                        </div>
                      </div>
                    </Card>
                  </div>
             </div>
        )}

        {activeTab === 'batches' && (
          <div className="space-y-4 animate-in fade-in">
            <Card className={darkMode ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-slate-800'} darkMode={darkMode}>
              <div className="flex justify-between items-center mb-2">
                  <h2 className="text-sm font-bold flex items-center gap-2"><Plus size={16} className="text-blue-500" /> Crear Nueva Carpeta / Lote</h2>
                  <button onClick={handleExportBatches} className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`} title="Exportar a Excel">
                      <Download size={12}/> CSV
                  </button>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1"><Input darkMode={darkMode} label="Nombre del Lote" placeholder="Ej: Pedido Noviembre 2024" value={newBatchName} onChange={e => setNewBatchName(e.target.value)} /></div>
                <div className="w-32"><Button darkMode={darkMode} onClick={handleCreateBatch} className="w-full h-[38px]">Crear</Button></div>
              </div>
            </Card>
            <div className="space-y-2">
              {batches.map((b) => (
                <div key={b.id} className={`rounded-lg border overflow-hidden transition-all ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className={`p-3 flex justify-between items-center cursor-pointer ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-50'}`} onClick={() => setExpandedBatchId(expandedBatchId === b.id ? null : b.id)}>
                    <div className="flex items-center gap-3">
                        <FolderOpen className={b.finalizedAt ? "text-emerald-500" : "text-blue-500"} size={20} />
                        <div>
                            <h3 className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-slate-800'}`}>{b.name}</h3>
                            <p className="text-[10px] opacity-50">
                                {(b.items || []).length} Items • {b.finalizedAt ? 'FINALIZADO' : 'Activo'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">{expandedBatchId === b.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</div>
                  </div>
                  {expandedBatchId === b.id && (
                    <div className={`p-3 border-t ${darkMode ? 'border-slate-700 bg-slate-900/50' : 'border-slate-100 bg-slate-50'}`}>
                      <div className="mb-4 p-3 rounded-lg border border-dashed border-slate-400/50">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
                          <div className="col-span-2 md:col-span-2"><Input darkMode={darkMode} list="products-list" label="Producto" placeholder="Ej: ElfBar" value={newItem.product} onChange={e => setNewItem({...newItem, product: e.target.value})} /></div>
                          <div className="col-span-1"><Input darkMode={darkMode} list="variants-list" label="Variante" placeholder="Ej: Mint" value={newItem.variant} onChange={e => setNewItem({...newItem, variant: e.target.value})} /></div>
                          <div className="col-span-1"><Input darkMode={darkMode} label="Costo ($)" type="number" value={newItem.costArs} onChange={e => setNewItem({...newItem, costArs: e.target.value})} /></div>
                          <div className="col-span-1"><Input darkMode={darkMode} label="Cant." type="number" value={newItem.initialStock} onChange={e => setNewItem({...newItem, initialStock: e.target.value})} /></div>
                          <div className="col-span-1 md:col-span-5"><Button darkMode={darkMode} onClick={() => handleAddItemToBatch(b.id)} className="w-full text-[10px] h-8">Agregar Item</Button></div>
                        </div>
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead className={`uppercase opacity-50 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}><tr><th className="pb-1">Prod.</th><th className="pb-1">Costo</th><th className="pb-1">Stock</th><th className="pb-1 text-right"></th></tr></thead>
                        <tbody className="divide-y divide-slate-700/20">
                          {(b.items || []).map((item, idx) => (
                            <tr key={idx} className="hover:opacity-80">
                              <td className="py-2 font-medium">{item.product} <span className="opacity-60 text-[10px] ml-1">{item.variant}</span></td>
                              <td className="py-2 font-mono">{formatMoney(item.costArs)}</td>
                              <td className="py-2"><span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${item.currentStock === 0 ? 'bg-red-500/20 text-red-500' : 'bg-emerald-500/20 text-emerald-500'}`}>{item.currentStock}/{item.initialStock}</span></td>
                              <td className="py-2 text-right"><button onClick={() => handleDeleteItemFromBatch(b.id, item.id)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 size={12} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      
                      <div className="flex justify-end items-center mt-3 pt-2 border-t border-slate-700/20">
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteBatch(b.id); }} className="text-[10px] text-red-500 hover:underline flex items-center gap-1"><Trash2 size={10}/> Eliminar Carpeta</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'sales' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-in fade-in">
            <Card className="lg:col-span-1 border-t-4 border-t-emerald-500 h-fit" darkMode={darkMode}>
                <h2 className="text-sm font-bold mb-3">Registrar Venta</h2>
                <div className="space-y-3">
                  <div className="bg-amber-50/50 p-1.5 rounded border border-amber-100/20"><Input darkMode={darkMode} label="Fecha Venta" type="date" value={newSale.saleDate} onChange={e => setNewSale({...newSale, saleDate: e.target.value})} /></div>
                  <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                            <label className={`text-[10px] font-bold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>1. Carpeta</label>
                            <select className={`border rounded-md p-2 w-full text-sm outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`} value={newSale.batchId} onChange={e => setNewSale({...newSale, batchId: e.target.value, itemId: ''})}>
                                <option value="">-- Seleccionar --</option>{batches.map(b => <option key={b.id} value={b.id}>{b.name} {b.finalizedAt ? '(Fin)' : ''}</option>)}
                            </select>
                        </div>
                        {newSale.batchId && (
                            <div className="col-span-2 animate-in fade-in">
                            <label className={`text-[10px] font-bold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>2. Producto</label>
                            <select className={`border rounded-md p-2 w-full text-sm outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`} value={newSale.itemId} onChange={e => setNewSale({...newSale, itemId: e.target.value})}>
                                <option value="">-- Seleccionar --</option>
                                {batches.find(b => b.id === newSale.batchId)?.items?.map(item => (<option key={item.id} value={item.id} disabled={item.currentStock <= 0}>{item.product} {item.variant} ({item.currentStock})</option>))}
                            </select>
                            </div>
                        )}
                        <Input darkMode={darkMode} label="Cantidad" type="number" value={newSale.quantity} onChange={e => setNewSale({...newSale, quantity: e.target.value})} />
                        <Input darkMode={darkMode} label="Precio ($)" type="number" value={newSale.unitPrice} onChange={e => setNewSale({...newSale, unitPrice: e.target.value})} />
                  </div>
                  
                  <div className={`p-2 rounded-md border grid grid-cols-2 gap-2 ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-blue-50 border-blue-100'}`}>
                      <Input darkMode={darkMode} label="Costo Envío" type="number" value={newSale.shippingCost} onChange={e => setNewSale({...newSale, shippingCost: e.target.value})} />
                      <Input darkMode={darkMode} label="Cobro Envío" type="number" value={newSale.shippingPrice} onChange={e => setNewSale({...newSale, shippingPrice: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                      <Select darkMode={darkMode} label="Origen" value={newSale.source} onChange={e => setNewSale({...newSale, source: e.target.value})} options={[{value:'Instagram', label:'Instagram'}, {value:'Whatsapp', label:'Whatsapp'}, {value:'Personal', label:'Personal'}, {value:'Web', label:'Web'}]} />
                      <Select darkMode={darkMode} label="Tipo" value={newSale.isReseller} onChange={e => setNewSale({...newSale, isReseller: e.target.value})} options={[{value:'No', label:'Consumidor Final'}, {value:'Si', label:'Revendedor'}]} />
                  </div>
                  <Button darkMode={darkMode} onClick={handleAddSale} variant="success" className="w-full py-2">Confirmar Venta</Button>
                </div>
            </Card>
            <div className="lg:col-span-2 space-y-4">
              <div className={`rounded-xl shadow-sm overflow-hidden border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className={`p-3 font-bold text-xs border-b flex justify-between items-center ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                    Últimas Ventas
                    <button onClick={handleExportSales} className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded transition-colors ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`} title="Exportar a Excel">
                      <Download size={12}/> CSV
                    </button>
                </div>
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left text-xs">
                      <thead className={darkMode ? 'bg-slate-900 text-slate-500' : 'bg-slate-50 text-slate-400'}><tr><th className="p-2">Fecha</th><th className="p-2">Detalle</th><th className="p-2 text-emerald-500">Gan.</th><th className="p-2">Total ($)</th><th className="p-2"></th></tr></thead>
                      <tbody className={`divide-y ${darkMode ? 'divide-slate-700 text-slate-300' : 'divide-slate-100'}`}>
                        {sales.map(s => {
                          const itemProfit = s.totalSaleRaw - ((s.costArsAtSale || 0) * s.quantity);
                          return (
                            <tr key={s.id} className="hover:opacity-80">
                              <td className="p-2 opacity-70 whitespace-nowrap">{new Date(s.date).toLocaleDateString(undefined, {month:'numeric', day:'numeric'})}</td>
                              <td className="p-2"><div className="font-bold">{s.quantity}x {s.productName} {s.variant}</div><div className="text-[9px] opacity-50">{s.batchName}</div></td>
                              <td className="p-2 font-bold text-emerald-500">{formatMoney(itemProfit)}</td>
                              <td className="p-2 font-bold font-mono">{formatMoney(s.totalSaleRaw)}</td>
                              <td className="p-2 text-right"><button onClick={() => handleDeleteSale(s)} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button></td>
                            </tr>
                          )
                        })}
                      </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- 3. ANÁLISIS DE LOTE --- */}
        {activeTab === 'analysis' && (
          <div className="space-y-4 animate-in fade-in">
            <Card darkMode={darkMode} className="py-3">
                <div className="flex gap-4 items-center">
                    <h2 className="text-sm font-bold whitespace-nowrap flex items-center gap-2"><FolderOpen size={16} className="text-blue-500"/> Analizar Lote:</h2>
                    <select
                        className={`border rounded-md p-1.5 w-full outline-none text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`}
                        onChange={(e) => setSelectedBatchStats(e.target.value)}
                        value={selectedBatchStats || ''}
                    >
                        <option value="">-- Seleccionar --</option>
                        {batches.map(b => <option key={b.id} value={b.id}>{b.name} {b.finalizedAt ? '✅' : ''}</option>)}
                    </select>
                </div>
            </Card>

            {batchAnalysis && (
                <div className="space-y-4 animate-in slide-in-from-bottom-4">
                   <Card darkMode={darkMode} className={`py-3 ${batchAnalysis.batch.finalizedAt ? (darkMode ? 'bg-emerald-900/10 border-emerald-800' : 'bg-emerald-50 border-emerald-200') : ''}`}>
                      <div className="flex justify-between items-center">
                          <div>
                            <h3 className="font-bold text-xs flex items-center gap-1.5">
                                <Settings size={14}/> Estado: <span className={batchAnalysis.batch.finalizedAt ? "text-emerald-500" : "text-blue-500"}>{batchAnalysis.batch.finalizedAt ? "FINALIZADO" : "ACTIVO"}</span>
                            </h3>
                            {batchAnalysis.batch.finalizedAt && <div className="text-[10px] opacity-60 mt-0.5">Finalizó el {new Date(batchAnalysis.batch.finalizedAt).toLocaleDateString()}</div>}
                          </div>

                          {batchAnalysis.batch.finalizedAt ? (
                              <Button darkMode={darkMode} onClick={() => handleUpdateBatchStatus(batchAnalysis.batch.id, false)} variant="outline" className="h-8 text-[10px]">🔄 Reactivar</Button>
                          ) : (
                              <div className="flex gap-2 items-center">
                                  <div className="w-32"><Input darkMode={darkMode} type="date" value={manualFinalizeDate} onChange={e => setManualFinalizeDate(e.target.value)} /></div>
                                  <Button darkMode={darkMode} onClick={() => handleUpdateBatchStatus(batchAnalysis.batch.id, true)} className="h-[34px] text-[10px]">🏁 Finalizar</Button>
                              </div>
                          )}
                      </div>
                   </Card>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <Card darkMode={darkMode}><div className="text-[10px] font-bold uppercase opacity-50">Inversión</div><div className="text-xl font-bold text-red-500">{formatMoney(batchAnalysis.totalInvestment)}</div></Card>
                      <Card darkMode={darkMode}><div className="text-[10px] font-bold uppercase opacity-50">Ventas</div><div className="text-xl font-bold text-blue-500">{formatMoney(batchAnalysis.totalRevenue)}</div></Card>
                      
                      <Card darkMode={darkMode}>
                          <div className="text-[10px] font-bold uppercase opacity-50">Gastos Lote</div>
                          <div className="text-xl font-bold text-red-500">{formatMoney(batchAnalysis.totalBatchExpenses)}</div>
                      </Card>

                      <Card darkMode={darkMode} className={`border-l-4 ${batchAnalysis.cashBalance >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
                          <div className="text-[10px] font-bold uppercase opacity-50 flex items-center gap-1"><Wallet size={10}/> Saldo Caja (Bolsillo)</div>
                          <div className={`text-xl font-black ${batchAnalysis.cashBalance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatMoney(batchAnalysis.cashBalance)}</div>
                          <div className="text-[9px] opacity-50">Cashflow Real</div>
                      </Card>

                      <Card darkMode={darkMode} className="border-l-2 border-l-blue-500">
                          <div className="text-[10px] font-bold uppercase opacity-50 flex items-center gap-1"><Package size={10}/> Stock Actual</div>
                          <div className="text-xl font-bold text-blue-500">{formatMoney(batchAnalysis.currentStockValue)}</div>
                      </Card>

                      <Card className={`border-t-2 ${batchAnalysis.grossProfit > 0 ? 'border-t-emerald-500' : 'border-t-orange-500'}`} darkMode={darkMode}>
                          <div className="text-[10px] font-bold uppercase opacity-50 flex justify-between">
                              Ganancia Bruta
                              <span className="text-xs bg-slate-500/10 px-1 rounded">{formatPercent(batchAnalysis.grossMargin)}</span>
                          </div>
                          <div className={`text-2xl font-black ${batchAnalysis.grossProfit > 0 ? 'text-emerald-500' : 'text-orange-500'}`}>{formatMoney(batchAnalysis.grossProfit)}</div>
                      </Card>

                        <Card darkMode={darkMode} className={batchAnalysis.totalShippingProfit >= 0 ? "border-t-2 border-t-emerald-500/50" : "border-t-2 border-t-red-500/50"}>
                          <div className="text-[10px] font-bold uppercase opacity-50 flex items-center gap-1"><Truck size={10}/> Dif. Envíos</div>
                          <div className={`text-xl font-bold ${batchAnalysis.totalShippingProfit >= 0 ? 'text-emerald-500' : 'text-orange-500'}`}>{formatMoney(batchAnalysis.totalShippingProfit)}</div>
                      </Card>
                      
                      <Card className={`border-t-2 ${batchAnalysis.netProfit > 0 ? 'border-t-emerald-600' : 'border-t-red-500'}`} darkMode={darkMode}>
                          <div className="text-[10px] font-bold uppercase opacity-50 flex justify-between items-center">
                              Rentabilidad (Contable)
                              <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${batchAnalysis.netProfit > 0 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>{formatPercent(batchAnalysis.netMargin)}</span>
                          </div>
                          <div className={`text-2xl font-black ${batchAnalysis.netProfit > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatMoney(batchAnalysis.netProfit)}</div>
                          <div className="text-[10px] opacity-60">Ganancia s/Ventas</div>
                      </Card>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-in slide-in-from-bottom-8">
                    <Card darkMode={darkMode}>
                      <h3 className="font-bold mb-3 flex items-center gap-2 text-xs"><Users size={14}/> Origen Ventas</h3>
                      <div className="space-y-2">
                        {Object.entries(batchAnalysis.sourceCounts).map(([source, count]) => (
                          <div key={source} className="flex items-center justify-between">
                            <span className="text-xs opacity-80">{source}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{width: `${(count/batchAnalysis.salesCount)*100}%`}}></div></div>
                              <span className="font-bold text-xs w-6 text-right">{count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Card darkMode={darkMode}>
                      <h3 className="font-bold mb-3 flex items-center gap-2 text-xs"><BarChart3 size={14}/> Tipo Cliente</h3>
                      <div className="flex gap-4 items-center justify-center h-24">
                        <div className="text-center w-1/2">
                          <div className="text-2xl font-bold text-emerald-500">{batchAnalysis.typeCounts.Final}</div>
                          <div className="text-[10px] opacity-60 uppercase mt-0.5">Consumidor Final</div>
                        </div>
                        <div className="h-8 w-[1px] bg-slate-300"></div>
                        <div className="text-center w-1/2">
                          <div className="text-2xl font-bold text-purple-500">{batchAnalysis.typeCounts.Revendedor}</div>
                          <div className="text-[10px] opacity-60 uppercase mt-0.5">Revendedor</div>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
            )}
            {!selectedBatchStats && <div className="text-center opacity-30 py-10 text-xs">Selecciona un lote arriba para ver detalles.</div>}
          </div>
        )}

        {/* GASTOS */}
        {activeTab === 'expenses' && (
            <div className="max-w-2xl mx-auto space-y-4 animate-in fade-in">
            <Card darkMode={darkMode}>
                <h2 className="text-sm font-bold mb-3">Registrar Gasto</h2>
                <div className="flex flex-col gap-2">
                    <div className="flex gap-2 items-end">
                        <div className="flex-1"><Input darkMode={darkMode} label="Descripción" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} /></div>
                        <div className="w-24"><Input darkMode={darkMode} label="Monto" type="number" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} /></div>
                    </div>
                    <div className="flex gap-2 items-end">
                          <div className="flex-1">
                             <Select 
                                darkMode={darkMode} 
                                label="Asignar a Lote (Opcional)"
                                value={newExpense.batchId} 
                                onChange={e => setNewExpense({...newExpense, batchId: e.target.value})}
                                options={[
                                    { value: '', label: '-- General --' },
                                    ...batches.map(b => ({ value: b.id, label: b.name }))
                                ]}
                             />
                          </div>
                          <Button darkMode={darkMode} onClick={handleAddExpense} variant="danger" className="w-24 h-[38px]">Restar</Button>
                    </div>
                </div>
            </Card>
            <div className={`rounded-lg shadow-sm border overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-100'}`}>
                {expenses.map(e => (
                <div key={e.id} className={`flex justify-between items-center p-3 border-b ${darkMode ? 'border-slate-700 hover:bg-slate-700' : 'border-slate-100 hover:bg-slate-50'}`}>
                    <div>
                        <div className="font-medium text-xs">{e.description}</div>
                        <div className="text-[10px] opacity-50 flex gap-2">
                            <span>{new Date(e.date).toLocaleDateString()}</span>
                            {e.batchName && <span className="bg-slate-500/20 px-1 rounded uppercase font-bold tracking-wider">{e.batchName}</span>}
                        </div>
                    </div>
                    <div className="flex items-center gap-3 font-bold text-red-500 text-xs">-{formatMoney(e.amount)} <button onClick={()=>handleDeleteExpense(e.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={12}/></button></div>
                </div>
                ))}
            </div>
            </div>
        )}

      </div>
    </div>
  );
}