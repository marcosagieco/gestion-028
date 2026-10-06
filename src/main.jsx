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
const LinkViejo = lazy(() => import('./reparto/LinkViejo.jsx'))

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
        {/* Una pantalla por reparto (el de las 15:30 y el de las 18:30). Es el mismo componente con
            un parámetro: cada uno ve solo sus paradas y maneja su propio recorrido — ver
            reparto/repartidores.js, donde están los dos links y por qué cada uno lleva su código. */}
        <Route path="/reparto-tarde" element={
          <Suspense fallback={null}>
            <RepartoMoto repartidor="moto1" />
          </Suspense>
        } />
        <Route path="/reparto-noche" element={
          <Suspense fallback={null}>
            <RepartoMoto repartidor="moto2" />
          </Suspense>
        } />
        {/* /reparto era el link del único motomensajero que había. Ya no muestra ningún recorrido:
            si siguiera abierto, cualquiera de los dos podría entrar y ver las paradas del otro, que
            es justo lo que se quiso evitar al separarlos. Solo avisa que hay que pedir el link. */}
        <Route path="/reparto" element={<Suspense fallback={null}><LinkViejo /></Suspense>} />
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
