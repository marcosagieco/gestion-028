// Pedidos programados para otro día. Un cliente puede encargar hoy algo que sale dentro de una
// semana: el pedido se arma cuando se puede, pero la venta tiene que contar el día en que SALE, no el
// día en que se cargó o se empaquetó. Para eso el pedido guarda `programadoPara` ('AAAA-MM-DD', hora
// local) y:
// (Es un campo aparte de `fechaSalida`/`horaSalida`/`tandaSalida`, que los pone el bot para los
// turnos de reparto y el seguimiento al cliente: esos pedidos siguen en la cola como siempre.)
//  - mientras esa fecha sea futura, sale de Pendiente / Armado / el recorrido de reparto y queda
//    en la pestaña "Programados" de /pedidos, para que no esté colgado en la cola de todos los días;
//  - el día que llega, vuelve solo a su lugar de siempre;
//  - al anotar la venta, el formulario arranca con esa fecha en vez de la fecha de subida.

export const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const esFechaValida = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f);

// true si el pedido tiene una fecha de salida posterior a hoy (las fechas AAAA-MM-DD se comparan bien
// como texto).
export const esProgramado = (p, hoy = hoyLocal()) => esFechaValida(p?.programadoPara) && p.programadoPara > hoy;

// "jue 26/11" para mostrar en las tarjetas.
export const fechaSalidaCorta = (f) => {
  if (!esFechaValida(f)) return '';
  const [y, m, d] = f.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  const dia = fecha.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '');
  return `${dia} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
};
