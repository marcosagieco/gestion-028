import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Trash2, Save, TrendingUp, DollarSign, Package, 
  ShoppingCart, Wallet, Activity, LogOut, Moon, Sun, AlertTriangle, Calendar, Award, FolderOpen, ChevronRight, ChevronDown, Box, Users, BarChart3,
  StopCircle, CheckCircle, Clock, Lock // Iconos actualizados
} from 'lucide-react';

// --- 1. IMPORTACIONES DE FIREBASE (Ajustadas para el entorno) ---
import { initializeApp } from "firebase/app";
import { 
  getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged 
} from "firebase/auth";
import { 
  getFirestore, collection, addDoc, deleteDoc, doc, updateDoc, 
  onSnapshot, query, orderBy, increment 
} from 'firebase/firestore';

// --- 2. CONFIGURACIÓN DE FIREBASE (Ajustada para el entorno seguro) ---
const firebaseConfig = {
  apiKey: "AIzaSyCavgJ20mrE5HZHW7H7NKQ0sibs5p4Q-TU",
  authDomain: "gestion-028.firebaseapp.com",
  projectId: "gestion-028",
  storageBucket: "gestion-028.firebasestorage.app",
  messagingSenderId: "5538640148",
  appId: "1:5538640148:web:a6a34ee4e1dad97390d201"
};

// --- 3. COMPONENTES UI ---

const Card = ({ children, className = '', darkMode }) => (
  <div className={`rounded-xl shadow-lg p-6 border transition-all duration-300 ${
    darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-100 text-slate-800'
  } ${className}`}>
    {children}
  </div>
);

const Button = ({ onClick, children, variant = 'primary', className = '', disabled = false, darkMode }) => {
  const baseStyle = "px-4 py-2 rounded-lg font-bold transition-all duration-200 flex items-center justify-center gap-2 text-sm shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: darkMode ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-slate-900 text-white hover:bg-slate-800",
    danger: "bg-red-500 text-white hover:bg-red-600",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
    warning: "bg-orange-500 text-white hover:bg-orange-600",
    outline: darkMode ? "border-2 border-slate-600 text-slate-300 bg-transparent hover:border-slate-500" : "border-2 border-slate-200 text-slate-700 bg-transparent hover:border-slate-800"
  };
  return <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`}>{children}</button>;
};

const Input = ({ label, symbol, darkMode, ...props }) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className={`text-xs font-bold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</label>}
    <div className="relative">
      {symbol && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className={`text-sm font-bold ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{symbol}</span></div>}
      <input className={`border rounded-lg p-2.5 w-full outline-none transition-all ${darkMode ? 'bg-slate-700 border-slate-600 text-white focus:ring-2 focus:ring-blue-500' : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-2 focus:ring-slate-800'} ${symbol ? 'pl-8' : ''}`} {...props} />
    </div>
  </div>
);

const Select = ({ label, options, darkMode, ...props }) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className={`text-xs font-bold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</label>}
    <div className="relative">
      <select className={`appearance-none w-full border rounded-lg p-2.5 pr-8 outline-none cursor-pointer transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} {...props}>
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
  const [firebaseUser, setFirebaseUser] = useState(null);

  useEffect(() => {
    localStorage.setItem('028_dark_mode', darkMode);
    if (darkMode) document.body.classList.add('dark'); else document.body.classList.remove('dark');
  }, [darkMode]);

  // Autenticación Real de Firebase
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => setFirebaseUser(u));
  }, []);

  const [activeTab, setActiveTab] = useState('batches');
  const [batches, setBatches] = useState([]);
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState(false);
  const [expandedBatchId, setExpandedBatchId] = useState(null);
  
  // Nuevo estado para la fecha de finalización manual en Análisis
  const [finalizeDateInput, setFinalizeDateInput] = useState(getTodayDate());

  // Helper para rutas seguras en este entorno
  const getCollection = (name) => collection(db, 'artifacts', appId, 'public', 'data', name);
  const getDocRef = (colName, docId) => doc(db, 'artifacts', appId, 'public', 'data', colName, docId);

  // Sincronización con Firebase
  useEffect(() => {
    if (!user || !firebaseUser) return;
    setLoading(true);
    const unsubBatches = onSnapshot(query(getCollection('batches'), orderBy('createdAt', 'desc')), (snap) => {
      setBatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubSales = onSnapshot(query(getCollection('sales'), orderBy('date', 'desc')), (snap) => setSales(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubExp = onSnapshot(query(getCollection('expenses'), orderBy('date', 'desc')), (snap) => setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    setLoading(false);
    return () => { unsubBatches(); unsubSales(); unsubExp(); };
  }, [user, firebaseUser]);

  const formatMoney = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);

  // --- ACCIONES DE LOTES Y ITEMS ---
  
  // 1. Crear Carpeta
  const [newBatchName, setNewBatchName] = useState('');
  const handleCreateBatch = async () => {
    if (!newBatchName) return alert("Ponle un nombre a la carpeta");
    try { 
        await addDoc(getCollection('batches'), { 
            name: newBatchName, 
            createdAt: new Date().toISOString(), 
            items: [], 
            finalizedAt: null 
        }); 
        setNewBatchName(''); 
        alert("✅ Carpeta creada"); 
    } catch (e) { alert("Error: " + e.message); }
  };
  const handleDeleteBatch = async (id) => { if (window.confirm('¿Borrar carpeta completa? Se perderá el historial interno.')) await deleteDoc(getDocRef('batches', id)); };

  // FINALIZAR LOTE
  const handleFinalizeBatchWithDate = async (batchId) => {
    if (!finalizeDateInput) return alert("Selecciona una fecha.");
    if (!window.confirm(`¿Finalizar lote con fecha ${finalizeDateInput}? Esto congelará el análisis.`)) return;
    try {
        const [year, month, day] = finalizeDateInput.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day, new Date().getHours(), 0, 0);
        await updateDoc(getDocRef('batches', batchId), { finalizedAt: dateObj.toISOString() });
    } catch (e) { alert("Error al finalizar: " + e.message); }
  };
  
  // REABRIR LOTE
  const handleReopenBatch = async (batchId) => {
      if (!window.confirm("¿Reabrir este lote? Volverá a contar los días activos.")) return;
      try {
          await updateDoc(getDocRef('batches', batchId), { finalizedAt: null });
      } catch (e) { alert("Error: " + e.message); }
  }

  // 2. Items dentro de Carpeta
  const [newItem, setNewItem] = useState({ product: '', variant: '', costArs: '', initialStock: '' });
  
  const handleAddItemToBatch = async (batchId) => {
    if (!newItem.product || !newItem.costArs || !newItem.initialStock) return alert("Faltan datos");
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    if (batch.finalizedAt) return alert("No puedes agregar items a un lote finalizado.");

    const newItemData = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      product: newItem.product, 
      variant: newItem.variant || 'Único', 
      costArs: parseFloat(newItem.costArs) || 0, 
      initialStock: parseInt(newItem.initialStock) || 0, 
      currentStock: parseInt(newItem.initialStock) || 0,
    };

    try {
      await updateDoc(getDocRef('batches', batchId), { items: [...(batch.items || []), newItemData] });
      setNewItem({ product: '', variant: '', costArs: '', initialStock: '' });
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleDeleteItemFromBatch = async (batchId, itemId) => {
    if (!window.confirm('¿Borrar este producto del lote?')) return;
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    const updatedItems = batch.items.filter(i => i.id !== itemId);
    try { await updateDoc(getDocRef('batches', batchId), { items: updatedItems }); } catch (e) { alert("Error al borrar item: " + e.message); }
  };

  // 3. Ventas
  const [newSale, setNewSale] = useState({ batchId: '', itemId: '', quantity: 1, unitPrice: '', shippingCost: 0, shippingPrice: 0, source: 'Instagram', isReseller: 'No', saleDate: getTodayDate() });
  
  const handleAddSale = async () => {
    if (!newSale.batchId || !newSale.itemId || !newSale.unitPrice) return alert("Faltan datos");
    
    const batch = batches.find(b => b.id === newSale.batchId);
    if (!batch) return alert("Carpeta no encontrada");
    const itemIndex = batch.items.findIndex(i => i.id === newSale.itemId);
    if (itemIndex === -1) return alert("Producto no encontrado");
    const item = batch.items[itemIndex];

    if (item.currentStock <= 0) return alert(`⛔ SIN STOCK: ${item.product} agotado.`);
    const qty = parseInt(newSale.quantity) || 1;
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
      await addDoc(getCollection('sales'), saleData);
      
      const newItems = [...batch.items];
      newItems[itemIndex] = { ...item, currentStock: item.currentStock - qty };
      const updates = { items: newItems };

      const allStockZero = newItems.every(i => i.currentStock === 0);
      if (allStockZero && !batch.finalizedAt) {
          updates.finalizedAt = new Date().toISOString();
          alert("🎉 ¡Stock agotado! El análisis del lote se ha detenido automáticamente.");
      }

      await updateDoc(getDocRef('batches', batch.id), updates);
      setNewSale({ ...newSale, quantity: 1, unitPrice: '', shippingCost: 0, shippingPrice: 0 });
      alert(`✅ Venta OK. Caja: ${formatMoney(totalCashIn)}`);
    } catch (e) { alert('Error: ' + e.message); }
  };

  const handleDeleteSale = async (sale) => {
    if (!sale || !sale.id) return;
    if (!window.confirm(`¿Eliminar venta de ${sale.productName}? El stock se devolverá.`)) return;
    try {
      await deleteDoc(getDocRef('sales', sale.id));
      if (sale.batchId && sale.itemId) {
        const batch = batches.find(b => b.id === sale.batchId);
        if (batch) {
          const itemIndex = batch.items.findIndex(i => i.id === sale.itemId);
          if (itemIndex !== -1) {
            const newItems = [...batch.items];
            newItems[itemIndex].currentStock += sale.quantity;
            await updateDoc(getDocRef('batches', batch.id), { items: newItems });
          }
        }
      }
    } catch (e) { alert('Error: ' + e.message); }
  };

  // 4. Gastos
  const [newExpense, setNewExpense] = useState({ description: '', amount: '' });
  const [newExpenseBatchId, setNewExpenseBatchId] = useState(''); 

  const handleAddExpense = async () => {
    if (!newExpense.description || !newExpense.amount) return;
    const batchData = newExpenseBatchId ? batches.find(b => b.id === newExpenseBatchId) : null;
    await addDoc(getCollection('expenses'), { 
        date: new Date().toISOString(), 
        description: newExpense.description, 
        amount: parseFloat(newExpense.amount),
        batchId: newExpenseBatchId || null, 
        batchName: batchData ? batchData.name : 'General' 
    });
    setNewExpense({ description: '', amount: '' });
    setNewExpenseBatchId(''); 
  };
  const handleDeleteExpense = async (id) => await deleteDoc(getDocRef('expenses', id));

  // --- ANALISIS ---
  const [selectedBatchStats, setSelectedBatchStats] = useState(null);
  const batchAnalysis = useMemo(() => {
    if (!selectedBatchStats) return null;
    const batch = batches.find(b => b.id === selectedBatchStats);
    if (!batch) return null;

    const batchSales = sales.filter(s => s.batchId === batch.id);
    let totalRevenue = 0, itemsSold = 0;
    const sourceCounts = {}, typeCounts = { Revendedor: 0, Final: 0 };

    batchSales.forEach(s => {
      totalRevenue += s.totalSaleRaw;
      itemsSold += s.quantity;
      const src = s.source || 'Otro';
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
      if (s.isReseller) typeCounts.Revendedor++; else typeCounts.Final++;
    });

    const totalInvestment = (batch.items || []).reduce((acc, i) => acc + (i.costArs * i.initialStock), 0);
    const costOfSold = batchSales.reduce((acc, s) => acc + (s.costArsAtSale * s.quantity), 0);
    const currentProfit = totalRevenue - costOfSold;
    
    const batchExpenses = expenses.filter(e => e.batchId === batch.id);
    const totalBatchExpenses = batchExpenses.reduce((acc, e) => acc + e.amount, 0);
    const profitAfterExpenses = currentProfit - totalBatchExpenses;

    const createdDate = new Date(batch.createdAt);
    const endDate = batch.finalizedAt ? new Date(batch.finalizedAt) : new Date();
    const diffTime = Math.abs(endDate - createdDate);
    const daysActive = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; 
    const dailyAvgItems = daysActive > 0 ? itemsSold / daysActive : itemsSold;

    const totalInitStock = (batch.items || []).reduce((acc, i) => acc + i.initialStock, 0);
    const progress = totalInitStock > 0 ? (itemsSold / totalInitStock) * 100 : 0;

    return { 
        batch, salesCount: batchSales.length, itemsSold, totalRevenue, totalInvestment, 
        currentProfit, totalBatchExpenses, profitAfterExpenses, 
        progress, sourceCounts, typeCounts, daysActive, dailyAvgItems 
    };
  }, [selectedBatchStats, sales, batches, expenses]);

  // --- RENDER ---
  const handleLogin = (e) => { 
    e.preventDefault(); 
    const val = e.target.password.value;
    if(val === '1717') { 
      const sessionUser = 'Admin';
      localStorage.setItem('028_user', sessionUser); 
      setUser(sessionUser); 
    } else {
      alert("Contraseña incorrecta");
    }
  };

  if (!user) return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-colors ${darkMode ? 'bg-slate-950' : 'bg-slate-900'}`}>
      <div className={`p-8 rounded-2xl shadow-2xl w-full max-w-md text-center ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
        <div className="bg-emerald-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"><Package size={32} className="text-slate-900" /></div>
        <h1 className={`text-2xl font-black mb-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>028 IMPORT</h1>
        <p className="text-slate-400 mb-6 text-sm">Sistema de Gestión Cloud</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input name="password" type="password" placeholder="Contraseña de Acceso" className={`w-full border p-3 rounded-lg text-center font-bold outline-none focus:ring-2 ring-emerald-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}`} autoFocus />
          <button className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-slate-800 transition">Ingresar</button>
        </form>
      </div>
    </div>
  );

  if (configError) return <div className="text-white text-center p-10">Configura Firebase</div>;

  return (
    <div className={`min-h-screen p-4 md:p-8 font-sans transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-100 text-slate-800'}`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <header className={`p-6 rounded-2xl shadow-xl flex flex-col md:flex-row justify-between items-center gap-6 transition-colors duration-300 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-slate-900 text-white'}`}>
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-xl text-white relative"><FolderOpen size={32} strokeWidth={2.5} /></div>
            <div><h1 className="text-3xl font-black tracking-tight">028 IMPORT</h1><p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-400'}`}>Gestión por Lotes | {user}</p></div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setDarkMode(!darkMode)} className={`p-3 rounded-xl transition ${darkMode ? 'bg-slate-700 text-yellow-400' : 'bg-slate-800 text-slate-300'}`}>{darkMode ? <Sun size={20} /> : <Moon size={20} />}</button>
            <button onClick={() => { localStorage.removeItem('028_user'); setUser(null); }} className="p-3 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition"><LogOut size={20} /></button>
          </div>
        </header>

        <div className="flex flex-wrap gap-2">
            {[{ id: 'batches', icon: FolderOpen, label: 'Lotes' }, { id: 'sales', icon: ShoppingCart, label: 'Ventas' }, { id: 'analysis', icon: Activity, label: 'Análisis' }, { id: 'expenses', icon: Wallet, label: 'Gastos' }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${activeTab === tab.id ? (darkMode ? 'bg-blue-600 text-white' : 'bg-slate-800 text-white') : (darkMode ? 'bg-slate-800 text-slate-400' : 'bg-white text-slate-500')}`}><tab.icon size={18} /> {tab.label}</button>
            ))}
        </div>

        {activeTab === 'batches' && (
          <div className="space-y-6 animate-in fade-in">
            <Card className={darkMode ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-slate-800'} darkMode={darkMode}>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Plus className="text-blue-500" /> Crear Nueva Carpeta / Lote</h2>
              <div className="flex gap-4 items-end">
                <div className="flex-1"><Input darkMode={darkMode} label="Nombre del Lote" placeholder="Ej: Pedido Noviembre 2024" value={newBatchName} onChange={e => setNewBatchName(e.target.value)} /></div>
                <div className="w-48"><Button darkMode={darkMode} onClick={handleCreateBatch} className="w-full">Crear Carpeta</Button></div>
              </div>
            </Card>
            <div className="space-y-4">
              {batches.map((b) => {
                // LÓGICA DE ESTILO EXPLÍCITA PARA EVITAR ERRORES
                const isFinalized = !!b.finalizedAt;
                const cardBg = isFinalized 
                    ? (darkMode ? 'bg-emerald-900/30' : 'bg-emerald-50') 
                    : (darkMode ? 'bg-slate-800' : 'bg-white');
                const cardBorder = isFinalized 
                    ? 'border-emerald-500 border-2' 
                    : (darkMode ? 'border-slate-700' : 'border-slate-200');

                return (
                <div key={b.id} className={`rounded-xl border overflow-hidden transition-all duration-300 ${cardBg} ${cardBorder}`}>
                  <div className={`p-4 flex justify-between items-center cursor-pointer ${darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'}`} onClick={() => setExpandedBatchId(expandedBatchId === b.id ? null : b.id)}>
                    <div className="flex items-center gap-3">
                        {isFinalized ? <CheckCircle className="text-emerald-500" size={28} /> : <FolderOpen className="text-blue-500" size={28} />}
                        <div>
                            <h3 className={`font-bold text-lg flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                                {b.name}
                            </h3>
                            <div className="text-xs opacity-70 flex items-center gap-2 font-medium">
                                {(b.items || []).length} Productos 
                                {isFinalized && <span className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">CERRADO</span>}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">{expandedBatchId === b.id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}</div>
                  </div>
                  {expandedBatchId === b.id && (
                    <div className={`p-4 border-t ${darkMode ? 'border-slate-700 bg-slate-900/50' : 'border-slate-100 bg-slate-50'}`}>
                      {isFinalized ? (
                          <div className={`mb-6 p-6 rounded-xl border-2 text-center ${darkMode ? 'bg-emerald-900/20 border-emerald-500/50 text-emerald-300' : 'bg-emerald-100 border-emerald-300 text-emerald-800'}`}>
                              <Lock className="mx-auto mb-2 opacity-50" size={32}/>
                              <div className="font-bold text-lg">LOTE CERRADO</div>
                              <div className="text-sm opacity-80">Finalizado el {new Date(b.finalizedAt).toLocaleDateString()}</div>
                          </div>
                      ) : (
                          <div className="mb-6 p-4 rounded-lg border border-dashed border-slate-400/50">
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                              <div className="md:col-span-2"><Input darkMode={darkMode} label="Producto" placeholder="Ej: ElfBar" value={newItem.product} onChange={e => setNewItem({...newItem, product: e.target.value})} /></div>
                              <div><Input darkMode={darkMode} label="Variante" placeholder="Ej: Mint" value={newItem.variant} onChange={e => setNewItem({...newItem, variant: e.target.value})} /></div>
                              <div><Input darkMode={darkMode} label="Costo ($)" type="number" value={newItem.costArs} onChange={e => setNewItem({...newItem, costArs: e.target.value})} /></div>
                              <div><Input darkMode={darkMode} label="Cantidad" type="number" value={newItem.initialStock} onChange={e => setNewItem({...newItem, initialStock: e.target.value})} /></div>
                              <div className="md:col-span-5"><Button darkMode={darkMode} onClick={() => handleAddItemToBatch(b.id)} className="w-full text-xs h-9">Agregar a Carpeta</Button></div>
                            </div>
                          </div>
                      )}

                      <table className="w-full text-left text-sm">
                        <thead className={`text-xs uppercase opacity-50 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}><tr><th className="pb-2">Producto</th><th className="pb-2">Costo</th><th className="pb-2">Stock</th><th className="pb-2 text-right">Acción</th></tr></thead>
                        <tbody className="divide-y divide-slate-700/20">
                          {(b.items || []).map((item, idx) => (
                            <tr key={idx} className="hover:opacity-80">
                              <td className="py-3 font-medium">{item.product} <span className="opacity-60 text-xs ml-1">{item.variant}</span></td>
                              <td className="py-3 font-mono">{formatMoney(item.costArs)}</td>
                              <td className="py-3"><span className={`font-bold px-2 py-0.5 rounded text-xs ${item.currentStock === 0 ? 'bg-red-500/20 text-red-500' : 'bg-emerald-500/20 text-emerald-500'}`}>{item.currentStock} / {item.initialStock}</span></td>
                              <td className="py-3 text-right"><button onClick={() => handleDeleteItemFromBatch(b.id, item.id)} className="text-slate-400 hover:text-red-500 p-1" title="Eliminar"><Trash2 size={14} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      
                      <div className="mt-6 pt-4 border-t border-slate-700/20 flex justify-end items-center">
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteBatch(b.id); }} className="text-xs text-red-500 hover:underline flex items-center gap-1"><Trash2 size={12}/> Eliminar Carpeta</button>
                      </div>
                    </div>
                  )}
                </div>
              )})}
            </div>
          </div>
        )}

        {activeTab === 'sales' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
            <Card className="lg:col-span-1 border-t-4 border-t-emerald-500 h-fit" darkMode={darkMode}>
                <h2 className="text-lg font-bold mb-4">Nueva Venta</h2>
                <div className="space-y-4">
                  <div className="bg-amber-50/50 p-2 rounded border border-amber-100/20"><Input darkMode={darkMode} label="Fecha" type="date" value={newSale.saleDate} onChange={e => setNewSale({...newSale, saleDate: e.target.value})} /></div>
                  <div className="flex flex-col gap-1.5">
                    <label className={`text-xs font-bold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>1. Seleccionar Carpeta</label>
                    <select className={`border rounded-lg p-2.5 w-full outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} value={newSale.batchId} onChange={e => setNewSale({...newSale, batchId: e.target.value, itemId: ''})}>
                        <option value="">-- Elegir Carpeta --</option>{batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  {newSale.batchId && (
                    <div className="flex flex-col gap-1.5 animate-in fade-in">
                      <label className={`text-xs font-bold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>2. Seleccionar Producto</label>
                      <select className={`border rounded-lg p-2.5 w-full outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} value={newSale.itemId} onChange={e => setNewSale({...newSale, itemId: e.target.value})}>
                          <option value="">-- Elegir Producto --</option>
                          {batches.find(b => b.id === newSale.batchId)?.items?.map(item => (<option key={item.id} value={item.id} disabled={item.currentStock <= 0}>{item.product} {item.variant} - (Stock: {item.currentStock})</option>))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2"><Input darkMode={darkMode} label="Cantidad" type="number" value={newSale.quantity} onChange={e => setNewSale({...newSale, quantity: e.target.value})} /></div>
                  <Input darkMode={darkMode} label="Precio Venta ($)" type="number" value={newSale.unitPrice} onChange={e => setNewSale({...newSale, unitPrice: e.target.value})} />
                  <div className={`p-3 rounded-lg border grid grid-cols-2 gap-2 ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-blue-50 border-blue-100'}`}>
                      <Input darkMode={darkMode} label="Costo Envío" type="number" value={newSale.shippingCost} onChange={e => setNewSale({...newSale, shippingCost: e.target.value})} />
                      <Input darkMode={darkMode} label="Cobro Envío" type="number" value={newSale.shippingPrice} onChange={e => setNewSale({...newSale, shippingPrice: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                      <Select darkMode={darkMode} label="Origen" value={newSale.source} onChange={e => setNewSale({...newSale, source: e.target.value})} options={[{value:'Instagram', label:'Instagram'}, {value:'Whatsapp', label:'Whatsapp'}, {value:'Personal', label:'Personal'}]} />
                      <Select darkMode={darkMode} label="Tipo" value={newSale.isReseller} onChange={e => setNewSale({...newSale, isReseller: e.target.value})} options={[{value:'No', label:'Consumidor Final'}, {value:'Si', label:'Revendedor'}]} />
                  </div>
                  <Button darkMode={darkMode} onClick={handleAddSale} variant="success" className="w-full py-3">Registrar Venta</Button>
                </div>
            </Card>
            <div className="lg:col-span-2 space-y-4">
              <div className={`rounded-xl shadow overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                <div className={`p-4 font-bold border-b ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>Historial de Ventas</div>
                <div className="overflow-x-auto max-h-[600px]">
                  <table className="w-full text-left text-sm">
                      <thead className={darkMode ? 'bg-slate-900 text-slate-500' : 'bg-slate-50 text-slate-400'}><tr><th className="p-3">Fecha</th><th className="p-3">Detalle</th><th className="p-3 text-emerald-500">Ganancia</th><th className="p-3">Total ($)</th><th className="p-3"></th></tr></thead>
                      <tbody className={`divide-y ${darkMode ? 'divide-slate-700 text-slate-300' : 'divide-slate-100'}`}>
                        {sales.map(s => {
                          const itemProfit = s.totalSaleRaw - ((s.costArsAtSale || 0) * s.quantity);
                          return (
                            <tr key={s.id} className="hover:opacity-80">
                              <td className="p-3 text-xs opacity-70">{new Date(s.date).toLocaleDateString()}</td>
                              <td className="p-3"><div className="font-bold">{s.quantity} x {s.productName} {s.variant}</div><div className="text-[10px] bg-blue-500/20 text-blue-500 inline-block px-1 rounded mt-1">{s.batchName}</div></td>
                              <td className="p-3 font-bold text-emerald-500">{formatMoney(itemProfit)}</td>
                              <td className="p-3 font-bold font-mono">{formatMoney(s.totalSaleRaw)}</td>
                              <td className="p-3 text-right"><button onClick={() => handleDeleteSale(s)} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button></td>
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
          <div className="space-y-6 animate-in fade-in">
            <Card darkMode={darkMode}>
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><FolderOpen className="text-blue-500"/> Seleccionar Carpeta a Analizar</h2>
                <div className="flex gap-4">
                    <select 
                        className={`border rounded-lg p-3 w-full outline-none text-lg ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`}
                        onChange={(e) => setSelectedBatchStats(e.target.value)}
                        value={selectedBatchStats || ''}
                    >
                        <option value="">-- Seleccionar Lote --</option>
                        {batches.map(b => (
                            <option key={b.id} value={b.id}>
                                {b.name} {b.finalizedAt ? '(Finalizado)' : ''}
                            </option>
                        ))}
                    </select>
                </div>
            </Card>

            {batchAnalysis && (
                <div className="space-y-6 animate-in slide-in-from-bottom-4">
                  {/* --- PANEL DE ESTADO DEL LOTE (ULTRA VISIBLE) --- */}
                  {!batchAnalysis.batch.finalizedAt ? (
                      <Card darkMode={darkMode} className="border-l-4 border-l-blue-500">
                         <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                             <div>
                                 <h3 className="text-lg font-bold flex items-center gap-2">
                                     <Clock className="text-blue-500"/> Estado: En Curso
                                 </h3>
                                 <p className="text-sm opacity-60 mt-1">Iniciado el {new Date(batchAnalysis.batch.createdAt).toLocaleDateString()}. Lleva {batchAnalysis.daysActive} días activo.</p>
                             </div>
                             <div className="flex items-center gap-3 bg-slate-100/5 p-2 rounded-lg border border-slate-500/20">
                                 <div className="flex flex-col">
                                    <label className="text-[10px] font-bold uppercase opacity-50 mb-1">Fecha de Finalización</label>
                                    <input type="date" className={`p-1.5 rounded text-sm outline-none border ${darkMode ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-300'}`} value={finalizeDateInput} onChange={(e) => setFinalizeDateInput(e.target.value)} />
                                 </div>
                                 <Button onClick={() => handleFinalizeBatchWithDate(batchAnalysis.batch.id)} variant="primary" darkMode={darkMode} className="h-full"><StopCircle size={16}/> Finalizar Ahora</Button>
                             </div>
                         </div>
                      </Card>
                  ) : (
                      <div className="rounded-xl shadow-xl overflow-hidden bg-emerald-600 text-white p-8 text-center animate-in zoom-in-95 duration-300">
                          <div className="flex justify-center mb-4"><div className="bg-white/20 p-4 rounded-full"><CheckCircle size={48} className="text-white"/></div></div>
                          <h2 className="text-3xl font-black mb-2 tracking-tight">¡LOTE FINALIZADO!</h2>
                          <p className="text-emerald-100 text-lg mb-6">Este lote se cerró el {new Date(batchAnalysis.batch.finalizedAt).toLocaleDateString()} y su análisis está congelado.</p>
                          <button onClick={() => handleReopenBatch(batchAnalysis.batch.id)} className="bg-black/20 hover:bg-black/30 text-white px-6 py-2 rounded-lg text-sm font-bold transition">Reabrir Lote (Solo si hubo error)</button>
                      </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <Card darkMode={darkMode}>
                          <div className="text-xs font-bold uppercase opacity-50">Promedio por día</div>
                          <div className="text-3xl font-black text-purple-500 mt-1">{batchAnalysis.dailyAvgItems.toFixed(1)} <span className="text-sm font-normal text-slate-400">u/día</span></div>
                      </Card>
                      <Card darkMode={darkMode}><div className="text-xs font-bold uppercase opacity-50">Inversión Total</div><div className="text-2xl font-bold text-red-500">{formatMoney(batchAnalysis.totalInvestment)}</div></Card>
                      <Card darkMode={darkMode}><div className="text-xs font-bold uppercase opacity-50">Ventas Totales</div><div className="text-2xl font-bold text-blue-500">{formatMoney(batchAnalysis.totalRevenue)}</div></Card>
                      <Card darkMode={darkMode}>
                          <div className="text-xs font-bold uppercase opacity-50">Ganancia Neta (Ventas)</div>
                          <div className={`text-2xl font-bold ${batchAnalysis.currentProfit > 0 ? 'text-emerald-500' : 'text-orange-500'}`}>{formatMoney(batchAnalysis.currentProfit)}</div>
                      </Card>
                      <Card darkMode={darkMode}>
                          <div className="text-xs font-bold uppercase opacity-50">Gastos Asignados</div>
                          <div className="text-2xl font-bold text-red-400">-{formatMoney(batchAnalysis.totalBatchExpenses)}</div>
                      </Card>
                      <Card className={`border-t-4 ${batchAnalysis.profitAfterExpenses > 0 ? 'border-t-emerald-500' : 'border-t-orange-500'}`} darkMode={darkMode}>
                          <div className="text-xs font-bold uppercase opacity-50">Ganancia Real (Final)</div>
                          <div className={`text-3xl font-black ${batchAnalysis.profitAfterExpenses > 0 ? 'text-emerald-500' : 'text-orange-500'}`}>{formatMoney(batchAnalysis.profitAfterExpenses)}</div>
                      </Card>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-bottom-8">
                    <Card darkMode={darkMode}>
                      <h3 className="font-bold mb-4 flex items-center gap-2"><Users size={18}/> Ventas por Origen</h3>
                      <div className="space-y-3">
                        {Object.entries(batchAnalysis.sourceCounts).map(([source, count]) => (
                          <div key={source} className="flex items-center justify-between">
                            <span className="text-sm opacity-80">{source}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{width: `${(count/batchAnalysis.salesCount)*100}%`}}></div></div>
                              <span className="font-bold text-sm w-6 text-right">{count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                    <Card darkMode={darkMode}>
                      <h3 className="font-bold mb-4 flex items-center gap-2"><BarChart3 size={18}/> Tipo de Cliente</h3>
                      <div className="flex gap-4 items-center justify-center h-32">
                        <div className="text-center w-1/2">
                          <div className="text-3xl font-bold text-emerald-500">{batchAnalysis.typeCounts.Final}</div>
                          <div className="text-xs opacity-60 uppercase mt-1">Consumidor Final</div>
                        </div>
                        <div className="h-10 w-[1px] bg-slate-300"></div>
                        <div className="text-center w-1/2">
                          <div className="text-3xl font-bold text-purple-500">{batchAnalysis.typeCounts.Revendedor}</div>
                          <div className="text-xs opacity-60 uppercase mt-1">Revendedor</div>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
            )}
            {!selectedBatchStats && <div className="text-center opacity-30 py-10">Selecciona un lote arriba para ver sus estadísticas detalladas.</div>}
          </div>
        )}

        {/* GASTOS */}
        {activeTab === 'expenses' && (
            <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
            <Card darkMode={darkMode}>
                <h2 className="text-lg font-bold mb-4">Registrar Gasto</h2>
                <div className="flex flex-col md:flex-row gap-3 items-end">
                    <div className="flex-1 w-full"><Input darkMode={darkMode} label="Descripción" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} /></div>
                    <div className="w-full md:w-64">
                        <label className={`text-xs font-bold uppercase tracking-wide mb-1.5 block ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Asignar a Lote (Opcional)</label>
                        <select className={`appearance-none w-full border rounded-lg p-2.5 outline-none cursor-pointer ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} value={newExpenseBatchId} onChange={(e) => setNewExpenseBatchId(e.target.value)}>
                            <option value="">-- Gasto General --</option>
                            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    <div className="w-32"><Input darkMode={darkMode} label="Monto ($)" type="number" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} /></div>
                    <Button darkMode={darkMode} onClick={handleAddExpense} variant="danger">Restar</Button>
                </div>
            </Card>
            <div className={`rounded-xl shadow border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-100'}`}>
                {expenses.map(e => (
                <div key={e.id} className={`flex justify-between items-center p-4 border-b ${darkMode ? 'border-slate-700 hover:bg-slate-700' : 'border-slate-100 hover:bg-slate-50'}`}>
                    <div>
                        <div className="font-medium">{e.description}</div>
                        <div className="flex gap-2 text-xs opacity-60 mt-0.5">
                            <span>{new Date(e.date).toLocaleDateString()}</span>
                            <span>•</span>
                            <span className={e.batchId ? "text-blue-400 font-bold" : "text-slate-500"}>{e.batchName || 'General'}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 font-bold text-red-500">-{formatMoney(e.amount)} <button onClick={()=>handleDeleteExpense(e.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={14}/></button></div>
                </div>
                ))}
            </div>
            </div>
        )}

      </div>
    </div>
  );
}