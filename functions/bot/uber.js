// Cotización del Flash (Uber). El agente la pide → el depósito carga el precio en /cotizar-uber → el
// bot lo busca (cada minuto) y se lo pasa al cliente. El precio vale 45 minutos desde que se le
// informa; un pedido cargado cierra las cotizaciones de esa compra.
"use strict";

const { db } = require("./firebase");
const { conClave, rechazar } = require("./http");
const { normalizar, normalizarTelefono, hashCorto, pesos } = require("./texto");
const { mismaDireccion } = require("./envios");
const { fechaBA, horaBuenosAires, horarioUber, salidaUber, diasSinDespacho } = require("./salidas");
const { leerOperativo } = require("./campania");

const VIGENCIA_MS = 45 * 60000;
const MENSAJE_SIN_COBERTURA = "Hoy el Flash no llega a esa dirección: ofrecé correo (sucursal o domicilio) o moto si llega. Si prefiere Flash otro día, ese día pedí la cotización de nuevo.";
const AVISO_VENCIDO = "como pasaron más de 45 minutos, te tengo que cotizar el Uber de vuelta";

const fecha = (v) => Date.parse(v || "") || 0;
const creada = (c) => fecha(c.createdAt) || fecha(c.resueltoEn);
const inicioPrecio = (c) => fecha(c.informadoEn || c.resueltoEn || c.procesadoEn || c.createdAt);
const vencida = (c) => Number(c?.montoUber) > 0 && (!inicioPrecio(c) || Date.now() > inicioPrecio(c) + VIGENCIA_MS);
const vence = (c) => new Date(inicioPrecio(c) + VIGENCIA_MS).toISOString();
const sinCobertura = (c) => c.sinCoberturaUber === true || c.estado === "no_llegamos" || (c.estado === "procesado" && !(Number(c.montoUber) > 0));
// «No llegamos» vale para el día en que lo dijo el depósito: otro día el cliente puede volver a pedir Flash.
const sinCoberturaHoy = (c) => sinCobertura(c) && fechaBA(new Date(fecha(c.resueltoEn || c.procesadoEn || c.createdAt))) === fechaBA(new Date());
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
// montoAnterior es el último precio que se le pasó al cliente (aunque haya vencido o haya una
// recotización pendiente): con eso se carga el pedido si el cliente ya transfirió.
async function precioParaElPedido(telefono, direccion) {
  const { cotizaciones } = await cotizacionesDeLaCompra(telefono, direccion);
  const c = ultima(cotizaciones);
  if (conPrecioVigente(c)) return { monto: Number(c.montoUber) };
  const conPrecio = [...cotizaciones].reverse().find((x) => Number(x.montoUber) > 0);
  const montoAnterior = conPrecio ? Number(conPrecio.montoUber) : null;
  if (vencida(c)) return { vencida: true, montoAnterior, error: AVISO_VENCIDO + ". Pedí una nueva cotización con pedir_cotizacion_flash; no uses el importe anterior." };
  return { montoAnterior, error: "todavía no hay un precio de Uber vigente para esta compra y dirección: pedilo con pedir_cotizacion_flash" };
}

// Lo que sabe el agente de la cotización en curso (para el estado del día).
async function cotizacionEnCurso(telefono) {
  const c = ultima((await cotizacionesDeLaCompra(telefono)).cotizaciones);
  if (!c) return null;
  if (conPrecioVigente(c)) return { id: c.id, estado: "cotizado", montoUber: Number(c.montoUber), direccion: c.direccion || "", venceEn: vence(c) };
  if (c.estado === "pendiente") return { id: c.id, estado: "pendiente", direccion: c.direccion || "" };
  if (vencida(c)) return { id: c.id, estado: "vencido", direccion: c.direccion || "", montoAnterior: Number(c.montoUber), necesitaRecotizacion: true, mensaje: AVISO_VENCIDO };
  if (sinCoberturaHoy(c)) return { id: c.id, estado: "sin_cobertura_hoy", direccion: c.direccion || "", mensaje: MENSAJE_SIN_COBERTURA };
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

// El Flash se cotiza a cualquier hora (Lucio, 6/11): fuera del horario de salidas lo único que espera es la
// salida. Antes se le decía al cliente «se cotiza desde las 13:30» y el precio no llegaba hasta esa hora.
// null si ahora hay salidas de Flash; si no, cuándo saldría, para decírselo al cliente desde el primer mensaje.
function salidaFueraDeHorario(op, ahora = new Date()) {
  const a = horaBuenosAires(ahora);
  const h = horarioUber(a.dia, a.fecha, op.horariosUberPorFecha || {});
  if (h && a.minutos >= h.inicio && a.minutos < h.fin && !diasSinDespacho(op).includes(a.fecha)) return null;
  const proximo = salidaUber(op, 0, ahora);
  return `Ahora no hay salida de Flash: si confirma, sale ${proximo ? `${proximo.dia} a las ${proximo.hora}` : "el próximo día con despacho"}. Decíselo desde ahora.`;
}

// POST /agentCrearCotizacionUber — { idConversacion, telefonoCliente, nombreCliente, direccion, explicacion, pedido }
// Si ya hay un precio vigente o una cotización pendiente para esa compra y dirección, la devuelve.
// avisarAlEquipo: hay que avisarle al depósito por WhatsApp (una cotización nueva o una que no contestó).
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
  const salida = salidaFueraDeHorario(await leerOperativo());
  const conSalida = (texto) => (salida ? `${texto} ${salida}` : texto);
  // Una sola cotización abierta por compra y dirección: si el depósito no la contestó en 45 minutos, se le
  // vuelve a avisar de la misma. Con dos, el precio cargado en la vieja se descartaba sin avisar.
  if (previa && previa.estado === "pendiente") {
    const sinRespuesta = Date.now() - fecha(previa.reavisadaEn || previa.createdAt) >= VIGENCIA_MS;
    if (sinRespuesta) {
      await db.collection("cotizaciones_uber").doc(previa.id).update({ reavisadaEn: new Date().toISOString() });
      return res.json({ ok: true, creada: false, yaPendiente: true, avisarAlEquipo: true, id: previa.id,
        mensaje: conSalida("El depósito todavía no la cotizó: se le volvió a avisar. Decile al cliente que se la pasás apenas esté.") });
    }
    return res.json({ ok: true, creada: false, yaPendiente: true, id: previa.id,
      mensaje: conSalida("Ya hay una cotización pendiente para esta compra y dirección: esperá al depósito, no pidas otra.") });
  }
  if (previa && sinCoberturaHoy(previa)) return res.json({ ok: true, creada: false, sinCobertura: true, id: previa.id, mensaje: MENSAJE_SIN_COBERTURA });
  // Un precio vencido se vuelve a pedir: la cotización vieja ya está cerrada.
  const reintento = previa && vencida(previa);
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
      recotizacionPorVencimiento: !!reintento,
      createdAt: new Date().toISOString(),
    });
    return true;
  });
  if (!nueva) return res.json({ ok: true, creada: false, yaPendiente: true, id: ref.id, mensaje: "Ya hay una cotización pendiente para esta compra y dirección: esperá al depósito, no pidas otra." });
  const porVencimiento = !!reintento;
  const pedida = "La cotización ya quedó pedida: el depósito la cotiza y el precio le llega por acá; no la vuelvas a pedir.";
  const mensaje = porVencimiento ? conSalida(AVISO_VENCIDO) : salida ? conSalida(pedida) : null;
  res.json({ ok: true, creada: true, avisarAlEquipo: true, id: ref.id, recotizacionPorVencimiento: porVencimiento, ...(mensaje ? { mensaje } : {}) });
});

// Una cotización que dejó de ser la de la compra (se canceló, se sustituyó o el cliente ya compró)
// no se le avisa al cliente.
async function sigueVigente(id, c) {
  if (!abierta(c)) return false;
  const pedidos = await db.collection("pedidos").where("telefono", "==", normalizarTelefono(c.telefonoCliente)).get();
  if (pedidos.docs.some((d) => d.data().estado !== "cancelado" && fecha(d.data().createdAt) > fecha(c.createdAt))) return false;
  return ultima((await cotizacionesDeLaCompra(c.telefonoCliente, c.direccion)).cotizaciones)?.id === id;
}

const AVISO_NO_LLEGAMOS_MS = 24 * 3600000;

// GET /agentAvisosCotizacionUber — lo que el bot tiene que avisarle a cada cliente: los precios que cargó
// el depósito hace menos de 45 minutos y los «no llegamos». El n8n lo consulta cada minuto: el backend
// no llama al n8n, porque esa llamada se cortaba en el servidor y el cliente se quedaba sin el precio.
// Una que ya no corresponde avisar (venció, se canceló o el cliente ya compró) queda procesada sin aviso.
// POST /agentAvisosCotizacionUber { id, enviadoEn } — el bot ya se lo mandó al cliente: el precio vale
// 45 minutos desde ese momento.
const agentAvisosCotizacionUber = conClave(async (req, res) => {
  const ahora = new Date().toISOString();
  if (req.method === "POST") {
    const id = String(req.body?.id || "").trim();
    if (!id) return rechazar(res, "falta el id de la cotización");
    const ref = db.collection("cotizaciones_uber").doc(id);
    const marcado = await db.runTransaction(async (tx) => {
      const actual = await tx.get(ref);
      if (!actual.exists || !["cotizado", "no_llegamos"].includes(actual.data().estado) || actual.data().canceladaEn) return false;
      tx.set(ref, { ...actual.data(), estado: "procesado", sinCoberturaUber: actual.data().estado === "no_llegamos", procesadoEn: ahora, informadoEn: String(req.body.enviadoEn || ahora) });
      return true;
    });
    return res.json({ ok: true, marcado });
  }
  const snap = await db.collection("cotizaciones_uber").where("estado", "in", ["cotizado", "no_llegamos"]).get();
  const avisos = [];
  for (const d of snap.docs) {
    const c = d.data();
    const noLlegamos = c.estado === "no_llegamos";
    const aTiempo = Date.now() - fecha(c.resueltoEn || c.createdAt) < (noLlegamos ? AVISO_NO_LLEGAMOS_MS : VIGENCIA_MS);
    if (!aTiempo || !(await sigueVigente(d.id, c))) {
      await db.collection("cotizaciones_uber").doc(d.id).update({ estado: "procesado", sinCoberturaUber: noLlegamos, procesadoEn: ahora, avisoNoEnviado: true });
      continue;
    }
    avisos.push({ id: d.id, idConversacion: c.idConversacion, telefono: c.telefonoCliente, direccion: c.direccion || "", ...(noLlegamos ? { noLlegamos: true } : { montoUber: Number(c.montoUber) }) });
  }
  res.json({ ok: true, avisos });
});

module.exports = { precioParaElPedido, cotizacionEnCurso, cerrarCotizaciones, agentCrearCotizacionUber, agentAvisosCotizacionUber };
