// Salidas: cuándo sale un pedido. La moto tiene dos salidas por día con cupo (el depósito las
// configura en /operativo); el Uber sale en tandas de media hora entre las 13:30 y las 20:00.
"use strict";

const { db } = require("./firebase");

const ZONA = "America/Argentina/Buenos_Aires";
const LIMITE_POR_TANDA = 10; // si el panel no tiene uno cargado
const CADA_TANDA_UBER = 30; // minutos
const ULTIMA_TANDA = 20 * 60;
const CORTE_DESPACHO = 20 * 60; // a las 20:00 se cierra sin excepción
const SALIDAS_MOTO = [{ id: "primera", hora: "15:30" }, { id: "segunda", hora: "18:30" }];
const DIAS_SEMANA = { Sun: "domingo", Mon: "lunes", Tue: "martes", Wed: "miércoles", Thu: "jueves", Fri: "viernes", Sat: "sábado" };

const DEMORAS = {
  sin_demora: "los envíos están saliendo normal, sin demora",
  normal: "sale con la demora habitual, más o menos 1:30 hs desde que sale la moto",
  demora: "hoy estamos con una demora de alrededor de 2 hs en los envíos",
  demora_media: "hoy estamos con una demora de alrededor de 2:30 hs en los envíos",
  demora_fuerte: "hoy hay bastante demora, más de 3 hs desde la salida de la moto",
  solo_manana: "por hoy ya no se despacha más: se toma el pedido y sale mañana",
};

const fechaBA = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d);
const corta = (fecha) => fecha.slice(8, 10) + "/" + fecha.slice(5, 7);
const hhmmDe = (minutos) => `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, "0")}`;
const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && new Date(`${f}T12:00:00-03:00`).toISOString().slice(0, 10) === f;
const limitePorTanda = (op) => (Number(op.limitePorTanda) > 0 ? Number(op.limitePorTanda) : LIMITE_POR_TANDA);
// Los días sin despacho (feriados, domingos que no se trabaja) los carga el depósito como "AAAA-MM-DD".
const diasSinDespacho = (op) => (Array.isArray(op.diasSinDespacho) ? op.diasSinDespacho.filter(fechaValida) : []);

function horaBuenosAires(fecha) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(fecha).map((p) => [p.type, p.value])
  );
  return { dia: partes.weekday, fecha: `${partes.year}-${partes.month}-${partes.day}`, minutos: Number(partes.hour) * 60 + Number(partes.minute) };
}

// "13", "13:00", "13.30" o "13 hs" → minutos del día; cualquier otra cosa → null.
function minutosDe(texto) {
  const m = String(texto || "").trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(?:h|hs|hrs)?\.?$/i);
  if (!m || Number(m[1]) > 23 || Number(m[2] || 0) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2] || 0);
}

// ── Moto ─────────────────────────────────────────────────────────────────────

// Las dos salidas del día, con la hora que cargó el depósito.
function salidasMoto(op) {
  const salidas = SALIDAS_MOTO.map((t) => ({ ...t, hora: op.salidasMoto?.[t.id] ?? t.hora }));
  const valida = (h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h) && h <= "20:00";
  if (salidas.some((t) => !valida(t.hora)) || salidas[0].hora >= salidas[1].hora) {
    throw new Error("Las dos salidas de moto deben ser HH:mm, distintas, ordenadas y hasta las 20:00");
  }
  return salidas;
}

// Las salidas de moto que todavía no pasaron y tienen cupo, de hoy a 14 días.
function opcionesMoto(op, pedidos, ahora = new Date(), excluirPedido = null) {
  const hoy = fechaBA(ahora);
  const manana = fechaBA(new Date(ahora.getTime() + 86400000));
  const sinDespacho = diasSinDespacho(op);
  const limite = limitePorTanda(op);
  const opciones = [];
  for (let n = 0; n <= 14; n++) {
    const fecha = fechaBA(new Date(ahora.getTime() + n * 86400000));
    if (sinDespacho.includes(fecha) || (n === 0 && op.situacion === "solo_manana")) continue;
    for (const tanda of salidasMoto(op)) {
      if (Date.parse(`${fecha}T${tanda.hora}:00-03:00`) <= ahora.getTime()) continue;
      const ocupados = pedidos.filter((p) => p.id !== excluirPedido && p.tipoEnvio === "moto" && p.estado !== "cancelado" && p.fechaSalida === fecha && p.tandaSalida === tanda.id).length;
      if (ocupados >= limite) continue;
      opciones.push({ fecha, hora: tanda.hora, tandaId: tanda.id, dia: fecha === hoy ? "hoy" : fecha === manana ? "mañana" : `el ${corta(fecha)}`, fechaTexto: corta(fecha), cuposDisponibles: limite - ocupados });
    }
  }
  return opciones;
}

// La salida que eligió el cliente, si sigue disponible. Sin elección, la primera. El mayorista que va
// por correo solo usa la primera salida (la moto lo lleva al despacho).
function elegirSalida(opciones, seleccion, soloPrimera = false) {
  const posibles = soloPrimera ? opciones.filter((o) => o.tandaId === "primera") : opciones;
  if (!seleccion) return posibles[0] || null;
  if (!fechaValida(seleccion.fecha)) return null;
  return posibles.find((o) => o.fecha === seleccion.fecha && o.tandaId === seleccion.tandaId && (!seleccion.hora || o.hora === seleccion.hora)) || null;
}

async function pedidosMoto() {
  const snap = await db.collection("pedidos").where("tipoEnvio", "==", "moto").get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

// ── Uber ─────────────────────────────────────────────────────────────────────

// El horario del Uber de un día: el de siempre o la excepción que cargó el depósito para esa fecha.
function horarioUber(dia, fecha, horarios = {}) {
  const h = horarios[fecha];
  if (h?.cerrado === true) return null;
  const inicio = minutosDe(h?.desde || (dia === "Sun" ? "17:00" : "13:30"));
  const fin = minutosDe(h?.hasta || "20:00");
  if (inicio === null || fin === null || inicio < 13 * 60 + 30 || fin > ULTIMA_TANDA || inicio > fin) return null;
  return { inicio, fin };
}

// Los pedidos de moto y Uber "para armar" (pendientes) ocupan las tandas; los armados ya salieron.
// Ante un error se cuenta la cola vacía: nunca se frena una venta por esto.
async function pedidosEnCola() {
  try {
    const snap = await db.collection("pedidos").where("estado", "==", "pendiente").get();
    return snap.docs.filter((d) => ["moto", "uber", undefined, null].includes(d.data().tipoEnvio)).length;
  } catch (e) {
    console.error("[bot] no se pudo contar la cola", e.message);
    return 0;
  }
}

// La tanda de Uber en la que entra un pedido nuevo: cada `limite` pedidos en cola corren una tanda.
function salidaUber(op, enCola, ahora = new Date()) {
  const actual = horaBuenosAires(ahora);
  const sinDespacho = diasSinDespacho(op);
  let saltear = Math.floor(enCola / limitePorTanda(op));
  for (let n = 0; n <= 14; n++) {
    const d = horaBuenosAires(new Date(ahora.getTime() + n * 86400000));
    if (sinDespacho.includes(d.fecha) || (n === 0 && op.situacion === "solo_manana")) continue;
    const h = horarioUber(d.dia, d.fecha, op.horariosUberPorFecha || {});
    const tandas = [];
    if (h) for (let m = h.inicio; m <= h.fin; m += CADA_TANDA_UBER) tandas.push(m);
    const opciones = tandas.filter((m) => n > 0 || (actual.minutos < CORTE_DESPACHO && m >= actual.minutos));
    if (saltear < opciones.length) {
      return { dia: n === 0 ? "hoy" : n === 1 ? "mañana" : "el " + DIAS_SEMANA[d.dia], fecha: d.fecha, hora: hhmmDe(opciones[saltear]) };
    }
    saltear -= opciones.length;
  }
  return null;
}

// Programar un Uber a una hora que pidió el cliente: { salida } o { error } para el agente.
function uberALaHora(op, texto, primera, ahora = new Date()) {
  const solicitada = minutosDe(texto);
  const actual = horaBuenosAires(ahora);
  const h = horarioUber(actual.dia, actual.fecha, op.horariosUberPorFecha || {});
  if (solicitada === null || solicitada < 13 * 60 + 30 || solicitada > (h?.fin ?? -1)) {
    return { error: "la hora de Uber tiene que estar entre 13:30 y 20:00, en formato HH:mm" };
  }
  if (actual.minutos >= CORTE_DESPACHO || !primera || primera.dia !== "hoy") {
    return { error: `hoy ya no se puede programar ese Uber: la próxima salida disponible es ${primera ? `${primera.dia} a las ${primera.hora}` : "el próximo día con despacho"}` };
  }
  if (solicitada < actual.minutos || solicitada < minutosDe(primera.hora)) {
    return { error: `no llegamos a programar el Uber a las ${hhmmDe(solicitada)}; la primera salida disponible es hoy a las ${primera.hora}` };
  }
  return { salida: { dia: "hoy", fecha: fechaBA(ahora), hora: hhmmDe(solicitada) } };
}

// ── Para el cliente ──────────────────────────────────────────────────────────

// Si el panel marcó "solo mañana", eso manda; si no, la cola de pedidos pendientes ajusta el texto.
function demora(op, enCola) {
  if (op.situacion === "solo_manana") return DEMORAS.solo_manana;
  if (enCola > 10) return DEMORAS.demora_fuerte;
  if (enCola >= 8) return DEMORAS.demora_media;
  if (enCola >= 5) return DEMORAS.demora;
  return DEMORAS[op.situacion] || DEMORAS.sin_demora;
}

// Si hoy ya no hay salidas, o falta menos de una hora para el cierre, el aviso para el cliente.
function avisoDeHorario(op, proximaMoto, proximoUber, ahora = new Date()) {
  const actual = horaBuenosAires(ahora);
  const h = horarioUber(actual.dia, actual.fecha, op.horariosUberPorFecha || {});
  const cierre = h ? h.fin : CORTE_DESPACHO;
  const haySalidasHoy = [proximaMoto, proximoUber].some((s) => s?.fecha === actual.fecha);
  const cercaDelCierre = haySalidasHoy && actual.minutos >= cierre - 60 && actual.minutos < cierre;
  const siguientes = [
    proximaMoto && `moto: ${corta(proximaMoto.fecha)} a las ${proximaMoto.hora}`,
    proximoUber && `Uber/Flash: ${corta(proximoUber.fecha)} a las ${proximoUber.hora}`,
  ].filter(Boolean);
  const aviso = !haySalidasHoy
    ? { clave: actual.fecha + ":sin_salidas", texto: "Seguimos tomando pedidos las 24 horas, pero hoy ya no hay más salidas." + (siguientes.length ? " Próximas salidas disponibles: " + siguientes.join("; ") + "." : " Consultá la próxima salida antes de realizar un pago.") }
    : cercaDelCierre
      ? { clave: actual.fecha + ":cierre_proximo", texto: `Los envíos de hoy finalizan a las ${hhmmDe(cierre)}. Para salir hoy, hay que confirmar antes del cierre y completar el pago anticipado cuando corresponda; los pedidos con pago al recibir no necesitan el 100% anticipado.` }
      : null;
  return { fecha: actual.fecha, hora: hhmmDe(actual.minutos), cierreHora: hhmmDe(cierre), haySalidasHoy, cercaDelCierre, cerradoHoy: !haySalidasHoy, proximaMoto: proximaMoto || null, proximoUber: proximoUber || null, aviso };
}

module.exports = {
  fechaBA, corta, horaBuenosAires, horarioUber, hhmmDe, salidasMoto, opcionesMoto, elegirSalida, pedidosMoto,
  pedidosEnCola, salidaUber, uberALaHora, demora, avisoDeHorario,
};
