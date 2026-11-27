// Comprobantes de pago. Todos los que manda un cliente quedan guardados en "comprobantes", se cargue o
// no el pedido (si el bot deriva o el pedido se carga a mano, igual se mandan a la financiera). El id
// sale de la URL del adjunto y claveOperacion identifica la transferencia: el mismo comprobante no se
// guarda dos veces, aunque llegue en otro archivo (se cuenta en `veces`). Al cargar el pedido se usan
// los de la compra en curso y quedan vinculados (pedidoId): el panel deja de mostrarlos como sueltos.
"use strict";

const functions = require("firebase-functions");
const axios = require("axios");
const { admin, db, STORAGE_BUCKET, SERVE_COMPROBANTE_BASE } = require("./firebase");
const { conClave, rechazar } = require("./http");
const { normalizar, normalizarTelefono, hashCorto, importeDeTexto } = require("./texto");

// Diferencia aceptada entre lo transferido y lo que había que transferir, de más o de menos.
const TOLERANCIA_COMPROBANTE = 5000;

// Cada cuenta del negocio: su CBU/CVU y su alias bancario. Un comprobante es de una cuenta del negocio solo si
// muestra uno de estos dos datos. El nombre no alcanza (Lucio, 27/11): «Lucio Felix Bunge» en Belo es otra
// cuenta, aunque se llame igual que la del alias 1. Tampoco el CUIT: es de la persona, no de la cuenta.
const CUENTAS = [
  { alias: "alias1", cbu: "0070194130004014092980", aliasBanco: "028import.gl", titular: "bunge" },
  { alias: "alias2", cbu: "0070181130004057764295", aliasBanco: "028import.gal2", titular: "gieco" },
  { alias: "alias3", cbu: "0000510400000000001348", aliasBanco: "tamelake358sa.eluter", titular: "tame lake" },
  { alias: "alias4", cbu: "0000137902554316992947", aliasBanco: null, titular: "bunge" }, // Cuenta Recaudadora: sin alias
];

// Dos CBU/CVU son el mismo con a lo sumo un dígito de diferencia (uno de más, de menos o cambiado): la lectura
// de una imagen a veces se come o duplica un cero (Celina, 22/10). Dos cuentas distintas difieren en muchos más.
function mismoCbu(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diferencias = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diferencias > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diferencias + (a.length - i) + (b.length - j) <= 1;
}

// La cuenta del negocio a la que va un comprobante, por su CBU/CVU o su alias, mirando todos los datos leídos
// (la lectura a veces pone el CBU en otro campo o invierte origen y destino). { cuenta, conDatos }: conDatos dice
// si se leyó algún CBU/CVU o alias; sin eso no se puede saber a qué cuenta fue.
function cuentaDelComprobante(l) {
  // cuentasVisibles: todos los CBU/CVU y alias del comprobante, de quien paga y de quien recibe.
  const visibles = Array.isArray(l.cuentasVisibles) ? l.cuentasVisibles.join(", ") : l.cuentasVisibles;
  const textos = [l.cbuCvu, l.alias, l.destinatario, l.titular, l.cuit, visibles].map((v) => String(v || ""));
  const numeros = new Set();
  const cbuCvu = textos[0].replace(/\D/g, "");
  if (cbuCvu.length >= 18) numeros.add(cbuCvu);
  for (const t of textos) for (const m of t.matchAll(/\d[\d .-]{16,30}\d/g)) {
    const d = m[0].replace(/\D/g, "");
    if (d.length >= 18 && d.length <= 24) numeros.add(d);
  }
  const plano = textos.join("|").toLowerCase().replace(/\s+/g, "");
  const aliasLeido = /[a-z0-9]+\.[a-z0-9.]+/i.test(textos[1]);
  // Algunos bancos muestran el CBU enmascarado («****2980»): vale si terminan igual y el titular es el dueño.
  const enmascarado = [...textos.join(" ").matchAll(/[*x•·]{2,}\s*-?\s*(\d{3,6})\b/gi)].map((m) => m[1]);
  const destinatario = normalizar(String(l.destinatario || ""));
  const cuenta = CUENTAS.find((c) => [...numeros].some((n) => mismoCbu(n, c.cbu)))
    || CUENTAS.find((c) => c.aliasBanco && new RegExp(`(^|[^a-z0-9.])${c.aliasBanco.replace(/\./g, "\\.")}($|[^a-z0-9.])`).test(plano))
    || CUENTAS.find((c) => enmascarado.some((fin) => c.cbu.endsWith(fin)) && destinatario.includes(c.titular));
  return { cuenta: cuenta || null, conDatos: numeros.size > 0 || aliasLeido || enmascarado.length > 0 };
}

const idComprobante = (url) => `cw-${hashCorto(String(url).trim())}`;

// La transferencia de un comprobante: cuenta, dígitos del número de operación e importe. El mismo
// comprobante mandado dos veces (otro archivo, otro mensaje) es la misma transferencia; con otro importe
// u otra cuenta, no. null si no se puede saber.
function claveDeOperacion(cuentaCobro, numero, monto) {
  const digitos = String(numero || "").replace(/\D/g, "");
  return cuentaCobro && digitos && Number(monto) > 0 ? hashCorto(`${cuentaCobro}|${digitos}|${Math.round(Number(monto))}`) : null;
}

// La lectura del archivo que hace el bot (Gemini), como objeto o como JSON:
// { esComprobante, edicionDetectada, monto, numeroOperacion, fechaHora, titular, destinatario, cbuCvu, alias, cuit }.
function leerComprobante(lectura) {
  let l = lectura;
  if (typeof l === "string") {
    try { l = JSON.parse(l.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); } catch { l = null; }
  }
  if (!l || typeof l !== "object" || Array.isArray(l) || l.esComprobante !== true) return { esComprobante: false };
  const campo = (v) => String(v || "").replace(/[\r\n]/g, " ").trim().slice(0, 200);
  const monto = importeDeTexto(l.monto);
  // El número de operación no es obligatorio: el comprobante vale con el importe y la cuenta de destino.
  // Solo sirve para reconocer la misma transferencia (no cobrarla dos veces), y un número corto («8801») no
  // alcanza para eso. Sin un número que la identifique, la transferencia se identifica por la fecha, la hora y
  // el importe ("SINNRO-021126-1750-48000"; Buepp no trae número) o, si tampoco se leen, por el archivo.
  const fh = String(l.fechaHora || "").match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\D+(\d{1,2})[:.h](\d{2})/);
  const sinNumero = fh && monto ? `SINNRO-${fh[1].padStart(2, "0")}${fh[2].padStart(2, "0")}${fh[3].slice(-2)}-${fh[4].padStart(2, "0")}${fh[5]}-${Math.round(monto)}` : "";
  const leido = String(l.numeroOperacion || "").trim().replace(/\s+/g, "");
  const numero = (/^[a-z0-9][a-z0-9-]{5,79}$/i.test(leido) && leido.replace(/\D/g, "").length >= 6 ? leido : "") || sinNumero;
  const { cuenta, conDatos } = cuentaDelComprobante(l);
  // Mercado Pago muestra «Origen y destino» en una sola lista y la lectura a veces invierte los roles: pone
  // al negocio como quien paga (Macarena, 4/11). Un cliente nunca manda un pago hecho desde la cuenta del
  // negocio, así que si el titular es el dueño de la cuenta, quien paga es el «destinatario». El nombre solo
  // sirve para esto (mostrar bien quién pagó): la cuenta ya salió del CBU o del alias.
  const esDelDuenio = (t) => !!cuenta && normalizar(campo(t)).includes(cuenta.titular);
  const invertido = esDelDuenio(l.titular) && !esDelDuenio(l.destinatario);
  const titular = campo(invertido ? l.destinatario : l.titular);
  return {
    esComprobante: true,
    edicionDetectada: l.edicionDetectada === true,
    completo: !!monto,
    monto,
    numero: numero || null,
    nombre: titular && !/^no (especificad|visible|aparece|figura)/i.test(titular) ? titular.slice(0, 80) : null,
    cuentaCobro: cuenta ? cuenta.alias : null,
    // Sin CBU/CVU ni alias a la vista no se sabe a qué cuenta fue: se le pide una captura donde se vea.
    destinoSinDatos: !cuenta && !conDatos,
    descripcion: ["Comprobante de pago", "Monto: " + (monto ? monto.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "-"),
      "Número de operación: " + (campo(l.numeroOperacion) || "-"), "Fecha y hora: " + campo(l.fechaHora), "Titular: " + titular, "Destinatario: " + campo(invertido ? l.titular : l.destinatario),
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
// Cuenta la última vez que el cliente lo mandó: si lo reenvía (porque el bot se lo pidió), es el pago de esta
// compra aunque la primera vez haya llegado antes de que empezara.
async function comprobantesDeLaCompra(telefono, idConversacion, desde) {
  const snap = await db.collection("comprobantes").where("telefono", "==", telefono).get();
  const llegada = (c) => Math.max(Date.parse(c.createdAt || "") || 0, Date.parse(c.ultimoEnvio || "") || 0);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }))
    .filter((c) => !c.pedidoId && !c.conEquipo && String(c.idConversacion ?? "") === String(idConversacion ?? "") && llegada(c) >= desde)
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
  // Sin importe no se guarda como pago: el agente pide otro. Que «parezca editado» es una opinión del
  // modelo que lee la imagen, no un dato: no frena nada y queda anotado para el equipo. El pago lo validan
  // los datos (importe, cuenta del negocio y que no se haya usado en otro pedido) al cargar el pedido.
  if (!datos.completo) return res.json({ ok: true, guardado: false, motivo: "lectura_incompleta" });
  const ref = db.collection("comprobantes").doc(idComprobante(url));
  // Sin número, fecha ni hora, la transferencia es la del archivo: un número que sale de su URL.
  const numero = datos.numero || `SINNRO-${parseInt(ref.id.slice(3, 15), 16)}`;
  const respuesta = { ok: true, guardado: true, id: ref.id, monto: datos.monto, numero, cuentaDelNegocio: !!datos.cuentaCobro };
  const conEquipo = b.conEquipo === true || b.conEquipo === "true";
  // Ya guardado: el mismo archivo (misma URL) o la misma transferencia en otro archivo. No se guarda otro:
  // se cuenta el reenvío (el panel muestra «enviado N veces») y no se suma dos veces al cobrar.
  const claveOperacion = claveDeOperacion(datos.cuentaCobro, numero, datos.monto);
  let existente = await ref.get();
  if (!existente.exists && claveOperacion) {
    const mismos = await db.collection("comprobantes").where("claveOperacion", "==", claveOperacion).limit(1).get();
    if (!mismos.empty) existente = mismos.docs[0];
  }
  if (existente.exists) {
    const previo = existente.data();
    const cambios = {};
    const idMensaje = b.idMensaje != null ? String(b.idMensaje) : null;
    if (existente.id !== ref.id || (idMensaje && idMensaje !== previo.idMensaje && !(previo.reenvios || []).includes(idMensaje))) {
      cambios.veces = (Number(previo.veces) || 1) + 1;
      if (idMensaje) cambios.reenvios = [...(previo.reenvios || []), idMensaje].slice(-20);
      // Lo volvió a mandar ahora: para la compra en curso cuenta desde este envío (comprobantesDeLaCompra).
      // Lucía (conv. 2651, 19/11): lo reenvió porque el bot se lo pidió y seguía sin contar.
      if (!previo.pedidoId) cambios.ultimoEnvio = new Date().toISOString();
    }
    // Vuelve a llegar sin el equipo: la charla volvió al bot con el cliente esperando (nadie le contestó),
    // así que ahora sí lo puede usar el bot.
    if (previo.conEquipo && !conEquipo && !previo.pedidoId) cambios.conEquipo = false;
    if (Object.keys(cambios).length) await db.collection("comprobantes").doc(existente.id).update(cambios);
    // Si ya está en un pedido (el cliente lo reenvió, por ejemplo porque lo borró), el bot lo tiene que saber:
    // no hay nada que cargar y no se le pide otro comprobante.
    return res.json({ ...respuesta, id: existente.id, reutilizado: true, ...(cambios.veces ? { veces: cambios.veces } : {}),
      ...(previo.pedidoId ? { yaEnPedido: previo.pedidoId } : {}) });
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
    comprobante: { numero, monto: datos.monto, nombre: datos.nombre },
    cuentaCobro: datos.cuentaCobro,
    ...(datos.destinoSinDatos ? { destinoSinDatos: true } : {}),
    claveOperacion,
    veces: 1,
    posibleEdicion: datos.edicionDetectada,
    conEquipo,
    descripcion: datos.descripcion,
    urlFuente: url,
    comprobanteImagen: archivo ? { url: `${SERVE_COMPROBANTE_BASE}?comprobante=${ref.id}`, ...archivo } : null,
    pedidoId: null,
  });
  res.json(respuesta);
});

// POST /agentComprobantesDeLaPausa — { telefono, idConversacion, desde, liberar }
// Lo llama el bot cuando la charla vuelve a él después de una pausa (derivó, escribió el equipo o se la
// asignaron a una persona). Devuelve los comprobantes que mandó el cliente en esta conversación desde
// `desde` (segundos, milisegundos o ISO) y que no están en ningún pedido. Mientras el bot estaba pausado se
// guardaron con conEquipo, porque ese pedido lo cargaba el equipo; si nadie del equipo escribió en la pausa,
// nadie lo cargó: con liberar=true se desmarcan y el bot los puede usar para cargar el pedido (caso del
// 19/11, conv. 1545: el cliente transfirió durante la pausa, nadie lo atendió y el pago quedó sin pedido).
// Responde { comprobantes: [{ id, monto, cuentaDelNegocio, conEquipo, liberado }] }.
function instanteDe(valor) {
  const n = Number(valor);
  if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  const t = Date.parse(String(valor || ""));
  return Number.isFinite(t) ? t : null;
}
const agentComprobantesDeLaPausa = conClave(async (req, res) => {
  const b = req.body || {};
  const telefono = normalizarTelefono(b.telefono);
  const idConversacion = String(b.idConversacion ?? "").trim();
  const desde = instanteDe(b.desde);
  if (!telefono || !idConversacion) return rechazar(res, "faltan telefono o idConversacion");
  if (desde === null) return rechazar(res, "desde tiene que ser una fecha");
  const liberar = b.liberar === true || b.liberar === "true";
  const snap = await db.collection("comprobantes").where("telefono", "==", telefono).get();
  const comprobantes = [];
  for (const d of snap.docs) {
    const c = d.data();
    if (c.pedidoId || String(c.idConversacion ?? "") !== idConversacion || (Date.parse(c.createdAt || "") || 0) < desde) continue;
    const liberado = liberar && c.conEquipo === true;
    if (liberado) await db.collection("comprobantes").doc(d.id).update({ conEquipo: false, liberadoEn: new Date().toISOString() });
    comprobantes.push({ id: d.id, monto: Number(c.comprobante?.monto) || null, cuentaDelNegocio: !!c.cuentaCobro, conEquipo: c.conEquipo === true && !liberado, liberado });
  }
  res.json({ ok: true, comprobantes });
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
  agentGuardarComprobante, agentComprobantesDeLaPausa, serveComprobante,
};
