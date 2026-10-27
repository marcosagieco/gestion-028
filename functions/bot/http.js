// Endpoints del bot: todos piden la clave del agente y responden JSON.
"use strict";

const functions = require("firebase-functions");
const { AGENT_API_KEY } = require("./firebase");

function conClave(handler) {
  return functions.https.onRequest(async (req, res) => {
    if (!AGENT_API_KEY || req.get("X-Agent-Key") !== AGENT_API_KEY) {
      return res.status(401).json({ ok: false, error: "no autorizado" });
    }
    try {
      await handler(req, res);
    } catch (e) {
      console.error("[bot]", req.path, e);
      if (!res.headersSent) res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });
}

// Un dato que falta o no sirve: el error le dice al agente qué pedirle al cliente.
const rechazar = (res, error) => res.status(400).json({ ok: false, error });

module.exports = { conClave, rechazar };
