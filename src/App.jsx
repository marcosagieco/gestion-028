const TABS = [
      { id: 'home', icon: Activity, label: 'Inicio' }, 
      { id: 'sales', icon: ShoppingCart, label: 'Ventas' }, 
      { id: 'batches', icon: FolderOpen, label: 'Lotes' }, 
      { id: 'analysis', icon: BarChart3, label: 'Análisis' }, 
      { id: 'expenses', icon: Wallet, label: 'Gastos' }
  ];

  return (
    <div className={`flex h-screen overflow-hidden font-sans transition-colors duration-300 ${darkMode ? 'bg-[#0B0F19] text-zinc-100' : 'bg-slate-50 text-zinc-900'}`}>
      
      {toast && (
          <div className={`fixed bottom-24 md:bottom-8 right-4 md:right-8 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 z-50 border ${toast.type === 'error' ? 'bg-red-600/95 border-red-500 text-white' : 'bg-zinc-900/95 border-zinc-800 text-white'}`}>
             {toast.type === 'error' ? <XCircle size={18} className="text-red-200"/> : <CheckCircle size={18} className="text-emerald-400"/>}
             <span className="font-medium text-sm tracking-wide">{toast.message}</span>
          </div>
      )}

      <datalist id="products-list">{uniqueProducts.map(p => <option key={p} value={p} />)}</datalist>
      <datalist id="variants-list">{uniqueVariants.map(v => <option key={v} value={v} />)}</datalist>

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

      <main className="flex-1 overflow-y-auto relative w-full custom-scrollbar">
        
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
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <Select darkMode={darkMode} label="Canal" value={saleGeneral.source} onChange={e => setSaleGeneral({...saleGeneral, source: e.target.value})} options={[{value:'Instagram', label:'Instagram'}, {value:'Whatsapp', label:'Whatsapp'}, {value:'Personal', label:'Personal'}, {value:'Web', label:'Web'}]} />
                                    <Select darkMode={darkMode} label="Tipo" value={saleGeneral.isReseller} onChange={e => setSaleGeneral({...saleGeneral, isReseller: e.target.value})} options={[{value:'No', label:'Consumidor'}, {value:'Si', label:'Revendedor'}]} />
                                    <Select darkMode={darkMode} label="Historial" value={saleGeneral.isNewClient} onChange={e => setSaleGeneral({...saleGeneral, isNewClient: e.target.value})} options={[{value:'No', label:'Frecuente'}, {value:'Si', label:'Nuevo'}]} />
                                </div>
                                
                                <hr className={`border-dashed ${darkMode ? 'border-zinc-800' : 'border-zinc-200'}`} />

                                <div className="space-y-4">
                                    {saleItems.map((item, index) => (
                                        <div key={item.id} className={`p-4 rounded-xl border relative ${darkMode ? 'bg-[#0f1115] border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
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

                                <hr className={`border-dashed ${darkMode ? 'border-zinc-800' : 'border-zinc-200'}`} />

                                <div className={`p-3 rounded-lg border grid grid-cols-2 gap-3 ${darkMode ? 'bg-[#0a0c10] border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                                    <Input darkMode={darkMode} label="Costo Envío" type="number" symbol="$" value={saleGeneral.shippingCost} onChange={e => setSaleGeneral({...saleGeneral, shippingCost: e.target.value})} />
                                    <Input darkMode={darkMode} label="Cobro Envío" type="number" symbol="$" value={saleGeneral.shippingPrice} onChange={e => setSaleGeneral({...saleGeneral, shippingPrice: e.target.value})} />
                                </div>

                                <Button darkMode={darkMode} onClick={handleAddSale} className="w-full mt-4 h-12 text-base shadow-lg shadow-indigo-600/30">Procesar Venta</Button>
                            </div>
                        </Card>
                    </div>
                </div>

                {/* Columna Derecha: Historial Agrupado */}
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
                            {groupedSales.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-sm font-medium opacity-50 italic">No se encontraron ventas con esos filtros.</td></tr>}
                            {groupedSales.map(group => (
                                <tr key={group.ticketId} className={`transition-colors group ${darkMode ? 'hover:bg-[#131824]' : 'hover:bg-zinc-50'}`}>
                                  <td className={`px-4 py-3 text-xs font-medium whitespace-nowrap align-top pt-4 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                      {safeDateStr(group.date, {month:'short', day:'numeric'})}
                                      <div className="flex flex-col gap-1 mt-1.5 items-start">
                                          {group.isNewClient === 'Si' && <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${darkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-100 text-amber-600'}`}>Nuevo</span>}
                                          {group.isReseller && <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${darkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-100 text-indigo-600'}`}>Revendedor</span>}
                                      </div>
                                  </td>
                                  <td className="px-4 py-3">
                                      <div className="flex flex-col gap-2 mt-1">
                                          {group.items.map((item, idx) => (
                                              <div key={idx} className="flex flex-col">
                                                  <div className="font-semibold text-sm">{item.quantity || 0}x {item.productName || 'Sin nombre'} <span className="font-normal opacity-70 ml-1">{item.variant || ''}</span></div>
                                                  <div className={`text-[10px] font-medium mt-0.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Lote: {item.batchName || 'S/N'}</div>
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
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* --- PESTAÑA LOTES (CON BOTÓN DE EDICIÓN DE LOTE, ITEMS Y CASCADA) --- */}
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
                    <Card key={b.id} darkMode={darkMode} className={`p-0 overflow-hidden transition-all duration-300 group ${expandedBatchId === b.id ? 'ring-2 ring-indigo-500/50 border-transparent' : ''}`}>
                      <div className={`p-5 flex justify-between items-center cursor-pointer transition-colors ${darkMode ? 'hover:bg-[#1a1f2e]' : 'hover:bg-zinc-50'}`} onClick={() => setExpandedBatchId(expandedBatchId === b.id ? null : b.id)}>
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
                                            className={`px-2 py-1 text-sm border rounded outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#0a0c10] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`}
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
                              {(b.items || []).map((item, idx) => {
                                const isEditing = editingItem?.id === item.id;
                                return (
                                <tr key={item.id} className={`transition-colors group/item ${darkMode ? 'hover:bg-[#131824]' : 'hover:bg-white'}`}>
                                  {isEditing ? (
                                      <>
                                          <td className="px-5 py-3">
                                              <input className={`w-full p-1.5 mb-1 text-sm border rounded outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#0a0c10] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`} value={editingItem.product} onChange={e => setEditingItem({...editingItem, product: e.target.value})} placeholder="Producto"/>
                                              <input className={`w-full p-1.5 text-xs border rounded outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#0a0c10] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`} value={editingItem.variant} onChange={e => setEditingItem({...editingItem, variant: e.target.value})} placeholder="Variante"/>
                                          </td>
                                          <td className="px-5 py-3">
                                              <input type="number" className={`w-20 p-1.5 text-sm border rounded outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#0a0c10] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`} value={editingItem.costArs} onChange={e => setEditingItem({...editingItem, costArs: e.target.value})} />
                                          </td>
                                          <td className="px-5 py-3">
                                              <input type="number" className={`w-16 p-1.5 text-sm border rounded outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#0a0c10] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`} value={editingItem.initialStock} onChange={e => setEditingItem({...editingItem, initialStock: e.target.value})} title="Editar stock total comprado"/>
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
  const [newExpense, setNewExpense] = useState({ description: '', amount: '', batchId: '', date: getTodayDate() });
  
  const [editingItem, setEditingItem] = useState(null);
  
  // NUEVO ESTADO PARA EDITAR EL NOMBRE DEL LOTE
  const [editingBatchId, setEditingBatchId] = useState(null);
  const [editingBatchName, setEditingBatchName] = useState('');

  const [selectedBatchStats, setSelectedBatchStats] = useState(null);
  const [hiddenSuggestions, setHiddenSuggestions] = useState({ products: [], variants: [] });

  const [salesSearch, setSalesSearch] = useState('');
  const [salesSort, setSalesSort] = useState({ key: 'createdAt', direction: 'desc' });

  const [saleGeneral, setSaleGeneral] = useState({ saleDate: getTodayDate(), shippingCost: '', shippingPrice: '', source: 'Instagram', isReseller: 'No', isNewClient: 'No' });
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

  const processedSales = useMemo(() => {
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
          items: [],
          originalSales: []
        };
        result.push(map[key]); 
      }
      map[key].items.push({
        quantity: s.quantity,
        productName: s.productName,
        variant: s.variant,
        batchName: s.batchName,
        unitPrice: s.unitPrice
      });
      map[key].totalSaleRaw += (s.totalSaleRaw || 0);
      map[key].totalProfit += ((s.totalSaleRaw || 0) - ((s.costArsAtSale || 0) * (s.quantity || 0)));
      map[key].originalSales.push(s);
    });
    return result;
  }, [processedSales]);

  const toggleSort = (key) => {
    setSalesSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleExportSales = () => {
      const headers = ['Fecha', 'Lote', 'Producto', 'Variante', 'Cantidad', 'Precio Unitario', 'Total Venta', 'Costo Unitario', 'Ganancia Envio', 'Origen', 'Revendedor', 'Cliente Nuevo'];
      const rows = processedSales.map(s => [
          safeDateStr(s.date), s.batchName || '', s.productName || '', s.variant || '', 
          s.quantity || 0, s.unitPrice || 0, s.totalSaleRaw || 0, s.costArsAtSale || 0, 
          ((s.totalSaleRaw || 0) - ((s.unitPrice || 0) * (s.quantity || 0))), s.source || '', s.isReseller ? 'Si' : 'No', s.isNewClient ? 'Si' : 'No'
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

  // NUEVA FUNCIÓN: Guardar edición del Nombre de Lote (CASCADA)
  const handleSaveEditBatchName = async (batchId) => {
    if (!editingBatchName.trim()) return showToast("El nombre no puede estar vacío", "error");
    try {
        await updateDoc(doc(db, 'batches', batchId), { name: editingBatchName });
        
        // Cascada a Ventas
        const salesToUpdate = sales.filter(s => s.batchId === batchId);
        for (const s of salesToUpdate) {
            await updateDoc(doc(db, 'sales', s.id), { batchName: editingBatchName });
        }
        
        // Cascada a Gastos
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

    const shippingProfit = parseFloat(saleGeneral.shippingPrice || 0) - parseFloat(saleGeneral.shippingCost || 0);
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

            const itemShippingProfit = isFirstItem ? shippingProfit : 0;
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
                isNewClient: saleGeneral.isNewClient === 'Si' // AGREGADO AL GUARDAR
            };

            await addDoc(collection(db, 'sales'), saleData);

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

        showToast(`Pedido registrado. Ingreso total: ${formatMoney(totalCashIn)}`, 'success');
        
        setSaleGeneral({ ...saleGeneral, shippingCost: '', shippingPrice: '' });
        setSaleItems([{ id: Date.now(), batchId: '', itemId: '', quantity: 1, unitPrice: '' }]);

    } catch (e) {
        showToast('Error al guardar: ' + e.message, 'error');
    }
  };

  const handleDeleteTicket = async (group) => {
    if (!window.confirm(`¿Anular pedido completo (${group.items.length} productos)? Se devolverá el stock.`)) return;
    try {
      for (const sale of group.originalSales) {
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
      }
      showToast("Pedido anulado correctamente", 'success');
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
      
      {toast && (
          <div className={`fixed bottom-24 md:bottom-8 right-4 md:right-8 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 z-50 border ${toast.type === 'error' ? 'bg-red-600/95 border-red-500 text-white' : 'bg-zinc-900/95 border-zinc-800 text-white'}`}>
             {toast.type === 'error' ? <XCircle size={18} className="text-red-200"/> : <CheckCircle size={18} className="text-emerald-400"/>}
             <span className="font-medium text-sm tracking-wide">{toast.message}</span>
          </div>
      )}

      <datalist id="products-list">{uniqueProducts.map(p => <option key={p} value={p} />)}</datalist>
      <datalist id="variants-list">{uniqueVariants.map(v => <option key={v} value={v} />)}</datalist>

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

      <main className="flex-1 overflow-y-auto relative w-full custom-scrollbar">
        
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
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <Select darkMode={darkMode} label="Canal" value={saleGeneral.source} onChange={e => setSaleGeneral({...saleGeneral, source: e.target.value})} options={[{value:'Instagram', label:'Instagram'}, {value:'Whatsapp', label:'Whatsapp'}, {value:'Personal', label:'Personal'}, {value:'Web', label:'Web'}]} />
                                    <Select darkMode={darkMode} label="Tipo" value={saleGeneral.isReseller} onChange={e => setSaleGeneral({...saleGeneral, isReseller: e.target.value})} options={[{value:'No', label:'Consumidor'}, {value:'Si', label:'Revendedor'}]} />
                                    <Select darkMode={darkMode} label="Historial" value={saleGeneral.isNewClient} onChange={e => setSaleGeneral({...saleGeneral, isNewClient: e.target.value})} options={[{value:'No', label:'Frecuente'}, {value:'Si', label:'Nuevo'}]} />
                                </div>
                                
                                <hr className={`border-dashed ${darkMode ? 'border-zinc-800' : 'border-zinc-200'}`} />

                                <div className="space-y-4">
                                    {saleItems.map((item, index) => (
                                        <div key={item.id} className={`p-4 rounded-xl border relative ${darkMode ? 'bg-[#0f1115] border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
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

                                <hr className={`border-dashed ${darkMode ? 'border-zinc-800' : 'border-zinc-200'}`} />

                                <div className={`p-3 rounded-lg border grid grid-cols-2 gap-3 ${darkMode ? 'bg-[#0a0c10] border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                                    <Input darkMode={darkMode} label="Costo Envío" type="number" symbol="$" value={saleGeneral.shippingCost} onChange={e => setSaleGeneral({...saleGeneral, shippingCost: e.target.value})} />
                                    <Input darkMode={darkMode} label="Cobro Envío" type="number" symbol="$" value={saleGeneral.shippingPrice} onChange={e => setSaleGeneral({...saleGeneral, shippingPrice: e.target.value})} />
                                </div>

                                <Button darkMode={darkMode} onClick={handleAddSale} className="w-full mt-4 h-12 text-base shadow-lg shadow-indigo-600/30">Procesar Venta</Button>
                            </div>
                        </Card>
                    </div>
                </div>

                {/* Columna Derecha: Historial Agrupado */}
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
                            {groupedSales.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-sm font-medium opacity-50 italic">No se encontraron ventas con esos filtros.</td></tr>}
                            {groupedSales.map(group => (
                                <tr key={group.ticketId} className={`transition-colors group ${darkMode ? 'hover:bg-[#131824]' : 'hover:bg-zinc-50'}`}>
                                  <td className={`px-4 py-3 text-xs font-medium whitespace-nowrap align-top pt-4 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                      {safeDateStr(group.date, {month:'short', day:'numeric'})}
                                      <div className="flex flex-col gap-1 mt-1.5 items-start">
                                          {group.isNewClient === 'Si' && <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${darkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-100 text-amber-600'}`}>Nuevo</span>}
                                          {group.isReseller && <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${darkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-100 text-indigo-600'}`}>Revendedor</span>}
                                      </div>
                                  </td>
                                  <td className="px-4 py-3">
                                      <div className="flex flex-col gap-2 mt-1">
                                          {group.items.map((item, idx) => (
                                              <div key={idx} className="flex flex-col">
                                                  <div className="font-semibold text-sm">{item.quantity || 0}x {item.productName || 'Sin nombre'} <span className="font-normal opacity-70 ml-1">{item.variant || ''}</span></div>
                                                  <div className={`text-[10px] font-medium mt-0.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Lote: {item.batchName || 'S/N'}</div>
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
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* --- PESTAÑA LOTES (CON BOTÓN DE EDICIÓN DE LOTE, ITEMS Y CASCADA) --- */}
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
                    <Card key={b.id} darkMode={darkMode} className={`p-0 overflow-hidden transition-all duration-300 group ${expandedBatchId === b.id ? 'ring-2 ring-indigo-500/50 border-transparent' : ''}`}>
                      <div className={`p-5 flex justify-between items-center cursor-pointer transition-colors ${darkMode ? 'hover:bg-[#1a1f2e]' : 'hover:bg-zinc-50'}`} onClick={() => setExpandedBatchId(expandedBatchId === b.id ? null : b.id)}>
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
                                            className={`px-2 py-1 text-sm border rounded outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#0a0c10] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`}
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
                              {(b.items || []).map((item, idx) => {
                                const isEditing = editingItem?.id === item.id;
                                return (
                                <tr key={item.id} className={`transition-colors group/item ${darkMode ? 'hover:bg-[#131824]' : 'hover:bg-white'}`}>
                                  {isEditing ? (
                                      <>
                                          <td className="px-5 py-3">
                                              <input className={`w-full p-1.5 mb-1 text-sm border rounded outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#0a0c10] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`} value={editingItem.product} onChange={e => setEditingItem({...editingItem, product: e.target.value})} placeholder="Producto"/>
                                              <input className={`w-full p-1.5 text-xs border rounded outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#0a0c10] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`} value={editingItem.variant} onChange={e => setEditingItem({...editingItem, variant: e.target.value})} placeholder="Variante"/>
                                          </td>
                                          <td className="px-5 py-3">
                                              <input type="number" className={`w-20 p-1.5 text-sm border rounded outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#0a0c10] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`} value={editingItem.costArs} onChange={e => setEditingItem({...editingItem, costArs: e.target.value})} />
                                          </td>
                                          <td className="px-5 py-3">
                                              <input type="number" className={`w-16 p-1.5 text-sm border rounded outline-none focus:border-indigo-500 ${darkMode ? 'bg-[#0a0c10] border-zinc-700 text-white' : 'bg-white border-zinc-300 text-black'}`} value={editingItem.initialStock} onChange={e => setEditingItem({...editingItem, initialStock: e.target.value})} title="Editar stock total comprado"/>
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