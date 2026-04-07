import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Trash2, Save, TrendingUp, DollarSign, Package,
  ShoppingCart, Wallet, Activity, LogOut, Moon, Sun, AlertTriangle, Calendar, Award, FolderOpen, ChevronRight, ChevronDown, Box, Users, BarChart3, CheckCircle, Clock, Settings, Truck, Home, Percent, Flame, WifiOff, Download, XCircle, Search
} from 'lucide-react';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

import { initializeApp } from "firebase/app";
import {
  initializeFirestore, collection, addDoc, deleteDoc, doc, updateDoc, setDoc,
  onSnapshot, query, orderBy
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let db;
try {
  const app = initializeApp(firebaseConfig);
  db = initializeFirestore(app, { experimentalForceLongPolling: true });
} catch (error) {
  console.error("Error inicializando Firebase:", error);
}

const formatMoney = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val || 0);
const formatCompact = (val) => new Intl.NumberFormat('es-AR', { notation: "compact", compactDisplay: "short", maximumFractionDigits: 1 }).format(val || 0);
const formatPercent = (val) => new Intl.NumberFormat('es-AR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format((val || 0) / 100);

const Card = ({ children, className = '', darkMode }) => (
  <div className={`rounded-xl border shadow-sm transition-colors duration-200 ${
    darkMode ? 'bg-[#0f1115] border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
  } ${className}`}>
    {children}
  </div>
);

const MetricCard = ({ title, value, subtitle, icon: Icon, trend, color = 'zinc', darkMode }) => {
  const colorStyles = {
    blue: darkMode ? 'bg-blue-900/10 border-blue-900/50 hover:bg-blue-900/20 hover:border-blue-800' : 'bg-blue-50/80 border-blue-200 hover:bg-blue-100/50 hover:border-blue-300',
    emerald: darkMode ? 'bg-emerald-900/10 border-emerald-900/50 hover:bg-emerald-900/20 hover:border-emerald-800' : 'bg-emerald-50/80 border-emerald-200 hover:bg-emerald-100/50 hover:border-emerald-300',
    rose: darkMode ? 'bg-rose-900/10 border-rose-900/50 hover:bg-rose-900/20 hover:border-rose-800' : 'bg-rose-50/80 border-rose-200 hover:bg-rose-100/50 hover:border-rose-300',
    amber: darkMode ? 'bg-amber-900/10 border-amber-900/50 hover:bg-amber-900/20 hover:border-amber-800' : 'bg-amber-50/80 border-amber-200 hover:bg-amber-100/50 hover:border-amber-300',
    violet: darkMode ? 'bg-violet-900/10 border-violet-900/50 hover:bg-violet-900/20 hover:border-violet-800' : 'bg-violet-50/80 border-violet-200 hover:bg-violet-100/50 hover:border-violet-300',
    indigo: darkMode ? 'bg-indigo-900/10 border-indigo-900/50 hover:bg-indigo-900/20 hover:border-indigo-800' : 'bg-indigo-50/80 border-indigo-200 hover:bg-indigo-100/50 hover:border-indigo-300',
    zinc: darkMode ? 'bg-[#0f1115] border-zinc-800 hover:border-zinc-700' : 'bg-white border-zinc-200 hover:border-zinc-300',
  };

  const iconColors = {
    blue: darkMode ? 'text-blue-400 bg-blue-500/20' : 'text-blue-600 bg-blue-200/50',
    emerald: darkMode ? 'text-emerald-400 bg-emerald-500/20' : 'text-emerald-700 bg-emerald-200/50',
    rose: darkMode ? 'text-rose-400 bg-rose-500/20' : 'text-rose-600 bg-rose-200/50',
    amber: darkMode ? 'text-amber-400 bg-amber-500/20' : 'text-amber-600 bg-amber-200/50',
    violet: darkMode ? 'text-violet-400 bg-violet-500/20' : 'text-violet-600 bg-violet-200/50',
    indigo: darkMode ? 'text-indigo-400 bg-indigo-500/20' : 'text-indigo-600 bg-indigo-200/50',
    zinc: darkMode ? 'text-zinc-400 bg-zinc-800' : 'text-zinc-600 bg-zinc-100',
  };

  return (
    <div className={`flex flex-col p-4 rounded-xl border shadow-sm transition-all duration-200 group ${colorStyles[color]} ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>
       <div className="flex items-center justify-between mb-3">
          <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'opacity-60' : 'text-zinc-600'}`}>{title}</span>
          <div className={`p-1.5 rounded-md transition-colors ${iconColors[color]}`}>
              <Icon size={16} strokeWidth={2.5} />
          </div>
       </div>
       <div>
          <div className="text-2xl font-bold tracking-tight">{value}</div>
          <div className="flex items-center justify-between mt-2">
             <span className={`text-xs font-medium ${darkMode ? 'opacity-50' : 'text-zinc-500'}`}>{subtitle}</span>
             {trend}
          </div>
       </div>
    </div>
  );
};

const Button = ({ onClick, children, variant = 'primary', className = '', disabled = false, darkMode }) => {
  const baseStyle = "h-10 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
    danger: darkMode ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" : "bg-red-50 text-red-600 hover:bg-red-100",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
    outline: darkMode ? "border border-zinc-700 text-zinc-300 bg-transparent hover:bg-zinc-800" : "border border-zinc-300 text-zinc-700 bg-transparent hover:bg-zinc-50"
  };
  return <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`}>{children}</button>;
};

const Input = ({ label, symbol, darkMode, list, ...props }) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className={`text-xs font-semibold ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>{label}</label>}
    <div className="relative">
      {symbol && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className={`text-sm font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{symbol}</span></div>}
      {props.type === 'search' && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search size={16} className={`${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}/></div>}
      <input list={list} className={`h-10 border rounded-lg px-3 w-full text-sm outline-none transition-colors duration-200 ${darkMode ? 'bg-[#0a0c10] border-zinc-800 text-zinc-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50' : 'bg-white border-zinc-300 text-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50'} ${symbol || props.type === 'search' ? 'pl-9' : ''}`} {...props} />
    </div>
  </div>
);

const Select = ({ label, options = [], darkMode, ...props }) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className={`text-xs font-semibold ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>{label}</label>}
    <div className="relative">
      <select className={`h-10 appearance-none w-full border rounded-lg px-3 pr-8 text-sm outline-none cursor-pointer transition-colors duration-200 ${darkMode ? 'bg-[#0a0c10] border-zinc-800 text-zinc-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50' : 'bg-white border-zinc-300 text-zinc-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50'}`} {...props}>
        {options.map((opt, idx) => <option key={idx} value={opt.value}>{opt.label}</option>)}
      </select>
      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <ChevronDown size={14} className={darkMode ? "text-zinc-500" : "text-zinc-400"} />
      </div>
    </div>
  </div>
);

const CustomSelect = ({ label, options = [], value, onChange, darkMode, placeholder = "-- Elegir --" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex flex-col gap-1.5 w-full relative" ref={dropdownRef}>
      {label && <label className={`text-xs font-semibold ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>{label}</label>}
      
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`min-h-10 flex items-center justify-between border rounded-lg px-3 py-2 text-sm outline-none cursor-pointer transition-all duration-200 select-none shadow-sm
          ${darkMode ? 'bg-[#0a0c10] border-zinc-800 text-zinc-100 hover:border-zinc-700' : 'bg-white border-zinc-300 text-zinc-900 hover:border-zinc-400'}
          ${isOpen ? 'border-indigo-500 ring-1 ring-indigo-500/50' : ''}`}
      >
        <div className={!selectedOption ? (darkMode ? 'text-zinc-500' : 'text-zinc-400') : 'truncate flex-1'}>
          {selectedOption ? (selectedOption.renderLabel || selectedOption.label) : placeholder}
        </div>
        <ChevronDown size={14} className={`transition-transform duration-200 ml-2 flex-shrink-0 ${isOpen ? 'rotate-180 text-indigo-500' : (darkMode ? 'text-zinc-500' : 'text-zinc-400')}`} />
      </div>

      {isOpen && (
        <div className={`absolute top-[100%] mt-2 z-50 w-full max-h-72 overflow-y-auto rounded-xl shadow-2xl custom-scrollbar animate-in fade-in slide-in-from-top-2 p-2 
          ${darkMode ? 'bg-[#0f1115] border border-zinc-800' : 'bg-zinc-100 border border-zinc-300'}`}
        >
          {options.length === 0 ? (
            <div className={`p-4 text-sm text-center font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>No hay opciones disponibles</div>
          ) : (
            <div className="flex flex-col gap-2"> 
              {options.map((opt, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    if (!opt.disabled) {
                      onChange({ target: { value: opt.value } });
                      setIsOpen(false);
                    }
                  }}
                  className={`px-3 py-3 rounded-xl text-sm transition-all duration-200 border shadow-sm
                    ${opt.disabled 
                      ? (darkMode ? 'opacity-40 cursor-not-allowed bg-[#131824] border-zinc-800/50' : 'opacity-50 cursor-not-allowed bg-white border-zinc-200/50') 
                      : (darkMode ? 'cursor-pointer bg-[#131824] border-zinc-700 hover:border-indigo-500/50 hover:bg-[#1c2235]' : 'cursor-pointer bg-white border-zinc-200 hover:border-indigo-400/50 hover:bg-indigo-50')}
                    ${value === opt.value && !opt.disabled ? (darkMode ? 'ring-1 ring-indigo-500 bg-indigo-500/10 border-indigo-500' : 'ring-1 ring-indigo-500 bg-indigo-50 border-indigo-500') : ''}`}
                >
                  {opt.renderDropdown ? opt.renderDropdown : <span className={value === opt.value ? 'font-bold text-indigo-500' : ''}>{opt.label}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

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
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const getPreviousDayStr = (dateStr) => {
  const [y, m, d] = dateStr.split('-');
  const date = new Date(y, m - 1, d, 12, 0, 0);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const CustomTooltip = ({ active, payload, label, darkMode }) => {
  if (active && payload && payload.length) {
    return (
      <div className={`p-3 rounded-lg shadow-xl border ${darkMode ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-white border-zinc-200 text-zinc-900'}`}>
        <p className="text-xs font-semibold mb-1 opacity-70">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm font-bold" style={{ color: entry.color }}>
            {entry.name}: {entry.name === 'Ingresos' ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(entry.value) : `${entry.value} un.`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const SalesAreaChart = ({ sales, globalMonth, darkMode }) => {
  const [metric, setMetric] = useState('revenue');
  const formatCompact = (val) => new Intl.NumberFormat('es-AR', { notation: "compact", compactDisplay: "short", maximumFractionDigits: 1 }).format(val);

  const chartData = useMemo(() => {
    const map = {};
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const generateDays = (daysBack) => {
        const today = new Date();
        for (let i = daysBack - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const yStr = d.getFullYear();
            const mStr = String(d.getMonth() + 1).padStart(2, '0');
            const dayStr = String(d.getDate()).padStart(2, '0');
            const key = `${yStr}-${mStr}-${dayStr}`;
            map[key] = { key, name: `${dayStr}/${mStr}`, fullLabel: `${dayStr} de ${monthNames[d.getMonth()]}`, Ingresos: 0, Unidades: 0 };
        }
    };

    if (globalMonth === 'today') { generateDays(1); }
    else if (globalMonth === 'week') { generateDays(7); }
    else if (globalMonth === '15days') { generateDays(15); }
    else if (globalMonth === '30days') { generateDays(30); }
    else if (globalMonth !== 'all') {
      const [yStr, mStr] = globalMonth.split('-');
      const y = parseInt(yStr);
      const m = parseInt(mStr);
      const daysInMonth = new Date(y, m, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        const dayStr = String(i).padStart(2, '0');
        const key = `${yStr}-${mStr}-${dayStr}`;
        map[key] = { key, name: `${dayStr}/${mStr}`, fullLabel: `${i} de ${monthNames[m - 1]}`, Ingresos: 0, Unidades: 0 };
      }
    } else {
      if (!sales || sales.length === 0) return [];
      const dates = sales.map(s => s.date ? new Date(s.date) : new Date());
      const minDate = new Date(Math.min(...dates));
      const maxDate = new Date(Math.max(...dates));
      for (let d = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()); d <= maxDate; d.setDate(d.getDate() + 1)) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${day}`;
        map[key] = { key, name: `${day}/${m}`, fullLabel: `${day} de ${monthNames[d.getMonth()]}`, Ingresos: 0, Unidades: 0 };
      }
    }

    sales.forEach(s => {
      if(!s.date) return;
      const d = new Date(s.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (map[key]) {
        map[key].Ingresos += s.totalSaleRaw || 0;
        map[key].Unidades += s.quantity || 0;
      }
    });

    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
  }, [sales, globalMonth]);

  if (chartData.length === 0) return <div className="h-[300px] flex items-center justify-center text-sm font-medium opacity-50">No hay transacciones en este periodo.</div>;

  const themeColor = darkMode ? '#818cf8' : '#4f46e5'; 
  const gridColor = darkMode ? '#27272a' : '#e4e4e7';
  const textColor = darkMode ? '#71717a' : '#a1a1aa';

  return (
    <div className="w-full flex flex-col space-y-4">
      <div className="flex justify-end mb-1">
          <div className={`flex items-center p-1 rounded-lg border ${darkMode ? 'bg-[#0f1115] border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
              <button onClick={() => setMetric('revenue')} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${metric === 'revenue' ? (darkMode ? 'bg-zinc-800 text-white shadow-sm' : 'bg-white text-zinc-900 shadow-sm') : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>Ingresos</button>
              <button onClick={() => setMetric('quantity')} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${metric === 'quantity' ? (darkMode ? 'bg-zinc-800 text-white shadow-sm' : 'bg-white text-zinc-900 shadow-sm') : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>Unidades</button>
          </div>
      </div>
      
      <div className={`w-full h-[300px] p-2 rounded-xl border ${darkMode ? 'bg-[#0a0c10] border-zinc-800' : 'bg-white border-zinc-200'}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={themeColor} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={themeColor} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis dataKey="name" stroke={textColor} fontSize={12} tickLine={false} axisLine={false} dy={10} minTickGap={30} />
            <YAxis 
              stroke={textColor} fontSize={12} tickLine={false} axisLine={false} 
              tickFormatter={(value) => metric === 'revenue' ? formatCompact(value) : value} 
              width={60}
            />
            <RechartsTooltip content={<CustomTooltip darkMode={darkMode} />} cursor={{ stroke: textColor, strokeWidth: 1, strokeDasharray: '3 3' }} />
            <Area type="monotone" dataKey={metric === 'revenue' ? 'Ingresos' : 'Unidades'} stroke={themeColor} strokeWidth={3} fillOpacity={1} fill="url(#colorMetric)" activeDot={{ r: 6, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const CustomPieChart = ({ data, colors, darkMode }) => {
  if (!data || data.length === 0) return <div className="h-[160px] flex items-center justify-center text-sm font-medium opacity-50">Sin datos</div>;
  
  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <RechartsTooltip 
            contentStyle={{ backgroundColor: darkMode ? '#27272a' : '#fff', borderColor: darkMode ? '#3f3f46' : '#e4e4e7', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', color: darkMode ? '#fff' : '#000' }}
            itemStyle={{ color: darkMode ? '#fff' : '#000' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
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
  const [globalMonth, setGlobalMonth] = useState('30days'); 
  const [newBatchName, setNewBatchName] = useState('');
  const [newItem, setNewItem] = useState({ product: '', variant: '', costArs: '', initialStock: '' });
  const [newSale, setNewSale] = useState({ batchId: '', itemId: '', quantity: 1, unitPrice: '', shippingCost: 0, shippingPrice: 0, source: 'Instagram', isReseller: 'No', saleDate: getTodayDate() });
  const [newExpense, setNewExpense] = useState({ description: '', amount: '', batchId: '', date: getTodayDate() });
  
  const [selectedBatchStats, setSelectedBatchStats] = useState(null);
  const [hiddenSuggestions, setHiddenSuggestions] = useState({ products: [], variants: [] });

  // ESTADOS PARA FILTROS DE VENTAS
  const [salesSearch, setSalesSearch] = useState('');
  const [salesSort, setSalesSort] = useState({ key: 'createdAt', direction: 'desc' });

  // ESCUDOS PROTECTORES DE FECHAS
  const safeDateStr = (dateStr, options) => {
    if (!dateStr) return 'Sin fecha';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Fecha inv.';
    return d.toLocaleDateString(undefined, options);
  };

  const safeDateTime = (dateStr) => {
    if (!dateStr) return 0;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

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

  const periodOptions = useMemo(() => {
    const getLocalMonth = (isoString) => {
      if (!isoString) return '';
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    const months = new Set();
    sales.forEach(s => { if(s.date) months.add(getLocalMonth(s.date)); });
    expenses.forEach(e => { if(e.date) months.add(getLocalMonth(e.date)); });
    batches.forEach(b => { if(b.createdAt) months.add(getLocalMonth(b.createdAt)); });
    const sortedMonths = Array.from(months).filter(Boolean).sort().reverse();
    
    return [
      { value: 'today', label: 'Diario (Hoy)' },
      { value: 'week', label: 'Últimos 7 días' },
      { value: '15days', label: 'Últimos 15 días' },
      { value: '30days', label: 'Últimos 30 días' },
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
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const getRanges = (filter) => {
          let currentStart = null;
          let prevStart = null;
          let prevEnd = null;

          if (filter === 'today') {
              currentStart = todayStart;
              prevStart = new Date(todayStart); prevStart.setDate(prevStart.getDate() - 1);
              prevEnd = new Date(todayStart); prevEnd.setMilliseconds(-1);
          } else if (filter === 'week') {
              currentStart = new Date(todayStart); currentStart.setDate(currentStart.getDate() - 6);
              prevStart = new Date(currentStart); prevStart.setDate(prevStart.getDate() - 7);
              prevEnd = new Date(currentStart); prevEnd.setMilliseconds(-1);
          } else if (filter === '15days') {
              currentStart = new Date(todayStart); currentStart.setDate(currentStart.getDate() - 14);
              prevStart = new Date(currentStart); prevStart.setDate(prevStart.getDate() - 15);
              prevEnd = new Date(currentStart); prevEnd.setMilliseconds(-1);
          } else if (filter === '30days') {
              currentStart = new Date(todayStart); currentStart.setDate(currentStart.getDate() - 29);
              prevStart = new Date(currentStart); prevStart.setDate(prevStart.getDate() - 30);
              prevEnd = new Date(currentStart); prevEnd.setMilliseconds(-1);
          } else if (filter !== 'all') {
              const [y, m] = filter.split('-').map(Number);
              currentStart = new Date(y, m - 1, 1);
              prevStart = new Date(y, m - 2, 1);
              prevEnd = new Date(y, m - 1, 0, 23, 59, 59, 999);
          }
          return { currentStart, prevStart, prevEnd };
      };

      const { currentStart, prevStart, prevEnd } = getRanges(globalMonth);

      const isCurrentRange = (dateString) => {
          if (!dateString) return false;
          if (globalMonth === 'all') return true;
          const d = new Date(dateString);
          if (isNaN(d.getTime())) return false;
          if (globalMonth.includes('-')) { 
             return d.getFullYear() === currentStart.getFullYear() && d.getMonth() === currentStart.getMonth();
          }
          return d >= currentStart;
      };

      const isPrevRange = (dateString) => {
          if (!dateString || globalMonth === 'all' || !prevStart) return false;
          const d = new Date(dateString);
          if (isNaN(d.getTime())) return false;
          return d >= prevStart && d <= prevEnd;
      };

      const filteredSales = sales.filter(s => isCurrentRange(s.date));
      const filteredExpenses = expenses.filter(e => isCurrentRange(e.date));
      const filteredBatches = batches.filter(b => isCurrentRange(b.createdAt));

      let totalRevenue = 0, itemsSold = 0, totalShippingProfit = 0;
      const sourceCounts = {};
      const typeCounts = { Revendedor: 0, Final: 0 };

      filteredSales.forEach(s => {
          totalRevenue += s.totalSaleRaw || 0;
          itemsSold += s.quantity || 0;
          const saleShippingProfit = (s.totalSaleRaw || 0) - ((s.unitPrice || 0) * (s.quantity || 0));
          totalShippingProfit += saleShippingProfit;
          const src = s.source || 'Otro';
          sourceCounts[src] = (sourceCounts[src] || 0) + 1;
          if (s.isReseller === 'Si' || s.isReseller === true) typeCounts.Revendedor++; else typeCounts.Final++;
      });

      const totalInvestment = filteredBatches.reduce((accBatch, batch) => {
          return accBatch + (batch.items || []).reduce((accItem, item) => accItem + ((item.costArs || 0) * (item.initialStock || 0)), 0);
      }, 0);

      const totalGlobalExpenses = filteredExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
      const costOfSoldFiltered = filteredSales.reduce((acc, s) => acc + ((s.costArsAtSale || 0) * (s.quantity || 0)), 0);
      
      const grossProfit = totalRevenue - costOfSoldFiltered;
      const netProfit = grossProfit - totalGlobalExpenses;
      const cashBalance = totalRevenue - totalInvestment - totalGlobalExpenses;
      
      const currentStockValue = batches
          .filter(b => !b.finalizedAt)
          .reduce((accBatch, batch) => accBatch + (batch.items || []).reduce((accItem, item) => accItem + ((item.costArs || 0) * (item.currentStock || 0)), 0), 0);

      const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
      const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      let prevRevenue = null;
      let prevNetProfit = null;
      
      if (globalMonth !== 'all') {
          const prevSales = sales.filter(s => isPrevRange(s.date));
          const prevExpenses = expenses.filter(e => isPrevRange(e.date));
          let pRev = 0, pCostSold = 0;
          prevSales.forEach(s => { pRev += s.totalSaleRaw || 0; pCostSold += ((s.costArsAtSale || 0) * (s.quantity || 0)); });
          const pExp = prevExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
          prevRevenue = pRev;
          prevNetProfit = (pRev - pCostSold) - pExp;
      }

      let daysActive = 0;
      if (globalMonth === 'all') {
          if (batches.length > 0 && batches[0].createdAt) {
              const sortedBatches = [...batches].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
              const firstDate = new Date(sortedBatches[0].createdAt);
              if (!isNaN(firstDate.getTime())) {
                daysActive = Math.ceil(Math.abs(now - firstDate) / (1000 * 60 * 60 * 24)) || 1;
              } else { daysActive = 1; }
          } else {
              daysActive = 1;
          }
      } else if (globalMonth === 'today') daysActive = 1;
      else if (globalMonth === 'week') daysActive = 7;
      else if (globalMonth === '15days') daysActive = 15;
      else if (globalMonth === '30days') daysActive = 30;
      else {
          const [y, m] = globalMonth.split('-').map(Number);
          daysActive = (now.getFullYear() === y && now.getMonth() + 1 === m) ? now.getDate() : new Date(y, m, 0).getDate();
      }
      
      const dailyAvgItems = daysActive > 0 ? itemsSold / daysActive : 0;

      const uniqueDateStrs = [...new Set(filteredSales.filter(s => s.date).map(s => {
          const d = new Date(s.date);
          return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }).filter(Boolean))].sort((a, b) => b.localeCompare(a));

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

      const pieSourceData = Object.entries(sourceCounts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
      const pieTypeData = [
        { name: 'Consumidor', value: typeCounts.Final },
        { name: 'Revendedor', value: typeCounts.Revendedor }
      ].filter(d => d.value > 0);

      return {
          totalRevenue, totalInvestment, totalGlobalExpenses, grossProfit, grossMargin,
          totalShippingProfit, netProfit, netMargin, cashBalance, currentStockValue, 
          itemsSold, salesCount: filteredSales.length, sourceCounts, typeCounts, dailyAvgItems,
          daysActive, currentStreak, filteredSales, prevRevenue, prevNetProfit, pieSourceData, pieTypeData
      };
  }, [sales, batches, expenses, globalMonth]);

  const batchAnalysis = useMemo(() => {
    if (!selectedBatchStats) return null;
    const batch = batches.find(b => b.id === selectedBatchStats);
    if (!batch) return null;

    const batchSales = sales.filter(s => s.batchId === batch.id);
    const batchExpenses = expenses.filter(e => e.batchId === batch.id);
    let totalRevenue = 0, itemsSold = 0, totalShippingProfit = 0;
    const sourceCounts = {}, typeCounts = { Revendedor: 0, Final: 0 };

    batchSales.forEach(s => {
      totalRevenue += s.totalSaleRaw || 0;
      itemsSold += s.quantity || 0;
      const saleShippingProfit = (s.totalSaleRaw || 0) - ((s.unitPrice || 0) * (s.quantity || 0));
      totalShippingProfit += saleShippingProfit;
      const src = s.source || 'Otro';
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
      if (s.isReseller === 'Si' || s.isReseller === true) typeCounts.Revendedor++; else typeCounts.Final++;
    });

    const totalInvestment = (batch.items || []).reduce((acc, i) => acc + ((i.costArs || 0) * (i.initialStock || 0)), 0);
    const costOfSold = batchSales.reduce((acc, s) => acc + ((s.costArsAtSale || 0) * (s.quantity || 0)), 0);
    const grossProfit = totalRevenue - costOfSold; 
    const totalBatchExpenses = batchExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const netProfit = grossProfit - totalBatchExpenses;
    const cashBalance = totalRevenue - totalInvestment - totalBatchExpenses;
    
    const currentStockValue = batch.finalizedAt ? 0 : (batch.items || []).reduce((acc, item) => acc + ((item.costArs || 0) * (item.currentStock || 0)), 0);

    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    const createdDate = batch.createdAt ? new Date(batch.createdAt) : new Date();
    const endDate = batch.finalizedAt ? new Date(batch.finalizedAt) : new Date(); 
    const diffTime = Math.max(0, isNaN(endDate.getTime()) || isNaN(createdDate.getTime()) ? 0 : endDate - createdDate);
    const daysActive = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const dailyAvgItems = itemsSold / daysActive;
    const totalInitStock = (batch.items || []).reduce((acc, i) => acc + (i.initialStock || 0), 0);
    const progress = totalInitStock > 0 ? (itemsSold / totalInitStock) * 100 : 0;

    const uniqueDateStrs = [...new Set(batchSales.filter(s=>s.date).map(s => {
        const d = new Date(s.date);
        return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }).filter(Boolean))].sort((a, b) => b.localeCompare(a));

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

    const pieSourceData = Object.entries(sourceCounts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
    const pieTypeData = [
      { name: 'Consumidor', value: typeCounts.Final },
      { name: 'Revendedor', value: typeCounts.Revendedor }
    ].filter(d => d.value > 0);

    return { 
        batch, salesCount: batchSales.length, itemsSold, totalRevenue, totalInvestment, 
        grossProfit, grossMargin, totalShippingProfit, totalBatchExpenses, netProfit, netMargin, cashBalance, 
        progress, currentStockValue, sourceCounts, typeCounts, daysActive, dailyAvgItems, currentStreak,
        pieSourceData, pieTypeData 
    };
  }, [selectedBatchStats, sales, batches, expenses]);

  // EL CEREBRO DE LA TABLA VENTAS PROTEGIDO
  const processedSales = useMemo(() => {
    // Escudo #1: Ignoramos ventas vacías que hayan crasheado
    let result = [...sales].filter(s => s != null);

    if (salesSearch) {
      const lowerQuery = salesSearch.toLowerCase();
      result = result.filter(s => {
        const dateStrSafe = safeDateStr(s.date);
        return (
          (s.productName || '').toLowerCase().includes(lowerQuery) ||
          (s.batchName || '').toLowerCase().includes(lowerQuery) ||
          dateStrSafe.toLowerCase().includes(lowerQuery)
        );
      });
    }

    // Escudo #2: Ordenamiento con matemáticas protegidas
    result.sort((a, b) => {
      let valA, valB;
      
      switch (salesSort.key) {
        case 'date':
          valA = safeDateTime(a.date);
          valB = safeDateTime(b.date);
          break;
        case 'createdAt':
          valA = safeDateTime(a.createdAt || a.date);
          valB = safeDateTime(b.createdAt || b.date);
          break;
        case 'productName':
          valA = (a.productName || '').toLowerCase();
          valB = (b.productName || '').toLowerCase();
          break;
        case 'profit':
          valA = (a.totalSaleRaw || 0) - ((a.costArsAtSale || 0) * (a.quantity || 0));
          valB = (b.totalSaleRaw || 0) - ((b.costArsAtSale || 0) * (b.quantity || 0));
          break;
        case 'totalSaleRaw':
          valA = a.totalSaleRaw || 0;
          valB = b.totalSaleRaw || 0;
          break;
        default:
          valA = a[salesSort.key] || '';
          valB = b[salesSort.key] || '';
      }

      if (valA < valB) return salesSort.direction === 'asc' ? -1 : 1;
      if (valA > valB) return salesSort.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [sales, salesSearch, salesSort]);

  const toggleSort = (key) => {
    setSalesSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleExportSales = () => {
      const headers = ['Fecha', 'Lote', 'Producto', 'Variante', 'Cantidad', 'Precio Unitario', 'Total Venta', 'Costo Unitario', 'Ganancia Envio', 'Origen', 'Revendedor'];
      const rows = processedSales.map(s => [
          safeDateStr(s.date), s.batchName || '', s.productName || '', s.variant || '', 
          s.quantity || 0, s.unitPrice || 0, s.totalSaleRaw || 0, s.costArsAtSale || 0, 
          ((s.totalSaleRaw || 0) - ((s.unitPrice || 0) * (s.quantity || 0))), s.source || '', s.isReseller ? 'Si' : 'No'
      ]);
      exportToCSV('historial_ventas.csv', [headers, ...rows]);
      showToast('Historial descargado con éxito', 'success');
  };

  const handleExportBatches = () => {
      const headers = ['Lote', 'Fecha Creacion', 'Estado', 'Producto', 'Variante', 'Costo Unitario', 'Stock Inicial', 'Stock Actual'];
      const rows = [];
      batches.forEach(b => {
          if (!b.items || b.items.length === 0) {
              rows.push([b.name || '', safeDateStr(b.createdAt), b.finalizedAt ? 'Finalizado' : 'Activo', '', '', '', '', '']);
          } else {
              b.items.forEach(i => {
                  rows.push([b.name || '', safeDateStr(b.createdAt), b.finalizedAt ? 'Finalizado' : 'Activo', i.product || '', i.variant || '', i.costArs || 0, i.initialStock || 0, i.currentStock || 0]);
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
      createdAt: new Date().toISOString(),
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
    if (!newExpense.description || !newExpense.amount || !newExpense.date) return showToast('Completa descripción, fecha y monto', 'error');
    let batchName = 'General';
    if (newExpense.batchId) {
        const foundBatch = batches.find(b => b.id === newExpense.batchId);
        if (foundBatch) batchName = foundBatch.name;
    }
    
    const [y, m, d] = newExpense.date.split('-');
    const expenseDateStr = new Date(y, m - 1, d, 12, 0, 0).toISOString();

    await addDoc(collection(db, 'expenses'), { 
        date: expenseDateStr, description: newExpense.description, amount: parseFloat(newExpense.amount),
        batchId: newExpense.batchId || null, batchName: batchName
    });
    setNewExpense({ description: '', amount: '', batchId: '', date: getTodayDate() });
    showToast('Gasto asentado', 'success');
  };

  const handleDeleteExpense = async (id) => {
      await deleteDoc(doc(db, 'expenses', id));
      showToast('Gasto eliminado', 'success');
  }

  const handleLogin = (e) => { 
    e.preventDefault(); 
    const val = e.target.password.value; 
    if(val === '1717') { localStorage.setItem('028_user', 'Admin'); setUser('Admin'); showToast('Bienvenido', 'success'); } 
    else showToast('Contraseña incorrecta', 'error');
  };

  if (!user) return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-500 ${darkMode ? 'bg-[#0B0F19]' : 'bg-slate-50'}`}>
      <div className={`p-8 rounded-2xl shadow-xl w-full max-w-md text-center border ${darkMode ? 'bg-[#131824] border-zinc-800/80' : 'bg-white border-zinc-200'}`}>
        <div className="bg-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-600/30"><Package size={32} className="text-white" /></div>
        <h1 className={`text-3xl font-black mb-2 tracking-tight ${darkMode ? 'text-white' : 'text-zinc-900'}`}>028 IMPORT</h1>
        <p className="text-zinc-500 mb-8 text-xs font-semibold uppercase tracking-widest">Workspace Empresarial</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="password" name="password" placeholder="Clave de seguridad" className={`h-12 w-full border p-3.5 rounded-xl text-center font-bold text-sm outline-none transition-colors ${darkMode ? 'bg-[#0a0c10] border-zinc-800 text-white focus:border-indigo-500' : 'bg-zinc-50 border-zinc-200 focus:border-indigo-500 text-zinc-900'}`} autoFocus />
          <button className="h-12 w-full bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all text-sm shadow-md">Autenticar</button>
        </form>
      </div>
      <div className="mt-8 flex gap-4">
          <button onClick={() => setDarkMode(false)} className={`p-3 rounded-full border ${!darkMode ? 'bg-white shadow-sm border-zinc-200 text-indigo-600' : 'bg-transparent border-transparent text-zinc-600'}`}><Sun size={20}/></button>
          <button onClick={() => setDarkMode(true)} className={`p-3 rounded-full border ${darkMode ? 'bg-[#131824] shadow-sm border-zinc-800 text-indigo-400' : 'bg-transparent border-transparent text-zinc-400'}`}><Moon size={20}/></button>
      </div>
    </div>
  );

  if (configError) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 text-white">
      <div className="max-w-lg text-center space-y-4 border border-zinc-800 p-8 rounded-lg bg-[#131824]">
        <AlertTriangle size={48} className="mx-auto text-amber-500" />
        <h1 className="text-xl font-bold tracking-tight">Falta Configuración</h1>
        <p className="text-zinc-400 text-sm">Debes configurar las claves de Firebase en el código fuente.</p>
      </div>
    </div>
  );

  const TABS = [
      { id: 'home', icon: Activity, label: 'Inicio' }, 
      { id: 'sales', icon: ShoppingCart, label: 'Ventas' }, 
      { id: 'batches', icon: FolderOpen, label: 'Lotes' }, 
      { id: 'analysis', icon: BarChart3, label: 'Análisis' }, 
      { id: 'expenses', icon: Wallet, label: 'Gastos' }
  ];

  return (
    <div className={`flex h-screen overflow-hidden font-sans transition-colors duration-300 ${darkMode ? 'bg-[#0B0F19] text-zinc-100' : 'bg-slate-50 text-zinc-900'}`}>
      
      {/* TOASTS */}
      {toast && (
          <div className={`fixed bottom-24 md:bottom-8 right-4 md:right-8 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 z-50 border ${toast.type === 'error' ? 'bg-red-600/95 border-red-500 text-white' : 'bg-zinc-900/95 border-zinc-800 text-white'}`}>
             {toast.type === 'error' ? <XCircle size={18} className="text-red-200"/> : <CheckCircle size={18} className="text-emerald-400"/>}
             <span className="font-medium text-sm tracking-wide">{toast.message}</span>
          </div>
      )}

      {/* DATALISTS */}
      <datalist id="products-list">{uniqueProducts.map(p => <option key={p} value={p} />)}</datalist>
      <datalist id="variants-list">{uniqueVariants.map(v => <option key={v} value={v} />)}</datalist>

      {/* --- DESKTOP SIDEBAR --- */}
      <aside className={`hidden md:flex flex-col w-60 border-r flex-shrink-0 transition-colors z-20 ${darkMode ? 'bg-[#0f1115] border-zinc-800/80' : 'bg-white border-zinc-200 shadow-sm'}`}>
        <div className="p-5 pb-2 border-b dark:border-zinc-800/80">
            <div className="flex items-center gap-3 mb-5">
                <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-sm shadow-indigo-600/20"><Package size={20} strokeWidth={2.5} /></div>
                <div>
                    <h1 className="text-lg font-black tracking-tight leading-none">028 IMPORT</h1>
                    <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Workspace</p>
                </div>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto py-5 px-3 space-y-1 custom-scrollbar">
            <div className={`text-xs font-semibold px-3 mb-2 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Navegación</div>
            {TABS.map(tab => (
            <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id)} 
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 ${activeTab === tab.id ? (darkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-700') : (darkMode ? 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900')}`}
            >
                <tab.icon size={18} strokeWidth={activeTab === tab.id ? 2.5 : 2} /> {tab.label}
            </button>
            ))}
        </div>

        <div className="p-4 border-t dark:border-zinc-800/80 space-y-2">
            {isOffline && (
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-red-500 bg-red-500/10 p-2 rounded-lg mb-2">
                    <WifiOff size={14}/> Modo Offline
                </div>
            )}
            <div className={`flex items-center justify-between p-2 rounded-lg border ${darkMode ? 'bg-[#131824] border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs ${darkMode ? 'bg-indigo-900/50 text-indigo-400' : 'bg-indigo-100 text-indigo-700'}`}>{user?.charAt(0)}</div>
                    <div className="flex flex-col items-start">
                        <span className="text-xs font-bold">{user}</span>
                        <span className={`text-[10px] font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Admin</span>
                    </div>
                </div>
                <button onClick={() => { localStorage.removeItem('028_user'); setUser(null); }} className={`p-2 rounded-md transition-colors ${darkMode ? 'text-zinc-500 hover:bg-red-500/10 hover:text-red-400' : 'text-zinc-400 hover:bg-red-50 hover:text-red-600'}`} title="Cerrar sesión">
                    <LogOut size={16} />
                </button>
            </div>
            <button onClick={() => setDarkMode(!darkMode)} className={`w-full flex items-center justify-center gap-2 h-10 rounded-lg font-medium text-sm border transition-colors ${darkMode ? 'border-zinc-800 hover:bg-zinc-800/50 text-zinc-300' : 'border-zinc-200 hover:bg-zinc-50 text-zinc-600'}`}>
                {darkMode ? <><Sun size={14}/> Modo Claro</> : <><Moon size={14}/> Modo Oscuro</>}
            </button>
        </div>
      </aside>

      {/* --- MOBILE BOTTOM NAV --- */}
      <nav className={`md:hidden fixed bottom-0 w-full z-40 border-t pb-safe transition-colors ${darkMode ? 'bg-[#0f1115]/90 backdrop-blur-xl border-zinc-800/80 text-zinc-400' : 'bg-white/90 backdrop-blur-xl border-zinc-200 text-zinc-500'}`}>
          <div className="flex justify-around items-center h-16 px-2">
            {TABS.map(tab => (
              <button 
                  key={tab.id} 
                  onClick={() => setActiveTab(tab.id)} 
                  className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${activeTab === tab.id ? (darkMode ? 'text-indigo-400' : 'text-indigo-600') : 'hover:text-zinc-900 dark:hover:text-zinc-200'}`}
              >
                  <tab.icon size={20} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
                  <span className={`text-[10px] font-medium ${activeTab === tab.id ? 'font-bold' : ''}`}>{tab.label}</span>
              </button>
            ))}
          </div>
      </nav>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 overflow-y-auto relative w-full custom-scrollbar">
        
        {/* MOBILE TOP HEADER */}
        <header className={`md:hidden sticky top-0 z-30 flex justify-between items-center px-4 py-3 border-b backdrop-blur-xl ${darkMode ? 'bg-[#0B0F19]/80 border-zinc-800/80' : 'bg-slate-50/80 border-zinc-200'}`}>
            <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-1.5 rounded-md text-white"><Package size={16} /></div>
                <h1 className="font-bold tracking-tight text-base">028 IMPORT</h1>
            </div>
            <div className="flex items-center gap-3">
                {isOffline && <WifiOff size={16} className="text-red-500" />}
                <button onClick={() => setDarkMode(!darkMode)} className={darkMode ? 'text-zinc-400' : 'text-zinc-500'}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            </div>
        </header>

        <div className="p-4 md:p-8 pb-24 md:pb-8 max-w-6xl mx-auto space-y-6">
            
            {/* HEADER DE LA PÁGINA (SOLO DESKTOP) */}
            <div className="hidden md:flex justify-between items-end mb-6">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">{TABS.find(t => t.id === activeTab)?.label}</h2>
                    <p className={`text-sm font-medium mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Gestiona y analiza tus datos de negocio.</p>
                </div>
            </div>

            {/* --- PESTAÑA INICIO --- */}
            {activeTab === 'home' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    <div className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${darkMode ? 'bg-[#131824] border-zinc-800/80' : 'bg-white border-zinc-200'}`}>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-500"><Calendar size={20}/></div>
                            <div>
                                <h3 className="font-bold text-sm">Periodo de Análisis</h3>
                                <p className={`text-xs ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Selecciona el rango de tiempo a evaluar</p>
                            </div>
                        </div>
                        <div className="w-full sm:w-64">
                            <Select 
                                darkMode={darkMode}
                                value={globalMonth} 
                                onChange={e => setGlobalMonth(e.target.value)}
                                options={periodOptions}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <MetricCard 
                            color="blue"
                            darkMode={darkMode} title={`Ingresos ${globalMonth === 'all' ? 'Totales' : ''}`} value={formatMoney(globalAnalysis.totalRevenue)} subtitle="Bruto facturado" icon={DollarSign}
                            trend={globalAnalysis.prevRevenue !== null && globalAnalysis.prevRevenue > 0 ? (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${globalAnalysis.totalRevenue >= globalAnalysis.prevRevenue ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                                    {globalAnalysis.totalRevenue >= globalAnalysis.prevRevenue ? '↑' : '↓'} {Math.abs(((globalAnalysis.totalRevenue - globalAnalysis.prevRevenue)/globalAnalysis.prevRevenue)*100).toFixed(0)}%
                                </span>
                            ) : null}
                        />
                        <MetricCard color="emerald" darkMode={darkMode} title="Ganancia Bruta" value={formatMoney(globalAnalysis.grossProfit)} subtitle="Ingresos - Costo Mercadería" icon={TrendingUp} trend={<span className="text-xs font-bold px-2 py-0.5 rounded-md bg-white/50 text-zinc-600 dark:bg-black/50 dark:text-zinc-400">{formatPercent(globalAnalysis.grossMargin)}</span>} />
                        <MetricCard color="rose" darkMode={darkMode} title="Gastos Fijos" value={formatMoney(globalAnalysis.totalGlobalExpenses)} subtitle="Logística y operativos" icon={Wallet} />
                        <MetricCard 
                            color="violet"
                            darkMode={darkMode} title="Beneficio Neto" value={formatMoney(globalAnalysis.netProfit)} subtitle="Capital libre" icon={Award}
                            trend={
                                <div className="flex gap-1 items-center">
                                    {globalAnalysis.prevNetProfit !== null && globalAnalysis.prevNetProfit > 0 && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${globalAnalysis.netProfit >= globalAnalysis.prevNetProfit ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                                            {globalAnalysis.netProfit >= globalAnalysis.prevNetProfit ? '↑' : '↓'} {Math.abs(((globalAnalysis.netProfit - globalAnalysis.prevNetProfit)/globalAnalysis.prevNetProfit)*100).toFixed(0)}%
                                        </span>
                                    )}
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/50 text-violet-700 dark:bg-black/50 dark:text-violet-400`}>{formatPercent(globalAnalysis.netMargin)}</span>
                                </div>
                            }
                        />
                        <MetricCard color="amber" darkMode={darkMode} title="Inversión" value={formatMoney(globalAnalysis.totalInvestment)} subtitle="Capital apostado" icon={Box} />
                        <MetricCard color="indigo" darkMode={darkMode} title="Valor Inventario" value={formatMoney(globalAnalysis.currentStockValue)} subtitle="Activo retenido actual" icon={Package} />
                        <MetricCard color="emerald" darkMode={darkMode} title="Flujo Efectivo" value={formatMoney(globalAnalysis.cashBalance)} subtitle="Diferencia real en caja" icon={Activity} />
                        <MetricCard 
                            color="amber"
                            darkMode={darkMode} title="Promedio Ventas" value={globalAnalysis.dailyAvgItems.toFixed(1)} subtitle="Unidades por día activo" icon={Flame}
                            trend={globalAnalysis.currentStreak > 0 ? <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-white/50 text-orange-600 dark:bg-black/50 dark:text-orange-400 flex items-center gap-1"><Flame size={12}/> {globalAnalysis.currentStreak} días</span> : null}
                        />
                    </div>

                    <Card darkMode={darkMode} className="p-0 overflow-hidden">
                        <div className={`p-5 border-b flex items-center gap-3 ${darkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
                            <div className="bg-indigo-500/10 text-indigo-500 p-2 rounded-lg"><TrendingUp size={18}/></div>
                            <h3 className="font-bold tracking-tight text-sm">Evolución de Ingresos</h3>
                        </div>
                        <div className="p-5">
                            <SalesAreaChart sales={globalAnalysis.filteredSales} globalMonth={globalMonth} darkMode={darkMode} />
                        </div>
                    </Card>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card darkMode={darkMode} className="p-0 overflow-hidden">
                          <div className={`p-5 border-b flex items-center gap-3 ${darkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
                              <div className="bg-indigo-500/10 text-indigo-500 p-2 rounded-lg"><Users size={18}/></div>
                              <h3 className="font-bold tracking-tight text-sm">Tráfico por Canales</h3>
                          </div>
                          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                            <CustomPieChart data={globalAnalysis.pieSourceData} colors={['#6366f1', '#a855f7', '#ec4899', '#14b8a6', '#f59e0b']} darkMode={darkMode} />
                            <div className="space-y-3">
                              {globalAnalysis.pieSourceData.map((d, i) => {
                                const colors = ['#6366f1', '#a855f7', '#ec4899', '#14b8a6', '#f59e0b'];
                                return (
                                  <div key={d.name} className="flex justify-between items-center text-sm">
                                    <div className="flex items-center gap-2">
                                      <div className="w-3 h-3 rounded-full" style={{backgroundColor: colors[i % colors.length]}}></div>
                                      <span className="font-medium">{d.name}</span>
                                    </div>
                                    <span className="font-bold text-zinc-500">{d.value}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </Card>

                        <Card darkMode={darkMode} className="p-0 overflow-hidden">
                          <div className={`p-5 border-b flex items-center gap-3 ${darkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
                              <div className="bg-indigo-500/10 text-indigo-500 p-2 rounded-lg"><BarChart3 size={18}/></div>
                              <h3 className="font-bold tracking-tight text-sm">Segmentación B2B / B2C</h3>
                          </div>
                          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                            <CustomPieChart data={globalAnalysis.pieTypeData} colors={['#10b981', '#6366f1']} darkMode={darkMode} />
                            <div className="space-y-3">
                               <div className="flex justify-between items-center text-sm">
                                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"></div><span className="font-medium">Consumidor</span></div>
                                  <span className="font-bold text-zinc-500">{globalAnalysis.typeCounts.Final}</span>
                               </div>
                               <div className="flex justify-between items-center text-sm">
                                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-indigo-500"></div><span className="font-medium">Revendedor</span></div>
                                  <span className="font-bold text-zinc-500">{globalAnalysis.typeCounts.Revendedor}</span>
                               </div>
                            </div>
                          </div>
                        </Card>
                    </div>
                </div>
            )}

            {/* --- PESTAÑA VENTAS (CON BÚSQUEDA Y ORDENAMIENTO SEGUROS) --- */}
            {activeTab === 'sales' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 animate-in fade-in duration-300">
                
                {/* Columna Izquierda: Formulario Fijo */}
                <div className="lg:col-span-4">
                    <div className="sticky top-6 space-y-4">
                        <Card darkMode={darkMode} className="p-5">
                            <h2 className="text-base font-bold mb-5 flex items-center gap-2"><ShoppingCart size={18} className="text-indigo-500"/> Registrar Ingreso</h2>
                            <div className="space-y-4">
                              <div>
                                  <Input darkMode={darkMode} label="Fecha de Operación" type="date" value={newSale.saleDate} onChange={e => setNewSale({...newSale, saleDate: e.target.value})} />
                              </div>
                              <div className="space-y-3 pt-3 border-t dark:border-zinc-800">
                                    <CustomSelect 
                                        darkMode={darkMode} 
                                        label="1. Carpeta de Origen" 
                                        value={newSale.batchId} 
                                        onChange={e => setNewSale({...newSale, batchId: e.target.value, itemId: ''})} 
                                        options={batches.map(b => ({
                                            value: b.id, 
                                            label: b.name || 'Sin nombre',
                                            renderDropdown: (
                                                <div className="flex items-center justify-between w-full">
                                                    <span className="font-semibold truncate">{b.name || 'Sin nombre'}</span>
                                                    {b.finalizedAt && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-500/20 text-zinc-500 ml-2">Archivado</span>}
                                                </div>
                                            )
                                        }))} 
                                    />
                                    
                                    {newSale.batchId && (
                                        <div className="animate-in slide-in-from-top-2">
                                           <CustomSelect 
                                              darkMode={darkMode} 
                                              label="2. Artículo Vendido" 
                                              value={newSale.itemId} 
                                              onChange={e => setNewSale({...newSale, itemId: e.target.value})} 
                                              options={(batches.find(b => b.id === newSale.batchId)?.items || []).map(item => ({
                                                  value: item.id, 
                                                  label: `${item.product || 'Desconocido'} - ${item.variant || ''} (${item.currentStock || 0})`, 
                                                  disabled: (item.currentStock || 0) <= 0,
                                                  renderDropdown: (
                                                      <div className="flex flex-col w-full gap-1">
                                                          <div className="flex justify-between items-start">
                                                              <span className={`font-bold truncate ${newSale.itemId === item.id ? 'text-indigo-500' : ''}`}>{item.product || 'Desconocido'}</span>
                                                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-md whitespace-nowrap ml-2 ${(item.currentStock || 0) > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                                                  Disp: {item.currentStock || 0}
                                                              </span>
                                                          </div>
                                                          {item.variant && <span className="text-xs opacity-60">{item.variant}</span>}
                                                      </div>
                                                  )
                                              }))} 
                                          />
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-3">
                                        <Input darkMode={darkMode} label="Cantidad" type="number" value={newSale.quantity} onChange={e => setNewSale({...newSale, quantity: e.target.value})} />
                                        <Input darkMode={darkMode} label="Precio Un." type="number" symbol="$" value={newSale.unitPrice} onChange={e => setNewSale({...newSale, unitPrice: e.target.value})} />
                                    </div>
                              </div>
                              
                              <div className={`p-3 rounded-lg border grid grid-cols-2 gap-3 ${darkMode ? 'bg-[#0a0c10] border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                                  <Input darkMode={darkMode} label="Costo Envío" type="number" symbol="$" value={newSale.shippingCost} onChange={e => setNewSale({...newSale, shippingCost: e.target.value})} />
                                  <Input darkMode={darkMode} label="Cobro Envío" type="number" symbol="$" value={newSale.shippingPrice} onChange={e => setNewSale({...newSale, shippingPrice: e.target.value})} />
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                  <Select darkMode={darkMode} label="Canal" value={newSale.source} onChange={e => setNewSale({...newSale, source: e.target.value})} options={[{value:'Instagram', label:'Instagram'}, {value:'Whatsapp', label:'Whatsapp'}, {value:'Personal', label:'Personal'}, {value:'Web', label:'Web'}]} />
                                  <Select darkMode={darkMode} label="Cliente" value={newSale.isReseller} onChange={e => setNewSale({...newSale, isReseller: e.target.value})} options={[{value:'No', label:'Consumidor'}, {value:'Si', label:'Revendedor'}]} />
                              </div>

                              <Button darkMode={darkMode} onClick={handleAddSale} className="w-full mt-4">Procesar Venta</Button>
                            </div>
                        </Card>
                    </div>
                </div>

                {/* Columna Derecha: Historial con Filtros */}
                <div className="lg:col-span-8">
                  <Card darkMode={darkMode} className="h-full flex flex-col p-0 overflow-hidden border-zinc-200 dark:border-zinc-800">
                    <div className={`p-4 border-b flex flex-col sm:flex-row justify-between gap-4 sm:items-center ${darkMode ? 'bg-[#131824] border-zinc-800' : 'bg-white border-zinc-200'}`}>
                        <h3 className="font-bold text-base flex-shrink-0">Libro de Ventas</h3>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <div className="flex-1 sm:w-64">
                                <Input 
                                  darkMode={darkMode} 
                                  type="search" 
                                  placeholder="Buscar producto, lote o fecha..." 
                                  value={salesSearch}
                                  onChange={(e) => setSalesSearch(e.target.value)}
                                />
                            </div>
                            <Button darkMode={darkMode} onClick={handleExportSales} variant="outline" className="h-10 px-3 flex-shrink-0" title="Exportar CSV"><Download size={16}/></Button>
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto flex-1 h-[700px] custom-scrollbar">
                      <table className="w-full text-left text-sm border-collapse">
                          <thead className={`sticky top-0 z-10 text-xs font-semibold ${darkMode ? 'bg-[#0f1115] text-zinc-400 border-b border-zinc-800 shadow-sm' : 'bg-zinc-50 text-zinc-500 border-b border-zinc-200 shadow-sm'}`}>
                              <tr>
                                <th className="px-4 py-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => toggleSort('createdAt')}>
                                  <div className="flex items-center gap-1">Registro <ArrowUpDown size={12} className={salesSort.key === 'createdAt' ? 'text-indigo-500' : 'opacity-30'}/></div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => toggleSort('productName')}>
                                  <div className="flex items-center gap-1">Operación <ArrowUpDown size={12} className={salesSort.key === 'productName' ? 'text-indigo-500' : 'opacity-30'}/></div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-emerald-500" onClick={() => toggleSort('profit')}>
                                  <div className="flex items-center gap-1">Neto (Ítem) <ArrowUpDown size={12} className={salesSort.key === 'profit' ? 'text-indigo-500' : 'opacity-30'}/></div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => toggleSort('totalSaleRaw')}>
                                  <div className="flex items-center gap-1">Total Fac. <ArrowUpDown size={12} className={salesSort.key === 'totalSaleRaw' ? 'text-indigo-500' : 'opacity-30'}/></div>
                                </th>
                                <th className="px-4 py-3"></th>
                              </tr>
                          </thead>
                          <tbody className={`divide-y ${darkMode ? 'divide-zinc-800/80' : 'divide-zinc-100'}`}>
                            {processedSales.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-sm font-medium opacity-50 italic">No se encontraron ventas con esos filtros.</td></tr>}
                            {processedSales.map(s => {
                              const itemProfit = (s.totalSaleRaw || 0) - ((s.costArsAtSale || 0) * (s.quantity || 0));
                              return (
                                <tr key={s.id || Math.random()} className={`transition-colors group ${darkMode ? 'hover:bg-[#131824]' : 'hover:bg-zinc-50'}`}>
                                  <td className={`px-4 py-3 text-xs font-medium whitespace-nowrap ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                      {safeDateStr(s.date, {month:'short', day:'numeric'})}
                                  </td>
                                  <td className="px-4 py-3">
                                      <div className="font-semibold text-sm">{s.quantity || 0}x {s.productName || 'Sin nombre'} <span className="font-normal opacity-70 ml-1">{s.variant || ''}</span></div>
                                      <div className={`text-xs font-medium mt-0.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Lote: {s.batchName || 'S/N'}</div>
                                  </td>
                                  <td className="px-4 py-3 font-medium text-emerald-500 text-sm">{formatMoney(itemProfit)}</td>
                                  <td className="px-4 py-3 font-bold font-mono tracking-tight">{formatMoney(s.totalSaleRaw || 0)}</td>
                                  <td className="px-4 py-3 text-right">
                                      <button onClick={() => handleDeleteSale(s)} className={`p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${darkMode ? 'text-zinc-500 hover:bg-red-500/10 hover:text-red-400' : 'text-zinc-400 hover:bg-red-50 hover:text-red-600'}`}><Trash2 size={16} /></button>
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

            {/* --- PESTAÑA LOTES --- */}
            {activeTab === 'batches' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <Card darkMode={darkMode} className="p-0 overflow-hidden">
                  <div className={`p-5 border-b flex flex-col md:flex-row justify-between md:items-center gap-4 ${darkMode ? 'bg-[#131824] border-zinc-800' : 'bg-white border-zinc-200'}`}>
                      <div>
                          <h2 className="text-xl font-bold mb-1">Inventario de Lotes</h2>
                          <p className={`text-sm ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Administra tus importaciones y catálogos de productos.</p>
                      </div>
                      <div className="flex gap-3 items-end w-full md:w-auto">
                        <div className="flex-1 md:w-64"><Input darkMode={darkMode} placeholder="Nombre del nuevo lote..." value={newBatchName} onChange={e => setNewBatchName(e.target.value)} /></div>
                        <Button darkMode={darkMode} onClick={handleCreateBatch} className="shrink-0"><Plus size={16}/> Crear Lote</Button>
                      </div>
                  </div>
                  <div className={`px-5 py-3 flex justify-end bg-zinc-50 dark:bg-[#0a0c10]`}>
                      <Button darkMode={darkMode} onClick={handleExportBatches} variant="outline" className="h-9"><Download size={14}/> Bajar CSV Completo</Button>
                  </div>
                </Card>

                <div className="grid grid-cols-1 gap-4">
                  {batches.map((b) => (
                    <Card key={b.id} darkMode={darkMode} className={`p-0 overflow-hidden transition-all duration-300 ${expandedBatchId === b.id ? 'ring-2 ring-indigo-500/50 border-transparent' : ''}`}>
                      <div className={`p-5 flex justify-between items-center cursor-pointer transition-colors ${darkMode ? 'hover:bg-[#1a1f2e]' : 'hover:bg-zinc-50'}`} onClick={() => setExpandedBatchId(expandedBatchId === b.id ? null : b.id)}>
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 flex items-center justify-center rounded-xl ${b.finalizedAt ? (darkMode ? 'bg-emerald-500/10 text-emerald-500' : 'bg-emerald-100 text-emerald-600') : (darkMode ? 'bg-indigo-500/10 text-indigo-500' : 'bg-indigo-100 text-indigo-600')}`}>
                                <FolderOpen size={24} strokeWidth={2} />
                            </div>
                            <div>
                                <h3 className={`font-bold text-base ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>{b.name || 'Sin nombre'}</h3>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className={`text-xs font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>{(b.items || []).length} Ítems</span>
                                    <span className="text-zinc-300 dark:text-zinc-700">•</span>
                                    <span className={`text-xs font-bold ${b.finalizedAt ? (darkMode ? 'text-zinc-500' : 'text-zinc-500') : (darkMode ? 'text-emerald-400' : 'text-emerald-600')}`}>{b.finalizedAt ? 'Archivado' : 'En Venta'}</span>
                                </div>
                            </div>
                        </div>
                        <div className={`p-2 rounded-full transition-colors ${darkMode ? 'text-zinc-500 bg-[#0f1115]' : 'text-zinc-400 bg-zinc-100'}`}>
                            {expandedBatchId === b.id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                        </div>
                      </div>
                      
                      {expandedBatchId === b.id && (
                        <div className={`border-t animate-in slide-in-from-top-2 ${darkMode ? 'border-zinc-800 bg-[#0f1115]' : 'border-zinc-200 bg-zinc-50/50'}`}>
                          
                          {/* Agregar Item Form */}
                          <div className={`p-5 m-5 rounded-xl border border-dashed ${darkMode ? 'border-zinc-700 bg-[#131824]' : 'border-zinc-300 bg-white'}`}>
                            <h4 className={`text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}><Plus size={14}/> Agregar Mercadería</h4>
                            <div className="grid grid-cols-2 md:grid-cols-12 gap-3 items-end">
                              <div className="col-span-2 md:col-span-4"><Input darkMode={darkMode} list="products-list" label="Producto" placeholder="Ej: iPhone 15" value={newItem.product} onChange={e => setNewItem({...newItem, product: e.target.value})} /></div>
                              <div className="col-span-2 md:col-span-3"><Input darkMode={darkMode} list="variants-list" label="Variante" placeholder="Ej: 128GB Black" value={newItem.variant} onChange={e => setNewItem({...newItem, variant: e.target.value})} /></div>
                              <div className="col-span-1 md:col-span-2"><Input darkMode={darkMode} label="Costo ($)" type="number" value={newItem.costArs} onChange={e => setNewItem({...newItem, costArs: e.target.value})} /></div>
                              <div className="col-span-1 md:col-span-1"><Input darkMode={darkMode} label="Cant." type="number" value={newItem.initialStock} onChange={e => setNewItem({...newItem, initialStock: e.target.value})} /></div>
                              <div className="col-span-2 md:col-span-2"><Button darkMode={darkMode} onClick={() => handleAddItemToBatch(b.id)} className="w-full">Añadir</Button></div>
                            </div>
                          </div>

                          {/* Tabla de Items */}
                          <table className="w-full text-left text-sm border-t dark:border-zinc-800">
                            <thead className={`text-xs font-semibold ${darkMode ? 'bg-[#131824] text-zinc-500' : 'bg-zinc-100 text-zinc-500'}`}>
                                <tr><th className="px-5 py-3">Descripción del Artículo</th><th className="px-5 py-3">Costo Un.</th><th className="px-5 py-3">Disponibilidad</th><th className="px-5 py-3 text-right"></th></tr>
                            </thead>
                            <tbody className={`divide-y ${darkMode ? 'divide-zinc-800/50' : 'divide-zinc-200'}`}>
                              {(b.items || []).length === 0 && <tr><td colSpan="4" className="p-8 text-center text-sm font-medium opacity-50 italic">La carpeta está vacía.</td></tr>}
                              {(b.items || []).map((item, idx) => (
                                <tr key={idx} className={`transition-colors group ${darkMode ? 'hover:bg-[#131824]' : 'hover:bg-white'}`}>
                                  <td className="px-5 py-3">
                                      <div className="font-semibold text-sm">{item.product || 'Sin nombre'}</div>
                                      <div className={`text-xs font-medium mt-0.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>{item.variant || ''}</div>
                                  </td>
                                  <td className="px-5 py-3 font-mono font-medium text-sm text-zinc-500">{formatMoney(item.costArs)}</td>
                                  <td className="px-5 py-3">
                                      <div className="flex items-center gap-2">
                                          <div className={`h-2 w-16 rounded-full overflow-hidden ${darkMode ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
                                              <div className={`h-full rounded-full ${(item.currentStock || 0) === 0 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{width: `${((item.currentStock || 0)/(item.initialStock || 1))*100}%`}}></div>
                                          </div>
                                          <span className="font-bold text-xs">{item.currentStock || 0} <span className="opacity-50 font-normal">/ {item.initialStock || 0}</span></span>
                                      </div>
                                  </td>
                                  <td className="px-5 py-3 text-right">
                                      <button onClick={() => handleDeleteItemFromBatch(b.id, item.id)} className={`p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${darkMode ? 'text-zinc-500 hover:bg-red-500/10 hover:text-red-400' : 'text-zinc-400 hover:bg-red-50 hover:text-red-600'}`}><Trash2 size={16} /></button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          
                          <div className={`p-4 flex justify-end border-t ${darkMode ? 'border-zinc-800 bg-[#0a0c10]' : 'border-zinc-200 bg-zinc-100'}`}>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteBatch(b.id); }} className={`text-sm font-semibold flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${darkMode ? 'text-red-500 hover:bg-red-500/10' : 'text-red-600 hover:bg-red-50'}`}><Trash2 size={16}/> Eliminar Carpeta Definitivamente</button>
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* --- PESTAÑA ANÁLISIS DE LOTE --- */}
            {activeTab === 'analysis' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <Card darkMode={darkMode} className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
                        <div>
                            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2"><BarChart3 size={20} className="text-indigo-500"/> Auditoría de Lotes</h2>
                            <p className={`text-sm font-medium mt-1 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Selecciona una importación para ver su rendimiento exacto.</p>
                        </div>
                        <div className="w-full md:w-80">
                            <Select
                                darkMode={darkMode}
                                onChange={(e) => setSelectedBatchStats(e.target.value)}
                                value={selectedBatchStats || ''}
                                options={[{value: '', label: '-- Selecciona un lote de la lista --'}, ...batches.map(b => ({value: b.id, label: `${b.name || 'Sin nombre'} ${b.finalizedAt ? '(Archivado)' : ''}`}))]}
                            />
                        </div>
                    </div>
                </Card>

                {batchAnalysis ? (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4">
                       <div className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${batchAnalysis.batch.finalizedAt ? (darkMode ? 'border-zinc-800 bg-[#0f1115]' : 'border-zinc-300 bg-zinc-100') : (darkMode ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-indigo-200 bg-indigo-50')}`}>
                          <div>
                            <h3 className="font-bold text-sm flex items-center gap-2">
                                <Settings size={18} className={darkMode ? 'text-zinc-400' : 'text-zinc-500'}/> Estado Operativo: 
                                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${batchAnalysis.batch.finalizedAt ? 'bg-zinc-500/20 text-zinc-500' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'}`}>
                                    {batchAnalysis.batch.finalizedAt ? "Archivado" : "Activo"}
                                </span>
                            </h3>
                            {batchAnalysis.batch.finalizedAt && <div className={`text-xs font-medium mt-2 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Se marcó como agotado el {safeDateStr(batchAnalysis.batch.finalizedAt)}</div>}
                          </div>

                          {batchAnalysis.batch.finalizedAt ? (
                              <Button darkMode={darkMode} onClick={() => handleUpdateBatchStatus(batchAnalysis.batch.id, false)} variant="outline">🔄 Reabrir Operación</Button>
                              ) : (
                              <div className="flex gap-3 items-end w-full sm:w-auto">
                                  <Input darkMode={darkMode} type="date" label="Cierre Manual" value={manualFinalizeDate} onChange={e => setManualFinalizeDate(e.target.value)} />
                                  <Button darkMode={darkMode} onClick={() => handleUpdateBatchStatus(batchAnalysis.batch.id, true)}>Archivar Lote</Button>
                              </div>
                          )}
                       </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                          <MetricCard color="amber" darkMode={darkMode} title="Inversión Base" value={formatMoney(batchAnalysis.totalInvestment)} subtitle="Costo original" icon={Box} />
                          <MetricCard color="blue" darkMode={darkMode} title="Retorno Bruto" value={formatMoney(batchAnalysis.totalRevenue)} subtitle="Ventas totales" icon={DollarSign} />
                          <MetricCard color="rose" darkMode={darkMode} title="Gastos Adicionales" value={formatMoney(batchAnalysis.totalBatchExpenses)} subtitle="Costos operativos" icon={Wallet} />
                          
                          <MetricCard 
                              color="emerald" darkMode={darkMode} title="Flujo de Caja Real" value={formatMoney(batchAnalysis.cashBalance)} subtitle="Liquidez generada" icon={Activity} 
                          />

                          <MetricCard color="indigo" darkMode={darkMode} title="Stock Remanente" value={formatMoney(batchAnalysis.currentStockValue)} subtitle="Activo sin liquidar" icon={Package} />
                          
                          <MetricCard 
                              color="emerald" darkMode={darkMode} title="Beneficio Bruto" value={formatMoney(batchAnalysis.grossProfit)} subtitle="Previo a gastos" icon={TrendingUp}
                              trend={<span className="text-xs font-bold px-2 py-0.5 rounded-md bg-white/50 text-emerald-700 dark:bg-black/50 dark:text-emerald-400">{formatPercent(batchAnalysis.grossMargin)}</span>}
                          />

                            <MetricCard color="amber" darkMode={darkMode} title="Resultado Envíos" value={formatMoney(batchAnalysis.totalShippingProfit)} subtitle="Cobrado vs Pagado" icon={Truck} />
                          
                          <MetricCard 
                              color="violet" darkMode={darkMode} title="Beneficio Neto" value={formatMoney(batchAnalysis.netProfit)} subtitle="Utilidad limpia" icon={Award}
                              trend={<span className={`text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/50 text-violet-700 dark:bg-black/50 dark:text-violet-400`}>{formatPercent(batchAnalysis.netMargin)}</span>}
                          />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card darkMode={darkMode} className="p-0 overflow-hidden">
                          <div className={`p-5 border-b flex items-center gap-3 ${darkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
                              <div className="bg-indigo-500/10 text-indigo-500 p-2 rounded-lg"><Users size={18}/></div>
                              <h3 className="font-bold tracking-tight text-sm">Distribución de Canales</h3>
                          </div>
                          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                            <CustomPieChart data={batchAnalysis.pieSourceData} colors={['#6366f1', '#a855f7', '#ec4899', '#14b8a6', '#f59e0b']} darkMode={darkMode} />
                            <div className="space-y-3">
                              {batchAnalysis.pieSourceData.map((d, i) => {
                                const colors = ['#6366f1', '#a855f7', '#ec4899', '#14b8a6', '#f59e0b'];
                                return (
                                  <div key={d.name} className="flex justify-between items-center text-sm">
                                    <div className="flex items-center gap-2">
                                      <div className="w-3 h-3 rounded-full" style={{backgroundColor: colors[i % colors.length]}}></div>
                                      <span className="font-medium">{d.name}</span>
                                    </div>
                                    <span className="font-bold text-zinc-500">{d.value}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </Card>

                        <Card darkMode={darkMode} className="p-0 overflow-hidden">
                          <div className={`p-5 border-b flex items-center gap-3 ${darkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
                              <div className="bg-indigo-500/10 text-indigo-500 p-2 rounded-lg"><BarChart3 size={18}/></div>
                              <h3 className="font-bold tracking-tight text-sm">Perfil de Comprador</h3>
                          </div>
                          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                            <CustomPieChart data={batchAnalysis.pieTypeData} colors={['#10b981', '#6366f1']} darkMode={darkMode} />
                            <div className="space-y-3">
                               <div className="flex justify-between items-center text-sm">
                                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"></div><span className="font-medium">Consumidor</span></div>
                                  <span className="font-bold text-zinc-500">{batchAnalysis.typeCounts.Final}</span>
                               </div>
                               <div className="flex justify-between items-center text-sm">
                                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-indigo-500"></div><span className="font-medium">Revendedor</span></div>
                                  <span className="font-bold text-zinc-500">{batchAnalysis.typeCounts.Revendedor}</span>
                               </div>
                            </div>
                          </div>
                        </Card>
                      </div>
                    </div>
                ) : (
                    <div className={`py-24 text-center rounded-xl border border-dashed ${darkMode ? 'border-zinc-800 bg-[#0f1115]' : 'border-zinc-300 bg-zinc-50'}`}>
                        <BarChart3 size={48} className={`mx-auto mb-4 ${darkMode ? 'text-zinc-800' : 'text-zinc-200'}`}/>
                        <p className={`text-sm font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Elige un lote en el menú superior para comenzar el análisis.</p>
                    </div>
                )}
              </div>
            )}

            {/* --- PESTAÑA GASTOS --- */}
            {activeTab === 'expenses' && (
                <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
                <Card darkMode={darkMode} className="border-t-4 border-t-rose-500 p-5 md:p-6">
                    <h2 className="text-xl font-bold tracking-tight mb-5 flex items-center gap-2"><Wallet size={20} className="text-rose-500"/> Declarar Egreso</h2>
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                            <div className="sm:col-span-3"><Input darkMode={darkMode} type="date" label="Fecha" value={newExpense.date} onChange={e => setNewExpense({...newExpense, date: e.target.value})} /></div>
                            <div className="sm:col-span-6"><Input darkMode={darkMode} label="Descripción del Gasto" placeholder="Ej: Publicidad Ads, Envío Extra..." value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} /></div>
                            <div className="sm:col-span-3"><Input darkMode={darkMode} label="Importe" type="number" symbol="$" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} /></div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                              <div className="flex-1 w-full">
                                 <Select 
                                    darkMode={darkMode} 
                                    label="Asignación Contable (Opcional)"
                                    value={newExpense.batchId} 
                                    onChange={e => setNewExpense({...newExpense, batchId: e.target.value})}
                                    options={[
                                        { value: '', label: '-- Gasto General del Negocio --' },
                                        ...batches.map(b => ({ value: b.id, label: b.name || 'Sin nombre' }))
                                    ]}
                                 />
                              </div>
                              <Button darkMode={darkMode} onClick={handleAddExpense} variant="danger" className="w-full sm:w-48">Registrar Salida</Button>
                        </div>
                    </div>
                </Card>

                <Card darkMode={darkMode} className="p-0 overflow-hidden border-zinc-200 dark:border-zinc-800">
                    <div className={`p-4 md:p-5 border-b ${darkMode ? 'bg-[#131824] border-zinc-800' : 'bg-white border-zinc-200'}`}>
                        <h3 className="font-bold text-base tracking-tight">Registro de Egresos</h3>
                    </div>
                    <div className={`divide-y ${darkMode ? 'divide-zinc-800' : 'divide-zinc-100'}`}>
                        {expenses.length === 0 && <div className="p-12 text-center text-sm font-medium opacity-50">No hay movimientos de salida registrados.</div>}
                        {expenses.map(e => (
                        <div key={e.id} className={`flex justify-between items-center p-4 md:p-5 transition-colors group ${darkMode ? 'hover:bg-zinc-900/50 bg-[#0f1115]' : 'hover:bg-zinc-50 bg-white'}`}>
                            <div className="flex items-center gap-4">
                                <div className={`p-2.5 rounded-lg ${darkMode ? 'bg-red-500/10 text-red-500' : 'bg-red-50 text-red-600'}`}><Wallet size={20}/></div>
                                <div>
                                    <div className="font-semibold text-sm">{e.description || 'Sin descripción'}</div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[11px] font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{safeDateStr(e.date, {month:'long', day:'numeric'})}</span>
                                        {e.batchName && (
                                            <>
                                                <span className="text-zinc-300 dark:text-zinc-700">•</span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${darkMode ? 'border-zinc-700 text-zinc-400' : 'border-zinc-200 text-zinc-500'}`}>{e.batchName}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-6">
                                <span className="font-bold tracking-tight text-red-500 text-lg">-{formatMoney(e.amount)}</span> 
                                <button onClick={()=>handleDeleteExpense(e.id)} className={`p-2.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${darkMode ? 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10' : 'text-zinc-400 hover:text-red-600 hover:bg-red-50'}`}><Trash2 size={18}/></button>
                            </div>
                        </div>
                        ))}
                    </div>
                </Card>
                </div>
            )}

        </div>
      </main>
    </div>
  );
}