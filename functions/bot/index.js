// Backend del bot de WhatsApp de 028 (lo llama n8n). Se engancha desde functions/index.js con
// Object.assign(exports, require("./bot")). Contrato de cada endpoint: ../../AGENTE_API.md
//
//   estado.js        agentEstadoOperativo   lo del día: salidas, demora, pedido en curso, plantillas
//   consultas.js     agentBuscarCatalogo, agentCotizarProductos, agentCotizarEnvio
//   pedidos.js       agentPedido, agentCancelarPedido   resumen, carga, cambio y cancelación de pedidos
//   comprobantes.js  agentGuardarComprobante, agentComprobantesDeLaPausa, serveComprobante
//   uber.js          agentCrearCotizacionUber, agentAvisosCotizacionUber
//   sinstock.js      agentAvisosSinStock   el depósito marca «no hay stock» y el bot le avisa al cliente
//   estadisticas.js  agentEstadisticasBot   los totales del día que manda n8n, para el panel
//   web.js           actualizarInfoWebDiario, agentActualizarInfoWeb   descripciones de productos de la web
//
// El resto de los archivos son las reglas que usan: catálogo, precios, envíos, salidas y seguimiento.
"use strict";

const { agentGuardarComprobante, agentComprobantesDeLaPausa, serveComprobante } = require("./comprobantes");
const { agentCrearCotizacionUber, agentAvisosCotizacionUber } = require("./uber");
const { agentAvisosSinStock } = require("./sinstock");
const { agentEstadisticasBot } = require("./estadisticas");
const { actualizarInfoWebDiario, agentActualizarInfoWeb } = require("./web");

module.exports = {
  ...require("./estado"),
  ...require("./consultas"),
  ...require("./pedidos"),
  agentGuardarComprobante,
  agentComprobantesDeLaPausa,
  serveComprobante,
  agentCrearCotizacionUber,
  agentAvisosCotizacionUber,
  agentAvisosSinStock,
  agentEstadisticasBot,
  actualizarInfoWebDiario,
  agentActualizarInfoWeb,
};
