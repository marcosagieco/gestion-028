import { useState, useEffect } from 'react';
import { collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// Funciones y datos (sin JSX) compartidos entre /escaner (EscanerPage.jsx) y el paso de "escanear
// antes de empaquetar" en /pedidos (PedidosPage.jsx). Separado de escaneo/componentes.jsx porque
// mezclar componentes con funciones sueltas en el mismo archivo rompe el fast-refresh de Vite.
//
// Cada página sigue siendo self-contenida (su propio `db`, su propio Firebase init, como
// PedidosPage/RepartoMoto/EscanerPage) — estas funciones RECIBEN `db` por parámetro en vez de
// abrir su propia conexión, así no importa desde qué página se usen.

export const rid = () => Math.random().toString(36).slice(2, 11);

// Códigos ya aprendidos, en vivo — { [codigo]: { product, variant } }. Son pocos (unos cientos a lo
// sumo), por eso se escuchan enteros en vez de pedirlos uno por uno: así un código recién
// registrado en una pantalla se reconoce al instante en cualquier otra.
export function useCodigosBarra(db) {
  const [codigosBarra, setCodigosBarra] = useState({});
  useEffect(() => {
    if (!db) return;
    return onSnapshot(collection(db, 'codigosBarra'), snap => {
      const mapa = {};
      snap.forEach(d => { mapa[d.id] = d.data(); });
      setCodigosBarra(mapa);
    }, () => {});
  }, [db]);
  return codigosBarra;
}

// Nombres de producto/variante que ya existen en el stock real — se usan como sugerencias al
// registrar un código nuevo, para que el nombre que se carga acá coincida con el que ya usan Ventas
// y Pedidos, en vez de abrir una variación más del mismo nombre.
export function derivarProductosConocidos(batches) {
  const mapa = new Map();
  (batches || []).forEach(b => (b.items || []).forEach(it => {
    if (!it.product) return;
    if (!mapa.has(it.product)) mapa.set(it.product, new Set());
    if (it.variant && it.variant !== 'Único') mapa.get(it.product).add(it.variant);
  }));
  return Array.from(mapa.entries())
    .map(([product, vs]) => ({ product, variantes: Array.from(vs).sort() }))
    .sort((a, b) => a.product.localeCompare(b.product));
}

export async function registrarCodigoBarra(db, { codigo, product, variant }) {
  await setDoc(doc(db, 'codigosBarra', codigo), { codigo, product, variant, createdAt: new Date().toISOString() });
}

// Agrega (o suma +1 si ya estaba) un ítem a una sesión de escaneo. La misma función sirve para
// Entrada y Salida en /escaner y para el escaneo de empaquetado en /pedidos — lo único que cambia
// entre una pantalla y otra es a qué `setState` le pasan el resultado.
export function agregarAEscaneo(setSesion, { codigo, product, variant }) {
  setSesion(prev => {
    const existe = prev.find(it => it.codigo === codigo);
    if (existe) return prev.map(it => it.codigo === codigo ? { ...it, cantidad: (parseInt(it.cantidad) || 0) + 1 } : it);
    return [...prev, { uid: rid(), codigo, product, variant, cantidad: 1, costo: '' }];
  });
}
