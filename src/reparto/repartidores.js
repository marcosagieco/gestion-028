// Los dos motomensajeros que reparten en moto, cada uno con su salida y su propia pantalla.
//
// Antes había uno solo y todo el reparto vivía en documentos únicos y compartidos
// (recorridos/activo, recorridos/repartidor): un solo "está en la calle", una sola parada fija, una
// sola deuda. Con dos repartidores eso no alcanza: si Nico entrega algo, no tiene que moverse el
// recorrido de Norman. Así que cada uno tiene sus propios documentos, y cada pedido de moto dice de
// quién es (campo `repartidor`).
//
// Norman se queda con los documentos y el link de siempre (`/reparto`, recorridos/activo) a
// propósito: ya tiene esa página abierta en el celular y los pedidos que están en la calle ahora
// mismo son suyos. Nico es el que estrena documentos nuevos. Por eso tampoco hace falta migrar
// nada: un pedido sin el campo `repartidor` es de Norman, que es como venía funcionando.

export const REPARTIDORES = [
  {
    id: 'norman',
    nombre: 'Norman',
    salida: '15:30',
    ruta: '/reparto',
    // Documentos de Firestore. Los de Norman son los que ya existían, sin sufijo.
    docRecorrido: 'activo',
    docEstado: 'repartidor',
    docLock: 'lockRecalculo',
    docUltimoPago: 'normanPagos',
    color: '#6366f1',
  },
  {
    id: 'nico',
    nombre: 'Nico',
    salida: '18:30',
    ruta: '/reparto/nico',
    docRecorrido: 'activo_nico',
    docEstado: 'repartidor_nico',
    docLock: 'lockRecalculo_nico',
    docUltimoPago: 'nicoPagos',
    color: '#0ea5e9',
  },
];

// A quién le toca un pedido que nadie asignó todavía: al primero que sale. Es la misma cuenta que
// corría antes de que existiera el segundo repartidor, así que ningún pedido viejo cambia de dueño.
export const REPARTIDOR_DEFAULT = 'norman';

export const REPARTIDORES_POR_ID = Object.fromEntries(REPARTIDORES.map(r => [r.id, r]));

// De quién es este pedido. Un pedido sin el campo (los de antes de esto, y los que entran por el
// bot o por /pedidos sin que nadie elija) es del repartidor por defecto.
export const repartidorDe = (pedido) =>
  REPARTIDORES_POR_ID[pedido?.repartidor] ? pedido.repartidor : REPARTIDOR_DEFAULT;

export const esDelRepartidor = (pedido, repartidorId) => repartidorDe(pedido) === repartidorId;

export const repartidorConfig = (repartidorId) =>
  REPARTIDORES_POR_ID[repartidorId] || REPARTIDORES_POR_ID[REPARTIDOR_DEFAULT];

// Nombre para mostrar, con la hora de salida — se usa en los títulos y en los carteles del panel.
export const nombreRepartidor = (repartidorId) => repartidorConfig(repartidorId).nombre;
export const nombreConSalida = (repartidorId) => {
  const r = repartidorConfig(repartidorId);
  return `${r.nombre} (${r.salida})`;
};

// El otro — para el botón "pasar a ..." del panel del depósito. Con dos repartidores es el que no
// es este; si algún día son tres, esto devuelve la lista de los demás.
export const otrosRepartidores = (repartidorId) => REPARTIDORES.filter(r => r.id !== repartidorId);
