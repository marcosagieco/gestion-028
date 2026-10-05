import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// Lazy load para separar el chunk de FacturasPage/PedidosPage/Reparto del de App.
// Evita que la inicialización de Firebase de todos ellos se ejecute
// al mismo tiempo y se pise en el bundle de producción.
const FacturasPage = lazy(() => import('./FacturasPage.jsx'))
const PedidosPage = lazy(() => import('./PedidosPage.jsx'))
const RepartoDeposito = lazy(() => import('./RepartoDeposito.jsx'))
const RepartoMoto = lazy(() => import('./RepartoMoto.jsx'))
const OperativoPage = lazy(() => import('./OperativoPage.jsx'))
const CotizarUberPage = lazy(() => import('./CotizarUberPage.jsx'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/facturas" element={
          <Suspense fallback={null}>
            <FacturasPage />
          </Suspense>
        } />
        <Route path="/pedidos" element={
          <Suspense fallback={null}>
            <PedidosPage />
          </Suspense>
        } />
        <Route path="/pedidos/reparto" element={
          <Suspense fallback={null}>
            <RepartoDeposito />
          </Suspense>
        } />
        {/* Una pantalla por motomensajero. Norman se queda con /reparto, el link que ya tiene
            guardado en el celular; Nico entra por /reparto/nico. Es el mismo componente: cada uno
            ve solo sus paradas y maneja su propio recorrido (ver reparto/repartidores.js). */}
        <Route path="/reparto" element={
          <Suspense fallback={null}>
            <RepartoMoto repartidor="norman" />
          </Suspense>
        } />
        <Route path="/reparto/nico" element={
          <Suspense fallback={null}>
            <RepartoMoto repartidor="nico" />
          </Suspense>
        } />
        <Route path="/operativo" element={
          <Suspense fallback={null}>
            <OperativoPage />
          </Suspense>
        } />
        <Route path="/cotizar-uber" element={
          <Suspense fallback={null}>
            <CotizarUberPage />
          </Suspense>
        } />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
