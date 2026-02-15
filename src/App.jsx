import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Trash2, Save, TrendingUp, DollarSign, Package,
  ShoppingCart, Wallet, Activity, LogOut, Moon, Sun, AlertTriangle, Calendar, Award, FolderOpen, ChevronRight, ChevronDown, Box, Users, BarChart3, CheckCircle, Clock, Settings, Truck, Home, Percent
} from 'lucide-react';

// --- 1. IMPORTACIONES DE FIREBASE ---
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, updateDoc,
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

// Inicialización segura
let db;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (error) {
  console.error("Error inicializando Firebase:", error);
}

// --- 3. COMPONENTES UI (COMPACTOS) ---

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

const Input = ({ label, symbol, darkMode, ...props }) => (
  <div className="flex flex-col gap-1 w-full">
    {label && <label className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</label>}
    <div className="relative">
      {symbol && <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none"><span className={`text-xs font-bold ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{symbol}</span></div>}
      <input className={`border rounded-md p-2 w-full text-sm outline-none transition-all ${darkMode ? 'bg-slate-700 border-slate-600 text-white focus:ring-2 focus:ring-blue-500' : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-2 focus:ring-slate-800'} ${symbol ? 'pl-7' : ''}`} {...props} />
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

const getTodayDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// --- 4. APP PRINCIPAL ---
export default function App() {
  const [user, setUser] = useState(() => localStorage.getItem('028_user') || null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('028_dark_mode') === 'true');

  useEffect(() => {
    localStorage.setItem('028_dark_mode', darkMode);
    if (darkMode) document.body.classList.add('dark'); else document.body.classList.remove('dark');
  }, [darkMode]);

  const [activeTab, setActiveTab] = useState('home'); // INICIO POR DEFECTO
  const [batches, setBatches] = useState([]);
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState(false);
  const [expandedBatchId, setExpandedBatchId] = useState(null);

  // Estado para la fecha manual de finalización en Análisis
  const [manualFinalizeDate, setManualFinalizeDate] = useState(getTodayDate());

  // Sincronización con Firebase REAL
  useEffect(() => {
    if (!user) return;
    if (firebaseConfig.apiKey === "TU_API_KEY_AQUI") { setConfigError(true); setLoading(false); return; }
    
    setLoading(true);

    try {
        const unsubBatches = onSnapshot(query(collection(db, 'batches'), orderBy('createdAt', 'desc')), (snap) => {
        setBatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (error) => {
            console.error("Error fetching batches:", error);
            setLoading(false); 
        });
        const unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('date', 'desc')), (snap) => setSales(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (error) => console.error(error));
        const unsubExp = onSnapshot(query(collection(db, 'expenses'), orderBy('date', 'desc')), (snap) => setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() }))), (error) => console.error(error));
        
        setLoading(false);
        return () => { unsubBatches(); unsubSales(); unsubExp(); };
    } catch (e) {
        console.error("Error general de conexión", e);
        setLoading(false);
    }
  }, [user]);

  const formatMoney = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
  const formatPercent = (val) => new Intl.NumberFormat('es-AR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val / 100);

  // --- ANALISIS GLOBAL (INICIO) ---
  const globalAnalysis = useMemo(() => {
      let totalRevenue = 0, itemsSold = 0, totalShippingProfit = 0;
      const sourceCounts = {};
      const typeCounts = { Revendedor: 0, Final: 0 };

      // 1. Analizar todas las ventas
      sales.forEach(s => {
          totalRevenue += s.totalSaleRaw;
          itemsSold += s.quantity;
          
          const saleShippingProfit = s.totalSaleRaw - (s.unitPrice * s.quantity);
          totalShippingProfit += saleShippingProfit;

          const src = s.source || 'Otro';
          sourceCounts[src] = (sourceCounts[src] || 0) + 1;
          if (s.isReseller) typeCounts.Revendedor++; else typeCounts.Final++;
      });

      // 2. Inversión Total Histórica (Todos los items de todos los lotes)
      const totalInvestment = batches.reduce((accBatch, batch) => {
          return accBatch + (batch.items || []).reduce((accItem, item) => {
              return accItem + (item.costArs * item.initialStock);
          }, 0);
      }, 0);

      // 3. Gastos Totales Históricos
      const totalGlobalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);

      // 4. Margen Bruto Global y Ganancia Real
      const costOfSoldGlobal = sales.reduce((acc, s) => acc + (s.costArsAtSale * s.quantity), 0);
      const grossProfit = totalRevenue - costOfSoldGlobal;
      
      // NUEVA FÓRMULA 1: Ganancia Histórica Neta (Rentabilidad Operativa) - No resta stock
      const netProfit = grossProfit - totalGlobalExpenses;
      
      // NUEVA FÓRMULA 2: Flujo de Caja (Bolsillo) - SÍ resta toda la inversión (stock parado)
      const cashBalance = totalRevenue - totalInvestment - totalGlobalExpenses;
      
      // Calculamos valor del stock actual (Activo)
      const currentStockValue = totalInvestment - costOfSoldGlobal;

      // CÁLCULO DE MÁRGENES (NUEVO)
      const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
      const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      // 6. Días Activos Totales
      let daysActive = 0;
      if (batches.length > 0) {
          const sortedBatches = [...batches].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          const firstDate = new Date(sortedBatches[0].createdAt);
          const now = new Date();
          const diffTime = Math.abs(now - firstDate);
          daysActive = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
      }
      const dailyAvgItems = daysActive > 0 ? itemsSold / daysActive : 0;

      return {
          totalRevenue,
          totalInvestment,
          totalGlobalExpenses,
          grossProfit,
          grossMargin, // % Bruto
          totalShippingProfit,
          netProfit,
          netMargin, // % Neto
          cashBalance,
          currentStockValue, 
          itemsSold,
          salesCount: sales.length,
          sourceCounts,
          typeCounts,
          dailyAvgItems,
          daysActive
      };
  }, [sales, batches, expenses]);


  // --- ACCIONES DE LOTES Y ITEMS ---
  
  // 1. Crear Carpeta
  const [newBatchName, setNewBatchName] = useState('');
  const handleCreateBatch = async () => {
    if (!newBatchName) return alert("Ponle un nombre a la carpeta");
    try { await addDoc(collection(db, 'batches'), { name: newBatchName, createdAt: new Date().toISOString(), items: [] }); setNewBatchName(''); alert("✅ Carpeta creada"); } catch (e) { alert("Error: " + e.message); }
  };
  const handleDeleteBatch = async (id) => { if (window.confirm('¿Borrar carpeta completa? Se perderá el historial interno.')) await deleteDoc(doc(db, 'batches', id)); };

  // Funcionalidad para actualizar estado del lote desde Análisis
  const handleUpdateBatchStatus = async (batchId, isFinalizing) => {
    if (isFinalizing) {
        if (!manualFinalizeDate) return alert("Selecciona una fecha");
        if (!window.confirm(`¿Confirmar que el stock se terminó el día ${manualFinalizeDate}? Esto detendrá el contador de días.`)) return;
        
        const [year, month, day] = manualFinalizeDate.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day, 12, 0, 0);

        try {
            await updateDoc(doc(db, 'batches', batchId), {
                finalizedAt: dateObj.toISOString()
            });
            alert("🏁 Lote Finalizado Correctamente");
        } catch (e) { alert("Error: " + e.message); }
    } else {
        if (!window.confirm("¿Reactivar este lote? Volverá a contar los días para el promedio diario.")) return;
        try {
            await updateDoc(doc(db, 'batches', batchId), {
                finalizedAt: null
            });
            alert("🔄 Lote Reactivado");
        } catch (e) { alert("Error: " + e.message); }
    }
  };

  // 2. Items dentro de Carpeta
  const [newItem, setNewItem] = useState({ product: '', variant: '', costArs: '', initialStock: '' });
  
  const handleAddItemToBatch = async (batchId) => {
    if (!newItem.product || !newItem.costArs || !newItem.initialStock) return alert("Faltan datos");
    
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;

    const newItemData = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      product: newItem.product,
      variant: newItem.variant || 'Único',
      costArs: parseFloat(newItem.costArs) || 0,
      initialStock: parseInt(newItem.initialStock) || 0,
      currentStock: parseInt(newItem.initialStock) || 0,
    };

    try {
      await updateDoc(doc(db, 'batches', batchId), { items: [...(batch.items || []), newItemData] });
      setNewItem({ product: '', variant: '', costArs: '', initialStock: '' });
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleDeleteItemFromBatch = async (batchId, itemId) => {
    if (!window.confirm('¿Borrar este producto del lote?')) return;
    
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    
    const updatedItems = batch.items.filter(i => i.id !== itemId);
    
    try {
      await updateDoc(doc(db, 'batches', batchId), { items: updatedItems });
    } catch (e) {
      alert("Error al borrar item: " + e.message);
    }
  };

  // 3. Ventas (CON VALIDACIONES MEJORADAS)
  const [newSale, setNewSale] = useState({ batchId: '', itemId: '', quantity: 1, unitPrice: '', shippingCost: 0, shippingPrice: 0, source: 'Instagram', isReseller: 'No', saleDate: getTodayDate() });
  
  const handleAddSale = async () => {
    // --- VALIDACIONES ---
    if (!newSale.batchId) return alert("⚠️ Error: Debes seleccionar una Carpeta primero.");
    if (!newSale.itemId) return alert("⚠️ Error: Debes seleccionar un Producto.");
    if (!newSale.unitPrice) return alert("⚠️ Error: Debes ingresar el Precio de Venta.");
    
    const batch = batches.find(b => b.id === newSale.batchId);
    if (!batch) return alert("Carpeta no encontrada");
    const itemIndex = batch.items.findIndex(i => i.id === newSale.itemId);
    if (itemIndex === -1) return alert("Producto no encontrado");
    const item = batch.items[itemIndex];

    if (item.currentStock <= 0) return alert(`⛔ SIN STOCK: ${item.product} agotado.`);
    
    const qty = parseInt(newSale.quantity) || 1;
    if (qty < 1) return alert("⚠️ La cantidad debe ser al menos 1.");
    if (item.currentStock < qty) return alert(`⚠️ Stock insuficiente. Quedan ${item.currentStock} u.`);

    const enteredPrice = parseFloat(newSale.unitPrice) || 0;
    const shippingProfit = parseFloat(newSale.shippingPrice || 0) - parseFloat(newSale.shippingCost || 0);
    const totalCashIn = (enteredPrice * qty) + shippingProfit;

    const [year, month, day] = newSale.saleDate.split('-').map(Number);
    const saleDateObj = new Date(year, month - 1, day, new Date().getHours(), new Date().getMinutes());

    const saleData = {
      date: saleDateObj.toISOString(),
      batchId: batch.id, batchName: batch.name, itemId: item.id,
      productName: item.product, variant: item.variant,
      quantity: qty, unitPrice: enteredPrice, totalSaleRaw: totalCashIn,
      costArsAtSale: item.costArs, shippingCostArs: parseFloat(newSale.shippingCost || 0),
      source: newSale.source, isReseller: newSale.isReseller === 'Si'
    };

    try {
      await addDoc(collection(db, 'sales'), saleData);
      
      // Actualizar Stock en la carpeta (Array)
      const newItems = [...batch.items];
      newItems[itemIndex] = { ...item, currentStock: item.currentStock - qty };
      
      // Chequear si se finaliza automaticamente (todo el stock a 0)
      const updates = { items: newItems };
      const allZero = newItems.every(i => i.currentStock === 0);
      if (allZero && !batch.finalizedAt) {
          updates.finalizedAt = new Date().toISOString();
      }

      await updateDoc(doc(db, 'batches', batch.id), updates);
      
      if (allZero && !batch.finalizedAt) {
          alert("🎉 ¡Stock a 0! Lote finalizado automáticamente. El análisis se ha detenido.");
      } else {
          alert(`✅ Venta OK. Caja: ${formatMoney(totalCashIn)}`);
      }

      setNewSale({ ...newSale, quantity: 1, unitPrice: '', shippingCost: 0, shippingPrice: 0 });
      
    } catch (e) { alert('Error: ' + e.message); }
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
    } catch (e) { alert('Error: ' + e.message); }
  };

  // 4. Gastos
  const [newExpense, setNewExpense] = useState({ description: '', amount: '', batchId: '' }); // Added batchId to state
  const handleAddExpense = async () => {
    if (!newExpense.description || !newExpense.amount) return;
    
    // Buscar nombre del lote si existe
    let batchName = 'General';
    if (newExpense.batchId) {
        const foundBatch = batches.find(b => b.id === newExpense.batchId);
        if (foundBatch) batchName = foundBatch.name;
    }

    await addDoc(collection(db, 'expenses'), { 
        date: new Date().toISOString(), 
        description: newExpense.description, 
        amount: parseFloat(newExpense.amount),
        batchId: newExpense.batchId || null, // Guardar ID del lote
        batchName: batchName
    });
    setNewExpense({ description: '', amount: '', batchId: '' });
  };
  const handleDeleteExpense = async (id) => await deleteDoc(doc(db, 'expenses', id));

  // --- ANALISIS POR LOTE ---
  const [selectedBatchStats, setSelectedBatchStats] = useState(null);
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
      if (s.isReseller) typeCounts.Revendedor++; else typeCounts.Final++;
    });

    const totalInvestment = (batch.items || []).reduce((acc, i) => acc + (i.costArs * i.initialStock), 0);
    const costOfSold = batchSales.reduce((acc, s) => acc + (s.costArsAtSale * s.quantity), 0);
    const grossProfit = totalRevenue - costOfSold; 
    const totalBatchExpenses = batchExpenses.reduce((acc, e) => acc + e.amount, 0);
    
    // Contable
    const netProfit = grossProfit - totalBatchExpenses;
    
    // Bolsillo
    const cashBalance = totalRevenue - totalInvestment - totalBatchExpenses;
    
    const currentStockValue = totalInvestment - costOfSold;

    // CÁLCULO DE MÁRGENES (NUEVO)
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    const createdDate = new Date(batch.createdAt);
    const endDate = batch.finalizedAt ? new Date(batch.finalizedAt) : new Date(); 
    const diffTime = Math.max(0, endDate - createdDate);
    const daysActive = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const dailyAvgItems = itemsSold / daysActive;
    const totalInitStock = (batch.items || []).reduce((acc, i) => acc + i.initialStock, 0);
    const progress = totalInitStock > 0 ? (itemsSold / totalInitStock) * 100 : 0;

    return { 
        batch, salesCount: batchSales.length, itemsSold, totalRevenue, totalInvestment, 
        grossProfit, grossMargin, totalShippingProfit, totalBatchExpenses, netProfit, netMargin, cashBalance, 
        progress, currentStockValue, sourceCounts, typeCounts, daysActive, dailyAvgItems 
    };
  }, [selectedBatchStats, sales, batches, expenses]);

  // --- RENDER ---
  const handleLogin = (e) => { 
    e.preventDefault(); 
    const val = e.target.password.value; 
    if(val === '1717') { 
      localStorage.setItem('028_user', 'Admin'); 
      setUser('Admin'); 
    } else {
      alert('Contraseña incorrecta');
    }
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
    <div className={`min-h-screen p-2 md:p-4 font-sans transition-colors duration-300 text-sm ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-100 text-slate-800'}`}>
      <div className="max-w-6xl mx-auto space-y-4">
        {/* HEADER COMPACTO */}
        <header className={`p-4 rounded-xl shadow-sm flex justify-between items-center gap-4 transition-colors duration-300 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-slate-900 text-white'}`}>
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white"><FolderOpen size={20} strokeWidth={2.5} /></div>
            <div><h1 className="text-xl font-black tracking-tight leading-none">028 IMPORT</h1><p className={`text-[10px] font-medium opacity-60`}>Gestión por Lotes | {user}</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-lg transition ${darkMode ? 'bg-slate-700 text-yellow-400' : 'bg-slate-800 text-slate-300'}`}>{darkMode ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button onClick={() => { localStorage.removeItem('028_user'); setUser(null); }} className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition"><LogOut size={16} /></button>
          </div>
        </header>

        {/* NAVIGATION COMPACTA */}
        <div className="flex flex-wrap gap-2">
            {[{ id: 'home', icon: Home, label: 'Inicio' }, { id: 'batches', icon: FolderOpen, label: 'Lotes' }, { id: 'sales', icon: ShoppingCart, label: 'Ventas' }, { id: 'analysis', icon: Activity, label: 'Análisis' }, { id: 'expenses', icon: Wallet, label: 'Gastos' }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs transition-all ${activeTab === tab.id ? (darkMode ? 'bg-blue-600 text-white' : 'bg-slate-800 text-white') : (darkMode ? 'bg-slate-800 text-slate-400' : 'bg-white text-slate-500')}`}><tab.icon size={14} /> {tab.label}</button>
            ))}
        </div>

        {/* --- PESTAÑA INICIO (ANÁLISIS GLOBAL) --- */}
        {activeTab === 'home' && (
             <div className="space-y-4 animate-in fade-in">
                <Card darkMode={darkMode} className="bg-gradient-to-r from-blue-900 to-slate-900 text-white border-none py-3">
                    <h2 className="text-lg font-bold mb-0.5 flex items-center gap-2"><Activity size={18} className="text-emerald-400"/> Resumen Global</h2>
                    <p className="opacity-60 text-xs">Estado histórico de toda la operación.</p>
                </Card>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      
                      {/* FILA 1: RESULTADOS HISTÓRICOS (TU SCORE TOTAL) */}
                      <Card darkMode={darkMode}><div className="text-[10px] font-bold uppercase opacity-50">Ventas Históricas</div><div className="text-xl font-bold text-blue-500">{formatMoney(globalAnalysis.totalRevenue)}</div></Card>
                      
                      <Card className={`border-t-2 ${globalAnalysis.grossProfit > 0 ? 'border-t-emerald-500' : 'border-t-orange-500'}`} darkMode={darkMode}>
                          <div className="text-[10px] font-bold uppercase opacity-50 flex justify-between">
                              Ganancia Bruta
                              <span className="text-xs bg-slate-500/10 px-1 rounded">{formatPercent(globalAnalysis.grossMargin)}</span>
                          </div>
                          <div className={`text-xl font-bold ${globalAnalysis.grossProfit > 0 ? 'text-emerald-500' : 'text-orange-500'}`}>{formatMoney(globalAnalysis.grossProfit)}</div>
                      </Card>

                      <Card darkMode={darkMode}>
                          <div className="text-[10px] font-bold uppercase opacity-50">Gastos Totales</div>
                          <div className="text-xl font-bold text-red-500">{formatMoney(globalAnalysis.totalGlobalExpenses)}</div>
                      </Card>
                      
                      {/* LA TARJETA PRINCIPAL: GANANCIA HISTÓRICA ACUMULADA */}
                      <Card className={`border-t-2 ${globalAnalysis.netProfit > 0 ? 'border-t-emerald-600' : 'border-t-red-500'}`} darkMode={darkMode}>
                          <div className="text-[10px] font-bold uppercase opacity-50 flex justify-between items-center">
                              Ganancia Histórica Neta
                              <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${globalAnalysis.netProfit > 0 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>{formatPercent(globalAnalysis.netMargin)}</span>
                          </div>
                          <div className={`text-2xl font-black ${globalAnalysis.netProfit > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatMoney(globalAnalysis.netProfit)}</div>
                          <div className="text-[9px] opacity-60">Dinero generado libre (Total)</div>
                      </Card>

                      {/* FILA 2: ACTIVOS Y LIQUIDEZ (DONDE ESTÁ LA PLATA HOY) */}
                      <Card darkMode={darkMode}><div className="text-[10px] font-bold uppercase opacity-50">Inversión Total</div><div className="text-xl font-bold text-red-500">{formatMoney(globalAnalysis.totalInvestment)}</div></Card>

                       <Card darkMode={darkMode} className="border-l-2 border-l-blue-500">
                          <div className="text-[10px] font-bold uppercase opacity-50 flex items-center gap-1"><Package size={10}/> Valor Stock Actual</div>
                          <div className="text-xl font-bold text-blue-500">{formatMoney(globalAnalysis.currentStockValue)}</div>
                      </Card>

                      {/* SALDO CAJA (LIQUIDEZ) */}
                      <Card darkMode={darkMode} className={`border-l-4 ${globalAnalysis.cashBalance >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
                          <div className="text-[10px] font-bold uppercase opacity-50 flex items-center gap-1"><Wallet size={10}/> Saldo Caja (Bolsillo)</div>
                          <div className={`text-xl font-black ${globalAnalysis.cashBalance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatMoney(globalAnalysis.cashBalance)}</div>
                      </Card>

                      <Card darkMode={darkMode}>
                          <div className="text-[10px] font-bold uppercase opacity-50 flex justify-between">Promedio Ventas</div>
                          <div className="text-xl font-black text-purple-500">{globalAnalysis.dailyAvgItems.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">u/día</span></div>
                      </Card>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-in slide-in-from-bottom-8">
                    <Card darkMode={darkMode}>
                      <h3 className="font-bold mb-3 flex items-center gap-2 text-xs"><Users size={14}/> Ventas por Origen (Global)</h3>
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
                      <h3 className="font-bold mb-3 flex items-center gap-2 text-xs"><BarChart3 size={14}/> Tipo de Cliente (Global)</h3>
                      <div className="flex gap-4 items-center justify-center h-24">
                        <div className="text-center w-1/2">
                          <div className="text-2xl font-bold text-emerald-500">{globalAnalysis.typeCounts.Final}</div>
                          <div className="text-[10px] opacity-60 uppercase mt-0.5">Final</div>
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
              <h2 className="text-sm font-bold mb-2 flex items-center gap-2"><Plus size={16} className="text-blue-500" /> Crear Nueva Carpeta / Lote</h2>
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
                          <div className="col-span-2 md:col-span-2"><Input darkMode={darkMode} label="Producto" placeholder="Ej: ElfBar" value={newItem.product} onChange={e => setNewItem({...newItem, product: e.target.value})} /></div>
                          <div className="col-span-1"><Input darkMode={darkMode} label="Variante" placeholder="Ej: Mint" value={newItem.variant} onChange={e => setNewItem({...newItem, variant: e.target.value})} /></div>
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
                      <Select darkMode={darkMode} label="Origen" value={newSale.source} onChange={e => setNewSale({...newSale, source: e.target.value})} options={[{value:'Instagram', label:'IG'}, {value:'Whatsapp', label:'WPP'}, {value:'Personal', label:'Per'}, {value:'Web', label:'Web'}]} />
                      <Select darkMode={darkMode} label="Tipo" value={newSale.isReseller} onChange={e => setNewSale({...newSale, isReseller: e.target.value})} options={[{value:'No', label:'Final'}, {value:'Si', label:'Reventa'}]} />
                  </div>
                  <Button darkMode={darkMode} onClick={handleAddSale} variant="success" className="w-full py-2">Confirmar Venta</Button>
                </div>
            </Card>
            <div className="lg:col-span-2 space-y-4">
              <div className={`rounded-xl shadow-sm overflow-hidden border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className={`p-3 font-bold text-xs border-b ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>Últimas Ventas</div>
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
                  {/* PANEL DE GESTIÓN DE ESTADO */}
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
                      {/* FILA 1: DATOS FINANCIEROS CLAVE */}
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

                      {/* FILA 2: RENDIMIENTO Y STOCK */}
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

                        {/* NUEVA CARD DE GANANCIA ENVÍOS */}
                        <Card darkMode={darkMode} className={batchAnalysis.totalShippingProfit >= 0 ? "border-t-2 border-t-emerald-500/50" : "border-t-2 border-t-red-500/50"}>
                          <div className="text-[10px] font-bold uppercase opacity-50 flex items-center gap-1"><Truck size={10}/> Dif. Envíos</div>
                          <div className={`text-xl font-bold ${batchAnalysis.totalShippingProfit >= 0 ? 'text-emerald-500' : 'text-orange-500'}`}>{formatMoney(batchAnalysis.totalShippingProfit)}</div>
                      </Card>
                      
                      {/* RENTABILIDAD OPERATIVA (CON %) */}
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
                          <div className="text-[10px] opacity-60 uppercase mt-0.5">Final</div>
                        </div>
                        <div className="h-8 w-[1px] bg-slate-300"></div>
                        <div className="text-center w-1/2">
                          <div className="text-2xl font-bold text-purple-500">{batchAnalysis.typeCounts.Revendedor}</div>
                          <div className="text-[10px] opacity-60 uppercase mt-0.5">Reventa</div>
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