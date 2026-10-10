import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LayoutGrid, Home, ClipboardList, Bot, Car, ScanBarcode, Check } from 'lucide-react';

// Las pantallas sueltas (Pedidos, Agente IA, Cotizar Uber, Escáner) son cada una autocontenida y
// hasta ahora no tenían forma de llegar a las otras: había que saberse la URL de memoria. Esto es
// el único puente entre todas. Va en la barra de arriba de cada una.
//
// Gestión 028 aparece en la lista pero sigue pidiendo la contraseña al entrar: el link lleva a la
// puerta, no la abre. Las otras cuatro siguen sin clave, como estaban.
const SECCIONES = [
  { id: 'gestion',   ruta: '/',             nombre: 'Gestión 028',  icon: Home,          nota: 'con clave' },
  { id: 'pedidos',   ruta: '/pedidos',      nombre: 'Pedidos',      icon: ClipboardList },
  { id: 'operativo', ruta: '/operativo',    nombre: 'Agente IA',    icon: Bot },
  { id: 'uber',      ruta: '/cotizar-uber', nombre: 'Cotizar Uber', icon: Car },
  { id: 'escaner',   ruta: '/escaner',      nombre: 'Escáner',      icon: ScanBarcode },
];

export default function AccesosRapidos({ dm, actual }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrarSiEsAfuera = (e) => { if (!ref.current?.contains(e.target)) setAbierto(false); };
    const cerrarConEsc = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', cerrarSiEsAfuera);
    document.addEventListener('keydown', cerrarConEsc);
    return () => {
      document.removeEventListener('mousedown', cerrarSiEsAfuera);
      document.removeEventListener('keydown', cerrarConEsc);
    };
  }, [abierto]);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button onClick={() => setAbierto(a => !a)} title="Ir a otra sección" aria-label="Ir a otra sección"
        className={`p-2.5 rounded-lg transition-colors ${abierto
          ? (dm ? 'text-zinc-200 bg-white/[0.08]' : 'text-zinc-800 bg-zinc-100')
          : (dm ? 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06]' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100')}`}>
        <LayoutGrid size={17} />
      </button>

      {abierto && (
        <div className={`absolute right-0 top-full mt-1.5 w-56 rounded-2xl border overflow-hidden z-[100] shadow-2xl ${dm ? 'bg-[#141414] border-white/[0.1]' : 'bg-white border-zinc-200'}`}>
          <p className={`px-3.5 pt-3 pb-2 text-[10px] font-black uppercase tracking-widest ${dm ? 'text-zinc-600' : 'text-zinc-400'}`}>Ir a</p>
          {SECCIONES.map(s => {
            const Icono = s.icon;
            if (s.id === actual) {
              return (
                <div key={s.id} className={`flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-bold ${dm ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  <Icono size={16} className="flex-shrink-0" />
                  <span className="flex-1 truncate">{s.nombre}</span>
                  <Check size={14} className="flex-shrink-0" />
                </div>
              );
            }
            return (
              <Link key={s.id} to={s.ruta} onClick={() => setAbierto(false)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-bold transition-colors ${dm ? 'text-zinc-200 hover:bg-white/[0.06]' : 'text-zinc-700 hover:bg-zinc-100'}`}>
                <Icono size={16} className="flex-shrink-0" />
                <span className="flex-1 truncate">{s.nombre}</span>
                {s.nota && <span className={`text-[10px] font-semibold flex-shrink-0 ${dm ? 'text-zinc-600' : 'text-zinc-400'}`}>{s.nota}</span>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
