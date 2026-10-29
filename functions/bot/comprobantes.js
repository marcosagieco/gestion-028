// Comprobantes de pago. Todos los que manda un cliente quedan guardados en "comprobantes", se cargue o
// no el pedido (si el bot deriva o el pedido se carga a mano, igual se mandan a la financiera). El id
// sale de la URL del adjunto: el mismo comprobante no se guarda dos veces. Al cargar el pedido se usan
// los de la compra en curso y quedan vinculados (pedidoId): el panel deja de mostrarlos como sueltos.
"use strict";

const functions = require("firebase-functions");
const axios = require("axios");
const { admin, db, STORAGE_BUCKET, SERVE_COMPROBANTE_BASE } = require("./firebase");
const { conClave, rechazar } = require("./http");
const { normalizar, normalizarTelefono, hashCorto, importeDeTexto } = require("./texto");

// Diferencia aceptada entre lo transferido y lo que había que transferir, de más o de menos.
const TOLERANCIA_COMPROBANTE = 5000;

// Cada cuenta del negocio, por los datos que aparecen como destino en un comprobante.
const CUENTAS = [
  { alias: "alias3", claves: ["0000510400000000001348", "tame lake", "tamelake", "30718603702"] },
  { alias: "alias2", claves: ["0070181130004057764295", "gieco", "028import.gal2"] },
  { alias: "alias1", claves: ["0070194130004014092980", "bunge", "028import.gl"] },
];

const idComprobante = (url) => `cw-${hashCorto(String(url).trim())}`;

// La lectura del archivo que hace el bot (Gemini), como objeto o como JSON:
// { esComprobante, edicionDetectada, monto, numeroOperacion, titular, destinatario, cbuCvu, alias, cuit }.
function leerComprobante(lectura) {
  let l = lectura;
  if (typeof l === "string") {
    try { l = JSON.parse(l.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); } catch { l = null; }
  }
  if (!l || typeof l !== "object" || Array.isArray(l) || l.esComprobante !== true) return { esComprobante: false };
  const campo = (v) => String(v || "").replace(/[\r\n]/g, " ").trim().slice(0, 200);
  const monto = importeDeTexto(l.monto);
  const numero = String(l.numeroOperacion || "").trim();
  // El destino es del negocio si coincide cualquiera de sus datos: el CBU/CVU leído de una imagen
  // puede tener un dígito de más o de menos, pero el titular igual coincide.
  const destino = normalizar([l.destinatario, l.alias, l.cuit, l.cbuCvu].map(campo).join(" ")) + " " + campo(l.cbuCvu).replace(/\D/g, " ");
  const cuenta = CUENTAS.find((c) => c.claves.some((k) => destino.includes(normalizar(k))));
  const titular = campo(l.titular);
  return {
    esComprobante: true,
    edicionDetectada: l.edicionDetectada === true,
    completo: !!monto && /^[a-z0-9][a-z0-9-]{5,79}$/i.test(numero),
    monto,
    numero: numero || null,
    nombre: titular && !/^no (especificad|visible|aparece|figura)/i.test(titular) ? titular.slice(0, 80) : null,
    cuentaCobro: cuenta ? cuenta.alias : null,
    descripcion: ["Comprobante de pago", "Monto: " + (monto ? monto.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "-"),
      "Número de operación: " + (numero || "-"), "Titular: " + titular, "Destinatario: " + campo(l.destinatario),
      "CBU o CVU: " + campo(l.cbuCvu), "Alias visible: " + campo(l.alias), "CUIT: " + campo(l.cuit)].join("\n"),
  };
}

const EXTENSIONES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };

// Baja el archivo del adjunto y lo guarda en Storage como comprobantes/AAAA/MM/<nombre>.<ext>.
async function guardarArchivo(url, nombre) {
  const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 15000, maxContentLength: 15 * 1024 * 1024 });
  const tipo = String(resp.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!EXTENSIONES[tipo]) return null;
  const path = `comprobantes/${new Date().toISOString().slice(0, 7).replace("-", "/")}/${nombre}.${EXTENSIONES[tipo]}`;
  await admin.storage().bucket(STORAGE_BUCKET).file(path).save(Buffer.from(resp.data), { contentType: tipo });
  return { path, contentType: tipo };
}

// La foto queda en Storage para no depender de la URL de Chatwoot. Si falla, el pedido queda igual, sin foto.
async function copiarAlPedido(url, pedidoId, adicionalId = null) {
  try {
    const archivo = await guardarArchivo(url, `${pedidoId}${adicionalId ? "-" + adicionalId : ""}`);
    return archivo && { url: `${SERVE_COMPROBANTE_BASE}?pedido=${pedidoId}${adicionalId ? "&adicional=" + adicionalId : ""}`, ...archivo };
  } catch (e) {
    console.error("[bot] no se pudo copiar el comprobante", e.message);
    return null;
  }
}

// Los comprobantes de la compra en curso: los que mandó el cliente en esta conversación desde
// `desde` (ms) y que todavía no están en ningún pedido, del más viejo al más nuevo. No cuentan los que
// llegaron mientras atendía el equipo (conEquipo): esos pedidos los carga el equipo. Así el agente no
// tiene que copiar el link del comprobante (lo copiaba mal y el cliente tenía que mandarlo otra vez).
async function comprobantesDeLaCompra(telefono, idConversacion, desde) {
  const snap = await db.collection("comprobantes").where("telefono", "==", telefono).get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }))
    .filter((c) => !c.pedidoId && !c.conEquipo && String(c.idConversacion ?? "") === String(idConversacion ?? "") && (Date.parse(c.createdAt || "") || 0) >= desde)
    .sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)));
}

async function vincularAlPedido(id, pedidoId) {
  await db.collection("comprobantes").doc(id).update({ pedidoId })
    .catch(() => { /* ya no existe: no hay nada que vincular */ });
}

// POST /agentGuardarComprobante — lo llama el bot con cada imagen o PDF que manda un cliente.
// Body: { url, lectura, telefono, cliente, idConversacion, idMensaje, conEquipo }
// conEquipo: llegó mientras la charla la atendía el equipo (asignada a una persona o el bot en pausa). Ese
// pedido lo carga el equipo a mano, así que el bot no usa el comprobante para cargar uno.
const agentGuardarComprobante = conClave(async (req, res) => {
  const b = req.body || {};
  const url = String(b.url || "").trim();
  if (!/^https:\/\//.test(url)) return rechazar(res, "falta la url del adjunto");
  const datos = leerComprobante(b.lectura);
  if (!datos.esComprobante) return res.json({ ok: true, guardado: false, motivo: "no_es_comprobante" });
  // Un comprobante ilegible no se guarda como pago: el agente pide otro. Que «parezca editado» es una
  // opinión del modelo que lee la imagen, no un dato: no frena nada y queda anotado para el equipo. El pago
  // lo validan los datos (importe, cuenta del negocio y número de operación no repetido) al cargar el pedido.
  if (!datos.completo) return res.json({ ok: true, guardado: false, motivo: "lectura_incompleta" });
  const ref = db.collection("comprobantes").doc(idComprobante(url));
  const respuesta = { ok: true, guardado: true, id: ref.id, monto: datos.monto, numero: datos.numero, cuentaDelNegocio: !!datos.cuentaCobro };
  const conEquipo = b.conEquipo === true || b.conEquipo === "true";
  const existente = await ref.get();
  if (existente.exists) {
    // El mismo comprobante vuelve a llegar sin el equipo: la charla volvió al bot con el cliente esperando
    // (nadie le contestó), así que ahora sí lo puede usar el bot.
    if (existente.data().conEquipo && !conEquipo && !existente.data().pedidoId) await ref.update({ conEquipo: false });
    return res.json({ ...respuesta, reutilizado: true });
  }
  let archivo = null;
  try {
    archivo = await guardarArchivo(url, `sueltos/${ref.id}`);
  } catch (e) {
    console.error("[bot] no se pudo guardar el comprobante suelto", e.message);
  }
  await ref.set({
    createdAt: new Date().toISOString(),
    origen: "bot_n8n",
    cliente: String(b.cliente || "").slice(0, 80) || null,
    telefono: normalizarTelefono(b.telefono) || null,
    idConversacion: b.idConversacion != null ? String(b.idConversacion) : null,
    idMensaje: b.idMensaje != null ? String(b.idMensaje) : null,
    comprobante: { numero: datos.numero, monto: datos.monto, nombre: datos.nombre },
    cuentaCobro: datos.cuentaCobro,
    posibleEdicion: datos.edicionDetectada,
    conEquipo,
    descripcion: datos.descripcion,
    urlFuente: url,
    comprobanteImagen: archivo ? { url: `${SERVE_COMPROBANTE_BASE}?comprobante=${ref.id}`, ...archivo } : null,
    pedidoId: null,
  });
  res.json(respuesta);
});

// GET /serveComprobante?pedido= — la foto del comprobante para el panel. Sin clave a propósito,
// igual que servePdf: el panel la muestra con un <img>. La "clave" es el id aleatorio del pedido.
// Con ?comprobante=<id> sirve un comprobante suelto.
const serveComprobante = functions.https.onRequest(async (req, res) => {
  const pedidoId = String(req.query.pedido || "").trim();
  const sueltoId = String(req.query.comprobante || "").trim();
  const snap = sueltoId ? await db.collection("comprobantes").doc(sueltoId).get()
    : pedidoId ? await db.collection("pedidos").doc(pedidoId).get() : null;
  const img = snap && snap.exists && (!sueltoId && req.query.adicional
    ? snap.data().comprobantesAdicionales?.find((p) => hashCorto(p.numero) === req.query.adicional)?.imagen
    : snap.data().comprobanteImagen);
  if (!img || !img.path) return res.status(404).send("ese pedido no tiene comprobante guardado");
  res.setHeader("Content-Type", img.contentType);
  // Sin este header el panel puede MOSTRAR la foto pero no BAJARLA con fetch (otro dominio): la
  // pestaña Comprobantes la baja así para armar el ZIP del mes.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "private, max-age=3600");
  admin.storage().bucket(STORAGE_BUCKET).file(img.path).createReadStream()
    .on("error", () => res.status(404).end())
    .pipe(res);
});

module.exports = {
  TOLERANCIA_COMPROBANTE, comprobantesDeLaCompra, copiarAlPedido, vincularAlPedido,
  agentGuardarComprobante, serveComprobante,
};
