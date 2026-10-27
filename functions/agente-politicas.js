"use strict";

const normalizar = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function confirmacionDeCompra(texto, pedido) {
  const t = normalizar(texto);
  if (!t || /\?|\b(no|pero|cambi\w*|otra?|agreg\w*|esper\w*|despues|cuanto|precio|alias|gracias|lleg\w*)\b/.test(t)) return false;
  const breve = /^(?:s+i+|sip|si+si+|dale+|ok(?:ey|ay)?|perfecto|confirmo|confirmado|de una|joya|listo)(?:[\s,.!👍👌]*(?:s+i+|sip|si+si+|dale+|perfecto|super|joya|listo|confirmo|confirmado))*[\s,.!👍👌]*$/;
  if (breve.test(t)) return true;
  const horario = t.match(/^(?:s+i+|sip|si+si+|dale+|perfecto|confirmo)[\s,.!]*(?:para\s+)?(?:las?\s+)?(\d{1,2}[:.]\d{2})(?:\s*(?:hs?|horas))?[\s,.!]*(?:(?:estaria|esta|me queda|me viene)\s+)?(?:super|bien|perfecto|joya)?[\s,.!👍👌]*$/);
  return !!horario && horario[1].replace(".", ":").padStart(5, "0") === pedido?.salidaSeleccionada?.hora;
}

function mensajePosterior(entrante, saliente) {
  const a = String(entrante || ""), b = String(saliente || "");
  return /^\d+$/.test(a) && /^\d+$/.test(b) && BigInt(a) > BigInt(b);
}

function pideDatosPago(texto) {
  return /\b(alias|cbu|cvu|datos (?:de |para (?:el )?)?(?:pago|transferir)|a donde (?:te )?transfiero)\b/.test(normalizar(texto));
}

function evaluarDerivacion(motivo, explicacion) {
  const m = normalizar(motivo).replace(/ /g, "_");
  const e = normalizar(explicacion);
  const permitidos = new Set(["reclamo", "pedido_perdido", "comprobante_dudoso", "devolucion", "modificar_pedido_armado", "medico_legal", "pago_cotizacion_vencida"]);
  if (m === "cotizar_uber") return { permitido: true, cotizacion: true };
  if (permitidos.has(m)) return { permitido: true };
  if (m === "falla" && /no funciona|no prende|defect|roto|falla de fabrica|falla del producto/.test(e)) return { permitido: true };
  if (m === "mayorista" && /negoci|descuento especial|mejorar (?:el )?precio|precio especial/.test(e)) return { permitido: true };
  if (m === "local" && /insist|retirar|buscar|presencial/.test(e)) return { permitido: true };
  if (m === "cliente_apurado" && /(?:mas de (?:5|cinco)|(?:6|seis|[7-9]|\d{2,}) consultas)/.test(e)) return { permitido: true };
  return { permitido: false, resultado: "Seguí atendiendo esta compra. Las consultas de precio, cantidad, stock, envío, alias, resumen y registro se resuelven con las herramientas. Pedí solo el dato que falte; no derives ni afirmes que avisaste al equipo." };
}

module.exports = { confirmacionDeCompra, mensajePosterior, pideDatosPago, evaluarDerivacion };
