import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Trash2, Save, TrendingUp, DollarSign, Package, 
  ShoppingCart, Wallet, Activity, LogOut, Moon, Sun, AlertTriangle, Calendar, Award, FolderOpen, ChevronRight, ChevronDown, Box
} from 'lucide-react';

// --- 1. IMPORTACIONES DE FIREBASE ---
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, addDoc, deleteDoc, doc, updateDoc, 
  onSnapshot, query, orderBy, increment 
} from 'firebase/firestore';

// --- 2. CONFIGURACIÓN DE FIREBASE ---
// ⚠️ PEGA AQUÍ TUS CREDENCIALES REALES DE FIREBASE ⚠️
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
    outline: darkMode ? "border-2 border-slate-600 text-slate-300 bg-transparent hover:border-slate-500" : "border-2 border-slate-200 text-slate-700 bg-transparent hover:border-slate-800"
  };
  return <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`}>{children}</button>;
};

const Input = ({ label, symbol, darkMode, ...props }) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className={`text-xs font-bold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</label>}
    <div className="relative">
      {symbol && <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className={`text-sm font-bold ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{symbol}</span></div>}
      <input className={`border rounded-lg p-2.5 w-full outline-none transition-all ${darkMode ? 'bg-slate-700 border-slate-600 text-white focus:ring-2 focus:ring-emerald-500' : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-2 focus:ring-slate-800'} ${symbol ? 'pl-8' : ''}`} {...props} />
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

  useEffect(() => {
    localStorage.setItem('028_dark_mode', darkMode);
    if (darkMode) document.body.classList.add('dark'); else document.body.classList.remove('dark');
  }, [darkMode]);

  const [activeTab, setActiveTab] = useState('batches');
  const [batches, setBatches] = useState([]);
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState(false);
  const [expandedBatchId, setExpandedBatchId] = useState(null);

  // Sincronización
  useEffect(() => {
    if (!user) return;
    if (firebaseConfig.apiKey === "TU_API_KEY_AQUI") { setConfigError(true); setLoading(false); return; }
    
    setLoading(true);

    const unsubBatches = onSnapshot(query(collection(db, 'batches'), orderBy('createdAt', 'desc')), (snap) => {
      setBatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('date', 'desc')), (snap) => setSales(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubExp = onSnapshot(query(collection(db, 'expenses'), orderBy('date', 'desc')), (snap) => setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    setLoading(false);
    return () => { unsubBatches(); unsubSales(); unsubExp(); };
  }, [user]);

  const formatMoney = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);

  // --- ACCIONES DE LOTES Y ITEMS ---
  
  // 1. Crear Carpeta
  const [newBatchName, setNewBatchName] = useState('');
  const handleCreateBatch = async () => {
    if (!newBatchName) return alert("Ponle un nombre a la carpeta");
    try { await addDoc(collection(db, 'batches'), { name: newBatchName, createdAt: new Date().toISOString(), items: [] }); setNewBatchName(''); alert("✅ Carpeta creada"); } catch (e) { alert("Error: " + e.message); }
  };
  const handleDeleteBatch = async (id) => { if (confirm('¿Borrar carpeta completa? Se perderá el historial interno.')) await deleteDoc(doc(db, 'batches', id)); };

  // 2. Items dentro de Carpeta
  const [newItem, setNewItem] = useState({ product: '', variant: '', costArs: '', initialStock: '' });
  
  const handleAddItemToBatch = async (batchId) => {
    if (!newItem.product || !newItem.costArs || !newItem.initialStock) return alert("Faltan datos");
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    const newItemData = {
      id: crypto.randomUUID(), product: newItem.product, variant: newItem.variant || 'Único', costArs: parseFloat(newItem.costArs) || 0, initialStock: parseInt(newItem.initialStock) || 0, currentStock: parseInt(newItem.initialStock) || 0,
    };
    try {
      await updateDoc(doc(db, 'batches', batchId), { items: [...(batch.items || []), newItemData] });
      setNewItem({ product: '', variant: '', costArs: '', initialStock: '' });
    } catch (e) { alert("Error: " + e.message); }
  };

  // --- NUEVA FUNCIÓN: BORRAR ITEM ESPECÍFICO ---
  const handleDeleteItemFromBatch = async (batchId, itemId) => {
    if (!confirm('¿Borrar este producto del lote?')) return;
    
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;
    
    // Filtramos para quitar el item
    const updatedItems = batch.items.filter(i => i.id !== itemId);
    
    try {
      await updateDoc(doc(db, 'batches', batchId), { items: updatedItems });
    } catch (e) {
      alert("Error al borrar item: " + e.message);
    }
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
    
    // --- CORRECCIÓN CÁLCULO TOTAL (CAJA) ---
    // Total Caja = (Precio Unitario * Cantidad) + (Cobro Envio - Costo Envio)
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
      const newItems = [...batch.items];
      newItems[itemIndex] = { ...item, currentStock: item.currentStock - qty };
      await updateDoc(doc(db, 'batches', batch.id), { items: newItems });
      setNewSale({ ...newSale, quantity: 1, unitPrice: '', shippingCost: 0, shippingPrice: 0 });
      alert(`✅ Venta OK. Caja: ${formatMoney(totalCashIn)}`);
    } catch (e) { alert('Error: ' + e.message); }
  };

  const handleDeleteSale = async (sale) => {
    if (!sale || !sale.id) return;
    if (!confirm(`¿Eliminar venta de ${sale.productName}? El stock se devolverá.`)) return;
    try {
      // 1. Borrar la venta
      await deleteDoc(doc(db, 'sales', sale.id));
      
      // 2. Restaurar Stock
      if (sale.batchId && sale.itemId) {
        const batch = batches.find(b => b.id === sale.batchId);
        // Si el lote todavía existe, devolvemos el stock
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
  const [newExpense, setNewExpense] = useState({ description: '', amount: '' });
  const handleAddExpense = async () => {
    if (!newExpense.description || !newExpense.amount) return;
    await addDoc(collection(db, 'expenses'), { date: new Date().toISOString(), description: newExpense.description, amount: parseFloat(newExpense.amount) });
    setNewExpense({ description: '', amount: '' });
  };
  const handleDeleteExpense = async (id) => await deleteDoc(doc(db, 'expenses', id));

  // --- ANALISIS ---
  const [selectedBatchStats, setSelectedBatchStats] = useState(null);
  const batchAnalysis = useMemo(() => {
    if (!selectedBatchStats) return null;
    const batch = batches.find(b => b.id === selectedBatchStats);
    if (!batch) return null;
    const batchSales = sales.filter(s => s.batchId === batch.id);
    let totalRevenue = 0; let itemsSold = 0;
    batchSales.forEach(s => { totalRevenue += s.totalSaleRaw; itemsSold += s.quantity; });
    const totalInvestment = (batch.items || []).reduce((acc, item) => acc + (item.costArs * item.initialStock), 0);
    const costOfSold = batchSales.reduce((acc, s) => acc + (s.costArsAtSale * s.quantity), 0);
    const currentProfit = totalRevenue - costOfSold;
    const totalInitialStock = (batch.items || []).reduce((acc, item) => acc + item.initialStock, 0);
    const progress = totalInitialStock > 0 ? (itemsSold / totalInitialStock) * 100 : 0;
    return { batch, salesCount: batchSales.length, itemsSold, totalRevenue, totalInvestment, currentProfit, progress };
  }, [selectedBatchStats, sales, batches]);

  // --- RENDER ---
  const handleLogin = (e) => { e.preventDefault(); const val = e.target.username.value; if(val) { localStorage.setItem('028_user', val); setUser(val); } };

  if (!user) return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-colors ${darkMode ? 'bg-slate-950' : 'bg-slate-900'}`}>
      <div className={`p-8 rounded-2xl shadow-2xl w-full max-w-md text-center ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
        <div className="bg-emerald-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"><Package size={32} className="text-slate-900" /></div>
        <h1 className={`text-2xl font-black mb-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>028 IMPORT</h1>
        <p className="text-slate-400 mb-6 text-sm">Sistema de Gestión por Lotes</p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input name="username" placeholder="Usuario" className={`w-full border p-3 rounded-lg text-center font-bold outline-none focus:ring-2 ring-emerald-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}`} autoFocus />
          <button className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-slate-800 transition">Ingresar</button>
        </form>
      </div>
    </div>
  );

  if (configError) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-bold">Falta Configurar Firebase</div>;

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
            {[
            { id: 'batches', icon: FolderOpen, label: 'Lotes (Carpetas)' },
            { id: 'sales', icon: ShoppingCart, label: 'Ventas' },
            { id: 'analysis', icon: Activity, label: 'Análisis' },
            { id: 'expenses', icon: Wallet, label: 'Gastos' },
            ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${activeTab === tab.id ? (darkMode ? 'bg-blue-600 text-white' : 'bg-slate-800 text-white') : (darkMode ? 'bg-slate-800 text-slate-400' : 'bg-white text-slate-500')}`}>
                <tab.icon size={18} /> {tab.label}
            </button>
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
              {batches.map((b) => (
                <div key={b.id} className={`rounded-xl border overflow-hidden transition-all ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className={`p-4 flex justify-between items-center cursor-pointer ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-50'}`} onClick={() => setExpandedBatchId(expandedBatchId === b.id ? null : b.id)}>
                    <div className="flex items-center gap-3"><FolderOpen className="text-blue-500" size={24} /><div><h3 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-slate-800'}`}>{b.name}</h3><p className="text-xs opacity-50">{(b.items || []).length} Productos adentro</p></div></div>
                    <div className="flex items-center gap-4">{expandedBatchId === b.id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}</div>
                  </div>
                  {expandedBatchId === b.id && (
                    <div className={`p-4 border-t ${darkMode ? 'border-slate-700 bg-slate-900/50' : 'border-slate-100 bg-slate-50'}`}>
                      <div className="mb-6 p-4 rounded-lg border border-dashed border-slate-400/50">
                        <h4 className="text-sm font-bold uppercase mb-3 flex items-center gap-2"><Box size={14}/> Agregar Producto a "{b.name}"</h4>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                          <div className="md:col-span-2"><Input darkMode={darkMode} label="Producto" placeholder="Ej: ElfBar" value={newItem.product} onChange={e => setNewItem({...newItem, product: e.target.value})} /></div>
                          <div><Input darkMode={darkMode} label="Variante" placeholder="Ej: Mint" value={newItem.variant} onChange={e => setNewItem({...newItem, variant: e.target.value})} /></div>
                          <div><Input darkMode={darkMode} label="Costo Un. ($)" type="number" value={newItem.costArs} onChange={e => setNewItem({...newItem, costArs: e.target.value})} /></div>
                          <div><Input darkMode={darkMode} label="Cantidad" type="number" value={newItem.initialStock} onChange={e => setNewItem({...newItem, initialStock: e.target.value})} /></div>
                          <div className="md:col-span-5"><Button darkMode={darkMode} onClick={() => handleAddItemToBatch(b.id)} className="w-full text-xs h-9">Agregar a Carpeta</Button></div>
                        </div>
                      </div>
                      <table className="w-full text-left text-sm">
                        <thead className={`text-xs uppercase opacity-50 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}><tr><th className="pb-2">Producto</th><th className="pb-2">Costo</th><th className="pb-2">Stock</th><th className="pb-2 text-right">Acción</th></tr></thead>
                        <tbody className="divide-y divide-slate-700/20">
                          {(b.items || []).map((item, idx) => (
                            <tr key={idx} className="hover:opacity-80">
                              <td className="py-3 font-medium">{item.product} <span className="opacity-60 text-xs ml-1">{item.variant}</span></td>
                              <td className="py-3 font-mono">{formatMoney(item.costArs)}</td>
                              <td className="py-3"><span className={`font-bold px-2 py-0.5 rounded text-xs ${item.currentStock === 0 ? 'bg-red-500/20 text-red-500' : 'bg-emerald-500/20 text-emerald-500'}`}>{item.currentStock} / {item.initialStock}</span></td>
                              <td className="py-3 text-right">
                                <button onClick={() => handleDeleteItemFromBatch(b.id, item.id)} className="text-slate-400 hover:text-red-500 transition-colors p-1" title="Eliminar este producto"><Trash2 size={14} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-4 pt-4 border-t border-slate-700/20 flex justify-end"><button onClick={(e) => { e.stopPropagation(); handleDeleteBatch(b.id); }} className="text-xs text-red-500 hover:underline flex items-center gap-1"><Trash2 size={12}/> Eliminar Carpeta Completa</button></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'sales' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
            <Card className="lg:col-span-1 border-t-4 border-t-emerald-500 h-fit" darkMode={darkMode}>
                <h2 className="text-lg font-bold mb-4">Nueva Venta</h2>
                <div className="space-y-4">
                  <div className="bg-amber-50/50 p-2 rounded border border-amber-100/20">
                      <Input darkMode={darkMode} label="Fecha" type="date" value={newSale.saleDate} onChange={e => setNewSale({...newSale, saleDate: e.target.value})} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={`text-xs font-bold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>1. Seleccionar Carpeta</label>
                    <select className={`border rounded-lg p-2.5 w-full outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`} value={newSale.batchId} onChange={e => setNewSale({...newSale, batchId: e.target.value, itemId: ''})}>
                        <option value="">-- Elegir Carpeta --</option>
                        {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  {newSale.batchId && (
                    <div className="flex flex-col gap-1.5 animate-in fade-in">
                      <label className={`text-xs font-bold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>2. Seleccionar Producto</label>
                      <select className={`border rounded-lg p-2.5 w-full outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200'}`} value={newSale.itemId} onChange={e => setNewSale({...newSale, itemId: e.target.value})}>
                          <option value="">-- Elegir Producto --</option>
                          {batches.find(b => b.id === newSale.batchId)?.items?.map(item => (
                              <option key={item.id} value={item.id} disabled={item.currentStock <= 0}>
                                  {item.product} {item.variant} - (Stock: {item.currentStock})
                              </option>
                          ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2"><Input darkMode={darkMode} label="Cantidad" type="number" value={newSale.quantity} onChange={e => setNewSale({...newSale, quantity: e.target.value})} /></div>
                  <Input darkMode={darkMode} label="Precio Venta Unitario ($)" type="number" value={newSale.unitPrice} onChange={e => setNewSale({...newSale, unitPrice: e.target.value})} />
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
                      <thead className={darkMode ? 'bg-slate-900 text-slate-500' : 'bg-slate-50 text-slate-400'}>
                        <tr><th className="p-3">Fecha</th><th className="p-3">Detalle</th><th className="p-3 text-emerald-500">Ganancia</th><th className="p-3">Total ($)</th><th className="p-3"></th></tr>
                      </thead>
                      <tbody className={`divide-y ${darkMode ? 'divide-slate-700 text-slate-300' : 'divide-slate-100'}`}>
                        {sales.map(s => {
                          const itemProfit = s.totalSaleRaw - ((s.costArsAtSale || 0) * s.quantity);
                          return (
                            <tr key={s.id} className="hover:opacity-80">
                              <td className="p-3 text-xs opacity-70">{new Date(s.date).toLocaleDateString()}</td>
                              <td className="p-3">
                                <div className="font-bold">{s.quantity} x {s.productName} {s.variant}</div>
                                <div className="text-[10px] bg-blue-500/20 text-blue-500 inline-block px-1 rounded mt-1">{s.batchName}</div>
                              </td>
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
                        {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>
            </Card>

            {batchAnalysis && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-bottom-4">
                    <Card className="bg-slate-800 text-white border-none relative overflow-hidden">
                        <div className="relative z-10">
                            <div className="text-slate-400 text-xs font-bold uppercase">Progreso de Venta</div>
                            <div className="text-3xl font-black mt-1">{Math.round(batchAnalysis.progress)}%</div>
                            <div className="w-full bg-slate-700 h-2 mt-2 rounded-full overflow-hidden">
                                <div className="bg-blue-500 h-full transition-all duration-1000" style={{width: `${batchAnalysis.progress}%`}}></div>
                            </div>
                            <div className="text-xs text-right mt-1 text-blue-400">{batchAnalysis.itemsSold} items vendidos</div>
                        </div>
                    </Card>

                    <Card darkMode={darkMode}>
                        <div className="text-xs font-bold uppercase opacity-50">Inversión Total</div>
                        <div className="text-2xl font-bold text-red-500">{formatMoney(batchAnalysis.totalInvestment)}</div>
                        <div className="text-xs opacity-50 mt-1">Costo de todos los productos</div>
                    </Card>

                    <Card darkMode={darkMode}>
                        <div className="text-xs font-bold uppercase opacity-50">Ventas Totales</div>
                        <div className="text-2xl font-bold text-blue-500">{formatMoney(batchAnalysis.totalRevenue)}</div>
                        <div className="text-xs opacity-50 mt-1">Ingresos de esta carpeta</div>
                    </Card>

                    <Card className={`border-t-4 ${batchAnalysis.currentProfit > 0 ? 'border-t-emerald-500' : 'border-t-orange-500'}`} darkMode={darkMode}>
                        <div className="text-xs font-bold uppercase opacity-50">Resultado</div>
                        <div className={`text-3xl font-black ${batchAnalysis.currentProfit > 0 ? 'text-emerald-500' : 'text-orange-500'}`}>{formatMoney(batchAnalysis.currentProfit)}</div>
                        <div className="text-xs opacity-50 mt-1">
                            {batchAnalysis.currentProfit > 0 ? '¡Ganancia Neta!' : 'Falta recuperar inversión'}
                        </div>
                    </Card>
                </div>
            )}
            {!selectedBatchStats && <div className="text-center opacity-30 py-10">Selecciona un lote arriba para ver sus números</div>}
          </div>
        )}

        {activeTab === 'expenses' && (
            <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in">
            <Card darkMode={darkMode}>
                <h2 className="text-lg font-bold mb-4">Registrar Gasto</h2>
                <div className="flex gap-3 items-end">
                <div className="flex-1"><Input darkMode={darkMode} label="Descripción" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} /></div>
                <div className="w-32"><Input darkMode={darkMode} label="Monto ($)" type="number" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})} /></div>
                <Button darkMode={darkMode} onClick={handleAddExpense} variant="danger">Restar</Button>
                </div>
            </Card>
            <div className={`rounded-xl shadow border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-100'}`}>
                {expenses.map(e => (
                <div key={e.id} className={`flex justify-between items-center p-4 border-b ${darkMode ? 'border-slate-700 hover:bg-slate-700' : 'border-slate-100 hover:bg-slate-50'}`}>
                    <span>{e.description} <span className="text-xs text-slate-500 ml-2">{new Date(e.date).toLocaleDateString()}</span></span>
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