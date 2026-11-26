// Campañas y envío gratis.
// Campañas (por ejemplo CYBER 028): el depósito las carga en /operativo con su inicio y su fin, y durante
// ese tiempo el bot usa sus listas en lugar de las de siempre y aplica su envío gratis. Se prenden y se
// apagan solas por la fecha: nadie tiene que cambiar las listas a medianoche.
// Además hay un envío gratis de siempre, con un interruptor en /operativo (envioGratisVigente).
//
// settings/operativo.campania = { activa, nombre, inicio, fin, lanzamientoHasta, envioGratisDesde, mensaje,
//   preciosVapesTexto, preciosThcTexto, appleTexto, mysteryBoxTexto }
// Las fechas son "AAAA-MM-DDTHH:mm" en hora de Buenos Aires (como las escribe el panel). Una lista vacía
// no reemplaza nada.
"use strict";

const { db } = require("./firebase");
const { textoDe } = require("./texto");

// Las listas que una campaña puede reemplazar.
// THC se sumó para el BLACK FRIDAY 028 (27/11): las cápsulas tienen precio Black.
const LISTAS_DE_CAMPANIA = ["preciosVapesTexto", "preciosThcTexto", "appleTexto", "mysteryBoxTexto"];

// "2026-11-02T00:00" en Buenos Aires (UTC-3 todo el año) → milisegundos, o NaN.
const enBuenosAires = (texto) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(texto || "")) ? Date.parse(texto + ":00-03:00") : NaN);

// La campaña que corre ahora, o null.
function campaniaVigente(op, ahora = new Date()) {
  const c = op && op.campania;
  if (!c || c.activa !== true) return null;
  const inicio = enBuenosAires(c.inicio), fin = enBuenosAires(c.fin);
  const t = ahora.getTime();
  if (!(t >= inicio && t <= fin)) return null;
  const lanzamientoHasta = enBuenosAires(c.lanzamientoHasta);
  return {
    nombre: String(c.nombre || "").trim() || "Campaña",
    inicio: c.inicio,
    fin: c.fin,
    envioGratisDesde: Number(c.envioGratisDesde) > 0 ? Number(c.envioGratisDesde) : null,
    enLanzamiento: t <= lanzamientoHasta,
    lanzamientoHasta: c.lanzamientoHasta || null,
    mensaje: textoDe(c.mensaje),
  };
}

// El envío gratis de siempre (fuera de campaña): el depósito lo prende y lo apaga en /operativo.
// settings/operativo.envioGratis = { activo, desde }. Solo moto en CABA, con productos desde `desde`.
function envioGratisVigente(op) {
  const e = op && op.envioGratis;
  return e && e.activo === true && Number(e.desde) > 0 ? { desde: Number(e.desde) } : null;
}

// La configuración del día con la campaña aplicada: sus listas en lugar de las de siempre y, en
// campaniaActiva, lo que el bot tiene que saber de ella. En envioGratisActivo, el envío gratis prendido.
function operativoVigente(op, ahora = new Date()) {
  const base = { ...(op || {}), mysteryBoxTexto: "", envioGratisActivo: envioGratisVigente(op) };
  const activa = campaniaVigente(op, ahora);
  if (!activa) return { ...base, campaniaActiva: null };
  for (const campo of LISTAS_DE_CAMPANIA) if (textoDe(op.campania[campo])) base[campo] = op.campania[campo];
  return { ...base, campaniaActiva: activa };
}

const leerOperativo = async () => operativoVigente((await db.collection("settings").doc("operativo").get()).data() || {});

const enPesos = (n) => "$" + Number(n).toLocaleString("es-AR");

// Las reglas de envío gratis que valen hoy para una moto en CABA, para avisarle al cliente al cotizar el envío:
// { campania, desde, lanzamientoConTransferencia, conMysteryBox }, o null si no hay ninguna. Con las dos
// prendidas, el mínimo es el más bajo.
function reglaEnvioGratis(op) {
  const c = op && op.campaniaActiva, e = op && op.envioGratisActivo;
  if (!c && !e) return null;
  const minimos = [c && c.envioGratisDesde, e && e.desde].filter((n) => n > 0);
  return { campania: c ? c.nombre : null, desde: minimos.length ? Math.min(...minimos) : null,
    lanzamientoConTransferencia: !!(c && c.enLanzamiento), conMysteryBox: !!c };
}

// Por qué el envío sale gratis, o null. Solo moto en CABA. Con la campaña: con una Mystery Box, con una compra
// desde su mínimo o, en el lanzamiento, pagando por transferencia. Con el envío gratis del panel: desde su mínimo.
function envioGratisDe(op, { tipoEnvio, esCABA, subtotal, medioPago, conMysteryBox }) {
  if (tipoEnvio !== "moto" || !esCABA) return null;
  const c = op && op.campaniaActiva, e = op && op.envioGratisActivo;
  if (c && conMysteryBox) return `${c.nombre}: la Mystery Box tiene envío gratis en CABA`;
  if (c && c.envioGratisDesde && subtotal >= c.envioGratisDesde) return `${c.nombre}: envío gratis en CABA desde ${enPesos(c.envioGratisDesde)}`;
  if (e && subtotal >= e.desde) return `compra desde ${enPesos(e.desde)} en CABA`;
  if (c && c.enLanzamiento && medioPago === "transferencia") return `${c.nombre}: envío gratis de lanzamiento en CABA, pagando por transferencia`;
  return null;
}

module.exports = { LISTAS_DE_CAMPANIA, campaniaVigente, envioGratisVigente, operativoVigente, leerOperativo, reglaEnvioGratis, envioGratisDe };
