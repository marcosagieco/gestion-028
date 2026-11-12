// Las consultas del agente que no guardan nada: buscar en el catálogo, cotizar productos y cotizar el envío.
"use strict";

const { conClave, rechazar } = require("./http");
const { pesos } = require("./texto");
const { buscarEnCatalogo } = require("./catalogo");
const { formaDePago, descuentoDe, lineaEnTexto, cotizarProductos } = require("./precios");
const { ubicar } = require("./envios");
const { leerInfoWeb, infoWebDe } = require("./web");
const { leerOperativo } = require("./campania");

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

// /agentCotizarProductos — { items: [{ producto, variante, cantidad }], medioPago }
// Para cotizar alcanza el modelo: el sabor se pide recién para cargar el pedido. El precio mayorista
// lo aplica solo cotizarProductos (desde el mínimo de unidades).
const agentCotizarProductos = conClave(async (req, res) => {
  const d = datos(req);
  const medioPago = formaDePago(d.medioPago);
  let c;
  const op = await leerOperativo();
  try { c = cotizarProductos(op, d.items, { medioPago, permitirSinSabor: true }); }
  catch (e) { return rechazar(res, e.message); }
  if (c.mayorista && !(c.dolarMayorista > 0)) {
    return res.json({ ok: true, moneda: "USD", subtotalUSD: c.subtotalUSD, necesitaTipoCambio: true,
      mensaje: [...c.lineas.map((l) => lineaEnTexto(l, false)),
        `Lo mayorista suma USD ${c.subtotalUSD}. El total en pesos requiere el dólar mayorista del panel.`].join("\n") });
  }
  const descuento = descuentoDe(c, medioPago);
  const lineas = c.lineas.map((l) => lineaEnTexto(l));
  res.json({ ok: true, moneda: "ARS", items: c.lineas, subtotal: c.subtotal, montoDescuento: descuento, totalProductos: c.subtotal - descuento,
    ...(c.mayorista ? { mayorista: true } : {}),
    ...(op.campaniaActiva && c.conMysteryBox ? { conMysteryBox: true } : {}),
    mensaje: [...lineas, `Total de productos: ${pesos(c.subtotal - descuento)}${descuento ? " (incluye descuento por efectivo)" : ""}`].join("\n") });
});

// /agentCotizarEnvio — { direccion }: si llega la moto y cuánto sale. Con una campaña y una dirección de CABA,
// `envioGratis` dice cuándo el envío sale gratis (con Mystery Box, desde cuánto y si en el lanzamiento alcanza
// con pagar por transferencia):
// el total final lo calcula armar_resumen.
const agentCotizarEnvio = conClave(async (req, res) => {
  const [u, op] = await Promise.all([ubicar(datos(req).direccion), leerOperativo()]);
  if (!u) return res.json({ ok: true, encontrada: false });
  const c = op.campaniaActiva;
  const envioGratis = c && u.esCABA && u.cubiertoMoto
    ? { campania: c.nombre, desde: c.envioGratisDesde, lanzamientoConTransferencia: c.enLanzamiento, conMysteryBox: true } : null;
  res.json({ ok: true, encontrada: true, cubiertoMoto: u.cubiertoMoto, monto: u.cubiertoMoto ? u.monto : null, km: u.km, zona: u.zona, admiteEfectivo: u.cubiertoMoto,
    ...(envioGratis ? { envioGratis } : {}) });
});

module.exports = { agentBuscarCatalogo, agentCotizarProductos, agentCotizarEnvio };
