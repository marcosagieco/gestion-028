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
  db = initializeFirestore(app, { experimentalForceLongPolling: true });
} catch (error) {
  console.error("Error inicializando Firebase:", error);
}

// --- 3. COMPONENTES UI MODERNOS (DISEÑO SAAS) ---

const Card = ({ children, className = '', darkMode }) => (
  <div className={`rounded-2xl p-5 border transition-all duration-300 shadow-sm ${
    darkMode ? 'bg-[#131824] border-slate-800/80 text-slate-100' : 'bg-white border-slate-200/80 text-slate-800'
  } ${className}`}>
    {children}
  </div>
);

const MetricCard = ({ title, value, subtitle, icon: Icon, color, trend, darkMode }) => {
  const colors = {
    indigo: darkMode ? 'text-indigo-400 bg-indigo-900/30' : 'text-indigo-600 bg-indigo-100',
    emerald: darkMode ? 'text-emerald-400 bg-emerald-900/30' : 'text-emerald-600 bg-emerald-100',
    rose: darkMode ? 'text-rose-400 bg-rose-900/30' : 'text-rose-600 bg-rose-100',
    blue: darkMode ? 'text-blue-400 bg-blue-900/30' : 'text-blue-600 bg-blue-100',
    amber: darkMode ? 'text-amber-400 bg-amber-900/30' : 'text-amber-600 bg-amber-100',
    violet: darkMode ? 'text-violet-400 bg-violet-900/30' : 'text-violet-600 bg-violet-100',
  };
  
  return (
    <Card darkMode={darkMode} className="flex flex-col gap-4 relative overflow-hidden group hover:shadow-md">
       <div className="flex items-center justify-between">
          <span className={`text-[11px] font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{title}</span>
          <div className={`p-2 rounded-xl transition-transform group-hover:scale-110 ${colors[color]}`}>
             <Icon size={18} strokeWidth={2.5} />
          </div>
       </div>
       <div>
          <div className="text-2xl font-black tracking-tight">{value}</div>
          <div className="flex items-center justify-between mt-1.5">
             <span className={`text-[10px] font-medium ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{subtitle}</span>
             {trend}
          </div>
       </div>
    </Card>
  );
};

const Button = ({ onClick, children, variant = 'primary', className = '', disabled = false, darkMode }) => {
  const baseStyle = "px-4 py-2 rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2 text-xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed tracking-wide shadow-sm";
  const variants = {
    primary: darkMode ? "bg-indigo-600 text-white hover:bg-indigo-500 hover:shadow-indigo-500/25" : "bg-slate-900 text-white hover:bg-slate-800 hover:shadow-slate-900/25",
    danger: "bg-rose-500 text-white hover:bg-rose-600",
    success: "bg-emerald-600 text-white hover:bg-emerald-500",
    outline: darkMode ? "border-2 border-slate-700 text-slate-300 bg-transparent hover:border-slate-500" : "border-2 border-slate-200 text-slate-700 bg-transparent hover:border-slate-300"
  };
  return <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`}>{children}</button>;
};

const Input = ({ label, symbol, darkMode, list, ...props }) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</label>}
    <div className="relative">
      {symbol && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className={`text-sm font-bold ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{symbol}</span></div>}
      <input list={list} className={`border-2 rounded-xl p-2.5 w-full text-sm outline-none transition-all duration-200 font-medium ${darkMode ? 'bg-slate-900/50 border-slate-700 text-white focus:border-indigo-500 focus:bg-slate-900' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500 focus:bg-white'} ${symbol ? 'pl-8' : ''}`} {...props} />
    </div>
  </div>
);

const Select = ({ label, options, darkMode, ...props }) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</label>}
    <div className="relative">
      <select className={`appearance-none w-full border-2 rounded-xl p-2.5 pr-8 text-sm outline-none cursor-pointer transition-all duration-200 font-medium ${darkMode ? 'bg-slate-900/50 border-slate-700 text-white focus:border-indigo-500 focus:bg-slate-900' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-indigo-500 focus:bg-white'}`} {...props}>
        {options.map((opt, idx) => <option key={idx} value={opt.value} className={darkMode ? 'bg-slate-800' : ''}>{opt.label}</option>)}
      </select>
      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <ChevronDown size={14} className={darkMode ? "text-slate-400" : "text-slate-500"} />
      </div>
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

// --- COMPONENTE DE GRÁFICO ---
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
        map[key] = { key, label: `${i}`, fullLabel: `${i} de ${monthNames[m - 1]} ${y}`, revenue: 0, quantity: 0 };
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
        map[key] = { key, label: `${day}/${m}`, fullLabel: `${day} de ${monthNames[d.getMonth()]} ${y}`, revenue: 0, quantity: 0 };
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

  if (chartData.length === 0) return <div className="h-40 flex items-center justify-center text-xs opacity-50">No hay ventas registradas en este periodo.</div>;

  const MIN_POINT_DISTANCE = 40;
  const calculatedWidth = Math.max(800, chartData.length * MIN_POINT_DISTANCE);
  
  const w = calculatedWidth;
  const h = 340; 
  const padXLeft = 15; 
  const padXRight = 40;
  const padYTop = 100; // Incrementamos un poco el "techo" interno del gráfico
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
    for (let i = niceStep; i <= niceMax; i += niceStep) ticks.push(i);
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
      if (metric === 'revenue') return val === 0 ? '0' : '$' + formatCompact(val);
      return val.toString();
  };

  const themeColor = metric === 'revenue' ? '#6366f1' : '#14b8a6'; // Indigo vs Teal

  return (
    <div className="w-full flex flex-col space-y-5">
      <div className="flex justify-start">
          <div className={`flex items-center gap-1 p-1 rounded-xl w-fit border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
              <button onClick={() => setMetric('revenue')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${metric === 'revenue' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                  Ingresos ($)
              </button>
              <button onClick={() => setMetric('quantity')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${metric === 'quantity' ? 'bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                  Volumen (u.)
              </button>
          </div>
      </div>

      <div className={`relative flex w-full rounded-2xl overflow-hidden shadow-sm border ${darkMode ? 'bg-[#0f141e] border-slate-800/80' : 'bg-slate-50/50 border-slate-200/80'}`}>
          <div className={`w-[55px] md:w-[65px] flex-shrink-0 relative z-10 border-r ${darkMode ? 'border-slate-800/80 bg-[#131824]' : 'border-slate-200 bg-white shadow-sm'}`}>
              {yTickValues.map(tickVal => {
                  const y = padYTop + chartH - ((tickVal / maxVal) * chartH);
                  return (
                      <div key={tickVal} className="absolute w-full text-right pr-3 pointer-events-none" style={{ top: `${y}px`, transform: 'translateY(-50%)' }}>
                          <span className={`text-[10px] font-bold ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{formatYAxis(tickVal)}</span>
                      </div>
                  );
              })}
          </div>

          <div className="flex-1 overflow-x-auto custom-scrollbar relative group">
              <div style={{ minWidth: `${w}px`, height: `${h}px` }} className="relative">
                  <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="gradientArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={themeColor} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={themeColor} stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {yTickValues.map(tickVal => {
                        const y = padYTop + chartH - ((tickVal / maxVal) * chartH);
                        return <line key={tickVal} x1={0} y1={y} x2={w} y2={y} stroke={darkMode ? "#1e293b" : "#e2e8f0"} strokeWidth={tickVal === 0 ? "2" : "1"} strokeDasharray={tickVal === 0 ? "0" : "4 4"} />;
                    })}

                    {hoveredIndex !== null && <line x1={points[hoveredIndex].x} y1={padYTop} x2={points[hoveredIndex].x} y2={h - padYBottom} stroke={darkMode ? "#475569" : "#94a3b8"} strokeWidth="1" strokeDasharray="4 4" />}

                    <path d={areaPath} fill="url(#gradientArea)" className="transition-all duration-300" />
                    <path d={linePath} fill="none" stroke={themeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-300" />

                    {points.map((p, i) => {
                      const isHovered = hoveredIndex === i;
                      let step = chartData.length > 90 ? 10 : chartData.length > 60 ? 5 : chartData.length > 31 ? 3 : chartData.length > 15 ? 2 : 1;
                      const showLabel = isHovered || (i % step === 0) || i === chartData.length - 1;

                      return (
                        <g key={i}>
                          <circle cx={p.x} cy={p.y} r={isHovered ? "6" : "3"} fill={darkMode ? (isHovered ? themeColor : "#131824") : (isHovered ? themeColor : "#ffffff")} stroke={themeColor} strokeWidth="2.5" className="transition-all duration-200 pointer-events-none" />
                          <circle cx={p.x} cy={p.y} r="25" fill="transparent" className="cursor-crosshair" onMouseEnter={() => setHoveredIndex(i)} onMouseLeave={() => setHoveredIndex(null)} onTouchStart={() => setHoveredIndex(i)} />
                          {showLabel && <text x={p.x} y={h - padYBottom + 20} textAnchor="middle" fill={isHovered ? (darkMode ? "#f8fafc" : "#0f172a") : (darkMode ? "#475569" : "#94a3b8")} fontSize="11" fontWeight={isHovered ? "bold" : "600"} className="transition-all pointer-events-none">{p.label}</text>}
                          {(!isHovered && p.val > 0 && showLabel) && <text x={p.x} y={p.y - 16} textAnchor="middle" fill={darkMode ? "#475569" : "#94a3b8"} fontSize="10" fontWeight="600" className="pointer-events-none">{metric === 'revenue' ? formatCompact(p.val) : p.val}</text>}
                        </g>
                      );
                    })}
                  </svg>

                  {hoveredIndex !== null && (
                      <div 
                          className="absolute z-10 pointer-events-none transition-all duration-100 ease-out"
                          style={{ 
                              left: hoveredIndex === 0 ? `${(points[hoveredIndex].x / w) * 100}%` : 
                                    hoveredIndex === points.length - 1 ? `calc(${(points[hoveredIndex].x / w) * 100}% - 10px)` : 
                                    `${(points[hoveredIndex].x / w) * 100}%`,
                              top: `${(points[hoveredIndex].y / h) * 100}%`,
                              // Ajuste inteligente: si el punto está muy alto (y < 120), lo mostramos debajo (20px). Si no, arriba (-120%).
                              transform: `translate(${hoveredIndex === 0 ? '0%' : hoveredIndex === points.length - 1 ? '-100%' : '-50%'}, ${points[hoveredIndex].y < 120 ? '20px' : '-120%'})`
                          }}
                      >
                          <div className={`p-4 rounded-xl shadow-xl border backdrop-blur-xl whitespace-nowrap ${darkMode ? 'bg-slate-800/95 border-slate-700' : 'bg-white/95 border-slate-200'}`}>
                              <div className={`text-[10px] font-bold uppercase tracking-wider mb-2.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{points[hoveredIndex].fullLabel}</div>
                              <div className="flex flex-col gap-2">
                                  <div className="flex items-center justify-between gap-8">
                                      <span className="text-xs font-semibold opacity-70">Ingresos</span>
                                      <span className={`text-sm font-black ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>{formatMoney(points[hoveredIndex].revenue)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-8">
                                      <span className="text-xs font-semibold opacity-70">Unidades</span>
                                      <span className="text-sm font-bold text-teal-500">{points[hoveredIndex].quantity} u.</span>
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

// --- APP PRINCIPAL ---
export default function App() {
  const [user, setUser] = useState(() => localStorage.getItem('028_user') || null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('028_dark_mode') === 'true');
  const [isOffline, setIsOffline] = useState(false);
  
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
  const [hiddenSuggestions, setHiddenSuggestions] = useState({ products: [], variants: [] });

  useEffect(() => {
    if (!user) return;
    if (firebaseConfig.apiKey === "TU_API_KEY_AQUI") { setConfigError(true); setLoading(false); return; }
    
    setLoading(true);

    try {
        const unsubBatches = onSnapshot(query(collection(db, 'batches'), orderBy('createdAt', 'desc')), (snap) => {
            setBatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsOffline(false);
        }, (error) => { setIsOffline(true); setLoading(false); });
        
        const unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('date', 'desc')), (snap) => {
            setSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsOffline(false);
        }, (error) => setIsOffline(true));
        
        const unsubExp = onSnapshot(query(collection(db, 'expenses'), orderBy('date', 'desc')), (snap) => {
            setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsOffline(false);
        }, (error) => setIsOffline(true));

        const unsubSettings = onSnapshot(doc(db, 'settings', 'autocomplete'), (docSnap) => {
            if (docSnap.exists()) setHiddenSuggestions(docSnap.data());
            else setHiddenSuggestions({ products: [], variants: [] });
        }, (error) => console.error("Error settings:", error));
        
        setLoading(false);
        return () => { unsubBatches(); unsubSales(); unsubExp(); unsubSettings(); };
    } catch (e) {
        setIsOffline(true);
        setLoading(false);
    }
  }, [user]);

  const formatMoney = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
  const formatPercent = (val) => new Intl.NumberFormat('es-AR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val / 100);

  const { uniqueProducts, uniqueVariants } = useMemo(() => {
      const prodsMap = new Map();
      const varsMap = new Map();
      batches.forEach(b => {
          if (b.items) {
              b.items.forEach(i => {
                  if (i.product) {
                      const p = i.product.trim();
                      const key = p.toLowerCase();
                      if (!hiddenSuggestions.products?.includes(key) && !prodsMap.has(key)) prodsMap.set(key, p);
                  }
                  if (i.variant) {
                      const v = i.variant.trim();
                      const key = v.toLowerCase();
                      if (!hiddenSuggestions.variants?.includes(key) && !varsMap.has(key)) varsMap.set(key, v);
                  }
              });
          }
      });
      return { uniqueProducts: Array.from(prodsMap.values()).sort(), uniqueVariants: Array.from(varsMap.values()).sort() };
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
              daysActive = Math.ceil(Math.abs(new Date() - firstDate) / (1000 * 60 * 60 * 24)) || 1;
          }
      } else {
          const [y, m] = globalMonth.split('-').map(Number);
          const now = new Date();
          daysActive = (now.getFullYear() === y && now.getMonth() + 1 === m) ? now.getDate() : new Date(y, m, 0).getDate();
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

  const handleExportSales = () => {
      const headers = ['Fecha', 'Lote', 'Producto', 'Variante', 'Cantidad', 'Precio Unitario', 'Total Venta', 'Costo Unitario', 'Ganancia Envio', 'Origen', 'Revendedor'];
      const rows = sales.map(s => [
          new Date(s.date).toLocaleDateString(), s.batchName, s.productName, s.variant, 
          s.quantity, s.unitPrice, s.totalSaleRaw, s.costArsAtSale, 
          (s.totalSaleRaw - (s.unitPrice * s.quantity)), s.source, s.isReseller ? 'Si' : 'No'
      ]);
      exportToCSV('historial_ventas.csv', [headers, ...rows]);
      showToast('Historial descargado con éxito', 'success');
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

  const handleCreateBatch = async () => {
    if (!newBatchName) return showToast("Debes ingresar un nombre para el lote", 'error');
    try { await addDoc(collection(db, 'batches'), { name: newBatchName, createdAt: new Date().toISOString(), items: [] }); setNewBatchName(''); showToast("Lote creado correctamente", 'success'); } catch (e) { showToast("Error: " + e.message, 'error'); }
  };
  const handleDeleteBatch = async (id) => { if (window.confirm('¿Borrar carpeta completa? Se perderá el historial interno.')) await deleteDoc(doc(db, 'batches', id)); };

  const handleUpdateBatchStatus = async (batchId, isFinalizing) => {
    if (isFinalizing) {
        if (!manualFinalizeDate) return showToast("Selecciona una fecha", 'error');
        if (!window.confirm(`¿Confirmar que el stock se terminó el día ${manualFinalizeDate}?`)) return;
        const [year, month, day] = manualFinalizeDate.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day, 12, 0, 0);
        try { await updateDoc(doc(db, 'batches', batchId), { finalizedAt: dateObj.toISOString() }); showToast("Lote Finalizado", 'success'); } catch (e) { showToast("Error: " + e.message, 'error'); }
    } else {
        if (!window.confirm("¿Reactivar este lote? Volverá a contar los días para el promedio diario.")) return;
        try { await updateDoc(doc(db, 'batches', batchId), { finalizedAt: null }); showToast("Lote Reactivado", 'success'); } catch (e) { showToast("Error: " + e.message, 'error'); }
    }
  };

  const handleAddItemToBatch = async (batchId) => {
    if (!newItem.product || !newItem.costArs || !newItem.initialStock) return showToast("Faltan datos esenciales", 'error');
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    const newItemData = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      product: newItem.product, variant: newItem.variant || 'Único',
      costArs: parseFloat(newItem.costArs) || 0,
      initialStock: parseInt(newItem.initialStock) || 0,
      currentStock: parseInt(newItem.initialStock) || 0,
    };
    try { await updateDoc(doc(db, 'batches', batchId), { items: [...(batch.items || []), newItemData] }); setNewItem({ product: '', variant: '', costArs: '', initialStock: '' }); showToast("Producto agregado", 'success'); } catch (e) { showToast("Error: " + e.message, 'error'); }
  };

  const handleDeleteItemFromBatch = async (batchId, itemId) => {
    if (!window.confirm('¿Eliminar este producto del lote?')) return;
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    const updatedItems = batch.items.filter(i => i.id !== itemId);
    try { await updateDoc(doc(db, 'batches', batchId), { items: updatedItems }); showToast("Producto eliminado", 'success'); } catch (e) { showToast("Error al borrar: " + e.message, 'error'); }
  };

  const handleAddSale = async () => {
    if (!newSale.batchId) return showToast("Debes seleccionar una Carpeta.", 'error');
    if (!newSale.itemId) return showToast("Debes seleccionar un Producto.", 'error');
    if (!newSale.unitPrice) return showToast("Ingresa el Precio de Venta.", 'error');
    
    const batch = batches.find(b => b.id === newSale.batchId);
    if (!batch) return showToast("Carpeta no encontrada", 'error');
    const itemIndex = batch.items.findIndex(i => i.id === newSale.itemId);
    if (itemIndex === -1) return showToast("Producto no encontrado", 'error');
    const item = batch.items[itemIndex];

    if (item.currentStock <= 0) return showToast(`Sin stock de ${item.product}.`, 'error');
    const qty = parseInt(newSale.quantity) || 1;
    if (qty < 1) return showToast("La cantidad mínima es 1.", 'error');
    if (item.currentStock < qty) return showToast(`Stock insuficiente. Disponibles: ${item.currentStock}.`, 'error');

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
      if (allZero && !batch.finalizedAt) showToast("Lote finalizado automáticamente (Stock 0)", 'success');
      else showToast(`Venta registrada. Ingreso: ${formatMoney(totalCashIn)}`, 'success');
      setNewSale({ ...newSale, quantity: 1, unitPrice: '', shippingCost: 0, shippingPrice: 0 });
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const handleDeleteSale = async (sale) => {
    if (!sale || !sale.id) return;
    if (!window.confirm(`¿Anular venta de ${sale.productName}? El stock se devolverá.`)) return;
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
      showToast("Venta anulada correctamente", 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  };

  const handleAddExpense = async () => {
    if (!newExpense.description || !newExpense.amount) return showToast('Completa la descripción y el monto', 'error');
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
    showToast('Gasto asentado', 'success');
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
    if(val === '1717') { localStorage.setItem('028_user', 'Admin'); setUser('Admin'); showToast('Acceso autorizado', 'success'); } 
    else alert('Contraseña incorrecta');
  };

  if (!user) return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-500 ${darkMode ? 'bg-[#0B0F19]' : 'bg-slate-50'}`}>
      <div className={`p-8 rounded-3xl shadow-2xl w-full max-w-sm text-center border-t border-l ${darkMode ? 'bg-[#131824] border-slate-700/50' : 'bg-white border-white'}`}>
        <div className="bg-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/30"><Package size={32} className="text-white" /></div>
        <h1 className={`text-2xl font-black mb-1 tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>028 IMPORT</h1>
        <p className="text-slate-500 mb-8 text-xs font-medium uppercase tracking-widest">Sistema de Gestión</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="password" name="password" placeholder="Clave de acceso" className={`w-full border-2 p-3 rounded-xl text-center font-bold text-sm outline-none transition-all ${darkMode ? 'bg-slate-900/50 border-slate-800 text-white focus:border-indigo-500' : 'bg-slate-50 border-slate-200 focus:border-indigo-500 focus:bg-white'}`} autoFocus />
          <button className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-500 transition-all shadow-md shadow-indigo-500/20 active:scale-95 text-sm">Entrar al Workspace</button>
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
        <button onClick={() => window.location.reload()} className="bg-indigo-500 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-400">Recargar</button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen font-sans transition-colors duration-500 text-sm pb-24 ${darkMode ? 'bg-[#0B0F19] text-slate-200' : 'bg-[#F8FAFC] text-slate-800'}`}>
      
      {/* TOASTS */}
      {toast && (
          <div className={`fixed bottom-6 right-6 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 z-50 border backdrop-blur-md ${toast.type === 'error' ? 'bg-rose-600/90 border-rose-500 text-white' : 'bg-slate-900/90 border-slate-800 text-white'}`}>
             {toast.type === 'error' ? <XCircle size={18} className="text-rose-200"/> : <CheckCircle size={18} className="text-emerald-400"/>}
             <span className="font-semibold text-xs tracking-wide">{toast.message}</span>
          </div>
      )}

      {/* DATALISTS */}
      <datalist id="products-list">{uniqueProducts.map(p => <option key={p} value={p} />)}</datalist>
      <datalist id="variants-list">{uniqueVariants.map(v => <option key={v} value={v} />)}</datalist>

      {/* HEADER STICKY GLASSMORPHISM */}
      <header className={`sticky top-0 z-40 backdrop-blur-xl border-b transition-colors duration-300 ${darkMode ? 'bg-[#0B0F19]/80 border-slate-800/80' : 'bg-white/80 border-slate-200/80 shadow-sm'}`}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-sm"><FolderOpen size={18} strokeWidth={2.5} /></div>
            <div>
                <h1 className={`text-lg font-black tracking-tight leading-none ${darkMode ? 'text-white' : 'text-slate-900'}`}>028 IMPORT</h1>
                <div className="flex items-center gap-2 mt-0.5">
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Workspace • {user}</p>
                    {isOffline && (
                        <span className="flex items-center gap-1 text-[9px] bg-rose-500/10 text-rose-500 px-1.5 py-0.5 rounded-md font-bold border border-rose-500/20">
                            <WifiOff size={10}/> Offline
                        </span>
                    )}
                </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button onClick={() => setDarkMode(!darkMode)} className={`p-2.5 rounded-xl transition-all border ${darkMode ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{darkMode ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button onClick={() => { localStorage.removeItem('028_user'); setUser(null); }} className={`p-2.5 rounded-xl transition-all border ${darkMode ? 'bg-slate-800 border-slate-700 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30' : 'bg-white border-slate-200 text-rose-500 hover:bg-rose-50'}`}><LogOut size={16} /></button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto space-y-6 px-4 mt-6">
        
        {/* NAVEGACIÓN SEGMENTADA MODERNIZADA */}
        <div className={`flex overflow-x-auto custom-scrollbar p-1.5 rounded-2xl border w-fit shadow-sm ${darkMode ? 'bg-[#131824] border-slate-800' : 'bg-white border-slate-200'}`}>
            {[
                { id: 'home', icon: Activity, label: 'Dashboard' }, 
                { id: 'batches', icon: FolderOpen, label: 'Lotes' }, 
                { id: 'sales', icon: ShoppingCart, label: 'Ventas' }, 
                { id: 'analysis', icon: BarChart3, label: 'Análisis' }, 
                { id: 'expenses', icon: Wallet, label: 'Gastos' }
            ].map(tab => (
            <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id)} 
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-[11px] uppercase tracking-wider transition-all duration-200 whitespace-nowrap ${activeTab === tab.id ? (darkMode ? 'bg-slate-800 text-white shadow-sm' : 'bg-slate-100 text-slate-900 shadow-sm') : (darkMode ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50')}`}
            >
                <tab.icon size={14} strokeWidth={2.5} /> {tab.label}
            </button>
            ))}
        </div>

        {/* --- PESTAÑA DASHBOARD (INICIO) --- */}
        {activeTab === 'home' && (
             <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className={`text-2xl font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>Visión General</h2>
                        <p className={`text-xs font-medium mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Métricas clave de {globalMonth === 'all' ? 'todo el histórico' : 'este periodo'}.</p>
                    </div>
                    
                    <div className="relative w-full sm:w-auto min-w-[200px]">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Calendar size={14} className="text-indigo-500" />
                        </div>
                        <select 
                            className={`appearance-none w-full border-2 rounded-xl py-2.5 pl-9 pr-10 text-sm font-bold outline-none cursor-pointer transition-all shadow-sm ${darkMode ? 'bg-[#131824] border-slate-700 text-white hover:border-slate-600 focus:border-indigo-500' : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300 focus:border-indigo-500'}`}
                            value={globalMonth} 
                            onChange={e => setGlobalMonth(e.target.value)}
                        >
                            {monthOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <ChevronDown size={14} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <MetricCard 
                          darkMode={darkMode} title={`Ventas ${globalMonth === 'all' ? 'Totales' : ''}`} value={formatMoney(globalAnalysis.totalRevenue)} subtitle="Ingresos brutos" icon={DollarSign} color="blue"
                          trend={globalAnalysis.prevRevenue !== null && globalAnalysis.prevRevenue > 0 ? (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${globalAnalysis.totalRevenue >= globalAnalysis.prevRevenue ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                  {globalAnalysis.totalRevenue >= globalAnalysis.prevRevenue ? '↑' : '↓'} {Math.abs(((globalAnalysis.totalRevenue - globalAnalysis.prevRevenue)/globalAnalysis.prevRevenue)*100).toFixed(0)}%
                              </span>
                          ) : null}
                      />
                      
                      <MetricCard 
                          darkMode={darkMode} title="Ganancia Bruta" value={formatMoney(globalAnalysis.grossProfit)} subtitle="Antes de gastos" icon={TrendingUp} color="emerald"
                          trend={<span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-500/10 text-slate-500">{formatPercent(globalAnalysis.grossMargin)}</span>}
                      />

                      <MetricCard darkMode={darkMode} title="Gastos Operativos" value={formatMoney(globalAnalysis.totalGlobalExpenses)} subtitle="Envíos, aduana, etc." icon={Wallet} color="rose" />
                      
                      <MetricCard 
                          darkMode={darkMode} title="Ganancia Neta" value={formatMoney(globalAnalysis.netProfit)} subtitle="Dinero libre real" icon={Award} color="violet"
                          trend={
                              <div className="flex gap-1 items-center">
                                  {globalAnalysis.prevNetProfit !== null && globalAnalysis.prevNetProfit > 0 && (
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${globalAnalysis.netProfit >= globalAnalysis.prevNetProfit ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                          {globalAnalysis.netProfit >= globalAnalysis.prevNetProfit ? '↑' : '↓'} {Math.abs(((globalAnalysis.netProfit - globalAnalysis.prevNetProfit)/globalAnalysis.prevNetProfit)*100).toFixed(0)}%
                                      </span>
                                  )}
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${globalAnalysis.netProfit > 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>{formatPercent(globalAnalysis.netMargin)}</span>
                              </div>
                          }
                      />

                      <MetricCard darkMode={darkMode} title="Inversión" value={formatMoney(globalAnalysis.totalInvestment)} subtitle="Costo mercadería" icon={Box} color="amber" />
                      <MetricCard darkMode={darkMode} title="Valor Stock" value={formatMoney(globalAnalysis.currentStockValue)} subtitle="Activo inmovilizado" icon={Package} color="indigo" />
                      <MetricCard darkMode={darkMode} title="Flujo de Caja" value={formatMoney(globalAnalysis.cashBalance)} subtitle="Efectivo en mano" icon={Activity} color="emerald" />
                      
                      <MetricCard 
                          darkMode={darkMode} title="Ritmo de Ventas" value={globalAnalysis.dailyAvgItems.toFixed(1)} subtitle="Unidades por día" icon={Flame} color="amber"
                          trend={globalAnalysis.currentStreak > 0 ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 flex items-center gap-0.5"><Flame size={10}/> {globalAnalysis.currentStreak} d.</span> : null}
                      />
                </div>

                <Card darkMode={darkMode} className="col-span-full pb-2">
                    <h3 className={`font-bold mb-5 flex items-center gap-2 text-xs uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}><TrendingUp size={16} className="text-indigo-500"/> Rendimiento Financiero</h3>
                    <SalesChart sales={globalAnalysis.filteredSales} globalMonth={globalMonth} darkMode={darkMode} />
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-bottom-8">
                    <Card darkMode={darkMode}>
                      <h3 className={`font-bold mb-4 flex items-center gap-2 text-xs uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}><Users size={16} className="text-blue-500"/> Canales de Adquisición</h3>
                      <div className="space-y-3">
                        {Object.entries(globalAnalysis.sourceCounts).map(([source, count]) => (
                          <div key={source} className="flex items-center justify-between">
                            <span className="text-xs font-semibold w-24 truncate">{source}</span>
                            <div className="flex-1 mx-4">
                              <div className={`h-2 rounded-full overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                                  <div className="h-full bg-blue-500 rounded-full" style={{width: `${(count/globalAnalysis.salesCount)*100}%`}}></div>
                              </div>
                            </div>
                            <span className="font-bold text-xs w-6 text-right text-slate-500">{count}</span>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Card darkMode={darkMode}>
                      <h3 className={`font-bold mb-4 flex items-center gap-2 text-xs uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}><BarChart3 size={16} className="text-violet-500"/> Distribución de Clientes</h3>
                      <div className="flex gap-4 items-center justify-center h-20">
                        <div className={`text-center w-1/2 p-3 rounded-xl border ${darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-slate-50 border-slate-100'}`}>
                          <div className="text-2xl font-black text-emerald-500">{globalAnalysis.typeCounts.Final}</div>
                          <div className={`text-[9px] font-bold uppercase tracking-wider mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Consumidor Final</div>
                        </div>
                        <div className={`text-center w-1/2 p-3 rounded-xl border ${darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-slate-50 border-slate-100'}`}>
                          <div className="text-2xl font-black text-violet-500">{globalAnalysis.typeCounts.Revendedor}</div>
                          <div className={`text-[9px] font-bold uppercase tracking-wider mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Revendedor</div>
                        </div>
                      </div>
                    </Card>
                  </div>
             </div>
        )}

        {/* --- PESTAÑA LOTES --- */}
        {activeTab === 'batches' && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <Card darkMode={darkMode} className={darkMode ? 'border-l-4 border-l-indigo-500' : 'border-l-4 border-l-indigo-600'}>
              <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
                  <div className="flex-1 max-w-md">
                      <h2 className={`text-sm font-bold flex items-center gap-2 mb-3 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}><Plus size={16} /> Crear Carpeta de Lote</h2>
                      <div className="flex gap-2 items-end">
                        <Input darkMode={darkMode} label="Identificador del Lote" placeholder="Ej: Viaje Miami Mar'26" value={newBatchName} onChange={e => setNewBatchName(e.target.value)} />
                        <Button darkMode={darkMode} onClick={handleCreateBatch} className="h-[44px]">Guardar</Button>
                      </div>
                  </div>
                  <button onClick={handleExportBatches} className={`mt-2 sm:mt-0 flex items-center justify-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl border-2 transition-all ${darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      <Download size={14}/> Bajar CSV
                  </button>
              </div>
            </Card>

            <div className="space-y-3">
              {batches.map((b) => (
                <div key={b.id} className={`rounded-2xl border transition-all duration-300 overflow-hidden ${expandedBatchId === b.id ? 'shadow-md' : 'shadow-sm hover:shadow-md'} ${darkMode ? 'bg-[#131824] border-slate-800/80' : 'bg-white border-slate-200'}`}>
                  <div className={`p-4 flex justify-between items-center cursor-pointer transition-colors ${darkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}`} onClick={() => setExpandedBatchId(expandedBatchId === b.id ? null : b.id)}>
                    <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-xl ${b.finalizedAt ? (darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-100 text-emerald-600') : (darkMode ? 'bg-indigo-900/30 text-indigo-400' : 'bg-indigo-100 text-indigo-600')}`}>
                            <FolderOpen size={20} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h3 className={`font-bold text-[15px] ${darkMode ? 'text-white' : 'text-slate-900'}`}>{b.name}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{(b.items || []).length} Productos</span>
                                <span className="text-slate-300 dark:text-slate-700">•</span>
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${b.finalizedAt ? 'text-emerald-500' : (darkMode ? 'text-indigo-400' : 'text-indigo-600')}`}>{b.finalizedAt ? 'Cerrado' : 'Activo'}</span>
                            </div>
                        </div>
                    </div>
                    <div className={`p-1.5 rounded-full transition-colors ${darkMode ? 'text-slate-500 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100'}`}>
                        {expandedBatchId === b.id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>
                  </div>
                  
                  {expandedBatchId === b.id && (
                    <div className={`p-4 border-t animate-in slide-in-from-top-2 ${darkMode ? 'border-slate-800/80 bg-[#0B0F19]/50' : 'border-slate-100 bg-slate-50/50'}`}>
                      <div className={`mb-5 p-4 rounded-xl border-2 border-dashed ${darkMode ? 'border-slate-700/50 bg-slate-900/20' : 'border-slate-200 bg-white'}`}>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                          <div className="col-span-2 md:col-span-2"><Input darkMode={darkMode} list="products-list" label="Producto" placeholder="Ej: ElfBar" value={newItem.product} onChange={e => setNewItem({...newItem, product: e.target.value})} /></div>
                          <div className="col-span-1"><Input darkMode={darkMode} list="variants-list" label="Variante" placeholder="Ej: Mint" value={newItem.variant} onChange={e => setNewItem({...newItem, variant: e.target.value})} /></div>
                          <div className="col-span-1"><Input darkMode={darkMode} label="Costo ($)" type="number" value={newItem.costArs} onChange={e => setNewItem({...newItem, costArs: e.target.value})} /></div>
                          <div className="col-span-1"><Input darkMode={darkMode} label="Stock" type="number" value={newItem.initialStock} onChange={e => setNewItem({...newItem, initialStock: e.target.value})} /></div>
                          <div className="col-span-2 md:col-span-5 mt-1"><Button darkMode={darkMode} onClick={() => handleAddItemToBatch(b.id)} className="w-full">Agregar al Inventario</Button></div>
                        </div>
                      </div>

                      <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                          <table className="w-full text-left text-sm">
                            <thead className={`text-[10px] uppercase tracking-wider font-bold ${darkMode ? 'bg-slate-900 text-slate-500' : 'bg-slate-100 text-slate-500'}`}>
                                <tr><th className="p-3">Descripción</th><th className="p-3">Costo Un.</th><th className="p-3">Stock Real</th><th className="p-3 text-right"></th></tr>
                            </thead>
                            <tbody className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                              {(b.items || []).length === 0 && <tr><td colSpan="4" className="p-4 text-center text-xs opacity-50 italic">Aún no hay productos cargados en esta carpeta.</td></tr>}
                              {(b.items || []).map((item, idx) => (
                                <tr key={idx} className={`transition-colors ${darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}`}>
                                  <td className="p-3">
                                      <div className="font-bold">{item.product}</div>
                                      <div className={`text-[11px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.variant}</div>
                                  </td>
                                  <td className="p-3 font-mono font-medium text-xs">{formatMoney(item.costArs)}</td>
                                  <td className="p-3">
                                      <span className={`inline-flex font-bold px-2 py-1 rounded-lg text-[11px] ${item.currentStock === 0 ? (darkMode ? 'bg-rose-500/10 text-rose-400' : 'bg-rose-100 text-rose-600') : (darkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-600')}`}>
                                          {item.currentStock} / {item.initialStock}
                                      </span>
                                  </td>
                                  <td className="p-3 text-right">
                                      <button onClick={() => handleDeleteItemFromBatch(b.id, item.id)} className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}><Trash2 size={14} /></button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                      </div>
                      
                      <div className="flex justify-end mt-4">
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteBatch(b.id); }} className={`text-[11px] font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${darkMode ? 'text-rose-400 hover:bg-rose-500/10' : 'text-rose-600 hover:bg-rose-50'}`}><Trash2 size={12}/> Eliminar Carpeta Completa</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- PESTAÑA VENTAS --- */}
        {activeTab === 'sales' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-in fade-in duration-500">
            <div className="lg:col-span-4">
                <Card className={`sticky top-24 border-t-4 ${darkMode ? 'border-t-emerald-500' : 'border-t-emerald-500'}`} darkMode={darkMode}>
                    <h2 className="text-lg font-black tracking-tight mb-4 flex items-center gap-2"><ShoppingCart size={18} className="text-emerald-500"/> Nueva Venta</h2>
                    <div className="space-y-4">
                      <div className={`p-1.5 rounded-xl border-2 ${darkMode ? 'bg-amber-900/20 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
                          <Input darkMode={darkMode} label="Fecha de la Operación" type="date" value={newSale.saleDate} onChange={e => setNewSale({...newSale, saleDate: e.target.value})} />
                      </div>
                      <div className="space-y-3">
                            <Select darkMode={darkMode} label="1. Seleccionar Carpeta" value={newSale.batchId} onChange={e => setNewSale({...newSale, batchId: e.target.value, itemId: ''})} options={[{value: '', label: '-- Elegir --'}, ...batches.map(b => ({value: b.id, label: `${b.name} ${b.finalizedAt ? '(Fin)' : ''}`}))]} />
                            
                            {newSale.batchId && (
                                <div className="animate-in slide-in-from-top-2">
                                   <Select darkMode={darkMode} label="2. Seleccionar Producto" value={newSale.itemId} onChange={e => setNewSale({...newSale, itemId: e.target.value})} options={[{value: '', label: '-- Elegir --'}, ...(batches.find(b => b.id === newSale.batchId)?.items?.map(item => ({value: item.id, label: `${item.product} ${item.variant} (Disp: ${item.currentStock})`, disabled: item.currentStock <= 0})) || [])]} />
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <Input darkMode={darkMode} label="Cant." type="number" value={newSale.quantity} onChange={e => setNewSale({...newSale, quantity: e.target.value})} />
                                <Input darkMode={darkMode} label="Precio Unit." type="number" symbol="$" value={newSale.unitPrice} onChange={e => setNewSale({...newSale, unitPrice: e.target.value})} />
                            </div>
                      </div>
                      
                      <div className={`p-3 rounded-xl border-2 grid grid-cols-2 gap-3 ${darkMode ? 'bg-[#0B0F19] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                          <Input darkMode={darkMode} label="Costo Envío" type="number" symbol="$" value={newSale.shippingCost} onChange={e => setNewSale({...newSale, shippingCost: e.target.value})} />
                          <Input darkMode={darkMode} label="Cobro Envío" type="number" symbol="$" value={newSale.shippingPrice} onChange={e => setNewSale({...newSale, shippingPrice: e.target.value})} />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                          <Select darkMode={darkMode} label="Canal" value={newSale.source} onChange={e => setNewSale({...newSale, source: e.target.value})} options={[{value:'Instagram', label:'Instagram'}, {value:'Whatsapp', label:'Whatsapp'}, {value:'Personal', label:'Personal'}, {value:'Web', label:'Web'}]} />
                          <Select darkMode={darkMode} label="Cliente" value={newSale.isReseller} onChange={e => setNewSale({...newSale, isReseller: e.target.value})} options={[{value:'No', label:'Consumidor'}, {value:'Si', label:'Revendedor'}]} />
                      </div>

                      <Button darkMode={darkMode} onClick={handleAddSale} variant="success" className="w-full h-[48px] mt-2 text-sm">Registrar Ingreso</Button>
                    </div>
                </Card>
            </div>

            <div className="lg:col-span-8">
              <Card darkMode={darkMode} className="h-full flex flex-col p-0 overflow-hidden">
                <div className={`p-4 border-b flex justify-between items-center ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <div>
                        <h3 className="font-black text-sm tracking-tight">Historial de Movimientos</h3>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Últimas transacciones</p>
                    </div>
                    <button onClick={handleExportSales} className={`flex items-center gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg border-2 transition-colors ${darkMode ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-600'}`}>
                      <Download size={14}/> Exportar
                    </button>
                </div>
                <div className="overflow-x-auto flex-1 max-h-[600px] custom-scrollbar">
                  <table className="w-full text-left text-sm">
                      <thead className={`sticky top-0 z-10 text-[10px] uppercase tracking-wider font-bold ${darkMode ? 'bg-[#0f141e] text-slate-500 shadow-sm' : 'bg-white text-slate-500 shadow-sm'}`}>
                          <tr><th className="p-4">Fecha</th><th className="p-4">Operación</th><th className="p-4">Margen Neto</th><th className="p-4">Caja ($)</th><th className="p-4"></th></tr>
                      </thead>
                      <tbody className={`divide-y ${darkMode ? 'divide-slate-800/80' : 'divide-slate-100'}`}>
                        {sales.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-xs opacity-50 italic">Aún no hay ventas registradas.</td></tr>}
                        {sales.map(s => {
                          const itemProfit = s.totalSaleRaw - ((s.costArsAtSale || 0) * s.quantity);
                          return (
                            <tr key={s.id} className={`transition-colors group ${darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}`}>
                              <td className={`p-4 text-xs font-medium whitespace-nowrap ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{new Date(s.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</td>
                              <td className="p-4">
                                  <div className="font-bold text-[13px]">{s.quantity}x {s.productName} {s.variant}</div>
                                  <div className={`text-[10px] font-medium uppercase tracking-wider mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{s.batchName}</div>
                              </td>
                              <td className="p-4 font-bold text-emerald-500 text-xs">{formatMoney(itemProfit)}</td>
                              <td className="p-4 font-black font-mono tracking-tight">{formatMoney(s.totalSaleRaw)}</td>
                              <td className="p-4 text-right">
                                  <button onClick={() => handleDeleteSale(s)} className={`p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${darkMode ? 'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}><Trash2 size={14} /></button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* --- PESTAÑA ANÁLISIS DE LOTE --- */}
        {activeTab === 'analysis' && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <Card darkMode={darkMode}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                    <div>
                        <h2 className="text-lg font-black tracking-tight flex items-center gap-2"><BarChart3 size={18} className="text-violet-500"/> Análisis por Carpeta</h2>
                        <p className={`text-xs font-medium mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Desglose financiero de un lote específico.</p>
                    </div>
                    <div className="w-full sm:w-64">
                        <Select
                            darkMode={darkMode}
                            onChange={(e) => setSelectedBatchStats(e.target.value)}
                            value={selectedBatchStats || ''}
                            options={[{value: '', label: '-- Seleccionar Lote --'}, ...batches.map(b => ({value: b.id, label: `${b.name} ${b.finalizedAt ? '(Finalizado)' : ''}`}))]}
                        />
                    </div>
                </div>
            </Card>

            {batchAnalysis ? (
                <div className="space-y-4 animate-in slide-in-from-bottom-4">
                   <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${batchAnalysis.batch.finalizedAt ? (darkMode ? 'bg-emerald-900/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200') : (darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200')}`}>
                      <div>
                        <h3 className="font-bold text-sm flex items-center gap-2">
                            <Settings size={16} className={darkMode ? 'text-slate-400' : 'text-slate-500'}/> Status del Lote: 
                            <span className={`px-2 py-1 rounded-md text-[10px] tracking-wider uppercase ${batchAnalysis.batch.finalizedAt ? 'bg-emerald-500/20 text-emerald-500' : 'bg-indigo-500/20 text-indigo-500'}`}>
                                {batchAnalysis.batch.finalizedAt ? "Cerrado" : "Activo"}
                            </span>
                        </h3>
                        {batchAnalysis.batch.finalizedAt && <div className={`text-[11px] font-medium mt-1.5 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Se agotó o finalizó el {new Date(batchAnalysis.batch.finalizedAt).toLocaleDateString()}</div>}
                      </div>

                      {batchAnalysis.batch.finalizedAt ? (
                          <Button darkMode={darkMode} onClick={() => handleUpdateBatchStatus(batchAnalysis.batch.id, false)} variant="outline" className="h-10 text-[11px]">🔄 Reabrir Lote</Button>
                          ) : (
                          <div className="flex gap-2 items-end w-full sm:w-auto">
                              <Input darkMode={darkMode} type="date" label="Fecha de cierre" value={manualFinalizeDate} onChange={e => setManualFinalizeDate(e.target.value)} />
                              <Button darkMode={darkMode} onClick={() => handleUpdateBatchStatus(batchAnalysis.batch.id, true)} className="h-[44px] text-[11px]">🏁 Finalizar Lote</Button>
                          </div>
                      )}
                   </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <MetricCard darkMode={darkMode} title="Inversión" value={formatMoney(batchAnalysis.totalInvestment)} subtitle="Costo original" icon={Box} color="amber" />
                      <MetricCard darkMode={darkMode} title="Ventas Generadas" value={formatMoney(batchAnalysis.totalRevenue)} subtitle="Ingreso bruto" icon={DollarSign} color="blue" />
                      <MetricCard darkMode={darkMode} title="Gastos Asignados" value={formatMoney(batchAnalysis.totalBatchExpenses)} subtitle="Costos extra" icon={Wallet} color="rose" />
                      
                      <MetricCard 
                          darkMode={darkMode} title="Saldo de Caja" value={formatMoney(batchAnalysis.cashBalance)} subtitle="Liquidez de bolsillo" icon={Activity} color="emerald" 
                      />

                      <MetricCard darkMode={darkMode} title="Stock Remanente" value={formatMoney(batchAnalysis.currentStockValue)} subtitle="Activo sin vender" icon={Package} color="indigo" />
                      
                      <MetricCard 
                          darkMode={darkMode} title="Ganancia Bruta" value={formatMoney(batchAnalysis.grossProfit)} subtitle="Antes de gastos" icon={TrendingUp} color="emerald"
                          trend={<span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-500/10 text-slate-500">{formatPercent(batchAnalysis.grossMargin)}</span>}
                      />

                      <MetricCard darkMode={darkMode} title="Diferencia Envíos" value={formatMoney(batchAnalysis.totalShippingProfit)} subtitle="Cobrado vs Pagado" icon={Truck} color="amber" />
                      
                      <MetricCard 
                          darkMode={darkMode} title="Rentabilidad Neta" value={formatMoney(batchAnalysis.netProfit)} subtitle="Utilidad final" icon={Award} color="violet"
                          trend={<span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${batchAnalysis.netProfit > 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>{formatPercent(batchAnalysis.netMargin)}</span>}
                      />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-bottom-8">
                    <Card darkMode={darkMode}>
                      <h3 className={`font-bold mb-4 flex items-center gap-2 text-xs uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}><Users size={16} className="text-blue-500"/> Origen de Ventas</h3>
                      <div className="space-y-3">
                        {Object.entries(batchAnalysis.sourceCounts).map(([source, count]) => (
                          <div key={source} className="flex items-center justify-between">
                            <span className="text-xs font-semibold w-24 truncate">{source}</span>
                            <div className="flex-1 mx-4">
                              <div className={`h-2 rounded-full overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                                  <div className="h-full bg-blue-500 rounded-full" style={{width: `${(count/batchAnalysis.salesCount)*100}%`}}></div>
                              </div>
                            </div>
                            <span className="font-bold text-xs w-6 text-right text-slate-500">{count}</span>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Card darkMode={darkMode}>
                      <h3 className={`font-bold mb-4 flex items-center gap-2 text-xs uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}><BarChart3 size={16} className="text-violet-500"/> Tipo de Cliente</h3>
                      <div className="flex gap-4 items-center justify-center h-20">
                        <div className={`text-center w-1/2 p-3 rounded-xl border ${darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-slate-50 border-slate-100'}`}>
                          <div className="text-2xl font-black text-emerald-500">{batchAnalysis.typeCounts.Final}</div>
                          <div className={`text-[9px] font-bold uppercase tracking-wider mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Consumidor Final</div>
                        </div>
                        <div className="h-8 w-[1px] bg-slate-300"></div>
                        <div className={`text-center w-1/2 p-3 rounded-xl border ${darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-slate-50 border-slate-100'}`}>
                          <div className="text-2xl font-black text-violet-500">{batchAnalysis.typeCounts.Revendedor}</div>
                          <div className={`text-[9px] font-bold uppercase tracking-wider mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Revendedor</div>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
            ) : (
                <div className={`p-12 text-center rounded-2xl border-2 border-dashed ${darkMode ? 'border-slate-800 bg-slate-900/20' : 'border-slate-200 bg-slate-50'}`}>
                    <FolderOpen size={48} className={`mx-auto mb-4 ${darkMode ? 'text-slate-700' : 'text-slate-300'}`}/>
                    <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Selecciona un lote en el menú superior para ver su análisis financiero detallado.</p>
                </div>
            )}
          </div>
        )}

        {/* --- PESTAÑA GASTOS --- */}
        {activeTab === 'expenses' && (
            <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
            <Card darkMode={darkMode} className="border-t-4 border-t-rose-500">
                <h2 className="text-lg font-black tracking-tight mb-4 flex items-center gap-2"><Wallet size={18} className="text-rose-500"/> Registrar Salida de Dinero</h2>
                <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2"><Input darkMode={darkMode} label="Concepto / Descripción" placeholder="Ej: Publicidad Instagram" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} /></div>
                        <div className="sm:col-span-1"><Input darkMode={darkMode} label="Monto" type="number" symbol="$" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} /></div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 items-end">
                          <div className="flex-1 w-full">
                             <Select 
                                darkMode={darkMode} 
                                label="¿Asignar a un lote específico? (Opcional)"
                                value={newExpense.batchId} 
                                onChange={e => setNewExpense({...newExpense, batchId: e.target.value})}
                                options={[
                                    { value: '', label: '-- Gasto General del Negocio --' },
                                    ...batches.map(b => ({ value: b.id, label: b.name }))
                                ]}
                             />
                          </div>
                          <Button darkMode={darkMode} onClick={handleAddExpense} variant="danger" className="w-full sm:w-32 h-[44px]">Registrar Gasto</Button>
                    </div>
                </div>
            </Card>

            <Card darkMode={darkMode} className="p-0 overflow-hidden">
                <div className={`p-4 border-b ${darkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <h3 className="font-black text-sm tracking-tight">Historial de Egresos</h3>
                </div>
                <div className={`divide-y ${darkMode ? 'divide-slate-800/80' : 'divide-slate-100'}`}>
                    {expenses.length === 0 && <div className="p-8 text-center text-xs opacity-50 italic">No hay gastos registrados.</div>}
                    {expenses.map(e => (
                    <div key={e.id} className={`flex justify-between items-center p-4 transition-colors group ${darkMode ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}`}>
                        <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg ${darkMode ? 'bg-rose-500/10 text-rose-500' : 'bg-rose-100 text-rose-600'}`}><Wallet size={16}/></div>
                            <div>
                                <div className="font-bold text-[13px]">{e.description}</div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[10px] font-medium ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{new Date(e.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                                    {e.batchName && (
                                        <>
                                            <span className="text-slate-300 dark:text-slate-700">•</span>
                                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${darkMode ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>{e.batchName}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="font-black tracking-tight text-rose-500 text-sm">-{formatMoney(e.amount)}</span> 
                            <button onClick={()=>handleDeleteExpense(e.id)} className={`p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${darkMode ? 'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}><Trash2 size={14}/></button>
                        </div>
                    </div>
                    ))}
                </div>
            </Card>
            </div>
        )}

      </div>
    </div>
  );
}
