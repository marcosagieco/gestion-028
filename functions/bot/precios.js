// Precios: cuánto salen los productos, con los combos de la lista, la lista mayorista y el descuento
// por efectivo. Nunca con un número que mande el agente.
"use strict";

const { normalizar } = require("./texto");
const { STOCK_DE, parsearProductos, productosEnPesos, buscarProducto, productoDeLinea, faltaStock } = require("./catalogo");

// Descuento por pagar en efectivo, medido sobre el subtotal de productos (sin el envío).
const TRAMOS_DESCUENTO_EFECTIVO = [
  { desde: 100000, off: 5000 },
  { desde: 50000, off: 2500 },
  { desde: 0, off: 1500 },
];
const descuentoEfectivo = (subtotal) => TRAMOS_DESCUENTO_EFECTIVO.find((t) => subtotal >= t.desde).off;

const MINIMO_MAYORISTA = 10;

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
function importePorCantidad(precios, cantidad, porUnidad = false) {
  if (porUnidad) {
    const escalon = Object.keys(precios).map(Number).sort((a, b) => b - a).find((n) => n <= cantidad);
    return escalon ? Math.round((precios[escalon] / escalon) * cantidad) : null;
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

// Lista mayorista: un modelo por renglón y debajo "10x → 13,5 USD c/u". Precios en centavos de dólar.
function parsearMayorista(texto) {
  const productos = [];
  let actual = null;
  for (const raw of String(texto || "").split(/\r?\n/)) {
    const linea = raw.trim();
    const precio = linea.match(/(\d+)\s*x\s*(?:[→➜:=-]+)?\s*(\d+(?:[.,]\d{1,2})?)\s*USD\b/i);
    if (precio && actual) {
      actual.precios[Number(precio[1])] = Math.round(Number(precio[2].replace(",", ".")) * 100);
      continue;
    }
    if (!linea || /^[\s⸻━─—–=_-]+$/.test(linea) || /lista|mayorista|USD|c\/u/i.test(linea)) continue;
    const nombre = linea.replace(/[^\p{L}\p{N}\s&'-]/gu, " ").replace(/\s+/g, " ").trim();
    if (!nombre) continue;
    actual = { nombre: nombre.replace(/\s*-?\s*PRE\s*PAGO.*$/i, "").trim(), detalle: "", precios: {}, prepago: /pre\s*pago/i.test(nombre) };
    productos.push(actual);
  }
  return productos.filter((p) => Object.keys(p.precios).length);
}
// El precio por unidad del tramo que alcanza esa cantidad.
function precioMayorista(producto, cantidad) {
  const tramo = Object.keys(producto.precios).map(Number).filter((n) => n <= cantidad).sort((a, b) => b - a)[0];
  return tramo ? producto.precios[tramo] : null;
}

// Cotiza los items de un pedido: [{ producto, variante, cantidad }] → líneas con importe. Controla el
// stock de cada sabor. Con `conservar`, los items ya traen su importe (un pedido que se modifica sin
// tocar los productos mantiene los precios con que se cargó).
function cotizarProductos(op, items, { mayorista = false, conservar = false, medioPago = "", permitirSinSabor = false } = {}) {
  if (!Array.isArray(items) || !items.length || items.length > 200) throw new Error("Indicá los productos y cantidades para cotizar");
  const listas = productosEnPesos(op);
  const ofertas = parsearProductos(op.ofertasTexto);
  const listaMayorista = parsearMayorista(op.preciosMayoristaTexto);
  const dolarMayorista = Number(op.dolarMayorista);
  if (mayorista && items.reduce((s, it) => s + Number(it.cantidad), 0) < MINIMO_MAYORISTA) throw new Error("la compra mayorista requiere al menos 10 unidades");
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
      if (mayorista && buscarProducto(listaMayorista, it.producto)?.producto?.prepago && medioPago !== "transferencia") throw new Error(`${it.producto} es pre pago: se abona por transferencia antes`);
      const linea = { producto: it.producto, variante: it.variante || "", cantidad, importe: it.importe };
      if (it.precioUnitarioUSD != null) linea.precioUnitarioUSD = it.precioUnitarioUSD;
      lineas.push(linea);
      continue;
    }
    const r = productoDeLinea(mayorista ? listaMayorista.map((p) => ({ ...p, lista: "preciosVapesTexto" })) : listas, mayorista ? [] : ofertas, it);
    if (r.error) throw new Error(r.error);
    const clave = `${r.producto.nombre}:${normalizar(it.variante)}`;
    const pedidas = (pedidasPorSabor.get(clave) || 0) + cantidad;
    pedidasPorSabor.set(clave, pedidas);
    const sinStock = STOCK_DE[r.producto.lista] && faltaStock(op[STOCK_DE[r.producto.lista]], r.producto.nombre, it.variante, pedidas);
    // Para cotizar alcanza el modelo; para cargar el pedido hace falta el sabor.
    if (sinStock && !(permitirSinSabor && !normalizar(it.variante) && sinStock.startsWith("falta el sabor"))) throw new Error(sinStock);
    if (mayorista && r.producto.prepago && medioPago !== "transferencia") throw new Error(`${r.producto.nombre} es pre pago: se abona por transferencia antes`);
    const linea = { producto: String(it.producto), variante: String(it.variante || ""), cantidad, importe: 0 };
    lineas.push(linea);
    const m = modelos.get(r.producto.nombre) || { producto: r.producto, precios: r.precios, cantidad: 0, lineas: [] };
    m.cantidad += cantidad;
    m.lineas.push(linea);
    modelos.set(r.producto.nombre, m);
  }
  let subtotalUSD = conservar ? lineas.reduce((s, l) => s + (l.precioUnitarioUSD || 0) * l.cantidad, 0) : 0;
  for (const [nombre, m] of modelos) {
    const cantidadTramo = op.mayoristaAgrupacion === "total" ? lineas.reduce((s, l) => s + l.cantidad, 0) : m.cantidad;
    if (mayorista && cantidadTramo < MINIMO_MAYORISTA) throw new Error(`${nombre}: el minimo mayorista es 10 unidades por modelo, mezclando sabores`);
    const centavosUSD = mayorista ? precioMayorista(m.producto, cantidadTramo) : null;
    const importe = mayorista
      ? (centavosUSD === null ? null : Math.round(centavosUSD * m.cantidad * (dolarMayorista > 0 ? dolarMayorista : 1) / 100))
      : importePorCantidad(m.precios, m.cantidad, m.producto.porUnidad === true);
    if (importe === null) {
      throw new Error(`"${nombre}" no se vende de a ${m.cantidad} (opciones: ${Object.keys(m.precios).map((n) => `${n}x`).join(", ")})`);
    }
    if (mayorista) subtotalUSD += centavosUSD * m.cantidad / 100;
    let resto = importe;
    m.lineas.forEach((l, i) => {
      if (mayorista) l.precioUnitarioUSD = centavosUSD / 100;
      l.importe = i === m.lineas.length - 1 ? resto : Math.round((importe * l.cantidad) / m.cantidad);
      resto -= l.importe;
    });
  }
  // Si lleva una Mystery Box (lista de la campaña): tiene envío gratis en CABA (campania.js).
  const conMysteryBox = [...modelos.values()].some((m) => m.producto.lista === "mysteryBoxTexto");
  return { lineas, subtotalUSD, dolarMayorista, conMysteryBox, subtotal: lineas.reduce((s, l) => s + l.importe, 0) };
}

module.exports = { PAGO_LABEL, formaDePago, pagaAntes, descuentoEfectivo, TRAMOS_DESCUENTO_EFECTIVO, cotizarProductos, MINIMO_MAYORISTA };
