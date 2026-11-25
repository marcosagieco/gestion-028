// Cobro en la entrega y cierre de caja de la moto.
//
// Al tocar "Entregado", el repartidor anota cómo pagó el cliente (uno o varios métodos, con el
// monto de cada uno) y saca la foto del comprobante. Eso queda en el pedido como `cobroEntrega`:
//   { pagos: [{ medioPago, monto }], yaPagado, fotos: [idDoc], repartidor, registradoEn }
// y el cierre de caja suma eso por día y por turno.
//
// Las fotos NO van dentro del pedido: cada una es un documento aparte en `comprobantesEntrega`
// (la imagen comprimida, como data URL). Todas las pantallas escuchan la colección `pedidos`
// entera; con fotos adentro, cada celular bajaría todas las imágenes de todos los pedidos cada vez
// que algo cambia. Aparte, solo se bajan cuando alguien toca "Ver comprobante".
// No se usa Firebase Storage porque esta pantalla es sin clave y Storage hoy solo lo escribe el bot.

// `loTieneElRepartidor`: plata que queda en manos del motomensajero y que tiene que rendir en el
// cierre de caja (el efectivo, los dólares, y lo que el cliente le transfirió a SU cuenta en vez de
// a la nuestra). Lo del alias 3 ya entró a nuestras cuentas: no lo rinde.
//
// El alias 3 es el que se usa siempre: va primero y marcado como recomendado. Los alias 1, 2 y 4 ya
// no se ofrecen; si el cliente pagó de otra forma, el repartidor elige "Otro" y lo escribe (queda en
// `detalle` del pago). "Otro" no se suma a lo que rinde la moto: se muestra para revisarlo.
export const METODOS_COBRO = [
  { id: 'alias3', label: 'Alias 3', recomendado: true, moneda: 'ARS', transferencia: true },
  { id: 'efectivo', label: 'Efectivo', moneda: 'ARS', transferencia: false, loTieneElRepartidor: true },
  { id: 'usd', label: 'Dólares', moneda: 'USD', transferencia: false, loTieneElRepartidor: true },
  { id: 'repartidor', label: 'A su cuenta', labelRepartidor: 'A mi cuenta', moneda: 'ARS', transferencia: true, loTieneElRepartidor: true },
  { id: 'otro', label: 'Otro', labelRepartidor: 'Otro (escribilo)', moneda: 'ARS', transferencia: false, conDetalle: true },
];
// Los que ya no se ofrecen, para que se lean bien los cobros que se anotaron con ellos.
const METODOS_VIEJOS = ['alias1', 'alias2', 'alias4'].map(id => ({ id, label: `Alias ${id.slice(-1)}`, moneda: 'ARS', transferencia: true }));
export const METODO_POR_ID = Object.fromEntries([...METODOS_COBRO, ...METODOS_VIEJOS].map(m => [m.id, m]));
export const labelMetodo = (id) => METODO_POR_ID[id]?.label || id;
// Cómo se lee un pago anotado: "Otro" muestra lo que escribió el repartidor.
export const labelPago = (pg) => pg?.medioPago === 'otro' ? (pg.detalle ? `Otro: ${pg.detalle}` : 'Otro') : labelMetodo(pg?.medioPago);

export const formatARS = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);
export const formatUSD = (n) => `US$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n || 0)}`;
export const formatMonto = (monto, medioPago) => METODO_POR_ID[medioPago]?.moneda === 'USD' ? formatUSD(monto) : formatARS(monto);

// Lo que pagó el cliente en total, en cada moneda.
export const totalesDeCobro = (cobro) => {
  const t = { ARS: 0, USD: 0 };
  (cobro?.pagos || []).forEach(p => { t[METODO_POR_ID[p.medioPago]?.moneda || 'ARS'] += Number(p.monto) || 0; });
  return t;
};

// Lo que hay que cobrar al entregar, según lo que se arregló con el bot (si se sabe).
//  - transferencia con comprobante: ya está pagado.
//  - mitad y mitad: la mitad ya se transfirió, se cobra el resto.
export const aCobrarDe = (pedido) => {
  const total = typeof pedido?.total === 'number' ? pedido.total : null;
  if (total == null) return { total: null, aCobrar: null, yaPagado: false, nota: null };
  if (pedido.medioPago === 'transferencia' && pedido.comprobante) {
    return { total, aCobrar: 0, yaPagado: true, nota: 'Ya pagó por transferencia antes del envío.' };
  }
  if (pedido.medioPago === 'mitad y mitad' && pedido.aTransferir > 0) {
    return { total, aCobrar: Math.max(0, total - pedido.aTransferir), yaPagado: false, nota: `Ya transfirió la mitad (${formatARS(pedido.aTransferir)}).` };
  }
  return { total, aCobrar: total, yaPagado: false, nota: pedido.medioPago ? `Le dijo al bot: ${pedido.medioPago}.` : null };
};

// Comprime la foto en el celular: lado mayor 1400px, JPEG. Baja la calidad hasta que quede por
// debajo de ~700 KB (un documento de Firestore admite 1 MB).
export async function comprimirFoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('No se pudo leer la foto. Probá sacarla de nuevo.'));
      i.src = url;
    });
    let lado = 1400;
    for (let intento = 0; intento < 6; intento++) {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const calidad = [0.7, 0.6, 0.5, 0.5, 0.45, 0.4][intento];
      const data = canvas.toDataURL('image/jpeg', calidad);
      if (data.length < 700_000) return data;
      lado = Math.round(lado * 0.8);
    }
    throw new Error('La foto es demasiado pesada.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Día local AAAA-MM-DD de una fecha ISO (para agrupar el cierre por día).
export const diaLocal = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
