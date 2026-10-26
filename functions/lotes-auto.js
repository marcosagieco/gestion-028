/**
 * lotes-auto.js — un lote se termina solo cuando se queda sin unidades.
 *
 * Corre en el servidor cada vez que cambia un lote, así funciona venga de donde venga la venta
 * (Gestión, /pedidos, /escaner o el bot de WhatsApp) sin tener que repetir la regla en cada lugar.
 *
 * - Lote activo con productos y stock total en 0 → se marca terminado (finalizedAt) con la marca
 *   finalizadoAuto, para distinguirlo de uno que se terminó a mano.
 * - Lote que se terminó SOLO y vuelve a tener stock (se borró o se editó una venta y las unidades
 *   volvieron) → se reabre. Importa porque el bot ignora los lotes terminados al buscar stock: si
 *   quedara cerrado con unidades, esas unidades serían invisibles para las ventas por WhatsApp.
 * - Los que se terminan a mano no se tocan nunca, tengan o no stock.
 *
 * Se engancha desde index.js con: Object.assign(exports, require("./lotes-auto"));
 */
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

function decidirEstadoLote(lote) {
  const items = (lote && lote.items) || [];
  if (items.length === 0) return null; // lote recién creado, todavía sin productos
  const stockTotal = items.reduce((s, it) => s + (Number(it.currentStock) || 0), 0);
  if (!lote.finalizedAt && stockTotal <= 0) return "terminar";
  if (lote.finalizedAt && lote.finalizadoAuto && stockTotal > 0) return "reabrir";
  return null;
}

exports.onLoteActualizado = onDocumentUpdated("batches/{id}", async (event) => {
  const despues = event.data && event.data.after;
  if (!despues || !despues.exists) return;
  const accion = decidirEstadoLote(despues.data());
  if (accion === "terminar") {
    await despues.ref.update({ finalizedAt: new Date().toISOString(), finalizadoAuto: true });
  } else if (accion === "reabrir") {
    await despues.ref.update({ finalizedAt: null, finalizadoAuto: admin.firestore.FieldValue.delete() });
  }
});

exports._decidirEstadoLote = decidirEstadoLote;
