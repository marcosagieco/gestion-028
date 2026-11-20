// Precios: cuánto salen los productos, con los combos de la lista, la lista mayorista y el descuento
// por efectivo. Nunca con un número que mande el agente.
"use strict";

const { normalizar, palabras, coincidencia, pesos } = require("./texto");
const { STOCK_DE, MINIMO_MAYORISTA, parsearProductos, parsearMayorista, precioMayorista, productoMayorista, productosEnPesos, nombresDeLaLista,
  buscarProducto, productoDeLinea, faltaStock } = require("./catalogo");

// Descuento por pagar en efectivo, medido sobre el subtotal de productos (sin el envío).
const TRAMOS_DESCUENTO_EFECTIVO = [
  { desde: 100000, off: 5000 },
  { desde: 50000, off: 2500 },
  { desde: 0, off: 1500 },
];
const descuentoEfectivo = (subtotal) => TRAMOS_DESCUENTO_EFECTIVO.find((t) => subtotal >= t.desde).off;

// Formas de pago. Uber y correo: solo transferencia antes. La moto además acepta efectivo (con
// descuento), al recibir (efectivo o transferencia cuando llega, sin comprobante) y mitad y mitad
// (mitad por transferencia antes, con comprobante, y mitad en efectivo al recibir, sin descuento).
const PAGO_LABEL = {
  transferencia: "transferencia",
  efectivo: "efectivo al recibir",
  "al recibir": "al recibir (efectivo o transferencia)",
  "mitad y mitad": "mitad transferencia antes, mitad efectivo al recibir",
};
// Lo que dijo el agente → una de las cuatro formas, o "" si no es ninguna (dólares, tarjeta, cripto).
function formaDePago(texto) {
  const t = normalizar(texto);
  if (!t || /\busdt?\b|dolar|tarjeta|cripto|crypto/.test(t)) return "";
  if (t.includes("mitad")) return "mitad y mitad";
  if (t.includes("efectivo") && !/efectivo.{0,20}\bo\b.{0,20}transfer|transfer.{0,20}\bo\b.{0,20}efectivo/.test(t)) return "efectivo";
  if (t.includes("recibir") || t.includes("contra entrega")) return "al recibir";
  if (t.includes("efectivo")) return "efectivo";
  return /transfer|alias|cbu|cvu|mercado pago/.test(t) ? "transferencia" : "";
}
const pagaAntes = (medioPago) => medioPago === "transferencia" || medioPago === "mitad y mitad";

// Importe de N unidades con los combos de la lista: el más grande que entre y después los más
// chicos. null si esa cantidad no se puede armar (ej. gummies que solo se venden de a 2).
// Con precios por unidad ("3x $17.500 c/u"), todas las unidades valen el precio del escalón más alto al
// que llega la cantidad: 4 unidades pagan el de 3 y 7, el de 5.
// Si una promo deja un escalón más barato que uno más alto de la lista (promo «2x $38.000 c/u» y lista «5x $200.000»,
// $40.000 c/u), vale el más barato: nunca se cobra más caro por llevar más.
function importePorCantidad(precios, cantidad, porUnidad = false) {
  if (porUnidad) {
    const escalones = Object.keys(precios).map(Number).filter((n) => n <= cantidad);
    if (!escalones.length) return null;
    return Math.round(Math.min(...escalones.map((n) => precios[n] / n)) * cantidad);
  }
  let resto = cantidad;
  let importe = 0;
  for (const n of Object.keys(precios).map(Number).sort((a, b) => b - a)) {
    while (resto >= n) {
      importe += precios[n];
      resto -= n;
    }
  }
  return resto === 0 ? importe : null;
}

// El aviso para un modelo que está en la lista mayorista pero no en la de precios por unidad.
const sinPrecioPorUnidad = (nombre) => `${nombre} no tiene precio por unidad cargado: por menos de ${MINIMO_MAYORISTA} unidades no se puede cotizar. `
  + `Decile al cliente que lo tenemos y derivá con motivo producto_sin_precio para que el equipo le pase el precio. Desde ${MINIMO_MAYORISTA} unidades sí tiene precio (mayorista)`;

// Cotiza los items de un pedido: [{ producto, variante, cantidad }] → líneas con importe. Controla el
// stock de cada sabor. Con `conservar`, los items ya traen su importe (un pedido que se modifica sin
// tocar los productos mantiene los precios con que se cargó).
// El precio mayorista no lo elige nadie: un modelo que llega al mínimo (por modelo o por el total, según
// el panel) y está en la lista mayorista se cobra a ese precio; el resto del pedido, a precio de lista.
// Las líneas mayoristas llevan precioUnitarioUSD.
function cotizarProductos(op, items, { conservar = false, medioPago = "", permitirSinSabor = false } = {}) {
  if (!Array.isArray(items) || !items.length || items.length > 200) throw new Error("Indicá los productos y cantidades para cotizar");
  const listas = productosEnPesos(op);
  const ofertas = parsearProductos(op.ofertasTexto);
  const listaMayorista = parsearMayorista(op.preciosMayoristaTexto);
  const dolarMayorista = Number(op.dolarMayorista);
  // Los combos valen por modelo, mezclando sabores: "2x $40.000" de EB Create es 1 Golden Berry + 1 Pink
  // Lemonade. Se suma la cantidad de cada modelo, se calcula con los combos y se reparte entre sus renglones.
  const lineas = [];
  const modelos = new Map();
  const pedidasPorSabor = new Map();
  for (const it of items) {
    const cantidad = Number(it.cantidad ?? 1);
    if (!Number.isSafeInteger(cantidad) || cantidad <= 0) throw new Error("la cantidad tiene que ser un entero positivo");
    if (conservar) {
      if (!Number.isFinite(it.importe) || it.importe < 0) throw new Error("el pedido original no tiene precios estructurados: consulta al equipo");
      if (it.precioUnitarioUSD != null && buscarProducto(listaMayorista, it.producto)?.producto?.prepago && medioPago !== "transferencia") throw new Error(`${it.producto} es pre pago: se abona por transferencia antes`);
      const linea = { producto: it.producto, variante: it.variante || "", cantidad, importe: it.importe };
      if (it.precioUnitarioUSD != null) linea.precioUnitarioUSD = it.precioUnitarioUSD;
      lineas.push(linea);
      continue;
    }
    // El producto sale de la lista de precios; si no está ahí, de la mayorista (un modelo que se vende por mayor
    // y todavía no tiene precio por unidad).
    // Si el nombre es ambiguo en la lista de precios ("IGNITE V400 MIX" se parece a ICE y SWEET), vale el de la
    // mayorista solo si lo nombra entero.
    const r = productoDeLinea(listas, ofertas, it);
    const enMayorista = r.error ? buscarProducto(listaMayorista, it.producto)?.producto : null;
    const soloMayorista = enMayorista && (!r.ambiguo || palabras(it.producto).every((w) => coincidencia(w, palabras(enMayorista.nombre)) > 0)) ? enMayorista : null;
    if (r.error && !soloMayorista) throw new Error(r.error);
    const producto = soloMayorista ? { ...soloMayorista, lista: "preciosVapesTexto" } : r.producto;
    const clave = `${producto.nombre}:${normalizar(it.variante)}`;
    const pedidas = (pedidasPorSabor.get(clave) || 0) + cantidad;
    pedidasPorSabor.set(clave, pedidas);
    const sinStock = STOCK_DE[producto.lista] && faltaStock(op[STOCK_DE[producto.lista]], producto.nombre, it.variante, pedidas, nombresDeLaLista(op, producto.lista));
    // Para cotizar alcanza el modelo; para cargar el pedido hace falta el sabor.
    if (sinStock && !(permitirSinSabor && !normalizar(it.variante) && sinStock.startsWith("falta el sabor"))) throw new Error(sinStock);
    const linea = { producto: String(it.producto), variante: String(it.variante || ""), cantidad, importe: 0 };
    lineas.push(linea);
    const m = modelos.get(producto.nombre)
      || { producto, precios: soloMayorista ? null : r.precios, cantidad: 0, lineas: [],
        mayorista: soloMayorista || (producto.lista === "preciosVapesTexto" ? productoMayorista(listaMayorista, producto.nombre) : null) };
    m.cantidad += cantidad;
    m.lineas.push(linea);
    modelos.set(producto.nombre, m);
  }
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
  let subtotalUSD = conservar ? lineas.reduce((s, l) => s + (l.precioUnitarioUSD || 0) * l.cantidad, 0) : 0;
  for (const [nombre, m] of modelos) {
    const cantidadTramo = op.mayoristaAgrupacion === "total" ? unidades : m.cantidad;
    const centavosUSD = m.mayorista && cantidadTramo >= MINIMO_MAYORISTA ? precioMayorista(m.mayorista, cantidadTramo) : null;
    if (centavosUSD === null && !m.precios) throw new Error(sinPrecioPorUnidad(nombre));
    if (centavosUSD !== null && m.mayorista.prepago && medioPago !== "transferencia") throw new Error(`${nombre} es pre pago por mayor: se abona por transferencia antes`);
    const importe = centavosUSD !== null
      ? Math.round(centavosUSD * m.cantidad * (dolarMayorista > 0 ? dolarMayorista : 1) / 100)
      : importePorCantidad(m.precios, m.cantidad, m.producto.porUnidad === true);
    if (importe === null) {
      throw new Error(`"${nombre}" no se vende de a ${m.cantidad} (opciones: ${Object.keys(m.precios).map((n) => `${n}x`).join(", ")})`);
    }
    if (centavosUSD !== null) subtotalUSD += centavosUSD * m.cantidad / 100;
    let resto = importe;
    m.lineas.forEach((l, i) => {
      if (centavosUSD !== null) l.precioUnitarioUSD = centavosUSD / 100;
      l.importe = i === m.lineas.length - 1 ? resto : Math.round((importe * l.cantidad) / m.cantidad);
      resto -= l.importe;
    });
  }
  const esMayorista = (l) => l.precioUnitarioUSD != null;
  // Si lleva una Mystery Box (lista de la campaña): tiene envío gratis en CABA (campania.js).
  const conMysteryBox = [...modelos.values()].some((m) => m.producto.lista === "mysteryBoxTexto");
  return { lineas, subtotalUSD, dolarMayorista, conMysteryBox, mayorista: lineas.some(esMayorista),
    subtotal: lineas.reduce((s, l) => s + l.importe, 0),
    // El descuento por efectivo es solo para lo que va a precio de lista.
    subtotalMinorista: lineas.filter((l) => !esMayorista(l)).reduce((s, l) => s + l.importe, 0) };
}

// El descuento por pagar en efectivo de una cotización: sobre lo que no es mayorista.
const descuentoDe = (cotizacion, medioPago) => (medioPago === "efectivo" && cotizacion.subtotalMinorista > 0 ? descuentoEfectivo(cotizacion.subtotalMinorista) : 0);

// Una línea de la cotización en texto: las mayoristas con su precio en dólares.
const lineaEnTexto = (l, conPesos = true) => `${l.cantidad}x ${l.producto}${l.variante ? " - " + l.variante : ""}`
  + (l.precioUnitarioUSD != null ? (conPesos ? `: ${pesos(l.importe)} (mayorista USD ${l.precioUnitarioUSD} c/u)` : `: USD ${l.precioUnitarioUSD} c/u (mayorista)`) : `: ${pesos(l.importe)}`);

module.exports = { PAGO_LABEL, formaDePago, pagaAntes, descuentoEfectivo, descuentoDe, lineaEnTexto, TRAMOS_DESCUENTO_EFECTIVO, cotizarProductos, MINIMO_MAYORISTA };
