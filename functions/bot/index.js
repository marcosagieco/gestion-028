// Backend del bot de WhatsApp de 028 (lo llama n8n). Se engancha desde functions/index.js con
// Object.assign(exports, require("./bot")). Contrato de cada endpoint: ../../AGENTE_API.md
//
//   estado.js        agentEstadoOperativo   lo del día: salidas, demora, pedido en curso, plantillas
//   consultas.js     agentBuscarCatalogo, agentCotizarProductos, agentCotizarEnvio
//   pedidos.js       agentPedido            resumen, carga y cambio de pedidos
//   comprobantes.js  agentGuardarComprobante, serveComprobante
//   uber.js          agentCrearCotizacionUber, agentAvisosCotizacionUber
//
// El resto de los archivos son las reglas que usan: catálogo, precios, envíos, salidas y seguimiento.
"use strict";

const { agentGuardarComprobante, serveComprobante } = require("./comprobantes");
const { agentCrearCotizacionUber, agentAvisosCotizacionUber } = require("./uber");

module.exports = {
  ...require("./estado"),
  ...require("./consultas"),
  ...require("./pedidos"),
  agentGuardarComprobante,
  serveComprobante,
  agentCrearCotizacionUber,
  agentAvisosCotizacionUber,
};
