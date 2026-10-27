// Cotización del Flash (Uber). El agente la pide → el depósito carga el precio en /cotizar-uber → el
// trigger le avisa al bot, que le pasa el precio al cliente. El precio vale 45 minutos desde que se
// le informa; un pedido cargado cierra las cotizaciones de esa compra.
"use strict";

const axios = require("axios");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { db, AGENT_API_KEY } = require("./firebase");
const { conClave, rechazar } = require("./http");
const { normalizar, normalizarTelefono, hashCorto, pesos } = require("./texto");
const { mismaDireccion } = require("./envios");
const { fechaBA } = require("./salidas");

const VIGENCIA_MS = 45 * 60000;
const AVISO_VENCIDO = "como pasaron más de 45 minutos, te tengo que cotizar el Uber de vuelta";
// Adónde avisar: al n8n del bot. settings/agente.n8nBase permite mudarlo sin redesplegar.
const N8N_POR_DEFECTO = "https://028-import-n8n.neoyey.easypanel.host";
const WEBHOOK_AVISO = "/webhook/v2-cotizacion-uber";

const fecha = (v) => Date.parse(v || "") || 0;
const creada = (c) => fecha(c.createdAt) || fecha(c.resueltoEn);
const inicioPrecio = (c) => fecha(c.informadoEn || c.resueltoEn || c.procesadoEn || c.createdAt);
const vencida = (c) => Number(c?.montoUber) > 0 && (!inicioPrecio(c) || Date.now() > inicioPrecio(c) + VIGENCIA_MS);
const vence = (c) => new Date(inicioPrecio(c) + VIGENCIA_MS).toISOString();
const sinCobertura = (c) => c.sinCoberturaUber === true || c.estado === "no_llegamos" || (c.estado === "procesado" && !(Number(c.montoUber) > 0));
const abierta = (c) => !c.pedidoId && !c.usadaEnPedidoId && !c.canceladaEn && !["cancelada", "sustituida"].includes(c.estado);

// Lo del pedido que se guarda como borrador en la cotización, para que el depósito vea qué se cotiza.
const CAMPOS_DEL_PEDIDO = ["items", "tipoEnvio", "direccion", "medioPago", "envioSeguro", "horaSolicitada", "datosCorreo", "cliente", "salidaSeleccionada", "mayorista"];
const camposDelPedido = (p) => Object.fromEntries(CAMPOS_DEL_PEDIDO.filter((k) => p?.[k] !== undefined).map((k) => [k, p[k]]));

// Las cotizaciones abiertas de la compra en curso del teléfono, de la más vieja a la más nueva: las
// de las últimas 24 horas y posteriores al último pedido. Con dirección, solo las de esa dirección
// (si el cliente cambió el destino, vale el más reciente).
async function cotizacionesDeLaCompra(telefono, direccion) {
  const tel = normalizarTelefono(telefono);
  if (!tel) return { cotizaciones: [], ciclo: "inicial" };
  const [cotSnap, pedidosSnap] = await Promise.all([
    db.collection("cotizaciones_uber").where("telefonoCliente", "==", tel).get(),
    db.collection("pedidos").where("telefono", "==", tel).get(),
  ]);
  const ultimoPedido = pedidosSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => fecha(b.createdAt) - fecha(a.createdAt))[0];
  const desde = Math.max(fecha(ultimoPedido?.createdAt), Date.now() - 24 * 3600000);
  let cotizaciones = cotSnap.docs.map((d) => ({ ...d.data(), id: d.id }))
    .filter((c) => abierta(c) && creada(c) > desde)
    .sort((a, b) => creada(a) - creada(b));
  const destino = direccion || cotizaciones[cotizaciones.length - 1]?.direccion;
  if (destino) cotizaciones = cotizaciones.filter((c) => mismaDireccion(c.direccion, destino));
  return { cotizaciones, ciclo: (ultimoPedido?.id || "inicial") + "|" + fechaBA(new Date()) };
}
const ultima = (cotizaciones) => cotizaciones[cotizaciones.length - 1] || null;
const conPrecioVigente = (c) => (Number(c?.montoUber) > 0 && !vencida(c) ? c : null);

// El precio vigente para cobrar un pedido Uber a esa dirección: { monto } o { error, vencida }.
async function precioParaElPedido(telefono, direccion) {
  const c = ultima((await cotizacionesDeLaCompra(telefono, direccion)).cotizaciones);
  if (conPrecioVigente(c)) return { monto: Number(c.montoUber) };
  if (vencida(c)) return { vencida: true, error: AVISO_VENCIDO + ". Pedí una nueva cotización con pedir_cotizacion_flash; no uses el importe anterior." };
  return { error: "todavía no hay un precio de Uber vigente para esta compra y dirección: pedilo con pedir_cotizacion_flash" };
}

// Lo que sabe el agente de la cotización en curso (para el estado del día).
async function cotizacionEnCurso(telefono) {
  const c = ultima((await cotizacionesDeLaCompra(telefono)).cotizaciones);
  if (!c) return null;
  if (conPrecioVigente(c)) return { id: c.id, estado: "cotizado", montoUber: Number(c.montoUber), direccion: c.direccion || "", venceEn: vence(c) };
  if (c.estado === "pendiente") return { id: c.id, estado: "pendiente", direccion: c.direccion || "" };
  if (vencida(c)) return { id: c.id, estado: "vencido", direccion: c.direccion || "", montoAnterior: Number(c.montoUber), necesitaRecotizacion: true, mensaje: AVISO_VENCIDO };
  if (sinCobertura(c)) return { id: c.id, estado: "sin_cobertura", direccion: c.direccion || "", mensaje: "Para esa dirección ofrecemos correo. Preguntá si prefiere sucursal o domicilio; no vuelvas a pedir Uber por tu cuenta." };
  return null;
}

// Al cargar un pedido: la cotización de esa dirección queda usada y las demás de la compra, canceladas.
async function cerrarCotizaciones(telefono, pedidoId, tipoEnvio, direccion) {
  const snap = await db.collection("cotizaciones_uber").where("telefonoCliente", "==", telefono).get();
  for (const d of snap.docs) {
    const c = d.data();
    if (c.pedidoId || c.usadaEnPedidoId || c.canceladaEn) continue;
    const ref = db.collection("cotizaciones_uber").doc(d.id);
    if (tipoEnvio === "uber" && mismaDireccion(c.direccion, direccion)) await ref.update({ usadaEnPedidoId: pedidoId });
    else await ref.update({ canceladaEn: new Date().toISOString(), canceladaPorPedidoId: pedidoId, estado: "cancelada" });
  }
}

// POST /agentCrearCotizacionUber — { idConversacion, telefonoCliente, nombreCliente, direccion, explicacion, pedido }
// Si ya hay un precio vigente o una cotización pendiente para esa compra y dirección, la devuelve.
const agentCrearCotizacionUber = conClave(async (req, res) => {
  const b = req.body || {};
  const idConversacion = String(b.idConversacion || "").trim();
  const telefonoCliente = normalizarTelefono(b.telefonoCliente);
  if (!idConversacion || !telefonoCliente) return rechazar(res, "faltan idConversacion o telefonoCliente");
  const direccion = String(b.direccion || "").trim();
  const { cotizaciones, ciclo } = await cotizacionesDeLaCompra(telefonoCliente, direccion);
  const previa = ultima(cotizaciones);
  const vigente = conPrecioVigente(previa);
  if (vigente) {
    return res.json({ ok: true, creada: false, yaCotizado: true, id: vigente.id, montoUber: Number(vigente.montoUber), venceEn: vence(vigente),
      mensaje: `El precio del Flash vigente es ${pesos(vigente.montoUber)} hasta ${vence(vigente)}.` });
  }
  // Una pendiente que el depósito no contestó en 45 minutos, o un precio vencido, se vuelven a pedir.
  const reintento = previa && (vencida(previa) || (previa.estado === "pendiente" && Date.now() - creada(previa) >= VIGENCIA_MS));
  if (previa && !reintento && previa.estado === "pendiente") {
    return res.json({ ok: true, creada: false, yaPendiente: true, id: previa.id, mensaje: "Ya hay una cotización pendiente para esta compra y dirección: esperá al depósito, no pidas otra." });
  }
  if (previa && !reintento && sinCobertura(previa)) {
    return res.json({ ok: true, creada: false, sinCobertura: true, id: previa.id, mensaje: "El Flash no llega a esa dirección: ofrecele correo a sucursal o domicilio." });
  }
  // Id determinista + transacción: dos llamadas simultáneas no pueden abrir dos cotizaciones.
  const clave = hashCorto(`${telefonoCliente}|${normalizar(direccion)}|${ciclo}${reintento ? "|reintento:" + previa.id : ""}`);
  const ref = db.collection("cotizaciones_uber").doc(`compra-${clave}`);
  const nueva = await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return false;
    tx.set(ref, {
      idConversacion, telefonoCliente, direccion,
      nombreCliente: String(b.nombreCliente || "").trim(),
      explicacionCaso: String(b.explicacion || "").trim(),
      pedidoBorrador: b.pedido && typeof b.pedido === "object" ? JSON.parse(JSON.stringify(camposDelPedido(b.pedido))) : null,
      estado: "pendiente", montoUber: null, cicloCompra: ciclo,
      cotizacionAnteriorId: reintento ? previa.id : null,
      recotizacionPorVencimiento: !!reintento && vencida(previa),
      createdAt: new Date().toISOString(),
    });
    return true;
  });
  if (!nueva) return res.json({ ok: true, creada: false, yaPendiente: true, id: ref.id, mensaje: "Ya hay una cotización pendiente para esta compra y dirección: esperá al depósito, no pidas otra." });
  const porVencimiento = !!reintento && vencida(previa);
  res.json({ ok: true, creada: true, id: ref.id, recotizacionPorVencimiento: porVencimiento, ...(porVencimiento ? { mensaje: AVISO_VENCIDO } : {}) });
});

// Una cotización que dejó de ser la de la compra (se canceló, se sustituyó o el cliente ya compró)
// no se le avisa al cliente.
async function sigueVigente(id, c) {
  if (!abierta(c)) return false;
  const pedidos = await db.collection("pedidos").where("telefono", "==", normalizarTelefono(c.telefonoCliente)).get();
  if (pedidos.docs.some((d) => d.data().estado !== "cancelado" && fecha(d.data().createdAt) > fecha(c.createdAt))) return false;
  return ultima((await cotizacionesDeLaCompra(c.telefonoCliente, c.direccion)).cotizaciones)?.id === id;
}

async function urlDelAviso() {
  let base = N8N_POR_DEFECTO;
  try {
    const d = await db.collection("settings").doc("agente").get();
    const delPanel = d.exists ? String(d.data().n8nBase || "").trim().replace(/\/+$/, "") : "";
    if (/^https:\/\/[^\s/]+$/.test(delPanel)) base = delPanel;
  } catch (e) {
    console.error("[bot] no se pudo leer settings/agente, uso el n8n por defecto", e.message);
  }
  return base + WEBHOOK_AVISO;
}

// El depósito cargó el precio ("cotizado") o avisó que no llega ("no_llegamos"): se le avisa al bot.
// El bot contesta { confirmado: true, enviadoEn } cuando le mandó el mensaje al cliente; si no, el
// trigger reintenta y el panel lo sigue mostrando como "Enviando al cliente…".
const onCotizacionUberConfirmada = onDocumentUpdated({ document: "cotizaciones_uber/{id}", retry: true, timeoutSeconds: 180 }, async (event) => {
  const antes = event.data.before.data() || {};
  const c = event.data.after.data() || {};
  if (!["cotizado", "no_llegamos"].includes(c.estado) || antes.estado === c.estado) return;
  const id = event.params.id;
  if (!(await sigueVigente(id, c))) return;
  const noLlegamos = c.estado === "no_llegamos";
  const { data } = await axios.post(
    await urlDelAviso(),
    { idCotizacion: id, idConversacion: c.idConversacion, telefono: c.telefonoCliente, direccion: c.direccion, ...(noLlegamos ? { noLlegamos: true } : { montoUber: c.montoUber }) },
    { headers: { "X-Agent-Key": AGENT_API_KEY }, timeout: 120000 }
  );
  if (data?.confirmado !== true) throw new Error("el bot no confirmó el aviso al cliente de la cotización " + id);
  await db.runTransaction(async (tx) => {
    const ref = db.collection("cotizaciones_uber").doc(id);
    const actual = await tx.get(ref);
    if (!actual.exists || !["cotizado", "no_llegamos"].includes(actual.data().estado) || actual.data().canceladaEn) return;
    tx.set(ref, { ...actual.data(), estado: "procesado", sinCoberturaUber: noLlegamos, procesadoEn: new Date().toISOString(), informadoEn: data.enviadoEn || new Date().toISOString() });
  });
});

module.exports = { precioParaElPedido, cotizacionEnCurso, cerrarCotizaciones, agentCrearCotizacionUber, onCotizacionUberConfirmada };
