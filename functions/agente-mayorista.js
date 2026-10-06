"use strict";

function parsearMayorista(texto) {
  const productos = [];
  let actual = null;
  for (const raw of String(texto || "").split(/\r?\n/)) {
    const linea = raw.trim();
    const precio = linea.match(/(\d+)\s*x\s*(?:[\u2192\u279c:=-]+)?\s*(\d+(?:[.,]\d{1,2})?)\s*USD\b/i);
    if (precio && actual) {
      actual.precios[Number(precio[1])] = Math.round(Number(precio[2].replace(",", ".")) * 100);
      continue;
    }
    if (!linea || /^[\s\u2e3b\u2501\u2500\u2014\u2013=_-]+$/.test(linea) || /lista|mayorista|USD|c\/u/i.test(linea)) continue;
    const nombre = linea.replace(/[^\p{L}\p{N}\s&'-]/gu, " ").replace(/\s+/g, " ").trim();
    if (!nombre) continue;
    actual = { nombre: nombre.replace(/\s*-?\s*PRE\s*PAGO.*$/i, "").trim(), detalle: "", precios: {}, prepago: /pre\s*pago/i.test(nombre) };
    productos.push(actual);
  }
  return productos.filter((p) => Object.keys(p.precios).length);
}

function precioMayorista(producto, cantidad) {
  const tramo = Object.keys(producto.precios).map(Number).filter((n) => n <= cantidad).sort((a, b) => b - a)[0];
  return tramo ? producto.precios[tramo] : null;
}

module.exports = { parsearMayorista, precioMayorista };
