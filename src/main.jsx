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
        <Route path="/reparto" element={
          <Suspense fallback={null}>
            <RepartoMoto />
          </Suspense>
        } />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
