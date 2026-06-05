import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// Lazy load para separar el chunk de FacturasPage del de App.
// Evita que la inicialización de Firebase de ambos módulos se ejecute
// al mismo tiempo y se pise en el bundle de producción.
const FacturasPage = lazy(() => import('./FacturasPage.jsx'))

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
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
