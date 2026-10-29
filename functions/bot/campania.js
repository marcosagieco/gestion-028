// Campañas (por ejemplo CYBER 028): el depósito las carga en /operativo con su inicio y su fin, y durante
// ese tiempo el bot usa sus listas en lugar de las de siempre y aplica su envío gratis. Se prenden y se
// apagan solas por la fecha: nadie tiene que cambiar las listas a medianoche.
//
// settings/operativo.campania = { activa, nombre, inicio, fin, lanzamientoHasta, envioGratisDesde, mensaje,
//   preciosVapesTexto, appleTexto, mysteryBoxTexto }
// Las fechas son "AAAA-MM-DDTHH:mm" en hora de Buenos Aires (como las escribe el panel). Una lista vacía
// no reemplaza nada.
"use strict";

const { db } = require("./firebase");
const { textoDe } = require("./texto");

// Las listas que una campaña puede reemplazar.
const LISTAS_DE_CAMPANIA = ["preciosVapesTexto", "appleTexto", "mysteryBoxTexto"];

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

// La configuración del día con la campaña aplicada: sus listas en lugar de las de siempre y, en
// campaniaActiva, lo que el bot tiene que saber de ella.
function operativoVigente(op, ahora = new Date()) {
  const base = { ...(op || {}), mysteryBoxTexto: "" };
  const activa = campaniaVigente(op, ahora);
  if (!activa) return { ...base, campaniaActiva: null };
  for (const campo of LISTAS_DE_CAMPANIA) if (textoDe(op.campania[campo])) base[campo] = op.campania[campo];
  return { ...base, campaniaActiva: activa };
}

const leerOperativo = async () => operativoVigente((await db.collection("settings").doc("operativo").get()).data() || {});

// Por qué el envío sale gratis con la campaña, o null. Solo moto en CABA: con una Mystery Box, con una compra
// desde el mínimo o, en el lanzamiento, pagando por transferencia.
function envioGratisDeCampania(op, { tipoEnvio, esCABA, subtotal, medioPago, conMysteryBox }) {
  const c = op && op.campaniaActiva;
  if (!c || tipoEnvio !== "moto" || !esCABA) return null;
  if (conMysteryBox) return `${c.nombre}: la Mystery Box tiene envío gratis en CABA`;
  if (c.envioGratisDesde && subtotal >= c.envioGratisDesde) return `${c.nombre}: envío gratis en CABA desde $${c.envioGratisDesde.toLocaleString("es-AR")}`;
  if (c.enLanzamiento && medioPago === "transferencia") return `${c.nombre}: envío gratis de lanzamiento en CABA, pagando por transferencia`;
  return null;
}

module.exports = { LISTAS_DE_CAMPANIA, campaniaVigente, operativoVigente, leerOperativo, envioGratisDeCampania };
