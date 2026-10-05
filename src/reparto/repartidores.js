// Los dos repartos en moto del día, cada uno con su salida y su propia pantalla.
//
// Antes había uno solo y todo el reparto vivía en documentos únicos y compartidos
// (recorridos/activo, recorridos/repartidor): un solo "está en la calle", una sola parada fija, una
// sola deuda. Con dos repartos eso no alcanza: si uno entrega algo, no tiene que moverse el
// recorrido del otro. Así que cada uno tiene sus propios documentos, y cada pedido de moto dice a
// cuál de los dos va (campo `repartidor`).
//
// Se identifican por HORARIO, no por el nombre del motomensajero: la gente cambia y no queremos
// tener que tocar el código (ni los documentos de Firestore) cada vez que entra o sale alguien.
//
// Cada uno tiene su propio link, nombrado por el turno (/reparto-tarde y /reparto-noche): se
// entiende, se dicta por teléfono y se escribe de memoria, que es lo que importa — el que reparte
// lo va a tener que tipear en la calle, y un link con código raro termina en "no me acuerdo cómo
// entrar". El precio de esa simplicidad es que son adivinables entre sí: quien tenga uno puede
// llegar al otro y ver sus paradas. Si eso llega a molestar, la solución no es un link más
// enredado, es ponerle a cada pantalla una clave corta propia.
//
// El primero se queda con los documentos que ya existían (sin sufijo): así los pedidos que están en
// la calle hoy y el historial de entregas siguen donde estaban, sin migrar nada.

export const REPARTIDORES = [
  {
    id: 'moto1',
    nombre: 'Reparto 15:30',
    salida: '15:30',
    ruta: '/reparto-tarde',
    // Documentos de Firestore. Los del primero son los que ya venían usándose.
    docRecorrido: 'activo',
    docEstado: 'repartidor',
    docLock: 'lockRecalculo',
    // Este documento se llama así porque lo creó el motomensajero que había antes: ahí está
    // guardado el último pago que se registró. Se deja con ese nombre a propósito — renombrarlo
    // haría perder ese registro, y el nombre del documento no se ve en ninguna pantalla.
    docUltimoPago: 'normanPagos',
    color: '#6366f1',
  },
  {
    id: 'moto2',
    nombre: 'Reparto 18:30',
    salida: '18:30',
    ruta: '/reparto-noche',
    docRecorrido: 'activo_moto2',
    docEstado: 'repartidor_moto2',
    docLock: 'lockRecalculo_moto2',
    docUltimoPago: 'moto2Pagos',
    color: '#0ea5e9',
  },
];

// A cuál va un pedido que nadie asignó todavía: al primero que sale. Es la misma cuenta que corría
// antes de que existiera el segundo reparto, así que ningún pedido viejo cambia de dueño.
export const REPARTIDOR_DEFAULT = 'moto1';

export const REPARTIDORES_POR_ID = Object.fromEntries(REPARTIDORES.map(r => [r.id, r]));

// A cuál de los dos va este pedido. Uno sin el campo (los de antes de esto, y los que entran por el
// bot o por /pedidos sin que nadie elija) va al reparto por defecto.
export const repartidorDe = (pedido) =>
  REPARTIDORES_POR_ID[pedido?.repartidor] ? pedido.repartidor : REPARTIDOR_DEFAULT;

export const esDelRepartidor = (pedido, repartidorId) => repartidorDe(pedido) === repartidorId;

export const repartidorConfig = (repartidorId) =>
  REPARTIDORES_POR_ID[repartidorId] || REPARTIDORES_POR_ID[REPARTIDOR_DEFAULT];

// Nombre para mostrar — ya incluye el horario, que es justamente lo que los distingue.
export const nombreRepartidor = (repartidorId) => repartidorConfig(repartidorId).nombre;
export const nombreConSalida = (repartidorId) => repartidorConfig(repartidorId).nombre;

// El otro — para el botón "pasar a ..." del panel del depósito. Con dos repartos es el que no es
// este; si algún día son tres, esto devuelve la lista de los demás.
export const otrosRepartidores = (repartidorId) => REPARTIDORES.filter(r => r.id !== repartidorId);
