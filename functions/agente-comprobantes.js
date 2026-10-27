"use strict";

function importeDeTexto(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) && valor > 0 ? valor : null;
  let s = String(valor ?? "").trim();
  if (/^-|\(-?\s*\d/.test(s)) return null;
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const coma = s.lastIndexOf(","), punto = s.lastIndexOf(".");
  const ultimo = Math.max(coma, punto);
  const decimales = ultimo >= 0 ? s.length - ultimo - 1 : 0;
  if (ultimo >= 0 && decimales > 0 && decimales <= 2) {
    const entero=s.slice(0,ultimo), separador=s[ultimo];
    if(entero.includes(separador) || !/^\d+$|^\d{1,3}(?:[.,]\d{3})+$/.test(entero))return null;
    s = entero.replace(/[.,]/g, "") + "." + s.slice(ultimo + 1);
  } else if (ultimo >= 0) {
    if (!/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) return null;
    s = s.replace(/[.,]/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER ? Math.round(n * 100) / 100 : null;
}

function soloLecturaArchivo(descripcion) {
  const s = String(descripcion || "");
  const inicio = s.indexOf("[Adjunto:");
  if (inicio < 0) return s;
  const fin = s.indexOf("] [Link de la url fuente:", inicio);
  return fin >= 0 ? s.slice(inicio + 9, fin).trim() : "";
}

function lecturaEstructurada(valor) {
  if (valor && typeof valor === "object" && !Array.isArray(valor)) return valor;
  const texto = String(valor || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { const r = JSON.parse(texto); return r && typeof r === "object" && !Array.isArray(r) ? r : null; }
  catch { return null; }
}

function descripcionDeLectura(valor) {
  const l = lecturaEstructurada(valor);
  if (!l || l.esComprobante !== true || l.edicionDetectada === true) return null;
  const monto = importeDeTexto(l.monto);
  const numero = String(l.numeroOperacion || "").trim();
  if (!monto || !/^[a-z0-9][a-z0-9-]{5,79}$/i.test(numero)) return null;
  const campo = v => String(v || "").replace(/[\r\n]/g, " ").slice(0, 200);
  return ["Comprobante de pago", "Monto: " + monto.toLocaleString("es-AR", { maximumFractionDigits: 2 }),
    "Número de operación: " + numero, "Titular: " + campo(l.titular), "Destinatario: " + campo(l.destinatario),
    "CBU o CVU: " + campo(l.cbuCvu), "Alias visible: " + campo(l.alias), "CUIT: " + campo(l.cuit)].join("\n");
}

module.exports = { importeDeTexto, soloLecturaArchivo, lecturaEstructurada, descripcionDeLectura };
