// Las consultas del agente que no guardan nada: buscar en el catálogo, cotizar productos y cotizar el envío.
"use strict";

const { db } = require("./firebase");
const { conClave, rechazar } = require("./http");
const { pesos } = require("./texto");
const { buscarEnCatalogo } = require("./catalogo");
const { formaDePago, descuentoEfectivo, cotizarProductos } = require("./precios");
const { ubicar } = require("./envios");
const { leerInfoWeb, infoWebDe } = require("./web");

const leerOperativo = async () => (await db.collection("settings").doc("operativo").get()).data() || {};
const datos = (req) => ({ ...req.query, ...(req.body && typeof req.body === "object" ? req.body : {}) });

// /agentBuscarCatalogo — { consulta, sinPrecios }
// A cada modelo se le suma lo que dice la web de él y de los sabores buscados (infoWeb): solo descripción.
const agentBuscarCatalogo = conClave(async (req, res) => {
  const d = datos(req);
  const sinPrecios = d.sinPrecios === true || d.sinPrecios === "true" || d.sinPrecios === "1";
  const [op, web] = await Promise.all([leerOperativo(), leerInfoWeb().catch(() => [])]);
  const r = buscarEnCatalogo(op, d.consulta, { conPrecios: !sinPrecios });
  for (const x of r.resultados) {
    const info = infoWebDe(web, x.nombre, x.saboresQueCoinciden || []);
    if (info) x.infoWeb = info;
  }
  res.json(r);
});

// /agentCotizarProductos — { items: [{ producto, variante, cantidad }], medioPago, mayorista }
// Para cotizar alcanza el modelo: el sabor se pide recién para cargar el pedido.
const agentCotizarProductos = conClave(async (req, res) => {
  const d = datos(req);
  const mayorista = d.mayorista === true;
  const medioPago = formaDePago(d.medioPago);
  let c;
  try { c = cotizarProductos(await leerOperativo(), d.items, { mayorista, medioPago, permitirSinSabor: true }); }
  catch (e) { return rechazar(res, e.message); }
  if (mayorista && !(c.dolarMayorista > 0)) {
    return res.json({ ok: true, moneda: "USD", subtotalUSD: c.subtotalUSD, necesitaTipoCambio: true,
      mensaje: `Los productos suman USD ${c.subtotalUSD}. El total en pesos requiere el dólar mayorista del panel.` });
  }
  const descuento = medioPago === "efectivo" && !mayorista ? descuentoEfectivo(c.subtotal) : 0;
  const lineas = c.lineas.map((l) => `${l.cantidad}x ${l.producto}${l.variante ? " - " + l.variante : ""}: ${pesos(l.importe)}`);
  res.json({ ok: true, moneda: "ARS", items: c.lineas, subtotal: c.subtotal, montoDescuento: descuento, totalProductos: c.subtotal - descuento,
    mensaje: [...lineas, `Total de productos: ${pesos(c.subtotal - descuento)}${descuento ? " (incluye descuento por efectivo)" : ""}`].join("\n") });
});

// /agentCotizarEnvio — { direccion }: si llega la moto y cuánto sale.
const agentCotizarEnvio = conClave(async (req, res) => {
  const u = await ubicar(datos(req).direccion);
  if (!u) return res.json({ ok: true, encontrada: false });
  res.json({ ok: true, encontrada: true, cubiertoMoto: u.cubiertoMoto, monto: u.cubiertoMoto ? u.monto : null, km: u.km, zona: u.zona, admiteEfectivo: u.cubiertoMoto });
});

module.exports = { agentBuscarCatalogo, agentCotizarProductos, agentCotizarEnvio };
