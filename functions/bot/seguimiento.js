// Seguimiento: el pedido en curso de un cliente, explicado para que el agente no tenga que deducir si
// salió o no, y si todavía se puede cambiar.
"use strict";

const { db } = require("./firebase");
const { normalizarTelefono } = require("./texto");
const { fechaBA } = require("./salidas");

const DIA = 86400000;
const instante = (v) => (v?.toMillis ? v.toMillis() : typeof v === "number" ? v : Date.parse(v || ""));

// Un pedido es "en curso" si no está cerrado y sale hoy o más adelante, o si se movió hace poco
// (un día; cuatro para el correo). Uno viejo que quedó pendiente en el sistema no es el de ahora.
function esPedidoEnCurso(p, ahora = Date.now()) {
  if (!p || !["pendiente", "armado"].includes(p.estado) || p.entregadoEn || p.canceladoAt || p.finalizadoAt) return false;
  const fecha = String(p.fechaSalida || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha >= fechaBA(new Date(ahora))) return true;
  const actividad = Math.max(...[p.createdAt, p.armadoAt].map(instante).filter(Number.isFinite));
  const ventana = p.datosCorreo || p.tipoEnvio === "correo" ? 4 * DIA : DIA;
  return Number.isFinite(actividad) && actividad <= ahora + 5 * 60000 && ahora - actividad <= ventana;
}

// Si el cliente puede cambiar el pedido, o qué pasa si lo pide.
function restriccionCambio(pedido, ahora = Date.now()) {
  if (!pedido) return { permitido: false, derivar: false, mensaje: "No figura un pedido para modificar." };
  if (pedido.estado === "armado") {
    const salida = Date.parse(`${pedido.fechaSalida || ""}T${pedido.horaSalida || ""}:00-03:00`);
    if (Number.isFinite(salida) && ahora >= salida) {
      return { permitido: false, derivar: false, bloqueadoSalida: true, motivo: "salida_cerrada", mensaje: "tu pedido ya está armado y llegó la hora de salida; ya no podemos modificarlo" };
    }
    return { permitido: false, derivar: true, motivo: "modificar_pedido_armado", mensaje: "el pedido ya está armado; el equipo tiene que revisar si todavía puede hacer el cambio antes de la salida" };
  }
  return { permitido: pedido.estado === "pendiente", derivar: pedido.estado !== "pendiente", motivo: "modificar_pedido_armado" };
}

// Hay dos repartos (15:30 y 18:30) y cada uno tiene su recorrido: se mira el del reparto de ESTE
// pedido, si no a un cliente del segundo se le diría que salió solo porque salió el primero. Los
// documentos salen de src/reparto/repartidores.js.
const DOC_RECORRIDO = { moto1: "activo", moto2: "activo_moto2" };
async function repartoEnLaCalle(pedido, ahora = Date.now()) {
  const doc = await db.collection("recorridos").doc(DOC_RECORRIDO[pedido.repartidor] || DOC_RECORRIDO.moto1).get();
  const r = doc.exists ? doc.data() : null;
  if (!r || r.estado !== "en_calle" || !Number.isFinite(instante(r.salidaEn))) return false;
  const fecha = fechaBA(new Date(instante(r.salidaEn)));
  return fecha === fechaBA(new Date(ahora)) && (!pedido.fechaSalida || pedido.fechaSalida === fecha);
}

const ESTADOS = {
  pendiente: "el pedido está registrado y pendiente de armado; todavía no figura como despachado",
  armado: "el pedido está armado, pero todavía no figura como entregado ni tiene seguimiento cargado",
  armadoEnLaCalle: "el pedido está armado y el reparto ya está en la calle; no hay una hora exacta ni seguimiento individual cargado",
};

// El pedido en curso del teléfono, o null. Los pedidos manuales viejos no tienen teléfono
// estructurado y, por seguridad, no se adivinan leyendo texto libre.
async function pedidoEnCurso(telefono) {
  const tel = normalizarTelefono(telefono);
  if (!tel) return null;
  const snap = await db.collection("pedidos").where("telefono", "==", tel).get();
  const pedido = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (instante(b.createdAt) || 0) - (instante(a.createdAt) || 0))
    .find((p) => esPedidoEnCurso(p));
  if (!pedido) return null;
  const tipoEnvio = pedido.datosCorreo ? "correo" : pedido.tipoEnvio;
  const enLaCalle = tipoEnvio === "moto" && pedido.estado === "armado" && await repartoEnLaCalle(pedido);
  return {
    id: pedido.id,
    estado: pedido.estado,
    tipoEnvio: tipoEnvio || null,
    descripcion: enLaCalle ? ESTADOS.armadoEnLaCalle : ESTADOS[pedido.estado],
    fechaSalida: pedido.fechaSalida || null,
    horaSalida: pedido.horaSalida || null,
    puedeAfirmarEnCamino: enLaCalle,
    puedeModificar: pedido.origen === "bot_n8n" && pedido.estado === "pendiente",
    cambio: restriccionCambio(pedido),
    detalle: pedido.origen === "bot_n8n" ? {
      cliente: pedido.cliente, direccion: pedido.direccion, items: pedido.items, total: pedido.total,
      medioPago: pedido.medioPago, mayorista: pedido.mayorista || false, datosCorreo: pedido.datosCorreo, envioSeguro: pedido.envioSeguro,
    } : null,
  };
}

module.exports = { esPedidoEnCurso, restriccionCambio, pedidoEnCurso };
