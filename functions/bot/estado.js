// GET /agentEstadoOperativo?telefono= — lo que el agente necesita saber del día antes de responder:
// salidas, demora, el pedido en curso del cliente, la cotización del Flash y las plantillas del panel.
"use strict";

const { db } = require("./firebase");
const { conClave } = require("./http");
const { textoDe, pesos } = require("./texto");
const { LISTAS_DEL_PANEL, sinPrecios } = require("./catalogo");
const { TRAMOS_DESCUENTO_EFECTIVO, MINIMO_MAYORISTA } = require("./precios");
const { PRECIO_ENVIO_SEGURO, CORREO } = require("./envios");
const { horaBuenosAires, horarioUber, hhmmDe, corta, salidasMoto, opcionesMoto, pedidosMoto, pedidosEnCola, salidaUber, demora, avisoDeHorario } = require("./salidas");
const { pedidoEnCurso } = require("./seguimiento");
const { TOLERANCIA_COMPROBANTE } = require("./comprobantes");
const { cotizacionEnCurso } = require("./uber");

// Los datos de cobro de cada cuenta. Se le mandan al cliente con PLANTILLA:ALIAS, nunca los escribe el modelo.
const ALIASES = {
  alias1: "dale te paso los datos\nLucio Felix Bunge\nCBU: 00701941-30004014092980\nAlias: 028import.gl (Banco Galicia)\nmandame el comprobante cuando lo hagas",
  alias2: "dale te paso los datos\nMarcos Agustin Gieco\nCBU: 0070181130004057764295\nAlias: 028import.gal2 (Banco Galicia)\nmandame el comprobante cuando lo hagas",
  alias3: "dale te paso los datos\nTame Lake S.A.\nCVU: 0000510400000000001348\nAlias: tamelake358sa.eluter\nCUIT: 30718603702\nmandame el comprobante cuando lo hagas",
};

const COMUNIDAD = "ℹ️ COMUNIDAD 028 IMPORT\n\nhttps://chat.whatsapp.com/JYgkBHg7P4DLwv1V2HCZUZ\n\n💭 ¿Para qué sirve?\nEnterate del stock nuevo, ofertas ÚNICAS, stock y precios mayoristas.";

// Textos fijos del negocio. {HORARIO_FLASH} y {SALIDAS_MOTO} se completan con el día.
const PLANTILLAS_FIJAS = {
  FORMAS_DE_ENTREGA: `🚚 FORMAS DE ENTREGA 🚚\n\n━━━━━━━━━━━━━\n\n⚡ FLASH — UBER ENVÍOS\n{HORARIO_FLASH}\n🕐 Podés coordinar un horario de envío, sujeto a disponibilidad\n🔥 Entrega en 30’ mins\n⚠️ Sin garantía\n💳 Pago previo - transferencia\n\n━━━━━━━━━━━━━\n\n🛵 MOTO MENSAJERÍA\n{SALIDAS_MOTO}\n🔒 Mayor seguridad en tu pedido\n⏱️ Demora aprox: 1:30 hs desde que sale la moto\n💸 Pagás al recibir (efectivo o transferencia), por transferencia antes o mitad y mitad\n💵 Abonando en efectivo tenés descuentos especiales según el monto de tu compra\n\n━━━━━━━━━━━━━\n\n📦 CORREO — 1 a 3 días\n🚚 Vía Cargo\n💳 Productos: pago previo por transferencia\n💸 Envío: se abona a Vía Cargo al recibir\n\n📍 A sucursal → ${pesos(CORREO.sucursal)}\n🏠 A domicilio → ${pesos(CORREO.domicilio)}\n\n━━━━━━━━━━━━━\n\n🌐 https://028import.com`,
  ENVIO_SEGURO: `🛡️ ¿QUERÉS AGREGAR ENVÍO SEGURO A TU PEDIDO?\n\n💰 Valor: solo ${pesos(PRECIO_ENVIO_SEGURO)}\n\nProtegé tu compra ante cualquier imprevisto durante el envío. Por solo ${pesos(PRECIO_ENVIO_SEGURO)} adicionales, evitás correr el riesgo de perder el valor completo de tu pedido.\n\n━━━━━━━━━━━━━━━\n\n🔒 ¿QUÉ CUBRE EL ENVÍO SEGURO?\n\n✅ Robo durante el envío\n✅ Pérdida o extravío\n✅ Inconvenientes durante el traslado que impidan la entrega\n✅ Si transcurren los 7 minutos de espera desde la llegada del Uber y el pedido no pudo ser entregado, queda cubierto por reposición.\n\nAnte cualquiera de estas situaciones cubiertas, 028 IMPORT vuelve a enviarte tu pedido sin que tengas que pagarlo nuevamente.\n\n━━━━━━━━━━━━━━━\n\n⚠️ ¿Y SI NO LO AGREGO?\n\nEl pedido se despacha igualmente, pero viaja sin cobertura de reposición.\n\nUna vez despachado correctamente a la dirección proporcionada, si ocurre un robo, pérdida, extravío o no se concreta la recepción dentro del tiempo de espera, 028 Import no cubre el valor ni la reposición del pedido.`,
  DESCUENTO_EFECTIVO: (([alto, medio, base]) =>
    `pagando en efectivo tenés descuento: si es menos de ${pesos(medio.desde)} son ${pesos(base.off)} off, desde ${pesos(medio.desde)} son ${pesos(medio.off)} off, y desde ${pesos(alto.desde)} son ${pesos(alto.off)} off`)(TRAMOS_DESCUENTO_EFECTIVO),
  COMUNIDAD,
  COMPROBANTES_VALIDOS: "Regla interna: el comprobante es válido si el destino es cualquiera de estas tres cuentas del negocio, aunque no sea la que se le envió al cliente. alias1/028import.gl: Lucio Felix Bunge, Banco Galicia, CBU 0070194130004014092980. alias2/028import.gal2: Marcos Agustin Gieco, Banco Galicia, CBU 0070181130004057764295. alias3/tamelake358sa.eluter: Tame Lake S.A. o Tame Lake S A (puede figurar la billetera que la procesa), CVU 0000510400000000001348, CUIT 30718603702. Son tres cuentas distintas del negocio: nunca exijas Tame Lake a quien recibió los datos de Galicia. Ignorá mayúsculas, tildes, espacios y guiones al comparar. El destino es del negocio si coincide cualquiera de sus datos (titular, alias, CUIT o CBU/CVU): el CBU/CVU leído de una imagen puede tener un dígito de más o de menos, así que si el titular coincide no es una cuenta distinta. Solo es otra cuenta si no coincide ningún dato. Esto valida el destino del comprobante, no la acreditación bancaria."
    + `\nTolerancia de importe: hasta ${pesos(TOLERANCIA_COMPROBANTE)} de diferencia, tanto de más como de menos. Recibir el archivo no equivale a la acreditación bancaria.`,
  // Uber y correo: al cargar el pedido (ya pagó). Moto: lo manda el aviso de entrega al entregarlo.
  GRACIAS: "❤️ ¡GRACIAS POR TU COMPRA!\n✈️ 028 IMPORT\n\nEsperamos que disfrutes tu pedido. ¡Gracias por confiar en nosotros! 🫶\n\n🔥 SUMATE A NUESTRA COMUNIDAD DE WHATSAPP\n\nEs donde primero avisamos:\n✅ Promociones exclusivas\n✅ Liquidaciones\n✅ Reingresos de stock\n✅ Nuevos productos\n✅ Sorteos\n✅ Ofertas que no publicamos en otros lados\n\n🔗 https://chat.whatsapp.com/JYgkBHg7P4DLwv1V2HCZUZ\n\n━━━━━━━━━━━━━\n\n📲 SEGUINOS EN INSTAGRAM\n\n🔗 https://www.instagram.com/028.import\n\n⭐ Si te gustó la experiencia, recomendanos a tus amigos o compartí tu compra en Instagram y etiquetanos @028.import.\n\n━━━━━━━━━━━━━\n\n🌐 WEB OFICIAL\n\nConsultá el catálogo actualizado con todos los productos, precios y stock disponible.\n\n🔗 https://028import.com\n\n━━━━━━━━━━━━━\n\n⚠️ IMPORTANTE\n\n• Consultá al equipo por devoluciones y garantías.\n• Para cambios directos por fallas de fábrica, avisá dentro de las 48 horas desde la recepción.\n• El plazo para informar una falla es de 48 horas desde la recepción del producto.\n• Después de ese plazo, el equipo revisa el caso y la garantía que corresponda.\n\n🙏 ¡Gracias por elegir 028 Import!",
  CONFIANZA: "🔒 Entendemos tu desconfianza\n\nEntendemos que al comprar por primera vez puedas tener dudas. 👍🏻\n\nPor eso te invitamos a conocer un poco más sobre 028 Import.\n\n📲 Instagram:\nhttps://www.instagram.com/028.import?igsh=a2pzbDNtNGFkcDNz&utm_source=qr\n\nAhí vas a encontrar:\n✅ Miles de seguidores.\n⭐ Referencias reales de clientes.\n🤝 Colaboraciones con influencers.\n🔥 Publicaciones e historias diarias.\n\nTrabajamos hace años y más de 4.000 clientes ya eligieron 028 Import.\n\nSi después de ver nuestro perfil te queda alguna duda, escribinos sin problema. Estamos para ayudarte. 💙",
};

// Las plantillas del día: las fijas, los datos de cobro de la cuenta activa y las listas del panel.
// Las de stock van sin precios.
function plantillasDelDia(op, salidaFlash) {
  const plantillas = { ...PLANTILLAS_FIJAS, ALIAS: ALIASES[op.aliasActivo] || ALIASES.alias1 };
  for (const [nombre, campo] of Object.entries(LISTAS_DEL_PANEL)) plantillas[nombre] = textoDe(op[campo]);
  plantillas.STOCK_NICOTINA = sinPrecios(plantillas.STOCK_NICOTINA);
  plantillas.STOCK_THC = sinPrecios(plantillas.STOCK_THC);
  plantillas.STOCK_PERFUMES = sinPrecios(plantillas.PERFUMES);
  plantillas.STOCK_APPLE_ACCESORIOS = sinPrecios(plantillas.APPLE_ACCESORIOS);
  const [primera, segunda] = salidasMoto(op);
  const ahora = horaBuenosAires(new Date());
  const h = horarioUber(ahora.dia, ahora.fecha, op.horariosUberPorFecha || {});
  const horarioFlash = salidaFlash?.fecha === ahora.fecha && h ? `⏳ ${hhmmDe(h.inicio)} hs a ${hhmmDe(h.fin)} hs`
    : salidaFlash ? `⏳ Próxima salida: ${corta(salidaFlash.fecha)} a las ${salidaFlash.hora}. A confirmar con el pedido.`
      : "⏳ Consultá la próxima salida disponible antes de pagar.";
  plantillas.FORMAS_DE_ENTREGA = plantillas.FORMAS_DE_ENTREGA
    .replace("{HORARIO_FLASH}", horarioFlash)
    .replace("{SALIDAS_MOTO}", `⏳ Dos salidas: ${primera.hora} y ${segunda.hora}. Fecha y disponibilidad a confirmar.`);
  return plantillas;
}

const agentEstadoOperativo = conClave(async (req, res) => {
  const op = (await db.collection("settings").doc("operativo").get()).data() || {};
  const [enCola, motos, pedidoActual, cotizacionUber] = await Promise.all([
    pedidosEnCola(),
    pedidosMoto(),
    pedidoEnCurso(req.query.telefono),
    cotizacionEnCurso(req.query.telefono),
  ]);
  const opciones = opcionesMoto(op, motos);
  const proximoUber = salidaUber(op, enCola);
  res.json({
    ok: true,
    opcionesMoto: opciones.slice(0, 4),
    salidaUber: proximoUber,
    atencionEnvios: avisoDeHorario(op, opciones[0], proximoUber),
    demora: demora(op, enCola),
    mayorista: { minimoUnidades: MINIMO_MAYORISTA, agrupacion: op.mayoristaAgrupacion || "por_modelo", dolarEnPesos: Number(op.dolarMayorista) > 0 ? Number(op.dolarMayorista) : null, derivarSoloNegociacion: true },
    pedidoActual,
    cotizacionUber,
    plantillas: plantillasDelDia(op, proximoUber),
  });
});

module.exports = { agentEstadoOperativo };
