// Los tres repartos en moto del día (tarde, tarde-noche y noche), cada uno con su salida y su propia
// pantalla. Cada uno corresponde a una salida del bot (`tanda`): primera, segunda y tercera — la
// tercera (noche) se prende y se apaga desde /operativo (settings/operativo.salidaExtraMoto).
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
// Cada uno tiene su propio link, nombrado por el turno (/reparto-tarde, /reparto-tarde-noche y
// /reparto-noche). Hasta el 23/11 había dos: el de las 18:30 usaba /reparto-noche; desde ahí ese
// reparto (moto2, mismos documentos) es el de la tarde-noche y /reparto-noche pasa a ser el nuevo
// de las 20:00 (moto3). Se nombran así porque: se
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
    nombre: 'Tarde',
    salida: '15:00',
    tanda: 'primera',
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
    nombre: 'Tarde-noche',
    salida: '17:00',
    tanda: 'segunda',
    ruta: '/reparto-tarde-noche',
    docRecorrido: 'activo_moto2',
    docEstado: 'repartidor_moto2',
    docLock: 'lockRecalculo_moto2',
    docUltimoPago: 'moto2Pagos',
    color: '#0ea5e9',
  },
  {
    id: 'moto3',
    nombre: 'Noche',
    salida: '20:00',
    tanda: 'tercera',
    ruta: '/reparto-noche',
    docRecorrido: 'activo_moto3',
    docEstado: 'repartidor_moto3',
    docLock: 'lockRecalculo_moto3',
    docUltimoPago: 'moto3Pagos',
    color: '#a855f7',
  },
];

// A cuál va un pedido que nadie asignó todavía: al primero que sale. Es la misma cuenta que corría
// antes de que existiera el segundo reparto, así que ningún pedido viejo cambia de dueño.
export const REPARTIDOR_DEFAULT = 'moto1';

export const REPARTIDORES_POR_ID = Object.fromEntries(REPARTIDORES.map(r => [r.id, r]));

// A cuál de los dos va este pedido. Uno sin el campo (los de antes de esto, y los que entran por el
// bot o por /pedidos sin que nadie elija) va al reparto por defecto.
//
// La salida de las 20:00 (tanda "tercera"): hasta que el bot se actualice la mandaba a moto2 (antes
// la noche era una sola moto). Si el pedido está en la tercera con moto2 y nadie lo eligió a mano
// (`turnoManual`), va a la moto de la noche.
export const repartidorDe = (pedido) => {
  if (pedido?.tandaSalida === 'tercera' && pedido?.repartidor === 'moto2' && !pedido?.turnoManual) return 'moto3';
  return REPARTIDORES_POR_ID[pedido?.repartidor] ? pedido.repartidor : REPARTIDOR_DEFAULT;
};

// La hora de salida de cada turno según /operativo (settings/operativo): las dos primeras en
// salidasMoto, la de la noche en salidaExtraMoto. Sin dato, la hora de la lista de arriba.
export const horaDeTurno = (operativo, repartidorId) => {
  const r = repartidorConfig(repartidorId);
  const h = r.tanda === 'tercera' ? operativo?.salidaExtraMoto?.hora : operativo?.salidasMoto?.[r.tanda];
  return /^\d{2}:\d{2}$/.test(h || '') ? h : r.salida;
};

// La moto de la noche se prende y se apaga desde /operativo. Sin dato, se toma como prendida.
export const turnoActivo = (operativo, repartidorId) =>
  repartidorConfig(repartidorId).tanda !== 'tercera' || operativo?.salidaExtraMoto?.activa !== false;

export const esDelRepartidor = (pedido, repartidorId) => repartidorDe(pedido) === repartidorId;

export const repartidorConfig = (repartidorId) =>
  REPARTIDORES_POR_ID[repartidorId] || REPARTIDORES_POR_ID[REPARTIDOR_DEFAULT];

// Nombre para mostrar — ya incluye el horario, que es justamente lo que los distingue.
export const nombreRepartidor = (repartidorId) => repartidorConfig(repartidorId).nombre;
export const nombreConSalida = (repartidorId) => repartidorConfig(repartidorId).nombre;

// Los demás — para el botón "pasar a ..." del panel del depósito.
export const otrosRepartidores = (repartidorId) => REPARTIDORES.filter(r => r.id !== repartidorId);
