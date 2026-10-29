// Estadísticas del bot de WhatsApp para el panel. Las cuenta n8n (cada hora, con los eventos que anota
// el bot en Postgres) y las manda acá: el backend no llama al n8n. Quedan en bot_estadisticas/{AAAA-MM-DD}.
"use strict";

const { db } = require("./firebase");
const { conClave, rechazar } = require("./http");

const entero = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0);

// Lo que se guarda de un día: solo contadores (enteros) y las derivaciones por motivo.
function delDia(d) {
  const derivaciones = {};
  for (const [motivo, n] of Object.entries(d.derivaciones && typeof d.derivaciones === "object" ? d.derivaciones : {})) {
    const clave = String(motivo).replace(/[^\w-]/g, "").slice(0, 40);
    if (clave) derivaciones[clave] = entero(n);
  }
  return {
    dia: d.dia,
    mensajes: entero(d.mensajes),
    clientes: entero(d.clientes),
    resumenes: entero(d.resumenes),
    pedidos: entero(d.pedidos),
    clientesConPedido: entero(d.clientesConPedido),
    abandonos: entero(d.abandonos),
    derivaciones,
    totalDerivaciones: Object.values(derivaciones).reduce((s, n) => s + n, 0),
  };
}

// POST /agentEstadisticasBot — { dias: [{ dia, mensajes, clientes, resumenes, pedidos, clientesConPedido,
// abandonos, derivaciones: { motivo: n } }] }. Cada día se reemplaza entero (n8n manda los totales).
const agentEstadisticasBot = conClave(async (req, res) => {
  const dias = Array.isArray(req.body?.dias) ? req.body.dias : null;
  if (!dias || !dias.length || dias.length > 40) return rechazar(res, "dias tiene que ser una lista de 1 a 40 días");
  if (dias.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(String(d?.dia || "")))) return rechazar(res, "cada día necesita dia en formato AAAA-MM-DD");
  const ahora = new Date().toISOString();
  await Promise.all(dias.map((d) => db.collection("bot_estadisticas").doc(d.dia).set({ ...delDia(d), actualizado: ahora })));
  res.json({ ok: true, guardados: dias.length });
});

module.exports = { agentEstadisticasBot };
