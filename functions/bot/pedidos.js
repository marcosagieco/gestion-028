// Pedidos: el resumen de una compra (preview), la carga en el panel del depósito y el cambio de un
// pedido pendiente. Todo lo que es plata o logística se calcula acá: precios, envío, descuentos,
// total, salida y cupo. El agente solo pasa lo que eligió el cliente.
//
// POST /agentPedido
//   { preview: true, ...compra }                  → el resumen, sin guardar nada
//   { ...compra, comprobanteUrl }                 → carga el pedido
//   { pedidoId, ...cambios, preview }             → calcula (preview) o aplica un cambio
// compra = { telefono, idConversacion, idMensajeOrigen, cliente, items, tipoEnvio, direccion,
//            salidaSeleccionada, horaSolicitada, medioPago, envioSeguro, datosCorreo, mayorista }
"use strict";

const { db } = require("./firebase");
const { conClave } = require("./http");
const { normalizarTelefono, hashCorto, pesos } = require("./texto");
const { PAGO_LABEL, formaDePago, pagaAntes, descuentoEfectivo, cotizarProductos } = require("./precios");
const { PRECIO_ENVIO_SEGURO, CORREO, ubicar, armarDireccion, mismaDireccion } = require("./envios");
const { fechaBA, corta, opcionesMoto, elegirSalida, pedidosMoto, pedidosEnCola, salidaUber, uberALaHora, avisoDeHorario } = require("./salidas");
const { esPedidoEnCurso, restriccionCambio } = require("./seguimiento");
const { TOLERANCIA_COMPROBANTE, comprobanteGuardado, copiarAlPedido, vincularAlPedido } = require("./comprobantes");
const { precioParaElPedido, cerrarCotizaciones } = require("./uber");

const ENVIO_LABEL = { moto: "🛵 Moto mensajería", uber: "⚡ Envío flash (Uber)", correo: "📦 Correo (Vía Cargo)" };
const CUENTAS_DE_COBRO = ["alias1", "alias2", "alias3"];

const ok = (body) => ({ status: 200, body: { ok: true, ...body } });
const error = (status, error, extra = {}) => ({ status, body: { ok: false, error, ...extra } });
const faltaDato = (mensaje, extra) => error(400, mensaje, extra);

// La cuenta a la que se le pide que transfiera: la que dijo el comprobante, o la activa del panel.
const cuentaDeCobro = (pedida, op) => (CUENTAS_DE_COBRO.includes(pedida) ? pedida : CUENTAS_DE_COBRO.includes(op.aliasActivo) ? op.aliasActivo : "alias1");

// El pedido que se quiere cambiar: tiene que ser del bot, de este cliente, en curso y pendiente.
async function pedidoAModificar(pedidoId, telefono, idMensajeOrigen, preview) {
  const ref = db.collection("pedidos").doc(String(pedidoId));
  const snap = await ref.get();
  const anterior = snap.exists ? snap.data() : null;
  if (!anterior || anterior.origen !== "bot_n8n" || anterior.telefono !== telefono) {
    return { respuesta: error(403, "no se puede modificar ese pedido para este cliente") };
  }
  if (!esPedidoEnCurso(anterior)) {
    return { respuesta: error(409, "Ese pedido es de una compra anterior: no lo uses para esta compra. Seguí con los productos, la entrega y el pago de la compra nueva, sin pedidoId.", { continuarCompra: true, motivo: "pedido_anterior" }) };
  }
  if (anterior.estado !== "pendiente") {
    const cambio = restriccionCambio(anterior);
    return { respuesta: error(409, cambio.mensaje || "el pedido ya no está pendiente: no crees otro pedido", cambio) };
  }
  // El mismo mensaje del cliente no aplica dos veces el mismo cambio (reintentos de n8n).
  if (!preview && idMensajeOrigen && anterior.ultimoMensajeModificacion === String(idMensajeOrigen)) {
    return { respuesta: ok({ pedidoId: ref.id, mensaje: anterior.mensaje, total: anterior.total, reutilizado: true, modificado: true }) };
  }
  return { ref, anterior };
}

// Un pedido nuevo tiene un id que sale del mensaje que lo originó (o del comprobante): si n8n
// reintenta, no se carga dos veces.
function idDelPedidoNuevo(b, telefono) {
  const conversacion = String(b.idConversacion || "").trim();
  const mensaje = String(b.idMensajeOrigen || "").trim();
  const numero = String(b.comprobante?.numero || "").replace(/\D/g, "");
  const origen = conversacion && mensaje ? `chatwoot:${conversacion}:${mensaje}` : numero ? `comprobante:${telefono}:${numero}` : "";
  return origen ? hashCorto(origen) : null;
}

// El comprobante del pago, tal como lo guardó agentGuardarComprobante al llegar. Los datos del pago
// salen siempre de ahí, nunca de lo que escribió el modelo.
async function comprobanteDelPago(url, telefono, idConversacion, pedidoId) {
  const c = await comprobanteGuardado(url);
  if (!c || c.telefono !== telefono || String(c.idConversacion ?? "") !== String(idConversacion ?? "")) {
    return { error: "Ese comprobante no está guardado para esta conversación: no confirmes el pedido ni el pago." };
  }
  if (!c.cuentaCobro) return { error: "El comprobante no va a ninguna cuenta del negocio: derivá para que lo revise el equipo.", derivar: true };
  if (c.pedidoId && c.pedidoId !== pedidoId) return { error: "Ese comprobante ya está vinculado a otro pedido; no se puede volver a usar.", derivar: true };
  if (!c.comprobante?.numero || !(c.comprobante.monto > 0)) return { error: "El comprobante no tiene número de operación e importe legibles: pedile otro." };
  return { comprobante: c.comprobante, cuentaCobro: c.cuentaCobro };
}

// El resumen que ve el cliente y que queda en el panel como texto del pedido.
function armarDetalle(d) {
  const { preview, modificacion, cuando, horaPedida, tipoEnvio, lineas, mayorista, subtotal, subtotalUSD, dolar, valorEnvio, envioSeguro,
    montoDescuento, total, envioCorreo, despachoMayorista, dir, ubicacion, correo, cliente, telefono, medioPago, aTransferir, comprobante,
    adicionales, pagaAntesDeCargar, avisoHorario } = d;
  // Si no sale hoy, va arriba de todo: la gente no lee el detalle y después se queja.
  const noSaleHoy = cuando && cuando.dia !== "hoy";
  const avisoNoRegistrado = !preview ? null
    : modificacion ? "Cambio propuesto: el pedido existente todavia no fue actualizado."
      : pagaAntesDeCargar ? "⚠️ Todavía no está registrado para despacho. Para registrarlo, mandá el comprobante de pago."
        : "⚠️ Todavía no está registrado para despacho. Para registrarlo, confirmame el pedido.";
  const avisoSalida = noSaleHoy ? `⚠️ OJO: ${preview ? "SI CONFIRMÁS AHORA, " : ""}SALE ${cuando.dia.toUpperCase()}, ${corta(cuando.fecha)}, A LAS ${cuando.hora}` : null;
  const lineaSalida = cuando
    ? `🕐 ${preview ? "Si confirmás el pedido ahora, sale" : "Sale"} ${cuando.dia}, ${corta(cuando.fecha)}, a las ${cuando.hora}${horaPedida ? " (horario pedido por el cliente)" : ""}`
    : null;
  const conBlanco = (linea) => (linea ? [linea, ""] : []);
  return [
    ...conBlanco(avisoSalida),
    ...conBlanco(avisoNoRegistrado),
    ...conBlanco(avisoHorario),
    "🛒 PRODUCTOS",
    ...lineas.map((l) => `* ${l.cantidad}x ${l.producto}${l.variante ? " - " + l.variante : ""}: ${pesos(l.importe)}${mayorista ? ` (mayorista USD ${l.precioUnitarioUSD} c/u)` : ""}`),
    "",
    "💰 TOTALES",
    `Subtotal: ${pesos(subtotal)}`,
    mayorista ? `Subtotal mayorista: USD ${subtotalUSD} — dolar: ${pesos(dolar)}` : null,
    valorEnvio ? `Envío: ${pesos(valorEnvio)}` : null,
    envioSeguro ? `🛡️ Envío seguro: ${pesos(PRECIO_ENVIO_SEGURO)}` : null,
    montoDescuento ? `💵 Descuento por efectivo: -${pesos(montoDescuento)}` : null,
    `TOTAL A PAGAR: ${pesos(total)}`,
    envioCorreo ? `(el envío por correo, ${pesos(envioCorreo)}, se le paga a Vía Cargo al recibir)` : null,
    "",
    "📦 ENTREGA",
    ENVIO_LABEL[tipoEnvio] + (envioSeguro ? " — 🛡️ CON ENVÍO SEGURO" : "") + (tipoEnvio === "correo" ? (correo.aSucursal ? " a sucursal" : " a domicilio") : ""),
    despachoMayorista ? "Traslado interno a despacho: motomensajeria, primera tanda. No es la entrega al cliente." : null,
    lineaSalida,
    dir.texto,
    ubicacion && ubicacion.zona ? `Zona ${ubicacion.zona}` : null,
    dir.referencias ? `Ref: ${dir.referencias}` : null,
    tipoEnvio === "correo" && correo.dni ? `DNI: ${correo.dni} — ${correo.localidad} (CP ${correo.cp})` : null,
    "",
    "👤 CLIENTE",
    `${cliente || "-"} — ${telefono}`,
    "",
    `💳 ${PAGO_LABEL[medioPago]}`,
    aTransferir ? `A transferir ahora: ${pesos(aTransferir)}` : null,
    aTransferir ? `En efectivo al recibir: ${pesos(total - aTransferir)}` : null,
    comprobante && comprobante.numero ? `Comprobante: ${comprobante.numero}` : null,
    ...adicionales.map((p) => `Comprobante adicional: ${p.numero} — ${pesos(p.monto)}`),
  ].filter((l) => l !== null).join("\n");
}

async function procesarPedido(entrada) {
  const preview = entrada.preview === true || entrada.preview === "true";
  const telefono = normalizarTelefono(entrada.telefono);

  // ── El pedido anterior, si es un cambio ──
  let anterior = null, refAnterior = null;
  if (entrada.pedidoId) {
    const r = await pedidoAModificar(entrada.pedidoId, telefono, entrada.idMensajeOrigen, preview);
    if (r.respuesta) return r.respuesta;
    ({ anterior, ref: refAnterior } = r);
  } else if (!preview) {
    const id = idDelPedidoNuevo(entrada, telefono);
    const existente = id ? await db.collection("pedidos").doc(`bot-${id}`).get() : null;
    if (existente?.exists) return ok({ pedidoId: existente.id, mensaje: existente.data().mensaje, total: existente.data().total, reutilizado: true });
  }
  const envioAnterior = anterior && (anterior.datosCorreo ? "correo" : anterior.tipoEnvio);
  const b = anterior ? { ...anterior, tipoEnvio: envioAnterior, ...entrada } : { ...entrada };
  if (anterior && entrada.direccion && typeof entrada.direccion === "object") b.direccion = { ...anterior.direccion, ...entrada.direccion };
  if (anterior && entrada.datosCorreo) b.datosCorreo = { ...anterior.datosCorreo, ...entrada.datosCorreo };
  if (anterior && entrada.tipoEnvio && entrada.tipoEnvio !== envioAnterior && entrada.horaSolicitada === undefined) b.horaSolicitada = null;

  const { tipoEnvio } = b;
  const medioPago = formaDePago(b.medioPago);
  const conComprobante = pagaAntes(medioPago);
  const dir = armarDireccion(b.direccion);
  const correo = b.datosCorreo || {};
  const items = Array.isArray(b.items) ? b.items : [];
  const mayorista = b.mayorista === true || b.mayorista === "true";
  if (!["moto", "uber", "correo"].includes(tipoEnvio)) return faltaDato("tipoEnvio tiene que ser moto, uber o correo");
  if (medioPago && medioPago !== "transferencia" && tipoEnvio !== "moto") {
    return faltaDato("en Uber y correo se paga solo por transferencia antes; efectivo, al recibir y mitad y mitad son solo con moto");
  }

  // ── Lo que falta para calcular el resumen y, si no es preview, para cargar el pedido ──
  const faltan = [];
  if (!telefono) faltan.push("el teléfono");
  if (!items.length) faltan.push("los productos");
  if (!dir.texto) faltan.push("la dirección");
  if (!medioPago) faltan.push("el medio de pago (transferencia, efectivo, al recibir o mitad y mitad)");
  if (tipoEnvio === "correo" && typeof correo.aSucursal !== "boolean") faltan.push("si el correo va a sucursal o a domicilio");
  if (!preview) {
    if (!String(b.cliente || "").trim()) faltan.push("a nombre de quién va el pedido");
    if (conComprobante && !anterior?.comprobante && !entrada.comprobanteUrl) faltan.push("el comprobante de pago");
    if (tipoEnvio === "correo") {
      for (const [campo, label] of [["dni", "el DNI"], ["localidad", "la localidad"], ["cp", "el código postal"]]) {
        if (!String(correo[campo] || "").trim()) faltan.push(label);
      }
    }
  }
  if (faltan.length) return faltaDato(`falta ${faltan.join(", ")}: pedíselo al cliente antes de volver a intentar`);

  // ── Envío: la moto se cotiza con la dirección y el Uber con lo que cargó el depósito ──
  let valorEnvio = 0, ubicacion = null;
  if (tipoEnvio === "moto") {
    ubicacion = await ubicar(dir.texto);
    if (!ubicacion) return faltaDato("no pude ubicar la dirección: pedile calle, altura y barrio");
    if (!ubicacion.cubiertoMoto) return faltaDato("esa dirección no entra en moto: ofrecele Uber o correo");
    valorEnvio = ubicacion.monto;
  } else if (tipoEnvio === "uber") {
    if (envioAnterior === "uber" && mismaDireccion(anterior.direccion?.texto, dir.texto)) {
      valorEnvio = anterior.valorEnvio; // un cambio de productos mantiene el Uber ya cotizado
    } else {
      const precio = await precioParaElPedido(telefono, dir.texto);
      if (precio.vencida) {
        // Si ya pagó con un precio que venció, lo revisa el equipo.
        if (!preview && entrada.comprobanteUrl) return error(409, "El cliente ya envió un comprobante y la cotización del Uber venció: derivá al equipo para revisar ese pago.", { derivar: true, motivo: "pago_cotizacion_vencida" });
        return error(409, precio.error, { cotizacionVencida: true, necesitaRecotizacion: true });
      }
      if (precio.error) return faltaDato(precio.error, { necesitaCotizacion: true });
      valorEnvio = precio.monto;
    }
  }

  // ── Precios, siempre de las listas del día ──
  const op = (await db.collection("settings").doc("operativo").get()).data() || {};
  const conservar = !!anterior && entrada.items === undefined;
  let cotizacion;
  try { cotizacion = cotizarProductos(op, items, { mayorista, conservar, medioPago }); }
  catch (e) { return faltaDato(e.message); }
  const { lineas, subtotalUSD } = cotizacion;
  const dolar = conservar ? anterior.dolarMayorista : cotizacion.dolarMayorista;
  if (mayorista && !conservar && !(Number.isFinite(dolar) && dolar > 0)) {
    if (!preview) return faltaDato("falta cargar el valor del dolar mayorista en el panel: no inventes el total en pesos ni registres el pedido");
    return ok({ preview: true, necesitaTipoCambio: true, moneda: "USD", subtotalUSD,
      mensaje: ["PRODUCTOS MAYORISTAS", ...lineas.map((l) => `${l.cantidad}x ${l.producto}${l.variante ? " - " + l.variante : ""}: USD ${l.precioUnitarioUSD} c/u`),
        `Subtotal productos: USD ${subtotalUSD}`, "Total en pesos pendiente del valor del dolar mayorista del panel. El envio se cotiza en pesos por separado."].join("\n") });
  }

  // ── El comprobante: el principal al cargar, o uno adicional si el cambio sube el total ──
  let comprobante = anterior?.comprobante || null;
  let cuentaCobro = anterior?.cuentaCobro || null;
  let pagoAdicional = null;
  if (!preview && conComprobante && entrada.comprobanteUrl) {
    const pago = await comprobanteDelPago(entrada.comprobanteUrl, telefono, b.idConversacion, anterior ? refAnterior.id : null);
    if (pago.error) return error(400, pago.error, { requiereComprobante: true, derivar: pago.derivar === true });
    if (anterior && anterior.comprobante && anterior.comprobante.numero !== pago.comprobante.numero) pagoAdicional = pago.comprobante;
    else ({ comprobante, cuentaCobro } = pago);
  }

  const subtotal = lineas.reduce((s, l) => s + l.importe, 0);
  const envioSeguro = tipoEnvio === "uber" && (b.envioSeguro === true || b.envioSeguro === "true");
  const montoDescuento = medioPago === "efectivo" && !mayorista ? descuentoEfectivo(subtotal) : 0;
  const total = subtotal + valorEnvio + (envioSeguro ? PRECIO_ENVIO_SEGURO : 0) - montoDescuento;
  const envioCorreo = tipoEnvio === "correo" ? CORREO[correo.aSucursal ? "sucursal" : "domicilio"] : 0;
  const aTransferir = medioPago === "mitad y mitad" ? Math.ceil(total / 2) : 0;

  // ── Salida ──
  const despachoMayorista = mayorista && tipoEnvio === "correo"; // la moto lo lleva al despacho
  const usaTandaMoto = tipoEnvio === "moto" || despachoMayorista;
  const conservarSalida = anterior && !Object.hasOwn(entrada, "salidaSeleccionada") && anterior.fechaSalida && anterior.horaSalida && tipoEnvio === envioAnterior;
  const salidaAnterior = conservarSalida && { fecha: anterior.fechaSalida, hora: anterior.horaSalida, tandaId: anterior.tandaSalida, dia: anterior.fechaSalida === fechaBA(new Date()) ? "hoy" : `el ${corta(anterior.fechaSalida)}` };
  let opciones = [];
  let cuando = tipoEnvio === "uber" ? salidaAnterior || salidaUber(op, await pedidosEnCola()) : null;
  if (usaTandaMoto) {
    opciones = opcionesMoto(op, await pedidosMoto(), new Date(), refAnterior?.id);
    cuando = salidaAnterior || elegirSalida(opciones, entrada.salidaSeleccionada, despachoMayorista);
    if (!cuando || (!preview && !despachoMayorista && !entrada.salidaSeleccionada && !conservarSalida)) {
      return faltaDato("elegi una fecha y tanda de moto disponible; no se puede usar una salida pasada o llena", { opcionesMoto: opciones.slice(0, 4) });
    }
  }
  if (tipoEnvio === "uber" && !cuando) return faltaDato("No hay una salida de Uber disponible en las fechas configuradas; ofrece correo con su plazo real o consulta al equipo.");
  const horaPedida = String(b.horaSolicitada || "").trim();
  if (horaPedida && tipoEnvio !== "uber") return faltaDato("la hora solicitada solo se puede programar para Uber");
  if (horaPedida && !(conservarSalida && entrada.horaSolicitada === undefined)) {
    const r = uberALaHora(op, horaPedida, cuando);
    if (r.error) return faltaDato(r.error);
    cuando = r.salida;
  }

  // ── Pago: lo transferido tiene que coincidir con lo que había que transferir ──
  const esperado = medioPago === "mitad y mitad" ? aTransferir : total;
  const adicionales = anterior?.comprobantesAdicionales || [];
  if (pagoAdicional && adicionales.some((p) => String(p.numero) === String(pagoAdicional.numero))) return faltaDato("ese comprobante adicional ya esta registrado: no lo sumes otra vez");
  const pagado = anterior && !pagoAdicional && comprobante === anterior.comprobante
    ? Number(anterior.montoPagado ?? anterior.comprobante?.monto ?? anterior.montoTransferencia ?? 0)
    : comprobante ? Number(comprobante.monto) : 0;
  const recibido = conComprobante ? pagado + (pagoAdicional ? Number(pagoAdicional.monto) : 0) : null;
  const diferencia = recibido !== null ? recibido - esperado : null;
  if (!preview && conComprobante) {
    if (anterior && recibido === 0) return faltaDato("El pedido anterior se pagaba al recibir y no tiene un pago previo registrado. Pedí la transferencia del total y el comprobante antes de cambiarlo a Uber o correo.", { requierePago: true });
    if (anterior && diferencia < -TOLERANCIA_COMPROBANTE && !pagoAdicional) return faltaDato(`el cambio requiere un pago adicional de ${pesos(-diferencia)}: pide ese comprobante antes de modificar`, { requierePago: true });
    if (Math.abs(diferencia) > TOLERANCIA_COMPROBANTE) return error(400, "el importe difiere en mas de $5.000 del monto a transferir: deriva para verificar", { derivar: true, motivo: "comprobante_dudoso", diferencia });
  }

  // Si sale hoy y falta poco para el cierre, el resumen lo avisa antes de que pague.
  const salidaHoy = preview && ["moto", "uber"].includes(tipoEnvio) && cuando?.fecha === fechaBA(new Date());
  const avisoHorario = salidaHoy ? avisoDeHorario(op, tipoEnvio === "moto" ? cuando : null, tipoEnvio === "uber" ? cuando : null).aviso?.texto : null;
  const mensaje = armarDetalle({
    preview, modificacion: !!anterior, cuando, horaPedida, tipoEnvio, lineas, mayorista, subtotal, subtotalUSD, dolar, valorEnvio, envioSeguro,
    montoDescuento, total, envioCorreo, despachoMayorista, dir, ubicacion, correo, cliente: b.cliente, telefono, medioPago, aTransferir,
    comprobante, adicionales: [...adicionales, ...(pagoAdicional ? [pagoAdicional] : [])], pagaAntesDeCargar: conComprobante,
    avisoHorario: avisoHorario || null,
  });

  if (preview) {
    return ok({ preview: true, mensaje, total, salida: cuando, opcionesMoto: opciones.slice(0, 4), pedidoId: refAnterior?.id || null,
      saldoPendiente: anterior && diferencia < 0 ? -diferencia : 0, requiereTransferencia: conComprobante && (!anterior || diferencia < 0) });
  }

  // ── Guardar ──
  // El depósito maneja el correo como un retiro (arma el paquete y lo lleva a Vía Cargo): va a la
  // columna Retiro del panel con una primera línea que lo deja claro, igual que lo cargan ellos.
  const esCorreo = tipoEnvio === "correo";
  const idempotencia = refAnterior ? anterior.idempotencia : idDelPedidoNuevo({ ...b, comprobante }, telefono);
  const ref = refAnterior || (idempotencia ? db.collection("pedidos").doc(`bot-${idempotencia}`) : db.collection("pedidos").doc());
  const ahora = new Date().toISOString();
  const pedido = {
    // Campos que ya usaba el panel:
    mensaje: esCorreo ? `📦 VÍA CARGO — ${correo.aSucursal ? "SUCURSAL" : "DOMICILIO"}\n\n${mensaje}` : mensaje,
    estado: "pendiente",
    tipoEnvio: despachoMayorista ? "moto" : esCorreo ? "retiro" : tipoEnvio,
    createdAt: ahora,
    // Estructurados del bot:
    telefono,
    idConversacion: String(b.idConversacion || "").trim() || null,
    idMensajeOrigen: String(b.idMensajeOrigen || "").trim() || null,
    origen: "bot_n8n",
    schemaVersion: 3,
    idempotencia,
    cliente: String(b.cliente).trim(),
    direccion: { texto: dir.texto, referencias: dir.referencias || null, lat: ubicacion?.lat ?? null, lng: ubicacion?.lng ?? null, zona: ubicacion?.zona ?? null },
    items: lineas,
    valorEnvio,
    envioSeguro,
    montoEnvioSeguro: envioSeguro ? PRECIO_ENVIO_SEGURO : 0,
    montoDescuento,
    total,
    mayorista,
    subtotalUSD: mayorista ? subtotalUSD : null,
    dolarMayorista: mayorista ? dolar : null,
    entregaCliente: tipoEnvio,
    despachoInterno: despachoMayorista ? "moto_a_via_cargo" : null,
    fechaSalida: cuando?.fecha || null,
    horaSalida: cuando?.hora || null,
    tandaSalida: cuando?.tandaId || null,
    repartidor: usaTandaMoto ? (conservarSalida && anterior.repartidor ? anterior.repartidor : cuando.tandaId === "segunda" ? "moto2" : "moto1") : null,
    medioPago,
    horaSolicitada: horaPedida ? cuando.hora : null,
    montoTransferencia: aTransferir || null,
    cuentaCobro: conComprobante ? cuentaDeCobro(cuentaCobro, op) : null,
    comprobante: comprobante || null,
    montoPagado: conComprobante ? recibido : null,
    comprobantesAdicionales: [...adicionales, ...(pagoAdicional ? [{ numero: String(pagoAdicional.numero), monto: Number(pagoAdicional.monto) }] : [])],
    comprobanteImagen: null,
    datosCorreo: esCorreo ? { dni: String(correo.dni).trim(), localidad: String(correo.localidad).trim(), cp: String(correo.cp).trim(), aSucursal: correo.aSucursal, valor: envioCorreo } : null,
  };
  // Un mismo pago (cuenta + número de operación) no puede quedar en dos pedidos.
  const pagoNuevo = pagoAdicional || (!anterior || comprobante !== anterior.comprobante ? comprobante : null);
  const numeroPago = String(pagoNuevo?.numero || "").replace(/\D/g, "");
  const refPago = numeroPago ? db.collection("bot_pagos").doc(hashCorto(`${cuentaCobro || ""}|${numeroPago}`)) : null;

  const resultado = await db.runTransaction(async (tx) => {
    const actualSnap = await tx.get(ref);
    const actual = actualSnap.exists ? actualSnap.data() : null;
    const pagoSnap = refPago ? await tx.get(refPago) : null;
    if (pagoSnap?.exists && pagoSnap.data().pedidoId !== ref.id) return { pagoRepetido: true };
    if (refAnterior) {
      if (actual?.estado !== "pendiente") return { bloqueado: restriccionCambio(actual) };
      if (actual.updatedAt !== anterior.updatedAt || actual.total !== anterior.total || actual.mensaje !== anterior.mensaje) return { conflicto: true };
    } else if (actual) return { reutilizado: actual };
    if (usaTandaMoto && !conservarSalida) {
      // El documento de la tanda serializa las altas simultáneas, aunque la tanda esté vacía.
      const lock = db.collection("bot_tandas").doc(`${cuando.fecha}-${cuando.tandaId}`);
      const lockSnap = await tx.get(lock);
      const config = await tx.get(db.collection("settings").doc("operativo"));
      const agendados = await tx.get(db.collection("pedidos").where("fechaSalida", "==", cuando.fecha));
      const disponibles = opcionesMoto(config.exists ? config.data() : {}, agendados.docs.map((d) => ({ ...d.data(), id: d.id })), new Date(), refAnterior?.id);
      if (!elegirSalida(disponibles, cuando, despachoMayorista)) return { sinCupo: true };
      tx.set(lock, { version: Number(lockSnap.exists ? lockSnap.data().version : 0) + 1 });
    }
    if (refPago) tx.set(refPago, { pedidoId: ref.id, telefono, createdAt: ahora });
    tx.set(ref, refAnterior ? {
      ...actual, ...pedido, estado: actual.estado, createdAt: actual.createdAt, idempotencia: actual.idempotencia,
      idMensajeOrigen: actual.idMensajeOrigen, cuentaCobro: actual.cuentaCobro || pedido.cuentaCobro, comprobanteImagen: actual.comprobanteImagen,
      updatedAt: ahora, ultimoMensajeModificacion: String(entrada.idMensajeOrigen || ""),
    } : pedido);
    return {};
  });
  if (resultado.pagoRepetido) return error(409, "Ese comprobante ya está vinculado a otro pedido; no se puede volver a usar.", { derivar: true, motivo: "comprobante_dudoso" });
  if (resultado.bloqueado) return error(409, resultado.bloqueado.mensaje || "el depósito cambió el estado; no crees otro pedido", resultado.bloqueado);
  if (resultado.conflicto) return error(409, "el pedido cambio durante la modificacion: consulta el estado y vuelve a confirmar");
  if (resultado.sinCupo) return error(409, "la tanda elegida ya no esta disponible: consulta las salidas y pide elegir otra");
  if (resultado.reutilizado) return ok({ pedidoId: ref.id, mensaje: resultado.reutilizado.mensaje, total: resultado.reutilizado.total, reutilizado: true });

  if (conComprobante && entrada.comprobanteUrl) {
    const adicionalId = pagoAdicional ? hashCorto(pagoAdicional.numero) : null;
    const imagen = await copiarAlPedido(entrada.comprobanteUrl, ref.id, adicionalId);
    if (imagen && adicionalId) {
      await db.runTransaction(async (tx) => {
        const data = (await tx.get(ref)).data();
        tx.set(ref, { ...data, comprobantesAdicionales: data.comprobantesAdicionales.map((p) => String(p.numero) === String(pagoAdicional.numero) ? { ...p, imagen } : p) });
      });
    } else if (imagen) await ref.update({ comprobanteImagen: imagen });
    await vincularAlPedido(entrada.comprobanteUrl, ref.id);
  }
  await cerrarCotizaciones(telefono, ref.id, tipoEnvio, dir.texto);
  return ok({ pedidoId: ref.id, mensaje, total, salida: cuando, reutilizado: false, modificado: !!refAnterior, tipoEnvio });
}

const agentPedido = conClave(async (req, res) => {
  const { status, body } = await procesarPedido(req.body || {});
  res.status(status).json(body);
});

module.exports = { agentPedido };
