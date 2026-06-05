import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Trash2, Save, TrendingUp, DollarSign, Package, UserCircle,
  ShoppingCart, Wallet, Activity, LogOut, Moon, Sun, AlertTriangle, Calendar, Award, FolderOpen, ChevronRight, ChevronDown, ChevronLeft, Box, Users, BarChart3, CheckCircle, Clock, Settings, Truck, Home, Percent, Flame, WifiOff, Download, XCircle, Search, ArrowUpDown, Star, Copy, Sparkles, Send, Minimize2, RotateCcw, Target, RefreshCw, Receipt
} from 'lucide-react';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';

import { initializeApp } from "firebase/app";
import {
  initializeFirestore, collection, addDoc, deleteDoc, doc, updateDoc, setDoc,
  onSnapshot, query, orderBy, where, getDocs, deleteField
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

// --- UTILIDADES ---
const formatMoney = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val || 0);
const formatCompact = (val) => new Intl.NumberFormat('es-AR', { notation: "compact", compactDisplay: "short", maximumFractionDigits: 1 }).format(val || 0);
const formatPercent = (val) => new Intl.NumberFormat('es-AR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format((val || 0) / 100);

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

const normalizeConsignmentDateInput = (dateStr) => {
  const raw = String(dateStr || '').trim();
  if (!raw) return '';

  const slash = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slash) {
    const [, d, m, y] = slash;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }

  return raw;
};

const formatConsignmentDueDate = (dateStr) => {
  const normalized = normalizeConsignmentDateInput(dateStr);
  const iso = String(normalized || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return normalized || 'Sin fecha';
};

const formatConsignmentDueDateShort = (dateStr) => {
  const normalized = normalizeConsignmentDateInput(dateStr);
  const iso = String(normalized || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return normalized || 'Sin límite';

  const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0);
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).replace('.', '');
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

// --- NORMALIZADOR DE VENDEDORES ---
const normalizeSellerName = (name) => {
  if (!name) return "028 Import";
  const lower = name.toLowerCase().trim();
  if (lower === "marcos" || lower === "028import" || lower === "028 import") return "028 Import";
  if (lower === "b" || lower === "buono") return "Buono";
  return name;
};


const isNewClientStatus = (value) => {
  if (value === true) return true;
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['si', 'nuevo', 'nuevo - organico', 'nuevo - orgánico', 'nuevo - publicidad'].includes(normalized);
};

const getClientStatusLabel = (value) => {
  if (value === true || String(value ?? '').trim().toLowerCase() === 'si') return 'Nuevo - Orgánico';
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'nuevo - publicidad') return 'Nuevo - Publicidad';
  if (normalized === 'nuevo - organico' || normalized === 'nuevo - orgánico' || normalized == 'nuevo') return 'Nuevo - Orgánico';
  if (normalized === 'revendedor') return 'Revendedor';
  return 'Frecuente';
};

const getClientSearchLabel = (value) => {
  const label = getClientStatusLabel(value);
  if (label === 'Nuevo - Publicidad') return 'cliente nuevo publicidad primera compra ads anuncios';
  if (label === 'Nuevo - Orgánico') return 'cliente nuevo organico orgánico primera compra';
  if (label === 'Revendedor') return 'cliente revendedor distribuidor mayorista reventa';
  return 'cliente frecuente recurrente';
};

// --- COMPONENTES UI ---
const Card = ({ children, className = '', darkMode }) => (
  <div className={`rounded-2xl border transition-colors duration-200 ${
    darkMode ? 'bg-[#101010] border-white/[0.06] text-zinc-100' : 'bg-white border-zinc-200/80 text-zinc-900'
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
    zinc: darkMode ? 'bg-[#101010] border-[#1F1F1F] hover:border-zinc-700' : 'bg-white border-zinc-200 hover:border-zinc-300',
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
    <div className={`flex flex-col p-3 sm:p-4 rounded-xl border shadow-sm transition-all duration-200 group overflow-hidden min-w-0 ${colorStyles[color]} ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>
       <div className="flex items-center justify-between mb-2 sm:mb-3 gap-1">
          <span className={`text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate ${darkMode ? 'opacity-60' : 'text-zinc-600'}`}>{title}</span>
          <div className={`p-1 sm:p-1.5 rounded-md transition-colors flex-shrink-0 ${iconColors[color]}`}>
              <Icon size={14} strokeWidth={2.5} />
          </div>
       </div>
       <div className="min-w-0">
          <div className="text-sm sm:text-lg lg:text-xl font-bold tracking-tighter leading-tight break-all">{value}</div>
          <div className="flex items-center justify-between mt-1.5 sm:mt-2 gap-2">
             <span className={`text-[10px] sm:text-xs font-medium truncate ${darkMode ? 'opacity-50' : 'text-zinc-500'}`}>{subtitle}</span>
             {trend}
          </div>
       </div>
    </div>
  );
};

const Button = ({ onClick, children, variant = 'primary', className = '', disabled = false, darkMode }) => {
  const baseStyle = "h-10 px-4 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-[#6366f1] text-white hover:bg-[#2563eb] font-bold",
    danger: darkMode ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20" : "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
    success: "bg-emerald-500 text-white hover:bg-emerald-400 font-bold",
    outline: darkMode ? "border border-white/[0.08] text-zinc-300 bg-transparent hover:bg-white/[0.04] hover:border-white/[0.14]" : "border border-zinc-200 text-zinc-700 bg-transparent hover:bg-zinc-50"
  };
  return <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`}>{children}</button>;
};

const Input = ({ label, symbol, darkMode, list, ...props }) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className={`text-xs font-semibold ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>{label}</label>}
    <div className="relative">
      {symbol && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className={`text-sm font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{symbol}</span></div>}
      {props.type === 'search' && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search size={16} className={`${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}/></div>}
      <input list={list} className={`h-10 border rounded-xl px-3 w-full text-sm outline-none transition-all duration-200 ${darkMode ? 'bg-[#101010] border-white/[0.07] text-zinc-100 placeholder-zinc-600 focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white border-zinc-200 text-zinc-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'} ${symbol || props.type === 'search' ? 'pl-9' : ''}`} {...props} />
    </div>
  </div>
);

const Select = ({ label, options = [], darkMode, ...props }) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className={`text-xs font-semibold ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>{label}</label>}
    <div className="relative">
      <select className={`h-10 appearance-none w-full border rounded-xl px-3 pr-8 text-sm outline-none cursor-pointer transition-all duration-200 ${darkMode ? 'bg-[#101010] border-white/[0.07] text-zinc-100 focus:border-[#6366f1]/50 focus:ring-1 focus:ring-[#6366f1]/10' : 'bg-white border-zinc-200 text-zinc-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'}`} {...props}>
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
        className={`min-h-10 flex items-center justify-between border rounded-xl px-3 py-2 text-sm outline-none cursor-pointer transition-all duration-200 select-none
          ${darkMode ? 'bg-[#101010] border-white/[0.07] text-zinc-100 hover:border-white/[0.14]' : 'bg-white border-zinc-200 text-zinc-900 hover:border-zinc-300'}
          ${isOpen ? (darkMode ? 'border-[#6366f1]/50 ring-1 ring-[#6366f1]/10' : 'border-blue-400 ring-1 ring-blue-100') : ''}`}
      >
        <div className={!selectedOption ? (darkMode ? 'text-zinc-500' : 'text-zinc-400') : 'truncate flex-1'}>
          {selectedOption ? (selectedOption.renderLabel || selectedOption.label) : placeholder}
        </div>
        <ChevronDown size={14} className={`transition-transform duration-200 ml-2 flex-shrink-0 ${isOpen ? 'rotate-180 text-indigo-500' : (darkMode ? 'text-zinc-500' : 'text-zinc-400')}`} />
      </div>

      {isOpen && (
        <div className={`absolute top-[100%] mt-1.5 z-50 w-full max-h-64 overflow-y-auto rounded-2xl shadow-2xl custom-scrollbar animate-in fade-in slide-in-from-top-1 p-1.5
          ${darkMode ? 'bg-[#101010] border border-white/[0.08]' : 'bg-white border border-zinc-200'}`}
        >
          {options.length === 0 ? (
            <div className={`p-3 text-xs text-center font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>No hay opciones disponibles</div>
          ) : (
            <div className="flex flex-col gap-1"> 
              {options.map((opt, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    if (!opt.disabled) {
                      onChange({ target: { value: opt.value } });
                      setIsOpen(false);
                    }
                  }}
                  className={`px-2.5 py-1.5 rounded-md text-sm transition-all duration-200 border shadow-sm
                    ${opt.disabled
                      ? (darkMode ? 'opacity-30 cursor-not-allowed bg-[#101010] border-white/[0.04]' : 'opacity-40 cursor-not-allowed bg-white border-zinc-100')
                      : (darkMode ? 'cursor-pointer bg-[#101010] border-white/[0.06] hover:border-white/[0.14] hover:bg-white/[0.03]' : 'cursor-pointer bg-white border-zinc-150 hover:border-zinc-300 hover:bg-zinc-50')}
                    ${value === opt.value && !opt.disabled ? (darkMode ? 'border-[#6366f1]/40 bg-[#6366f1]/8' : 'border-blue-300 bg-blue-50') : ''}`}
                >
                  {opt.renderDropdown ? opt.renderDropdown : <span className={value === opt.value ? 'font-bold' : ''}>{opt.label}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- GRÁFICOS RECHARTS Y BARRAS MODERNAS ---
const CustomTooltip = ({ active, payload, label, darkMode }) => {
  if (active && payload && payload.length) {
    return (
      <div className={`p-3 rounded-lg shadow-xl border ${darkMode ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-white border-zinc-200 text-zinc-900'}`}>
        <p className="text-xs font-semibold mb-1 opacity-70">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm font-bold" style={{ color: entry.color }}>
            {entry.name}: {entry.name === 'Unidades' ? `${entry.value} un.` : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const SalesAreaChart = ({ sales, mode, customRange, darkMode, isCompareMode = false }) => {
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
            map[key] = { key, name: `${dayStr}/${mStr}`, fullLabel: `${dayStr} de ${monthNames[d.getMonth()]}`, Ingresos: 0, Unidades: 0, Ganancia: 0 };
        }
    };

    if (mode === 'today') { generateDays(1); }
    else if (mode === 'week') { generateDays(7); }
    else if (mode === '15days') { generateDays(15); }
    else if (mode === '30days') { generateDays(30); }
    else if (mode === 'custom') {
      const start = new Date(customRange.start + 'T00:00:00');
      const end = new Date(customRange.end + 'T00:00:00');
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const key = `${y}-${m}-${day}`;
          map[key] = { key, name: `${day}/${m}`, fullLabel: `${day} de ${monthNames[d.getMonth()]}`, Ingresos: 0, Unidades: 0, Ganancia: 0 };
        }
      }
    }
    else if (mode !== 'all') {
      const [yStr, mStr] = mode.split('-');
      const y = parseInt(yStr);
      const m = parseInt(mStr);
      const daysInMonth = new Date(y, m, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        const dayStr = String(i).padStart(2, '0');
        const key = `${yStr}-${mStr}-${dayStr}`;
        map[key] = { key, name: `${dayStr}/${mStr}`, fullLabel: `${i} de ${monthNames[m - 1]}`, Ingresos: 0, Unidades: 0, Ganancia: 0 };
      }
    } else {
      if (!sales || sales.length === 0) return [];
      const dates = sales.map(s => s.date ? new Date(s.date) : new Date());
      const minDate = new Date(Math.min(...dates.map(d => isNaN(d.getTime()) ? new Date().getTime() : d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => isNaN(d.getTime()) ? new Date().getTime() : d.getTime())));

      for (let d = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()); d <= maxDate; d.setDate(d.getDate() + 1)) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${day}`;
        map[key] = { key, name: `${day}/${m}`, fullLabel: `${day} de ${monthNames[d.getMonth()]}`, Ingresos: 0, Unidades: 0, Ganancia: 0 };
      }
    }

    sales.forEach(s => {
      if(!s.date) return;
      const d = new Date(s.date);
      if(isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (map[key]) {
        map[key].Ingresos += s.totalSaleRaw || 0;
        map[key].Unidades += s.quantity || 0;
        map[key].Ganancia += (s.totalSaleRaw || 0) - (s.costArsAtSale || 0);
      }
    });

    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
  }, [sales, mode, customRange]);

  if (chartData.length === 0) return <div className="h-[250px] flex items-center justify-center text-sm font-medium opacity-50">No hay transacciones en este periodo.</div>;

  const themeColor = isCompareMode ? (darkMode ? '#f43f5e' : '#e11d48') : '#3b82f6';
  const gridColor = darkMode ? '#1F1F1F' : '#e4e4e7';
  const textColor = darkMode ? '#71717a' : '#a1a1aa';

  return (
    <div className="w-full flex flex-col space-y-4">
      <div className="flex justify-end mb-1">
          <div className={`flex items-center p-1 rounded-lg border ${darkMode ? 'bg-[#101010] border-[#1F1F1F]' : 'bg-zinc-50 border-zinc-200'}`}>
              <button onClick={() => setMetric('revenue')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${metric === 'revenue' ? (darkMode ? 'bg-zinc-800 text-white shadow-sm' : 'bg-white text-zinc-900 shadow-sm') : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>Ingresos</button>
              <button onClick={() => setMetric('quantity')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${metric === 'quantity' ? (darkMode ? 'bg-zinc-800 text-white shadow-sm' : 'bg-white text-zinc-900 shadow-sm') : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>Unidades</button>
              <button onClick={() => setMetric('profit')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${metric === 'profit' ? (darkMode ? 'bg-zinc-800 text-white shadow-sm' : 'bg-white text-zinc-900 shadow-sm') : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>Ganancia</button>
          </div>
      </div>
      
      <div className={`w-full h-[250px] p-2 rounded-xl border ${darkMode ? 'bg-[#0D0D0D] border-[#1F1F1F]' : 'bg-white border-zinc-200'}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`colorMetric-${isCompareMode ? 'vs' : 'base'}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={themeColor} stopOpacity={0.4}/>
                <stop offset="60%" stopColor={themeColor} stopOpacity={0.08}/>
                <stop offset="100%" stopColor={themeColor} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis dataKey="name" stroke={textColor} fontSize={10} tickLine={false} axisLine={false} dy={10} minTickGap={20} />
            <YAxis
              stroke={textColor} fontSize={10} tickLine={false} axisLine={false}
              tickFormatter={(value) => metric !== 'quantity' ? formatCompact(value) : value}
              width={45}
            />
            <RechartsTooltip content={<CustomTooltip darkMode={darkMode} />} cursor={{ stroke: textColor, strokeWidth: 1, strokeDasharray: '3 3' }} />
            <Area type="monotone" dataKey={metric === 'revenue' ? 'Ingresos' : metric === 'quantity' ? 'Unidades' : 'Ganancia'} stroke={metric === 'profit' ? '#a78bfa' : themeColor} strokeWidth={3} fillOpacity={1} fill={`url(#colorMetric-${isCompareMode ? 'vs' : 'base'})`} activeDot={{ r: 6, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// NUEVO COMPONENTE: Barras de distribución ultra modernas
const ModernDistribution = ({ data, colors, darkMode }) => {
  if (!data || data.length === 0) return <div className="p-8 flex items-center justify-center text-sm font-medium opacity-50">Sin datos registrados</div>;

  const total = data.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className="flex flex-col gap-5 p-5">
      {data.map((item, index) => {
        const percent = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
        return (
          <div key={item.name} className="flex flex-col gap-2">
            <div className="flex justify-between items-end">
              <div className="flex items-center gap-2.5">
                <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: colors[index % colors.length] }}></div>
                <span className={`text-sm font-bold ${darkMode ? 'text-zinc-200' : 'text-zinc-700'}`}>{item.name}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-black">{item.value}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${darkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>{percent}%</span>
              </div>
            </div>
            <div className={`h-2 w-full rounded-full overflow-hidden ${darkMode ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
              <div 
                className="h-full rounded-full transition-all duration-500 ease-out" 
                style={{ width: `${percent}%`, backgroundColor: colors[index % colors.length] }}
              ></div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// --- MINI BAR CHART (7 días) ---
const MiniBarChart = ({ data, labels, formatter }) => {
  const [hovered, setHovered] = useState(null);
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 0.001);
  const maxH = 32;
  const minH = 3;
  return (
    <div className="flex items-end gap-[3px] w-full">
      {data.map((v, i) => {
        const opacity = Math.max(0.3, 1 - (data.length - 1 - i) * 0.15);
        const h = max > 0 ? Math.max(minH, Math.round((v / max) * maxH)) : minH;
        const isFirst = i === 0;
        const isLast = i === data.length - 1;
        return (
          <div key={i} className="flex-1 relative cursor-default"
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            {hovered === i && (
              <div className={`absolute z-50 pointer-events-none whitespace-nowrap bottom-full mb-2
                bg-zinc-900 border border-zinc-700 text-zinc-100 text-[10px] px-2 py-1.5 rounded-lg shadow-xl
                ${isFirst ? 'left-0' : isLast ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>
                {labels && <div className="text-zinc-400 mb-0.5">{labels[i]}</div>}
                <div className="font-bold">{formatter ? formatter(v) : v}</div>
              </div>
            )}
            <div style={{ height: `${h}px`, background: '#3b82f6', opacity, borderRadius: '3px' }} />
          </div>
        );
      })}
    </div>
  );
};

// --- MINI LINE CHART (sparkline) ---
const MiniLineChart = ({ data, labels, formatter }) => {
  const [hovered, setHovered] = useState(null);
  const svgRef = useRef(null);
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100; const h = 32;
  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - 2 - ((v - min) / range) * (h - 4),
    v,
  }));
  const pts = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const handleMouseMove = e => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHovered(Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1)))));
  };
  const isFirst = hovered === 0;
  const isLast  = hovered === data.length - 1;
  const tipLeft = isFirst ? '0%' : isLast ? 'auto' : `${(hovered / (data.length - 1)) * 100}%`;
  const tipRight = isLast ? '0%' : 'auto';
  const tipTransform = (!isFirst && !isLast) ? 'translateX(-50%)' : 'none';
  return (
    <div className="relative mt-3">
      {hovered !== null && (
        <div className="absolute z-50 pointer-events-none bottom-full mb-1 bg-zinc-900 border border-zinc-700 text-zinc-100 text-[10px] px-2 py-1.5 rounded-lg shadow-xl whitespace-nowrap"
          style={{ left: tipLeft, right: tipRight, transform: tipTransform }}>
          {labels?.[hovered] && <div className="text-zinc-400 mb-0.5">{labels[hovered]}</div>}
          <div className="font-bold">{formatter ? formatter(data[hovered]) : data[hovered]}</div>
        </div>
      )}
      <svg ref={svgRef} width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
        onMouseMove={handleMouseMove} onMouseLeave={() => setHovered(null)} className="cursor-crosshair overflow-visible">
        <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {hovered !== null && (
          <circle cx={points[hovered].x} cy={points[hovered].y} r="2.5" fill="#3b82f6" strokeWidth="1.5" stroke="#fff" />
        )}
      </svg>
    </div>
  );
};

// --- PREMIUM METRIC CARD ---
const PremiumMetricCard = ({ title, value, subtitle, change, sparkline, sparklineLabels, sparklineFormatter, darkMode, extra, tooltip, lineSparkline, lineSparklineLabels, lineSparklineFormatter }) => {
  const isPositive = change === null || change === undefined || change >= 0;
  const [tipOpen, setTipOpen] = useState(false);
  const tipRef = useRef(null);

  useEffect(() => {
    if (!tipOpen) return;
    const close = (e) => {
      if (tipRef.current && !tipRef.current.contains(e.target)) setTipOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [tipOpen]);

  return (
    <div className={`rounded-2xl border p-3 sm:p-4 flex flex-col transition-all duration-200 min-w-0 ${
      darkMode ? 'bg-[#101010] border-white/[0.06] hover:border-white/[0.12]' : 'bg-white border-zinc-200 hover:border-zinc-300'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-zinc-500 leading-tight">{title}</span>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          {change !== null && change !== undefined && (
            <span className={`text-[9px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded-full ${
              isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {isPositive ? '+' : '−'}{Math.abs(change).toFixed(1)}%
            </span>
          )}
          {tooltip && (
            <div className="relative group/tt" ref={tipRef}>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.matchMedia('(hover: none)').matches) setTipOpen(o => !o);
                }}
                className={`w-5 h-5 rounded-full border text-[9px] font-bold flex items-center justify-center cursor-pointer select-none transition-colors ${
                  tipOpen
                    ? 'border-indigo-400 text-indigo-400 bg-indigo-500/10'
                    : 'border-zinc-500/40 text-zinc-500 hover:border-zinc-400 hover:text-zinc-400'
                }`}
              >?</span>
              <div className={`absolute z-[100] right-0 top-6 w-64 max-w-[calc(100vw-2rem)] bg-zinc-900 border border-zinc-700 text-zinc-200 text-[11px] leading-snug rounded-xl px-3 py-2.5 shadow-xl transition-opacity duration-150 whitespace-normal ${
                tipOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none group-hover/tt:opacity-100'
              }`}>
                {tooltip}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={`text-sm sm:text-xl lg:text-2xl font-bold tracking-tighter leading-tight break-all min-w-0 ${darkMode ? 'text-zinc-50' : 'text-zinc-900'}`}>{value}</div>
      <div className="text-[10px] sm:text-[11px] text-zinc-500 mt-1">{subtitle}</div>
      {extra}
      {lineSparkline && <MiniLineChart data={lineSparkline} labels={lineSparklineLabels} formatter={lineSparklineFormatter} />}
      {sparkline && <div className="mt-auto pt-3"><MiniBarChart data={sparkline} labels={sparklineLabels} formatter={sparklineFormatter} /></div>}
    </div>
  );
};

// --- AI CHAT FLOTANTE ---
const AIChat = ({ darkMode, db }) => {
  const STORAGE_KEY = '028_ai_chats';

  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      const p = s ? JSON.parse(s) : null;
      if (p && p.length > 0) return p;
    } catch {}
    return [{ id: Date.now(), name: 'Chat 1', messages: [], actionHistory: [], context: '' }];
  });
  const [activeChatId, setActiveChatId] = useState(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      const p = s ? JSON.parse(s) : null;
      if (p && p.length > 0) return p[0].id;
    } catch {}
    return null;
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [panelWidth, setPanelWidth] = useState(420);
  const [panelHeight, setPanelHeight] = useState(520);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextDraft, setContextDraft] = useState('');
  const [selectedModel, setSelectedModel] = useState('claude-haiku-4-5-20251001');
  const [panelPos, setPanelPos] = useState(() => {
    try { const s = localStorage.getItem('028_ai_pos'); return s ? JSON.parse(s) : { x: null, y: null }; } catch { return { x: null, y: null }; }
  });
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef(null);
  const tabsRef = useRef(null);
  const chatsRef = useRef(chats);
  const dragRef = useRef(null);
  const headerDragRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => { chatsRef.current = chats; }, [chats]);

  const activeChat = chats.find(c => c.id === activeChatId) || chats[0] || null;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)); } catch {}
  }, [chats]);

  useEffect(() => {
    if (!activeChatId && chats.length > 0) setActiveChatId(chats[0].id);
  }, [chats, activeChatId]);

  // Resize desde esquina superior izquierda
  const handleResizeStart = (e) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startW: panelWidth, startH: panelHeight };
    const onMove = (ev) => {
      if (!dragRef.current) return;
      const dx = dragRef.current.startX - ev.clientX;
      const dy = dragRef.current.startY - ev.clientY;
      setPanelWidth(Math.min(800, Math.max(380, dragRef.current.startW + dx)));
      setPanelHeight(Math.min(window.innerHeight * 0.9, Math.max(400, dragRef.current.startH + dy)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  useEffect(() => {
    if (panelPos.x !== null) {
      try { localStorage.setItem('028_ai_pos', JSON.stringify(panelPos)); } catch {}
    }
  }, [panelPos]);

  const handleHeaderDragStart = (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    e.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    headerDragRef.current = { startMouseX: e.clientX, startMouseY: e.clientY, startPanelX: rect.left, startPanelY: rect.top };
    setIsDragging(true);
    const onMove = (ev) => {
      if (!headerDragRef.current) return;
      const newX = Math.max(0, Math.min(window.innerWidth - panelWidth, headerDragRef.current.startPanelX + ev.clientX - headerDragRef.current.startMouseX));
      const newY = Math.max(0, Math.min(window.innerHeight - 80, headerDragRef.current.startPanelY + ev.clientY - headerDragRef.current.startMouseY));
      setPanelPos({ x: newX, y: newY });
    };
    const onUp = () => {
      headerDragRef.current = null;
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Flechas de tabs
  const checkTabsScroll = () => {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  };

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkTabsScroll);
    checkTabsScroll();
    const ro = new ResizeObserver(checkTabsScroll);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkTabsScroll); ro.disconnect(); };
  }, [open, chats.length]);

  const scrollTabs = (delta) => {
    tabsRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages?.length, open]);

  const updateChat = (id, fn) => setChats(prev => prev.map(c => c.id === id ? fn(c) : c));

  const formatTs = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
  };

  const copyMsg = (text, id) => {
    navigator.clipboard.writeText(text).catch(() => {}).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    });
  };

  const pushMsg = (chatId, msg) => updateChat(chatId, c => ({
    ...c, messages: [...c.messages, { ...msg, _id: `${Date.now()}-${Math.random()}`, ts: Date.now() }]
  }));

  const pushAction = (chatId, action) => updateChat(chatId, c => ({
    ...c, actionHistory: [action, ...(c.actionHistory || [])].slice(0, 3)
  }));

  const createChat = () => {
    const nc = { id: Date.now(), name: `Chat ${chats.length + 1}`, messages: [], actionHistory: [], context: '' };
    setChats(prev => [...prev, nc]);
    setActiveChatId(nc.id);
  };

  const deleteChat = (id) => {
    setChats(prev => {
      const next = prev.filter(c => c.id !== id);
      if (next.length === 0) {
        const fresh = { id: Date.now(), name: 'Chat 1', messages: [], actionHistory: [] };
        setActiveChatId(fresh.id);
        return [fresh];
      }
      if (activeChatId === id) setActiveChatId(next[0].id);
      return next;
    });
  };

  const compactChat = (chatId) => {
    const chat = chatsRef.current.find(c => c.id === chatId);
    if (!chat) return;
    const count = chat.messages.length;
    updateChat(chatId, c => ({
      ...c,
      messages: count > 0
        ? [{ role: 'assistant', content: `📦 Historial compactado (${count} mensajes eliminados para ahorrar tokens).`, _id: `compact-${Date.now()}` }]
        : []
    }));
  };

  // Fecha y rango en zona horaria Argentina (UTC-3, sin DST)
  const getArgDateISO = () => {
    const now = new Date();
    const arg = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    const y = arg.getFullYear();
    const m = String(arg.getMonth() + 1).padStart(2, '0');
    const d = String(arg.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getArgDateLabel = () =>
    new Date().toLocaleDateString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

  // Convierte YYYY-MM-DD en rango UTC para Argentina (UTC-3)
  const argDayToUTCRange = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    // 00:00 ART = 03:00 UTC del mismo día
    const start = new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));
    // 23:59:59.999 ART = 02:59:59.999 UTC del día siguiente
    const end = new Date(Date.UTC(y, m - 1, d + 1, 2, 59, 59, 999));
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const TOOLS = [
    {
      name: 'registrar_venta',
      description: 'Registra una venta en sales y descuenta currentStock en batches. Requiere confirmación previa del usuario.',
      input_schema: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          batchId: { type: 'string' }, batchName: { type: 'string' },
          itemId: { type: 'string' }, productName: { type: 'string' },
          variant: { type: 'string' }, quantity: { type: 'number' },
          unitPrice: { type: 'number' }, source: { type: 'string' },
          isReseller: { type: 'boolean' }, isNewClient: { type: 'string' },
          seller: { type: 'string' }
        },
        required: ['date', 'batchId', 'batchName', 'itemId', 'productName', 'quantity', 'unitPrice']
      }
    },
    {
      name: 'registrar_gasto',
      description: 'Registra un gasto en expenses. Requiere confirmación previa del usuario.',
      input_schema: {
        type: 'object',
        properties: {
          date: { type: 'string' }, description: { type: 'string' },
          amount: { type: 'number' }, batchId: { type: 'string' }, batchName: { type: 'string' }
        },
        required: ['date', 'description', 'amount']
      }
    },
    {
      name: 'consultar_stock',
      description: 'Lee todos los batches activos con su inventario actual. No requiere confirmación.',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'cierre_caja',
      description: 'Calcula ventas, costos, gastos y ganancias de un período. No requiere confirmación.',
      input_schema: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'YYYY-MM-DD' },
          endDate: { type: 'string', description: 'YYYY-MM-DD' }
        },
        required: ['startDate', 'endDate']
      }
    },
    {
      name: 'consignaciones_pendientes',
      description: 'Lista consignaciones con quantityPending > 0. No requiere confirmación.',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'registrar_stock_neutro',
      description: 'Registra en neutral_stock y descuenta stock en batches. Requiere confirmación previa.',
      input_schema: {
        type: 'object',
        properties: {
          reason: { type: 'string' }, note: { type: 'string' },
          batchId: { type: 'string' }, batchName: { type: 'string' },
          itemId: { type: 'string' }, productName: { type: 'string' },
          variant: { type: 'string' }, quantity: { type: 'number' },
          unitPrice: { type: 'number' }, costArsAtEntry: { type: 'number' }
        },
        required: ['batchId', 'itemId', 'productName', 'quantity']
      }
    },
    {
      name: 'comparar_periodos',
      description: 'Compara métricas de ventas y gastos entre dos rangos de fechas. No requiere confirmación.',
      input_schema: {
        type: 'object',
        properties: {
          period1Start: { type: 'string' }, period1End: { type: 'string' },
          period2Start: { type: 'string' }, period2End: { type: 'string' }
        },
        required: ['period1Start', 'period1End', 'period2Start', 'period2End']
      }
    },
    {
      name: 'deshacer_accion',
      description: 'Deshace una acción previa usando datos guardados en memoria. actionIndex: 0=última, 1=penúltima, 2=antepenúltima. Requiere confirmación previa.',
      input_schema: {
        type: 'object',
        properties: { actionIndex: { type: 'number' } },
        required: ['actionIndex']
      }
    },
    {
      name: 'crear_lote',
      description: 'Crea un lote nuevo en batches. Requiere confirmación.',
      input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }
    },
    {
      name: 'agregar_producto_a_lote',
      description: 'Busca un batch por nombre y agrega un item. Requiere confirmación.',
      input_schema: {
        type: 'object',
        properties: {
          batchName: { type: 'string' }, product: { type: 'string' }, variant: { type: 'string' },
          costArs: { type: 'number' }, initialStock: { type: 'number' }
        },
        required: ['batchName', 'product', 'initialStock']
      }
    },
    {
      name: 'editar_producto',
      description: 'Busca batch+item por nombre/variante y actualiza los campos indicados. Requiere confirmación.',
      input_schema: {
        type: 'object',
        properties: {
          batchName: { type: 'string' }, productName: { type: 'string' }, variant: { type: 'string' },
          newProduct: { type: 'string' }, newVariant: { type: 'string' },
          costArs: { type: 'number' }, initialStock: { type: 'number' }
        },
        required: ['batchName', 'productName']
      }
    },
    {
      name: 'eliminar_producto',
      description: 'Elimina un item del array items de un batch. Requiere confirmación.',
      input_schema: {
        type: 'object',
        properties: { batchName: { type: 'string' }, productName: { type: 'string' }, variant: { type: 'string' } },
        required: ['batchName', 'productName']
      }
    },
    {
      name: 'renombrar_lote',
      description: 'Actualiza name en batches y batchName en sales/expenses asociadas. Requiere confirmación.',
      input_schema: {
        type: 'object',
        properties: { currentName: { type: 'string' }, newName: { type: 'string' } },
        required: ['currentName', 'newName']
      }
    },
    {
      name: 'editar_stock_directo',
      description: 'Suma o resta cantidad al currentStock de un producto sin registrarlo como venta. Requiere confirmación.',
      input_schema: {
        type: 'object',
        properties: {
          batchName: { type: 'string' }, productName: { type: 'string' }, variant: { type: 'string' },
          delta: { type: 'number', description: 'Positivo para sumar, negativo para restar' }
        },
        required: ['batchName', 'productName', 'delta']
      }
    },
    {
      name: 'ventas_por_vendedor',
      description: 'Busca en sales todas las ventas donde el campo seller contenga el string dado (case insensitive). Devuelve lista completa con productName, variant, quantity, totalSaleRaw, date, seller, y totales agregados. No requiere confirmación.',
      input_schema: {
        type: 'object',
        properties: {
          vendedor: { type: 'string', description: 'Nombre o parte del nombre del vendedor a filtrar (ej: "Buono", "B", "Lucas")' },
          startDate: { type: 'string', description: 'Fecha inicio opcional YYYY-MM-DD' },
          endDate: { type: 'string', description: 'Fecha fin opcional YYYY-MM-DD' }
        },
        required: ['vendedor']
      }
    }
  ];

  const executeTool = async (toolName, toolInput, chatId) => {
    if (toolName === 'consultar_stock') {
      const snap = await getDocs(collection(db, 'batches'));
      return JSON.stringify(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    if (toolName === 'cierre_caja') {
      const { startDate, endDate } = toolInput;
      // Convertir fechas argentinas a rangos UTC para cubrir ISO timestamps
      const startRange = argDayToUTCRange(startDate);
      const endRange = argDayToUTCRange(endDate);
      const utcStart = startRange.start;   // 03:00 UTC del día inicio (= medianoche ART)
      const utcEnd = endRange.end;          // 02:59:59.999 UTC del día siguiente al fin (= 23:59 ART)
      const [sSnap, eSnap, bSnap] = await Promise.all([
        getDocs(query(collection(db, 'sales'), where('date', '>=', utcStart), where('date', '<=', utcEnd))),
        getDocs(query(collection(db, 'expenses'), where('date', '>=', utcStart), where('date', '<=', utcEnd))),
        getDocs(collection(db, 'batches'))
      ]);
      const sales = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const exps = eSnap.docs.map(d => d.data());
      const batches = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const activeBatches = batches.filter(b => !b.finalizedAt);
      const inversionTotalLotesActivos = activeBatches.reduce((sum, b) =>
        sum + (b.items || []).reduce((s, i) => s + (i.costArs || 0) * (i.initialStock || 0), 0), 0);
      const valorStockActual = activeBatches.reduce((sum, b) =>
        sum + (b.items || []).reduce((s, i) => s + (i.costArs || 0) * (i.currentStock || 0), 0), 0);
      const batchesPeriodo = batches.filter(b => b.createdAt && b.createdAt >= utcStart && b.createdAt <= utcEnd);
      const inversionLotesPeriodo = batchesPeriodo.reduce((sum, b) =>
        sum + (b.items || []).reduce((s, i) => s + (i.costArs || 0) * (i.initialStock || 0), 0), 0);
      const totalSales = sales.reduce((a, v) => a + (v.totalSaleRaw || 0), 0);
      const totalCost = sales.reduce((a, v) => a + (v.costArsAtSale || 0), 0);
      const totalExpenses = exps.reduce((a, v) => a + (v.amount || 0), 0);
      const byProduct = {};
      sales.forEach(s => {
        const k = `${s.productName || ''} ${s.variant || ''}`.trim();
        byProduct[k] = byProduct[k] || { qty: 0, total: 0, cost: 0 };
        byProduct[k].qty += (s.quantity || 0);
        byProduct[k].total += (s.totalSaleRaw || 0);
        byProduct[k].cost += (s.costArsAtSale || 0);
      });
      const bySource = {};
      sales.forEach(s => { const src = s.source || 'Desconocido'; bySource[src] = (bySource[src] || 0) + (s.totalSaleRaw || 0); });
      // Agrupación por vendedor (campo seller)
      const bySeller = {};
      sales.forEach(s => {
        const sel = s.seller || 'Sin vendedor';
        bySeller[sel] = bySeller[sel] || { count: 0, totalSales: 0, totalCost: 0 };
        bySeller[sel].count += 1;
        bySeller[sel].totalSales += (s.totalSaleRaw || 0);
        bySeller[sel].totalCost += (s.costArsAtSale || 0);
      });
      return JSON.stringify({
        period: `${startDate} → ${endDate}`,
        salesCount: sales.length,
        totalSales, totalCost,
        grossProfit: totalSales - totalCost,
        totalExpenses,
        netProfit: totalSales - totalCost - totalExpenses,
        topProducts: Object.entries(byProduct).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10).map(([name, d]) => ({ name, ...d, profit: d.total - d.cost })),
        bySource,
        bySeller,
        salesWithSeller: sales.map(s => ({ productName: s.productName, variant: s.variant, quantity: s.quantity, totalSaleRaw: s.totalSaleRaw, date: s.date, seller: s.seller || '' })),
        expenses: exps.map(e => ({ description: e.description, amount: e.amount })),
        inversionTotalLotesActivos,
        valorStockActual,
        stockDepreciacion: inversionTotalLotesActivos - valorStockActual,
        lotesActivosCount: activeBatches.length,
        inversionLotesPeriodo,
        lotesPeriodoCount: batchesPeriodo.length,
        lotesPeriodo: batchesPeriodo.map(b => ({
          name: b.name,
          createdAt: b.createdAt,
          inversionInicial: (b.items || []).reduce((s, i) => s + (i.costArs || 0) * (i.initialStock || 0), 0)
        }))
      });
    }

    if (toolName === 'consignaciones_pendientes') {
      const snap = await getDocs(collection(db, 'consignments'));
      return JSON.stringify(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => (c.quantityPending || 0) > 0));
    }

    if (toolName === 'registrar_venta') {
      const { batchId, itemId, quantity } = toolInput;
      let costArsAtSale = 0, batchDocData = null, prevStock = 0;
      try {
        const allBatches = await getDocs(collection(db, 'batches'));
        const batchDoc = allBatches.docs.find(d => d.id === batchId);
        if (batchDoc) {
          batchDocData = batchDoc.data();
          const item = (batchDocData.items || []).find(i => i.id === itemId);
          if (item) { costArsAtSale = (item.costArs || 0) * quantity; prevStock = item.currentStock || 0; }
        }
      } catch {}
      const totalSaleRaw = (toolInput.unitPrice || 0) * quantity;
      const saleRef = await addDoc(collection(db, 'sales'), {
        ...toolInput, quantity: Number(quantity), totalSaleRaw, costArsAtSale,
        createdAt: new Date().toISOString(), ticketId: `TKT-${Date.now()}`
      });
      if (batchDocData) {
        const updItems = (batchDocData.items || []).map(i =>
          i.id === itemId ? { ...i, currentStock: Math.max(0, (i.currentStock || 0) - quantity) } : i
        );
        await updateDoc(doc(db, 'batches', batchId), { items: updItems });
        pushAction(chatId, { type: 'venta', saleId: saleRef.id, batchId, itemId, quantity: Number(quantity), previousStock: prevStock });
      }
      return JSON.stringify({ success: true, saleId: saleRef.id, totalSaleRaw, costArsAtSale });
    }

    if (toolName === 'registrar_gasto') {
      const expRef = await addDoc(collection(db, 'expenses'), { ...toolInput, amount: Number(toolInput.amount) });
      pushAction(chatId, { type: 'gasto', expenseId: expRef.id, ...toolInput });
      return JSON.stringify({ success: true, expenseId: expRef.id });
    }

    if (toolName === 'registrar_stock_neutro') {
      const { batchId, itemId, quantity, unitPrice = 0, costArsAtEntry = 0 } = toolInput;
      const totalSaleRaw = unitPrice * quantity, totalCostRaw = costArsAtEntry * quantity;
      const entryRef = await addDoc(collection(db, 'neutral_stock'), {
        ...toolInput, totalSaleRaw, totalCostRaw, grossProfitRaw: totalSaleRaw - totalCostRaw,
        createdAt: new Date().toISOString()
      });
      const allBatches = await getDocs(collection(db, 'batches'));
      const batchDoc = allBatches.docs.find(d => d.id === batchId);
      if (batchDoc) {
        const bData = batchDoc.data();
        const prevStock = (bData.items || []).find(i => i.id === itemId)?.currentStock || 0;
        const updItems = (bData.items || []).map(i =>
          i.id === itemId ? { ...i, currentStock: Math.max(0, (i.currentStock || 0) - quantity) } : i
        );
        await updateDoc(doc(db, 'batches', batchId), { items: updItems });
        pushAction(chatId, { type: 'stock_neutro', entryId: entryRef.id, batchId, itemId, quantity, prevStock });
      }
      return JSON.stringify({ success: true, entryId: entryRef.id });
    }

    if (toolName === 'comparar_periodos') {
      const { period1Start, period1End, period2Start, period2End } = toolInput;
      const fetchP = async (startArg, endArg) => {
        const utcS = argDayToUTCRange(startArg).start;
        const utcE = argDayToUTCRange(endArg).end;
        const [ss, es] = await Promise.all([
          getDocs(query(collection(db, 'sales'), where('date', '>=', utcS), where('date', '<=', utcE))),
          getDocs(query(collection(db, 'expenses'), where('date', '>=', utcS), where('date', '<=', utcE)))
        ]);
        const sv = ss.docs.map(d => d.data()), ev = es.docs.map(d => d.data());
        const ts = sv.reduce((a, v) => a + (v.totalSaleRaw || 0), 0);
        const tc = sv.reduce((a, v) => a + (v.costArsAtSale || 0), 0);
        const te = ev.reduce((a, v) => a + (v.amount || 0), 0);
        return { range: `${startArg} → ${endArg}`, salesCount: sv.length, totalSales: ts, grossProfit: ts - tc, totalExpenses: te, netProfit: ts - tc - te };
      };
      const [p1, p2] = await Promise.all([fetchP(period1Start, period1End), fetchP(period2Start, period2End)]);
      return JSON.stringify({ period1: p1, period2: p2 });
    }

    if (toolName === 'deshacer_accion') {
      const { actionIndex = 0 } = toolInput;
      const chat = chatsRef.current.find(c => c.id === chatId);
      const action = (chat?.actionHistory || [])[actionIndex];
      if (!action) return JSON.stringify({ success: false, error: 'No hay acción en ese índice' });
      if (action.type === 'venta') {
        await deleteDoc(doc(db, 'sales', action.saleId));
        const allBatches = await getDocs(collection(db, 'batches'));
        const batchDoc = allBatches.docs.find(d => d.id === action.batchId);
        if (batchDoc) {
          const updItems = (batchDoc.data().items || []).map(i =>
            i.id === action.itemId ? { ...i, currentStock: action.previousStock } : i
          );
          await updateDoc(doc(db, 'batches', action.batchId), { items: updItems });
        }
        updateChat(chatId, c => ({ ...c, actionHistory: c.actionHistory.filter((_, i) => i !== actionIndex) }));
        return JSON.stringify({ success: true, message: 'Venta eliminada y stock restaurado' });
      }
      if (action.type === 'gasto') {
        await deleteDoc(doc(db, 'expenses', action.expenseId));
        updateChat(chatId, c => ({ ...c, actionHistory: c.actionHistory.filter((_, i) => i !== actionIndex) }));
        return JSON.stringify({ success: true, message: 'Gasto eliminado' });
      }
      if (action.type === 'stock_neutro') {
        await deleteDoc(doc(db, 'neutral_stock', action.entryId));
        const allBatches = await getDocs(collection(db, 'batches'));
        const batchDoc = allBatches.docs.find(d => d.id === action.batchId);
        if (batchDoc) {
          const updItems = (batchDoc.data().items || []).map(i =>
            i.id === action.itemId ? { ...i, currentStock: action.prevStock } : i
          );
          await updateDoc(doc(db, 'batches', action.batchId), { items: updItems });
        }
        updateChat(chatId, c => ({ ...c, actionHistory: c.actionHistory.filter((_, i) => i !== actionIndex) }));
        return JSON.stringify({ success: true, message: 'Stock neutro eliminado y stock restaurado' });
      }
      if (action.type === 'crear_lote') {
        await deleteDoc(doc(db, 'batches', action.batchId));
        updateChat(chatId, c => ({ ...c, actionHistory: c.actionHistory.filter((_, i) => i !== actionIndex) }));
        return JSON.stringify({ success: true, message: `Lote "${action.name}" eliminado` });
      }
      if (action.type === 'agregar_producto') {
        const snap = await getDocs(collection(db, 'batches'));
        const bd = snap.docs.find(d => d.id === action.batchId);
        if (bd) {
          const updItems = (bd.data().items || []).filter(i => i.id !== action.itemId);
          await updateDoc(doc(db, 'batches', action.batchId), { items: updItems });
        }
        updateChat(chatId, c => ({ ...c, actionHistory: c.actionHistory.filter((_, i) => i !== actionIndex) }));
        return JSON.stringify({ success: true, message: 'Producto eliminado del lote' });
      }
      if (action.type === 'editar_producto') {
        const snap = await getDocs(collection(db, 'batches'));
        const bd = snap.docs.find(d => d.id === action.batchId);
        if (bd) {
          const updItems = (bd.data().items || []).map(i => i.id === action.itemId ? action.previousItem : i);
          await updateDoc(doc(db, 'batches', action.batchId), { items: updItems });
        }
        updateChat(chatId, c => ({ ...c, actionHistory: c.actionHistory.filter((_, i) => i !== actionIndex) }));
        return JSON.stringify({ success: true, message: 'Producto restaurado al estado anterior' });
      }
      if (action.type === 'eliminar_producto') {
        const snap = await getDocs(collection(db, 'batches'));
        const bd = snap.docs.find(d => d.id === action.batchId);
        if (bd) {
          await updateDoc(doc(db, 'batches', action.batchId), { items: [...(bd.data().items || []), action.item] });
        }
        updateChat(chatId, c => ({ ...c, actionHistory: c.actionHistory.filter((_, i) => i !== actionIndex) }));
        return JSON.stringify({ success: true, message: 'Producto restaurado al lote' });
      }
      if (action.type === 'renombrar_lote') {
        await updateDoc(doc(db, 'batches', action.batchId), { name: action.previousName });
        const [sSnap, eSnap] = await Promise.all([
          getDocs(query(collection(db, 'sales'), where('batchId', '==', action.batchId))),
          getDocs(query(collection(db, 'expenses'), where('batchId', '==', action.batchId)))
        ]);
        await Promise.all([
          ...sSnap.docs.map(d => updateDoc(doc(db, 'sales', d.id), { batchName: action.previousName })),
          ...eSnap.docs.map(d => updateDoc(doc(db, 'expenses', d.id), { batchName: action.previousName }))
        ]);
        updateChat(chatId, c => ({ ...c, actionHistory: c.actionHistory.filter((_, i) => i !== actionIndex) }));
        return JSON.stringify({ success: true, message: `Lote renombrado de vuelta a "${action.previousName}"` });
      }
      if (action.type === 'editar_stock_directo') {
        const snap = await getDocs(collection(db, 'batches'));
        const bd = snap.docs.find(d => d.id === action.batchId);
        if (bd) {
          const updItems = (bd.data().items || []).map(i => i.id === action.itemId ? { ...i, currentStock: action.prevStock } : i);
          await updateDoc(doc(db, 'batches', action.batchId), { items: updItems });
        }
        updateChat(chatId, c => ({ ...c, actionHistory: c.actionHistory.filter((_, i) => i !== actionIndex) }));
        return JSON.stringify({ success: true, message: `Stock restaurado a ${action.prevStock}` });
      }
      return JSON.stringify({ success: false, error: 'Tipo de acción no soportado' });
    }

    if (toolName === 'crear_lote') {
      const { name } = toolInput;
      const batchRef = await addDoc(collection(db, 'batches'), { name, createdAt: new Date().toISOString(), items: [] });
      pushAction(chatId, { type: 'crear_lote', batchId: batchRef.id, name });
      return JSON.stringify({ success: true, batchId: batchRef.id, name });
    }

    if (toolName === 'agregar_producto_a_lote') {
      const { batchName, product, variant = '', costArs = 0, initialStock = 0 } = toolInput;
      const allBatches = await getDocs(collection(db, 'batches'));
      const allNames = allBatches.docs.map(d => d.data().name || '');
      const batchDoc = allBatches.docs.find(d => (d.data().name || '').toLowerCase() === batchName.toLowerCase());
      if (!batchDoc) return JSON.stringify({
        success: false,
        error: `Lote "${batchName}" no existe en el sistema.`,
        instruccion: 'Usá exactamente uno de los nombres de la lista lotesDisponibles.',
        lotesDisponibles: allNames
      });
      const newItem = {
        id: `${Date.now()}-${Math.floor(Math.random() * 9999)}`,
        product, variant,
        costArs: Number(costArs),
        initialStock: Number(initialStock),
        currentStock: Number(initialStock)
      };
      await updateDoc(doc(db, 'batches', batchDoc.id), { items: [...(batchDoc.data().items || []), newItem] });
      pushAction(chatId, { type: 'agregar_producto', batchId: batchDoc.id, itemId: newItem.id, batchName });
      return JSON.stringify({ success: true, item: newItem });
    }

    if (toolName === 'editar_producto') {
      const { batchName, productName, variant, newProduct, newVariant, costArs, initialStock } = toolInput;
      const allBatches = await getDocs(collection(db, 'batches'));
      const allNames = allBatches.docs.map(d => d.data().name || '');
      const batchDoc = allBatches.docs.find(d => (d.data().name || '').toLowerCase().includes(batchName.toLowerCase()));
      if (!batchDoc) return JSON.stringify({
        success: false,
        error: `Lote "${batchName}" no existe en el sistema.`,
        instruccion: 'Usá exactamente uno de los nombres de la lista lotesDisponibles.',
        lotesDisponibles: allNames
      });
      const items = batchDoc.data().items || [];
      const idx = items.findIndex(i =>
        (i.product || '').toLowerCase().includes(productName.toLowerCase()) &&
        (!variant || (i.variant || '').toLowerCase().includes(variant.toLowerCase()))
      );
      if (idx === -1) return JSON.stringify({
        success: false,
        error: `Producto "${productName}" no existe en el lote "${batchDoc.data().name}".`,
        instruccion: 'Usá exactamente uno de los nombres de la lista productosDisponibles.',
        productosDisponibles: items.map(i => ({ product: i.product, variant: i.variant || '' }))
      });
      const previousItem = { ...items[idx] };
      const updatedItem = {
        ...items[idx],
        ...(newProduct !== undefined && { product: newProduct }),
        ...(newVariant !== undefined && { variant: newVariant }),
        ...(costArs !== undefined && { costArs: Number(costArs) }),
        ...(initialStock !== undefined && { initialStock: Number(initialStock) })
      };
      const updItems = items.map((it, i) => i === idx ? updatedItem : it);
      await updateDoc(doc(db, 'batches', batchDoc.id), { items: updItems });
      pushAction(chatId, { type: 'editar_producto', batchId: batchDoc.id, itemId: items[idx].id, previousItem });
      return JSON.stringify({ success: true, before: previousItem, after: updatedItem });
    }

    if (toolName === 'eliminar_producto') {
      const { batchName, productName, variant } = toolInput;
      const allBatches = await getDocs(collection(db, 'batches'));
      const allNames = allBatches.docs.map(d => d.data().name || '');
      const batchDoc = allBatches.docs.find(d => (d.data().name || '').toLowerCase().includes(batchName.toLowerCase()));
      if (!batchDoc) return JSON.stringify({
        success: false,
        error: `Lote "${batchName}" no existe en el sistema.`,
        instruccion: 'Usá exactamente uno de los nombres de la lista lotesDisponibles.',
        lotesDisponibles: allNames
      });
      const items = batchDoc.data().items || [];
      const item = items.find(i =>
        (i.product || '').toLowerCase().includes(productName.toLowerCase()) &&
        (!variant || (i.variant || '').toLowerCase().includes(variant.toLowerCase()))
      );
      if (!item) return JSON.stringify({
        success: false,
        error: `Producto "${productName}" no existe en el lote "${batchDoc.data().name}".`,
        instruccion: 'Usá exactamente uno de los nombres de la lista productosDisponibles.',
        productosDisponibles: items.map(i => ({ product: i.product, variant: i.variant || '' }))
      });
      await updateDoc(doc(db, 'batches', batchDoc.id), { items: items.filter(i => i.id !== item.id) });
      pushAction(chatId, { type: 'eliminar_producto', batchId: batchDoc.id, item });
      return JSON.stringify({ success: true, removed: item });
    }

    if (toolName === 'renombrar_lote') {
      const { currentName, newName } = toolInput;
      const allBatches = await getDocs(collection(db, 'batches'));
      const allNames = allBatches.docs.map(d => d.data().name || '');
      const batchDoc = allBatches.docs.find(d => (d.data().name || '').toLowerCase() === currentName.toLowerCase());
      if (!batchDoc) return JSON.stringify({
        success: false,
        error: `Lote "${currentName}" no existe en el sistema.`,
        instruccion: 'Usá exactamente uno de los nombres de la lista lotesDisponibles.',
        lotesDisponibles: allNames
      });
      await updateDoc(doc(db, 'batches', batchDoc.id), { name: newName });
      const [sSnap, eSnap] = await Promise.all([
        getDocs(query(collection(db, 'sales'), where('batchId', '==', batchDoc.id))),
        getDocs(query(collection(db, 'expenses'), where('batchId', '==', batchDoc.id)))
      ]);
      await Promise.all([
        ...sSnap.docs.map(d => updateDoc(doc(db, 'sales', d.id), { batchName: newName })),
        ...eSnap.docs.map(d => updateDoc(doc(db, 'expenses', d.id), { batchName: newName }))
      ]);
      pushAction(chatId, { type: 'renombrar_lote', batchId: batchDoc.id, previousName: currentName, newName });
      return JSON.stringify({ success: true, updatedSales: sSnap.size, updatedExpenses: eSnap.size });
    }

    if (toolName === 'editar_stock_directo') {
      const { batchName, productName, variant, delta } = toolInput;
      const allBatches = await getDocs(collection(db, 'batches'));
      const allNames = allBatches.docs.map(d => d.data().name || '');
      const batchDoc = allBatches.docs.find(d => (d.data().name || '').toLowerCase().includes(batchName.toLowerCase()));
      if (!batchDoc) return JSON.stringify({
        success: false,
        error: `Lote "${batchName}" no existe en el sistema.`,
        instruccion: 'Usá exactamente uno de los nombres de la lista lotesDisponibles.',
        lotesDisponibles: allNames
      });
      const items = batchDoc.data().items || [];
      const idx = items.findIndex(i =>
        (i.product || '').toLowerCase().includes(productName.toLowerCase()) &&
        (!variant || (i.variant || '').toLowerCase().includes(variant.toLowerCase()))
      );
      if (idx === -1) return JSON.stringify({
        success: false,
        error: `Producto "${productName}" no existe en el lote "${batchDoc.data().name}".`,
        instruccion: 'Usá exactamente uno de los nombres de la lista productosDisponibles.',
        productosDisponibles: items.map(i => ({ product: i.product, variant: i.variant || '' }))
      });
      const prevStock = items[idx].currentStock || 0;
      const newStock = Math.max(0, prevStock + Number(delta));
      const updItems = items.map((it, i) => i === idx ? { ...it, currentStock: newStock } : it);
      await updateDoc(doc(db, 'batches', batchDoc.id), { items: updItems });
      pushAction(chatId, { type: 'editar_stock_directo', batchId: batchDoc.id, itemId: items[idx].id, prevStock, newStock });
      return JSON.stringify({ success: true, prevStock, newStock, delta: Number(delta) });
    }

    if (toolName === 'ventas_por_vendedor') {
      const { vendedor, startDate, endDate } = toolInput;
      const vendedorLower = (vendedor || '').toLowerCase();
      let salesQuery = collection(db, 'sales');
      let constraints = [];
      if (startDate && endDate) {
        const startRange = argDayToUTCRange(startDate);
        const endRange = argDayToUTCRange(endDate);
        constraints = [where('date', '>=', startRange.start), where('date', '<=', endRange.end)];
      }
      const snap = await getDocs(constraints.length > 0 ? query(salesQuery, ...constraints) : salesQuery);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Filtrar client-side por seller (case insensitive, coincidencia parcial)
      const filtered = all.filter(s => (s.seller || '').toLowerCase().includes(vendedorLower));
      const totalSales = filtered.reduce((a, v) => a + (v.totalSaleRaw || 0), 0);
      const totalCost = filtered.reduce((a, v) => a + (v.costArsAtSale || 0), 0);
      const byProduct = {};
      filtered.forEach(s => {
        const k = `${s.productName || ''} ${s.variant || ''}`.trim();
        byProduct[k] = byProduct[k] || { qty: 0, total: 0 };
        byProduct[k].qty += (s.quantity || 0);
        byProduct[k].total += (s.totalSaleRaw || 0);
      });
      return JSON.stringify({
        vendedor: vendedor,
        period: startDate && endDate ? `${startDate} → ${endDate}` : 'sin filtro de fecha',
        count: filtered.length,
        totalSales,
        totalCost,
        grossProfit: totalSales - totalCost,
        comision3pct: Math.round(totalSales * 0.03),
        topProducts: Object.entries(byProduct).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10),
        ventas: filtered.map(s => ({
          productName: s.productName || '',
          variant: s.variant || '',
          quantity: s.quantity || 0,
          totalSaleRaw: s.totalSaleRaw || 0,
          date: s.date || '',
          seller: s.seller || ''
        }))
      });
    }

    return JSON.stringify({ error: `Herramienta desconocida: ${toolName}` });
  };

  const getSystemPrompt = () => {
    const hoy = getArgDateLabel();
    const argISO = getArgDateISO();
    return `Sos el sistema de análisis y control completo de 028 Import. Hoy es ${hoy} (${argISO}).

⚠️ REGLA ABSOLUTA — DATOS REALES SIEMPRE: NUNCA inventes datos, números, montos, cantidades, productos ni tendencias. Si necesitás información de ventas, stock, gastos, cierres, consignaciones o cualquier dato del negocio, DEBÉS ejecutar la tool correspondiente en este mismo turno antes de responder. Está estrictamente prohibido responder con números de facturación, ganancia, stock o cualquier dato del negocio sin haberlos obtenido de una tool en este turno. Si no ejecutaste una tool, no tenés datos — decilo y ejecutá la tool.

⚠️ REGLA ABSOLUTA — NOMBRES EXACTOS: NUNCA inventes nombres de lotes, productos o variantes. Los únicos nombres válidos son los que obtuviste de consultar_stock en esta conversación. Si vas a operar sobre un lote o producto específico y no ejecutaste consultar_stock antes, ejecutalo primero para obtener los nombres exactos. Si una tool devuelve "lotesDisponibles" o "productosDisponibles", elegí el nombre correcto de esa lista y reintentá la operación con ese nombre exacto — no inventes una alternativa.

COLECCIONES FIREBASE (fechas como ISO UTC):
- sales: date(ISO), batchId, batchName, itemId, productName, variant, quantity, unitPrice, totalSaleRaw, costArsAtSale, source, isReseller, isNewClient, seller
- batches: name, items[]{id,product,variant,costArs,initialStock,currentStock}
- expenses: date(ISO), description, amount, batchId, batchName
- neutral_stock: reason, note, batchId, itemId, productName, variant, quantity, unitPrice, costArsAtEntry
- consignments: clientName, productName, variant, quantityPending, quantityPaid, unitPrice, dueDate

CONFIRMACIÓN OBLIGATORIA antes de llamar cualquier tool que escriba/borre datos: mostrá colección afectada, lote, valores antes/después, y preguntá "¿Confirmás? (sí / no)". Solo llamá la tool si el usuario responde "sí". Las tools de solo lectura (consultar_stock, cierre_caja, consignaciones_pendientes, comparar_periodos) no requieren confirmación.

ROLLBACK: guardás las últimas 3 acciones. Si el usuario pide deshacer, mostrá qué vas a revertir, confirmá, y usá deshacer_accion.

COMANDOS: "cierre"→cierre hoy | "cierre semana"→últimos 7 días | "cierre mes"→mes actual | "stock"→consultar_stock | "pendientes"→consignaciones_pendientes

FORMA DE ACTUAR: Cuando hagás cierres o resúmenes, SIEMPRE mostrar en este orden exacto:
1. Facturación total
2. Costos
3. Ganancia exacta (bruta y neta)
4. Productos vendidos (cantidad de unidades y de líneas distintas)
5. Clientes nuevos — separando orgánicos y ads cuando estén disponibles (campo isNewClient)
6. Ticket promedio
7. Productos más vendidos (por volumen)
8. Productos más rentables (por ganancia)
9. Ventas y comisión de Lucas Buono (ver sección EMPLEADO)
10. Resumen ejecutivo: solo los números clave, sin repetir el detalle anterior

PRECISIÓN: Nunca usar aproximaciones. Siempre calcular con los datos reales. Antes de mostrar resultados, revisá si hay registros duplicados o inconsistentes y avisá si detectás algo raro. Mostrá todos los números sin redondear.

ANÁLISIS: Cuando mostrés un cierre, no te limitás a los números. Analizás tendencias, comparás con el período anterior si tenés datos, detectás qué subió o bajó, qué producto o canal está rindiendo mejor, y das una conclusión con recomendaciones concretas para el negocio.

DISTRIBUCIÓN: En todos los análisis, SIEMPRE separar:
- Nicotina (mayor volumen de ventas)
- THC / cannabis (mayor ganancia por unidad)
Mostrar subtotales de facturación, costos y ganancia por cada categoría. Para identificar la categoría, usar el nombre del lote o producto (nicotina, vape, pod, desechable → categoría nicotina; thc, cannabis, hachís, flor → categoría THC). Si no podés determinar la categoría, agrupar como "Otros".

EMPLEADO — Lucas Buono: Lucas trabaja por comisión del 3% sobre sus ventas. En el sistema sus ventas tienen el campo seller = "Buono". Cuando el usuario pida análisis de Lucas o cuando hagas un cierre completo, siempre:
- Filtrar las ventas con seller = "Buono"
- Mostrar su facturación total y cantidad de ventas
- Calcular y mostrar su comisión: facturación_Buono × 0.03
- Mostrar sus productos más vendidos

MARKETING — Meta Ads vs orgánico: El negocio trabaja con una agencia de Meta Ads. Los clientes nuevos se registran en el campo isNewClient con valores como "Nuevo orgánico", "Nuevo por ads", o similares. Durante mayo 2026 se apagaron los ads para medir el volumen orgánico real. Cuando analicés clientes nuevos o marketing, siempre:
- Separar clientes nuevos orgánicos de clientes nuevos por ads usando el campo isNewClient
- Mostrar cantidad y facturación de cada tipo
- Si el período incluye mayo 2026, mencionar que los ads estaban apagados y que los nuevos de ese período son 100% orgánicos

LENGUAJE DE NEGOCIO: Nunca uses términos técnicos como "Firebase", "colección", "documento", "campo", "array", "batch id" ni ningún término de base de datos. Usá lenguaje de negocio: "lote" en vez de "batch/document", "venta" en vez de "sales record", "gasto" en vez de "expense", "productos" en vez de "items array". El usuario no sabe de programación.

CONFIRMACIONES EXITOSAS: Cuando una acción se complete, mostrá un resumen breve en texto plano sin tablas. Ejemplo: "✅ Variante actualizada: de 'X' a 'Y' en el lote Z." Directo y claro.

Usá tablas markdown para comparaciones. Respondé en español argentino.`;
  };

  // Palabras clave que indican que el usuario pide datos reales — fuerza tool_choice: 'any'
  const DATA_KEYWORDS = [
    'cierre', 'venta', 'vendim', 'vendiste', 'vendimos',
    'ganam', 'ganancia', 'ganancias', 'ganamos',
    'factura', 'facturac', 'facturamos', 'facturaste',
    'ingreso', 'ingresos',
    'gasto', 'gastos', 'gastam', 'gastamos',
    'stock', 'inventario',
    'cuánto', 'cuanto', 'cuántos', 'cuantos',
    'pendiente', 'consignac',
    'comparar', 'período', 'periodo', 'comparación',
    'hoy', 'ayer', 'semana', 'este mes', 'último mes', 'ultimo mes',
    'promedio', 'ticket promedio',
    'reporte', 'resumen', 'análisis', 'analisis', 'informe',
    'lucas', 'buono', 'vendedor', 'comisión', 'comision',
    'nicotina', 'thc', 'cannabis', 'cbd',
    'top ', 'más vendido', 'mas vendido', 'más rentable', 'mas rentable',
    'lote', 'producto'
  ];

  const requiresToolUse = (text) => {
    const lower = text.toLowerCase();
    return DATA_KEYWORDS.some(kw => lower.includes(kw));
  };

  const isConfirmMsg = (content) => {
    if (typeof content !== 'string') return false;
    const lower = content.toLowerCase();
    return lower.includes('¿confirmás?') || lower.includes('confirmás?') ||
           lower.includes('¿confirmas?') || lower.includes('confirmas?');
  };

  const sendMessage = async (directText) => {
    const userText = typeof directText === 'string' ? directText : input.trim();
    if (!userText || loading || !activeChat) return;
    if (typeof directText !== 'string') setInput('');
    const chatId = activeChat.id;
    const modelUsed = selectedModel;
    pushMsg(chatId, { role: 'user', content: userText });
    setLoading(true);
    try {
      const CONTEXT_WORDS = ['sí', 'si', 'no', 'confirmá', 'confirma', 'cancelá', 'cancela', ' y ', 'cuánto', 'cuanto', 'por qué', 'por que', 'ese ', 'igual'];
      const ANALYSIS_WORDS = ['cierre', 'comparar', 'semana', 'mes', 'análisis', 'analisis'];
      const lowerUserText = userText.toLowerCase();
      const isAnalysis = ANALYSIS_WORDS.some(w => lowerUserText.includes(w));
      const isShortOrContext = userText.length < 20 || CONTEXT_WORDS.some(w => lowerUserText.includes(w));
      const historyCount = isAnalysis ? 6 : isShortOrContext ? 4 : 0;
      const allMsgs = [...(activeChat.messages || []), { role: 'user', content: userText }];
      const history = historyCount > 0
        ? allMsgs.slice(-historyCount).map(m => ({ role: m.role, content: m.content }))
        : [{ role: 'user', content: userText }];
      let apiMsgs = history;
      let running = true;
      let isFirstCall = true;
      let toolsCalledThisTurn = false;
      const needsToolFirst = requiresToolUse(userText);

      while (running) {
        const requestBody = {
          model: selectedModel,
          max_tokens: 2048,
          system: getSystemPrompt() + (activeChat?.context?.trim() ? `\n\nCONTEXTO ADICIONAL DEL CHAT:\n${activeChat.context.trim()}` : ''),
          tools: TOOLS,
          messages: apiMsgs,
        };
        // Primera llamada con palabras clave de datos: forzar ejecución de tool
        if (isFirstCall && needsToolFirst) {
          requestBody.tool_choice = { type: 'any' };
        }
        isFirstCall = false;

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify(requestBody)
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e?.error?.message || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.stop_reason === 'tool_use') {
          toolsCalledThisTurn = true;
          const texts = data.content.filter(b => b.type === 'text');
          const toolUses = data.content.filter(b => b.type === 'tool_use');
          if (texts.length > 0) {
            const t = texts.map(b => b.text).join('');
            if (t.trim()) pushMsg(chatId, { role: 'assistant', content: t, model: modelUsed });
          }
          const toolResults = [];
          for (const tu of toolUses) {
            let result;
            try {
              result = await executeTool(tu.name, tu.input, chatId);
              const parsed = JSON.parse(result);
              if (parsed?.success === false) {
                result = JSON.stringify({ ...parsed, tool: tu.name });
              }
            } catch (toolErr) {
              result = JSON.stringify({ success: false, tool: tu.name, error: toolErr.message });
            }
            toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
          }
          apiMsgs = [...apiMsgs, { role: 'assistant', content: data.content }, { role: 'user', content: toolResults }];
        } else {
          const t = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
          // Red de seguridad: si se esperaba tool y no se ejecutó ninguna, bloquear la respuesta
          if (needsToolFirst && !toolsCalledThisTurn) {
            pushMsg(chatId, { role: 'assistant', content: '⚠️ Intenté responder sin consultar los datos reales. Por favor, repetí tu pregunta para que pueda obtener los datos actualizados.', model: modelUsed });
          } else if (t.trim()) {
            pushMsg(chatId, { role: 'assistant', content: t, model: modelUsed });
          }
          running = false;
        }
      }
    } catch (e) {
      pushMsg(chatId, { role: 'assistant', content: `❌ Error: ${e.message}`, model: modelUsed });
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[60] w-14 h-14 rounded-2xl text-white shadow-lg hover:scale-105 flex items-center justify-center transition-all duration-200"
      style={{background:'#6366f1', boxShadow:'0 8px 32px rgba(99,102,241,0.35)'}}
      title="Asistente IA 028"
    >
      <Sparkles size={20} />
    </button>
  );

  const mdComponents = {
    p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="list-disc list-inside mb-1.5 space-y-0.5 pl-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5 pl-1">{children}</ol>,
    li: ({ children }) => <li className="leading-snug">{children}</li>,
    strong: ({ children }) => <strong className="font-600">{children}</strong>,
    em: ({ children }) => <em className="italic opacity-75">{children}</em>,
    pre: ({ children }) => (
      <pre className={`p-3 rounded-xl my-2 text-[11px] font-mono overflow-x-auto leading-relaxed ${darkMode ? 'bg-zinc-950/70 text-zinc-300 ring-1 ring-white/[0.05]' : 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200'}`}>
        {children}
      </pre>
    ),
    code: ({ className, children }) => {
      const isBlock = Boolean(className);
      return isBlock
        ? <code className={`${className || ''} text-[11px]`}>{children}</code>
        : <code className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono ${darkMode ? 'bg-zinc-700/60 text-indigo-300' : 'bg-zinc-200 text-indigo-700'}`}>{children}</code>;
    },
    table: ({ children }) => (
      <div className={`overflow-x-auto my-2.5 rounded-xl border ${darkMode ? 'border-zinc-700/50' : 'border-zinc-200'}`}>
        <table className="text-[11px] border-collapse w-full">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className={darkMode ? 'bg-zinc-800/60' : 'bg-zinc-100'}>{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => (
      <tr className={darkMode ? 'border-b border-zinc-700/40 last:border-b-0 even:bg-zinc-800/20' : 'border-b border-zinc-200 last:border-b-0 even:bg-zinc-50'}>
        {children}
      </tr>
    ),
    th: ({ children }) => (
      <th className={`px-3 py-2 font-600 text-left text-[10px] uppercase tracking-wide whitespace-nowrap border-r last:border-r-0 ${darkMode ? 'text-zinc-300 border-zinc-700/40' : 'text-zinc-600 border-zinc-200'}`}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className={`px-3 py-2 border-r last:border-r-0 ${darkMode ? 'text-zinc-300 border-zinc-700/25' : 'text-zinc-700 border-zinc-200'}`}>
        {children}
      </td>
    ),
    h1: ({ children }) => <p className="font-600 text-[14px] mb-2 mt-1">{children}</p>,
    h2: ({ children }) => <p className="font-600 text-[13px] mb-1.5">{children}</p>,
    h3: ({ children }) => <p className="font-600 mb-1 opacity-80">{children}</p>,
    blockquote: ({ children }) => <blockquote className="border-l-2 border-indigo-500/35 pl-3 my-1.5 italic opacity-65">{children}</blockquote>,
    hr: () => <hr className={`my-3 ${darkMode ? 'border-zinc-700/40' : 'border-zinc-200'}`} />,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">{children}</a>,
  };

  const actionLabel = (a) => {
    const map = { venta: '🛒 Venta', gasto: '💸 Gasto', stock_neutro: '📦 Stock neutro', crear_lote: '📁 Lote', agregar_producto: '➕ Producto', editar_producto: '✏️ Edición', eliminar_producto: '🗑️ Eliminación', renombrar_lote: '🏷️ Renombre', editar_stock_directo: '📊 Stock' };
    return map[a.type] || '↩ Acción';
  };

  return (
    <>
      {isDragging && <style>{`* { cursor: grabbing !important; user-select: none; }`}</style>}
      <div
        ref={panelRef}
        className={`fixed z-[60] ${panelPos.x === null ? 'bottom-20 md:bottom-6 right-4 md:right-6' : ''}`}
        style={panelPos.x !== null
          ? { left: panelPos.x, top: panelPos.y, width: panelWidth, maxWidth: 'calc(100vw - 2rem)' }
          : { width: panelWidth, maxWidth: 'calc(100vw - 2rem)' }
        }
      >
        <style>{`
          .ai-scroll::-webkit-scrollbar { width: 3px; }
          .ai-scroll::-webkit-scrollbar-track { background: transparent; }
          .ai-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 99px; transition: background 0.3s; }
          .ai-scroll:hover::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.18); }
          .ai-scroll { overflow-x: hidden; }
          .ai-scroll * { max-width: 100%; word-break: break-word; overflow-wrap: anywhere; }
          .ai-tabs::-webkit-scrollbar { display: none; }
          .ai-tab-active { position: relative; }
          .ai-tab-active::before, .ai-tab-active::after { content: ''; position: absolute; bottom: 0; width: 8px; height: 8px; pointer-events: none; }
          .ai-tab-active::before { left: -8px; border-bottom-right-radius: 8px; box-shadow: 4px 0 0 0 ${darkMode ? '#252525' : '#ffffff'}; }
          .ai-tab-active::after { right: -8px; border-bottom-left-radius: 8px; box-shadow: -4px 0 0 0 ${darkMode ? '#252525' : '#ffffff'}; }
          @keyframes ai-dot { 0%,80%,100%{opacity:.12;transform:scale(0.55)} 40%{opacity:1;transform:scale(1)} }
          .ai-dot { animation: ai-dot 1.2s ease-in-out infinite; }
          @keyframes ai-fadein { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
          .ai-msg { animation: ai-fadein 0.18s ease-out both; }
        `}</style>

        <div
          className={`flex flex-col overflow-hidden relative ${
            darkMode
              ? 'bg-zinc-900 ring-1 ring-white/[0.06] shadow-[0_28px_70px_-6px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04)]'
              : 'bg-white ring-1 ring-zinc-200/70 shadow-[0_28px_70px_-6px_rgba(0,0,0,0.13),0_0_0_1px_rgba(0,0,0,0.03)]'
          }`}
          style={{ height: panelHeight, borderRadius: 24 }}
        >
          {/* Handle de resize */}
          <div
            onMouseDown={handleResizeStart}
            className="absolute top-0 left-0 w-7 h-7 z-20 cursor-nw-resize flex items-start justify-start p-2 group"
            title="Redimensionar"
          >
            <svg width="7" height="7" viewBox="0 0 7 7" className={`opacity-15 group-hover:opacity-40 transition-opacity ${darkMode ? 'fill-zinc-400' : 'fill-zinc-500'}`}>
              <circle cx="1.5" cy="1.5" r="1.2"/><circle cx="1.5" cy="4.5" r="1.2"/><circle cx="4.5" cy="1.5" r="1.2"/>
            </svg>
          </div>

          {/* HEADER — draggable */}
          <div
            className="flex-shrink-0 select-none"
            style={{ cursor: isDragging ? 'grabbing' : 'grab', background: darkMode ? '#0D0D0D' : '#d8d8e2' }}
            onMouseDown={handleHeaderDragStart}
          >
            {/* Fila 1: tabs + acciones */}
            <div className="flex items-end gap-0 px-2 pt-2 pb-0">
              {canScrollLeft && (
                <button onMouseDown={e => e.stopPropagation()} onClick={() => scrollTabs(-120)} className={`flex-shrink-0 p-1 rounded mb-0.5 self-end transition-colors ${darkMode ? 'text-zinc-600 hover:text-zinc-300' : 'text-zinc-300 hover:text-zinc-600'}`}>
                  <ChevronLeft size={11} />
                </button>
              )}
              <div ref={tabsRef} className="ai-tabs flex items-end flex-1 overflow-x-auto min-w-0 pl-2 gap-1" onScroll={checkTabsScroll}>
                {chats.map((chat) => {
                  const isActive = activeChatId === chat.id;
                  return (
                    <div key={chat.id} className="relative flex-shrink-0 group/tab" style={{ zIndex: isActive ? 2 : 1 }}>
                      {editingId === chat.id ? (
                        <input
                          autoFocus value={editName}
                          onMouseDown={e => e.stopPropagation()}
                          onChange={e => setEditName(e.target.value)}
                          onBlur={() => { if (editName.trim()) updateChat(chat.id, c => ({ ...c, name: editName.trim() })); setEditingId(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') { if (editName.trim()) updateChat(chat.id, c => ({ ...c, name: editName.trim() })); setEditingId(null); } else if (e.key === 'Escape') setEditingId(null); }}
                          className={`text-[11px] font-medium px-2.5 outline-none ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}
                          style={{ borderRadius: '8px 8px 0 0', paddingTop: 6, paddingBottom: 7, width: 88,
                            background: darkMode ? '#252525' : '#ffffff' }}
                        />
                      ) : (
                        <div
                          className={`flex items-center gap-1.5 px-2.5 transition-colors${isActive ? ' ai-tab-active' : ''} ${
                            isActive
                              ? (darkMode ? 'text-zinc-100' : 'text-zinc-800')
                              : (darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600')
                          }`}
                          style={{
                            borderRadius: '8px 8px 0 0',
                            paddingTop: 6,
                            paddingBottom: 6,
                            background: isActive ? (darkMode ? '#252525' : '#ffffff') : 'transparent',
                          }}
                        >
                          <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => setActiveChatId(chat.id)}
                            onDoubleClick={() => { setEditingId(chat.id); setEditName(chat.name); }}
                            title="Doble click para renombrar"
                            className="text-[11px] font-medium whitespace-nowrap flex items-center gap-1.5 outline-none leading-none"
                          >
                            {chat.name}
                            {chat.context?.trim() && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />}
                          </button>
                          {chats.length > 1 && (
                            <button
                              onMouseDown={e => e.stopPropagation()}
                              onClick={() => deleteChat(chat.id)}
                              className={`flex-shrink-0 w-3.5 h-3.5 rounded flex items-center justify-center transition-all ${
                                isActive
                                  ? (darkMode ? 'text-zinc-500 hover:text-zinc-100 hover:bg-white/10' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/80')
                                  : 'opacity-0 group-hover/tab:opacity-100 ' + (darkMode ? 'text-zinc-600 hover:text-red-400' : 'text-zinc-300 hover:text-red-400')
                              }`}
                            >
                              <XCircle size={10} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {canScrollRight && (
                <button onMouseDown={e => e.stopPropagation()} onClick={() => scrollTabs(120)} className={`flex-shrink-0 p-1 rounded mb-0.5 self-end transition-colors ${darkMode ? 'text-zinc-600 hover:text-zinc-300' : 'text-zinc-300 hover:text-zinc-600'}`}>
                  <ChevronRight size={11} />
                </button>
              )}
              <div className="flex items-center gap-0.5 ml-2 mb-0.5 self-end flex-shrink-0">
                <button onMouseDown={e => e.stopPropagation()} onClick={createChat} className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05]' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`} title="Nuevo chat">
                  <Plus size={12} />
                </button>
                <button onMouseDown={e => e.stopPropagation()} onClick={() => activeChat && compactChat(activeChat.id)} className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05]' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`} title="Compactar historial">
                  <Minimize2 size={12} />
                </button>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => { setContextOpen(o => !o); setContextDraft(activeChat?.context || ''); }}
                  title="Contexto del chat"
                  className={`p-1.5 rounded-lg transition-colors ${
                    activeChat?.context?.trim()
                      ? (darkMode ? 'text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100')
                      : (darkMode ? 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05]' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100')
                  }`}
                >
                  <FolderOpen size={12} />
                </button>
                <button onMouseDown={e => e.stopPropagation()} onClick={() => { setPanelPos({ x: null, y: null }); try { localStorage.removeItem('028_ai_pos'); } catch {} setOpen(false); }} className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05]' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}>
                  <XCircle size={12} />
                </button>
              </div>
            </div>

            {/* Fila 2: modelo activo + selector */}
            <div className="flex items-center justify-between px-3 pt-2 pb-2.5" style={{ background: darkMode ? '#252525' : '#ffffff', borderRadius: '6px 6px 0 0' }}>
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center flex-shrink-0">
                  <Sparkles size={7} className="text-white" />
                </div>
                <span className={`text-[11px] font-semibold ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>028 Asistente</span>
                <span className={`text-[9px] px-1.5 py-px rounded-full font-medium flex-shrink-0 ${
                  selectedModel === 'claude-haiku-4-5-20251001'
                    ? (darkMode ? 'bg-amber-500/10 text-amber-400/80' : 'bg-amber-50 text-amber-600')
                    : (darkMode ? 'bg-indigo-500/10 text-indigo-400/80' : 'bg-indigo-50 text-indigo-600')
                }`}>
                  {selectedModel === 'claude-haiku-4-5-20251001' ? '⚡ haiku' : '🧠 sonnet'}
                </span>
                {activeChat?.context?.trim() && (
                  <span className={`text-[9px] px-1.5 py-px rounded-full flex-shrink-0 ${darkMode ? 'bg-indigo-500/8 text-indigo-400/60' : 'bg-indigo-50 text-indigo-400'}`}>ctx</span>
                )}
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => setSelectedModel('claude-haiku-4-5-20251001')}
                  title="Rápido y eficiente"
                  className={`text-[9px] font-semibold px-2 py-0.5 rounded-full transition-all ${
                    selectedModel === 'claude-haiku-4-5-20251001'
                      ? (darkMode ? 'bg-amber-500/12 text-amber-400 ring-1 ring-amber-500/20' : 'bg-amber-50 text-amber-600 ring-1 ring-amber-200')
                      : (darkMode ? 'text-zinc-600 hover:text-zinc-400' : 'text-zinc-400 hover:text-zinc-600')
                  }`}
                >⚡ Rápido</button>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => setSelectedModel('claude-sonnet-4-6')}
                  title="Análisis profundo"
                  className={`text-[9px] font-semibold px-2 py-0.5 rounded-full transition-all ${
                    selectedModel === 'claude-sonnet-4-6'
                      ? (darkMode ? 'bg-indigo-500/12 text-indigo-400 ring-1 ring-indigo-500/20' : 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200')
                      : (darkMode ? 'text-zinc-600 hover:text-zinc-400' : 'text-zinc-400 hover:text-zinc-600')
                  }`}
                >🧠 Análisis</button>
              </div>
            </div>
          </div>

          {/* Panel de contexto */}
          {contextOpen && activeChat ? (
            <div className="flex-1 overflow-y-auto flex flex-col p-4 gap-3">
              <p className={`text-[11px] leading-relaxed ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Este texto se envía al asistente en cada mensaje. Usalo para instrucciones fijas, períodos de análisis o datos de referencia.
              </p>
              <textarea
                autoFocus
                value={contextDraft}
                onChange={e => setContextDraft(e.target.value.slice(0, 5000))}
                placeholder={"Ejemplo: Analizar solo ventas de mayo 2026.\nEl precio de costo del CBD es $8.500."}
                className={`flex-1 text-[13px] rounded-2xl p-3.5 resize-none outline-none leading-relaxed border transition-all ${
                  darkMode
                    ? 'bg-zinc-800/50 border-zinc-700/40 text-zinc-100 placeholder-zinc-600 focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/10'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-300/10'
                }`}
              />
              <div className="flex items-center justify-between gap-2 flex-shrink-0">
                <span className={`text-[10px] tabular-nums ${contextDraft.length >= 4800 ? 'text-amber-400 font-semibold' : darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  {contextDraft.length.toLocaleString('es-AR')} / 5.000
                </span>
                <div className="flex items-center gap-2">
                  {contextDraft.trim() && (
                    <button onClick={() => setContextDraft('')} className={`text-[11px] px-3 py-1.5 rounded-xl transition-colors ${darkMode ? 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10' : 'text-zinc-400 hover:text-red-500 hover:bg-red-50'}`}>Borrar</button>
                  )}
                  <button
                    onClick={() => { updateChat(activeChat.id, c => ({ ...c, context: contextDraft })); setContextOpen(false); }}
                    className="text-[11px] font-semibold px-3.5 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
                  >Guardar</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="ai-scroll flex-1 overflow-y-auto px-4 py-4 space-y-5">
              {/* Empty state */}
              {(!activeChat?.messages || activeChat.messages.length === 0) && !loading && (
                <div className="flex flex-col items-center justify-center h-full gap-5 select-none px-2">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-indigo-500/8 ring-1 ring-indigo-500/12' : 'bg-indigo-50 ring-1 ring-indigo-200/60'}`}>
                    <Sparkles size={22} className={darkMode ? 'text-indigo-400/50' : 'text-indigo-400'} />
                  </div>
                  <div className="text-center">
                    <p className={`text-[13px] font-semibold mb-1 ${darkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>Asistente 028 Import</p>
                    <p className={`text-[11px] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>¿Qué querés consultar?</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {[
                      { icon: '📊', label: 'Cierre de hoy',    msg: 'cierre' },
                      { icon: '📦', label: 'Stock actual',      msg: 'stock' },
                      { icon: '⏳', label: 'Consignaciones',    msg: 'pendientes' },
                      { icon: '👤', label: 'Ventas de Lucas',   msg: 'ventas de Buono' },
                      { icon: '📈', label: 'Comparar ayer',     msg: 'comparar con ayer' },
                      { icon: '💰', label: 'Cierre semana',     msg: 'cierre semana' },
                    ].map(({ icon, label, msg }) => (
                      <button
                        key={label}
                        onClick={() => sendMessage(msg)}
                        className={`text-[11px] font-medium px-3.5 py-1.5 rounded-full border transition-all active:scale-95 whitespace-nowrap flex items-center gap-1.5 ${
                          darkMode
                            ? 'border-zinc-700/60 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600/80 hover:bg-white/[0.03]'
                            : 'border-zinc-200 text-zinc-500 hover:text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
                        }`}
                      >
                        <span>{icon}</span>{label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Mensajes */}
              {(activeChat?.messages || []).map((msg, i, arr) => {
                const isLastMsg = i === arr.length - 1;
                const showConfirm = msg.role === 'assistant' && isLastMsg && !loading && isConfirmMsg(msg.content);
                return (
                  <React.Fragment key={msg._id || i}>
                    <div className={`ai-msg flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'user' ? (
                        <div className="relative group max-w-[75%]">
                          <div
                            className="bg-indigo-600 text-white text-[13px] leading-relaxed px-4 py-2.5 break-words whitespace-pre-wrap"
                            style={{ borderRadius: '20px 20px 6px 20px' }}
                          >
                            {msg.content}
                          </div>
                          <button
                            onClick={() => copyMsg(msg.content, msg._id)}
                            className={`absolute -top-1.5 -left-7 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded-lg flex items-center justify-center ${darkMode ? 'bg-zinc-800 text-zinc-500 hover:text-zinc-200' : 'bg-zinc-100 text-zinc-400 hover:text-zinc-700'}`}
                            title="Copiar"
                          >
                            {copiedId === msg._id ? <CheckCircle size={10} className="text-emerald-400" /> : <Copy size={10} />}
                          </button>
                          <p className={`text-[10px] mt-1 text-right ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>{formatTs(msg.ts)}</p>
                        </div>
                      ) : (
                        <div className="relative group flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Sparkles size={9} className={`flex-shrink-0 ${darkMode ? 'text-indigo-500/45' : 'text-indigo-400/55'}`} />
                            <span className={`text-[10px] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                              {(msg.model || selectedModel) === 'claude-haiku-4-5-20251001' ? 'haiku' : 'sonnet'} · {formatTs(msg.ts)}
                            </span>
                          </div>
                          <div className={`text-[13px] leading-relaxed pl-3.5 border-l-2 break-words ${darkMode ? 'border-indigo-500/20 text-zinc-200' : 'border-indigo-400/25 text-zinc-800'}`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{msg.content}</ReactMarkdown>
                          </div>
                          <button
                            onClick={() => copyMsg(msg.content, msg._id)}
                            className={`absolute top-0 -right-6 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded-lg flex items-center justify-center ${darkMode ? 'bg-zinc-800 text-zinc-500 hover:text-zinc-200' : 'bg-zinc-100 text-zinc-400 hover:text-zinc-700'}`}
                            title="Copiar"
                          >
                            {copiedId === msg._id ? <CheckCircle size={10} className="text-emerald-400" /> : <Copy size={10} />}
                          </button>
                        </div>
                      )}
                    </div>
                    {showConfirm && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => sendMessage('sí')}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[12px] font-semibold transition-all active:scale-95 ${
                            darkMode
                              ? 'bg-emerald-500/8 text-emerald-400 ring-1 ring-emerald-500/15 hover:bg-emerald-500/15'
                              : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          <CheckCircle size={12} />Confirmar
                        </button>
                        <button
                          onClick={() => sendMessage('no')}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-[12px] font-semibold transition-all active:scale-95 ${
                            darkMode
                              ? 'bg-red-500/8 text-red-400 ring-1 ring-red-500/15 hover:bg-red-500/15'
                              : 'bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100'
                          }`}
                        >
                          <XCircle size={12} />Cancelar
                        </button>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Typing indicator */}
              {loading && (
                <div className="ai-msg flex justify-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sparkles size={9} className={`flex-shrink-0 ${darkMode ? 'text-indigo-500/45' : 'text-indigo-400/55'}`} />
                      <span className={`text-[10px] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>pensando...</span>
                    </div>
                    <div className={`pl-3.5 border-l-2 ${darkMode ? 'border-indigo-500/20' : 'border-indigo-400/25'}`}>
                      <div className="flex gap-1 items-center py-0.5">
                        {[0, 0.16, 0.32].map((d, idx) => (
                          <span key={idx} className="ai-dot w-[5px] h-[5px] rounded-full bg-indigo-400/45" style={{ animationDelay: `${d}s` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input */}
          <div className={`flex-shrink-0 px-3 pb-3 pt-2 ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
            <div className={`flex items-end gap-2 rounded-2xl px-4 py-3 ${darkMode ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Preguntá algo..."
                rows={1}
                disabled={loading}
                className={`flex-1 text-[13px] bg-transparent outline-none resize-none leading-relaxed ${darkMode ? 'text-zinc-100 placeholder-zinc-600' : 'text-zinc-900 placeholder-zinc-400'}`}
                style={{ minHeight: 22, maxHeight: 100 }}
                onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'; }}
              />
              {input.trim() && (
                <button
                  onClick={sendMessage}
                  disabled={loading}
                  className="flex-shrink-0 w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 transition-colors mb-0.5 shadow-md shadow-indigo-900/20"
                >
                  <Send size={13} />
                </button>
              )}
            </div>
            <p className={`text-[9px] mt-1.5 text-center ${darkMode ? 'text-zinc-700' : 'text-zinc-300'}`}>Enter envía · Shift+Enter nueva línea</p>
          </div>
        </div>
      </div>
    </>
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
  const [neutralStockEntries, setNeutralStockEntries] = useState([]);
  const [consignments, setConsignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState(false);
  
  const [expandedBatchId, setExpandedBatchId] = useState(null);
  const [expandedWholesaleClient, setExpandedWholesaleClient] = useState(null);
  const [expandedConsignmentClient, setExpandedConsignmentClient] = useState(null);
  const [expandedConsignmentOrder, setExpandedConsignmentOrder] = useState(null);
  const [expandedConsignmentHistoryClient, setExpandedConsignmentHistoryClient] = useState(null);
  const [expandedConsignmentInfoClient, setExpandedConsignmentInfoClient] = useState(null);
  const [manualFinalizeDate, setManualFinalizeDate] = useState(getTodayDate());
  const [globalMonth, setGlobalMonth] = useState('30days');
  const [newClientsFilter, setNewClientsFilter] = useState('all');
  const [metaData, setMetaData] = useState(null);
  const [metaDailyData, setMetaDailyData] = useState([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState(null);
  const [homeMetaDailyData, setHomeMetaDailyData] = useState([]);
  const [metaPeriod, setMetaPeriod] = useState('last_30d');
  const [metaCustomRange, setMetaCustomRange] = useState({ start: '2026-05-30', end: getTodayDate() });

  const [customDateRange, setCustomDateRange] = useState({ start: getTodayDate(), end: getTodayDate() });
  const [compareDateRange, setCompareDateRange] = useState({ start: getPreviousDayStr(getTodayDate()), end: getPreviousDayStr(getTodayDate()) });

  const [newBatchName, setNewBatchName] = useState('');
  const [newItem, setNewItem] = useState({ product: '', variant: '', costArs: '', initialStock: '', repeatCount: '1' });
  const [newExpense, setNewExpense] = useState({ description: '', amount: '', batchId: '', date: getTodayDate() });
  const [newNeutralStock, setNewNeutralStock] = useState({
    batchId: '',
    itemId: '',
    quantity: 1,
    unitPrice: '',
    reason: 'Stock perdido',
    note: ''
  });

  const createConsignmentLine = () => ({ id: Date.now() + Math.random(), batchId: '', itemId: '', quantity: 1, unitPrice: '' });

  const [newConsignment, setNewConsignment] = useState({
    clientName: '',
    clientPhone: '',
    clientDni: '',
    dueDate: '',
    note: '',
    lines: [createConsignmentLine()]
  });
  
  const [editingItem, setEditingItem] = useState(null);
  const [editingBatchId, setEditingBatchId] = useState(null);
  const [restoringItem, setRestoringItem] = useState(null);
  const [editingBatchName, setEditingBatchName] = useState('');

  const [selectedBatchStats, setSelectedBatchStats] = useState(null);
  const [hiddenSuggestions, setHiddenSuggestions] = useState({ products: [], variants: [] });

  // --- CONCILIADOR DE STOCK REAL ---
  const [stockSyncText, setStockSyncText] = useState('');
  const [stockSyncAnalysis, setStockSyncAnalysis] = useState(null);
  const [isApplyingStockSync, setIsApplyingStockSync] = useState(false);

  const [salesSearch, setSalesSearch] = useState('');
  const [consignmentSearch, setConsignmentSearch] = useState('');
  const [consignmentSubView, setConsignmentSubView] = useState('movimientos');
  const [editingConsignmentClientKey, setEditingConsignmentClientKey] = useState(null);
  const [consignmentClientDraft, setConsignmentClientDraft] = useState({ clientName: '', clientPhone: '', clientDni: '', clientType: '' });
  const [editingConsignmentEntryId, setEditingConsignmentEntryId] = useState(null);
  const [consignmentEntryDraft, setConsignmentEntryDraft] = useState({ unitPrice: '', dueDate: '', note: '' });
  const [salesSort, setSalesSort] = useState({ key: 'createdAt', direction: 'desc' });
  const [selectedSaleTickets, setSelectedSaleTickets] = useState({});
  const [salesDisplayLimit, setSalesDisplayLimit] = useState(120);

  const [saleGeneral, setSaleGeneral] = useState({ saleDate: getTodayDate(), accountingType: 'Normal', shippingCost: '', shippingPrice: '', source: 'Instagram', isReseller: 'No', isNewClient: 'Frecuente', wholesaleClient: '' });
  const [saleItems, setSaleItems] = useState([{ id: Date.now(), batchId: '', itemId: '', quantity: 1, unitPrice: '' }]);

  const updateSaleItem = (id, field, value) => {
    setSaleItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };
  const addSaleItem = () => {
    setSaleItems(prev => [...prev, { id: Date.now(), batchId: '', itemId: '', quantity: 1, unitPrice: '' }]);
  };
  const removeSaleItem = (id) => {
    setSaleItems(prev => prev.filter(item => item.id !== id));
  };


  const updateConsignmentLine = (id, field, value) => {
    setNewConsignment(prev => ({
      ...prev,
      lines: (prev.lines || []).map(line => line.id === id ? { ...line, [field]: value, ...(field === 'batchId' ? { itemId: '' } : {}) } : line)
    }));
  };
  const addConsignmentLine = () => {
    setNewConsignment(prev => ({ ...prev, lines: [...(prev.lines || []), createConsignmentLine()] }));
  };
  const removeConsignmentLine = (id) => {
    setNewConsignment(prev => {
      const lines = (prev.lines || []).filter(line => line.id !== id);
      return { ...prev, lines: lines.length ? lines : [createConsignmentLine()] };
    });
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

        const unsubNeutralStock = onSnapshot(query(collection(db, 'neutral_stock'), orderBy('createdAt', 'desc')), (snap) => {
            setNeutralStockEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsOffline(false);
        }, (error) => {
            console.error('Error neutral_stock:', error);
            setNeutralStockEntries([]);
        });

        const unsubConsignments = onSnapshot(query(collection(db, 'consignments'), orderBy('createdAt', 'desc')), (snap) => {
            setConsignments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsOffline(false);
        }, (error) => {
            console.error('Error consignments:', error);
            setConsignments([]);
        });

        const unsubSettings = onSnapshot(doc(db, 'settings', 'autocomplete'), (docSnap) => {
            if (docSnap.exists()) setHiddenSuggestions(docSnap.data());
            else setHiddenSuggestions({ products: [], variants: [] });
        }, (error) => console.error("Error settings:", error));
        
        setLoading(false);
        return () => { unsubBatches(); unsubSales(); unsubExp(); unsubNeutralStock(); unsubConsignments(); unsubSettings(); };
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

  const neutralSelectedBatch = useMemo(() => {
      return batches.find(b => b.id === newNeutralStock.batchId) || null;
  }, [batches, newNeutralStock.batchId]);

  const neutralAvailableItems = useMemo(() => {
      return (neutralSelectedBatch?.items || []).filter(item => (Number(item.currentStock) || 0) > 0);
  }, [neutralSelectedBatch]);

  const neutralSelectedItem = useMemo(() => {
      return neutralAvailableItems.find(item => item.id === newNeutralStock.itemId) || null;
  }, [neutralAvailableItems, newNeutralStock.itemId]);

  const neutralStockStats = useMemo(() => {
      return neutralStockEntries.reduce((acc, entry) => {
        const quantity = Number(entry.quantity) || 0;
        const revenue = Number(entry.totalSaleRaw) || 0;
        const cost = Number(entry.totalCostRaw) || 0;
        const profit = Number(entry.grossProfitRaw) || 0;
        acc.quantity += quantity;
        acc.revenue += revenue;
        acc.cost += cost;
        acc.profit += profit;
        acc.count += 1;
        return acc;
      }, { quantity: 0, revenue: 0, cost: 0, profit: 0, count: 0 });
  }, [neutralStockEntries]);

  const neutralHistoryVisible = useMemo(() => {
      return neutralStockEntries.slice(0, 80);
  }, [neutralStockEntries]);

  const getConsignmentBatchById = (batchId) => {
      return batches.find(b => b.id === batchId) || null;
  };

  const getConsignmentAvailableItems = (batchId) => {
      return ((getConsignmentBatchById(batchId)?.items) || []).filter(item => (Number(item.currentStock) || 0) > 0);
  };

  const getConsignmentItemById = (batchId, itemId) => {
      return getConsignmentAvailableItems(batchId).find(item => item.id === itemId) || null;
  };

  const consignmentDraftSummary = useMemo(() => {
      return (newConsignment.lines || []).reduce((acc, line) => {
        const item = getConsignmentItemById(line.batchId, line.itemId);
        const quantity = Number(line.quantity) || 0;
        const unitPrice = Number(line.unitPrice) || 0;
        const unitCost = Number(item?.costArs) || 0;
        if (line.batchId && line.itemId && quantity > 0) acc.rows += 1;
        acc.units += quantity;
        acc.value += unitPrice * quantity;
        acc.profit += (unitPrice - unitCost) * quantity;
        return acc;
      }, { rows: 0, units: 0, value: 0, profit: 0 });
  }, [newConsignment, batches]);

  const consignmentStats = useMemo(() => {
      return consignments.reduce((acc, entry) => {
        const delivered = Number(entry.quantityDelivered) || 0;
        const pending = Number(entry.quantityPending) || 0;
        const paid = Number(entry.quantityPaid) || 0;
        const returned = Number(entry.quantityReturned) || 0;
        const lost = Number(entry.quantityLost) || 0;
        const unitPrice = Number(entry.unitPrice) || 0;
        const unitCost = Number(entry.unitCost) || 0;

        acc.entries += 1;
        acc.delivered += delivered;
        acc.pending += pending;
        acc.paid += paid;
        acc.returned += returned;
        acc.lost += lost;
        acc.valuePending += pending * unitPrice;
        acc.valuePaid += paid * unitPrice;
        acc.estimatedProfitPending += pending * (unitPrice - unitCost);
        acc.profitPaid += paid * (unitPrice - unitCost);
        if (pending > 0) acc.activeEntries += 1;
        return acc;
      }, {
        entries: 0,
        activeEntries: 0,
        delivered: 0,
        pending: 0,
        paid: 0,
        returned: 0,
        lost: 0,
        valuePending: 0,
        valuePaid: 0,
        estimatedProfitPending: 0,
        profitPaid: 0
      });
  }, [consignments]);

  const consignmentsByClient = useMemo(() => {
      const map = {};
      consignments.forEach(entry => {
        const client = String(entry.clientName || 'Sin cliente').trim();
        if (!map[client]) {
          map[client] = {
            clientName: client,
            clientPhone: String(entry.clientPhone || entry.phone || entry.telefono || '').trim(),
            clientDni: String(entry.clientDni || entry.dni || '').trim(),
            entries: [],
            pending: 0,
            paid: 0,
            valuePending: 0,
            valuePaid: 0,
            profitPaid: 0
          };
        }
        if (!map[client].clientPhone) map[client].clientPhone = String(entry.clientPhone || entry.phone || entry.telefono || '').trim();
        if (!map[client].clientDni) map[client].clientDni = String(entry.clientDni || entry.dni || '').trim();

        const pending = Number(entry.quantityPending) || 0;
        const paid = Number(entry.quantityPaid) || 0;
        const unitPrice = Number(entry.unitPrice) || 0;
        const unitCost = Number(entry.unitCost) || 0;

        map[client].entries.push(entry);
        map[client].pending += pending;
        map[client].paid += paid;
        map[client].valuePending += pending * unitPrice;
        map[client].valuePaid += paid * unitPrice;
        map[client].profitPaid += paid * (unitPrice - unitCost);
      });

      return Object.values(map).sort((a, b) => (b.valuePending + b.valuePaid) - (a.valuePending + a.valuePaid));
  }, [consignments]);

  const consignmentOrders = useMemo(() => {
      const map = {};
      consignments.forEach(entry => {
        const ticketId = String(entry.consignmentTicketId || entry.ticketId || entry.id || '').trim() || entry.id;
        if (!map[ticketId]) {
          map[ticketId] = {
            id: ticketId,
            clientName: String(entry.clientName || 'Sin cliente').trim(),
            clientPhone: String(entry.clientPhone || entry.phone || entry.telefono || '').trim(),
            clientDni: String(entry.clientDni || entry.dni || '').trim(),
            clientType: String(entry.clientType || entry.tipoCliente || '').trim(),
            entries: [],
            delivered: 0,
            pending: 0,
            paid: 0,
            returned: 0,
            lost: 0,
            valuePending: 0,
            valuePaid: 0,
            profitPaid: 0,
            createdAt: entry.createdAt || '',
            updatedAt: entry.updatedAt || entry.createdAt || '',
            dueDate: entry.dueDate || '',
            note: entry.note || ''
          };
        }

        const order = map[ticketId];

        if (!order.clientName || order.clientName === 'Sin cliente') order.clientName = String(entry.clientName || 'Sin cliente').trim();
        if (!order.clientPhone) order.clientPhone = String(entry.clientPhone || entry.phone || entry.telefono || '').trim();
        if (!order.clientDni) order.clientDni = String(entry.clientDni || entry.dni || '').trim();
        if (!order.clientType) order.clientType = String(entry.clientType || entry.tipoCliente || '').trim();
        if (!order.dueDate) order.dueDate = entry.dueDate || '';
        if (!order.note) order.note = entry.note || '';

        const delivered = Number(entry.quantityDelivered) || 0;
        const pending = Number(entry.quantityPending) || 0;
        const paid = Number(entry.quantityPaid) || 0;
        const returned = Number(entry.quantityReturned) || 0;
        const lost = Number(entry.quantityLost) || 0;
        const unitPrice = Number(entry.unitPrice) || 0;
        const unitCost = Number(entry.unitCost) || 0;

        order.entries.push(entry);
        order.delivered += delivered;
        order.pending += pending;
        order.paid += paid;
        order.returned += returned;
        order.lost += lost;
        order.valuePending += pending * unitPrice;
        order.valuePaid += paid * unitPrice;
        order.profitPaid += paid * (unitPrice - unitCost);

        const movementDate = entry.updatedAt || entry.createdAt || '';
        if (movementDate && safeDateTime(movementDate) > safeDateTime(order.updatedAt)) order.updatedAt = movementDate;
        if (entry.createdAt && (!order.createdAt || safeDateTime(entry.createdAt) < safeDateTime(order.createdAt))) order.createdAt = entry.createdAt;
      });

      return Object.values(map).map(order => ({
        ...order,
        entries: order.entries.sort((a, b) => safeDateTime(b.updatedAt || b.createdAt) - safeDateTime(a.updatedAt || a.createdAt))
      })).sort((a, b) => safeDateTime(b.createdAt || b.updatedAt) - safeDateTime(a.createdAt || a.updatedAt));
  }, [consignments]);

  const consignmentClientHistory = useMemo(() => {
      const map = {};
      consignments.forEach(entry => {
        const client = String(entry.clientName || 'Sin cliente').trim();
        if (!map[client]) {
          map[client] = {
            clientName: client,
            clientPhone: String(entry.clientPhone || entry.phone || entry.telefono || '').trim(),
            clientDni: String(entry.clientDni || entry.dni || '').trim(),
            clientType: String(entry.clientType || entry.tipoCliente || '').trim(),
            entries: [],
            delivered: 0,
            pending: 0,
            paid: 0,
            returned: 0,
            lost: 0,
            valueDelivered: 0,
            valuePending: 0,
            valuePaid: 0,
            profitPaid: 0,
            firstMovement: null,
            lastMovement: null
          };
        }

        if (!map[client].clientPhone) map[client].clientPhone = String(entry.clientPhone || entry.phone || entry.telefono || '').trim();
        if (!map[client].clientDni) map[client].clientDni = String(entry.clientDni || entry.dni || '').trim();
        if (!map[client].clientType) map[client].clientType = String(entry.clientType || entry.tipoCliente || '').trim();

        const delivered = Number(entry.quantityDelivered) || 0;
        const pending = Number(entry.quantityPending) || 0;
        const paid = Number(entry.quantityPaid) || 0;
        const returned = Number(entry.quantityReturned) || 0;
        const lost = Number(entry.quantityLost) || 0;
        const unitPrice = Number(entry.unitPrice) || 0;
        const unitCost = Number(entry.unitCost) || 0;
        const movementDate = entry.updatedAt || entry.createdAt || entry.lastPaidAt || entry.lastReturnedAt || entry.lastLostAt || '';

        map[client].entries.push(entry);
        map[client].delivered += delivered;
        map[client].pending += pending;
        map[client].paid += paid;
        map[client].returned += returned;
        map[client].lost += lost;
        map[client].valueDelivered += delivered * unitPrice;
        map[client].valuePending += pending * unitPrice;
        map[client].valuePaid += paid * unitPrice;
        map[client].profitPaid += paid * (unitPrice - unitCost);

        if (entry.createdAt && (!map[client].firstMovement || safeDateTime(entry.createdAt) < safeDateTime(map[client].firstMovement))) {
          map[client].firstMovement = entry.createdAt;
        }
        if (movementDate && (!map[client].lastMovement || safeDateTime(movementDate) > safeDateTime(map[client].lastMovement))) {
          map[client].lastMovement = movementDate;
        }
      });

      return Object.values(map).map(client => ({
        ...client,
        entries: client.entries.sort((a, b) => safeDateTime(b.updatedAt || b.createdAt) - safeDateTime(a.updatedAt || a.createdAt))
      })).sort((a, b) => safeDateTime(b.lastMovement) - safeDateTime(a.lastMovement));
  }, [consignments]);

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
      { value: 'custom', label: 'Rango Personalizado' },
      { value: 'compare', label: 'Comparar Fechas (Mano a Mano)' },
      { value: 'all', label: '-- Histórico Completo --' },
      ...sortedMonths.map(m => {
        const [year, month] = m.split('-');
        const date = new Date(year, parseInt(month) - 1);
        const monthName = date.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        return { value: m, label: monthName.charAt(0).toUpperCase() + monthName.slice(1) };
      })
    ];
  }, [sales, expenses, batches]);

  const analysisData = useMemo(() => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const calculateForRange = (start, end, isAll = false) => {
          const inRange = (dateString) => {
              if (!dateString) return false;
              if (isAll) return true;
              const d = new Date(dateString);
              if (isNaN(d.getTime())) return false;
              return d >= start && d <= end;
          };

          const fSales = sales.filter(s => inRange(s.date));
          const fExp = expenses.filter(e => inRange(e.date));
          const fBatches = batches.filter(b => inRange(b.createdAt));

          // Stock neutro: no entra por día/mes. Solo suma en Histórico Completo.
          const fNeutral = isAll ? neutralStockEntries : [];
          const neutralRevenue = fNeutral.reduce((acc, n) => acc + (Number(n.totalSaleRaw) || 0), 0);
          const neutralCost = fNeutral.reduce((acc, n) => acc + (Number(n.totalCostRaw) || 0), 0);
          const neutralProfit = fNeutral.reduce((acc, n) => acc + (Number(n.grossProfitRaw) || 0), 0);

          let totalRevenue = 0, itemsSold = 0, totalShippingProfit = 0;
          const sourceCounts = {};
          const typeCounts = { Revendedor: 0, Final: 0 };

          fSales.forEach(s => {
              totalRevenue += s.totalSaleRaw || 0;
              itemsSold += s.quantity || 0;
              totalShippingProfit += (s.totalSaleRaw || 0) - ((s.unitPrice || 0) * (s.quantity || 0));
              const src = s.source || 'Otro';
              sourceCounts[src] = (sourceCounts[src] || 0) + 1;
              if (s.isReseller === 'Si' || s.isReseller === true) typeCounts.Revendedor++; else typeCounts.Final++;
          });

          const totalInvestment = fBatches.reduce((acc, b) => acc + (b.items || []).reduce((a, i) => a + ((i.costArs || 0) * (i.initialStock || 0)), 0), 0);
          const totalGlobalExpenses = fExp.reduce((acc, e) => acc + (e.amount || 0), 0);
          const costOfSoldFiltered = fSales.reduce((acc, s) => acc + ((s.costArsAtSale || 0) * (s.quantity || 0)), 0);

          // La ganancia neutra no modifica ventas diarias/mensuales, pero sí el global histórico.
          const grossProfit = (totalRevenue - costOfSoldFiltered) + neutralProfit;
          const netProfit = grossProfit - totalGlobalExpenses;
          const cashBalance = (totalRevenue + neutralRevenue) - totalInvestment - totalGlobalExpenses;

          const currentStockValue = batches.filter(b => !b.finalizedAt).reduce((acc, b) => acc + (b.items || []).reduce((a, i) => a + ((i.costArs || 0) * (i.currentStock || 0)), 0), 0);

          const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
          const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

          let daysActive;
          if (isAll) {
              const saleDates = fSales.map(s => new Date(s.date)).filter(d => !isNaN(d.getTime()));
              if (saleDates.length > 0) {
                  const firstSale = new Date(Math.min(...saleDates));
                  daysActive = Math.max(1, Math.ceil((new Date() - firstSale) / (1000 * 60 * 60 * 24)));
              } else {
                  daysActive = 1;
              }
          } else {
              daysActive = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
          }
          const dailyAvgItems = daysActive > 0 ? itemsSold / daysActive : 0;

          const pieSourceData = Object.entries(sourceCounts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
          const pieTypeData = [{ name: 'Consumidor', value: typeCounts.Final }, { name: 'Revendedor', value: typeCounts.Revendedor }].filter(d => d.value > 0);

          const uniqueDateStrs = [...new Set(fSales.filter(s => s.date).map(s => {
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

          return {
              totalRevenue, neutralRevenue, neutralCost, neutralProfit, totalInvestment, totalGlobalExpenses, grossProfit, grossMargin,
              totalShippingProfit, netProfit, netMargin, cashBalance, currentStockValue,
              itemsSold, salesCount: fSales.length, sourceCounts, typeCounts, dailyAvgItems,
              daysActive, currentStreak, filteredSales: fSales, pieSourceData, pieTypeData
          };
      };

      let bStart, bEnd, isAll = false;
      if (globalMonth === 'today') {
          bStart = todayStart; bEnd = new Date(todayStart); bEnd.setHours(23,59,59,999);
      } else if (globalMonth === 'week') {
          bStart = new Date(todayStart); bStart.setDate(bStart.getDate() - 6);
          bEnd = new Date(todayStart); bEnd.setHours(23,59,59,999);
      } else if (globalMonth === '15days') {
           bStart = new Date(todayStart); bStart.setDate(bStart.getDate() - 14);
           bEnd = new Date(todayStart); bEnd.setHours(23,59,59,999);
      } else if (globalMonth === '30days') {
           bStart = new Date(todayStart); bStart.setDate(bStart.getDate() - 29);
           bEnd = new Date(todayStart); bEnd.setHours(23,59,59,999);
      } else if (globalMonth === 'custom' || globalMonth === 'compare') {
           const [sy, sm, sd] = customDateRange.start.split('-').map(Number);
           const [ey, em, ed] = customDateRange.end.split('-').map(Number);
           bStart = new Date(sy, sm - 1, sd, 0, 0, 0);
           bEnd = new Date(ey, em - 1, ed, 23, 59, 59, 999);
      } else if (globalMonth === 'all') {
           isAll = true; bStart = new Date(0); bEnd = new Date();
      } else {
           const [y, m] = globalMonth.split('-').map(Number);
           bStart = new Date(y, m - 1, 1);
           bEnd = new Date(y, m, 0, 23, 59, 59, 999);
      }

      const baseStats = calculateForRange(bStart, bEnd, isAll);

      let prevBaseStats = null;
      let compareStats = null;

      if (globalMonth === 'compare') {
           const [csy, csm, csd] = compareDateRange.start.split('-').map(Number);
           const [cey, cem, ced] = compareDateRange.end.split('-').map(Number);
           const cStart = new Date(csy, csm - 1, csd, 0, 0, 0);
           const cEnd = new Date(cey, cem - 1, ced, 23, 59, 59, 999);
           compareStats = calculateForRange(cStart, cEnd, false);
      } else if (globalMonth !== 'all' && globalMonth !== 'custom') {
           const diffTime = bEnd.getTime() - bStart.getTime();
           const pEnd = new Date(bStart.getTime() - 1);
           const pStart = new Date(pEnd.getTime() - diffTime);
           prevBaseStats = calculateForRange(pStart, pEnd, false);
      }

      return { baseStats, compareStats, prevBaseStats, rangeStart: bStart, rangeEnd: bEnd };
  }, [sales, batches, expenses, neutralStockEntries, globalMonth, customDateRange, compareDateRange]);

  const teamStats = useMemo(() => {
      const stats = {};
      const fs = analysisData.baseStats.filteredSales;
      fs.forEach(s => {
          const seller = normalizeSellerName(s.seller);
          if (!stats[seller]) stats[seller] = { count: 0, revenue: 0, cost: 0, items: 0 };
          stats[seller].count += 1;
          stats[seller].revenue += s.totalSaleRaw || 0;
          stats[seller].cost   += (s.costArsAtSale || 0) * (s.quantity || 1);
          stats[seller].items  += s.quantity || 0;
      });
      const totalRevenue = fs.reduce((a, s) => a + (s.totalSaleRaw || 0), 0);
      return Object.entries(stats).map(([name, d]) => ({
          name,
          count:       d.count,
          revenue:     d.revenue,
          cost:        d.cost,
          profit:      d.revenue - d.cost,
          items:       d.items,
          avgTicket:   d.count > 0 ? d.revenue / d.count : 0,
          share:       totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0,
          commission:  name === 'Buono' ? d.revenue * 0.03 : null,
      })).sort((a, b) => b.revenue - a.revenue);
  }, [analysisData.baseStats.filteredSales]);

  const newClientsList = useMemo(() => {
      return analysisData.baseStats.filteredSales
          .filter(s => isNewClientStatus(s.isNewClient))
          .map(s => ({...s, seller: normalizeSellerName(s.seller)}))
          .sort((a,b) => new Date(b.date) - new Date(a.date));
  }, [analysisData.baseStats.filteredSales]);

  const sparklineData7d = useMemo(() => {
    const MN = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const today = new Date();
    const dayKeys = Array.from({length: 7}, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - (6 - i));
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    });
    const labels = Array.from({length: 7}, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - (6 - i));
      return `${String(d.getDate()).padStart(2,'0')} ${MN[d.getMonth()]}`;
    });
    const rev = new Array(7).fill(0);
    const units = new Array(7).fill(0);
    const profit = new Array(7).fill(0);
    const clients = new Array(7).fill(0);
    const organicClients = new Array(7).fill(0);
    const adsClients = new Array(7).fill(0);
    const resellerClients = new Array(7).fill(0);
    const exps = new Array(7).fill(0);
    const txCount = new Array(7).fill(0);
    const invest = new Array(7).fill(0);
    sales.forEach(s => {
      if (!s.date) return;
      const d = new Date(s.date);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const idx = dayKeys.indexOf(key);
      if (idx >= 0) {
        rev[idx] += s.totalSaleRaw || 0;
        units[idx] += s.quantity || 0;
        profit[idx] += (s.totalSaleRaw || 0) - (s.costArsAtSale || 0);
        txCount[idx] += 1;
        if (isNewClientStatus(s.isNewClient)) clients[idx] += 1;
        if (s.isNewClient === 'Nuevo - Organico' || s.isNewClient === true) organicClients[idx] += 1;
        if (s.isNewClient === 'Nuevo - Publicidad') adsClients[idx] += 1;
        if (s.isNewClient === 'Revendedor') resellerClients[idx] += 1;
      }
    });
    expenses.forEach(e => {
      if (!e.date) return;
      const d = new Date(e.date);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const idx = dayKeys.indexOf(key);
      if (idx >= 0) exps[idx] += e.amount || 0;
    });
    batches.forEach(b => {
      if (!b.createdAt) return;
      const d = new Date(b.createdAt);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const idx = dayKeys.indexOf(key);
      if (idx >= 0) invest[idx] += (b.items || []).reduce((s, i) => s + (i.costArs||0)*(i.initialStock||0), 0);
    });
    const avgTicket = rev.map((r, i) => txCount[i] > 0 ? r / txCount[i] : 0);
    return { revenue: rev, units, profit, clients, organicClients, adsClients, resellerClients, expenses: exps, avgTicket, investment: invest, labels };
  }, [sales, expenses, batches]);

  const metaFirebaseStats = useMemo(() => {
    const today = new Date(); today.setHours(23,59,59,999);
    let start, end = new Date(today);
    if (metaPeriod === 'today') {
      start = new Date(today); start.setHours(0,0,0,0);
    } else if (metaPeriod === 'yesterday') {
      end = new Date(today); end.setDate(end.getDate()-1); end.setHours(23,59,59,999);
      start = new Date(end); start.setHours(0,0,0,0);
    } else if (metaPeriod === 'this_month') {
      start = new Date(today.getFullYear(), today.getMonth(), 1, 0,0,0,0);
    } else if (metaPeriod === 'last_month') {
      start = new Date(today.getFullYear(), today.getMonth()-1, 1, 0,0,0,0);
      end = new Date(today.getFullYear(), today.getMonth(), 0, 23,59,59,999);
    } else if (metaPeriod === 'historico') {
      start = new Date(2026, 4, 30, 0, 0, 0, 0);
    } else if (metaPeriod === 'custom') {
      const [sy,sm,sd] = metaCustomRange.start.split('-').map(Number);
      const [ey,em,ed] = metaCustomRange.end.split('-').map(Number);
      start = new Date(sy, sm-1, sd, 0,0,0,0);
      end   = new Date(ey, em-1, ed, 23,59,59,999);
    } else {
      const days = metaPeriod === 'last_7d' ? 7 : metaPeriod === 'last_14d' ? 14 : metaPeriod === 'last_90d' ? 90 : 30;
      start = new Date(today); start.setDate(start.getDate()-(days-1)); start.setHours(0,0,0,0);
    }
    const inR = d => { const dt = new Date(d); return !isNaN(dt) && dt >= start && dt <= end; };
    const fs = sales.filter(s => s.date && inR(s.date) && s.isNewClient === 'Nuevo - Publicidad');
    const fe = expenses.filter(e => e.date && inR(e.date));
    const revenue = fs.reduce((s,v) => s+(v.totalSaleRaw||0), 0);
    const cost    = fs.reduce((s,v) => s+(v.costArsAtSale||0), 0);
    const totalExp = fe.reduce((s,v) => s+(v.amount||0), 0);
    const totalAllRevenue = sales.filter(s => s.date && inR(s.date)).reduce((s,v) => s+(v.totalSaleRaw||0), 0);
    const adsByDate = {};
    fs.forEach(s => {
      const d = s.date?.slice(0, 10); if (!d) return;
      if (!adsByDate[d]) adsByDate[d] = { revenue: 0, cost: 0 };
      adsByDate[d].revenue += s.totalSaleRaw || 0;
      adsByDate[d].cost    += s.costArsAtSale || 0;
    });
    const allByDate = {};
    sales.filter(s => s.date && inR(s.date)).forEach(s => {
      const d = s.date?.slice(0, 10); if (!d) return;
      allByDate[d] = (allByDate[d] || 0) + (s.totalSaleRaw || 0);
    });
    return { revenue, netProfit: revenue - cost, grossProfit: revenue - cost, totalExp, salesCount: fs.length, totalAllRevenue, adsByDate, allByDate };
  }, [sales, expenses, metaPeriod, metaCustomRange]);

  const fetchMetaInsights = async () => {
    const token = import.meta.env.VITE_META_ACCESS_TOKEN;
    const accountId = import.meta.env.VITE_META_AD_ACCOUNT_ID;
    if (!token || !accountId) { setMetaError('Credenciales de Meta no configuradas en .env'); return; }
    setMetaLoading(true); setMetaError(null);
    try {
      const base = `https://graph.facebook.com/v19.0/${accountId}/insights`;
      const today = new Date().toISOString().slice(0,10);
      const daysMap = { last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 };
      const daysCount = daysMap[metaPeriod];
      const sinceDate = daysCount
        ? (() => { const d = new Date(); d.setDate(d.getDate() - (daysCount - 1)); return d.toISOString().slice(0, 10); })()
        : null;
      const periodParam = metaPeriod === 'historico'
        ? `time_range={"since":"2026-05-30","until":"${today}"}`
        : metaPeriod === 'custom'
        ? `time_range={"since":"${metaCustomRange.start}","until":"${metaCustomRange.end}"}`
        : sinceDate
        ? `time_range={"since":"${sinceDate}","until":"${today}"}`
        : `date_preset=${metaPeriod}`;
      const params = `${periodParam}&access_token=${token}`;
      const [sRes, dRes] = await Promise.all([
        fetch(`${base}?fields=spend,reach,frequency,ctr,cpm,impressions,clicks,actions&${params}`),
        fetch(`${base}?fields=spend,ctr,clicks,impressions,reach,frequency,cpm,actions&time_increment=1&${params}`)
      ]);
      const sJson = await sRes.json();
      const dJson = await dRes.json();
      if (sJson.error) throw new Error(sJson.error.message);
      setMetaData(sJson.data?.[0] || null);
      setMetaDailyData(dJson.data || []);
    } catch (e) { setMetaError(e.message); }
    finally { setMetaLoading(false); }
  };

  useEffect(() => {
    if (activeTab === 'metaads') fetchMetaInsights();
    // eslint-disable-next-line
  }, [activeTab, metaPeriod]);

  // Carga silenciosa de datos diarios de Meta Ads para correlación con Inicio
  useEffect(() => {
    const fetchHomeMetaDaily = async () => {
      const token = import.meta.env.VITE_META_ACCESS_TOKEN;
      const accountId = import.meta.env.VITE_META_AD_ACCOUNT_ID;
      if (!token || !accountId) return;
      try {
        const today = new Date().toISOString().slice(0, 10);
        const base = `https://graph.facebook.com/v19.0/${accountId}/insights`;
        const res = await fetch(
          `${base}?fields=spend&time_increment=1&time_range={"since":"2026-05-30","until":"${today}"}&access_token=${token}`
        );
        const json = await res.json();
        if (!json.error && Array.isArray(json.data)) setHomeMetaDailyData(json.data);
      } catch {}
    };
    fetchHomeMetaDaily();
  }, []);

  const wholesaleData = useMemo(() => {
      const wholesaleSales = sales
        .filter(s => {
          const clientName = String(s.clientName || s.wholesaleClient || s.resellerName || '').trim();
          const isNewWholesale = s.operationType === 'MAYORISTA' || !!clientName;
          const isConsignmentPayment = !!s.consignmentId || s.source === 'Consignación';
          return isNewWholesale && !isConsignmentPayment;
        })
        .map(s => ({
          ...s,
          clientName: String(s.clientName || s.wholesaleClient || s.resellerName || '').trim()
        }))
        .filter(s => !!s.clientName);

      const clientsMap = {};
      const globalTickets = new Set();

      wholesaleSales.forEach(s => {
        const clientKey = String(s.clientName || 'Sin cliente').trim().toLowerCase() || 'sin cliente';
        const clientLabel = String(s.clientName || 'Sin cliente').trim() || 'Sin cliente';
        const ticketId = s.ticketId || s.id;
        const saleDate = s.date || s.createdAt;
        globalTickets.add(ticketId);

        if (!clientsMap[clientKey]) {
          clientsMap[clientKey] = {
            name: clientLabel,
            revenue: 0,
            profit: 0,
            units: 0,
            lines: 0,
            tickets: new Set(),
            lastDate: null,
            products: {},
            orderMap: {}
          };
        }

        const client = clientsMap[clientKey];
        const revenue = Number(s.totalSaleRaw) || 0;
        const quantity = Number(s.quantity) || 0;
        const cost = Number(s.costArsAtSale) || 0;
        const profit = revenue - (cost * quantity);
        const productKey = `${s.productName || 'Sin producto'} / ${s.variant || 'Único'}`;

        client.revenue += revenue;
        client.profit += profit;
        client.units += quantity;
        client.lines += 1;
        client.tickets.add(ticketId);
        client.products[productKey] = (client.products[productKey] || 0) + quantity;

        if (!client.orderMap[ticketId]) {
          client.orderMap[ticketId] = {
            ticketId,
            date: saleDate,
            totalSaleRaw: 0,
            quantity: 0,
            profit: 0,
            originalSales: [],
            products: {}
          };
        }

        const order = client.orderMap[ticketId];
        order.totalSaleRaw += revenue;
        order.quantity += quantity;
        order.profit += profit;
        order.originalSales.push(s);
        order.products[productKey] = (order.products[productKey] || 0) + quantity;
        if (saleDate && (!order.date || new Date(saleDate) > new Date(order.date))) order.date = saleDate;

        if (saleDate && (!client.lastDate || new Date(saleDate) > new Date(client.lastDate))) {
          client.lastDate = saleDate;
        }
      });

      const clients = Object.values(clientsMap).map(c => {
        const orderGroups = Object.values(c.orderMap)
          .map(order => ({
            ...order,
            productList: Object.entries(order.products)
              .map(([name, quantity]) => ({ name, quantity }))
              .sort((a, b) => b.quantity - a.quantity)
          }))
          .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        return {
          ...c,
          orderGroups,
          orders: orderGroups.length,
          avgTicket: orderGroups.length ? c.revenue / orderGroups.length : 0,
          topProducts: Object.entries(c.products)
            .map(([name, quantity]) => ({ name, quantity }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 4)
        };
      }).sort((a, b) => b.revenue - a.revenue);

      return {
        sales: wholesaleSales,
        clients,
        activeClients: clients.length,
        orders: globalTickets.size,
        totalRevenue: wholesaleSales.reduce((acc, s) => acc + (Number(s.totalSaleRaw) || 0), 0),
        totalUnits: wholesaleSales.reduce((acc, s) => acc + (Number(s.quantity) || 0), 0),
        totalProfit: wholesaleSales.reduce((acc, s) => acc + ((Number(s.totalSaleRaw) || 0) - ((Number(s.costArsAtSale) || 0) * (Number(s.quantity) || 0))), 0)
      };
  }, [sales]);

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

  const processedSales = useMemo(() => {
    const neutralAsSales = neutralStockEntries.map(entry => ({
      id: entry.id,
      neutralDocId: entry.id,
      collectionName: 'neutral_stock',
      ticketId: entry.ticketId || `NEUTRO-${entry.id}`,
      createdAt: entry.createdAt,
      date: entry.createdAt,
      batchId: entry.batchId,
      batchName: entry.batchName,
      itemId: entry.itemId,
      productName: entry.productName,
      variant: entry.variant,
      quantity: Number(entry.quantity) || 0,
      unitPrice: Number(entry.unitPrice) || 0,
      totalSaleRaw: Number(entry.totalSaleRaw) || 0,
      costArsAtSale: Number(entry.costArsAtEntry) || 0,
      shippingCostArs: 0,
      source: entry.source || 'Neutro',
      isReseller: false,
      isNewClient: false,
      seller: entry.seller || '028 Import',
      isNeutral: true,
      accountingType: 'neutral',
      neutralReason: entry.reason || 'Neutro',
      neutralNote: entry.note || ''
    }));

    let result = [...sales, ...neutralAsSales].filter(s => s != null);

    const normalizeText = (value) => String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    const normalizeMoney = (value) => String(value ?? '').replace(/[^0-9]/g, '');

    if (salesSearch.trim()) {
      const textQuery = normalizeText(salesSearch);
      const compactQuery = textQuery.replace(/\s+/g, '');
      const moneyQuery = normalizeMoney(salesSearch);

      result = result.filter(s => {
        const seller = normalizeSellerName(s.seller);
        const resellerLabel = s.isReseller === true || s.isReseller === 'Si' ? 'revendedor si mayorista' : 'consumidor final no';
        const newClientLabel = getClientSearchLabel(s.isNewClient);
        const profit = (s.totalSaleRaw || 0) - ((s.costArsAtSale || 0) * (s.quantity || 0));
        const shippingProfit = (s.totalSaleRaw || 0) - ((s.unitPrice || 0) * (s.quantity || 0));

        const searchableText = normalizeText([
          s.productName,          // nombre del producto
          s.variant,              // sabor / variante
          s.batchName,            // lote
          s.source,               // Instagram, WhatsApp, etc.
          s.isNeutral ? 'neutro global neutral stock' : '',
          s.neutralReason || '',
          s.neutralNote || '',
          seller,                 // 028 Import / Buono
          resellerLabel,          // revendedor / consumidor final
          newClientLabel,         // cliente nuevo / frecuente
          safeDateStr(s.date),
          safeDateStr(s.createdAt || s.date),
          `cantidad ${s.quantity || 0}`,
          `precio ${s.unitPrice || 0}`,
          `total ${s.totalSaleRaw || 0}`,
          `costo ${s.costArsAtSale || 0}`,
          `ganancia ${profit}`,
          `envio ${shippingProfit}`
        ].join(' '));

        const searchableNumbers = [
          s.quantity,
          s.unitPrice,
          s.totalSaleRaw,
          s.costArsAtSale,
          profit,
          shippingProfit
        ].map(normalizeMoney).join(' ');

        const compactSearchableText = searchableText.replace(/\s+/g, '');

        return (
          searchableText.includes(textQuery) ||
          compactSearchableText.includes(compactQuery) ||
          (moneyQuery && searchableNumbers.includes(moneyQuery))
        );
      });
    }

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
  }, [sales, neutralStockEntries, salesSearch, salesSort]);

  const groupedSales = useMemo(() => {
    const map = {};
    const result = [];
    processedSales.forEach(s => {
      const key = s.ticketId || s.id; 
      if (!map[key]) {
        map[key] = {
          ticketId: key,
          date: s.date,
          createdAt: s.createdAt || s.date,
          totalSaleRaw: 0,
          totalProfit: 0,
          isReseller: s.isReseller, 
          isNewClient: s.isNewClient, 
          seller: normalizeSellerName(s.seller),
          isNeutral: !!s.isNeutral || s.accountingType === 'neutral',
          neutralReason: s.neutralReason || '',
          items: [],
          originalSales: []
        };
        result.push(map[key]); 
      }
      if (s.isNeutral || s.accountingType === 'neutral') {
        map[key].isNeutral = true;
        map[key].neutralReason = s.neutralReason || map[key].neutralReason || 'Neutro';
      }

      map[key].items.push({
        quantity: s.quantity,
        productName: s.productName,
        variant: s.variant,
        batchName: s.batchName,
        unitPrice: s.unitPrice,
        isNeutral: !!s.isNeutral || s.accountingType === 'neutral',
        neutralReason: s.neutralReason || ''
      });
      map[key].totalSaleRaw += (s.totalSaleRaw || 0);
      map[key].totalProfit += ((s.totalSaleRaw || 0) - ((s.costArsAtSale || 0) * (s.quantity || 0)));
      map[key].originalSales.push(s);
    });
    return result;
  }, [processedSales]);

  useEffect(() => {
    setSalesDisplayLimit(120);
  }, [salesSearch, salesSort.key, salesSort.direction]);

  const selectedSaleGroups = useMemo(() => {
    return groupedSales.filter(group => selectedSaleTickets[group.ticketId]);
  }, [groupedSales, selectedSaleTickets]);

  const selectedSalesSummary = useMemo(() => {
    return selectedSaleGroups.reduce((acc, group) => {
      acc.salesCount += 1;
      acc.linesCount += group.originalSales.length;
      acc.productsCount += group.originalSales.reduce((sum, sale) => sum + (Number(sale.quantity) || 0), 0);
      acc.revenue += group.totalSaleRaw || 0;
      acc.profit += group.totalProfit || 0;
      return acc;
    }, { salesCount: 0, linesCount: 0, productsCount: 0, revenue: 0, profit: 0 });
  }, [selectedSaleGroups]);

  const visibleGroupedSales = useMemo(() => {
    return groupedSales.slice(0, salesDisplayLimit);
  }, [groupedSales, salesDisplayLimit]);

  const hasMoreGroupedSales = groupedSales.length > visibleGroupedSales.length;

  const allVisibleSalesSelected = visibleGroupedSales.length > 0 && visibleGroupedSales.every(group => selectedSaleTickets[group.ticketId]);

  const toggleSaleTicketSelection = (ticketId) => {
    setSelectedSaleTickets(prev => {
      const next = { ...prev };
      if (next[ticketId]) delete next[ticketId];
      else next[ticketId] = true;
      return next;
    });
  };

  const toggleAllVisibleSalesSelection = () => {
    setSelectedSaleTickets(prev => {
      const next = { ...prev };
      if (allVisibleSalesSelected) {
        visibleGroupedSales.forEach(group => delete next[group.ticketId]);
      } else {
        visibleGroupedSales.forEach(group => { next[group.ticketId] = true; });
      }
      return next;
    });
  };

  const clearSelectedSales = () => setSelectedSaleTickets({});

  const toggleSort = (key) => {
    setSalesSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  const handleExportSales = () => {
      const headers = ['Fecha', 'Lote', 'Producto', 'Variante', 'Cantidad', 'Precio Unitario', 'Total Venta', 'Costo Unitario', 'Ganancia Envio', 'Origen', 'Revendedor', 'Cliente', 'Vendedor'];
      const rows = processedSales.map(s => [
          safeDateStr(s.date), s.batchName || '', s.productName || '', s.variant || '', 
          s.quantity || 0, s.unitPrice || 0, s.totalSaleRaw || 0, s.costArsAtSale || 0, 
          ((s.totalSaleRaw || 0) - ((s.unitPrice || 0) * (s.quantity || 0))), s.source || '', s.isReseller ? 'Si' : 'No', getClientStatusLabel(s.isNewClient), normalizeSellerName(s.seller)
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

  const formatBatchForCopy = (batch, mode = 'simple') => {
      const items = batch?.items || [];
      const header = [
        `LOTE: ${batch?.name || 'Sin nombre'}`,
        `ESTADO: ${batch?.finalizedAt ? 'Archivado' : 'Activo'}`,
        `FECHA: ${safeDateStr(batch?.createdAt)}`,
        `ITEMS: ${items.length}`,
        ''
      ];

      if (!items.length) return `${header.join('\n')}Lote vacío.`;

      const grouped = new Map();
      items.forEach(item => {
        const product = String(item.product || 'SIN PRODUCTO').trim();
        if (!grouped.has(product)) grouped.set(product, []);
        grouped.get(product).push(item);
      });

      const body = [];

      Array.from(grouped.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([product, groupItems]) => {
          body.push(product);

          groupItems
            .slice()
            .sort((a, b) => String(a.variant || '').localeCompare(String(b.variant || '')))
            .forEach(item => {
              const variant = String(item.variant || 'Único').trim();
              const currentStock = Number(item.currentStock) || 0;
              const initialStock = Number(item.initialStock) || 0;
              const cost = Number(item.costArs) || 0;

              if (mode === 'detailed') {
                body.push(`- ${variant} (${currentStock}) | inicial ${initialStock} | costo ${formatMoney(cost)}`);
              } else {
                body.push(`${variant} (${currentStock})`);
              }
            });

          body.push('');
        });

      return [...header, ...body].join('\n').trim();
  };

  const formatAllBatchesForCopy = (onlyActive = false) => {
      const source = onlyActive ? batches.filter(b => !b.finalizedAt) : batches;
      if (!source.length) return 'No hay lotes cargados.';
      return source.map(batch => formatBatchForCopy(batch, 'simple')).join('\n\n------------------------------\n\n');
  };

  const copyTextToClipboard = async (textToCopy, successMessage = 'Copiado al portapapeles') => {
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(textToCopy);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = textToCopy;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        showToast(successMessage, 'success');
      } catch (e) {
        showToast('No pude copiar automáticamente. Seleccioná el texto y copialo manualmente.', 'error');
      }
  };

  const copyBatchToClipboard = (batch, mode = 'simple') => {
      copyTextToClipboard(formatBatchForCopy(batch, mode), `Lote "${batch?.name || 'Sin nombre'}" copiado`);
  };

  const copyAllBatchesToClipboard = (onlyActive = false) => {
      copyTextToClipboard(
        formatAllBatchesForCopy(onlyActive),
        onlyActive ? 'Todos los lotes activos copiados' : 'Todos los lotes copiados'
      );
  };

  const handleCreateConsignment = async () => {
    if (!newConsignment.clientName.trim()) return showToast('Escribí el nombre del cliente/consignatario.', 'error');

    const validLines = (newConsignment.lines || []).filter(line => line.batchId && line.itemId && (parseInt(line.quantity) || 0) > 0);
    if (!validLines.length) return showToast('Agregá al menos un producto a la consignación.', 'error');

    const batchMap = new Map();
    const consignmentEntries = [];

    for (const line of validLines) {
      const batch = batches.find(b => b.id === line.batchId);
      if (!batch) return showToast('Uno de los lotes seleccionados no existe.', 'error');

      const item = (batch.items || []).find(i => i.id === line.itemId);
      if (!item) return showToast('Uno de los productos seleccionados no existe en su lote.', 'error');

      const quantity = parseInt(line.quantity) || 0;
      if (quantity <= 0) return showToast('Todas las cantidades tienen que ser mayores a 0.', 'error');

      const currentStock = Number(item.currentStock) || 0;
      if (quantity > currentStock) return showToast(`Stock insuficiente para ${item.product || 'producto'} / ${item.variant || 'Único'}. Disponible: ${currentStock}.`, 'error');

      const unitPrice = parseFloat(line.unitPrice || 0);
      if (unitPrice <= 0 || Number.isNaN(unitPrice)) return showToast(`Cargá el precio acordado por unidad para ${item.product || 'producto'} / ${item.variant || 'Único'}.`, 'error');

      if (!batchMap.has(batch.id)) {
        batchMap.set(batch.id, { batch, items: (batch.items || []).map(i => ({ ...i })) });
      }

      const batchState = batchMap.get(batch.id);
      const itemIndex = batchState.items.findIndex(i => i.id === item.id);
      if (itemIndex === -1) return showToast('No pude preparar uno de los productos para descontar stock.', 'error');

      const preparedItem = batchState.items[itemIndex];
      const preparedStock = Number(preparedItem.currentStock) || 0;
      if (quantity > preparedStock) return showToast(`Stock insuficiente en preparación para ${preparedItem.product || 'producto'} / ${preparedItem.variant || 'Único'}.`, 'error');
      preparedItem.currentStock = Math.max(0, preparedStock - quantity);

      consignmentEntries.push({
        batchId: batch.id,
        batchName: batch.name || 'Sin lote',
        itemId: item.id,
        productName: item.product || 'Sin producto',
        variant: item.variant || 'Único',
        quantity,
        unitCost: Number(item.costArs) || 0,
        unitPrice
      });
    }

    const totalUnits = consignmentEntries.reduce((acc, e) => acc + e.quantity, 0);
    const totalRows = consignmentEntries.length;
    if (!window.confirm(`Entregar ${totalUnits} unidad(es) en ${totalRows} producto(s) a ${newConsignment.clientName}?

Esto descuenta stock del lote, pero NO crea venta todavía.`)) return;

    try {
      for (const [batchId, batchState] of batchMap.entries()) {
        await updateDoc(doc(db, 'batches', batchId), { items: batchState.items });
      }

      const consignmentTicketId = `CONS-${Date.now()}`;
      for (const entry of consignmentEntries) {
        await addDoc(collection(db, 'consignments'), {
          consignmentTicketId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'active',
          clientName: newConsignment.clientName.trim(),
          clientPhone: String(newConsignment.clientPhone || '').trim(),
          clientDni: String(newConsignment.clientDni || '').trim(),
          clientType: String(newConsignment.clientType || '').trim(),
          batchId: entry.batchId,
          batchName: entry.batchName,
          itemId: entry.itemId,
          productName: entry.productName,
          variant: entry.variant,
          quantityDelivered: entry.quantity,
          quantityPending: entry.quantity,
          quantityPaid: 0,
          quantityReturned: 0,
          quantityLost: 0,
          unitCost: entry.unitCost,
          unitPrice: entry.unitPrice,
          dueDate: newConsignment.dueDate || '',
          note: String(newConsignment.note || '').trim()
        });
      }

      setNewConsignment({
        clientName: '',
        clientPhone: '',
        clientDni: '',
        dueDate: '',
        note: '',
        lines: [createConsignmentLine()]
      });

      showToast(`Entrega a consignación registrada (${totalRows} productos). No se creó venta.`, 'success');
    } catch (e) {
      showToast('Error creando consignación: ' + e.message, 'error');
    }
  };

  const updateConsignmentStatus = async (entry, patch = {}) => {
    const nextPending = Number(patch.quantityPending ?? entry.quantityPending) || 0;
    const nextStatus = nextPending <= 0 ? 'closed' : 'active';
    await updateDoc(doc(db, 'consignments', entry.id), {
      ...patch,
      status: patch.status || nextStatus,
      updatedAt: new Date().toISOString()
    });
  };

  const handleConsignmentPayment = async (entry) => {
    const pending = Number(entry.quantityPending) || 0;
    if (pending <= 0) return showToast('Este producto ya no tiene pendientes.', 'error');

    const qtyRaw = window.prompt(`¿Cuántas unidades te pagó? Pendientes: ${pending}`, '1');
    if (qtyRaw === null) return;

    const quantity = parseInt(qtyRaw) || 0;
    if (quantity <= 0 || quantity > pending) return showToast(`Cantidad inválida. Pendientes: ${pending}.`, 'error');

    const priceRaw = window.prompt('Precio unitario cobrado', String(entry.unitPrice || ''));
    if (priceRaw === null) return;

    const unitPrice = parseFloat(String(priceRaw).replace(/[^0-9,-]+/g, '').replace(',', '.')) || 0;
    if (unitPrice <= 0) return showToast('Precio inválido.', 'error');

    const dateRaw = window.prompt('Fecha de cobro YYYY-MM-DD. Dejá vacío para hoy.', getTodayDate());
    const dateValue = dateRaw && dateRaw.trim() ? dateRaw.trim() : getTodayDate();

    const [year, month, day] = dateValue.split('-').map(Number);
    const saleDateObj = new Date(year, month - 1, day, new Date().getHours(), new Date().getMinutes());
    const saleDate = isNaN(saleDateObj.getTime()) ? new Date().toISOString() : saleDateObj.toISOString();

    try {
      const ticketId = `CONS-${Date.now()}`;
      const saleData = {
        ticketId,
        createdAt: new Date().toISOString(),
        date: saleDate,
        batchId: entry.batchId,
        batchName: entry.batchName,
        itemId: entry.itemId,
        productName: entry.productName,
        variant: entry.variant,
        quantity,
        unitPrice,
        totalSaleRaw: unitPrice * quantity,
        costArsAtSale: Number(entry.unitCost) || 0,
        shippingCostArs: 0,
        source: 'Consignación',
        consignmentId: entry.id,
        consignmentClient: entry.clientName,
        isReseller: true,
        isNewClient: false,
        seller: '028 Import'
      };

      await addDoc(collection(db, 'sales'), saleData);

      await updateConsignmentStatus(entry, {
        quantityPending: pending - quantity,
        quantityPaid: (Number(entry.quantityPaid) || 0) + quantity,
        lastPaidAt: new Date().toISOString()
      });

      showToast(`Pago parcial registrado: ${quantity} unidad(es). Ahora sí figura como venta.`, 'success');
    } catch (e) {
      showToast('Error registrando pago de consignación: ' + e.message, 'error');
    }
  };

  const handleConsignmentReturn = async (entry) => {
    const pending = Number(entry.quantityPending) || 0;
    if (pending <= 0) return showToast('No hay unidades pendientes para devolver.', 'error');

    const qtyRaw = window.prompt(`¿Cuántas unidades devolvió? Pendientes: ${pending}`, '1');
    if (qtyRaw === null) return;

    const quantity = parseInt(qtyRaw) || 0;
    if (quantity <= 0 || quantity > pending) return showToast(`Cantidad inválida. Pendientes: ${pending}.`, 'error');

    if (!window.confirm(`Devolver ${quantity} unidad(es) al lote original?`)) return;

    try {
      const batch = batches.find(b => b.id === entry.batchId);
      if (batch) {
        const newItems = (batch.items || []).map(item => {
          if (item.id !== entry.itemId) return item;
          return { ...item, currentStock: (Number(item.currentStock) || 0) + quantity };
        });
        await updateDoc(doc(db, 'batches', entry.batchId), { items: newItems });
      }

      await updateConsignmentStatus(entry, {
        quantityPending: pending - quantity,
        quantityReturned: (Number(entry.quantityReturned) || 0) + quantity,
        lastReturnedAt: new Date().toISOString()
      });

      showToast('Producto devuelto al lote.', 'success');
    } catch (e) {
      showToast('Error registrando devolución: ' + e.message, 'error');
    }
  };

  const handleConsignmentLost = async (entry) => {
    const pending = Number(entry.quantityPending) || 0;
    if (pending <= 0) return showToast('No hay unidades pendientes para marcar como perdidas.', 'error');

    const qtyRaw = window.prompt(`¿Cuántas unidades se perdieron? Pendientes: ${pending}`, '1');
    if (qtyRaw === null) return;

    const quantity = parseInt(qtyRaw) || 0;
    if (quantity <= 0 || quantity > pending) return showToast(`Cantidad inválida. Pendientes: ${pending}.`, 'error');

    if (!window.confirm(`Marcar ${quantity} unidad(es) como perdidas? No vuelve al lote y no crea venta.`)) return;

    try {
      await updateConsignmentStatus(entry, {
        quantityPending: pending - quantity,
        quantityLost: (Number(entry.quantityLost) || 0) + quantity,
        lastLostAt: new Date().toISOString()
      });

      showToast('Producto marcado como perdido dentro de consignación.', 'success');
    } catch (e) {
      showToast('Error marcando pérdida: ' + e.message, 'error');
    }
  };

  const handleDeleteConsignmentEntry = async (entry) => {
    const delivered = Number(entry.quantityDelivered) || 0;
    const pending = Number(entry.quantityPending) || 0;
    const paid = Number(entry.quantityPaid) || 0;
    const returned = Number(entry.quantityReturned) || 0;
    const lost = Number(entry.quantityLost) || 0;

    // Al borrar el producto de consignación, se deshace la salida de stock.
    // No se vuelven a sumar las unidades ya devueltas porque esas ya volvieron al lote antes.
    const unitsToReturn = Math.max(0, delivered - returned);

    const msg = [
      `¿Borrar este producto de consignación?`,
      ``,
      `${entry.clientName || 'Sin cliente'} · ${entry.productName || 'Sin producto'} / ${entry.variant || 'Único'}`,
      `Entregado: ${delivered}`,
      `Pendiente: ${pending}`,
      `Pagado: ${paid}`,
      `Devuelto: ${returned}`,
      `Perdido: ${lost}`,
      ``,
      unitsToReturn > 0
        ? `Se devolverán ${unitsToReturn} unidad(es) al lote original.`
        : `No se devolverán unidades porque ya fueron devueltas antes o no hay cantidad entregada.`,
      paid > 0 ? `También se borrarán las ventas reales asociadas a este pago de consignación.` : `No hay ventas pagadas asociadas para borrar.`,
      ``,
      `Esta acción no se puede deshacer.`
    ].join('\n');

    if (!window.confirm(msg)) return;

    try {
      let stockReturned = 0;

      if (unitsToReturn > 0 && entry.batchId && entry.itemId) {
        const batch = batches.find(b => b.id === entry.batchId);
        if (batch) {
          const newItems = (batch.items || []).map(item => {
            if (item.id !== entry.itemId) return item;
            return { ...item, currentStock: (Number(item.currentStock) || 0) + unitsToReturn };
          });

          const updates = { items: newItems };
          if (batch.finalizedAt) updates.finalizedAt = deleteField();

          await updateDoc(doc(db, 'batches', entry.batchId), updates);
          stockReturned = unitsToReturn;
        }
      }

      const linkedSalesSnap = await getDocs(query(collection(db, 'sales'), where('consignmentId', '==', entry.id)));
      for (const saleDoc of linkedSalesSnap.docs) {
        await deleteDoc(doc(db, 'sales', saleDoc.id));
      }

      await deleteDoc(doc(db, 'consignments', entry.id));

      showToast(`Consignación borrada. ${stockReturned > 0 ? `${stockReturned} unidad(es) devueltas al stock. ` : ''}${linkedSalesSnap.size ? `${linkedSalesSnap.size} venta(s) asociada(s) borrada(s).` : ''}`, 'success');
    } catch (e) {
      showToast('Error borrando consignación: ' + e.message, 'error');
    }
  };

  const handleDeleteConsignmentClient = async (client) => {
    const entries = client?.entries || [];
    if (!entries.length) return showToast('Este cliente no tiene consignaciones para borrar.', 'error');

    const totalPending = entries.reduce((sum, entry) => sum + (Number(entry.quantityPending) || 0), 0);
    const totalDelivered = entries.reduce((sum, entry) => sum + (Number(entry.quantityDelivered) || 0), 0);
    const totalReturned = entries.reduce((sum, entry) => sum + (Number(entry.quantityReturned) || 0), 0);
    const unitsToReturnTotal = entries.reduce((sum, entry) => {
      const delivered = Number(entry.quantityDelivered) || 0;
      const returned = Number(entry.quantityReturned) || 0;
      return sum + Math.max(0, delivered - returned);
    }, 0);

    const msg = [
      `¿Borrar TODA la consignación de ${client.clientName || 'este cliente'}?`,
      ``,
      `Registros: ${entries.length}`,
      `Entregado: ${totalDelivered}`,
      `Pendiente: ${totalPending}`,
      `Ya devuelto: ${totalReturned}`,
      ``,
      unitsToReturnTotal > 0
        ? `Se devolverán ${unitsToReturnTotal} unidad(es) al stock.`
        : `No hay unidades para devolver al stock.`,
      `También se borrarán las ventas asociadas a pagos de esta consignación.`,
      ``,
      `Esta acción no se puede deshacer.`
    ].join('\n');

    if (!window.confirm(msg)) return;

    try {
      const stockToReturnByBatch = {};
      const entryIds = [];

      entries.forEach(entry => {
        entryIds.push(entry.id);
        const delivered = Number(entry.quantityDelivered) || 0;
        const returned = Number(entry.quantityReturned) || 0;
        const unitsToReturn = Math.max(0, delivered - returned);

        if (unitsToReturn > 0 && entry.batchId && entry.itemId) {
          if (!stockToReturnByBatch[entry.batchId]) stockToReturnByBatch[entry.batchId] = {};
          stockToReturnByBatch[entry.batchId][entry.itemId] = (stockToReturnByBatch[entry.batchId][entry.itemId] || 0) + unitsToReturn;
        }
      });

      let stockReturned = 0;

      for (const batchId of Object.keys(stockToReturnByBatch)) {
        const batch = batches.find(b => b.id === batchId);
        if (!batch) continue;

        const returns = stockToReturnByBatch[batchId];
        const newItems = (batch.items || []).map(item => {
          const qty = Number(returns[item.id]) || 0;
          stockReturned += qty;
          return { ...item, currentStock: (Number(item.currentStock) || 0) + qty };
        });

        const updates = { items: newItems };
        if (batch.finalizedAt) updates.finalizedAt = deleteField();
        await updateDoc(doc(db, 'batches', batchId), updates);
      }

      let linkedSalesDeleted = 0;
      for (const entryId of entryIds) {
        const linkedSalesSnap = await getDocs(query(collection(db, 'sales'), where('consignmentId', '==', entryId)));
        linkedSalesDeleted += linkedSalesSnap.size;
        for (const saleDoc of linkedSalesSnap.docs) {
          await deleteDoc(doc(db, 'sales', saleDoc.id));
        }
      }

      for (const entry of entries) {
        await deleteDoc(doc(db, 'consignments', entry.id));
      }

      setExpandedConsignmentClient(prev => prev === client.clientName ? null : prev);
      showToast(`Cliente borrado de consignación. ${stockReturned} unidad(es) devueltas al stock. ${linkedSalesDeleted ? `${linkedSalesDeleted} venta(s) asociada(s) borrada(s).` : ''}`, 'success');
    } catch (e) {
      showToast('Error borrando cliente de consignación: ' + e.message, 'error');
    }
  };

  const handleEditConsignmentOrderDueDate = async (order) => {
    const entries = order?.entries || [];
    if (!entries.length) return showToast('Esta entrega no tiene registros para editar.', 'error');

    const current = normalizeConsignmentDateInput(order.dueDate || '');
    const nextRaw = window.prompt(
      'Nueva fecha límite de pago (podés usar 2026-05-30 o 30/05/2026). Dejalo vacío para borrar la fecha:',
      current
    );

    if (nextRaw === null) return;

    const next = normalizeConsignmentDateInput(nextRaw);
    const now = new Date().toISOString();

    try {
      for (const entry of entries) {
        await updateDoc(doc(db, 'consignments', entry.id), {
          dueDate: next,
          updatedAt: now
        });
      }

      showToast(next ? `Fecha límite actualizada a ${formatConsignmentDueDate(next)}.` : 'Fecha límite borrada.', 'success');
    } catch (e) {
      showToast('Error editando fecha límite: ' + e.message, 'error');
    }
  };

  const handleEditConsignmentClientData = (client) => {
    setExpandedConsignmentHistoryClient(null);
    setExpandedConsignmentInfoClient(null);
    setEditingConsignmentClientKey(client.clientName);
    setConsignmentClientDraft({
      clientName: client.clientName || '',
      clientPhone: client.clientPhone || '',
      clientDni: client.clientDni || '',
      clientType: client.clientType || ''
    });
  };

  const handleCancelEditConsignmentClient = () => {
    setEditingConsignmentClientKey(null);
    setConsignmentClientDraft({ clientName: '', clientPhone: '', clientDni: '', clientType: '' });
  };

  const handleSaveConsignmentClientData = async (client) => {
    const entries = client?.entries || [];
    if (!entries.length) return showToast('Este cliente no tiene registros para editar.', 'error');

    const cleanName = String(consignmentClientDraft.clientName || '').trim();
    if (!cleanName) return showToast('El nombre del cliente no puede quedar vacío.', 'error');

    const now = new Date().toISOString();

    try {
      for (const entry of entries) {
        await updateDoc(doc(db, 'consignments', entry.id), {
          clientName: cleanName,
          clientPhone: String(consignmentClientDraft.clientPhone || '').trim(),
          clientDni: String(consignmentClientDraft.clientDni || '').trim(),
          clientType: String(consignmentClientDraft.clientType || '').trim(),
          updatedAt: now
        });
      }

      setExpandedConsignmentHistoryClient(prev => prev === client.clientName ? cleanName : prev);
      setExpandedConsignmentOrder(null);
      handleCancelEditConsignmentClient();
      showToast('Datos del cliente actualizados.', 'success');
    } catch (e) {
      showToast('Error editando datos del cliente: ' + e.message, 'error');
    }
  };

  const handleEditConsignmentEntry = (entry) => {
    setEditingConsignmentEntryId(entry.id);
    setConsignmentEntryDraft({
      unitPrice: String(entry.unitPrice || ''),
      dueDate: normalizeConsignmentDateInput(entry.dueDate || ''),
      note: entry.note || ''
    });
  };

  const handleCancelEditConsignmentEntry = () => {
    setEditingConsignmentEntryId(null);
    setConsignmentEntryDraft({ unitPrice: '', dueDate: '', note: '' });
  };

  const handleSaveConsignmentEntry = async (entry) => {
    const unitPrice = parseFloat(consignmentEntryDraft.unitPrice || 0);
    if (unitPrice <= 0 || Number.isNaN(unitPrice)) return showToast('El precio tiene que ser mayor a 0.', 'error');

    try {
      await updateDoc(doc(db, 'consignments', entry.id), {
        unitPrice,
        dueDate: normalizeConsignmentDateInput(consignmentEntryDraft.dueDate || ''),
        note: String(consignmentEntryDraft.note || '').trim(),
        updatedAt: new Date().toISOString()
      });

      handleCancelEditConsignmentEntry();
      showToast('Producto de consignación actualizado.', 'success');
    } catch (e) {
      showToast('Error editando producto: ' + e.message, 'error');
    }
  };

  const handleAddNeutralStock = async () => {
    if (!newNeutralStock.batchId) return showToast('Elegí el lote de donde sale el stock neutro.', 'error');
    if (!newNeutralStock.itemId) return showToast('Elegí el producto del lote.', 'error');

    const batch = batches.find(b => b.id === newNeutralStock.batchId);
    if (!batch) return showToast('Lote no encontrado.', 'error');

    const item = (batch.items || []).find(i => i.id === newNeutralStock.itemId);
    if (!item) return showToast('Producto no encontrado en el lote.', 'error');

    const quantity = parseInt(newNeutralStock.quantity) || 0;
    if (quantity <= 0) return showToast('La cantidad tiene que ser mayor a 0.', 'error');

    const currentStock = Number(item.currentStock) || 0;
    if (quantity > currentStock) return showToast(`Stock insuficiente. Disponible: ${currentStock}.`, 'error');

    const unitPrice = parseFloat(newNeutralStock.unitPrice || 0);
    if (unitPrice < 0 || Number.isNaN(unitPrice)) return showToast('Precio inválido.', 'error');

    const unitCost = Number(item.costArs) || 0;
    const totalSaleRaw = unitPrice * quantity;
    const totalCostRaw = unitCost * quantity;
    const grossProfitRaw = totalSaleRaw - totalCostRaw;

    const reason = newNeutralStock.reason || 'Stock perdido';
    const note = String(newNeutralStock.note || '').trim();

    if (!window.confirm(`Registrar ${quantity} unidad(es) como stock neutro? Se descuenta del lote, pero NO aparece como venta diaria ni mensual.`)) return;

    try {
      const newItems = (batch.items || []).map(i => {
        if (i.id !== item.id) return i;
        return { ...i, currentStock: Math.max(0, (Number(i.currentStock) || 0) - quantity) };
      });

      await updateDoc(doc(db, 'batches', batch.id), { items: newItems });

      await addDoc(collection(db, 'neutral_stock'), {
        createdAt: new Date().toISOString(),
        accountingType: 'neutral',
        reason,
        note,
        batchId: batch.id,
        batchName: batch.name || 'Sin lote',
        itemId: item.id,
        productName: item.product || 'Sin producto',
        variant: item.variant || 'Único',
        quantity,
        unitPrice,
        costArsAtEntry: unitCost,
        totalSaleRaw,
        totalCostRaw,
        grossProfitRaw,
        seller: '028 Import'
      });

      setNewNeutralStock({
        batchId: '',
        itemId: '',
        quantity: 1,
        unitPrice: '',
        reason: 'Stock perdido',
        note: ''
      });

      showToast(`Stock neutro registrado. Ganancia neutral: ${formatMoney(grossProfitRaw)}`, 'success');
    } catch (e) {
      showToast('Error registrando stock neutro: ' + e.message, 'error');
    }
  };

  const handleDeleteNeutralStock = async (entry) => {
    if (!window.confirm('¿Eliminar este registro neutro y devolver el stock al lote original si existe?\n\nUsá esto para recuperar stock descontado por error.')) return;

    try {
      if (entry.batchId && entry.itemId) {
        const batch = batches.find(b => b.id === entry.batchId);
        if (batch) {
          const newItems = (batch.items || []).map(item => {
            if (item.id !== entry.itemId) return item;
            return {
              ...item,
              currentStock: (Number(item.currentStock) || 0) + (Number(entry.quantity) || 0)
            };
          });
          await updateDoc(doc(db, 'batches', entry.batchId), { items: newItems });
        }
      }

      await deleteDoc(doc(db, 'neutral_stock', entry.id));
      showToast('Registro neutro eliminado y stock devuelto si correspondía.', 'success');
    } catch (e) {
      showToast('Error eliminando registro neutro: ' + e.message, 'error');
    }
  };


  const handleCreateBatch = async () => {
    if (!newBatchName) return showToast("Debes ingresar un nombre para el lote", 'error');
    try { await addDoc(collection(db, 'batches'), { name: newBatchName, createdAt: new Date().toISOString(), items: [] }); setNewBatchName(''); showToast("Lote creado correctamente", 'success'); } catch (e) { showToast("Error: " + e.message, 'error'); }
  };

  const handleSaveEditBatchName = async (batchId) => {
    if (!editingBatchName.trim()) return showToast("El nombre no puede estar vacío", "error");
    try {
        await updateDoc(doc(db, 'batches', batchId), { name: editingBatchName });
        
        const salesToUpdate = sales.filter(s => s.batchId === batchId);
        for (const s of salesToUpdate) {
            await updateDoc(doc(db, 'sales', s.id), { batchName: editingBatchName });
        }
        
        const expensesToUpdate = expenses.filter(e => e.batchId === batchId);
        for (const e of expensesToUpdate) {
            await updateDoc(doc(db, 'expenses', e.id), { batchName: editingBatchName });
        }
        
        setEditingBatchId(null);
        showToast("Nombre actualizado en todos los registros", "success");
    } catch (e) {
        showToast("Error al renombrar: " + e.message, "error");
    }
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
    const count = Math.max(1, Math.min(parseInt(newItem.repeatCount) || 1, 500));
    const now = Date.now();
    const newItems = Array.from({ length: count }, (_, i) => ({
      id: now + i + '-' + Math.random().toString(36).substr(2, 9),
      product: newItem.product, variant: newItem.variant || 'Único',
      costArs: parseFloat(newItem.costArs) || 0,
      initialStock: parseInt(newItem.initialStock) || 0,
      currentStock: parseInt(newItem.initialStock) || 0,
    }));
    try {
      await updateDoc(doc(db, 'batches', batchId), { items: [...(batch.items || []), ...newItems] });
      setNewItem({ product: '', variant: '', costArs: '', initialStock: '', repeatCount: '1' });
      showToast(count > 1 ? `${count} entradas agregadas` : 'Producto agregado', 'success');
    } catch (e) { showToast("Error: " + e.message, 'error'); }
  };

  const handleDeleteItemFromBatch = async (batchId, itemId) => {
    if (!window.confirm('¿Eliminar este producto del lote?')) return;
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    const updatedItems = batch.items.filter(i => i.id !== itemId);
    try { await updateDoc(doc(db, 'batches', batchId), { items: updatedItems }); showToast("Producto eliminado", 'success'); } catch (e) { showToast("Error al borrar: " + e.message, 'error'); }
  };

  const handleConfirmRestore = async (batchId) => {
    if (!restoringItem) return;
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    const amount = parseInt(restoringItem.amount);
    if (isNaN(amount) || amount < 1) return showToast("Ingresá una cantidad válida", 'error');
    const item = batch.items.find(i => i.id === restoringItem.id);
    if (!item) return;
    const newStock = (item.currentStock || 0) + amount;
    const updatedItems = batch.items.map(i => i.id === restoringItem.id ? { ...i, currentStock: newStock } : i);
    try { await updateDoc(doc(db, 'batches', batchId), { items: updatedItems }); showToast(`+${amount} unidades restauradas`, 'success'); setRestoringItem(null); } catch (e) { showToast("Error: " + e.message, 'error'); }
  };

  const handleSaveEditItem = async (batchId) => {
    if (!editingItem) return;
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;

    const oldItem = batch.items.find(i => i.id === editingItem.id);
    if (!oldItem) return;

    const newInitialStock = parseInt(editingItem.initialStock) || 0;
    const newCost = parseFloat(editingItem.costArs) || 0;
    
    const diffStock = newInitialStock - (oldItem.initialStock || 0);
    let newCurrentStock = (oldItem.currentStock || 0) + diffStock;
    if (newCurrentStock < 0) newCurrentStock = 0;

    const updatedItem = {
      ...oldItem,
      product: editingItem.product,
      variant: editingItem.variant,
      costArs: newCost,
      initialStock: newInitialStock,
      currentStock: newCurrentStock
    };

    const newItems = batch.items.map(i => i.id === oldItem.id ? updatedItem : i);
    
    try {
      await updateDoc(doc(db, 'batches', batchId), { items: newItems });
      
      const salesToUpdate = sales.filter(s => s.itemId === oldItem.id);
      for (const s of salesToUpdate) {
        await updateDoc(doc(db, 'sales', s.id), {
          productName: updatedItem.product,
          variant: updatedItem.variant,
          costArsAtSale: newCost, 
        });
      }

      setEditingItem(null);
      showToast(`Actualizado. Se reflejó en ${salesToUpdate.length} venta(s) histórica(s).`, "success");
    } catch (e) {
      showToast("Error al actualizar: " + e.message, "error");
    }
  };

  const handleAddSale = async () => {
    for (let i = 0; i < saleItems.length; i++) {
        const item = saleItems[i];
        if (!item.batchId) return showToast(`Falta seleccionar la carpeta en el producto ${i + 1}.`, 'error');
        if (!item.itemId) return showToast(`Falta seleccionar el artículo en el producto ${i + 1}.`, 'error');
        if (!item.unitPrice) return showToast(`Ingresa el precio del producto ${i + 1}.`, 'error');
        const qty = parseInt(item.quantity) || 1;
        if (qty < 1) return showToast(`La cantidad mínima es 1 en el producto ${i + 1}.`, 'error');
    }

    const stockNeeds = {};
    saleItems.forEach(si => {
        stockNeeds[si.itemId] = (stockNeeds[si.itemId] || 0) + (parseInt(si.quantity) || 1);
    });

    for (const itemId in stockNeeds) {
        let foundItem = null;
        batches.forEach(b => {
            const it = b.items?.find(i => i.id === itemId);
            if (it) foundItem = it;
        });
        if (!foundItem) return showToast("Producto no encontrado.", "error");
        if (foundItem.currentStock < stockNeeds[itemId]) {
            return showToast(`Stock insuficiente de ${foundItem.product}. Disponibles: ${foundItem.currentStock}.`, 'error');
        }
    }

    const isNeutralSale = (saleGeneral.accountingType || 'Normal') === 'Neutro';
    const shippingProfit = isNeutralSale ? 0 : (parseFloat(saleGeneral.shippingPrice || 0) - parseFloat(saleGeneral.shippingCost || 0));
    const [year, month, day] = saleGeneral.saleDate.split('-').map(Number);
    const saleDateObj = new Date(year, month - 1, day, new Date().getHours(), new Date().getMinutes());
    
    const createdAtStr = new Date().toISOString();
    const dateStr = saleDateObj.toISOString();
    const ticketId = Date.now().toString(); 

    let totalCashIn = 0;
    const batchUpdates = {};

    try {
        for (let i = 0; i < saleItems.length; i++) {
            const si = saleItems[i];
            const isFirstItem = i === 0; 
            const qty = parseInt(si.quantity) || 1;
            const uPrice = parseFloat(si.unitPrice) || 0;

            const batch = batches.find(b => b.id === si.batchId);
            const item = batch.items.find(it => it.id === si.itemId);

            const itemShippingProfit = (!isNeutralSale && isFirstItem) ? shippingProfit : 0;
            const itemTotalRaw = (uPrice * qty) + itemShippingProfit;
            totalCashIn += itemTotalRaw;

            const saleData = {
                ticketId,
                createdAt: createdAtStr,
                date: dateStr,
                batchId: batch.id,
                batchName: batch.name,
                itemId: item.id,
                productName: item.product,
                variant: item.variant,
                quantity: qty,
                unitPrice: uPrice,
                totalSaleRaw: itemTotalRaw,
                costArsAtSale: item.costArs,
                shippingCostArs: isFirstItem ? parseFloat(saleGeneral.shippingCost || 0) : 0,
                source: saleGeneral.source,
                isReseller: saleGeneral.isReseller === 'Si',
                isNewClient: saleGeneral.isNewClient,
                clientName: saleGeneral.isReseller === 'Si' ? String(saleGeneral.wholesaleClient || '').trim() : '',
                operationType: saleGeneral.isReseller === 'Si' ? 'MAYORISTA' : 'VENTA',
                seller: '028 Import' 
            };

            if (isNeutralSale) {
                await addDoc(collection(db, 'neutral_stock'), {
                    createdAt: createdAtStr,
                    accountingType: 'neutral',
                    reason: 'Venta neutra',
                    note: `Registrado desde Ventas · Canal: ${saleGeneral.source || 'Sin canal'}`,
                    batchId: batch.id,
                    batchName: batch.name,
                    itemId: item.id,
                    productName: item.product,
                    variant: item.variant,
                    quantity: qty,
                    unitPrice: uPrice,
                    costArsAtEntry: item.costArs || 0,
                    totalSaleRaw: itemTotalRaw,
                    totalCostRaw: (item.costArs || 0) * qty,
                    grossProfitRaw: itemTotalRaw - ((item.costArs || 0) * qty),
                    source: 'Ventas / Neutro',
                    seller: '028 Import'
                });
            } else {
                await addDoc(collection(db, 'sales'), saleData);
            }

            if (!batchUpdates[batch.id]) {
                batchUpdates[batch.id] = { items: [...batch.items], finalizedAt: batch.finalizedAt };
            }
            const bUpdate = batchUpdates[batch.id];
            const itemIdx = bUpdate.items.findIndex(x => x.id === item.id);
            if (itemIdx !== -1) {
                bUpdate.items[itemIdx].currentStock -= qty;
            }
        }

        for (const bId in batchUpdates) {
            const bData = batchUpdates[bId];
            const allZero = bData.items.every(x => x.currentStock <= 0);
            const updates = { items: bData.items };
            if (allZero && !bData.finalizedAt) updates.finalizedAt = new Date().toISOString();
            await updateDoc(doc(db, 'batches', bId), updates);
        }

        showToast(isNeutralSale ? `Stock neutro registrado. Ganancia global estimada: ${formatMoney(totalCashIn)}` : `Pedido registrado. Ingreso total: ${formatMoney(totalCashIn)}`, 'success');
        
        setSaleGeneral({ ...saleGeneral, shippingCost: '', shippingPrice: '', wholesaleClient: '' });
        setSaleItems([{ id: Date.now(), batchId: '', itemId: '', quantity: 1, unitPrice: '' }]);

    } catch (e) {
        showToast('Error al guardar: ' + e.message, 'error');
    }
  };

  const deleteSaleGroups = async (groupsToDelete, askConfirm = true) => {
    const validGroups = (groupsToDelete || []).filter(Boolean);
    if (!validGroups.length) return showToast('No hay ventas seleccionadas.', 'error');

    const summary = validGroups.reduce((acc, group) => {
      acc.salesCount += 1;
      acc.linesCount += group.originalSales.length;
      acc.productsCount += group.originalSales.reduce((sum, sale) => sum + (Number(sale.quantity) || 0), 0);
      acc.revenue += group.totalSaleRaw || 0;
      return acc;
    }, { salesCount: 0, linesCount: 0, productsCount: 0, revenue: 0 });

    if (askConfirm) {
      const msg = `¿Borrar ${summary.salesCount} registro(s) seleccionado(s)?\n\nProductos/unidades: ${summary.productsCount}\nLíneas internas: ${summary.linesCount}\nTotal facturado: ${formatMoney(summary.revenue)}\n\nSe eliminarán del historial y se devolverá el stock a sus lotes cuando corresponda.`;
      if (!window.confirm(msg)) return;
    }

    try {
      const stockToReturnByBatch = {};
      const salesToDelete = validGroups.flatMap(group => group.originalSales);

      salesToDelete.forEach(sale => {
        // Las ventas de consignación NO devuelven stock al lote al borrarlas,
        // porque el stock ya había salido cuando se entregó a consignación.
        if (sale.consignmentId || sale.source === 'Consignación') return;

        // Las ventas neutras sí devuelven stock al borrarlas, porque se descontaron del lote.
        if (!sale.batchId || !sale.itemId) return;
        if (!stockToReturnByBatch[sale.batchId]) stockToReturnByBatch[sale.batchId] = {};
        stockToReturnByBatch[sale.batchId][sale.itemId] = (stockToReturnByBatch[sale.batchId][sale.itemId] || 0) + (Number(sale.quantity) || 0);
      });

      for (const batchId of Object.keys(stockToReturnByBatch)) {
        const batch = batches.find(b => b.id === batchId);
        if (!batch) continue;

        const returns = stockToReturnByBatch[batchId];
        const newItems = (batch.items || []).map(item => ({
          ...item,
          currentStock: (Number(item.currentStock) || 0) + (Number(returns[item.id]) || 0)
        }));

        const updates = { items: newItems };
        if (batch.finalizedAt) updates.finalizedAt = deleteField();
        await updateDoc(doc(db, 'batches', batchId), updates);
      }

      for (const sale of salesToDelete) {
        if (sale.collectionName === 'neutral_stock' || sale.isNeutral || sale.accountingType === 'neutral') {
          await deleteDoc(doc(db, 'neutral_stock', sale.neutralDocId || sale.id));
        } else {
          await deleteDoc(doc(db, 'sales', sale.id));
        }
      }

      setSelectedSaleTickets(prev => {
        const next = { ...prev };
        validGroups.forEach(group => delete next[group.ticketId]);
        return next;
      });

      showToast(`${summary.salesCount} registro(s) borrado(s). Se devolvieron ${summary.productsCount} producto(s) al stock.`, 'success');
    } catch (e) {
      showToast('Error al borrar ventas: ' + e.message, 'error');
    }
  };

  const handleDeleteTicket = async (group) => {
    await deleteSaleGroups([group], true);
  };

  const handleDeleteSelectedSales = async () => {
    await deleteSaleGroups(selectedSaleGroups, true);
  };

  const handleDeleteWholesaleOrder = async (orderGroup) => {
    await deleteSaleGroups([orderGroup], true);
  };

  const handleDeleteWholesaleClient = async (client) => {
    const orders = client?.orderGroups || [];
    if (!orders.length) return showToast('Este cliente no tiene ventas para borrar.', 'error');
    await deleteSaleGroups(orders, true);
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
  };


  // --- CONCILIADOR DE STOCK REAL ---
  const normalizeStockString = (value) => {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // Correcciones comunes, pero no dependemos solo de esto: abajo hay fuzzy general.
      .replace(/\bpinneaple\b/g, 'pineapple')
      .replace(/\bpinnapple\b/g, 'pineapple')
      .replace(/\bpineaple\b/g, 'pineapple')
      .replace(/\bpinnaple\b/g, 'pineapple')
      .replace(/\bpacion\b/g, 'passion')
      .replace(/\bpasion\b/g, 'passion')
      .replace(/\bpasión\b/g, 'passion')
      .replace(/\bpassionfrut\b/g, 'passion fruit')
      .replace(/\bfrut\b/g, 'fruit')
      .replace(/\bstraberry\b/g, 'strawberry')
      .replace(/\bstrawbery\b/g, 'strawberry')
      .replace(/\bbluebery\b/g, 'blueberry')
      .replace(/\bwatermellon\b/g, 'watermelon')
      .replace(/\bfucking\b/g, '')
      .replace(/\bfcking\b/g, '')
      .replace(/\bsatica\b/g, 'sativa')
      .replace(/\bsativa\b/g, '')
      .replace(/\bindica\b/g, '')
      .replace(/\bhibrida\b/g, '')
      .replace(/\bhybrid\b/g, '')
      .replace(/\bv\s*400\s*mix\b/g, 'vmix')
      .replace(/\bv400\s*mix\b/g, 'vmix')
      .replace(/\bv\s*mix\b/g, 'vmix')
      .replace(/\b(nuevo|nueva|new|stock|real|actualizado|actualizada)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const cleanStockDisplayText = (value) => {
    return String(value || '')
      .replace(/\([^)]*\)\s*[a-zA-Z]*\s*$/g, '')
      .replace(/^\s*\d+\s*\|\s*/g, '')
      .replace(/\s*(→|->|>|-)\s*(sativa|indica|índica|hibrida|híbrida|hybrid|satica)\b.*$/i, '')
      .replace(/[^\p{L}\p{N}\s\-\/&+]/gu, ' ')
      .replace(/\b(nuevo|nueva|new|stock|real|actualizado|actualizada)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const getStockTokens = (value) => {
    const stop = new Set(['de', 'del', 'the', 'and', 'con', 'por', 'para', 'x', 'by']);
    return normalizeStockString(value)
      .split(' ')
      .filter(token => token.length > 1 && !stop.has(token));
  };

  const getSortedTokenKey = (value) => [...new Set(getStockTokens(value))].sort().join(' ');

  const levenshteinDistance = (a, b) => {
    const s = String(a || '');
    const t = String(b || '');
    if (s === t) return 0;
    if (!s.length) return t.length;
    if (!t.length) return s.length;

    const previous = Array.from({ length: t.length + 1 }, (_, i) => i);
    const current = Array(t.length + 1);

    for (let i = 1; i <= s.length; i++) {
      current[0] = i;
      for (let j = 1; j <= t.length; j++) {
        const cost = s[i - 1] === t[j - 1] ? 0 : 1;
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + cost
        );
      }
      for (let j = 0; j <= t.length; j++) previous[j] = current[j];
    }

    return previous[t.length];
  };

  const tokenSimilarity = (a, b) => {
    const x = normalizeStockString(a);
    const y = normalizeStockString(b);
    if (!x || !y) return 0;
    if (x === y) return 1;

    if ((x.includes(y) || y.includes(x)) && Math.min(x.length, y.length) >= 4) {
      return 0.92;
    }

    const maxLen = Math.max(x.length, y.length);
    const minLen = Math.min(x.length, y.length);
    if (maxLen <= 2) return x === y ? 1 : 0;

    const distance = levenshteinDistance(x, y);
    const rawRatio = 1 - (distance / maxLen);
    const lengthBalance = minLen / maxLen;

    return Math.max(0, rawRatio * (0.72 + lengthBalance * 0.28));
  };

  const fuzzyTokenCoverage = (tokensA, tokensB) => {
    if (!tokensA.length || !tokensB.length) return 0;

    const bestA = tokensA.map(a => Math.max(...tokensB.map(b => tokenSimilarity(a, b))));
    const bestB = tokensB.map(b => Math.max(...tokensA.map(a => tokenSimilarity(a, b))));

    const avgA = bestA.reduce((sum, val) => sum + val, 0) / bestA.length;
    const avgB = bestB.reduce((sum, val) => sum + val, 0) / bestB.length;

    return (avgA * 0.55) + (avgB * 0.45);
  };

  const similarityScore = (a, b) => {
    const normA = normalizeStockString(a);
    const normB = normalizeStockString(b);
    if (!normA || !normB) return 0;
    if (normA === normB) return 100;

    const sortedA = getSortedTokenKey(a);
    const sortedB = getSortedTokenKey(b);
    if (sortedA && sortedA === sortedB) return 98;

    const tokensA = [...new Set(getStockTokens(a))];
    const tokensB = [...new Set(getStockTokens(b))];
    if (!tokensA.length || !tokensB.length) return 0;

    const exactIntersection = tokensA.filter(t => tokensB.includes(t)).length;
    const exactUnion = new Set([...tokensA, ...tokensB]).size;
    const exactJaccard = exactUnion ? exactIntersection / exactUnion : 0;

    const fuzzyCoverage = fuzzyTokenCoverage(tokensA, tokensB);
    const containsBoost = normA.includes(normB) || normB.includes(normA) ? 0.10 : 0;

    const score = (exactJaccard * 0.35) + (fuzzyCoverage * 0.58) + containsBoost;
    return Math.round(Math.min(1, score) * 100);
  };

  const scoreRealAgainstWebGroup = (real, web) => {
    const fullScore = similarityScore(`${real.model} ${real.variant}`, `${web.product} ${web.variant}`);
    const modelScore = similarityScore(real.model, web.product);
    const variantScore = similarityScore(real.variant, web.variant);

    // Para stock, la variante/sabor pesa más que el modelo, pero el modelo evita confundir
    // "Miami Mint" de distintas líneas.
    let weightedScore = Math.round((variantScore * 0.66) + (modelScore * 0.34));

    // Si el sabor es casi igual y el modelo se parece razonablemente, empujamos a dudosa fuerte.
    if (variantScore >= 88 && modelScore >= 55) weightedScore += 6;

    // Si el modelo es muy fuerte pero falta una palabra secundaria en el sabor, también suma.
    if (modelScore >= 88 && variantScore >= 72) weightedScore += 4;

    return {
      score: Math.min(100, Math.max(fullScore, weightedScore)),
      fullScore,
      modelScore,
      variantScore
    };
  };

  const parseRealStockText = (rawText) => {
    const lines = String(rawText || '').split(/\r?\n/);
    let currentModel = '';
    const parsed = [];

    lines.forEach((rawLine) => {
      const originalLine = String(rawLine || '').trim();
      if (!originalLine) return;

      const line = originalLine.replace(/\s+/g, ' ').trim();

      // Formato 1: "Sabor (7)" o producto único "CÁPSULAS 028 1ml (4)"
      const qtyAtEnd = line.match(/\((\d+)\)\s*[a-zA-Z]*\s*$/);

      // Formato 2: "1| Lemon Hash", "1 | Durban Poison"
      const qtyAtStart = line.match(/^\s*(\d+)\s*\|\s*(.+)$/);

      if (qtyAtStart) {
        const quantity = parseInt(qtyAtStart[1], 10);
        const variant = cleanStockDisplayText(qtyAtStart[2]);
        if (!variant || !Number.isFinite(quantity)) return;

        parsed.push({
          id: `${currentModel}__${variant}__${parsed.length}`,
          model: currentModel || 'SIN MODELO',
          variant,
          quantity,
          raw: originalLine,
          normalized: normalizeStockString(`${currentModel} ${variant}`),
          sortedKey: getSortedTokenKey(`${currentModel} ${variant}`)
        });
        return;
      }

      if (qtyAtEnd) {
        const quantity = parseInt(qtyAtEnd[1], 10);
        const nameWithoutQty = cleanStockDisplayText(line.replace(qtyAtEnd[0], ''));
        if (!nameWithoutQty || !Number.isFinite(quantity)) return;

        const looksLikeSingleProduct =
          !currentModel ||
          /capsula|capsulas|cápsula|cápsulas|bateria|batería|pen|shroomz|mushroom/i.test(nameWithoutQty);

        const model = looksLikeSingleProduct ? nameWithoutQty : currentModel;
        const variant = looksLikeSingleProduct ? 'Único' : nameWithoutQty;

        parsed.push({
          id: `${model}__${variant}__${parsed.length}`,
          model,
          variant,
          quantity,
          raw: originalLine,
          normalized: normalizeStockString(`${model} ${variant}`),
          sortedKey: getSortedTokenKey(`${model} ${variant}`)
        });
        return;
      }

      // Sin cantidad: se toma como título padre/modelo.
      const header = cleanStockDisplayText(line);
      if (header) currentModel = header;
    });

    return parsed;
  };

  const getActiveWebStockItems = () => {
    const items = [];
    batches
      .filter(batch => !batch.finalizedAt)
      .forEach(batch => {
        (batch.items || []).forEach(item => {
          const currentStock = Number(item.currentStock) || 0;
          if (currentStock <= 0) return;
          const product = item.product || 'SIN PRODUCTO';
          const variant = item.variant || 'Único';
          items.push({
            batchId: batch.id,
            batchName: batch.name || 'Lote sin nombre',
            itemId: item.id,
            product,
            variant,
            costArs: Number(item.costArs) || 0,
            currentStock,
            initialStock: Number(item.initialStock) || 0,
            normalized: normalizeStockString(`${product} ${variant}`),
            sortedKey: getSortedTokenKey(`${product} ${variant}`)
          });
        });
      });
    return items;
  };

  const buildWebStockGroups = () => {
    const map = new Map();
    getActiveWebStockItems().forEach(item => {
      const key = item.sortedKey || item.normalized;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: `${item.product} / ${item.variant}`,
          product: item.product,
          variant: item.variant,
          normalized: item.normalized,
          sortedKey: item.sortedKey,
          totalStock: 0,
          entries: []
        });
      }
      const group = map.get(key);
      group.totalStock += item.currentStock;
      group.entries.push(item);
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  };

  const analyzeStockReconciliation = () => {
    const realItems = parseRealStockText(stockSyncText);
    const webGroups = buildWebStockGroups();

    if (!realItems.length) {
      showToast('Pegá un stock real con cantidades entre paréntesis. Ej: Miami Mint (2)', 'error');
      setStockSyncAnalysis(null);
      return;
    }

    const exact = [];
    const probable = [];
    const notFound = [];
    const matchedWebKeys = new Set();

    realItems.forEach(real => {
      const candidates = webGroups
        .map(web => {
          const scoreData = scoreRealAgainstWebGroup(real, web);
          const inverted = real.sortedKey && web.sortedKey && real.sortedKey === web.sortedKey && real.normalized !== web.normalized;
          return { web, ...scoreData, inverted };
        })
        .filter(candidate => candidate.score >= 58)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      const best = candidates[0];

      if (!best) {
        notFound.push({ real, candidates: [] });
        return;
      }

      const row = {
        real,
        web: best.web,
        candidates,
        score: best.score,
        inverted: best.inverted,
        webStock: best.web.totalStock,
        realStock: real.quantity,
        diff: real.quantity - best.web.totalStock
      };

      if (best.score >= 94 && candidates.filter(c => c.score >= 90).length === 1) {
        exact.push(row);
        matchedWebKeys.add(best.web.key);
      } else {
        probable.push(row);
        // Si ya aparece como dudosa, no debe aparecer también como "en sistema pero no aparece".
        matchedWebKeys.add(best.web.key);
      }
    });

    const extraWeb = webGroups
      .filter(web => !matchedWebKeys.has(web.key))
      .map(web => ({ web, webStock: web.totalStock }));

    const duplicateGroups = [];
    for (let i = 0; i < webGroups.length; i++) {
      for (let j = i + 1; j < webGroups.length; j++) {
        const score = similarityScore(`${webGroups[i].product} ${webGroups[i].variant}`, `${webGroups[j].product} ${webGroups[j].variant}`);
        if (score >= 92) {
          duplicateGroups.push({ a: webGroups[i], b: webGroups[j], score });
        }
      }
    }

    const toAdd = exact.filter(r => r.diff > 0);
    const toRemove = exact.filter(r => r.diff < 0);
    const ok = exact.filter(r => r.diff === 0);

    setStockSyncAnalysis({
      createdAt: new Date().toISOString(),
      realItems,
      webGroups,
      exact,
      probable,
      notFound,
      extraWeb,
      duplicateGroups: duplicateGroups.slice(0, 30),
      summary: {
        parsed: realItems.length,
        exact: exact.length,
        probable: probable.length,
        notFound: notFound.length,
        extraWeb: extraWeb.length,
        duplicates: duplicateGroups.length,
        ok: ok.length,
        toAdd: toAdd.length,
        toRemove: toRemove.length
      }
    });

    showToast(`Análisis listo: ${exact.length} coincidencias exactas, ${probable.length} dudosas, ${notFound.length} no encontradas.`, 'success');
  };

  const applyExactStockReconciliation = async () => {
    if (!stockSyncAnalysis) return showToast('Primero analizá el stock real.', 'error');

    const changes = stockSyncAnalysis.exact.filter(row => row.diff !== 0);
    if (!changes.length) return showToast('No hay diferencias exactas para aplicar.', 'success');

    if (!window.confirm(`Aplicar ${changes.length} ajustes exactos de stock? No toca coincidencias dudosas ni productos no encontrados.`)) return;

    setIsApplyingStockSync(true);

    try {
      await addDoc(collection(db, 'stock_sync_logs'), {
        createdAt: new Date().toISOString(),
        mode: 'exact_only',
        sourceText: stockSyncText,
        summary: stockSyncAnalysis.summary,
        changes: changes.map(row => ({
          real: row.real,
          webLabel: row.web.label,
          webStock: row.webStock,
          realStock: row.realStock,
          diff: row.diff,
          entries: row.web.entries.map(entry => ({
            batchId: entry.batchId,
            batchName: entry.batchName,
            itemId: entry.itemId,
            product: entry.product,
            variant: entry.variant,
            currentStock: entry.currentStock,
            initialStock: entry.initialStock
          }))
        }))
      });

      const updatesByBatch = new Map();

      const getBatchItemsCopy = (batchId) => {
        if (!updatesByBatch.has(batchId)) {
          const batch = batches.find(b => b.id === batchId);
          updatesByBatch.set(batchId, (batch?.items || []).map(item => ({ ...item })));
        }
        return updatesByBatch.get(batchId);
      };

      changes.forEach(row => {
        let diff = row.diff;

        if (diff > 0) {
          const targetEntry = row.web.entries[0];
          const itemsCopy = getBatchItemsCopy(targetEntry.batchId);
          const idx = itemsCopy.findIndex(item => item.id === targetEntry.itemId);
          if (idx !== -1) {
            itemsCopy[idx].currentStock = (Number(itemsCopy[idx].currentStock) || 0) + diff;
            itemsCopy[idx].initialStock = (Number(itemsCopy[idx].initialStock) || 0) + diff;
          }
        }

        if (diff < 0) {
          let remainingToRemove = Math.abs(diff);
          const entries = [...row.web.entries].sort((a, b) => b.currentStock - a.currentStock);

          entries.forEach(entry => {
            if (remainingToRemove <= 0) return;
            const itemsCopy = getBatchItemsCopy(entry.batchId);
            const idx = itemsCopy.findIndex(item => item.id === entry.itemId);
            if (idx === -1) return;

            const current = Number(itemsCopy[idx].currentStock) || 0;
            const remove = Math.min(current, remainingToRemove);
            itemsCopy[idx].currentStock = current - remove;
            remainingToRemove -= remove;
          });
        }
      });

      for (const [batchId, items] of updatesByBatch.entries()) {
        await updateDoc(doc(db, 'batches', batchId), { items });
      }

      showToast(`Stock ajustado: ${changes.length} cambios aplicados.`, 'success');
      setStockSyncAnalysis(null);
    } catch (e) {
      showToast('Error aplicando ajustes: ' + e.message, 'error');
    } finally {
      setIsApplyingStockSync(false);
    }
  };


  const handleLogin = (e) => { 
    e.preventDefault(); 
    const val = e.target.password.value; 
    if(val === '1717') { localStorage.setItem('028_user', 'Admin'); setUser('Admin'); showToast('Bienvenido', 'success'); } 
    else showToast('Contraseña incorrecta', 'error');
  };

  if (!user) return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-500 ${darkMode ? 'bg-[#050505]' : 'bg-slate-50'}`}>
      <div className={`p-8 rounded-2xl w-full max-w-md text-center border ${darkMode ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200/80'}`}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{background:'#6366f1'}}><Package size={32} className="text-white" /></div>
        <h1 className={`text-3xl font-black mb-2 tracking-tight ${darkMode ? 'text-white' : 'text-zinc-900'}`}>028 IMPORT</h1>
        <p className="text-zinc-500 mb-8 text-xs font-semibold uppercase tracking-widest">Workspace Empresarial</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="password" name="password" placeholder="Clave de seguridad" className={`h-12 w-full border p-3.5 rounded-xl text-center font-bold text-sm outline-none transition-colors ${darkMode ? 'bg-[#101010] border-white/[0.08] text-white focus:border-[#6366f1]/50' : 'bg-zinc-50 border-zinc-200 focus:border-blue-400 text-zinc-900'}`} autoFocus />
          <button className="h-12 w-full rounded-xl font-bold transition-all text-sm text-white" style={{background:'#6366f1'}}>Autenticar</button>
        </form>
      </div>
      <div className="mt-8 flex gap-4">
          <button onClick={() => setDarkMode(false)} className={`p-3 rounded-xl border transition-all ${!darkMode ? 'bg-white border-zinc-200 text-zinc-800' : 'bg-transparent border-transparent text-zinc-600'}`}><Sun size={18}/></button>
          <button onClick={() => setDarkMode(true)} className={`p-3 rounded-xl border transition-all ${darkMode ? 'bg-[#101010] border-white/[0.06] text-zinc-300' : 'bg-transparent border-transparent text-zinc-400'}`}><Moon size={18}/></button>
      </div>
    </div>
  );

  if (configError) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 text-white">
      <div className="max-w-lg text-center space-y-4 border border-[#1F1F1F] p-8 rounded-lg bg-[#181818]">
        <AlertTriangle size={48} className="mx-auto text-amber-500" />
        <h1 className="text-xl font-bold tracking-tight">Falta Configuración</h1>
        <p className="text-zinc-400 text-sm">Debes configurar las claves de Firebase en el código fuente.</p>
      </div>
    </div>
  );

  const TABS = [
      { id: 'home', icon: Activity, label: 'Inicio' }, 
      { id: 'sales', icon: ShoppingCart, label: 'Ventas' }, 
      { id: 'wholesale', icon: UserCircle, label: 'Mayorista' }, 
      { id: 'batches', icon: FolderOpen, label: 'Lotes' }, 
      { id: 'consignment', icon: Users, label: 'Consignación' },
      { id: 'analysis', icon: BarChart3, label: 'Análisis' }, 
      { id: 'expenses', icon: Wallet, label: 'Gastos' },
      { id: 'metaads', icon: Target, label: 'Meta Ads' }
  ];

  return (
    <div className={`flex h-screen overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-[#050505] text-zinc-100' : 'bg-slate-50 text-zinc-900'}`} style={{fontFamily:"'Inter', system-ui, sans-serif"}}>
      
      {toast && (
          <div className={`fixed bottom-24 md:bottom-8 right-4 md:right-8 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 z-50 border ${toast.type === 'error' ? 'bg-red-600/95 border-red-500 text-white' : 'bg-zinc-900/95 border-[#1F1F1F] text-white'}`}>
             {toast.type === 'error' ? <XCircle size={18} className="text-red-200"/> : <CheckCircle size={18} className="text-emerald-400"/>}
             <span className="font-medium text-sm tracking-wide">{toast.message}</span>
          </div>
      )}

      <datalist id="products-list">{uniqueProducts.map(p => <option key={p} value={p} />)}</datalist>
      <datalist id="variants-list">{uniqueVariants.map(v => <option key={v} value={v} />)}</datalist>

      <aside className={`hidden md:flex flex-col w-60 border-r flex-shrink-0 transition-colors z-20 ${darkMode ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200/80'}`}>
        <div className={`p-5 pb-4 border-b ${darkMode ? 'border-white/[0.06]' : 'border-zinc-100'}`}>
            <div className="flex items-center gap-3">
                <img src="https://i.ibb.co/wh6spzwM/Dise-o-sin-t-tulo-14.png" alt="028 Import" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                <div>
                    <h1 className={`text-sm font-black tracking-tight leading-none ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>028 IMPORT</h1>
                    <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5 text-zinc-500">Dashboard</p>
                </div>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5 custom-scrollbar">
            <div className="text-[9px] font-bold uppercase tracking-widest px-3 mb-3 text-zinc-600">Navegación</div>
            {TABS.map(tab => (
            <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                    activeTab === tab.id
                        ? (darkMode ? 'bg-white/[0.06] text-zinc-100' : 'bg-zinc-100 text-zinc-900')
                        : (darkMode ? 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800')
                }`}
            >
                <tab.icon size={16} strokeWidth={activeTab === tab.id ? 2.5 : 2}
                    style={activeTab === tab.id ? {color:'#6366f1'} : {}} />
                <span className={activeTab === tab.id ? 'font-semibold' : ''}>{tab.label}</span>
                {activeTab === tab.id && <div className="ml-auto w-1 h-4 rounded-full" style={{background:'#6366f1'}}/>}
            </button>
            ))}
            <div className={`my-2 border-t ${darkMode ? 'border-white/[0.04]' : 'border-zinc-100'}`} />
            <Link
                to="/facturas"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                    darkMode ? 'text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'
                }`}
            >
                <Receipt size={16} strokeWidth={2} />
                <span>Facturas</span>
            </Link>
        </div>

        <div className={`p-4 border-t space-y-2 ${darkMode ? 'border-white/[0.06]' : 'border-zinc-100'}`}>
            {isOffline && (
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-red-400 bg-red-500/10 p-2 rounded-xl mb-2 border border-red-500/20">
                    <WifiOff size={13}/> Modo Offline
                </div>
            )}
            <div className={`flex items-center justify-between p-2.5 rounded-xl border ${darkMode ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-zinc-50 border-zinc-200/80'}`}>
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white" style={{background:'#6366f1'}}>{user?.charAt(0)?.toUpperCase()}</div>
                    <div className="flex flex-col items-start">
                        <span className="text-xs font-bold">{user}</span>
                        <span className="text-[10px] text-zinc-500">Admin</span>
                    </div>
                </div>
                <button onClick={() => { localStorage.removeItem('028_user'); setUser(null); }} className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-zinc-600 hover:bg-red-500/10 hover:text-red-400' : 'text-zinc-400 hover:bg-red-50 hover:text-red-600'}`} title="Cerrar sesión">
                    <LogOut size={14} />
                </button>
            </div>
            <button onClick={() => setDarkMode(!darkMode)} className={`w-full flex items-center justify-center gap-2 h-9 rounded-xl font-medium text-xs border transition-all ${darkMode ? 'border-white/[0.06] hover:bg-white/[0.04] text-zinc-500 hover:text-zinc-300' : 'border-zinc-200 hover:bg-zinc-50 text-zinc-500'}`}>
                {darkMode ? <><Sun size={13}/> Modo Claro</> : <><Moon size={13}/> Modo Oscuro</>}
            </button>
        </div>
      </aside>

      <nav className={`md:hidden fixed bottom-0 w-full z-40 border-t pb-safe transition-colors ${darkMode ? 'bg-[#101010]/95 backdrop-blur-xl border-white/[0.06] text-zinc-500' : 'bg-white/95 backdrop-blur-xl border-zinc-200/80 text-zinc-400'}`}>
          <div className="flex justify-around items-center h-16 px-2">
            {TABS.map(tab => (
              <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex flex-col items-center justify-center w-full h-full space-y-1 transition-all"
                  style={activeTab === tab.id ? {color:'#6366f1'} : {}}
              >
                  <tab.icon size={19} strokeWidth={activeTab === tab.id ? 2.5 : 1.8} />
                  <span className={`text-[9px] ${activeTab === tab.id ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
              </button>
            ))}
          </div>
      </nav>

      <main className="flex-1 overflow-y-auto relative w-full custom-scrollbar">
        
        <header className={`md:hidden sticky top-0 z-30 flex justify-between items-center px-4 py-3 border-b backdrop-blur-xl ${darkMode ? 'bg-[#050505]/90 border-white/[0.06]' : 'bg-white/90 border-zinc-200/80'}`}>
            <div className="flex items-center gap-2.5">
                <img src="https://i.ibb.co/wh6spzwM/Dise-o-sin-t-tulo-14.png" alt="028 Import" className="w-8 h-8 rounded-xl object-cover flex-shrink-0" />
                <h1 className="font-black tracking-tight text-sm">028 IMPORT</h1>
            </div>
            <div className="flex items-center gap-2">
                {isOffline && <WifiOff size={15} className="text-red-400" />}
                <button onClick={() => setDarkMode(!darkMode)} className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}>{darkMode ? <Sun size={16} /> : <Moon size={16} />}</button>
            </div>
        </header>

        <div className="p-4 md:p-8 pb-24 md:pb-8 max-w-[1400px] mx-auto space-y-5">

            <div className="hidden md:flex justify-between items-center mb-2">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-1 h-4 rounded-full" style={{background:'#6366f1'}}/>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">028 Import</span>
                    </div>
                    <h2 className={`text-2xl font-black tracking-tight ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>{TABS.find(t => t.id === activeTab)?.label}</h2>
                </div>
            </div>

            {/* --- PESTAÑA INICIO --- */}
            {activeTab === 'home' && (
                <div className="space-y-5 animate-in fade-in duration-300">
                    {/* PERIOD SELECTOR */}
                    <div className={`p-4 rounded-2xl border flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 ${darkMode ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200'}`}>
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:'rgba(59,130,246,0.12)'}}>
                                <Calendar size={15} style={{color:'#6366f1'}}/>
                            </div>
                            <div>
                                <h3 className={`font-bold text-sm ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>Período de Análisis</h3>
                                <p className="text-[11px] text-zinc-500">Seleccioná el rango a evaluar</p>
                            </div>
                        </div>
                        <div className="w-full lg:w-auto flex flex-col md:flex-row gap-3 lg:items-center">
                            <div className="w-full md:w-64 flex-shrink-0">
                                <Select darkMode={darkMode} value={globalMonth} onChange={e => setGlobalMonth(e.target.value)} options={periodOptions}/>
                            </div>
                            {globalMonth === 'custom' && (
                                <div className="flex items-center gap-2 animate-in slide-in-from-right-2 w-full md:w-auto">
                                    <Input darkMode={darkMode} type="date" value={customDateRange.start} onChange={e => setCustomDateRange({...customDateRange, start: e.target.value})} />
                                    <span className="text-zinc-500 font-bold">—</span>
                                    <Input darkMode={darkMode} type="date" value={customDateRange.end} onChange={e => setCustomDateRange({...customDateRange, end: e.target.value})} />
                                </div>
                            )}
                            {globalMonth === 'compare' && (
                                <div className="flex flex-col gap-2 animate-in slide-in-from-right-2 w-full md:w-auto">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase w-10 text-zinc-500">Base</span>
                                        <Input darkMode={darkMode} type="date" value={customDateRange.start} onChange={e => setCustomDateRange({...customDateRange, start: e.target.value})} />
                                        <span className="text-zinc-500 font-bold">—</span>
                                        <Input darkMode={darkMode} type="date" value={customDateRange.end} onChange={e => setCustomDateRange({...customDateRange, end: e.target.value})} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase w-10 text-rose-400">Vs</span>
                                        <Input darkMode={darkMode} type="date" value={compareDateRange.start} onChange={e => setCompareDateRange({...compareDateRange, start: e.target.value})} />
                                        <span className="text-zinc-500 font-bold">—</span>
                                        <Input darkMode={darkMode} type="date" value={compareDateRange.end} onChange={e => setCompareDateRange({...compareDateRange, end: e.target.value})} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* COMPARE / NORMAL */}
                    {globalMonth === 'compare' ? (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                            {/* COLUMNA BASE */}
                            <div className="space-y-5 border-b xl:border-b-0 xl:border-r border-[#1F1F1F]/60 pb-8 xl:pb-0 xl:pr-8">
                                <h3 className="text-base font-black flex items-center gap-2" style={{color:'#6366f1'}}>
                                    <Calendar size={16}/> Período Base
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <PremiumMetricCard darkMode={darkMode} title="Ingresos" value={formatCompact(analysisData.baseStats.totalRevenue)} subtitle={formatMoney(analysisData.baseStats.totalRevenue)} change={null} />
                                    <PremiumMetricCard darkMode={darkMode} title="Ganancia Bruta" value={formatCompact(analysisData.baseStats.grossProfit)} subtitle={`${formatPercent(analysisData.baseStats.grossMargin)} margen`} change={null} />
                                    <PremiumMetricCard darkMode={darkMode} title="Gastos" value={formatCompact(analysisData.baseStats.totalGlobalExpenses)} subtitle="Fijos y logística" change={null} />
                                    <PremiumMetricCard darkMode={darkMode} title="Beneficio Neto" value={formatCompact(analysisData.baseStats.netProfit)} subtitle={`${formatPercent(analysisData.baseStats.netMargin)} neto`} change={null} />
                                </div>
                                <div className={`rounded-2xl border p-4 ${darkMode ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200'}`}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <TrendingUp size={13} className="text-zinc-500"/>
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Ingresos (Base)</span>
                                    </div>
                                    <SalesAreaChart sales={analysisData.baseStats.filteredSales} mode="custom" customRange={customDateRange} darkMode={darkMode} isCompareMode={false} />
                                </div>
                            </div>
                            {/* COLUMNA VS */}
                            <div className="space-y-5">
                                <h3 className="text-base font-black text-rose-500 flex items-center gap-2">
                                    <ArrowUpDown size={16}/> Período a Comparar
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <PremiumMetricCard darkMode={darkMode} title="Ingresos" value={formatCompact(analysisData.compareStats?.totalRevenue || 0)} subtitle={formatMoney(analysisData.compareStats?.totalRevenue || 0)} change={analysisData.baseStats.totalRevenue > 0 ? ((analysisData.compareStats?.totalRevenue||0) - analysisData.baseStats.totalRevenue) / Math.abs(analysisData.baseStats.totalRevenue) * 100 : null} />
                                    <PremiumMetricCard darkMode={darkMode} title="Ganancia Bruta" value={formatCompact(analysisData.compareStats?.grossProfit || 0)} subtitle={`${formatPercent(analysisData.compareStats?.grossMargin || 0)} margen`} change={analysisData.baseStats.grossProfit !== 0 ? ((analysisData.compareStats?.grossProfit||0) - analysisData.baseStats.grossProfit) / Math.abs(analysisData.baseStats.grossProfit) * 100 : null} />
                                    <PremiumMetricCard darkMode={darkMode} title="Gastos" value={formatCompact(analysisData.compareStats?.totalGlobalExpenses || 0)} subtitle="Fijos y logística" change={null} />
                                    <PremiumMetricCard darkMode={darkMode} title="Beneficio Neto" value={formatCompact(analysisData.compareStats?.netProfit || 0)} subtitle={`${formatPercent(analysisData.compareStats?.netMargin || 0)} neto`} change={analysisData.baseStats.netProfit !== 0 ? ((analysisData.compareStats?.netProfit||0) - analysisData.baseStats.netProfit) / Math.abs(analysisData.baseStats.netProfit) * 100 : null} />
                                </div>
                                <div className={`rounded-2xl border p-4 ${darkMode ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200'}`}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <TrendingUp size={13} className="text-rose-500"/>
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Ingresos (Vs)</span>
                                    </div>
                                    <SalesAreaChart sales={analysisData.compareStats?.filteredSales || []} mode="custom" customRange={compareDateRange} darkMode={darkMode} isCompareMode={true} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* VISTA NORMAL */
                        <>
                            {/* METRIC CARDS */}
                            {(() => {
                                const prev = analysisData.prevBaseStats;
                                const cur = analysisData.baseStats;
                                const pct = (c, p) => (p && p !== 0) ? ((c - p) / Math.abs(p)) * 100 : null;
                                const newClientsOrganic = newClientsList.filter(s => s.isNewClient === 'Nuevo - Organico' || s.isNewClient === true).length;
                                const newClientsAds = newClientsList.filter(s => s.isNewClient === 'Nuevo - Publicidad').length;
                                const revendedoresList = analysisData.baseStats.filteredSales.filter(s => s.isNewClient === 'Revendedor');
                                const revendedoresCount = revendedoresList.length;
                                const revendedoresRevenue = revendedoresList.reduce((a, s) => a + (s.totalSaleRaw || 0), 0);
                                const avgTicket = cur.salesCount > 0 ? cur.totalRevenue / cur.salesCount : 0;
                                const prevAvgTicket = prev && prev.salesCount > 0 ? prev.totalRevenue / prev.salesCount : null;
                                const L = sparklineData7d.labels;
                                const fMoney = v => formatMoney(v);
                                const fUds = v => `${v} uds`;
                                const fClientes = v => `${v} cliente${v !== 1 ? 's' : ''}`;
                                const homeAdSpend = homeMetaDailyData.reduce((sum, day) => {
                                    if (!day.date_start) return sum;
                                    const [y, m, d] = day.date_start.split('-').map(Number);
                                    const dayDate = new Date(y, m - 1, d, 12, 0, 0);
                                    return dayDate >= analysisData.rangeStart && dayDate <= analysisData.rangeEnd
                                        ? sum + parseFloat(day.spend || 0)
                                        : sum;
                                }, 0);
                                const totalExpWithAds = cur.totalGlobalExpenses + homeAdSpend;
                                const netProfitWithAds = cur.netProfit - homeAdSpend;
                                const netMarginWithAds = cur.totalRevenue > 0 ? (netProfitWithAds / cur.totalRevenue) * 100 : 0;
                                return (
                                    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                                        <PremiumMetricCard darkMode={darkMode} title="Facturación" value={formatMoney(cur.totalRevenue)} subtitle="Bruto facturado" change={pct(cur.totalRevenue, prev?.totalRevenue)} sparkline={sparklineData7d.revenue} sparklineLabels={L} sparklineFormatter={fMoney} />
                                        <PremiumMetricCard darkMode={darkMode} title="Ganancia Bruta" value={formatMoney(cur.grossProfit)} subtitle={`${formatPercent(cur.grossMargin)} margen`} change={pct(cur.grossProfit, prev?.grossProfit)} sparkline={sparklineData7d.profit} sparklineLabels={L} sparklineFormatter={fMoney} />
                                        <PremiumMetricCard darkMode={darkMode} title="Ganancia Neta" value={formatMoney(netProfitWithAds)} subtitle={`${formatPercent(netMarginWithAds)} neto${homeAdSpend > 0 ? ' · incl. ads' : ''}`} change={pct(cur.netProfit, prev?.netProfit)} sparkline={sparklineData7d.profit} sparklineLabels={L} sparklineFormatter={fMoney} tooltip={homeAdSpend > 0 ? `Ganancia neta descontando el gasto en Meta Ads del período (${formatMoney(homeAdSpend)}). Gastos fijos: ${formatMoney(cur.totalGlobalExpenses)}.` : undefined} />
                                        <PremiumMetricCard darkMode={darkMode} title="Gastos Totales" value={formatMoney(totalExpWithAds)} subtitle={homeAdSpend > 0 ? `incl. ${formatMoney(homeAdSpend)} en ads` : 'Logística y operativos'} change={pct(cur.totalGlobalExpenses, prev?.totalGlobalExpenses)} sparkline={sparklineData7d.expenses} sparklineLabels={L} sparklineFormatter={fMoney} tooltip={homeAdSpend > 0 ? `Gastos fijos (${formatMoney(cur.totalGlobalExpenses)}) + Meta Ads del período (${formatMoney(homeAdSpend)}).` : undefined} />
                                        <PremiumMetricCard darkMode={darkMode} title="Inversión" value={formatMoney(cur.totalInvestment)} subtitle="Capital apostado" change={null} sparkline={sparklineData7d.investment} sparklineLabels={L} sparklineFormatter={fMoney} />
                                        <PremiumMetricCard darkMode={darkMode} title="Inversión Activa" value={formatMoney(cur.currentStockValue)} subtitle="Stock a costo actual" change={null} sparkline={null} />
                                        <PremiumMetricCard darkMode={darkMode} title="Productos Vendidos" value={cur.itemsSold} subtitle={`${cur.salesCount} pedidos`} change={pct(cur.itemsSold, prev?.itemsSold)} sparkline={sparklineData7d.units} sparklineLabels={L} sparklineFormatter={fUds} />
                                        <PremiumMetricCard darkMode={darkMode} title="Ticket Promedio" value={formatMoney(avgTicket)} subtitle="por pedido" change={pct(avgTicket, prevAvgTicket)} sparkline={sparklineData7d.avgTicket} sparklineLabels={L} sparklineFormatter={fMoney} />
                                        <PremiumMetricCard darkMode={darkMode} title="Clientes Nuevos" value={newClientsList.length} subtitle="Total del período" change={null} sparkline={sparklineData7d.clients} sparklineLabels={L} sparklineFormatter={fClientes} />
                                        <PremiumMetricCard darkMode={darkMode} title="Clientes Orgánicos" value={newClientsOrganic} subtitle="Sin inversión en ads" change={null} sparkline={sparklineData7d.organicClients} sparklineLabels={L} sparklineFormatter={fClientes} />
                                        <PremiumMetricCard darkMode={darkMode} title="Clientes por Ads" value={newClientsAds} subtitle="Captados por publicidad" change={null} sparkline={sparklineData7d.adsClients} sparklineLabels={L} sparklineFormatter={fClientes} />
                                        <PremiumMetricCard darkMode={darkMode} title="Ventas Revendedor" value={revendedoresCount} subtitle={revendedoresCount > 0 ? formatMoney(revendedoresRevenue) : 'Sin ventas'} change={null} sparkline={sparklineData7d.resellerClients} sparklineLabels={L} sparklineFormatter={fClientes} />
                                        <PremiumMetricCard darkMode={darkMode} title="Promedio de Ventas" value={cur.dailyAvgItems.toFixed(1)} subtitle="uds por día" change={pct(cur.dailyAvgItems, prev?.dailyAvgItems)} sparkline={sparklineData7d.units} sparklineLabels={L} sparklineFormatter={fUds}
                                            extra={cur.currentStreak > 0 && (
                                                <div className="flex items-center gap-1.5 mt-1.5">
                                                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md" style={{background:'rgba(168,85,247,0.15)', border:'1px solid rgba(168,85,247,0.25)'}}>
                                                        <Flame size={11} style={{color:'#a855f7'}}/>
                                                        <span className="text-[11px] font-bold" style={{color:'#a855f7'}}>{cur.currentStreak}</span>
                                                    </div>
                                                </div>
                                            )}
                                        />
                                    </div>
                                );
                            })()}

                            {/* MAIN CHART */}
                            <div className={`rounded-2xl border p-5 ${darkMode ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200'}`}>
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className={`text-sm font-bold ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>Evolución del Período</h3>
                                        <p className="text-[11px] text-zinc-500 mt-0.5">Ingresos · Unidades · Ganancia</p>
                                    </div>
                                </div>
                                <SalesAreaChart sales={analysisData.baseStats.filteredSales} mode={globalMonth === 'custom' ? 'custom' : globalMonth} customRange={customDateRange} darkMode={darkMode} />
                            </div>

                        </>
                    )}

                    {/* EQUIPO + NUEVOS CLIENTES */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* EQUIPO */}
                        <div className={`rounded-2xl border p-5 ${darkMode ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200'}`}>
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4">Rendimiento del Equipo</h3>
                            <div className="space-y-3">
                                {teamStats.map((member, i) => (
                                    <div key={member.name} className={`rounded-xl border p-4 ${darkMode ? 'bg-zinc-900/40 border-[#1F1F1F]' : 'bg-zinc-50 border-zinc-200'}`}>
                                        {/* Cabecera */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black flex-shrink-0 ${i !== 0 ? (darkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-200 text-zinc-600') : ''}`} style={i === 0 ? {background:'#6366f1', color:'white'} : {}}>
                                                {i + 1}
                                            </div>
                                            <span className={`text-sm font-bold ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>{member.name}</span>
                                            <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${darkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-200 text-zinc-500'}`}>{member.share.toFixed(1)}% del total</span>
                                        </div>
                                        {/* Métricas */}
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                            <div>
                                                <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-0.5">Facturación</div>
                                                <div className={`text-base font-black leading-none ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>{formatMoney(member.revenue)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-0.5">Ganancia bruta</div>
                                                <div className="text-base font-black leading-none text-emerald-400">{formatMoney(member.profit)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-0.5">Pedidos / Unidades</div>
                                                <div className={`text-sm font-bold leading-none ${darkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>{member.count} pedidos · {member.items} un.</div>
                                            </div>
                                            <div>
                                                <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-0.5">Ticket promedio</div>
                                                <div className={`text-sm font-bold leading-none ${darkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>{formatMoney(member.avgTicket)}</div>
                                            </div>
                                            {member.commission !== null && (
                                                <div className="col-span-2">
                                                    <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-0.5">Comisión (3%)</div>
                                                    <div className="text-sm font-bold leading-none text-amber-400">{formatMoney(member.commission)}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {teamStats.length === 0 && <div className="text-sm text-zinc-500 text-center py-6 opacity-50">Sin datos de vendedores</div>}
                            </div>
                        </div>

                        {/* NUEVOS CLIENTES */}
                        <div className={`rounded-2xl border p-5 flex flex-col ${darkMode ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200'}`}>
                            {(() => {
                                const revendedoresList = analysisData.baseStats.filteredSales.filter(s => s.isNewClient === 'Revendedor');
                                const revendedoresCount = revendedoresList.length;
                                const org = newClientsList.filter(s => s.isNewClient === 'Nuevo - Organico' || s.isNewClient === true).length;
                                const ads = newClientsList.filter(s => s.isNewClient === 'Nuevo - Publicidad').length;
                                const allClientsForFilter = [...newClientsList, ...revendedoresList];
                                const filtered = newClientsFilter === 'organic'
                                    ? newClientsList.filter(s => s.isNewClient === 'Nuevo - Organico' || s.isNewClient === true)
                                    : newClientsFilter === 'ads'
                                    ? newClientsList.filter(s => s.isNewClient === 'Nuevo - Publicidad')
                                    : newClientsFilter === 'reseller'
                                    ? revendedoresList
                                    : allClientsForFilter;
                                const tabs = [
                                    { key: 'all',      label: `Todos · ${allClientsForFilter.length}` },
                                    { key: 'organic',  label: `Orgánico · ${org}` },
                                    { key: 'ads',      label: `Ads · ${ads}` },
                                    { key: 'reseller', label: `Revendedor · ${revendedoresCount}` },
                                ];
                                return (<>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Nuevos Clientes</h3>
                                    </div>
                                    <div className={`flex items-center gap-1 p-1 rounded-xl mb-4 ${darkMode ? 'bg-zinc-900/60' : 'bg-zinc-100'}`}>
                                        {tabs.map(t => (
                                            <button key={t.key} onClick={() => setNewClientsFilter(t.key)}
                                                className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition-all duration-150 ${
                                                    newClientsFilter === t.key
                                                        ? (darkMode ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'bg-white text-zinc-900 shadow-sm')
                                                        : 'text-zinc-500 hover:text-zinc-400'
                                                }`}>{t.label}</button>
                                        ))}
                                    </div>
                                    <div className="max-h-[240px] overflow-y-auto custom-scrollbar space-y-2 pr-1 flex-1">
                                        {filtered.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-8 opacity-50">
                                                <Star size={28} className="mb-2 text-zinc-500"/>
                                                <span className="text-sm text-zinc-500">Sin clientes nuevos en este período</span>
                                            </div>
                                        ) : filtered.map((nc, i) => (
                                            <div key={nc.id || i} className={`flex items-center justify-between p-3 rounded-xl border ${darkMode ? 'bg-zinc-900/40 border-[#1F1F1F] hover:border-zinc-700' : 'bg-zinc-50 border-zinc-200'}`}>
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
                                                        nc.isNewClient === 'Nuevo - Publicidad' ? 'bg-blue-500/10 text-blue-400'
                                                        : nc.isNewClient === 'Revendedor' ? 'bg-violet-500/10 text-violet-400'
                                                        : 'bg-emerald-500/10 text-emerald-400'}`}>
                                                        {nc.isNewClient === 'Nuevo - Publicidad' ? 'AD' : nc.isNewClient === 'Revendedor' ? 'RE' : 'OR'}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className={`text-xs font-semibold truncate ${darkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>
                                                            {nc.productName}{nc.variant && <span className="font-normal opacity-60"> {nc.variant}</span>}
                                                        </div>
                                                        <div className="text-[10px] text-zinc-500">{safeDateStr(nc.date, {day:'numeric', month:'short'})} · {nc.seller || '028 Import'}</div>
                                                    </div>
                                                </div>
                                                <div className="text-xs font-black text-emerald-400 flex-shrink-0 ml-2">{formatCompact(nc.totalSaleRaw)}</div>
                                            </div>
                                        ))}
                                    </div>
                                </>);
                            })()}
                        </div>
                    </div>

                </div>
            )}

            {/* --- PESTAÑA VENTAS (SISTEMA MULTIPRODUCTO + TABLA AGRUPADA) --- */}
            {activeTab === 'sales' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 animate-in fade-in duration-300">
                
                {/* Columna Izquierda: Formulario Multiproducto con SCROLL INTERNO */}
                <div className="lg:col-span-4">
                    <div className="sticky top-6 space-y-4 max-h-[calc(100vh-100px)] overflow-y-auto custom-scrollbar pr-2 pb-4">
                        <Card darkMode={darkMode} className="p-5">
                            <h2 className="text-base font-bold mb-4 flex items-center gap-2"><ShoppingCart size={18} className="text-indigo-500"/> Nuevo Pedido</h2>
                            
                            <div className="space-y-4">
                                <Input darkMode={darkMode} label="Fecha de Operación" type="date" value={saleGeneral.saleDate} onChange={e => setSaleGeneral({...saleGeneral, saleDate: e.target.value})} />
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                    <Select darkMode={darkMode} label="Registro" value={saleGeneral.accountingType || 'Normal'} onChange={e => setSaleGeneral({...saleGeneral, accountingType: e.target.value})} options={[{value:'Normal', label:'Venta normal'}, {value:'Neutro', label:'Neutro / Global'}]} />
                                    <Select darkMode={darkMode} label="Canal" value={saleGeneral.source} onChange={e => setSaleGeneral({...saleGeneral, source: e.target.value})} options={[{value:'Instagram', label:'Instagram'}, {value:'Whatsapp', label:'Whatsapp'}, {value:'Personal', label:'Personal'}, {value:'Web', label:'Web'}]} />
                                    <Select darkMode={darkMode} label="Tipo" value={saleGeneral.isReseller} onChange={e => setSaleGeneral({...saleGeneral, isReseller: e.target.value})} options={[{value:'No', label:'Consumidor'}, {value:'Si', label:'Revendedor'}]} />
                                    <Select darkMode={darkMode} label="Cliente" value={saleGeneral.isNewClient} onChange={e => setSaleGeneral({...saleGeneral, isNewClient: e.target.value})} options={[{value:'Frecuente', label:'Frecuente'}, {value:'Nuevo - Organico', label:'Nuevo - Orgánico'}, {value:'Nuevo - Publicidad', label:'Nuevo - Publicidad'}, {value:'Revendedor', label:'Revendedor'}]} />
                                </div>

                                {saleGeneral.isReseller === 'Si' && (
                                  <Input
                                    darkMode={darkMode}
                                    label="Nombre del cliente mayorista"
                                    placeholder="Ej: Juan, local, revendedor..."
                                    value={saleGeneral.wholesaleClient || ''}
                                    onChange={e => setSaleGeneral({...saleGeneral, wholesaleClient: e.target.value})}
                                  />
                                )}

                                {(saleGeneral.accountingType || 'Normal') === 'Neutro' && (
                                  <div className={`p-3 rounded-xl border text-xs font-semibold ${darkMode ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300' : 'bg-indigo-50 border-indigo-100 text-indigo-700'}`}>
                                    Modo neutro: descuenta stock y guarda la ganancia para el histórico global, pero NO crea venta, NO aparece en días, meses, gráficos ni resumen normal.
                                  </div>
                                )}
                                
                                <hr className={`border-dashed ${darkMode ? 'border-[#1F1F1F]' : 'border-zinc-200'}`} />

                                <div className="space-y-4">
                                    {saleItems.map((item, index) => (
                                        <div key={item.id} className={`p-4 rounded-xl border relative ${darkMode ? 'bg-[#101010] border-[#1F1F1F]' : 'bg-zinc-50 border-zinc-200'}`}>
                                            <div className="flex justify-between items-center mb-3">
                                                <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Producto {index + 1}</span>
                                                {saleItems.length > 1 && (
                                                    <button onClick={() => removeSaleItem(item.id)} className="text-red-500 hover:bg-red-500/10 p-1 rounded-md transition-colors">
                                                        <XCircle size={14} />
                                                    </button>
                                                )}
                                            </div>

                                            <div className="space-y-3">
                                                <CustomSelect 
                                                    darkMode={darkMode} 
                                                    label="Carpeta de Origen" 
                                                    value={item.batchId} 
                                                    onChange={e => {
                                                        updateSaleItem(item.id, 'batchId', e.target.value);
                                                        updateSaleItem(item.id, 'itemId', ''); 
                                                    }} 
                                                    options={batches.map(b => ({
                                                        value: b.id, 
                                                        label: b.name || 'Sin nombre',
                                                        renderDropdown: (
                                                            <div className="flex items-center justify-between w-full">
                                                                <span className="font-medium text-xs truncate">{b.name || 'Sin nombre'}</span>
                                                                {b.finalizedAt && <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-zinc-500/20 text-zinc-500 ml-2">Archivado</span>}
                                                            </div>
                                                        )
                                                    }))} 
                                                />
                                                
                                                {item.batchId && (
                                                    <div className="animate-in slide-in-from-top-2">
                                                        <CustomSelect 
                                                            darkMode={darkMode} 
                                                            label="Artículo Vendido" 
                                                            value={item.itemId} 
                                                            onChange={e => updateSaleItem(item.id, 'itemId', e.target.value)} 
                                                            options={(batches.find(b => b.id === item.batchId)?.items || []).map(bItem => ({
                                                                value: bItem.id, 
                                                                label: `${bItem.product || 'Desconocido'} - ${bItem.variant || ''} (${bItem.currentStock || 0})`, 
                                                                disabled: (bItem.currentStock || 0) <= 0,
                                                                renderDropdown: (
                                                                    <div className="flex flex-col w-full gap-0.5">
                                                                        <div className="flex justify-between items-center">
                                                                            <span className={`font-semibold text-xs truncate ${item.itemId === bItem.id ? 'text-indigo-400' : ''}`}>{bItem.product || 'Desconocido'}</span>
                                                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase whitespace-nowrap ml-2 ${(bItem.currentStock || 0) > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                                                                Disp: {bItem.currentStock || 0}
                                                                            </span>
                                                                        </div>
                                                                        {bItem.variant && <span className="text-[10px] opacity-60 leading-tight">{bItem.variant}</span>}
                                                                    </div>
                                                                )
                                                            }))} 
                                                        />
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2 gap-3">
                                                    <Input darkMode={darkMode} label="Cantidad" type="number" value={item.quantity} onChange={e => updateSaleItem(item.id, 'quantity', e.target.value)} />
                                                    <Input darkMode={darkMode} label="Precio Un." type="number" symbol="$" value={item.unitPrice} onChange={e => updateSaleItem(item.id, 'unitPrice', e.target.value)} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    <Button darkMode={darkMode} onClick={addSaleItem} variant="outline" className="w-full text-xs h-9 border-dashed"><Plus size={14}/> Sumar otro producto</Button>
                                </div>

                                <hr className={`border-dashed ${darkMode ? 'border-[#1F1F1F]' : 'border-zinc-200'}`} />

                                {(saleGeneral.accountingType || 'Normal') !== 'Neutro' && (
                                  <div className={`p-3 rounded-lg border grid grid-cols-2 gap-3 ${darkMode ? 'bg-[#0D0D0D] border-[#1F1F1F]' : 'bg-zinc-50 border-zinc-200'}`}>
                                      <Input darkMode={darkMode} label="Costo Envío" type="number" symbol="$" value={saleGeneral.shippingCost} onChange={e => setSaleGeneral({...saleGeneral, shippingCost: e.target.value})} />
                                      <Input darkMode={darkMode} label="Cobro Envío" type="number" symbol="$" value={saleGeneral.shippingPrice} onChange={e => setSaleGeneral({...saleGeneral, shippingPrice: e.target.value})} />
                                  </div>
                                )}

                                <Button darkMode={darkMode} onClick={handleAddSale} className="w-full mt-4 h-12 text-base shadow-lg shadow-indigo-600/30">
                                  {(saleGeneral.accountingType || 'Normal') === 'Neutro' ? 'Registrar Neutro' : 'Procesar Venta'}
                                </Button>
                            </div>
                        </Card>
                    </div>
                </div>

                {/* Columna Derecha: Historial Agrupado */}
                <div className="lg:col-span-8">
                  <Card darkMode={darkMode} className="h-full flex flex-col p-0 overflow-hidden border-zinc-200 dark:border-[#1F1F1F]">
                    <div className={`p-4 border-b flex flex-col sm:flex-row justify-between gap-4 sm:items-center ${darkMode ? 'bg-[#181818] border-[#1F1F1F]' : 'bg-white border-zinc-200'}`}>
                        <div className="flex flex-col">
                            <h3 className="font-bold text-base flex-shrink-0">Libro de Ventas</h3>
                            <span className={`text-[11px] font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                              Mostrando {Math.min(visibleGroupedSales.length, groupedSales.length)} de {groupedSales.length} registros
                            </span>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <div className="flex-1 sm:w-64">
                                <Input 
                                  darkMode={darkMode} 
                                  type="search" 
                                  placeholder="Buscar producto, sabor, precio, vendedor, origen..." 
                                  value={salesSearch}
                                  onChange={(e) => setSalesSearch(e.target.value)}
                                />
                            </div>
                            <Button darkMode={darkMode} onClick={handleExportSales} variant="outline" className="h-10 px-3 flex-shrink-0" title="Exportar CSV"><Download size={16}/></Button>
                        </div>
                    </div>
                    
                    {selectedSalesSummary.salesCount > 0 && (
                      <div className={`px-4 py-3 border-b flex flex-col xl:flex-row xl:items-center justify-between gap-3 ${darkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-100'}`}>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                          <span className={`px-2.5 py-1 rounded-lg ${darkMode ? 'bg-red-500/15 text-red-300' : 'bg-white text-red-700 border border-red-100'}`}>
                            {selectedSalesSummary.salesCount} registro(s) seleccionado(s)
                          </span>
                          <span className={`px-2.5 py-1 rounded-lg ${darkMode ? 'bg-black/25 text-zinc-300' : 'bg-white text-zinc-700 border border-red-100'}`}>
                            {selectedSalesSummary.productsCount} producto(s) / unidad(es)
                          </span>
                          <span className={`px-2.5 py-1 rounded-lg ${darkMode ? 'bg-black/25 text-zinc-300' : 'bg-white text-zinc-700 border border-red-100'}`}>
                            {selectedSalesSummary.linesCount} línea(s)
                          </span>
                          <span className={`px-2.5 py-1 rounded-lg ${darkMode ? 'bg-black/25 text-zinc-300' : 'bg-white text-zinc-700 border border-red-100'}`}>
                            Total: {formatMoney(selectedSalesSummary.revenue)}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button darkMode={darkMode} onClick={clearSelectedSales} variant="outline" className="h-9 text-xs">Limpiar</Button>
                          <Button darkMode={darkMode} onClick={handleDeleteSelectedSales} variant="danger" className="h-9 text-xs">
                            <Trash2 size={14}/> Borrar seleccionadas
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto flex-1 h-[700px] custom-scrollbar">
                      <table className="w-full text-left text-sm border-collapse">
                          <thead className={`sticky top-0 z-10 text-xs font-semibold ${darkMode ? 'bg-[#101010] text-zinc-400 border-b border-[#1F1F1F] shadow-sm' : 'bg-zinc-50 text-zinc-500 border-b border-zinc-200 shadow-sm'}`}>
                              <tr>
                                <th className="px-4 py-3 w-10">
                                  <input
                                    type="checkbox"
                                    checked={allVisibleSalesSelected}
                                    onChange={toggleAllVisibleSalesSelection}
                                    disabled={groupedSales.length === 0}
                                    title={allVisibleSalesSelected ? 'Deseleccionar ventas visibles' : 'Seleccionar ventas visibles'}
                                    className="w-4 h-4 accent-indigo-600 cursor-pointer disabled:opacity-30"
                                  />
                                </th>
                                <th className="px-4 py-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => toggleSort('createdAt')}>
                                  <div className="flex items-center gap-1">Registro <span className="opacity-50">{salesSort.key === 'createdAt' ? (salesSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span></div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => toggleSort('productName')}>
                                  <div className="flex items-center gap-1">Operación <span className="opacity-50">{salesSort.key === 'productName' ? (salesSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span></div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-emerald-500" onClick={() => toggleSort('profit')}>
                                  <div className="flex items-center gap-1">Neto <span className="opacity-50">{salesSort.key === 'profit' ? (salesSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span></div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => toggleSort('totalSaleRaw')}>
                                  <div className="flex items-center gap-1">Total Fac. <span className="opacity-50">{salesSort.key === 'totalSaleRaw' ? (salesSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span></div>
                                </th>
                                <th className="px-4 py-3"></th>
                              </tr>
                          </thead>
                          <tbody className={`divide-y ${darkMode ? 'divide-zinc-800/80' : 'divide-zinc-100'}`}>
                            {groupedSales.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-sm font-medium opacity-50 italic">No se encontraron ventas con esos filtros.</td></tr>}
                            {visibleGroupedSales.map(group => (
                                <tr key={group.ticketId} className={`transition-colors group ${selectedSaleTickets[group.ticketId] ? (darkMode ? 'bg-indigo-500/10 hover:bg-indigo-500/15' : 'bg-indigo-50 hover:bg-indigo-100/70') : (darkMode ? 'hover:bg-[#181818]' : 'hover:bg-zinc-50')}`}>
                                  <td className="px-4 py-3 align-top pt-4">
                                    <input
                                      type="checkbox"
                                      checked={!!selectedSaleTickets[group.ticketId]}
                                      onChange={() => toggleSaleTicketSelection(group.ticketId)}
                                      className="w-4 h-4 accent-indigo-600 cursor-pointer"
                                      title="Seleccionar venta"
                                    />
                                  </td>
                                  <td className={`px-4 py-3 text-xs font-medium whitespace-nowrap align-top pt-4 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                      {safeDateStr(group.date, {month:'short', day:'numeric'})}
                                      {/* ETIQUETAS VISUALES */}
                                      <div className="flex flex-col gap-1 mt-1.5 items-start">
                                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${darkMode ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-200 text-zinc-700'}`}>👤 {group.seller}</span>
                                          {group.isNeutral && <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${darkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-100 text-indigo-700'}`}>Neutro</span>}
                                          {(isNewClientStatus(group.isNewClient) || group.isNewClient === 'Revendedor') && (
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                              group.isNewClient === 'Revendedor'
                                                ? (darkMode ? 'bg-violet-500/10 text-violet-400' : 'bg-violet-100 text-violet-700')
                                                : (darkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-100 text-amber-600')
                                            }`}>{getClientStatusLabel(group.isNewClient)}</span>
                                          )}
                                          {group.isReseller && <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${darkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-100 text-indigo-600'}`}>Revendedor</span>}
                                      </div>
                                  </td>
                                  <td className="px-4 py-3">
                                      <div className="flex flex-col gap-2 mt-1">
                                          {group.items.map((item, idx) => (
                                              <div key={idx} className="flex flex-col">
                                                  <div className="font-semibold text-sm">
                                                      {item.quantity || 0}x {item.productName || 'Sin nombre'} <span className="font-normal opacity-70 ml-1">{item.variant || ''}</span>
                                                      {item.isNeutral && <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${darkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-700'}`}>Neutro</span>}
                                                  </div>
                                                  <div className={`text-[10px] font-medium mt-0.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Lote: {item.batchName || 'S/N'}{item.neutralReason ? ` · ${item.neutralReason}` : ''}</div>
                                              </div>
                                          ))}
                                      </div>
                                  </td>
                                  <td className="px-4 py-3 font-medium text-emerald-500 text-sm align-top pt-4">{formatMoney(group.totalProfit)}</td>
                                  <td className="px-4 py-3 font-bold font-mono tracking-tight align-top pt-4">{formatMoney(group.totalSaleRaw)}</td>
                                  <td className="px-4 py-3 text-right align-top pt-3">
                                      <button onClick={() => handleDeleteTicket(group)} className={`p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${darkMode ? 'text-zinc-500 hover:bg-red-500/10 hover:text-red-400' : 'text-zinc-400 hover:bg-red-50 hover:text-red-600'}`}><Trash2 size={16} /></button>
                                  </td>
                                </tr>
                            ))}
                          </tbody>
                      </table>

                      {hasMoreGroupedSales && (
                        <div className={`sticky bottom-0 p-3 border-t text-center ${darkMode ? 'bg-[#101010]/95 border-[#1F1F1F]' : 'bg-white/95 border-zinc-200'} backdrop-blur`}>
                          <Button
                            darkMode={darkMode}
                            variant="outline"
                            onClick={() => setSalesDisplayLimit(prev => prev + 120)}
                            className="h-9 text-xs"
                          >
                            Mostrar 120 registros más ({groupedSales.length - visibleGroupedSales.length} restantes)
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>


                </div>
              </div>
            )}

            {/* --- PESTAÑA MAYORISTA --- */}
            {activeTab === 'wholesale' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
                      <UserCircle size={24} className="text-indigo-500"/> Mayorista
                    </h2>
                    <p className={`text-sm mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                      Clientes revendedores, compras acumuladas y ventas. Los detalles quedan cerrados para que no se haga infinito.
                    </p>
                  </div>
                  <div className={`rounded-xl border px-4 py-3 text-xs font-semibold ${darkMode ? 'bg-[#0D0D0D] border-[#1F1F1F] text-zinc-400' : 'bg-indigo-50 border-indigo-100 text-indigo-700'}`}>
                    Tip: cargá el nombre del cliente en ventas mayoristas para que aparezca ordenado.
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <MetricCard color="indigo" darkMode={darkMode} title="Clientes mayoristas" value={wholesaleData.activeClients} subtitle="Con compras registradas" icon={Users} />
                  <MetricCard color="blue" darkMode={darkMode} title="Pedidos mayoristas" value={wholesaleData.orders} subtitle={`${wholesaleData.totalUnits} unidades`} icon={ShoppingCart} />
                  <MetricCard color="emerald" darkMode={darkMode} title="Facturación mayorista" value={formatMoney(wholesaleData.totalRevenue)} subtitle="Total vendido" icon={DollarSign} />
                  <MetricCard color="violet" darkMode={darkMode} title="Ganancia mayorista" value={formatMoney(wholesaleData.totalProfit)} subtitle="Ingresos - costo" icon={TrendingUp} />
                </div>

                {wholesaleData.clients.length === 0 ? (
                  <Card darkMode={darkMode} className="p-12 text-center">
                    <Users size={42} className="mx-auto mb-4 opacity-40"/>
                    <p className="text-sm font-medium opacity-60">Todavía no hay ventas mayoristas registradas.</p>
                    <p className={`text-xs mt-2 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Las ventas aparecen acá cuando tienen Tipo: Revendedor.</p>
                  </Card>
                ) : (
                  <div className="space-y-4 max-w-5xl">
                    {wholesaleData.clients.map(client => {
                      const isOpen = expandedWholesaleClient === client.name;
                      return (
                        <Card key={client.name} darkMode={darkMode} className="p-0 overflow-hidden">
                          <div className={`p-5 border-b ${darkMode ? 'bg-[#181818] border-[#1F1F1F]' : 'bg-white border-zinc-200'}`}>
                            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                              <div className="flex items-start gap-4 min-w-0">
                                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${darkMode ? 'bg-indigo-500/10 text-indigo-300' : 'bg-indigo-100 text-indigo-700'}`}>
                                  <UserCircle size={23}/>
                                </div>
                                <div className="min-w-0">
                                  <h3 className="font-black text-lg truncate">{client.name}</h3>
                                  <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                    {client.orders} pedido(s) · {client.units} unidad(es) · Última compra: {client.lastDate ? safeDateStr(client.lastDate, {month:'short', day:'numeric', year:'numeric'}) : 'Sin fecha'}
                                  </p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs w-full">
                                <div className={`rounded-xl p-3 ${darkMode ? 'bg-[#0D0D0D]' : 'bg-zinc-50'}`}>
                                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-50">Compró</p>
                                  <p className="font-black text-emerald-500">{formatMoney(client.revenue)}</p>
                                </div>
                                <div className={`rounded-xl p-3 ${darkMode ? 'bg-[#0D0D0D]' : 'bg-zinc-50'}`}>
                                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-50">Ganancia</p>
                                  <p className="font-black">{formatMoney(client.profit)}</p>
                                </div>
                                <div className={`rounded-xl p-3 ${darkMode ? 'bg-[#0D0D0D]' : 'bg-zinc-50'}`}>
                                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-50">Ticket prom.</p>
                                  <p className="font-black">{formatMoney(client.avgTicket)}</p>
                                </div>
                                <div className={`rounded-xl p-3 ${darkMode ? 'bg-[#0D0D0D]' : 'bg-zinc-50'}`}>
                                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-50">Unidades</p>
                                  <p className="font-black">{client.units}</p>
                                </div>
                              </div>

                              <div className="flex flex-col sm:flex-row xl:flex-col gap-2 xl:w-40">
                                <Button
                                  darkMode={darkMode}
                                  onClick={() => setExpandedWholesaleClient(isOpen ? null : client.name)}
                                  variant="outline"
                                  className="h-9 text-xs justify-center"
                                >
                                  {isOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                                  {isOpen ? 'Ocultar detalle' : 'Ver detalle'}
                                </Button>
                                <Button darkMode={darkMode} onClick={() => handleDeleteWholesaleClient(client)} variant="outline" className="h-9 text-xs justify-center text-red-500 border-red-500/30 hover:bg-red-500/10">
                                  <Trash2 size={13}/> Borrar cliente
                                </Button>
                              </div>
                            </div>
                          </div>

                          {isOpen && (
                            <div className={`p-5 space-y-5 ${darkMode ? 'bg-[#101010]' : 'bg-zinc-50'}`}>
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-wider opacity-50 mb-2">Productos destacados</p>
                                <div className="flex flex-wrap gap-2">
                                  {client.topProducts.length === 0 ? (
                                    <span className="text-xs opacity-50">Sin productos para mostrar.</span>
                                  ) : client.topProducts.map(p => (
                                    <span key={p.name} className={`px-3 py-2 rounded-xl text-xs font-bold ${darkMode ? 'bg-[#0D0D0D] text-zinc-300' : 'bg-white text-zinc-700 border border-zinc-200'}`}>
                                      {p.name} · {p.quantity}u
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <p className="text-[10px] font-black uppercase tracking-wider opacity-50 mb-2">Ventas del cliente</p>
                                <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                                  {client.orderGroups.map(order => (
                                    <div key={order.ticketId} className={`rounded-2xl border p-4 ${darkMode ? 'bg-[#0D0D0D] border-[#1F1F1F]' : 'bg-white border-zinc-200'}`}>
                                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="text-sm font-black">{safeDateStr(order.date, {month:'short', day:'numeric', year:'numeric'})}</p>
                                          <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                            {order.quantity} unidad(es) · {order.originalSales.length} línea(s) · {formatMoney(order.totalSaleRaw)}
                                          </p>
                                        </div>
                                        <Button darkMode={darkMode} onClick={() => handleDeleteWholesaleOrder(order)} variant="outline" className="h-8 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10 shrink-0">
                                          <Trash2 size={13}/> Borrar venta
                                        </Button>
                                      </div>

                                      <div className="mt-3 flex flex-wrap gap-1.5">
                                        {order.productList.slice(0, 6).map(p => (
                                          <span key={p.name} className={`px-2 py-1 rounded-lg text-[10px] font-bold ${darkMode ? 'bg-zinc-900 text-zinc-400' : 'bg-zinc-100 text-zinc-600'}`}>
                                            {p.name} · {p.quantity}u
                                          </span>
                                        ))}
                                        {order.productList.length > 6 && (
                                          <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${darkMode ? 'bg-zinc-900 text-zinc-500' : 'bg-zinc-100 text-zinc-500'}`}>
                                            +{order.productList.length - 6} más
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            )}



            {/* --- PESTAÑA LOTES (CON EDICIÓN DE LOTE) --- */}
            {activeTab === 'batches' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <Card darkMode={darkMode} className="p-0 overflow-hidden">
                  <div className={`p-5 border-b flex flex-col md:flex-row justify-between md:items-center gap-4 ${darkMode ? 'bg-[#181818] border-[#1F1F1F]' : 'bg-white border-zinc-200'}`}>
                      <div>
                          <h2 className="text-xl font-bold mb-1">Inventario de Lotes</h2>
                          <p className={`text-sm ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Administra tus importaciones y catálogos de productos.</p>
                      </div>
                      <div className="flex gap-3 items-end w-full md:w-auto">
                        <div className="flex-1 md:w-64"><Input darkMode={darkMode} placeholder="Nombre del nuevo lote..." value={newBatchName} onChange={e => setNewBatchName(e.target.value)} /></div>
                        <Button darkMode={darkMode} onClick={handleCreateBatch} className="shrink-0"><Plus size={16}/> Crear Lote</Button>
                      </div>
                  </div>
                  <div className={`px-5 py-3 flex flex-wrap justify-end gap-2 bg-zinc-50 dark:bg-[#0D0D0D]`}>
                      <Button darkMode={darkMode} onClick={() => copyAllBatchesToClipboard(true)} variant="outline" className="h-9"><Copy size={14}/> Copiar activos</Button>
                      <Button darkMode={darkMode} onClick={() => copyAllBatchesToClipboard(false)} variant="outline" className="h-9"><Copy size={14}/> Copiar todos</Button>
                      <Button darkMode={darkMode} onClick={handleExportBatches} variant="outline" className="h-9"><Download size={14}/> Bajar CSV Completo</Button>
                  </div>
                </Card>

                <div className="grid grid-cols-1 gap-4">
                  {batches.map((b) => (
                    <Card key={b.id} darkMode={darkMode} className={`p-0 overflow-hidden transition-all duration-300 group ${expandedBatchId === b.id ? 'ring-2 ring-indigo-500/50 border-transparent' : ''}`}>
                      <div className={`p-5 flex justify-between items-center cursor-pointer transition-colors ${darkMode ? 'hover:bg-[#181818]' : 'hover:bg-zinc-50'}`} onClick={() => setExpandedBatchId(expandedBatchId === b.id ? null : b.id)}>
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 flex items-center justify-center rounded-xl ${b.finalizedAt ? (darkMode ? 'bg-emerald-500/10 text-emerald-500' : 'bg-emerald-100 text-emerald-600') : (darkMode ? 'bg-indigo-500/10 text-indigo-500' : 'bg-indigo-100 text-indigo-600')}`}>
                                <FolderOpen size={24} strokeWidth={2} />
                            </div>
                            
                            {/* LÓGICA AGREGADA: EDICIÓN DE NOMBRE DE LOTE */}
                            <div>
                                {editingBatchId === b.id ? (
                                    <div className="flex items-center gap-2 mb-1" onClick={e => e.stopPropagation()}>
                                        <input
                                            autoFocus
                                            className={`px-2 py-1 text-sm border rounded outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#0D0D0D] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`}
                                            value={editingBatchName}
                                            onChange={(e) => setEditingBatchName(e.target.value)}
                                        />
                                        <button onClick={() => handleSaveEditBatchName(b.id)} className={`p-1.5 rounded-lg ${darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}><Save size={14}/></button>
                                        <button onClick={() => setEditingBatchId(null)} className={`p-1.5 rounded-lg ${darkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-200 text-zinc-600'}`}><XCircle size={14}/></button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <h3 className={`font-bold text-base ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>{b.name || 'Sin nombre'}</h3>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setEditingBatchId(b.id); setEditingBatchName(b.name || ''); }} 
                                            className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md ${darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-200 text-zinc-500'}`}
                                        >
                                            <Settings size={14}/>
                                        </button>
                                    </div>
                                )}

                                <div className="flex items-center gap-3 mt-1">
                                    <span className={`text-xs font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>{(b.items || []).length} Ítems</span>
                                    <span className="text-zinc-300 dark:text-zinc-700">•</span>
                                    <span className={`text-xs font-bold ${b.finalizedAt ? (darkMode ? 'text-zinc-500' : 'text-zinc-500') : (darkMode ? 'text-emerald-400' : 'text-emerald-600')}`}>{b.finalizedAt ? 'Archivado' : 'En Venta'}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); copyBatchToClipboard(b); }}
                              className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${darkMode ? 'text-zinc-300 bg-[#101010] hover:bg-indigo-500/10 hover:text-indigo-400' : 'text-zinc-600 bg-zinc-100 hover:bg-indigo-50 hover:text-indigo-600'}`}
                              title="Copiar contenido del lote"
                            >
                              <Copy size={14}/> Copiar
                            </button>
                            <div className={`p-2 rounded-full transition-colors ${darkMode ? 'text-zinc-500 bg-[#101010]' : 'text-zinc-400 bg-zinc-100'}`}>
                                {expandedBatchId === b.id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                            </div>
                        </div>
                      </div>
                      
                      {expandedBatchId === b.id && (
                        <div className={`border-t animate-in slide-in-from-top-2 ${darkMode ? 'border-[#1F1F1F] bg-[#101010]' : 'border-zinc-200 bg-zinc-50/50'}`}>
                          
                          <div className={`p-5 m-5 rounded-xl border border-dashed ${darkMode ? 'border-zinc-700 bg-[#181818]' : 'border-zinc-300 bg-white'}`}>
                            <h4 className={`text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}><Plus size={14}/> Agregar Mercadería</h4>
                            <div className="grid grid-cols-2 md:grid-cols-12 gap-3 items-end">
                              <div className="col-span-2 md:col-span-3"><Input darkMode={darkMode} list="products-list" label="Producto" placeholder="Ej: Cherry Fuse" value={newItem.product} onChange={e => setNewItem({...newItem, product: e.target.value})} /></div>
                              <div className="col-span-2 md:col-span-3"><Input darkMode={darkMode} list="variants-list" label="Variante" placeholder="Ej: Blanco" value={newItem.variant} onChange={e => setNewItem({...newItem, variant: e.target.value})} /></div>
                              <div className="col-span-1 md:col-span-2"><Input darkMode={darkMode} label="Costo ($)" type="number" value={newItem.costArs} onChange={e => setNewItem({...newItem, costArs: e.target.value})} /></div>
                              <div className="col-span-1 md:col-span-1"><Input darkMode={darkMode} label="Cant." type="number" value={newItem.initialStock} onChange={e => setNewItem({...newItem, initialStock: e.target.value})} /></div>
                              <div className="col-span-1 md:col-span-1">
                                <Input
                                  darkMode={darkMode}
                                  label="Veces"
                                  type="number"
                                  value={newItem.repeatCount}
                                  onChange={e => setNewItem({...newItem, repeatCount: e.target.value})}
                                />
                              </div>
                              <div className="col-span-2 md:col-span-2">
                                <Button darkMode={darkMode} onClick={() => handleAddItemToBatch(b.id)} className="w-full">
                                  {parseInt(newItem.repeatCount) > 1 ? `Añadir ×${parseInt(newItem.repeatCount)}` : 'Añadir'}
                                </Button>
                              </div>
                            </div>
                          </div>

                          <table className="w-full text-left text-sm border-t dark:border-[#1F1F1F]">
                            <thead className={`text-xs font-semibold ${darkMode ? 'bg-[#181818] text-zinc-500' : 'bg-zinc-100 text-zinc-500'}`}>
                                <tr><th className="px-5 py-3">Descripción del Artículo</th><th className="px-5 py-3">Costo Un.</th><th className="px-5 py-3">Disponibilidad</th><th className="px-5 py-3 text-right"></th></tr>
                            </thead>
                            <tbody className={`divide-y ${darkMode ? 'divide-zinc-800/50' : 'divide-zinc-200'}`}>
                              {(b.items || []).length === 0 && <tr><td colSpan="4" className="p-8 text-center text-sm font-medium opacity-50 italic">La carpeta está vacía.</td></tr>}
                              {(b.items || []).map((item, idx) => {
                                const isEditing = editingItem?.id === item.id;
                                const isRestoring = restoringItem?.id === item.id;
                                return (
                                <tr key={item.id} className={`transition-colors group/item ${darkMode ? 'hover:bg-[#181818]' : 'hover:bg-white'}`}>
                                  {isRestoring ? (
                                      <>
                                          <td className="px-5 py-3">
                                              <div className="font-semibold text-sm">{item.product || 'Sin nombre'}</div>
                                              <div className={`text-xs font-medium mt-0.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>{item.variant || ''}</div>
                                          </td>
                                          <td className="px-5 py-3 font-mono font-medium text-sm text-zinc-500">{formatMoney(item.costArs)}</td>
                                          <td className="px-5 py-3">
                                              <div className="flex items-center gap-2">
                                                  <input
                                                      autoFocus
                                                      type="number" min="1"
                                                      placeholder="Cant."
                                                      className={`w-20 p-1.5 text-sm border rounded outline-none focus:border-amber-500 ${darkMode ? 'bg-[#0D0D0D] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`}
                                                      value={restoringItem.amount}
                                                      onChange={e => setRestoringItem({ ...restoringItem, amount: e.target.value })}
                                                      onKeyDown={e => { if (e.key === 'Enter') handleConfirmRestore(b.id); if (e.key === 'Escape') setRestoringItem(null); }}
                                                  />
                                                  <span className={`text-xs ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>actual: {item.currentStock || 0}</span>
                                              </div>
                                          </td>
                                          <td className="px-5 py-3 text-right">
                                              <div className="flex justify-end gap-1">
                                                  <button onClick={() => handleConfirmRestore(b.id)} className={`p-2 rounded-lg ${darkMode ? 'text-amber-400 hover:bg-amber-500/10' : 'text-amber-600 hover:bg-amber-50'}`} title="Confirmar restauración"><Save size={16} /></button>
                                                  <button onClick={() => setRestoringItem(null)} className={`p-2 rounded-lg ${darkMode ? 'text-zinc-500 hover:bg-zinc-800' : 'text-zinc-400 hover:bg-zinc-100'}`} title="Cancelar"><XCircle size={16} /></button>
                                              </div>
                                          </td>
                                      </>
                                  ) : isEditing ? (
                                      <>
                                          <td className="px-5 py-3">
                                              <input className={`w-full p-1.5 mb-1 text-sm border rounded outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#0D0D0D] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`} value={editingItem.product} onChange={e => setEditingItem({...editingItem, product: e.target.value})} placeholder="Producto"/>
                                              <input className={`w-full p-1.5 text-xs border rounded outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#0D0D0D] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`} value={editingItem.variant} onChange={e => setEditingItem({...editingItem, variant: e.target.value})} placeholder="Variante"/>
                                          </td>
                                          <td className="px-5 py-3">
                                              <input type="number" className={`w-20 p-1.5 text-sm border rounded outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#0D0D0D] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`} value={editingItem.costArs} onChange={e => setEditingItem({...editingItem, costArs: e.target.value})} />
                                          </td>
                                          <td className="px-5 py-3">
                                              <input type="number" className={`w-16 p-1.5 text-sm border rounded outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#0D0D0D] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`} value={editingItem.initialStock} onChange={e => setEditingItem({...editingItem, initialStock: e.target.value})} title="Editar stock total comprado"/>
                                          </td>
                                          <td className="px-5 py-3 text-right">
                                              <div className="flex justify-end gap-1">
                                                  <button onClick={() => handleSaveEditItem(b.id)} className={`p-2 rounded-lg ${darkMode ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-emerald-600 hover:bg-emerald-50'}`} title="Guardar Cambios"><Save size={16} /></button>
                                                  <button onClick={() => setEditingItem(null)} className={`p-2 rounded-lg ${darkMode ? 'text-zinc-500 hover:bg-zinc-800' : 'text-zinc-400 hover:bg-zinc-100'}`} title="Cancelar"><XCircle size={16} /></button>
                                              </div>
                                          </td>
                                      </>
                                  ) : (
                                      <>
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
                                              <div className="flex justify-end gap-1 opacity-0 group-hover/item:opacity-100 transition-all">
                                                  <button onClick={() => setRestoringItem({ ...item, amount: '' })} className={`p-2 rounded-lg ${darkMode ? 'text-amber-400 hover:bg-amber-500/10' : 'text-amber-600 hover:bg-amber-50'}`} title="Restaurar unidades"><RotateCcw size={16} /></button>
                                                  <button onClick={() => setEditingItem(item)} className={`p-2 rounded-lg ${darkMode ? 'text-indigo-400 hover:bg-indigo-500/10' : 'text-indigo-600 hover:bg-indigo-50'}`} title="Editar Producto"><Settings size={16} /></button>
                                                  <button onClick={() => handleDeleteItemFromBatch(b.id, item.id)} className={`p-2 rounded-lg ${darkMode ? 'text-red-400 hover:bg-red-500/10' : 'text-red-600 hover:bg-red-50'}`} title="Eliminar Producto"><Trash2 size={16} /></button>
                                              </div>
                                          </td>
                                      </>
                                  )}
                                </tr>
                              )})}
                            </tbody>
                          </table>
                          
                          <div className={`p-4 flex flex-wrap justify-between items-center gap-3 border-t ${darkMode ? 'border-[#1F1F1F] bg-[#0D0D0D]' : 'border-zinc-200 bg-zinc-100'}`}>
                              {b.finalizedAt ? (
                                <div className="flex items-center gap-3">
                                  <span className={`text-xs font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Archivado el {safeDateStr(b.finalizedAt)}</span>
                                  <button onClick={(e) => { e.stopPropagation(); handleUpdateBatchStatus(b.id, false); }} className={`text-sm font-semibold flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${darkMode ? 'text-indigo-400 hover:bg-indigo-500/10' : 'text-indigo-600 hover:bg-indigo-50'}`}>🔄 Reabrir Lote</button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                  <input type="date" value={manualFinalizeDate} onChange={e => setManualFinalizeDate(e.target.value)} className={`px-3 py-1.5 text-sm border rounded-lg outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#181818] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`} />
                                  <button onClick={() => handleUpdateBatchStatus(b.id, true)} className={`text-sm font-semibold flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${darkMode ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-emerald-700 hover:bg-emerald-50'}`}>✓ Finalizar Lote</button>
                                </div>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteBatch(b.id); }} className={`text-sm font-semibold flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${darkMode ? 'text-red-500 hover:bg-red-500/10' : 'text-red-600 hover:bg-red-50'}`}><Trash2 size={16}/> Eliminar Carpeta Definitivamente</button>
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}


            {/* --- PESTAÑA AJUSTAR STOCK REAL --- */}
            {activeTab === 'stockSync' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <Card darkMode={darkMode} className="p-0 overflow-hidden">
                  <div className={`p-5 border-b flex flex-col lg:flex-row justify-between lg:items-start gap-4 ${darkMode ? 'bg-[#181818] border-[#1F1F1F]' : 'bg-white border-zinc-200'}`}>
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-500"><ArrowUpDown size={20}/></div>
                        <h2 className="text-xl font-bold">Ajustar Stock Real</h2>
                      </div>
                      <p className={`text-sm max-w-3xl ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                        Pegá tu stock real tal cual lo escribís por WhatsApp. El sistema compara contra los lotes activos, detecta nombres parecidos aunque tengan letras mal escritas, productos invertidos, posibles duplicados y diferencias de cantidad.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button darkMode={darkMode} onClick={analyzeStockReconciliation} className="h-10"><Search size={16}/> Analizar</Button>
                      <Button darkMode={darkMode} onClick={applyExactStockReconciliation} disabled={!stockSyncAnalysis || isApplyingStockSync} variant="success" className="h-10">
                        <CheckCircle size={16}/> Aplicar exactos
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-0">
                    <div className={`p-5 border-r ${darkMode ? 'border-[#1F1F1F] bg-[#101010]' : 'border-zinc-200 bg-zinc-50/60'}`}>
                      <label className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>Stock real contado</label>
                      <textarea
                        value={stockSyncText}
                        onChange={e => setStockSyncText(e.target.value)}
                        placeholder={`Ejemplo:\n\n🧊 ELFBAR ICE KING\nCherry Strazz 🍒🍓 (8)\nWatermelon Ice 🍉🧊 (6)\nMiami Mint 🌴🌿❄️ (2)\n\n🧬 IGNITE V400 MIX\nGrape Ice - Watermelon Ice (2)`}
                        className={`mt-2 w-full min-h-[430px] rounded-xl border p-4 text-sm font-mono leading-relaxed outline-none resize-y custom-scrollbar ${darkMode ? 'bg-[#0D0D0D] border-[#1F1F1F] text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500' : 'bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500'}`}
                      />
                      <div className={`mt-4 p-4 rounded-xl border ${darkMode ? 'bg-[#0D0D0D] border-[#1F1F1F] text-zinc-400' : 'bg-white border-zinc-200 text-zinc-600'}`}>
                        <p className="text-xs font-bold uppercase tracking-wider mb-2">Reglas de seguridad</p>
                        <ul className="text-xs space-y-1.5">
                          <li>• No borra productos.</li>
                          <li>• No toca coincidencias dudosas: palabras parecidas como “pasion/passion” o modelos como “V400 MIX/VMIX” se muestran para revisar.</li>
                          <li>• Si falta stock en sistema, suma unidades al lote encontrado.</li>
                          <li>• Si sobra stock en sistema, descuenta desde los lotes con más unidades.</li>
                          <li>• Guarda backup en <span className="font-mono">stock_sync_logs</span>.</li>
                        </ul>
                      </div>
                    </div>

                    <div className="p-5 space-y-5">
                      {!stockSyncAnalysis ? (
                        <div className={`h-full min-h-[430px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center p-8 ${darkMode ? 'border-[#1F1F1F] text-zinc-500' : 'border-zinc-300 text-zinc-400'}`}>
                          <Package size={44} className="mb-4 opacity-50"/>
                          <h3 className="font-bold text-lg mb-2">Pegá el stock y tocá Analizar</h3>
                          <p className="text-sm max-w-md">Todavía no se modifica nada. Primero vas a ver qué falta, qué sobra, qué no se encontró y qué parece duplicado.</p>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <MetricCard darkMode={darkMode} color="emerald" title="Exactas" value={stockSyncAnalysis.summary.exact} subtitle={`${stockSyncAnalysis.summary.ok} OK`} icon={CheckCircle} />
                            <MetricCard darkMode={darkMode} color="amber" title="Dudosas" value={stockSyncAnalysis.summary.probable} subtitle="Revisar manual" icon={AlertTriangle} />
                            <MetricCard darkMode={darkMode} color="rose" title="No encontradas" value={stockSyncAnalysis.summary.notFound} subtitle="Faltan en sistema" icon={XCircle} />
                            <MetricCard darkMode={darkMode} color="violet" title="Duplicados" value={stockSyncAnalysis.summary.duplicates} subtitle="Posibles repetidos" icon={Package} />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Card darkMode={darkMode} className="p-4">
                              <p className="text-xs font-bold uppercase tracking-wider text-emerald-500 mb-1">Falta agregar en sistema</p>
                              <p className="text-2xl font-black">{stockSyncAnalysis.summary.toAdd}</p>
                              <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Productos donde stock real &gt; stock cargado.</p>
                            </Card>
                            <Card darkMode={darkMode} className="p-4">
                              <p className="text-xs font-bold uppercase tracking-wider text-red-500 mb-1">Sobra en sistema</p>
                              <p className="text-2xl font-black">{stockSyncAnalysis.summary.toRemove}</p>
                              <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Productos donde stock cargado &gt; stock real.</p>
                            </Card>
                          </div>

                          <div className="space-y-4 max-h-[720px] overflow-y-auto custom-scrollbar pr-1">
                            <div>
                              <h3 className="text-sm font-black uppercase tracking-wider mb-3 flex items-center gap-2 text-emerald-500"><CheckCircle size={16}/> Coincidencias exactas aplicables</h3>
                              <div className="space-y-2">
                                {stockSyncAnalysis.exact.length === 0 && <p className="text-sm opacity-50">No hay coincidencias exactas.</p>}
                                {stockSyncAnalysis.exact.map((row, idx) => (
                                  <div key={`exact-${idx}`} className={`p-4 rounded-xl border ${darkMode ? 'bg-[#101010] border-[#1F1F1F]' : 'bg-white border-zinc-200'}`}>
                                    <div className="flex flex-col md:flex-row md:justify-between gap-3">
                                      <div>
                                        <p className="font-bold text-sm">{row.real.model} / {row.real.variant}</p>
                                        <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Detectado como: {row.web.label} · Score {row.score}%</p>
                                      </div>
                                      <div className="flex items-center gap-2 text-xs font-bold">
                                        <span className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800">Sistema: {row.webStock}</span>
                                        <span className="px-2 py-1 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400">Real: {row.realStock}</span>
                                        <span className={`px-2 py-1 rounded ${row.diff === 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : row.diff > 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'}`}>{row.diff > 0 ? `Agregar ${row.diff}` : row.diff < 0 ? `Sacar ${Math.abs(row.diff)}` : 'OK'}</span>
                                      </div>
                                    </div>
                                    <div className="mt-3 grid gap-1.5">
                                      {row.web.entries.map(entry => (
                                        <div key={`${entry.batchId}-${entry.itemId}`} className={`text-xs px-3 py-2 rounded-lg ${darkMode ? 'bg-[#0D0D0D] text-zinc-400' : 'bg-zinc-50 text-zinc-600'}`}>
                                          {entry.batchName}: <strong>{entry.currentStock}</strong> unidades · {entry.product} / {entry.variant}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div>
                              <h3 className="text-sm font-black uppercase tracking-wider mb-3 flex items-center gap-2 text-amber-500"><AlertTriangle size={16}/> Coincidencias dudosas</h3>
                              <div className="space-y-2">
                                {stockSyncAnalysis.probable.length === 0 && <p className="text-sm opacity-50">No hay coincidencias dudosas.</p>}
                                {stockSyncAnalysis.probable.map((row, idx) => (
                                  <div key={`prob-${idx}`} className={`p-4 rounded-xl border ${darkMode ? 'bg-[#101010] border-[#1F1F1F]' : 'bg-white border-zinc-200'}`}>
                                    <p className="font-bold text-sm">{row.real.model} / {row.real.variant} <span className="text-amber-500">({row.realStock})</span></p>
                                    <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Mejor coincidencia: {row.web.label} · Stock sistema {row.webStock} · Score {row.score}% · Modelo {row.modelScore}% · Sabor {row.variantScore}%</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {row.candidates.map((candidate, cidx) => (
                                        <span key={cidx} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${darkMode ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-100 text-zinc-700'}`}>{candidate.web.label} · {candidate.score}%</span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div>
                              <h3 className="text-sm font-black uppercase tracking-wider mb-3 flex items-center gap-2 text-red-500"><XCircle size={16}/> No encontrados en sistema</h3>
                              <div className="space-y-2">
                                {stockSyncAnalysis.notFound.length === 0 && <p className="text-sm opacity-50">Todos los productos reales tuvieron alguna coincidencia.</p>}
                                {stockSyncAnalysis.notFound.map((row, idx) => (
                                  <div key={`nf-${idx}`} className={`p-4 rounded-xl border ${darkMode ? 'bg-[#101010] border-[#1F1F1F]' : 'bg-white border-zinc-200'}`}>
                                    <p className="font-bold text-sm">{row.real.model} / {row.real.variant}</p>
                                    <p className="text-xs text-red-500 mt-1">Stock real: {row.real.quantity}. No se encontró en lotes activos.</p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div>
                              <h3 className="text-sm font-black uppercase tracking-wider mb-3 flex items-center gap-2 text-violet-500"><AlertTriangle size={16}/> Posibles duplicados en sistema</h3>
                              <div className="space-y-2">
                                {stockSyncAnalysis.duplicateGroups.length === 0 && <p className="text-sm opacity-50">No detecté duplicados fuertes.</p>}
                                {stockSyncAnalysis.duplicateGroups.map((dup, idx) => (
                                  <div key={`dup-${idx}`} className={`p-4 rounded-xl border ${darkMode ? 'bg-[#101010] border-[#1F1F1F]' : 'bg-white border-zinc-200'}`}>
                                    <p className="font-bold text-sm">Posible duplicado · Score {dup.score}%</p>
                                    <p className={`text-xs mt-2 ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>1. {dup.a.label} · Stock {dup.a.totalStock}</p>
                                    <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>2. {dup.b.label} · Stock {dup.b.totalStock}</p>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div>
                              <h3 className="text-sm font-black uppercase tracking-wider mb-3 flex items-center gap-2 text-zinc-500"><Package size={16}/> En sistema pero no aparece en stock real</h3>
                              <div className="space-y-2">
                                {stockSyncAnalysis.extraWeb.length === 0 && <p className="text-sm opacity-50">No sobran productos sin relación.</p>}
                                {stockSyncAnalysis.extraWeb.slice(0, 50).map((row, idx) => (
                                  <div key={`extra-${idx}`} className={`p-4 rounded-xl border ${darkMode ? 'bg-[#101010] border-[#1F1F1F]' : 'bg-white border-zinc-200'}`}>
                                    <p className="font-bold text-sm">{row.web.label}</p>
                                    <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Stock sistema: {row.webStock}. Revisar si corresponde llevar a 0 o si faltó escribirlo en el stock real.</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
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
                       <div className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${batchAnalysis.batch.finalizedAt ? (darkMode ? 'border-[#1F1F1F] bg-[#101010]' : 'border-zinc-300 bg-zinc-100') : (darkMode ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-indigo-200 bg-indigo-50')}`}>
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
                          <MetricCard color="emerald" darkMode={darkMode} title="Flujo Efectivo" value={formatMoney(batchAnalysis.cashBalance)} subtitle="Liquidez generada" icon={Activity} />
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
                          <div className={`p-5 border-b flex items-center gap-3 ${darkMode ? 'border-[#1F1F1F]' : 'border-zinc-200'}`}>
                              <div className="bg-indigo-500/10 text-indigo-500 p-2 rounded-lg"><Users size={18}/></div>
                              <h3 className="font-bold tracking-tight text-sm">Distribución de Canales</h3>
                          </div>
                          <ModernDistribution data={batchAnalysis.pieSourceData} colors={['#6366f1', '#a855f7', '#ec4899', '#14b8a6', '#f59e0b']} darkMode={darkMode} />
                        </Card>

                        <Card darkMode={darkMode} className="p-0 overflow-hidden">
                          <div className={`p-5 border-b flex items-center gap-3 ${darkMode ? 'border-[#1F1F1F]' : 'border-zinc-200'}`}>
                              <div className="bg-indigo-500/10 text-indigo-500 p-2 rounded-lg"><BarChart3 size={18}/></div>
                              <h3 className="font-bold tracking-tight text-sm">Perfil de Comprador</h3>
                          </div>
                          <ModernDistribution data={batchAnalysis.pieTypeData} colors={['#10b981', '#6366f1']} darkMode={darkMode} />
                        </Card>
                      </div>
                    </div>
                ) : (
                    <div className={`py-24 text-center rounded-xl border border-dashed ${darkMode ? 'border-[#1F1F1F] bg-[#101010]' : 'border-zinc-300 bg-zinc-50'}`}>
                        <BarChart3 size={48} className={`mx-auto mb-4 ${darkMode ? 'text-zinc-800' : 'text-zinc-200'}`}/>
                        <p className={`text-sm font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Elige un lote en el menú superior para comenzar el análisis.</p>
                    </div>
                )}
              </div>
            )}



            {/* --- PESTAÑA CONSIGNACIÓN --- */}
            {activeTab === 'consignment' && (
              <div className="animate-in fade-in duration-300 max-w-[1540px] space-y-8">
                <div className={`relative overflow-hidden rounded-[2rem] p-7 md:p-8 shadow-[0_28px_90px_rgba(0,0,0,0.18)] backdrop-blur-xl ring-1 ${darkMode ? 'bg-white/[0.018] ring-white/[0.06]' : 'bg-white/80 ring-zinc-200/70'}`}>
                  <div className="absolute inset-0 pointer-events-none">
                    <div className={`absolute -top-40 -right-28 h-80 w-80 rounded-full blur-3xl ${darkMode ? 'bg-amber-500/10' : 'bg-amber-200/50'}`}></div>
                    <div className={`absolute -bottom-44 -left-28 h-80 w-80 rounded-full blur-3xl ${darkMode ? 'bg-indigo-500/10' : 'bg-indigo-200/40'}`}></div>
                  </div>

                  <div className="relative flex flex-col xl:flex-row xl:items-end justify-between gap-8">
                    <div>
                      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] mb-4 ${darkMode ? 'bg-white/5 text-zinc-400 ring-1 ring-white/[0.06]' : 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200'}`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                        Control
                      </div>
                      <h2 className="text-4xl md:text-5xl font-black tracking-[-0.04em] leading-none">
                        Consignación
                      </h2>
                      <p className={`text-sm md:text-base mt-4 max-w-xl leading-relaxed ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Stock afuera, cobros pendientes y movimientos por cliente.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full xl:w-auto xl:min-w-[760px]">
                      {[
                        { label: 'Pendiente', value: consignmentStats.pending, sub: 'unidades', icon: Package, tone: 'text-amber-400' },
                        { label: 'Por cobrar', value: formatMoney(consignmentStats.valuePending), sub: 'pendiente', icon: Clock, tone: 'text-blue-400' },
                        { label: 'Cobrado', value: formatMoney(consignmentStats.valuePaid), sub: `${consignmentStats.paid} unidades`, icon: CheckCircle, tone: 'text-emerald-400' },
                        { label: 'Ganancia', value: formatMoney(consignmentStats.profitPaid), sub: 'real', icon: TrendingUp, tone: 'text-violet-400' }
                      ].map(metric => (
                        <div key={metric.label} className={`rounded-[1.4rem] p-3 sm:p-4 backdrop-blur-xl ring-1 overflow-hidden min-w-0 ${darkMode ? 'bg-black/12 ring-white/[0.06]' : 'bg-white/70 ring-zinc-200 shadow-sm'}`}>
                          <div className="flex items-center justify-between mb-2 sm:mb-3 gap-1">
                            <p className={`text-[9px] sm:text-[10px] font-black uppercase tracking-[0.16em] truncate ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{metric.label}</p>
                            <metric.icon size={14} className={`flex-shrink-0 ${metric.tone}`}/>
                          </div>
                          <p className="text-base sm:text-xl lg:text-2xl font-black tracking-[-0.03em] break-all leading-tight">{metric.value}</p>
                          <p className={`text-[10px] sm:text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>{metric.sub}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={`inline-flex rounded-full p-1 ring-1 backdrop-blur-xl ${darkMode ? 'bg-white/[0.035] ring-white/[0.06]' : 'bg-white/80 ring-zinc-200 shadow-sm'}`}>
                  <button
                    type="button"
                    onClick={() => setConsignmentSubView('movimientos')}
                    className={`h-10 px-5 rounded-full text-xs font-black transition-all ${consignmentSubView === 'movimientos' ? (darkMode ? 'bg-white text-black' : 'bg-black text-white') : (darkMode ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900')}`}
                  >
                    Consignación
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsignmentSubView('clientes')}
                    className={`h-10 px-5 rounded-full text-xs font-black transition-all ${consignmentSubView === 'clientes' ? (darkMode ? 'bg-white text-black' : 'bg-black text-white') : (darkMode ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900')}`}
                  >
                    Clientes a Consignación
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] ${consignmentSubView === 'clientes' ? (darkMode ? 'bg-black/10 text-black' : 'bg-white/20 text-white') : (darkMode ? 'bg-white/[0.06] text-zinc-400' : 'bg-zinc-100 text-zinc-500')}`}>{consignmentClientHistory.length}</span>
                  </button>
                </div>

                <div
                  style={{ display: consignmentSubView === 'movimientos' ? 'grid' : 'none' }}
                  className="grid-cols-1 2xl:grid-cols-[460px_1fr] gap-6 items-start"
                >
                  <div className={`rounded-[2rem] overflow-hidden ring-1 backdrop-blur-xl shadow-[0_28px_90px_rgba(0,0,0,0.18)] ${darkMode ? 'bg-white/[0.026] ring-white/[0.06]' : 'bg-white/90 ring-zinc-200'}`}>
                    <div className={`px-6 py-5 border-b ${darkMode ? 'border-white/[0.06]' : 'border-zinc-200'}`}>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h3 className="text-2xl font-black tracking-[-0.03em]">Nueva entrega</h3>
                          <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Cliente y productos.</p>
                        </div>
                        <button
                          onClick={addConsignmentLine}
                          className={`h-10 px-4 rounded-full text-xs font-black transition-all active:scale-95 ${darkMode ? 'bg-white text-black hover:bg-zinc-200' : 'bg-black text-white hover:bg-zinc-800'}`}
                        >
                          + Producto
                        </button>
                      </div>
                    </div>

                    <div className="p-6 space-y-5">
                      <div className={`rounded-[1.5rem] p-4 ring-1 ${darkMode ? 'bg-black/12 ring-white/[0.06]' : 'bg-zinc-50 ring-zinc-200'}`}>
                        <div className="space-y-3">
                          <Input
                            darkMode={darkMode}
                            label="Cliente"
                            placeholder="Ej: Juan"
                            value={newConsignment.clientName}
                            onChange={e => setNewConsignment({ ...newConsignment, clientName: e.target.value })}
                          />

                          <div className="grid grid-cols-2 gap-3">
                            <Input
                              darkMode={darkMode}
                              label="Teléfono"
                              placeholder="+54 9..."
                              value={newConsignment.clientPhone}
                              onChange={e => setNewConsignment({ ...newConsignment, clientPhone: e.target.value })}
                            />

                            <Input
                              darkMode={darkMode}
                              label="DNI"
                              placeholder="37375216"
                              value={newConsignment.clientDni}
                              onChange={e => setNewConsignment({ ...newConsignment, clientDni: e.target.value })}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <Input
                              darkMode={darkMode}
                              label="Fecha límite"
                              type="date"
                              value={newConsignment.dueDate}
                              onChange={e => setNewConsignment({ ...newConsignment, dueDate: e.target.value })}
                            />

                            <Input
                              darkMode={darkMode}
                              label="Nota"
                              placeholder="Opcional"
                              value={newConsignment.note}
                              onChange={e => setNewConsignment({ ...newConsignment, note: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {(newConsignment.lines || []).map((line, index) => {
                          const selectedBatch = getConsignmentBatchById(line.batchId);
                          const availableItems = getConsignmentAvailableItems(line.batchId);
                          const selectedItem = getConsignmentItemById(line.batchId, line.itemId);
                          const qty = parseInt(line.quantity) || 0;
                          const unitPrice = parseFloat(line.unitPrice) || 0;
                          const value = qty * unitPrice;
                          const estimatedProfit = ((unitPrice - (Number(selectedItem?.costArs) || 0)) * qty);

                          return (
                            <div key={line.id} className={`rounded-[1.5rem] overflow-hidden ring-1 ${darkMode ? 'bg-black/12 ring-white/[0.06]' : 'bg-white ring-zinc-200 shadow-sm'}`}>
                              <div className={`px-4 py-3 flex items-center justify-between gap-3 border-b ${darkMode ? 'border-white/[0.06] bg-white/[0.025]' : 'border-zinc-100 bg-zinc-50/80'}`}>
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${darkMode ? 'bg-white/[0.055] text-zinc-200' : 'bg-black text-white'}`}>{index + 1}</span>
                                  <div className="min-w-0">
                                    <p className="text-sm font-black truncate">{selectedItem ? `${selectedItem.product} / ${selectedItem.variant || 'Único'}` : 'Producto sin elegir'}</p>
                                    <p className={`text-[11px] ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                      {selectedItem ? `${qty || 0} u. · ${formatMoney(value)}` : 'Seleccioná lote y producto'}
                                    </p>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => removeConsignmentLine(line.id)}
                                  className={`p-2 rounded-full transition-all ${darkMode ? 'text-zinc-500 hover:text-red-300 hover:bg-red-500/10' : 'text-zinc-400 hover:text-red-600 hover:bg-red-50'}`}
                                  title="Quitar producto"
                                >
                                  <Trash2 size={15}/>
                                </button>
                              </div>

                              <div className="p-4 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <Select
                                    darkMode={darkMode}
                                    label="Lote"
                                    value={line.batchId}
                                    onChange={e => updateConsignmentLine(line.id, 'batchId', e.target.value)}
                                    options={[
                                      { value: '', label: '-- Lote --' },
                                      ...batches.filter(b => !b.finalizedAt).map(b => ({ value: b.id, label: b.name || 'Sin nombre' }))
                                    ]}
                                  />

                                  <Select
                                    darkMode={darkMode}
                                    label="Producto"
                                    value={line.itemId}
                                    onChange={e => updateConsignmentLine(line.id, 'itemId', e.target.value)}
                                    options={[
                                      { value: '', label: selectedBatch ? '-- Producto --' : 'Primero lote' },
                                      ...availableItems.map(item => ({
                                        value: item.id,
                                        label: `${item.product || 'Sin producto'} / ${item.variant || 'Único'} · stock ${item.currentStock || 0}`
                                      }))
                                    ]}
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <Input
                                    darkMode={darkMode}
                                    label="Cantidad"
                                    type="number"
                                    min="1"
                                    value={line.quantity}
                                    onChange={e => updateConsignmentLine(line.id, 'quantity', e.target.value)}
                                  />

                                  <Input
                                    darkMode={darkMode}
                                    label="Precio"
                                    type="number"
                                    symbol="$"
                                    value={line.unitPrice}
                                    onChange={e => updateConsignmentLine(line.id, 'unitPrice', e.target.value)}
                                  />
                                </div>

                                {selectedItem && (
                                  <div className={`rounded-2xl px-4 py-3 flex items-center justify-between text-xs font-black ${darkMode ? 'bg-white/[0.028] text-zinc-300' : 'bg-zinc-50 text-zinc-700'}`}>
                                    <span>Stock {selectedItem.currentStock || 0}</span>
                                    <span className={estimatedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatMoney(estimatedProfit)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className={`rounded-[1.5rem] p-5 ring-1 ${darkMode ? 'bg-white/[0.028] ring-white/[0.06]' : 'bg-zinc-50 ring-zinc-200'}`}>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                          <div className="min-w-0">
                            <p className={`text-[9px] font-black uppercase tracking-[0.16em] ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Prod.</p>
                            <p className="font-black text-base sm:text-lg">{consignmentDraftSummary.rows}</p>
                          </div>
                          <div className="min-w-0">
                            <p className={`text-[9px] font-black uppercase tracking-[0.16em] ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Unid.</p>
                            <p className="font-black text-base sm:text-lg">{consignmentDraftSummary.units}</p>
                          </div>
                          <div className="min-w-0">
                            <p className={`text-[9px] font-black uppercase tracking-[0.16em] ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Cobrar</p>
                            <p className="font-black text-sm sm:text-base lg:text-lg break-all">{formatMoney(consignmentDraftSummary.value)}</p>
                          </div>
                          <div className="min-w-0">
                            <p className={`text-[9px] font-black uppercase tracking-[0.16em] ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Gan.</p>
                            <p className="font-black text-sm sm:text-base lg:text-lg text-emerald-400 break-all">{formatMoney(consignmentDraftSummary.profit)}</p>
                          </div>
                        </div>

                        <button
                          onClick={handleCreateConsignment}
                          className={`w-full h-12 rounded-full font-black text-sm transition-all active:scale-[0.98] ${darkMode ? 'bg-white text-black hover:bg-zinc-200' : 'bg-black text-white hover:bg-zinc-800'}`}
                        >
                          Guardar entrega
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className={`rounded-[2rem] overflow-hidden ring-1 backdrop-blur-xl shadow-[0_28px_90px_rgba(0,0,0,0.18)] ${darkMode ? 'bg-white/[0.026] ring-white/[0.06]' : 'bg-white/90 ring-zinc-200'}`}>
                    <div className={`px-6 py-5 border-b ${darkMode ? 'border-white/[0.06]' : 'border-zinc-200'}`}>
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-2xl font-black tracking-[-0.03em]">Ventas a consignación</h3>
                          <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                            {consignmentOrders.length} registro(s). Cada entrega queda separada aunque sea el mismo cliente.
                          </p>
                        </div>

                        <div className="md:w-80">
                          <Input
                            darkMode={darkMode}
                            placeholder="Buscar cliente, producto, teléfono o DNI..."
                            value={consignmentSearch}
                            onChange={e => setConsignmentSearch(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className={`${darkMode ? 'bg-black/[0.045]' : 'bg-white/90'} max-h-[calc(100vh-275px)] overflow-y-auto custom-scrollbar p-3`}>
                      {consignmentOrders.filter(order => `${order.clientName || ''} ${order.clientPhone || ''} ${order.clientDni || ''} ${order.entries.map(e => `${e.productName || ''} ${e.variant || ''} ${e.batchName || ''}`).join(' ')}`.toLowerCase().includes(consignmentSearch.toLowerCase())).length === 0 && (
                        <div className="p-20 text-center">
                          <Package size={42} className="mx-auto mb-4 opacity-25"/>
                          <p className="text-sm font-bold opacity-50">No hay ventas a consignación cargadas.</p>
                        </div>
                      )}

                      <div className="space-y-3">
                        {consignmentOrders
                          .filter(order => `${order.clientName || ''} ${order.clientPhone || ''} ${order.clientDni || ''} ${order.entries.map(e => `${e.productName || ''} ${e.variant || ''} ${e.batchName || ''}`).join(' ')}`.toLowerCase().includes(consignmentSearch.toLowerCase()))
                          .map(order => {
                            const isOpen = expandedConsignmentOrder === order.id;
                            const totalProducts = order.entries.length;
                            const orderDate = order.createdAt || order.updatedAt;

                            return (
                              <div
                                key={order.id}
                                className={`rounded-[1.7rem] overflow-hidden ring-1 transition-all ${darkMode ? 'bg-white/[0.024] ring-white/[0.055] hover:ring-white/[0.09]' : 'bg-white ring-zinc-200 shadow-sm shadow-black/5 hover:shadow-md'}`}
                              >
                                <div
                                  className={`p-5 cursor-pointer transition-colors ${darkMode ? 'hover:bg-white/[0.026]' : 'hover:bg-zinc-50'}`}
                                  onClick={() => setExpandedConsignmentOrder(isOpen ? null : order.id)}
                                >
                                  <div className="space-y-4">
                                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                      <div className="flex items-center gap-4 min-w-0">
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${darkMode ? 'bg-white/[0.035] text-zinc-300 ring-1 ring-white/[0.05]' : 'bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200'}`}>
                                          <Package size={22}/>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <h3 className="font-black text-xl tracking-[-0.03em] truncate">{order.clientName}</h3>
                                          <p className={`text-xs mt-1 truncate ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                            {formatConsignmentDueDateShort(orderDate)} · {totalProducts} producto(s) · {order.pending} pendientes · {order.paid} pagadas
                                          </p>
                                          {(order.clientType || order.clientPhone || order.clientDni) && (
                                            <p className={`text-[11px] mt-1 truncate ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                              {order.clientType ? `Tipo: ${order.clientType}` : ''}{order.clientType && (order.clientPhone || order.clientDni) ? ' · ' : ''}{order.clientPhone ? `Tel: ${order.clientPhone}` : ''}{(order.clientPhone && order.clientDni) ? ' · ' : ''}{order.clientDni ? `DNI: ${order.clientDni}` : ''}
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center justify-end gap-2 shrink-0">
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); handleEditConsignmentOrderDueDate(order); }}
                                          className={`h-8 px-3 rounded-full text-xs font-black whitespace-nowrap transition-all ${darkMode ? 'bg-white/[0.035] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.07]' : 'bg-white text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 ring-1 ring-zinc-200'}`}
                                        >
                                          Editar
                                        </button>
                                        <div className={`flex items-center gap-1.5 text-xs font-black whitespace-nowrap ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                                          {isOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                                          {isOpen ? 'Cerrar' : 'Abrir'}
                                        </div>
                                      </div>
                                    </div>

                                    <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t ${darkMode ? 'border-white/[0.045]' : 'border-zinc-100'}`}>
                                      <div className={`rounded-2xl p-3 ${darkMode ? 'bg-white/[0.018]' : 'bg-white/70 shadow-sm shadow-black/5'}`}>
                                        <p className={`text-[9px] font-black uppercase tracking-[0.16em] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>Vence</p>
                                        <p className={`mt-1 text-sm font-black tracking-[-0.02em] whitespace-nowrap ${order.dueDate ? (darkMode ? 'text-zinc-200' : 'text-zinc-900') : (darkMode ? 'text-zinc-600' : 'text-zinc-400')}`}>
                                          {order.dueDate ? formatConsignmentDueDateShort(order.dueDate) : 'Sin límite'}
                                        </p>
                                      </div>
                                      <div className={`rounded-2xl p-3 ${darkMode ? 'bg-white/[0.018]' : 'bg-white/70 shadow-sm shadow-black/5'}`}>
                                        <p className={`text-[9px] font-black uppercase tracking-[0.16em] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>Debe</p>
                                        <p className={`mt-1 text-sm font-black tracking-[-0.02em] truncate ${darkMode ? 'text-amber-300/90' : 'text-amber-700'}`}>{formatMoney(order.valuePending)}</p>
                                      </div>
                                      <div className={`rounded-2xl p-3 ${darkMode ? 'bg-white/[0.018]' : 'bg-white/70 shadow-sm shadow-black/5'}`}>
                                        <p className={`text-[9px] font-black uppercase tracking-[0.16em] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>Cobrado</p>
                                        <p className={`mt-1 text-sm font-black tracking-[-0.02em] truncate ${darkMode ? 'text-emerald-300/90' : 'text-emerald-700'}`}>{formatMoney(order.valuePaid)}</p>
                                      </div>
                                      <div className={`rounded-2xl p-3 ${darkMode ? 'bg-white/[0.018]' : 'bg-white/70 shadow-sm shadow-black/5'}`}>
                                        <p className={`text-[9px] font-black uppercase tracking-[0.16em] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>Ganancia</p>
                                        <p className={`mt-1 text-sm font-black tracking-[-0.02em] truncate ${darkMode ? 'text-violet-300/90' : 'text-violet-700'}`}>{formatMoney(order.profitPaid)}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {isOpen && (
                                  <div className={`${darkMode ? 'bg-black/[0.16]' : 'bg-zinc-50/80'} border-t ${darkMode ? 'border-white/[0.06]' : 'border-zinc-100'}`}>
                                    {order.entries.map(entry => {
                                      const pending = Number(entry.quantityPending) || 0;
                                      const paid = Number(entry.quantityPaid) || 0;
                                      const returned = Number(entry.quantityReturned) || 0;
                                      const lost = Number(entry.quantityLost) || 0;
                                      const delivered = Number(entry.quantityDelivered) || 0;
                                      const unitPrice = Number(entry.unitPrice) || 0;
                                      const unitCost = Number(entry.unitCost) || 0;
                                      const isClosed = pending <= 0;

                                      return (
                                        <div key={entry.id} className={`p-5 border-b last:border-b-0 ${darkMode ? 'border-white/[0.045]' : 'border-zinc-100'} ${isClosed ? 'opacity-70' : ''}`}>
                                          <div className="grid grid-cols-1 2xl:grid-cols-12 gap-4 items-center">
                                            <div className="2xl:col-span-4 min-w-0">
                                              <div className="font-black text-sm truncate">{entry.productName || 'Sin producto'} / {entry.variant || 'Único'}</div>
                                              <div className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                                {entry.batchName || 'Sin lote'} · {formatMoney(unitPrice)}
                                              </div>
                                            </div>

                                            <div className="2xl:col-span-4 grid grid-cols-5 gap-2 text-xs">
                                              {[
                                                ['Ent.', delivered, ''],
                                                ['Debe', pending, 'text-amber-400'],
                                                ['Pagó', paid, 'text-emerald-400'],
                                                ['Dev.', returned, 'text-blue-400'],
                                                ['Perd.', lost, 'text-red-400']
                                              ].map(([label, value, color]) => (
                                                <div key={label} className={`rounded-2xl p-2.5 ${darkMode ? 'bg-white/[0.022]' : 'bg-white/80 shadow-sm shadow-black/5'}`}>
                                                  <p className={`font-black uppercase text-[9px] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>{label}</p>
                                                  <p className={`font-black ${color}`}>{value}</p>
                                                </div>
                                              ))}
                                            </div>

                                            <div className="2xl:col-span-2 text-xs">
                                              <p className={`font-black uppercase text-[9px] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>Por cobrar</p>
                                              <p className="font-black">{formatMoney(pending * unitPrice)}</p>
                                              <p className={`font-black uppercase text-[9px] mt-2 ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>Ganancia</p>
                                              <p className="font-black text-emerald-400">{formatMoney(pending * (unitPrice - unitCost))}</p>
                                            </div>

                                            <div className="2xl:col-span-2 grid grid-cols-2 gap-2">
                                              <button disabled={pending <= 0} onClick={() => handleConsignmentPayment(entry)} className={`h-8 rounded-full text-xs font-black transition-all ${pending <= 0 ? 'opacity-40 cursor-not-allowed' : ''} ${darkMode ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                                                Pago
                                              </button>
                                              <button disabled={pending <= 0} onClick={() => handleConsignmentReturn(entry)} className={`h-8 rounded-full text-xs font-black transition-all ${pending <= 0 ? 'opacity-40 cursor-not-allowed' : ''} ${darkMode ? 'bg-white/5 text-zinc-300 hover:bg-white/[0.055]' : 'bg-white text-zinc-700 hover:bg-zinc-100 ring-1 ring-zinc-200'}`}>
                                                Dev.
                                              </button>
                                              <button disabled={pending <= 0} onClick={() => handleConsignmentLost(entry)} className={`h-8 rounded-full text-xs font-black transition-all ${pending <= 0 ? 'opacity-40 cursor-not-allowed' : ''} ${darkMode ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}>
                                                Perdido
                                              </button>
                                              <button onClick={() => handleDeleteConsignmentEntry(entry)} className={`h-8 rounded-full text-xs font-black transition-all ${darkMode ? 'bg-white/5 text-red-300 hover:bg-red-500/15' : 'bg-white text-red-600 hover:bg-red-50 ring-1 ring-zinc-200'}`}>
                                                Borrar
                                              </button>
                                            </div>
                                          </div>

                                          {entry.note && <div className={`text-xs mt-3 italic ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>“{entry.note}”</div>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>

                </div>

                <div
                  style={{ display: consignmentSubView === 'clientes' ? 'block' : 'none' }}
                  className={`rounded-[2rem] overflow-hidden ring-1 backdrop-blur-xl shadow-[0_28px_90px_rgba(0,0,0,0.18)] ${darkMode ? 'bg-white/[0.026] ring-white/[0.06]' : 'bg-white/90 ring-zinc-200'}`}
                >
                  <div className={`px-6 py-5 border-b ${darkMode ? 'border-white/[0.06]' : 'border-zinc-200'}`}>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-black tracking-[-0.03em]">Clientes a Consignación</h3>
                        <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                          Fichas de clientes con datos destacados e historial completo.
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="sm:w-72">
                          <Input
                            darkMode={darkMode}
                            placeholder="Buscar cliente, teléfono o DNI..."
                            value={consignmentSearch}
                            onChange={e => setConsignmentSearch(e.target.value)}
                          />
                        </div>
                        <p className={`text-xs font-black uppercase tracking-[0.16em] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>
                          {consignmentClientHistory.length} cliente(s)
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className={`${darkMode ? 'bg-black/[0.045]' : 'bg-white/90'} p-3 space-y-3`}>
                    {consignmentClientHistory.filter(client => `${client.clientName || ''} ${client.clientPhone || ''} ${client.clientDni || ''}`.toLowerCase().includes(consignmentSearch.toLowerCase())).length === 0 && (
                      <div className="p-16 text-center">
                        <UserCircle size={42} className="mx-auto mb-4 opacity-25"/>
                        <p className="text-sm font-bold opacity-50">No hay clientes para mostrar.</p>
                      </div>
                    )}

                    {consignmentClientHistory
                      .filter(client => `${client.clientName || ''} ${client.clientPhone || ''} ${client.clientDni || ''}`.toLowerCase().includes(consignmentSearch.toLowerCase()))
                      .map(client => {
                        const isHistoryOpen = expandedConsignmentHistoryClient === client.clientName;
                        const isInfoOpen = expandedConsignmentInfoClient === client.clientName;
                        const isEditingClient = editingConsignmentClientKey === client.clientName;
                        return (
                          <div
                            key={`history-${client.clientName}`}
                            className={`rounded-[1.7rem] overflow-hidden ring-1 transition-all ${darkMode ? 'bg-white/[0.024] ring-white/[0.055]' : 'bg-white ring-zinc-200 shadow-sm shadow-black/5'}`}
                          >
                            <div className="p-5">
                              {isEditingClient ? (
                                <div className={`rounded-[1.4rem] p-4 ring-1 ${darkMode ? 'bg-white/[0.024] ring-white/[0.055]' : 'bg-zinc-50 ring-zinc-200'}`}>
                                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    <Input
                                      darkMode={darkMode}
                                      label="Nombre"
                                      value={consignmentClientDraft.clientName}
                                      onChange={e => setConsignmentClientDraft({ ...consignmentClientDraft, clientName: e.target.value })}
                                    />
                                    <Input
                                      darkMode={darkMode}
                                      label="Tipo"
                                      value={consignmentClientDraft.clientType}
                                      onChange={e => setConsignmentClientDraft({ ...consignmentClientDraft, clientType: e.target.value })}
                                    />
                                    <Input
                                      darkMode={darkMode}
                                      label="Teléfono"
                                      value={consignmentClientDraft.clientPhone}
                                      onChange={e => setConsignmentClientDraft({ ...consignmentClientDraft, clientPhone: e.target.value })}
                                    />
                                    <Input
                                      darkMode={darkMode}
                                      label="DNI"
                                      value={consignmentClientDraft.clientDni}
                                      onChange={e => setConsignmentClientDraft({ ...consignmentClientDraft, clientDni: e.target.value })}
                                    />
                                  </div>
                                  <div className="flex justify-end gap-2 mt-4">
                                    <button
                                      type="button"
                                      onClick={handleCancelEditConsignmentClient}
                                      className={`h-9 px-4 rounded-full text-xs font-black transition-all ${darkMode ? 'bg-white/5 text-zinc-300 hover:bg-white/[0.08]' : 'bg-white text-zinc-700 hover:bg-zinc-50 ring-1 ring-zinc-200'}`}
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveConsignmentClientData(client)}
                                      className="h-9 px-4 rounded-full text-xs font-black bg-indigo-600 text-white hover:bg-indigo-500 transition-all"
                                    >
                                      Guardar cambios
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                                  <div className="flex items-center gap-4 min-w-0">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${darkMode ? 'bg-white/[0.035] text-zinc-300 ring-1 ring-white/[0.05]' : 'bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200'}`}>
                                      <UserCircle size={22}/>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 min-w-0">
                                        <h3 className="font-black text-xl tracking-[-0.03em] truncate">{client.clientName}</h3>
                                        <p className={`text-xs font-black whitespace-nowrap ${darkMode ? 'text-amber-300/90' : 'text-amber-700'}`}>
                                          {formatMoney(client.valuePending)} por cobrar
                                        </p>
                                      </div>
                                      <p className={`text-xs mt-1 truncate ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                        {(client.clientType || 'Sin tipo')} · {client.clientPhone ? `Tel: ${client.clientPhone}` : 'Sin teléfono'} · {client.clientDni ? `DNI ${client.clientDni}` : 'Sin DNI'}
                                      </p>
                                      <p className={`text-xs mt-1 truncate ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                        {client.pending} productos afuera · {client.delivered} prestados · último {safeDateStr(client.lastMovement, {day:'2-digit', month:'short'})}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap xl:flex-nowrap items-center justify-end gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingConsignmentClientKey(null);
                                        setExpandedConsignmentInfoClient(null);
                                        setExpandedConsignmentHistoryClient(isHistoryOpen ? null : client.clientName);
                                      }}
                                      className={`h-9 px-4 rounded-full text-xs font-black transition-all ${isHistoryOpen ? 'bg-white text-black' : (darkMode ? 'bg-white/5 text-zinc-300 hover:bg-white/[0.08]' : 'bg-white text-zinc-700 hover:bg-zinc-50 ring-1 ring-zinc-200')}`}
                                    >
                                      {isHistoryOpen ? 'Ocultar historial' : 'Ver historial'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingConsignmentClientKey(null);
                                        setExpandedConsignmentHistoryClient(null);
                                        setExpandedConsignmentInfoClient(isInfoOpen ? null : client.clientName);
                                      }}
                                      className={`h-9 px-4 rounded-full text-xs font-black transition-all ${isInfoOpen ? 'bg-white text-black' : (darkMode ? 'bg-white/5 text-zinc-300 hover:bg-white/[0.08]' : 'bg-white text-zinc-700 hover:bg-zinc-50 ring-1 ring-zinc-200')}`}
                                    >
                                      {isInfoOpen ? 'Ocultar info' : 'Ver info'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleEditConsignmentClientData(client)}
                                      className={`h-9 px-4 rounded-full text-xs font-black transition-all ${darkMode ? 'bg-white/5 text-zinc-300 hover:bg-white/[0.08]' : 'bg-white text-zinc-700 hover:bg-zinc-50 ring-1 ring-zinc-200'}`}
                                    >
                                      Editar
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {isInfoOpen && (
                              <div className={`${darkMode ? 'bg-black/[0.16]' : 'bg-zinc-50/80'} border-t ${darkMode ? 'border-white/[0.06]' : 'border-zinc-100'}`}>
                                <div className="p-5 space-y-5">
                                  <div>
                                    <h4 className="text-sm font-black tracking-[-0.02em] mb-3">Datos del cliente</h4>
                                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                                      {[
                                        ['Tipo', client.clientType || 'Sin tipo'],
                                        ['Teléfono', client.clientPhone || 'Sin teléfono'],
                                        ['DNI', client.clientDni || 'Sin DNI'],
                                        ['Último movimiento', safeDateStr(client.lastMovement, {day:'2-digit', month:'short'})]
                                      ].map(([label, value]) => (
                                        <div key={label} className={`rounded-2xl p-3 ${darkMode ? 'bg-white/[0.022]' : 'bg-white/80 shadow-sm shadow-black/5'}`}>
                                          <p className={`text-[9px] font-black uppercase tracking-[0.16em] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>{label}</p>
                                          <p className={`mt-1 text-sm font-black truncate ${value && !String(value).startsWith('Sin') ? (darkMode ? 'text-zinc-200' : 'text-zinc-900') : (darkMode ? 'text-zinc-600' : 'text-zinc-400')}`}>
                                            {value}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div>
                                    <h4 className="text-sm font-black tracking-[-0.02em] mb-3">Resumen financiero</h4>
                                    <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
                                      {[
                                        ['Prestados', client.delivered, ''],
                                        ['Pendientes', client.pending, 'text-amber-400'],
                                        ['Plata afuera', formatMoney(client.valuePending), 'text-amber-300'],
                                        ['Cobrado', formatMoney(client.valuePaid), 'text-emerald-400'],
                                        ['Ganancia real', formatMoney(client.profitPaid), 'text-violet-300']
                                      ].map(([label, value, color]) => (
                                        <div key={label} className={`rounded-2xl p-3 ${darkMode ? 'bg-white/[0.022]' : 'bg-white/80 shadow-sm shadow-black/5'}`}>
                                          <p className={`text-[9px] font-black uppercase tracking-[0.16em] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>{label}</p>
                                          <p className={`mt-1 text-sm font-black truncate ${color}`}>{value}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div className={`rounded-2xl p-4 ring-1 ${darkMode ? 'bg-red-500/[0.035] ring-red-500/10' : 'bg-red-50 ring-red-100'}`}>
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                      <div>
                                        <h4 className={`text-sm font-black ${darkMode ? 'text-red-300' : 'text-red-700'}`}>Zona peligrosa</h4>
                                        <p className={`text-xs mt-1 ${darkMode ? 'text-red-300/60' : 'text-red-700/70'}`}>Borra el cliente completo y devuelve productos pendientes al stock.</p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteConsignmentClient(client)}
                                        className={`h-9 px-4 rounded-full text-xs font-black transition-all ${darkMode ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                                      >
                                        Borrar cliente
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {isHistoryOpen && (
                              <div className={`${darkMode ? 'bg-black/[0.16]' : 'bg-zinc-50/80'} border-t ${darkMode ? 'border-white/[0.06]' : 'border-zinc-100'}`}>
                                <div className="px-5 pt-5">
                                  <h4 className="text-sm font-black tracking-[-0.02em] mb-3">Historial de productos</h4>
                                </div>
                                <div className={`px-5 pb-5 divide-y ${darkMode ? 'divide-white/[0.045]' : 'divide-zinc-100'}`}>
                                  {client.entries.map(entry => {
                                    const pending = Number(entry.quantityPending) || 0;
                                    const paid = Number(entry.quantityPaid) || 0;
                                    const returned = Number(entry.quantityReturned) || 0;
                                    const lost = Number(entry.quantityLost) || 0;
                                    const delivered = Number(entry.quantityDelivered) || 0;
                                    const unitPrice = Number(entry.unitPrice) || 0;
                                    const movementDate = entry.updatedAt || entry.createdAt;

                                    return (
                                      <div key={`history-row-${entry.id}`} className="py-4">
                                        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-center">
                                          <div className="xl:col-span-4 min-w-0">
                                            <p className="font-black text-sm truncate">{entry.productName || 'Sin producto'} / {entry.variant || 'Único'}</p>
                                            <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                              {entry.batchName || 'Sin lote'} · {safeDateStr(movementDate, {day:'2-digit', month:'short', year:'numeric'})}
                                            </p>
                                            <p className={`text-[11px] mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                              Vence: <span className={darkMode ? 'text-zinc-300' : 'text-zinc-700'}>{entry.dueDate ? formatConsignmentDueDateShort(entry.dueDate) : 'Sin límite'}</span>
                                            </p>
                                          </div>

                                          <div className="xl:col-span-5 grid grid-cols-5 gap-2 text-xs">
                                            {[
                                              ['Ent.', delivered, ''],
                                              ['Debe', pending, 'text-amber-400'],
                                              ['Pagó', paid, 'text-emerald-400'],
                                              ['Dev.', returned, 'text-blue-400'],
                                              ['Perd.', lost, 'text-red-400']
                                            ].map(([label, value, color]) => (
                                              <div key={label} className={`rounded-2xl p-2.5 ${darkMode ? 'bg-white/[0.022]' : 'bg-white/80 shadow-sm shadow-black/5'}`}>
                                                <p className={`font-black uppercase text-[9px] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>{label}</p>
                                                <p className={`font-black ${color}`}>{value}</p>
                                              </div>
                                            ))}
                                          </div>

                                          <div className="xl:col-span-3 grid grid-cols-2 gap-3 text-xs">
                                            <div>
                                              <p className={`font-black uppercase text-[9px] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>Precio</p>
                                              <p className="font-black">{formatMoney(unitPrice)}</p>
                                            </div>
                                            <div>
                                              <p className={`font-black uppercase text-[9px] ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`}>Estado</p>
                                              <p className={`font-black ${pending > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{pending > 0 ? 'Abierto' : 'Cerrado'}</p>
                                            </div>
                                          </div>
                                        </div>

                                        {editingConsignmentEntryId === entry.id ? (
                                          <div className={`mt-4 rounded-2xl p-4 ring-1 ${darkMode ? 'bg-white/[0.024] ring-white/[0.055]' : 'bg-white ring-zinc-200'}`}>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                              <Input
                                                darkMode={darkMode}
                                                label="Precio acordado"
                                                type="number"
                                                symbol="$"
                                                value={consignmentEntryDraft.unitPrice}
                                                onChange={e => setConsignmentEntryDraft({ ...consignmentEntryDraft, unitPrice: e.target.value })}
                                              />
                                              <Input
                                                darkMode={darkMode}
                                                label="Fecha límite"
                                                type="date"
                                                value={consignmentEntryDraft.dueDate}
                                                onChange={e => setConsignmentEntryDraft({ ...consignmentEntryDraft, dueDate: e.target.value })}
                                              />
                                              <Input
                                                darkMode={darkMode}
                                                label="Nota"
                                                value={consignmentEntryDraft.note}
                                                onChange={e => setConsignmentEntryDraft({ ...consignmentEntryDraft, note: e.target.value })}
                                              />
                                            </div>
                                            <div className="flex justify-end gap-2 mt-4">
                                              <button
                                                type="button"
                                                onClick={handleCancelEditConsignmentEntry}
                                                className={`h-8 px-3 rounded-full text-xs font-black transition-all ${darkMode ? 'bg-white/5 text-zinc-300 hover:bg-white/[0.08]' : 'bg-white text-zinc-700 hover:bg-zinc-50 ring-1 ring-zinc-200'}`}
                                              >
                                                Cancelar
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleSaveConsignmentEntry(entry)}
                                                className="h-8 px-3 rounded-full text-xs font-black bg-indigo-600 text-white hover:bg-indigo-500 transition-all"
                                              >
                                                Guardar producto
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="mt-3 flex justify-end">
                                            <button
                                              type="button"
                                              onClick={() => handleEditConsignmentEntry(entry)}
                                              className={`h-8 px-3 rounded-full text-xs font-black transition-all ${darkMode ? 'bg-white/5 text-zinc-300 hover:bg-white/[0.08]' : 'bg-white text-zinc-700 hover:bg-zinc-50 ring-1 ring-zinc-200'}`}
                                            >
                                              Editar producto
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>

              </div>
            )}



            {/* --- PESTAÑA STOCK NEUTRO --- */}
            {activeTab === 'neutralStock' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <MetricCard color="indigo" darkMode={darkMode} title="Registros neutros" value={neutralStockStats.count} subtitle="No son ventas" icon={Box} />
                  <MetricCard color="blue" darkMode={darkMode} title="Unidades neutras" value={neutralStockStats.quantity} subtitle="Stock descontado" icon={Package} />
                  <MetricCard color="emerald" darkMode={darkMode} title="Ganancia neutral" value={formatMoney(neutralStockStats.profit)} subtitle="No entra en meses/días" icon={TrendingUp} />
                  <MetricCard color="amber" darkMode={darkMode} title="Ingreso neutral" value={formatMoney(neutralStockStats.revenue)} subtitle="Control interno" icon={DollarSign} />
                </div>

                <Card darkMode={darkMode} className="border-t-4 border-t-indigo-500 p-5 md:p-6">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-5">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight mb-2 flex items-center gap-2">
                        <Box size={20} className="text-indigo-500"/> Stock Neutro
                      </h2>
                      <p className={`text-sm max-w-3xl ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                        Para stock perdido, ventas viejas no registradas o ajustes que querés contar con ganancia, pero sin adjudicarlo a ningún día ni mes de ventas. Se descuenta del lote, se guarda aparte y no entra en gráficos ni promedio diario.
                      </p>
                    </div>
                    <div className={`rounded-xl border px-4 py-3 text-xs font-semibold ${darkMode ? 'bg-[#0D0D0D] border-[#1F1F1F] text-zinc-400' : 'bg-indigo-50 border-indigo-100 text-indigo-700'}`}>
                      No crea ventas. No toca historial. No aparece en análisis mensual.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                    <div className="lg:col-span-3">
                      <Select
                        darkMode={darkMode}
                        label="Lote de origen"
                        value={newNeutralStock.batchId}
                        onChange={e => setNewNeutralStock({ ...newNeutralStock, batchId: e.target.value, itemId: '' })}
                        options={[
                          { value: '', label: '-- Elegir lote activo --' },
                          ...batches.filter(b => !b.finalizedAt).map(b => ({ value: b.id, label: b.name || 'Sin nombre' }))
                        ]}
                      />
                    </div>

                    <div className="lg:col-span-4">
                      <Select
                        darkMode={darkMode}
                        label="Producto"
                        value={newNeutralStock.itemId}
                        onChange={e => setNewNeutralStock({ ...newNeutralStock, itemId: e.target.value })}
                        options={[
                          { value: '', label: neutralSelectedBatch ? '-- Elegir producto --' : 'Primero elegí un lote' },
                          ...neutralAvailableItems.map(item => ({
                            value: item.id,
                            label: `${item.product || 'Sin producto'} / ${item.variant || 'Único'} · stock ${item.currentStock || 0}`
                          }))
                        ]}
                      />
                    </div>

                    <div className="lg:col-span-1">
                      <Input
                        darkMode={darkMode}
                        label="Cant."
                        type="number"
                        min="1"
                        value={newNeutralStock.quantity}
                        onChange={e => setNewNeutralStock({ ...newNeutralStock, quantity: e.target.value })}
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <Input
                        darkMode={darkMode}
                        label="Precio vendido / estimado"
                        type="number"
                        symbol="$"
                        value={newNeutralStock.unitPrice}
                        onChange={e => setNewNeutralStock({ ...newNeutralStock, unitPrice: e.target.value })}
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <Select
                        darkMode={darkMode}
                        label="Motivo"
                        value={newNeutralStock.reason}
                        onChange={e => setNewNeutralStock({ ...newNeutralStock, reason: e.target.value })}
                        options={[
                          { value: 'Stock perdido', label: 'Stock perdido' },
                          { value: 'Venta no registrada', label: 'Venta no registrada' },
                          { value: 'Ajuste neutral', label: 'Ajuste neutral' },
                          { value: 'Reposición / cambio', label: 'Reposición / cambio' },
                          { value: 'Otro', label: 'Otro' }
                        ]}
                      />
                    </div>

                    <div className="lg:col-span-10">
                      <Input
                        darkMode={darkMode}
                        label="Nota opcional"
                        placeholder="Ej: diferencia de conteo, venta vieja recuperada, producto perdido, etc."
                        value={newNeutralStock.note}
                        onChange={e => setNewNeutralStock({ ...newNeutralStock, note: e.target.value })}
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <Button darkMode={darkMode} onClick={handleAddNeutralStock} className="w-full h-10">
                        <Save size={16}/> Registrar
                      </Button>
                    </div>
                  </div>

                  {neutralSelectedItem && (
                    <div className={`mt-5 grid grid-cols-1 md:grid-cols-4 gap-3 rounded-xl border p-4 ${darkMode ? 'bg-[#0D0D0D] border-[#1F1F1F]' : 'bg-zinc-50 border-zinc-200'}`}>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider opacity-50">Producto elegido</p>
                        <p className="font-bold text-sm mt-1">{neutralSelectedItem.product} / {neutralSelectedItem.variant || 'Único'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider opacity-50">Stock disponible</p>
                        <p className="font-bold text-sm mt-1">{neutralSelectedItem.currentStock || 0} unidades</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider opacity-50">Costo unitario</p>
                        <p className="font-bold text-sm mt-1">{formatMoney(neutralSelectedItem.costArs || 0)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider opacity-50">Ganancia estimada</p>
                        <p className="font-black text-sm mt-1 text-emerald-500">
                          {formatMoney(((parseFloat(newNeutralStock.unitPrice || 0) - (Number(neutralSelectedItem.costArs) || 0)) * (parseInt(newNeutralStock.quantity) || 0)))}
                        </p>
                      </div>
                    </div>
                  )}
                </Card>

                <Card darkMode={darkMode} className="p-0 overflow-hidden">
                  <div className={`p-4 md:p-5 border-b flex flex-col md:flex-row justify-between md:items-center gap-3 ${darkMode ? 'bg-[#181818] border-[#1F1F1F]' : 'bg-white border-zinc-200'}`}>
                    <div>
                      <h3 className="font-bold text-base tracking-tight">Registro de Stock Neutro</h3>
                      <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>Estos movimientos se guardan aparte. La fecha es solo auditoría, no contabilidad mensual.</p>
                    </div>
                  </div>

                  <div className={`divide-y ${darkMode ? 'divide-zinc-800' : 'divide-zinc-100'}`}>
                    {neutralStockEntries.length === 0 && (
                      <div className="p-12 text-center text-sm font-medium opacity-50">Todavía no hay registros neutros.</div>
                    )}

                    {neutralStockEntries.map(entry => (
                      <div key={entry.id} className={`p-4 md:p-5 transition-colors group ${darkMode ? 'hover:bg-zinc-900/50 bg-[#101010]' : 'hover:bg-zinc-50 bg-white'}`}>
                        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'}`}>{entry.reason || 'Stock neutro'}</span>
                              <span className={`text-[11px] font-medium ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{safeDateStr(entry.createdAt, {month:'long', day:'numeric', hour:'2-digit', minute:'2-digit'})}</span>
                            </div>
                            <div className="font-bold text-sm mt-2">{entry.productName || 'Sin producto'}</div>
                            <div className={`text-xs mt-0.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                              {entry.variant || 'Único'} · {entry.batchName || 'Sin lote'} · {entry.quantity || 0} unidad(es)
                            </div>
                            {entry.note && <div className={`text-xs mt-2 italic ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>“{entry.note}”</div>}
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <div className="text-right">
                              <p className="text-[10px] font-bold uppercase tracking-wider opacity-50">Ingreso neutral</p>
                              <p className="font-bold">{formatMoney(entry.totalSaleRaw || 0)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-bold uppercase tracking-wider opacity-50">Ganancia</p>
                              <p className={`font-black ${(entry.grossProfitRaw || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatMoney(entry.grossProfitRaw || 0)}</p>
                            </div>
                            <button
                              onClick={() => handleDeleteNeutralStock(entry)}
                              className={`p-2.5 rounded-lg opacity-100 md:opacity-0 group-hover:opacity-100 transition-all ${darkMode ? 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10' : 'text-zinc-400 hover:text-red-600 hover:bg-red-50'}`}
                              title="Eliminar y devolver stock"
                            >
                              <Trash2 size={18}/>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
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

                <Card darkMode={darkMode} className="p-0 overflow-hidden border-zinc-200 dark:border-[#1F1F1F]">
                    <div className={`p-4 md:p-5 border-b ${darkMode ? 'bg-[#181818] border-[#1F1F1F]' : 'bg-white border-zinc-200'}`}>
                        <h3 className="font-bold text-base tracking-tight">Registro de Egresos</h3>
                    </div>
                    <div className={`divide-y ${darkMode ? 'divide-zinc-800' : 'divide-zinc-100'}`}>
                        {expenses.length === 0 && <div className="p-12 text-center text-sm font-medium opacity-50">No hay movimientos de salida registrados.</div>}
                        {expenses.map(e => (
                        <div key={e.id} className={`flex justify-between items-center p-4 md:p-5 transition-colors group ${darkMode ? 'hover:bg-zinc-900/50 bg-[#101010]' : 'hover:bg-zinc-50 bg-white'}`}>
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

            {/* --- PESTAÑA META ADS --- */}
            {activeTab === 'metaads' && (
              <div className="space-y-5 animate-in fade-in duration-300">

                {/* Header / Period selector */}
                <div className={`p-4 rounded-2xl border flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 ${darkMode ? 'border-white/[0.06]' : 'bg-white border-zinc-200'}`}
                  style={darkMode ? {background:'linear-gradient(145deg,#101010,#181818)', boxShadow:'0 4px 20px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)'} : {}}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{background:'rgba(99,102,241,0.14)'}}>
                      <Target size={15} style={{color:'#6366f1'}}/>
                    </div>
                    <div>
                      <h3 className={`font-bold text-sm ${darkMode ? 'text-zinc-100' : 'text-zinc-900'}`}>Meta Ads</h3>
                      <p className="text-[11px] text-zinc-500">Performance publicitario cruzado con Firebase</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 w-full lg:w-auto">
                    <div className="flex-1 lg:w-52">
                      <Select darkMode={darkMode} value={metaPeriod} onChange={e => setMetaPeriod(e.target.value)}
                        options={[
                          {value:'today',      label:'Hoy'},
                          {value:'yesterday',  label:'Ayer'},
                          {value:'last_7d',    label:'Últimos 7 días'},
                          {value:'last_14d',   label:'Últimos 14 días'},
                          {value:'last_30d',   label:'Últimos 30 días'},
                          {value:'this_month', label:'Este mes'},
                          {value:'last_month', label:'Mes anterior'},
                          {value:'last_90d',   label:'Últimos 90 días'},
                          {value:'historico',  label:'📊 Histórico completo'},
                          {value:'custom',     label:'📅 Rango personalizado'},
                        ]}
                      />
                    </div>
                    {metaPeriod === 'custom' && (
                      <div className="flex items-center gap-2 animate-in slide-in-from-right-2">
                        <Input darkMode={darkMode} type="date" value={metaCustomRange.start}
                          onChange={e => setMetaCustomRange(r => ({...r, start: e.target.value}))} />
                        <span className="text-zinc-500 font-bold flex-shrink-0">—</span>
                        <Input darkMode={darkMode} type="date" value={metaCustomRange.end}
                          onChange={e => setMetaCustomRange(r => ({...r, end: e.target.value}))} />
                      </div>
                    )}
                    <Button darkMode={darkMode} onClick={fetchMetaInsights} disabled={metaLoading}
                      className="flex-shrink-0">
                      <RefreshCw size={14} className={metaLoading ? 'animate-spin' : ''}/>
                      {metaLoading ? 'Cargando...' : 'Actualizar'}
                    </Button>
                  </div>
                </div>

                {/* Error */}
                {metaError && (
                  <div className="p-4 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-400 text-sm flex items-center gap-3">
                    <XCircle size={16} className="flex-shrink-0"/>
                    <span>{metaError}</span>
                  </div>
                )}

                {/* Skeleton loading */}
                {metaLoading && !metaData && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {Array.from({length:8}).map((_,i) => (
                      <div key={i} className={`rounded-2xl border p-5 h-36 animate-pulse ${darkMode ? 'border-white/[0.06]' : 'bg-zinc-100 border-zinc-200'}`}
                        style={darkMode ? {background:'linear-gradient(145deg,#101010,#181818)'} : {}}/>
                    ))}
                  </div>
                )}

                {/* Estado vacío */}
                {!metaData && !metaLoading && !metaError && (
                  <div className={`rounded-2xl border p-16 text-center ${darkMode ? 'border-white/[0.06]' : 'bg-white border-zinc-200'}`}
                    style={darkMode ? {background:'linear-gradient(145deg,#101010,#181818)'} : {}}>
                    <Target size={36} className="mx-auto mb-4 text-zinc-600"/>
                    <p className="text-sm font-semibold text-zinc-500 mb-1">Sin datos cargados</p>
                    <p className="text-xs text-zinc-600 mb-5">Seleccioná un período y hacé clic en Actualizar</p>
                    <Button darkMode={darkMode} onClick={fetchMetaInsights}>Cargar datos de Meta</Button>
                  </div>
                )}

                {/* Datos */}
                {metaData && (() => {
                  const adSpend    = parseFloat(metaData.spend || 0);
                  const reach      = parseInt(metaData.reach || 0);
                  const frequency  = parseFloat(metaData.frequency || 0);
                  const ctr        = parseFloat(metaData.ctr || 0);
                  const cpm        = parseFloat(metaData.cpm || 0);
                  const impressions= parseInt(metaData.impressions || 0);
                  const clicks     = parseInt(metaData.clicks || 0);
                  const purchases  = parseInt(
                    metaData.actions?.find(a => ['purchase','offsite_conversion.fb_pixel_purchase','omni_purchase'].includes(a.action_type))?.value || 0
                  );
                  const { revenue, netProfit, grossProfit, totalAllRevenue, adsByDate, allByDate } = metaFirebaseStats;
                  const roas = adSpend > 0 ? revenue / adSpend : 0;
                  const roasProfit = adSpend > 0 ? grossProfit / adSpend : 0;
                  const mer  = adSpend > 0 ? totalAllRevenue / adSpend : 0;
                  const cpa  = purchases > 0 ? adSpend / purchases : 0;
                  const rentabilidad = netProfit - adSpend;

                  const dailySpend       = metaDailyData.map(d => parseFloat(d.spend||0));
                  const dailyCtr         = metaDailyData.map(d => parseFloat(d.ctr||0));
                  const dailyClicks      = metaDailyData.map(d => parseInt(d.clicks||0));
                  const dailyImpressions = metaDailyData.map(d => parseInt(d.impressions||0));
                  const dailyReach       = metaDailyData.map(d => parseInt(d.reach||0));
                  const dailyFrequency   = metaDailyData.map(d => parseFloat(d.frequency||0));
                  const dailyCpm         = metaDailyData.map(d => parseFloat(d.cpm||0));
                  const dailyPurchases   = metaDailyData.map(d => parseInt(d.actions?.find(a => ['purchase','offsite_conversion.fb_pixel_purchase','omni_purchase'].includes(a.action_type))?.value||0));
                  const dailyLabels      = metaDailyData.map(d => d.date_start ? d.date_start.slice(5).replace('-','/') : '');

                  const dailyRoas     = metaDailyData.map((d, i) => { const sp = dailySpend[i]; const r = adsByDate[d.date_start]?.revenue || 0; return sp > 0 ? r / sp : 0; });
                  const dailyRoasP    = metaDailyData.map((d, i) => { const sp = dailySpend[i]; const e = adsByDate[d.date_start]; const gp = e ? e.revenue - e.cost : 0; return sp > 0 ? gp / sp : 0; });
                  const dailyMer      = metaDailyData.map((d, i) => { const sp = dailySpend[i]; const r = allByDate[d.date_start] || 0; return sp > 0 ? r / sp : 0; });
                  const dailyCpa      = metaDailyData.map((d, i) => { const p = dailyPurchases[i]; return p > 0 ? dailySpend[i] / p : 0; });

                  const fARS = v => formatMoney(v);

                  return (
                    <>
                      {/* Métricas principales */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <PremiumMetricCard darkMode={darkMode} title="Gasto en Ads" value={fARS(adSpend)} subtitle={null} sparkline={null} lineSparkline={dailySpend.length >= 2 ? dailySpend : null} lineSparklineLabels={dailyLabels} lineSparklineFormatter={fARS} tooltip="Plata total que gastaste en publicidad en Meta durante el período" />
                        <PremiumMetricCard darkMode={darkMode} title="ROAS" value={`${roas.toFixed(2)}×`} subtitle={null} sparkline={null} lineSparkline={dailyRoas.length >= 2 ? dailyRoas : null} lineSparklineLabels={dailyLabels} lineSparklineFormatter={v => `${v.toFixed(2)}×`} tooltip="Por cada peso que invertís en ads, cuántos pesos en ventas generás. Arriba de 3x es bueno, arriba de 5x es excelente" />
                        <PremiumMetricCard darkMode={darkMode} title="ROAS (Ganancia)" value={`${roasProfit.toFixed(2)}×`} subtitle={null} sparkline={null} lineSparkline={dailyRoasP.length >= 2 ? dailyRoasP : null} lineSparklineLabels={dailyLabels} lineSparklineFormatter={v => `${v.toFixed(2)}×`} tooltip="Por cada peso invertido en ads, cuánto ganás neto descontando el costo del producto. Arriba de 1x significa que los ads son rentables" />
                        <PremiumMetricCard darkMode={darkMode} title="MER" value={`${mer.toFixed(2)}×`} subtitle={null} sparkline={null} lineSparkline={dailyMer.length >= 2 ? dailyMer : null} lineSparklineLabels={dailyLabels} lineSparklineFormatter={v => `${v.toFixed(2)}×`} tooltip="Cuánto factura el negocio en total por cada peso que gastás en publicidad. Mide el impacto general de los ads" />
                        <PremiumMetricCard darkMode={darkMode} title="CPA" value={cpa > 0 ? fARS(cpa) : '—'} subtitle={`${purchases} conversión${purchases !== 1 ? 'es' : ''}`} sparkline={null} lineSparkline={dailyCpa.length >= 2 ? dailyCpa : null} lineSparklineLabels={dailyLabels} lineSparklineFormatter={fARS} tooltip="Cuánto te cuesta conseguir un cliente. Mientras más bajo mejor, ideal que sea menor al margen de ganancia del producto" />
                        <PremiumMetricCard darkMode={darkMode} title="CTR" value={`${ctr.toFixed(2)}%`} subtitle={`${clicks.toLocaleString('es-AR')} clics · ${impressions.toLocaleString('es-AR')} impr.`} sparkline={null} lineSparkline={dailyCtr.length >= 2 ? dailyCtr : null} lineSparklineLabels={dailyLabels} lineSparklineFormatter={v => `${v.toFixed(2)}%`} tooltip="De cada 100 personas que vieron tu anuncio, cuántas hicieron click. Arriba de 1% es aceptable, arriba de 2% es bueno" />
                        <PremiumMetricCard darkMode={darkMode} title="CPM" value={fARS(cpm)} subtitle={null} sparkline={null} lineSparkline={dailyCpm.length >= 2 ? dailyCpm : null} lineSparklineLabels={dailyLabels} lineSparklineFormatter={fARS} tooltip="Cuánto pagás para que 1000 personas vean tu anuncio. Mientras más bajo, más barato es llegar a la gente" />
                        <PremiumMetricCard darkMode={darkMode} title="Alcance" value={reach.toLocaleString('es-AR')} subtitle={`${impressions.toLocaleString('es-AR')} impr.`} sparkline={null} lineSparkline={dailyReach.length >= 2 ? dailyReach : null} lineSparklineLabels={dailyLabels} lineSparklineFormatter={v => v.toLocaleString('es-AR')} tooltip="Cantidad de personas distintas que vieron tu anuncio al menos una vez" />
                        <PremiumMetricCard darkMode={darkMode} title="Frecuencia" value={frequency.toFixed(2)} subtitle={`${reach.toLocaleString('es-AR')} personas`} sparkline={null} lineSparkline={dailyFrequency.length >= 2 ? dailyFrequency : null} lineSparklineLabels={dailyLabels} lineSparklineFormatter={v => v.toFixed(2)} tooltip="Cuántas veces en promedio vio tu anuncio cada persona. Entre 1.5 y 3 es ideal, más de 3 puede cansar a la audiencia" />
                      </div>

                      {/* Rentabilidad real */}
                      <div className={`rounded-2xl border p-5 ${darkMode ? 'border-white/[0.07]' : 'bg-white border-zinc-200'}`}
                        style={darkMode ? {background:'linear-gradient(145deg,#101010,#181818)', boxShadow:'0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)'} : {}}>
                        <h3 className="text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-500 mb-5">Rentabilidad Real del Período</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className={`rounded-xl p-4 border ${darkMode ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-zinc-50 border-zinc-200'}`}>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Ganancia Neta (solo Ads)</div>
                            <div className={`font-black leading-none tracking-tight ${darkMode ? 'text-zinc-50' : 'text-zinc-900'}`} style={{fontSize:'clamp(1.4rem,2vw,1.9rem)',letterSpacing:'-0.03em'}}>{fARS(netProfit)}</div>
                            <div className="text-[11px] text-zinc-500 mt-1.5">Ventas marcadas como publicidad</div>
                          </div>
                          <div className={`rounded-xl p-4 border ${darkMode ? 'bg-red-500/5 border-red-500/15' : 'bg-red-50 border-red-200'}`}>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Gasto Meta Ads</div>
                            <div className="font-black leading-none tracking-tight text-red-400" style={{fontSize:'clamp(1.4rem,2vw,1.9rem)',letterSpacing:'-0.03em'}}>− {fARS(adSpend)}</div>
                            <div className="text-[11px] text-zinc-500 mt-1.5">Inversión publicitaria</div>
                          </div>
                          <div className={`rounded-xl p-4 border ${rentabilidad >= 0 ? (darkMode ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200') : (darkMode ? 'bg-red-500/5 border-red-500/20' : 'bg-red-50 border-red-200')}`}>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Rentabilidad Neta</div>
                            <div className={`font-black leading-none tracking-tight ${rentabilidad >= 0 ? 'text-emerald-400' : 'text-red-400'}`} style={{fontSize:'clamp(1.4rem,2vw,1.9rem)',letterSpacing:'-0.03em'}}>{fARS(rentabilidad)}</div>
                            <div className="text-[11px] text-zinc-500 mt-1.5">Ganancia Firebase − Ads</div>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}

              </div>
            )}

        </div>
      </main>
      <AIChat darkMode={darkMode} db={db} />
    </div>
  );
} 