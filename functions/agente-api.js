/**
 * agente-api.js — backend del agente de WhatsApp de 028 (lo llama n8n).
 *
 * Todo lo que es plata o logística se resuelve acá y no en el modelo: el precio de cada producto
 * (sale de las listas que el depósito carga en /operativo), el envío, los descuentos, el total,
 * la cobertura de la moto, dónde se admite efectivo, el cupo de la tanda y si el pedido sale hoy.
 *
 * Se engancha desde index.js con una sola línea: Object.assign(exports, require("./agente-api"));
 * Contrato de cada endpoint: ../AGENTE_API.md
 */
"use strict";

const functions = require("firebase-functions");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");
const { opcionesMoto, elegirSalida, tandasMoto, fechaBA, corta } = require("./agente-salidas");
const { parsearMayorista, precioMayorista } = require("./agente-mayorista");
const { importeDeTexto, soloLecturaArchivo, descripcionDeLectura } = require("./agente-comprobantes");
const { confirmacionDeCompra, mensajePosterior, pideDatosPago } = require("./agente-politicas");
const { controlarTurno, verificarTurno,leerAtencionConversacion } = require("./agente-turnos");
const {sinPrecios,pideResumen,datosAtencionEnvios}=require('./agente-atencion');
const {incorporarFichaFisica}=require('./agente-fichas-productos');
const { instante,clasificarPedido,consultaHistorica,recorridoDelPedido } = require('./agente-contexto');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const AGENT_API_KEY = process.env.AGENT_API_KEY || "";
const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY || "";
// Adónde avisar cuando el depósito cotiza un Uber: al n8n que atiende el número. Se lee de
// settings/agente.n8nBase para poder mudar el bot de servidor sin redesplegar; sin ese dato, el de siempre.
const N8N_BASE_POR_DEFECTO = "https://028-import-n8n.neoyey.easypanel.host";
async function urlCotizacionUber() {
  let base = N8N_BASE_POR_DEFECTO;
  try {
    const d = await db.collection("settings").doc("agente").get();
    const delPanel = d.exists ? String(d.data().n8nBase || "").trim().replace(/\/+$/, "") : "";
    if (/^https:\/\/[^\s/]+$/.test(delPanel)) base = delPanel;
  } catch (e) {
    console.error("[agente-api] no se pudo leer settings/agente, uso el n8n por defecto", e.message);
  }
  return base + "/webhook/cotizacion-uber-confirmada";
}
const STORAGE_BUCKET = "gestion-028.firebasestorage.app";
const SERVE_COMPROBANTE_BASE = "https://us-central1-gestion-028.cloudfunctions.net/serveComprobante";

// ─────────────────────────────────────────────────────────────────────────────
// Reglas del negocio
// ─────────────────────────────────────────────────────────────────────────────
const DEPOSITO = { lat: -34.55359497285959, lng: -58.4523699884262 }; // Libertador 6299 (src/reparto/zonas.js)
const TARIFA_POR_KM = 1000;
const MINIMO_ENVIO = 3000;
const PRECIO_ENVIO_SEGURO = 1990; // solo flash (Uber)
const CORREO = { sucursal: 19000, domicilio: 29000 }; // lo paga el cliente a Vía Cargo al recibir
// Descuento por pagar en efectivo, medido sobre el subtotal de productos (sin el envío).
const TRAMOS_DESCUENTO_EFECTIVO = [
  { desde: 100000, off: 5000 },
  { desde: 50000, off: 2500 },
  { desde: 0, off: 1500 },
];
const LIMITE_POR_TANDA = 10; // si el panel no tiene uno cargado
const CADA_TANDA = 30; // minutos entre tandas de Uber
const ULTIMA_TANDA = 20 * 60; // 20:00
const CORTE_DESPACHO = 20 * 60; // a las 20:00 se cierra sin excepción
// Una cotización sin confirmar vence después de 45 minutos de informado el precio.

const TOLERANCIA_COMPROBANTE = 5000;

const DEMORAS = {
  sin_demora: "los envíos están saliendo normal, sin demora",
  normal: "sale con la demora habitual, más o menos 1:30 hs desde que sale la moto",
  demora: "hoy estamos con una demora de alrededor de 2 hs en los envíos",
  demora_media: "hoy estamos con una demora de alrededor de 2:30 hs en los envíos",
  demora_fuerte: "hoy hay bastante demora, más de 3 hs desde la salida de la moto",
  solo_manana: "por hoy ya no se despacha más: se toma el pedido y sale mañana",
};

// El cliente recibe los datos de cobro mediante la plantilla, no redactados por el modelo.
const ALIASES = {
  alias1: "dale te paso los datos\nLucio Felix Bunge\nCBU: 00701941-30004014092980\nAlias: 028import.gl (Banco Galicia)\nmandame el comprobante cuando lo hagas",
  alias2: "dale te paso los datos\nMarcos Agustin Gieco\nCBU: 0070181130004057764295\nAlias: 028import.gal2 (Banco Galicia)\nmandame el comprobante cuando lo hagas",
  alias3: "dale te paso los datos\nTame Lake S.A.\nCVU: 0000510400000000001348\nAlias: tamelake358sa.eluter\nCUIT: 30718603702\nmandame el comprobante cuando lo hagas",
};

const $ = (n) => `$${Number(n || 0).toLocaleString("es-AR")}`;
const COMUNIDAD_028 = "ℹ️ COMUNIDAD 028 IMPORT\n\nhttps://chat.whatsapp.com/JYgkBHg7P4DLwv1V2HCZUZ\n\n💭 ¿Para qué sirve?\nEnterate del stock nuevo, ofertas ÚNICAS, stock y precios mayoristas.";

// Formas de pago. Uber y correo: solo transferencia antes. La moto además acepta efectivo (con
// descuento), al recibir (efectivo o transferencia cuando llega, sin comprobante) y mitad y mitad
// (mitad por transferencia antes, con comprobante, y mitad en efectivo al recibir, sin descuento).
const PAGO_LABEL = {
  transferencia: "transferencia",
  efectivo: "efectivo al recibir",
  "al recibir": "al recibir (efectivo o transferencia)",
  "mitad y mitad": "mitad transferencia antes, mitad efectivo al recibir",
};
function formaDePago(texto) {
  const t = normalizar(texto);
  if (!t) return "";
  if(/\busdt?\b|dolar|tarjeta|cripto|crypto/.test(t))return '';
  if (t.includes("mitad")) return "mitad y mitad";
  if(t.includes('efectivo')&&!/efectivo.{0,20}\bo\b.{0,20}transfer|transfer.{0,20}\bo\b.{0,20}efectivo/.test(t))return 'efectivo';
  if (t.includes("recibir") || t.includes("contra entrega")) return "al recibir";
  if (t.includes("efectivo")) return "efectivo";
  return /transfer|alias|cbu|cvu|mercado pago/.test(t)?'transferencia':'';
}

// Textos fijos del negocio que el agente manda tal cual con ⟦PLANTILLA:NOMBRE⟧.
const PLANTILLAS_FIJAS = {
  FORMAS_DE_ENTREGA: `🚚 FORMAS DE ENTREGA 🚚\n\n━━━━━━━━━━━━━\n\n⚡ FLASH — UBER ENVÍOS\n⏳ 13:30 hs a 20:00 hs\n🕐 Podés coordinar un horario de envío, sujeto a disponibilidad\n🔥 Entrega en 30’ mins\n⚠️ Sin garantía\n💳 Pago previo - transferencia\n\n━━━━━━━━━━━━━\n\n🛵 MOTO MENSAJERÍA\n⏳ 13:30 hs - 🌙 20:00 hs\n🔒 Mayor seguridad en tu pedido\n⏱️ Demora aprox: 1:30 hs desde que sale la moto\n💸 Pagás al recibir (efectivo o transferencia), por transferencia antes o mitad y mitad\n💵 Abonando en efectivo tenés descuentos especiales según el monto de tu compra\n\n━━━━━━━━━━━━━\n\n📦 CORREO — 1 a 3 días\n🚚 Vía Cargo\n💳 Productos: pago previo por transferencia\n💸 Envío: se abona a Vía Cargo al recibir\n\n📍 A sucursal → ${$(CORREO.sucursal)}\n🏠 A domicilio → ${$(CORREO.domicilio)}\n\n━━━━━━━━━━━━━\n\n🌐 https://028import.com`,
  ENVIO_SEGURO: `🛡️ ¿QUERÉS AGREGAR ENVÍO SEGURO A TU PEDIDO?\n\n💰 Valor: solo ${$(PRECIO_ENVIO_SEGURO)}\n\nProtegé tu compra ante cualquier imprevisto durante el envío. Por solo ${$(PRECIO_ENVIO_SEGURO)} adicionales, evitás correr el riesgo de perder el valor completo de tu pedido.\n\n━━━━━━━━━━━━━━━\n\n🔒 ¿QUÉ CUBRE EL ENVÍO SEGURO?\n\n✅ Robo durante el envío\n✅ Pérdida o extravío\n✅ Inconvenientes durante el traslado que impidan la entrega\n✅ Si transcurren los 7 minutos de espera desde la llegada del Uber y el pedido no pudo ser entregado, queda cubierto por reposición.\n\nAnte cualquiera de estas situaciones cubiertas, 028 IMPORT vuelve a enviarte tu pedido sin que tengas que pagarlo nuevamente.\n\n━━━━━━━━━━━━━━━\n\n⚠️ ¿Y SI NO LO AGREGO?\n\nEl pedido se despacha igualmente, pero viaja sin cobertura de reposición.\n\nUna vez despachado correctamente a la dirección proporcionada, si ocurre un robo, pérdida, extravío o no se concreta la recepción dentro del tiempo de espera, 028 Import no cubre el valor ni la reposición del pedido.`,
  WEB: "📦 CATÁLOGO Y STOCK ACTUALIZADO\n\n🌐 Entrá a nuestra web y mirá todos los productos disponibles, precios y stock actualizado:\n\n👉 https://028import.com\n\n📲 Si tenés alguna duda o querés una recomendación personalizada escribinos por WhatsApp.\n\n🚚 Envíos en CABA y a todo el país.\n📍 Belgrano, CABA.",
  DESCUENTO_EFECTIVO: (([alto, medio, base]) =>
    `pagando en efectivo tenés descuento: si es menos de ${$(medio.desde)} son ${$(base.off)} off, desde ${$(medio.desde)} son ${$(medio.off)} off, y desde ${$(alto.desde)} son ${$(alto.off)} off`)(TRAMOS_DESCUENTO_EFECTIVO),
  COMUNIDAD: COMUNIDAD_028,
  COMPROBANTES_VALIDOS: "Regla interna: el comprobante es válido si el destino es cualquiera de estas tres cuentas del negocio, aunque no sea la que se le envió al cliente. alias1/028import.gl: Lucio Felix Bunge, Banco Galicia, CBU 0070194130004014092980. alias2/028import.gal2: Marcos Agustin Gieco, Banco Galicia, CBU 0070181130004057764295. alias3/tamelake358sa.eluter: Tame Lake S.A. o Tame Lake S A (puede figurar la billetera que la procesa), CVU 0000510400000000001348, CUIT 30718603702. Son tres cuentas distintas del negocio: nunca exijas Tame Lake a quien recibió los datos de Galicia. Ignorá mayúsculas, tildes, espacios y guiones al comparar. El destino es del negocio si coincide cualquiera de sus datos (titular, alias, CUIT o CBU/CVU): el CBU/CVU leído de una imagen puede tener un dígito de más o de menos, así que si el titular coincide no es una cuenta distinta. Solo es otra cuenta si no coincide ningún dato. Esto valida el destino del comprobante, no la acreditación bancaria.",
  // Uber y correo: al cargar el pedido (ya pagó). Moto: la manda "aviso de entrega" al entregarlo.
  GRACIAS: "❤️ ¡GRACIAS POR TU COMPRA!\n✈️ 028 IMPORT\n\nEsperamos que disfrutes tu pedido. ¡Gracias por confiar en nosotros! 🫶\n\n🔥 SUMATE A NUESTRA COMUNIDAD DE WHATSAPP\n\nEs donde primero avisamos:\n✅ Promociones exclusivas\n✅ Liquidaciones\n✅ Reingresos de stock\n✅ Nuevos productos\n✅ Sorteos\n✅ Ofertas que no publicamos en otros lados\n\n🔗 https://chat.whatsapp.com/JYgkBHg7P4DLwv1V2HCZUZ\n\n━━━━━━━━━━━━━\n\n📲 SEGUINOS EN INSTAGRAM\n\n🔗 https://www.instagram.com/028.import\n\n⭐ Si te gustó la experiencia, recomendanos a tus amigos o compartí tu compra en Instagram y etiquetanos @028.import.\n\n━━━━━━━━━━━━━\n\n🌐 WEB OFICIAL\n\nConsultá el catálogo actualizado con todos los productos, precios y stock disponible.\n\n🔗 https://028import.com\n\n━━━━━━━━━━━━━\n\n⚠️ IMPORTANTE\n\n• Consultá al equipo por devoluciones y garantías.\n• Para cambios directos por fallas de fábrica, avisá dentro de las 48 horas desde la recepción.\n• El plazo para informar una falla es de 48 horas desde la recepción del producto.\n• Después de ese plazo, el equipo revisa el caso y la garantía que corresponda.\n\n🙏 ¡Gracias por elegir 028 Import!",
  CONFIANZA: "🔒 Entendemos tu desconfianza\n\nEntendemos que al comprar por primera vez puedas tener dudas. 👍🏻\n\nPor eso te invitamos a conocer un poco más sobre 028 Import.\n\n📲 Instagram:\nhttps://www.instagram.com/028.import?igsh=a2pzbDNtNGFkcDNz&utm_source=qr\n\nAhí vas a encontrar:\n✅ Miles de seguidores.\n⭐ Referencias reales de clientes.\n🤝 Colaboraciones con influencers.\n🔥 Publicaciones e historias diarias.\n\nTrabajamos hace años y más de 4.000 clientes ya eligieron 028 Import.\n\nSi después de ver nuestro perfil te queda alguna duda, escribinos sin problema. Estamos para ayudarte. 💙",
};

// Listas que carga el depósito en /operativo: nombre de la plantilla → campo de settings/operativo.
const LISTAS_DEL_PANEL = {
  STOCK_NICOTINA: "stockNicotinaTexto",
  PRECIOS_VAPES: "preciosVapesTexto",
  STOCK_THC: "stockThcTexto",
  PRECIOS_THC: "preciosThcTexto",
  PERFUMES: "perfumesTexto",
  APPLE_ACCESORIOS: "appleTexto",
  PRECIOS_MAYORISTA: "preciosMayoristaTexto",
  OFERTAS: "ofertasTexto",
  COMBOS_BATERIAS: "combosBateriasTexto",
};
// Listas minoristas en pesos: todas las del panel menos las de stock, la mayorista (tiene su propio
// parser en USD) y las ofertas (pisan precios, ver productoDeLinea). Una lista nueva que se sume a
// LISTAS_DEL_PANEL se cobra sola: lo que el bot puede ofrecer, el backend lo puede cobrar.
const LISTAS_CON_PRECIO = Object.values(LISTAS_DEL_PANEL)
  .filter((campo) => !/^stock/.test(campo) && !["preciosMayoristaTexto", "ofertasTexto"].includes(campo));
// La lista de stock de cada lista de precios (perfumes y Apple no tienen).
const STOCK_DE = { preciosVapesTexto: "stockNicotinaTexto", preciosThcTexto: "stockThcTexto" };

// Barrio/localidad → zona del mapa de reparto (mismo mapeo que src/reparto/zonas.js). La zona B es
// el Corredor Norte: la única parte de la cobertura que no es CABA.
const BARRIO_A_ZONA = {
  belgrano: "A", nunez: "A", colegiales: "A", coghlan: "A", "las canitas": "A",
  "palermo chico": "A", "barrio parque": "A", "villa ortuzar": "A",
  "vicente lopez": "B", olivos: "B", "la lucila": "B", florida: "B", munro: "B", martinez: "B",
  palermo: "C1", "palermo hollywood": "C1", "palermo soho": "C1", "palermo botanico": "C1",
  "alto palermo": "C1", "barrio norte": "C1",
  recoleta: "C2", retiro: "C2", "san nicolas": "C2", tribunales: "C2", monserrat: "C2",
  "villa urquiza": "D", "parque chas": "D", chacarita: "D", agronomia: "D",
  "villa pueyrredon": "D", "villa del parque": "D",
  "villa crespo": "E", almagro: "E", caballito: "E",
  "villa santa rita": "F", floresta: "F", liniers: "F", "velez sarsfield": "F", "villa real": "F",
  versalles: "F", "monte castro": "F", "villa luro": "F", mataderos: "F",
  "san telmo": "G", constitucion: "G", barracas: "G", "la boca": "G",
  "parque patricios": "G", "nueva pompeya": "G",
};
// Solo estos componentes de Google nombran un barrio o localidad (una calle "Florida" en San
// Nicolás no es la localidad de Florida).
const TIPOS_DE_BARRIO = ["neighborhood", "sublocality", "sublocality_level_1", "locality", "administrative_area_level_2"];
const NOMBRES_CABA = new Set(["ciudad autonoma de buenos aires", "caba", "capital federal"]);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function conClave(handler) {
  return functions.https.onRequest(async (req, res) => {
    if (!AGENT_API_KEY || req.get("X-Agent-Key") !== AGENT_API_KEY) {
      return res.status(401).json({ ok: false, error: "no autorizado" });
    }
    try {
      await handler(req, res);
    } catch (e) {
      console.error("[agente-api]", req.path, e);
      if (!res.headersSent) res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });
}

const rechazar = (res, error) => res.status(400).json({ ok: false, error });
exports.agentTurno = conClave(async(req,res)=>{
  res.setHeader('X-028-Atencion','2026-10-26-estandar-v1');
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"Usá POST"});
  res.json(await controlarTurno(db,req.body||{}));
});

// "Honor & Glory" → "honor glory". Saca tildes, emojis y la capacidad en puffs ("35K"), que el
// agente a veces pega al nombre pero nunca forma parte de él.
const normalizar = (texto) =>
  String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b\d+k\b/g, " ")
    .replace(/\b(y|and)\b/g, " ")
    .replace(/ +/g, " ")
    .trim();

// "combo" tampoco distingue un producto: en las listas va en el título de la sección ("COMBOS
// DISPONIBLES"), no en el nombre de cada combo.
const PALABRAS_VACIAS = new Set(["de", "del", "la", "el", "los", "las", "con", "a", "x", "combo", "combos"]);
const palabras = (texto) => normalizar(texto).split(" ").filter((p) => p && !PALABRAS_VACIAS.has(p));

// Teléfono → 549XXXXXXXXXX, igual que el webhook de index.js.
function normalizarTelefono(tel) {
  let n = String(tel || "").replace(/\D/g, "");
  if (n.startsWith("54") && n.length === 12) n = "549" + n.slice(2);
  if (!n.startsWith("54") && n.length === 10) n = "549" + n;
  return n;
}

const hashCorto = (valor) => crypto.createHash("sha256").update(String(valor)).digest("hex").slice(0, 32);

// Último pedido cargado por el agente para este teléfono. El estado se devuelve ya explicado para
// que el modelo no tenga que inferir si salió o no. Los pedidos manuales viejos no tienen teléfono
// estructurado y, por seguridad, no se adivinan leyendo texto libre.
async function contextoPedidosDelCliente(telefono) {
  const tel = normalizarTelefono(telefono);
  if (!tel) return {pedidoActual:null,pedidoHistorico:null};
  try {
    const snap = await db.collection("pedidos").where("telefono", "==", tel).get();
    const docs = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (instante(b.createdAt)||0) - (instante(a.createdAt)||0));
    const actual=docs.find(p=>clasificarPedido(p).actual),historico=docs.find(p=>!clasificarPedido(p).actual);
    const [pedidoActual,pedidoHistorico]=await Promise.all([resumirPedidoDelCliente(actual),resumirPedidoDelCliente(historico,true)]);
    return {pedidoActual,pedidoHistorico};
  } catch(e){console.error('[agente-api] no se pudieron leer los pedidos del cliente',e.message);return {pedidoActual:null,pedidoHistorico:null};}
}
async function ultimoPedidoDelCliente(telefono){return (await contextoPedidosDelCliente(telefono)).pedidoActual;}
async function resumirPedidoDelCliente(pedido,historico=false){
    if(!pedido)return null;

    const tipoEnvio = pedido.datosCorreo ? "correo" : pedido.tipoEnvio;
    let recorridoEnCalle = false;
    if (!historico && tipoEnvio === "moto" && pedido.estado === "armado") {
      // Hay dos repartos (15:30 y 18:30) y cada uno tiene su propio recorrido, así que acá se mira
      // el del reparto al que le toca ESTE pedido: si no, a un cliente del segundo se le diría que
      // su pedido ya salió solo porque salió el primero. Los nombres de los documentos salen de
      // src/reparto/repartidores.js (ahí está la definición completa de cada reparto).
      const DOC_RECORRIDO = { moto1: "activo", moto2: "activo_moto2" };
      const docRecorrido = DOC_RECORRIDO[pedido.repartidor] || DOC_RECORRIDO.moto1;
      const recorrido = await db.collection("recorridos").doc(docRecorrido).get();
      recorridoEnCalle = recorrido.exists && recorridoDelPedido(pedido,recorrido.data());
    }

    const textos = {
      pendiente: "el pedido está registrado y pendiente de armado; todavía no figura como despachado",
      armado: tipoEnvio === "moto" && recorridoEnCalle
        ? "el pedido está armado y el reparto ya está en la calle; no hay una hora exacta ni seguimiento individual cargado"
        : "el pedido está armado, pero todavía no figura como entregado ni tiene seguimiento cargado",
      entregado: "el pedido figura como entregado",
      finalizado: pedido.entregadoEn ? "el pedido figura entregado y finalizado" : "el pedido figura finalizado en el sistema, pero no hay una confirmación de entrega al destinatario",
      cancelado: "el pedido figura cancelado",
    };

    return {
      id: pedido.id,
      esHistorico: historico,
      motivoContexto: clasificarPedido(pedido).motivo,
      estado: pedido.estado || "sin_estado",
      tipoEnvio: tipoEnvio || null,
      creadoEn: pedido.createdAt || null,
      armadoEn: pedido.armadoAt || null,
      entregadoEn: pedido.entregadoEn || null,
      fechaSalida: pedido.fechaSalida || null,
      horaSalida: pedido.horaSalida || null,
      tandaSalida: pedido.tandaSalida || null,
      puedeModificar: !historico && pedido.origen === "bot_n8n" && pedido.estado === "pendiente",
      cambio: historico ? {permitido:false,derivar:false,motivo:'registro_anterior',mensaje:'Es un registro de una compra anterior, no el pedido que el cliente está armando ahora.'} : restriccionCambio(pedido),
      detalle: pedido.origen === "bot_n8n" ? {
        cliente: pedido.cliente, direccion: pedido.direccion, items: pedido.items,
        total: pedido.total, medioPago: pedido.medioPago, mayorista: pedido.mayorista || false,
        datosCorreo: pedido.datosCorreo, envioSeguro: pedido.envioSeguro,
      } : null,
      descripcion: historico ? `Registro de una compra anterior (${pedido.fechaSalida || pedido.createdAt || 'sin fecha verificada'}); conserva estado ${pedido.estado || 'sin estado'} en el sistema. No es evidencia de un pedido actual ni de que todavía espere despacho. ${pedido.entregadoEn?'Tiene una entrega registrada.':'No hay una confirmación de entrega cargada.'}` : textos[pedido.estado] || "el pedido existe, pero su estado no está reconocido; no afirmes que salió",
      puedeAfirmarEnCamino: !historico && tipoEnvio === "moto" && pedido.estado === "armado" && recorridoEnCalle,
      puedeAfirmarEntregado: pedido.estado === "entregado" || (pedido.estado === "finalizado" && !!pedido.entregadoEn),
    };
}

async function leerOperativo() {
  const doc = await db.collection("settings").doc("operativo").get();
  return doc.exists ? doc.data() : {};
}

const textoDe = (v) => (typeof v === "string" ? v.trim() : "");

// ─────────────────────────────────────────────────────────────────────────────
// Precios: las listas del panel son texto libre, con bloques como
//     ✨ ELFBAR EB CREATE 40K        ← nombre (en mayúsculas)
//     🚀 Modelo económico            ← descripción
//     💰 1x $22.000                  ← precio por cantidad: "2x $40.000" es el combo de 2 entero
// o precios sueltos ("💰 $75.000" = una unidad) y renglones con nombre y precio juntos
// ("🔌 USB-C a Lightning → $13.000").
// ─────────────────────────────────────────────────────────────────────────────
const SEPARADOR_RE = /^[\s⸻━─—–=_-]+$/;
const PRECIO_RE = /\$\s*([\d.,]+)/;
const CANTIDAD_RE = /(\d+)\s*x\b/i;

const sinEmojis = (linea) => linea.replace(/[^\p{L}\p{N}\s.,&'’%-]/gu, " ").replace(/\s+/g, " ").trim();

function esNombre(linea) {
  const letras = linea.match(/\p{L}/gu) || [];
  const mayusculas = letras.filter((c) => c !== c.toLowerCase()).length;
  return letras.length >= 2 && mayusculas / letras.length >= 0.6;
}

// Cada producto guarda además `lineas`: todos los renglones de texto de su bloque (título de sección,
// nombre y descripción). El nombre se adivina por las mayúsculas, y cada lista del panel se escribe
// distinto ("🔥 COMBOS DISPONIBLES" arriba de "🖊️ Batería ELFTHC + Cápsula 028 1ML", "🍏 APPLE ORIGINAL"
// arriba de "🔋 Adaptador 20W Original Apple"): buscarProducto busca en todos los renglones, así un
// producto se encuentra aunque su nombre no sea el renglón que se tomó como nombre.
function parsearProductos(texto) {
  const productos = [];
  let nombres = [];
  let detalles = [];
  let bloque = []; // los renglones de texto desde el último precio o separador
  let vienePrecio = false;
  let actual = null; // el producto que está recibiendo renglones de precio
  for (const cruda of String(texto || "").split("\n")) {
    const linea = cruda.trim();
    if (!linea) continue;
    if (SEPARADOR_RE.test(linea)) {
      nombres = [];
      detalles = [];
      bloque = [];
      actual = null;
      continue;
    }
    const precio = linea.match(PRECIO_RE);
    if (precio) vienePrecio = true;
    if (!precio) {
      if (vienePrecio) bloque = []; // texto después de precios: empieza el bloque de otro producto
      vienePrecio = false;
      actual = null;
      if (/lista|precio/i.test(linea)) continue; // encabezados: "LISTA DE PRECIOS", "PRECIO LIQUIDACIÓN"
      (esNombre(linea) ? nombres : detalles).push(sinEmojis(linea));
      bloque.push(sinEmojis(linea));
      continue;
    }
    const monto = parseInt(precio[1].replace(/\D/g, ""), 10);
    if (!(monto > 0)) continue;
    const antes = linea.slice(0, precio.index);
    const cantidad = Number((antes.match(CANTIDAD_RE) || [])[1]) || 1;
    const nombreEnLinea = sinEmojis(antes.replace(CANTIDAD_RE, " "));
    if ((nombreEnLinea.match(/\p{L}/gu) || []).length >= 3) {
      productos.push({ nombre: nombreEnLinea, detalle: [...nombres, ...detalles].join(" "), lineas: [nombreEnLinea], precios: { [cantidad]: monto } });
      continue;
    }
    if (!actual) {
      actual = { nombre: nombres.join(" ") || detalles[0] || "", detalle: detalles.join(" "), lineas: bloque, precios: {} };
      productos.push(actual);
      nombres = [];
      detalles = [];
    }
    actual.precios[cantidad] = monto;
  }
  return productos.filter((p) => p.nombre);
}

function distanciaLevenshtein(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const arriba = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = arriba;
    }
  }
  return fila[b.length];
}

// 1 si la palabra está tal cual, algo menos si está con un typo, 0 si no está. Las palabras cortas
// y las que tienen números ("028", "v400", "35w") solo valen exactas.
function coincidencia(palabra, lista) {
  let mejor = 0;
  // Singular y plural son la misma palabra ("cápsula" / "CÁPSULAS", "cargador" / "cargadores"): si no,
  // el plural de la lista pierde contra un singular exacto de otro producto.
  const plural = (a, b) => a.length > 3 && !/\d/.test(a) && (b === a + "s" || b === a + "es");
  for (const w of lista) {
    if (w === palabra || plural(w, palabra) || plural(palabra, w)) return 1;
    if (palabra.length > 3 && !/\d/.test(palabra)) {
      const largo = Math.max(w.length, palabra.length);
      mejor = Math.max(mejor, (largo - distanciaLevenshtein(palabra, w)) / largo);
    }
  }
  return mejor >= 0.8 ? mejor : 0;
}

// Busca el producto que nombró el agente. Casi todas sus palabras tienen que estar en el producto, y
// se compara con cada renglón del producto (su nombre y los de su bloque, ver parsearProductos): gana
// el renglón más parecido, así "Ignite V400" no se confunde con "Ignite V400 Mix" y "Batería ELFTHC"
// no se confunde con el combo "Batería ELFTHC + Cápsula 028 1ML". Si dos quedan empatados es ambiguo
// y no se elige ninguno.
function buscarProducto(productos, nombre) {
  const q = palabras(nombre);
  if (!q.length) return null;
  const candidatos = [];
  for (const p of productos) {
    const renglones = [p.nombre, ...(p.lineas || [])];
    const enTodo = [...renglones, p.detalle].flatMap(palabras);
    const encontradas = q.filter((w) => coincidencia(w, enTodo) > 0).length;
    if (encontradas / q.length < 2 / 3) continue;
    let mejor = null;
    for (const renglon of renglones) {
      const enRenglon = palabras(renglon);
      if (!enRenglon.length) continue;
      const parecido = q.reduce((s, w) => s + coincidencia(w, enRenglon), 0) / q.length;
      if (!parecido) continue;
      // Pesa más cuánto del pedido está en el renglón que cuánto del renglón cubre el pedido: si no,
      // una descripción corta ("🌿 Live Rosin" de otra cápsula) le gana al nombre ("DOZO LIVE ROSIN 2.5G").
      const cubierto = enRenglon.filter((w) => coincidencia(w, q) > 0).length / enRenglon.length;
      const puntaje = 2 * parecido + cubierto;
      if (!mejor || puntaje > mejor.puntaje) mejor = { puntaje, renglon };
    }
    if (mejor) candidatos.push({ p, ...mejor });
  }
  candidatos.sort((a, b) => b.puntaje - a.puntaje);
  if (!candidatos.length) return null;
  if (candidatos[1] && candidatos[1].puntaje === candidatos[0].puntaje) {
    return { ambiguo: [candidatos[0].renglon, candidatos[1].renglon] };
  }
  return { producto: candidatos[0].p };
}

// Importe de N unidades con los combos de la lista: el más grande que entre y después los más
// chicos. null si esa cantidad no se puede armar (ej. gummies que solo se venden de a 2).
function importePorCantidad(precios, cantidad) {
  let resto = cantidad;
  let importe = 0;
  for (const n of Object.keys(precios).map(Number).sort((a, b) => b - a)) {
    while (resto >= n) {
      importe += precios[n];
      resto -= n;
    }
  }
  return resto === 0 ? importe : null;
}

// Devuelve { producto, precios } o { error } para una línea del pedido. Las ofertas pisan los precios
// de la lista para las cantidades que tengan cargadas.
function productoDeLinea(listas, ofertas, item) {
  const regular = buscarProducto(listas, item.producto);
  const oferta = buscarProducto(ofertas, item.producto);
  const ambiguo = (regular && regular.ambiguo) || (oferta && oferta.ambiguo);
  if (ambiguo) {
    return { error: `"${item.producto}" coincide con más de un producto (${ambiguo.join(" / ")}): usá el nombre exacto de la lista` };
  }
  if (!(regular && regular.producto) && !(oferta && oferta.producto)) {
    return { error: `no encontré "${item.producto}" en las listas de precios de hoy: usá el nombre tal cual figura en la lista` };
  }
  const precios = { ...(regular && regular.producto && regular.producto.precios), ...(oferta && oferta.producto && oferta.producto.precios) };
  return { producto: (regular && regular.producto) || oferta.producto, precios };
}

// Stock: las listas de stock del panel tienen un título por modelo (en mayúsculas) y debajo sus sabores,
// en nicotina con la cantidad entre paréntesis ("Miami Mint 🌴🌿❄️ (3)"). Un modelo sin stock no aparece.
function parsearStock(texto) {
  const modelos = [];
  for (const cruda of String(texto || "").split("\n")) {
    const linea = cruda.trim();
    if (!linea || SEPARADOR_RE.test(linea) || /stock|lista/i.test(linea)) continue;
    if (esNombre(linea)) {
      // Un título sin sabores seguido de otro título es de sección ("DESCARTABLES THC"), no un modelo.
      if (modelos.length && !modelos[modelos.length - 1].sabores.length) modelos.pop();
      modelos.push({ nombre: sinEmojis(linea), titulo: linea, detalle: "", sabores: [] });
    } else if (modelos.length) {
      const cantidad = linea.match(/\((\d+)\)\s*$/);
      modelos[modelos.length - 1].sabores.push({ texto: sinEmojis(linea.replace(/\(\d+\)\s*$/, "")), cantidad: cantidad ? Number(cantidad[1]) : null, linea });
    }
  }
  return modelos;
}

// null si hay stock; si no, el error para el agente. Sin lista de stock cargada no se frena la venta.
function faltaStock(textoStock, producto, variante, cantidad) {
  if (!String(textoStock || "").trim()) return null;
  const modelos = parsearStock(textoStock);
  let hallado = buscarProducto(modelos, producto);
  if (!hallado || !hallado.producto) {
    // En precios el nombre a veces arrastra el título de la sección ("DESCARTABLES THC DOZO LIVE ROSIN"):
    // vale el modelo de stock cuyo nombre entero esté dentro del nombre de precios.
    const buscadas = palabras(producto);
    const contenido = modelos.filter((m) => palabras(m.nombre).every((w) => coincidencia(w, buscadas) > 0))
      .sort((a, b) => palabras(b.nombre).length - palabras(a.nombre).length)[0];
    if (contenido) hallado = { producto: contenido };
  }
  if (!hallado || !hallado.producto) return `no hay stock de ${producto}: ofrecele otro de la lista de stock`;
  const { sabores } = hallado.producto;
  if (!sabores.length) return null;
  const conStock = sabores.filter((s) => s.cantidad !== 0);
  const listado = conStock.map((s) => s.texto + (s.cantidad ? ` (${s.cantidad})` : "")).join(", ");
  const pedidas = palabras(variante);
  if (!pedidas.length) return `falta el sabor de ${producto}; con stock hay: ${listado}`;
  const sabor = sabores
    .map((s) => ({ s, puntaje: pedidas.filter((w) => coincidencia(w, palabras(s.texto)) > 0).length / pedidas.length }))
    .filter((x) => x.puntaje >= 2 / 3)
    .sort((a, b) => b.puntaje - a.puntaje || palabras(a.s.texto).length - palabras(b.s.texto).length)[0];
  if (!sabor || sabor.s.cantidad === 0) return `no hay stock de ${producto} ${variante}; con stock hay: ${listado}`;
  if (sabor.s.cantidad !== null && sabor.s.cantidad < cantidad) return `de ${producto} ${sabor.s.texto} hay solo ${sabor.s.cantidad}`;
  return null;
}

function descuentoEfectivo(subtotal) {
  return TRAMOS_DESCUENTO_EFECTIVO.find((t) => subtotal >= t.desde).off;
}

// ─────────────────────────────────────────────────────────────────────────────
// Direcciones
// ─────────────────────────────────────────────────────────────────────────────
function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Kilómetros REALES por calle entre el depósito y un punto, con la misma vara con la que se le paga
// al motomensajero en /reparto (Routes API, moto, con tránsito — ver src/reparto/routesApi.js).
//
// Antes el envío se le cobraba al cliente por la distancia EN LÍNEA RECTA, mientras que a la moto se
// le pagaba por la calle. La calle es un 39% más larga (medido sobre 131 entregas reales): el cliente
// pagaba 1 y la moto cobraba 1,39, así que cada envío en moto perdía plata sola — $1.439 en el envío
// típico, $304.789 en 126 entregas. Midiendo las dos puntas igual, el envío queda neutro.
//
// Si Google no contesta, se cae a la línea recta multiplicada por ese mismo factor: es menos exacto,
// pero no vuelve a dejar el cobro sistemáticamente corto.
const FACTOR_CALLE = 1.4;

async function kmPorCalle(destino) {
  try {
    const { data } = await axios.post(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        origin: { location: { latLng: { latitude: DEPOSITO.lat, longitude: DEPOSITO.lng } } },
        destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lng } } },
        travelMode: "TWO_WHEELER",
        routingPreference: "TRAFFIC_AWARE",
      },
      {
        headers: { "X-Goog-Api-Key": GOOGLE_MAPS_KEY, "X-Goog-FieldMask": "routes.distanceMeters" },
        timeout: 8000,
      }
    );
    const metros = data.routes && data.routes[0] && data.routes[0].distanceMeters;
    return typeof metros === "number" ? metros / 1000 : null;
  } catch (e) {
    console.error("[agente-api] Routes API no respondió, se usa el estimado:", e.message);
    return null;
  }
}

// Ubica la dirección y resuelve todo lo que depende de ella. La moto cubre CABA entera y el
// Corredor Norte (zona B); en toda esa zona se puede pagar al recibir. null si Google no la ubica.
async function ubicar(direccion) {
  if (!String(direccion || "").trim()) return null;
  const { data } = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
    params: { address: direccion, key: GOOGLE_MAPS_KEY, region: "ar", components: "country:AR" },
    timeout: 8000,
  });
  const r = data.results && data.results[0];
  if (!r) return null;
  const componentes = r.address_components || [];
  const barrios = componentes
    .filter((c) => c.types.some((t) => TIPOS_DE_BARRIO.includes(t)))
    .flatMap((c) => [normalizar(c.long_name), normalizar(c.short_name)]);
  const zona = barrios.map((b) => BARRIO_A_ZONA[b]).find(Boolean) || null;
  const esCABA = componentes.some((c) => NOMBRES_CABA.has(normalizar(c.long_name)) || NOMBRES_CABA.has(normalizar(c.short_name)));
  const { lat, lng } = r.geometry.location;
  const kmCalle = await kmPorCalle({ lat, lng });
  const km = Math.round((kmCalle !== null ? kmCalle : haversineKm(DEPOSITO, { lat, lng }) * FACTOR_CALLE) * 10) / 10;
  return {
    lat, lng, zona, km, esCABA, kmExacto: kmCalle !== null,
    cubiertoMoto: esCABA || zona === "B",
    monto: Math.max(Math.round(km * TARIFA_POR_KM), MINIMO_ENVIO),
  };
}

// Cada compra mantiene su historial de cotizaciones. La más reciente reemplaza
// a la anterior; un pedido cargado cierra ese ciclo.
async function cotizacionesDeCompra(telefono, direccion) {
  const tel = normalizarTelefono(telefono);
  if (!tel) return { cotizaciones: [], cicloCompra: "inicial" };
  const [cotSnap, pedidosSnap] = await Promise.all([
    db.collection("cotizaciones_uber").where("telefonoCliente", "==", tel).get(),
    db.collection("pedidos").where("telefono", "==", tel).get(),
  ]);
  const fecha = (v) => Date.parse(v || "") || 0;
  const pedidos = pedidosSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => fecha(b.createdAt) - fecha(a.createdAt));
  const ultimo = pedidos[0];
  const desde = Math.max(fecha(ultimo?.createdAt), Date.now() - 24 * 3600000);
  let cotizaciones = cotSnap.docs.map((d) => ({ ...d.data(), id: d.id }))
    .filter((c) => !c.pedidoId && !c.usadaEnPedidoId && !c.canceladaEn && !["cancelada", "sustituida"].includes(c.estado))
    .filter((c) => !desde || (fecha(c.createdAt) || fecha(c.resueltoEn)) > desde)
    .sort((a, b) => (fecha(a.createdAt) || fecha(a.resueltoEn)) - (fecha(b.createdAt) || fecha(b.resueltoEn)));
  // Si el cliente cambió el destino, el contexto corresponde al destino más reciente.
  // La identificación siempre incluye el teléfono: los ids de conversación pueden
  // repetirse después de una migración de Chatwoot.
  const destino = direccion || cotizaciones[cotizaciones.length - 1]?.direccion;
  if (destino) cotizaciones = cotizaciones.filter((c) => mismaDireccionCotizacion(c.direccion, destino));
  return { cotizaciones, cicloCompra: (ultimo?.id || "inicial") + "|" + fechaBA(new Date()) };
}

const VIGENCIA_UBER_MS = 45 * 60000;
const AVISO_UBER_VENCIDO = "como pasaron más de 45 minutos, te tengo que cotizar el Uber de vuelta";
const cotizacionActual = (cotizaciones) => cotizaciones[cotizaciones.length - 1] || null;
const inicioPrecioUber = (c) => Date.parse(c.informadoEn || c.resueltoEn || c.procesadoEn || c.createdAt || "") || 0;
const precioUberVencido = (c) => Number(c?.montoUber) > 0 && (!inicioPrecioUber(c) || Date.now() > inicioPrecioUber(c) + VIGENCIA_UBER_MS);
const vencimientoUber = (c) => new Date(inicioPrecioUber(c) + VIGENCIA_UBER_MS).toISOString();
function precioVigente(cotizaciones) {
  const actual = cotizacionActual(cotizaciones);
  return Number(actual?.montoUber) > 0 && !precioUberVencido(actual) ? actual : null;
}

async function cotizacionUber(telefono, direccion) {
  return precioVigente((await cotizacionesDeCompra(telefono, direccion)).cotizaciones);
}

async function contextoCotizacionUber(telefono) {
  const { cotizaciones } = await cotizacionesDeCompra(telefono);
  const cot = precioVigente(cotizaciones);
  if (cot) return { id: cot.id, estado: "cotizado", montoUber: Number(cot.montoUber), direccion: cot.direccion || "", venceEn: vencimientoUber(cot), vigenciaMinutos: 45 };
  const actual = cotizacionActual(cotizaciones);
  const pendiente = actual?.estado === "pendiente" ? actual : null;
  if (pendiente) return { id: pendiente.id, estado: "pendiente", direccion: pendiente.direccion || "" };
  if (precioUberVencido(actual)) return { id: actual.id, estado: "vencido", direccion: actual.direccion || "", montoAnterior: Number(actual.montoUber), venceEn: vencimientoUber(actual), necesitaRecotizacion: true, mensaje: AVISO_UBER_VENCIDO };
  const sinUber = actual && sinCoberturaUber(actual) ? actual : null;
  return sinUber ? { id: sinUber.id, estado: "sin_cobertura", direccion: sinUber.direccion || "", alternativa: "correo", mensaje: "Para esa dirección ofrecemos correo. Preguntá si prefiere sucursal o domicilio; no vuelvas a pedir Uber por tu cuenta." } : null;
}

const sinCoberturaUber = (c) => c.sinCoberturaUber === true || c.estado === "no_llegamos" || (c.estado === "procesado" && !(Number(c.montoUber) > 0));
const MINUTOS_REINTENTO_UBER = 45;

const tiempoCotizacionUber = (c) => Math.max(
  Date.parse(c.createdAt) || 0,
  Date.parse(c.resueltoEn) || 0,
  Date.parse(c.procesadoEn) || 0
);
// El agente escribe la misma dirección distinta cada vez ("Av. del Libertador 5930, Belgrano, CABA,
// esquina Juramento" / "Av. del Libertador 5930, entre Juramento y Echeverría"): se compara solo la
// calle y la altura. Sin altura (una esquina, una YPF) no hay con qué comparar y se da por buena.
function nucleoDireccion(direccion) {
  const calle=normalizar(String(direccion||"").split(/[,(]|\bentre\b|\besquina\b/i)[0]).replace(/\b(av|avda|avenida|calle)\b/g," ").replace(/\s+/g," ").trim();
  const numero=[...calle.matchAll(/\b\d{1,5}\b/g)].find(m=>!/^ de\b/.test(calle.slice(m.index+m[0].length)));
  return numero ? calle.slice(0,numero.index).trim()+"|"+numero[0] : calle;
}
function mismaDireccionCotizacion(a,b) {
  if(!String(a||"").trim()||!String(b||"").trim())return true; // compatibilidad con cotizaciones antiguas sin dirección
  const localidad = texto => {
    const resto = normalizar(String(texto).split(",").slice(1).join(" "));
    const norte = ["vicente lopez", "olivos", "la lucila", "florida", "munro", "martinez", "san isidro", "san fernando", "tigre", "san martin", "avellaneda", "lanus", "quilmes", "moron"];
    const encontrada = norte.find(l => new RegExp("\\b" + l + "\\b").test(resto));
    if (encontrada) return encontrada;
    if (/\bcaba\b|capital federal|ciudad autonoma|belgrano|palermo|recoleta|san telmo|caballito|villa urquiza|nunez|colegiales/.test(resto)) return "caba";
    return null;
  };
  const la = localidad(a), lb = localidad(b);
  return nucleoDireccion(a)===nucleoDireccion(b) && (!la || !lb || la === lb);
}

// ─────────────────────────────────────────────────────────────────────────────
// Salidas y tanda
// ─────────────────────────────────────────────────────────────────────────────
function horaBuenosAires(fecha) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Argentina/Buenos_Aires", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(fecha).map((p) => [p.type, p.value])
  );
  return { dia: partes.weekday, fecha: `${partes.year}-${partes.month}-${partes.day}`, minutos: Number(partes.hour) * 60 + Number(partes.minute) };
}

// Cada fecha puede tener una excepción guardada en el panel operativo.
function horarioUber(dia, fecha, horarios = {}) {
  const h = horarios[fecha];
  if (h?.cerrado === true) return null;
  const desde = h?.desde || (dia === "Sun" ? "17:00" : "13:30"), hasta = h?.hasta || "20:00";
  const inicio = minutosDe(desde), fin = minutosDe(hasta);
  if (inicio === null || fin === null || inicio < 13*60+30 || fin > ULTIMA_TANDA || inicio > fin) return null;
  return {inicio,fin};
}
function tandasDelDia(dia, fecha, horarios) {
  const h = horarioUber(dia,fecha,horarios);
  if (!h) return [];
  const tandas=[];for(let m=h.inicio;m<=h.fin;m+=CADA_TANDA)tandas.push(m);return tandas;
}

// "13", "13:00", "13.30" o "13 hs" → minutos del día; cualquier otra cosa → null.
function minutosDe(texto) {
  const m = String(texto || "").trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(?:h|hs|hrs)?\.?$/i);
  if (!m || Number(m[1]) > 23 || Number(m[2] || 0) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2] || 0);
}

const hhmmDe = (minutos) => `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, "0")}`;

// Programacion de Uber por cola, separada de las dos salidas de moto del panel.
const DIAS_SEMANA = { Sun: "domingo", Mon: "lunes", Tue: "martes", Wed: "miércoles", Thu: "jueves", Fri: "viernes", Sat: "sábado" };

// Los días sin despacho (feriados, domingos que no se trabaja) los carga el depósito en /operativo
// como "AAAA-MM-DD": lo que se pide ese día, o antes para ese día, sale el próximo día con despacho.
function diasSinDespachoDe(op) {
  return Array.isArray(op.diasSinDespacho) ? op.diasSinDespacho.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
}

// El próximo día con despacho a partir de mañana: { dia (hora de BA), etiqueta ("mañana", "el lunes") }.
function proximoDiaHabil(fecha, sinDespacho) {
  for (let n = 1; n <= 14; n++) {
    const d = horaBuenosAires(new Date(fecha.getTime() + n * 24 * 60 * 60 * 1000));
    if (!sinDespacho.includes(d.fecha)) return { d, etiqueta: n === 1 ? "mañana" : `el ${DIAS_SEMANA[d.dia]}` };
  }
  return { d: horaBuenosAires(new Date(fecha.getTime() + 24 * 60 * 60 * 1000)), etiqueta: "mañana" };
}

function salida(fecha, { enCola, limite, soloManana, sinDespacho = [], horariosUberPorFecha = {} }) {
  const ahora=horaBuenosAires(fecha);let saltear=Math.floor(enCola/limite);
  for(let n=0;n<=14;n++) {
    const d=horaBuenosAires(new Date(fecha.getTime()+n*86400000));
    if(sinDespacho.includes(d.fecha)||(n===0&&soloManana))continue;
    const opciones=tandasDelDia(d.dia,d.fecha,horariosUberPorFecha).filter(m=>n>0||(ahora.minutos<CORTE_DESPACHO&&m>=ahora.minutos));
    if(saltear<opciones.length)return {dia:n===0?"hoy":n===1?"mañana":"el "+DIAS_SEMANA[d.dia],fecha:d.fecha,hora:hhmmDe(opciones[saltear])};
    saltear-=opciones.length;
  }
  return null;
}

// Los pedidos de moto y Uber "para armar" (pendientes) ocupan las tandas; los armados ya salieron.
// Ante un error se cuenta la cola vacía: nunca se frena una venta por esto.
async function pedidosEnCola() {
  try {
    const snap = await db.collection("pedidos").where("estado", "==", "pendiente").get();
    return snap.docs.filter((d) => ["moto", "uber", undefined, null].includes(d.data().tipoEnvio)).length;
  } catch (e) {
    console.error("[agente-api] no se pudo contar la tanda", e.message);
    return 0;
  }
}

// Demora operativa escalonada por cola real: si el panel marcó "solo mañana", eso manda; si no,
// la cantidad de pedidos pendientes ajusta el texto automáticamente.
function demoraOperativa(op, enCola) {
  if (op.situacion === "solo_manana") return DEMORAS.solo_manana;
  if (enCola > 10) return DEMORAS.demora_fuerte;
  if (enCola >= 8) return DEMORAS.demora_media;
  if (enCola >= 5) return DEMORAS.demora;
  return DEMORAS[op.situacion] || DEMORAS.sin_demora;
}

// El Uber conserva sus tandas de media hora; la moto usa opcionesMoto.
function salidaDeUnPedidoNuevo(op, enCola) {
  const limite = Number(op.limitePorTanda) > 0 ? Number(op.limitePorTanda) : LIMITE_POR_TANDA;
  return salida(new Date(), { enCola, limite, soloManana: op.situacion === "solo_manana", sinDespacho: diasSinDespachoDe(op), horariosUberPorFecha: op.horariosUberPorFecha || {} });
}

async function pedidosMoto() {
  const snap = await db.collection("pedidos").where("tipoEnvio", "==", "moto").get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /agentEstadoOperativo — todo lo que el agente necesita saber del día
// ─────────────────────────────────────────────────────────────────────────────
function esConsultaSeguimiento(texto) {
  const t = normalizar(texto);
  // Una consulta mixta, un reclamo o un cambio se atienden completos en el agente.
  if (/\b(cuanto sale|cuanto cuesta|cuanto es|tenes|tienen|stock|sabores|catalogo)\b/.test(t)) return false;
  if (/\b(cambiar|cambio|agregar|sumar|cancelar|devolver|robaron|perdido|falta un|faltan productos|no llego|no funciona|direccion|comprobante|precio|comprar|quiero otro)\b/.test(t)) return false;
  return /\b(cuando|cuanto|a que hora)\b.{0,45}\b(llega|llegan|falta|faltan|sale|salen|saldria|tarda|tardan|demora|demoran)\b|\b(ya salio|ya salieron|ya esta armado|esta armado|esta en camino|donde esta mi pedido|donde esta el pedido|seguimiento|codigo de seguridad|novedades de mi pedido|alguna novedad del pedido)\b/.test(t);
}

async function consultaSeguimiento(pedidoActual, q) {
  if (!pedidoActual || !esConsultaSeguimiento(q.mensaje) || !["pendiente", "armado"].includes(pedidoActual.estado)) return null;
  const ref = db.collection("agente_seguimiento").doc(hashCorto(`${normalizarTelefono(q.telefono)}|${pedidoActual.id}`));
  const id = String(q.mensajeId || "");
  const numero = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref), previo = doc.exists ? doc.data() : {};
    const vistos = previo.mensajes || [];
    const encontrado = vistos.find((v) => v.id === id);
    if (encontrado) return encontrado.numero;
    const numero = Number(previo.consultas || 0) + (id ? 1 : 0);
    if (id) tx.set(ref, { pedidoId: pedidoActual.id, telefono: normalizarTelefono(q.telefono), consultas: numero, mensajes: [...vistos, { id, numero }].slice(-100), actualizadoEn: new Date().toISOString() });
    return numero;
  });
  const estado = pedidoActual.estado === "armado"
    ? (pedidoActual.puedeAfirmarEnCamino ? "tu pedido está armado y el reparto ya está en la calle" : "tu pedido ya está armado")
    : "tu pedido está registrado y en preparación";
  return { aplica: true, numero, derivar: numero > 5, mensaje: `${estado}\nel equipo te va a enviar el seguimiento y el código de seguridad${pedidoActual.puedeAfirmarEnCamino ? "" : " cuando salga"}` };
}

// Reserva atómica del aviso: los reintentos del webhook no envían dos mensajes.
async function notificacionUber(b, res) {
  if (!b.idConversacion || (!b.noLlegamos && !(Number(b.montoUber) > 0))) return rechazar(res, "aviso Uber inválido");
  if(b.accion!=="confirmar_aviso_uber") {const v=await vigenciaAvisoUber(b);if(!v.permitir)return res.json({ok:true,...v});if(b.accion==="validar_aviso_uber")return res.json({ok:true,...v});}
  const clave = hashCorto(`${b.idCotizacion || b.idConversacion}|${b.noLlegamos ? "sin_cobertura" : Number(b.montoUber)}`);
  const ref = db.collection("agente_avisos_uber").doc(clave);
  const ahora = Date.now();
  const resultado = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref), anterior = snap.exists ? snap.data() : {};
    if (b.accion === "confirmar_aviso_uber") {
      if (!b.reserva || b.reserva !== anterior.reserva) return { ok: false, permitir: false };
      tx.set(ref, { ...anterior, enviado: true, enviadoEn: new Date().toISOString() });
      return { ok: true, confirmado: true };
    }
    const vigente = b.idCotizacion || ahora - (Date.parse(anterior.creadoEn) || 0) < 45 * 60000;
    if (vigente && (anterior.enviado || ahora < Number(anterior.bloqueadoHasta || 0))) return { ok: true, permitir: false, duplicado: true, confirmado:anterior.enviado===true, enProceso:anterior.enviado!==true };
    const reserva = crypto.randomBytes(16).toString("hex");
    tx.set(ref, { reserva, enviado: false, creadoEn: new Date().toISOString(), bloqueadoHasta: ahora + 5 * 60000 });
    return { ok: true, permitir: true, reserva };
  });
  return res.json(resultado);
}

exports.agentEstadoOperativo = conClave(async (req, res) => {
  if (req.method === "POST" && ["reservar_aviso_uber", "confirmar_aviso_uber", "validar_aviso_uber"].includes(req.body?.accion)) return notificacionUber(req.body, res);
  res.setHeader('X-028-Contexto','2026-10-25-stock-historial-v1');
  res.setHeader('X-028-Atencion','2026-10-26-estandar-v1');
  const op = await leerOperativo();
  const plantillas = { ...PLANTILLAS_FIJAS, ALIAS: ALIASES[op.aliasActivo] || ALIASES.alias1 };
  delete plantillas.WEB;
  plantillas.COMPROBANTES_VALIDOS += `\nCuenta activa para una venta nueva (${ALIASES[op.aliasActivo] ? op.aliasActivo : "alias1"}):\n${plantillas.ALIAS}`;
  for (const [nombre, campo] of Object.entries(LISTAS_DEL_PANEL)) plantillas[nombre] = textoDe(op[campo]);
  plantillas.COMPROBANTES_VALIDOS += `\nTolerancia de importe: hasta $${TOLERANCIA_COMPROBANTE} de diferencia absoluta, tanto de mas como de menos. Solo derivar por importe si supera esa diferencia. Recepcion del archivo no equivale a acreditacion bancaria.`;
  const horarios = tandasMoto(op);
  plantillas.FORMAS_DE_ENTREGA = plantillas.FORMAS_DE_ENTREGA.replace("⏳ 13:30 hs - 🌙 20:00 hs", `⏳ Dos salidas: ${horarios[0].hora} y ${horarios[1].hora}. Fecha y disponibilidad a confirmar.`);
  const [enCola, contextoPedidos, motos, cotizacionUberActual,atencionConversacion] = await Promise.all([
    pedidosEnCola(),
    contextoPedidosDelCliente(req.query.telefono),
    pedidosMoto(),
    contextoCotizacionUber(req.query.telefono),
    leerAtencionConversacion(db,req.query.idConversacion),
  ]);
  const {pedidoActual,pedidoHistorico}=contextoPedidos;
  const opciones = opcionesMoto(op, motos);
  const salidaUber=salidaDeUnPedidoNuevo(op,enCola),ahora=horaBuenosAires(new Date());
  const hUber=horarioUber(ahora.dia,ahora.fecha,op.horariosUberPorFecha||{});
  const atencionEnvios=datosAtencionEnvios({fecha:ahora.fecha,hora:hhmmDe(ahora.minutos),cierreHora:hUber?hhmmDe(hUber.fin):'20:00',moto:opciones[0],uber:salidaUber});
  const horarioFlash=salidaUber?.fecha===ahora.fecha&&hUber?`⏳ ${hhmmDe(hUber.inicio)} hs a ${hhmmDe(hUber.fin)} hs`:salidaUber?`⏳ Próxima salida: ${corta(salidaUber.fecha)} a las ${salidaUber.hora}. A confirmar con el pedido.`:'⏳ Consultá la próxima salida disponible antes de pagar.';
  plantillas.FORMAS_DE_ENTREGA=plantillas.FORMAS_DE_ENTREGA.replace('⏳ 13:30 hs a 20:00 hs',horarioFlash);
  plantillas.STOCK_NICOTINA=sinPrecios(plantillas.STOCK_NICOTINA);
  plantillas.STOCK_THC=sinPrecios(plantillas.STOCK_THC);
  plantillas.STOCK_PERFUMES=sinPrecios(plantillas.PERFUMES);
  plantillas.STOCK_APPLE_ACCESORIOS=sinPrecios(plantillas.APPLE_ACCESORIOS);
  res.json({
    ok: true,
    horariosUberPorFecha:op.horariosUberPorFecha || {},
    salida: opciones[0] || null,
    opcionesMoto: opciones.slice(0, 4),
    salidasMoto: horarios,
    mayorista: { minimoUnidades: 10, agrupacion: op.mayoristaAgrupacion || "por_modelo", dolarEnPesos: Number(op.dolarMayorista) > 0 ? Number(op.dolarMayorista) : null, derivarSoloNegociacion: true },
    combosBateriasTitulo: textoDe(op.combosBateriasTitulo) || "Combos y baterias",
    salidaUber,
    atencionEnvios,
    atencionConversacion,
    pedidosEnCola: enCola,
    demora: demoraOperativa(op, enCola),
    pedidoActual,
    pedidoHistorico,
    consultaPedidoHistorico:!!pedidoHistorico&&(consultaHistorica(req.query.mensaje)||(!pedidoActual&&esConsultaSeguimiento(req.query.mensaje))),
    cotizacionUber: cotizacionUberActual,
    consultaSeguimiento: await consultaSeguimiento(pedidoActual, req.query),
    correoArgentino: { conectado: false, motivo: "pendiente de credenciales de MiCorreo/PAQ.AR" },
    plantillas,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /agentCotizarEnvio?direccion= — cuánto sale la moto a esa dirección
// ─────────────────────────────────────────────────────────────────────────────
exports.agentCotizarEnvio = conClave(async (req, res) => {
  const u = await ubicar(req.query.direccion);
  if (!u) return res.json({ ok: true, encontrada: false });
  res.json({
    ok: true,
    encontrada: true,
    cubiertoMoto: u.cubiertoMoto,
    monto: u.cubiertoMoto ? u.monto : null,
    km: u.km,
    zona: u.zona,
    admiteEfectivo: u.cubiertoMoto,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /agentBuscarCatalogo?consulta= — lo que hay de lo que pidió el cliente
// ─────────────────────────────────────────────────────────────────────────────
// El agente no recibe el catálogo entero en cada turno (se paga en cada respuesta): cuando necesita saber
// si hay algo, a cuánto o en qué sabores, lo busca acá. Devuelve solo lo que coincide, leído de las mismas
// listas del panel y con el mismo buscador que después cobra. Si el cliente pide la lista completa, el
// agente manda la plantilla (eso no pasa por acá).
const NOMBRE_LISTA = Object.fromEntries(Object.entries(LISTAS_DEL_PANEL).map(([nombre, campo]) => [campo, nombre]));
// Palabras que no distinguen un producto ("¿qué vapes tenés?"): no cuentan para buscar.
const PALABRAS_GENERICAS = new Set(["vape", "vapes", "vaper", "vapers", "pod", "pods", "descartable", "descartables", "thc", "nicotina",
  "perfume", "perfumes", "accesorio", "accesorios", "stock", "precio", "precios", "lista", "catalogo", "hay", "tenes", "tienen", "tenian",
  "que", "sabor", "sabores", "producto", "productos", "quiero", "busco", "uno", "una"]);

// El modelo de la lista de stock que corresponde a un producto de precios (vapes y THC): null si esa
// lista no tiene stock cargado, undefined si el modelo no figura.
function modeloDeStock(op, producto) {
  const campo = STOCK_DE[producto.lista];
  if (!campo || !textoDe(op[campo])) return null;
  const modelos = parsearStock(op[campo]);
  let hallado = buscarProducto(modelos, producto.nombre);
  if (!hallado || !hallado.producto) {
    const buscadas = palabras(producto.nombre);
    const contenido = modelos.filter((m) => palabras(m.nombre).every((w) => coincidencia(w, buscadas) > 0))
      .sort((a, b) => palabras(b.nombre).length - palabras(a.nombre).length)[0];
    if (contenido) hallado = { producto: contenido };
  }
  return hallado && hallado.producto ? hallado.producto : undefined;
}

// Los sabores con stock de un producto de precios, o null si esa lista no tiene stock.
function stockDeProducto(op, producto) {
  const modelo = modeloDeStock(op, producto);
  if (modelo === null) return null;
  if (!modelo) return [];
  return modelo.sabores.filter((s) => s.cantidad !== 0).map((s) => s.texto + (s.cantidad ? ` (${s.cantidad})` : ""));
}

// El pedazo de la plantilla de stock de ese modelo, tal como lo escribió el depósito (título y un sabor
// por renglón, con sus emojis), sin los sabores agotados: el agente lo copia en vez de reescribirlo.
function bloqueDeStock(op, producto) {
  const modelo = modeloDeStock(op, producto);
  if (!modelo) return null;
  const sabores = modelo.sabores.filter((s) => s.cantidad !== 0).map((s) => s.linea);
  return sabores.length ? [modelo.titulo, "", ...sabores].join("\n") : null;
}

function buscarEnCatalogo(op, consulta) {
  const q = palabras(consulta).filter((w) => !PALABRAS_GENERICAS.has(w));
  const productos = LISTAS_CON_PRECIO.flatMap((campo) => parsearProductos(op[campo]).map((p) => ({ ...p, lista: campo })));
  const ofertas = parsearProductos(op.ofertasTexto);
  const precios = (p) => Object.entries(p.precios).map(([n, m]) => `${n}x ${$(m)}`).join(", ");
  const indice = Object.fromEntries(LISTAS_CON_PRECIO.map((campo) => [NOMBRE_LISTA[campo], parsearProductos(op[campo]).map((p) => p.nombre)]).filter(([, v]) => v.length));
  const respuesta = { ok: true, consulta: String(consulta || ""), resultados: [] };
  if (/mayor/i.test(consulta || "") && textoDe(op.preciosMayoristaTexto)) respuesta.listaMayorista = textoDe(op.preciosMayoristaTexto);
  if (q.length) {
    // Se busca en el nombre, la descripción y los sabores con stock ("watermelon" trae los modelos que lo tienen).
    const puntaje = (p, sabores) => {
      const enTodo = [p.nombre, ...(p.lineas || []), p.detalle, ...(sabores || [])].flatMap(palabras);
      return q.filter((w) => coincidencia(w, enTodo) > 0).length / q.length;
    };
    let hallados = productos.map((p) => { const sabores = stockDeProducto(op, p); return { p, sabores, s: puntaje(p, sabores), mejor: buscarProducto([p], consulta) }; })
      .filter((x) => x.s >= (q.length === 1 ? 1 : 0.5))
      .sort((a, b) => b.s - a.s || (b.mejor ? 1 : 0) - (a.mejor ? 1 : 0));
    // Si hay productos que coinciden con todo lo pedido, los parciales sobran ("ice king" no trae "Sweet King").
    if (hallados.some((x) => x.s === 1)) hallados = hallados.filter((x) => x.s === 1);
    respuesta.resultados = hallados.slice(0, 6).map(({ p, sabores }) => {
      const r = { lista: NOMBRE_LISTA[p.lista], nombre: p.nombre, detalle: (p.lineas || []).filter((l) => l !== p.nombre).join(" · "), precios: precios(p) };
      if (p.lista === "appleTexto") {const texto=normalizar(p.nombre+" "+(p.lineas||[]).join(" "));r.autenticidadDeclarada=/original/.test(texto)?"original según la lista del negocio":/foxconn|foxcom/.test(texto)?"Foxconn según la lista del negocio; no equivale por sí solo a original Apple":"no especificada; no afirmar original ni Foxconn";}
      if (sabores) r.saboresConStock = sabores.length ? sabores : "sin stock";
      const bloque = bloqueDeStock(op, p);
      if (bloque) r.bloqueStock = bloque;
      const oferta = buscarProducto(ofertas, p.nombre);
      if (oferta && oferta.producto) r.oferta = precios(oferta.producto);
      return incorporarFichaFisica(r);
    });
  }
  if(textoDe(op.informacionProductosTexto)) respuesta.informacionAdicionalProductos=textoDe(op.informacionProductosTexto);
  if (!respuesta.resultados.length) {
    respuesta.indice = indice;
    respuesta.nota = q.length
      ? `no encontré "${consulta}" en las listas de hoy: no digas que no hay sin ofrecer lo más parecido del índice`
      : "consulta general: si quiere ver todo, mandá la plantilla de esa categoría; si no, preguntale qué busca";
  }
  return respuesta;
}

exports.agentCotizarProductos = conClave(async (req,res) => {
  if(req.method!=="POST") return res.status(405).json({ok:false,error:"Usá POST para cotizar productos"});
  const b=req.body||{},op=await leerOperativo();
  const mayorista=b.mayorista===true;
  let c;
  try {c=cotizarProductos(op,b.items,{mayorista,medioPago:formaDePago(b.medioPago),permitirSinSabor:true});}
  catch(e){return rechazar(res,e.message);}
  if(mayorista && !(Number.isFinite(c.dolarMayorista)&&c.dolarMayorista>0)) return res.json({ok:true,soloProductos:true,moneda:"USD",subtotalUSD:c.subtotalUSD,necesitaTipoCambio:true,mensaje:"Los productos suman USD "+c.subtotalUSD+". El total en pesos requiere el dólar mayorista del panel; el envío se cotiza aparte."});
  const descuento=formaDePago(b.medioPago)==="efectivo"&&!mayorista?descuentoEfectivo(c.subtotal):0;
  return res.json({ok:true,soloProductos:true,moneda:"ARS",items:c.lineas,subtotal:c.subtotal,montoDescuento:descuento,totalProductos:c.subtotal-descuento,incluyeEnvio:false,
    mensaje:c.lineas.map(l=>l.cantidad+"x "+l.producto+(l.variante?" - "+l.variante:"")+": "+$(l.importe)).join("\n")+"\nTotal de productos: "+$(c.subtotal-descuento)+(descuento?" (incluye descuento por efectivo)":"")+". El envío se cotiza aparte."});
});

exports.agentBuscarCatalogo = conClave(async (req, res) => {
  res.setHeader('X-028-Atencion','2026-10-26-estandar-v1');
  const r=buscarEnCatalogo(await leerOperativo(),req.query.consulta);
  if(req.query.sinPrecios==='true'||req.query.sinPrecios==='1'){
    r.resultados=r.resultados.map(({precios,oferta,...p})=>({...p,detalle:sinPrecios(p.detalle)}));
    delete r.listaMayorista;
  }
  res.json(r);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /agentPedido — calcula el resumen (preview: true) o carga el pedido
// ─────────────────────────────────────────────────────────────────────────────
const ENVIO_LABEL = { moto: "🛵 Moto mensajería", uber: "⚡ Envío flash (Uber)", correo: "📦 Correo (Vía Cargo)" };

// El agente a veces manda la dirección como texto y a veces partida en campos (calle, altura,
// barrio, piso…): se arma siempre entera, para cotizar bien y para que el depósito la vea completa.
function armarDireccion(d) {
  if (typeof d === "string") return { texto: d.trim(), referencias: null };
  const dir = d || {};
  let texto = String(dir.texto || dir.calle || "").trim();
  if (dir.altura && !texto.includes(String(dir.altura))) texto += ` ${dir.altura}`;
  const piso = dir.piso && `piso ${dir.piso}`;
  const depto = dir.depto && dir.depto !== dir.piso && `depto ${dir.depto}`;
  for (const parte of [dir.barrio, dir.localidad, piso, depto]) {
    if (parte && !texto.toLowerCase().includes(String(parte).toLowerCase())) texto += `, ${parte}`;
  }
  return { texto: texto.trim(), referencias: dir.referencias || null };
}

// El cierre conserva el pedido calculado, no una reconstrucción del texto del chat.
const refCierreCompra = (telefono, conversacion) => db.collection("bot_cierres").doc(hashCorto(`${normalizarTelefono(telefono)}|${String(conversacion || "")}`));
function datosCierreCompra(b) {
  const campos = ["items", "tipoEnvio", "direccion", "medioPago", "envioSeguro", "horaSolicitada", "datosCorreo", "cliente", "salidaSeleccionada", "mayorista", "cuentaCobro", "pedidoId"];
  return Object.fromEntries(campos.filter(k => b[k] !== undefined).map(k => [k, b[k]]));
}
function huellaCierreCompra(b) {
  const p = datosCierreCompra(b);
  const limpio = { items: (p.items || []).map(i => ({ producto: normalizar(i.producto || ""), variante: normalizar(i.variante || ""), cantidad: Number(i.cantidad) })), tipoEnvio: p.tipoEnvio, direccion: normalizar(armarDireccion(p.direccion).texto), medioPago: formaDePago(p.medioPago), envioSeguro: p.envioSeguro === true, horaSolicitada: p.horaSolicitada || null, datosCorreo: p.datosCorreo || null, cliente: normalizar(p.cliente || ""), salidaSeleccionada: p.salidaSeleccionada || null, mayorista: p.mayorista === true, pedidoId: p.pedidoId || null };
  if (limpio.salidaSeleccionada) limpio.salidaSeleccionada = {fecha:limpio.salidaSeleccionada.fecha,tandaId:limpio.salidaSeleccionada.tandaId,hora:limpio.salidaSeleccionada.hora||null};
  if (limpio.datosCorreo) limpio.datosCorreo = {aSucursal:limpio.datosCorreo.aSucursal,dni:limpio.datosCorreo.dni||null,localidad:normalizar(limpio.datosCorreo.localidad||""),cp:limpio.datosCorreo.cp||null};
  return hashCorto(JSON.stringify(limpio));
}
async function leerCierreCompra(b) {
  if (!b.telefono || !b.idConversacion) return null;
  const snap = await refCierreCompra(b.telefono, b.idConversacion).get();
  if (!snap.exists) return null;
  const c = snap.data();
  if (Date.now() - Date.parse(c.createdAt) > 24 * 3600000) return null;
  return { ...c, id: snap.id };
}
async function accionesCierreCompra(b, res) {
  if (b.accionCierre === "detalle_enviado") {
    if (!b.version || !b.mensajeEnviadoId) return res.json({ ok: true, confirmado: false });
    const ref = refCierreCompra(b.telefono, b.idConversacion);
    const confirmado = await db.runTransaction(async tx => {
      const snap = await tx.get(ref), c = snap.exists && snap.data();
      if (!c || c.version !== b.version) return false;
      const fragmentos = [...(c.fragmentosDetalle || []).filter(f => f.id !== String(b.mensajeEnviadoId)), {id:String(b.mensajeEnviadoId),contenido:String(b.contenido || "").slice(0,5000)}].slice(-25).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
      const normalizarEspacios = t => String(t).replace(/\s+/g," ").trim();
      const completo = normalizarEspacios(fragmentos.map(f=>f.contenido).join("\n")).includes(normalizarEspacios(c.mensaje));
      tx.set(ref, { ...c, fragmentosDetalle:fragmentos, detalleEnviadoEn: completo ? c.detalleEnviadoEn || new Date().toISOString() : c.detalleEnviadoEn || null, mensajeEnviadoId: completo ? c.mensajeEnviadoId||String(b.mensajeEnviadoId) : c.mensajeEnviadoId || null });
      return completo;
    });
    return res.json({ ok: true, confirmado });
  }
  const cierre = await leerCierreCompra(b);
  if (!cierre || cierre.pedidoId) return res.json({ ok: true, resuelto: false, cierre: cierre?.pedidoId ? null : cierre });
  const medio = formaDePago(cierre.pedido.medioPago);
  if (pideDatosPago(b.mensajeCliente) && ["transferencia", "mitad y mitad"].includes(medio)) {
    const incluirDetalle=!cierre.detalleEnviadoEn||pideResumen(b.mensajeCliente);
    return res.json({ok:true,resuelto:false,respuestaPreparada:{output:{mensajes:[...(incluirDetalle?[cierre.mensaje]:[]),"PLANTILLA:ALIAS"]},cierreVersion:incluirDetalle?cierre.version:null},cierre});
  }
  if (["efectivo", "al recibir"].includes(medio) && cierre.detalleEnviadoEn &&
      mensajePosterior(b.idMensajeOrigen, cierre.mensajeEnviadoId) && confirmacionDeCompra(b.mensajeCliente, cierre.pedido)) {
    let resultado, status = 200;
    await procesarPedido({body:{...cierre.pedido,telefono:b.telefono,idConversacion:b.idConversacion,idMensajeOrigen:b.idMensajeOrigen,preview:false,exigirDetalle:true,turno:b.turno}},
      {status(s){status=s;return this;},json(d){resultado=d;return this;}});
    if(resultado?.ok && resultado.pedidoId) return res.json({...resultado,resuelto:true,cierre:null});
    return res.json({ok:true,resuelto:false,cierre,incidencia:{status,...resultado}});
  }
  const adjuntos = await db.collection("comprobantes").where("idConversacion", "==", String(b.idConversacion)).get();
  const comprobante = adjuntos.docs.map(d => ({ ...d.data(), id: d.id }))
    .filter(c => c.telefono === normalizarTelefono(b.telefono) && !c.pedidoId &&
      (String(c.idMensaje) === String(b.idMensajeOrigen) ||
       (mensajePosterior(c.idMensaje,cierre.mensajeEnviadoId) &&
        (String(c.idMensaje)===String(b.idMensajeOrigen) || mensajePosterior(b.idMensajeOrigen,c.idMensaje)))))
    .sort((a,c)=>String(c.idMensaje).localeCompare(String(a.idMensaje),undefined,{numeric:true}))[0];
  if (!comprobante) return res.json({ ok: true, resuelto: false, cierre });
  // Una foto recibida no prueba la acreditación. Se comprueban los campos leídos,
  // la cuenta del negocio, el importe y el detalle que efectivamente se envió.
  if (!cierre.detalleEnviadoEn || !comprobante.cuentaCobro || !comprobante.comprobante?.numero || !(comprobante.comprobante.monto > 0) || /(?:posible|signos? de|evidencia de|claramente|parece)\s+(?:edici[oó]n|editad|manipulad|falsific)/i.test(comprobante.descripcion || "")) {
    return res.json({ ok: true, resuelto: false, cierre, comprobantePendiente: true });
  }
  if (!["transferencia", "mitad y mitad"].includes(formaDePago(cierre.pedido.medioPago))) return res.json({ ok: true, resuelto: false, cierre });
  const pedido = { ...cierre.pedido, telefono: b.telefono, idConversacion: b.idConversacion, idMensajeOrigen: b.idMensajeOrigen, preview: false, exigirDetalle: true, turno:b.turno, cuentaCobro: comprobante.cuentaCobro, comprobante: comprobante.comprobante, comprobanteUrl: comprobante.urlFuente || undefined };
  let status = 200, resultado;
  await procesarPedido({ body: pedido }, { status(s) { status = s; return this; }, json(d) { resultado = d; return this; } });
  if (resultado?.ok && resultado.pedidoId) return res.json({ ...resultado, resuelto: true, cierre: null });
  return res.json({ ok: true, resuelto: false, cierre, comprobantePendiente: true, incidencia: { status, ...resultado } });
}


function cotizarProductos(op, items, {mayorista=false,conservarPrecios=false,medioPago='',permitirSinSabor=false}={}) {
  if (!Array.isArray(items) || !items.length || items.length > 200) throw new Error('Indicá los productos y cantidades para cotizar');
  const listas = LISTAS_CON_PRECIO.flatMap((campo) => parsearProductos(op[campo]).map((p) => ({ ...p, lista: campo })));
  const ofertas = parsearProductos(op.ofertasTexto);
  const listaMayorista = parsearMayorista(op.preciosMayoristaTexto);
  const dolarMayorista = Number(op.dolarMayorista);
  if (mayorista && items.reduce((s, it) => s + Number(it.cantidad), 0) < 10) throw new Error("la compra mayorista requiere al menos 10 unidades");
  // Los combos valen por modelo, mezclando sabores: "2x $40.000" de EB Create es 1 Golden Berry + 1 Pink
  // Lemonade. Se suma la cantidad de cada modelo, se calcula con los combos y se reparte entre sus renglones.
  const lineas = [];
  const modelos = new Map();
  const cantidadesStock = new Map();
  for (const it of items) {
    const cantidad = Number(it.cantidad ?? 1);
    if (!Number.isSafeInteger(cantidad) || cantidad <= 0) throw new Error("la cantidad tiene que ser un entero positivo");
    if (conservarPrecios) {
      if (!Number.isFinite(it.importe) || it.importe < 0) throw new Error("el pedido original no tiene precios estructurados: consulta al equipo");
      if (mayorista && buscarProducto(listaMayorista, it.producto)?.producto?.prepago && medioPago !== "transferencia") throw new Error(`${it.producto} es pre pago: se abona por transferencia antes`);
      const linea = { producto: it.producto, variante: it.variante || "", cantidad, importe: it.importe };
      if (it.precioUnitarioUSD != null) linea.precioUnitarioUSD = it.precioUnitarioUSD;
      lineas.push(linea);
      continue;
    }
    const r = productoDeLinea(mayorista ? listaMayorista.map((p) => ({ ...p, lista: "preciosVapesTexto" })) : listas, mayorista ? [] : ofertas, it);
    if (r.error) throw new Error(r.error);
    const claveStock = `${r.producto.nombre}:${normalizar(it.variante)}`;
    const cantidadStock = (cantidadesStock.get(claveStock) || 0) + cantidad;
    cantidadesStock.set(claveStock, cantidadStock);
    const sinStock = STOCK_DE[r.producto.lista] && faltaStock(op[STOCK_DE[r.producto.lista]], r.producto.nombre, it.variante, cantidadStock);
    if (sinStock && !(permitirSinSabor && !normalizar(it.variante) && sinStock.startsWith('falta el sabor'))) throw new Error(sinStock);
    if (mayorista && r.producto.prepago && medioPago !== "transferencia") throw new Error(`${r.producto.nombre} es pre pago: se abona por transferencia antes`);
    const linea = { producto: String(it.producto), variante: String(it.variante || ""), cantidad, importe: 0 };
    lineas.push(linea);
    const m = modelos.get(r.producto.nombre) || { producto: r.producto, precios: r.precios, cantidad: 0, lineas: [] };
    m.cantidad += cantidad;
    m.lineas.push(linea);
    modelos.set(r.producto.nombre, m);
  }
  let subtotalUSD = conservarPrecios ? lineas.reduce((s, l) => s + (l.precioUnitarioUSD || 0) * l.cantidad, 0) : 0;
  for (const [nombre, m] of modelos) {
    const cantidadTramo = op.mayoristaAgrupacion === "total" ? lineas.reduce((s, l) => s + l.cantidad, 0) : m.cantidad;
    if (mayorista && cantidadTramo < 10) throw new Error(`${nombre}: el minimo mayorista es 10 unidades por modelo, mezclando sabores`);
    const centavosUSD = mayorista ? precioMayorista(m.producto, cantidadTramo) : null;
    const importe = mayorista ? (centavosUSD === null ? null : Math.round(centavosUSD * m.cantidad * (dolarMayorista > 0 ? dolarMayorista : 1) / 100)) : importePorCantidad(m.precios, m.cantidad);
    if (importe === null) {
      throw new Error(`"${nombre}" no se vende de a ${m.cantidad} (opciones: ${Object.keys(m.precios).map((n) => `${n}x`).join(", ")})`);
    }
    let resto = importe;
    if (mayorista) subtotalUSD += centavosUSD * m.cantidad / 100;
    m.lineas.forEach((l, i) => {
      if (mayorista) l.precioUnitarioUSD = centavosUSD / 100;
      l.importe = i === m.lineas.length - 1 ? resto : Math.round((importe * l.cantidad) / m.cantidad);
      resto -= l.importe;
    });
  }

  return {lineas,subtotalUSD,dolarMayorista,subtotal:lineas.reduce((s,l)=>s+l.importe,0)};
}

async function procesarPedido(req, res) {
  res.setHeader?.('X-028-Atencion','2026-10-26-estandar-v1');
  const entrada = {...(req.body || {})};
  delete entrada._idempotenciaCierre;
  if(entrada.operacion==='crear'&&entrada.pedidoId)return res.status(409).json({ok:false,derivar:false,continuarCompra:true,motivo:'operacion_incorrecta',error:'crear_pedido registra una compra nueva y no admite el ID de otra compra. Conservá los datos de esta compra, armá su detalle y continuá sin ese pedidoId. Para un cambio solicitado de un pedido vigente usá modificar_pedido.'});
  if(entrada.turno && !(await verificarTurno(db,entrada.turno)))return res.status(409).json({ok:false,obsoleto:true,derivar:false,error:"Este turno fue reemplazado o la conversación está en atención humana. No registres ni envíes una confirmación de este turno."});
  if (entrada.accionCierre==="validar_cambio") { const p=await ultimoPedidoDelCliente(entrada.telefono); return res.json({ok:true,...(p?.cambio||restriccionCambio(p))}); }
  if (entrada.accionCierre) return accionesCierreCompra(entrada, res);
  if (entrada.exigirDetalle && !entrada.preview && !entrada.pedidoId) {
    const cierre = await leerCierreCompra(entrada);
    if (!cierre?.detalleEnviadoEn || huellaCierreCompra(entrada) !== cierre.version) return res.status(409).json({ok:false, requiereResumen:true, error:"Primero llama a armar_resumen con este pedido y envía su detalle completo; no confirmes la carga todavía."});
    if (cierre.pedidoId) { const snap = await db.collection("pedidos").doc(cierre.pedidoId).get(); if(snap.exists) return res.json({ok:true,pedidoId:snap.id,mensaje:snap.data().mensaje,total:snap.data().total,reutilizado:true}); }
    entrada._idempotenciaCierre = "cierre:" + cierre.id + ":" + cierre.version + ":" + cierre.createdAt;
  }
  if (entrada.modificar && !entrada.pedidoId) return rechazar(res, "para modificar un pedido hace falta pedidoId; no crees otro pedido");
  const telefonoEntrada = normalizarTelefono(entrada.telefono);
  if (!entrada.pedidoId && !entrada.preview) {
    const origen = entrada._idempotenciaCierre || (entrada.idConversacion && entrada.idMensajeOrigen ? `chatwoot:${entrada.idConversacion}:${entrada.idMensajeOrigen}` : String(entrada.comprobante?.numero || "").replace(/\D/g, "") ? `comprobante:${telefonoEntrada}:${String(entrada.comprobante.numero).replace(/\D/g, "")}` : null);
    if (origen) {
      const ref = db.collection("pedidos").doc(`bot-${hashCorto(origen)}`);
      const existente = await ref.get();
      if (existente.exists) return res.json({ ok: true, pedidoId: ref.id, mensaje: existente.data().mensaje, total: existente.data().total, reutilizado: true });
    }
  }
  const pedidoEditarRef = entrada.pedidoId ? db.collection("pedidos").doc(String(entrada.pedidoId)) : null;
  const anteriorSnap = pedidoEditarRef ? await pedidoEditarRef.get() : null;
  const anterior = anteriorSnap?.exists ? anteriorSnap.data() : null;
  if (pedidoEditarRef && (!anterior || anterior.origen !== "bot_n8n" || anterior.telefono !== telefonoEntrada)) {
    return res.status(403).json({ ok: false, error: "no se puede modificar ese pedido para este cliente" });
  }
  if(anterior&&['pendiente','armado'].includes(anterior.estado)&&!clasificarPedido(anterior).actual)return res.status(409).json({ok:false,derivar:false,continuarCompra:true,motivo:'pedido_anterior',error:'Ese ID corresponde a una compra anterior y no debe usarse para modificar o bloquear esta compra nueva. Continuá con los productos, entrega y pago de esta compra; armá su detalle sin el pedidoId anterior.'});
  if (anterior && anterior.estado !== "pendiente") {
    return res.status(409).json({ok:false,...restriccionCambio(anterior),error:restriccionCambio(anterior).mensaje || "el pedido ya no está pendiente: no crees otro pedido"});
  }
  if (anterior && entrada.idMensajeOrigen && anterior.ultimoMensajeModificacion === String(entrada.idMensajeOrigen) && !entrada.preview) {
    return res.json({ ok: true, pedidoId: pedidoEditarRef.id, mensaje: anterior.mensaje, total: anterior.total, reutilizado: true, modificado: true });
  }
  const b = anterior ? { ...anterior, tipoEnvio: anterior.datosCorreo ? "correo" : anterior.tipoEnvio, ...entrada } : entrada;
  if (anterior && entrada.direccion && typeof entrada.direccion === "object") b.direccion = { ...anterior.direccion, ...entrada.direccion };
  if (anterior && entrada.datosCorreo) b.datosCorreo = { ...anterior.datosCorreo, ...entrada.datosCorreo };
  if (anterior && entrada.tipoEnvio && entrada.tipoEnvio !== (anterior.datosCorreo ? "correo" : anterior.tipoEnvio) && entrada.horaSolicitada === undefined) b.horaSolicitada = null;
  const preview = b.preview === true || b.preview === "true";
  const telefono = normalizarTelefono(b.telefono);
  const tipoEnvio = b.tipoEnvio;
  const medioPago = formaDePago(b.medioPago);
  const efectivo = medioPago === "efectivo";
  const conComprobante = medioPago === "transferencia" || medioPago === "mitad y mitad";
  const dir = armarDireccion(b.direccion);
  const correo = b.datosCorreo || {};
  const items = Array.isArray(b.items) ? b.items : [];
  const mayorista = b.mayorista === true || b.mayorista === "true";

  if (!["moto", "uber", "correo"].includes(tipoEnvio)) return rechazar(res, "tipoEnvio tiene que ser moto, uber o correo");
  if (medioPago && medioPago !== "transferencia" && tipoEnvio !== "moto") return rechazar(res, "en Uber y correo se paga solo por transferencia antes; efectivo, al recibir y mitad y mitad son solo con moto");

  if (!preview && entrada.exigirDetalle && conComprobante && (!anterior || entrada.comprobante || entrada.comprobanteAdicional)) {
    const snap = b.comprobanteUrl ? await db.collection("comprobantes").doc(idComprobanteSuelto(b.comprobanteUrl)).get() : null;
    const c = snap?.exists ? snap.data() : null;
    if (!c || c.telefono!==telefono || String(c.idConversacion)!==String(b.idConversacion) || !c.cuentaCobro || (c.pedidoId && c.pedidoId !== entrada.pedidoId) || !c.comprobante?.numero || !(c.comprobante.monto>0) || /(?:posible|signos? de|evidencia de|claramente|parece)\s+(?:edici[oó]n|editad|manipulad|falsific)/i.test(c.descripcion||"")) return res.status(400).json({ok:false,requiereComprobante:true,error:"Falta un comprobante legible de esta conversación con número, importe y cuenta de destino del negocio; no confirmes registro ni acreditación."});
    if(entrada.comprobanteAdicional){entrada.comprobanteAdicional={...entrada.comprobanteAdicional,numero:c.comprobante.numero,monto:c.comprobante.monto};}else{b.comprobante=c.comprobante;entrada.comprobante=c.comprobante;} b.cuentaCobro=c.cuentaCobro;
  }
  // Lo que falta para calcular el resumen y, si no es preview, para cargar el pedido.
  const faltan = [];
  if (!telefono) faltan.push("el teléfono");
  if (!items.length) faltan.push("los productos");
  if (!String(dir.texto || "").trim()) faltan.push("la dirección");
  if (!medioPago) faltan.push("el medio de pago (transferencia, efectivo, al recibir o mitad y mitad)");
  if (tipoEnvio === "correo" && typeof correo.aSucursal !== "boolean") faltan.push("si el correo va a sucursal o a domicilio");
  if (!preview) {
    if (!String(b.cliente || "").trim()) faltan.push("a nombre de quién va el pedido");
    const hayComprobante = !!b.comprobanteUrl || Object.values(b.comprobante || {}).some((v) => String(v || "").trim());
    if (conComprobante && !hayComprobante) faltan.push("el comprobante de pago");
    if (tipoEnvio === "correo") {
      for (const [campo, label] of [["dni", "el DNI"], ["localidad", "la localidad"], ["cp", "el código postal"]]) {
        if (!String(correo[campo] || "").trim()) faltan.push(label);
      }
    }
  }
  if (faltan.length) return rechazar(res, `falta ${faltan.join(", ")}: pedíselo al cliente antes de volver a intentar`);

  // Envío: la moto se cotiza con la dirección y el Uber con lo que cargó el depósito. Nunca con un
  // número que mande el agente.
  let valorEnvio = 0;
  let ubicacion = null;
  if (tipoEnvio === "moto") {
    ubicacion = await ubicar(dir.texto);
    if (!ubicacion) return rechazar(res, "no pude ubicar la dirección: pedile calle, altura y barrio");
    if (!ubicacion.cubiertoMoto) return rechazar(res, "esa dirección no entra en moto: ofrecele Uber o correo");
    valorEnvio = ubicacion.monto;
  } else if (tipoEnvio === "uber") {
    const mismaDireccion = anterior?.tipoEnvio === "uber" && mismaDireccionCotizacion(anterior.direccion?.texto, dir.texto);
    const cot = mismaDireccion ? { montoUber: anterior.valorEnvio, direccion: dir.texto } : await cotizacionUber(telefono, dir.texto);
    if (!cot) {
      const actual = cotizacionActual((await cotizacionesDeCompra(telefono, dir.texto)).cotizaciones);
      if (precioUberVencido(actual)) {
        const pagado = !preview && (!!entrada.comprobanteUrl || Object.values(entrada.comprobante || {}).some(v => String(v || "").trim()));
        return res.status(409).json({ ok: false, cotizacionVencida: true, necesitaRecotizacion: !pagado, derivar: pagado, motivo: pagado ? "pago_cotizacion_vencida" : "cotizar_uber", error: pagado ? "El cliente ya envió un comprobante y la cotización venció: deriva al equipo para revisar ese pago. No cobres diferencias ni generes otro pedido por tu cuenta." : AVISO_UBER_VENCIDO + ". Solicitá una nueva cotización con cotizar_uber; no uses el importe anterior." });
      }
      return rechazar(res, "todavía no hay un precio de Uber vigente para esta compra y dirección: derivá con motivo cotizar_uber");
    }
    if (cot.direccion && !mismaDireccionCotizacion(cot.direccion, dir.texto)) return rechazar(res, "la cotizacion de Uber corresponde a otra direccion: solicita una cotizacion para la direccion nueva");
    valorEnvio = Number(cot.montoUber);
  }

  // Precios: siempre de las listas del día.
  const op = await leerOperativo();
  const conservarPrecios = anterior && entrada.items === undefined;
  let lineas, subtotalUSD, dolarMayorista;
  try { ({lineas,subtotalUSD,dolarMayorista} = cotizarProductos(op,items,{mayorista,conservarPrecios,medioPago})); }
  catch(e) { return rechazar(res,e.message); }

  if (mayorista && !conservarPrecios && !(Number.isFinite(dolarMayorista) && dolarMayorista > 0)) {
    if (!preview) return rechazar(res, "falta cargar el valor del dolar mayorista en el panel: no inventes el total en pesos ni registres el pedido");
    return res.json({ ok: true, preview: true, necesitaTipoCambio: true, moneda: "USD", subtotalUSD,
      mensaje: ["PRODUCTOS MAYORISTAS", ...lineas.map((l) => `${l.cantidad}x ${l.producto}${l.variante ? " - " + l.variante : ""}: USD ${l.precioUnitarioUSD} c/u`), `Subtotal productos: USD ${subtotalUSD}`, "Total en pesos pendiente del valor del dolar mayorista del panel. El envio se cotiza en pesos por separado."].join("\n") });
  }

  const subtotal = lineas.reduce((s, l) => s + l.importe, 0);
  const envioSeguro = tipoEnvio === "uber" && (b.envioSeguro === true || b.envioSeguro === "true");
  const montoEnvioSeguro = envioSeguro ? PRECIO_ENVIO_SEGURO : 0;
  const montoDescuento = efectivo && !mayorista ? descuentoEfectivo(subtotal) : 0;
  const total = subtotal + valorEnvio + montoEnvioSeguro - montoDescuento;
  const envioCorreo = tipoEnvio === "correo" ? CORREO[correo.aSucursal ? "sucursal" : "domicilio"] : 0;
  const aTransferir = medioPago === "mitad y mitad" ? Math.ceil(total / 2) : 0;
  const despachoMayorista = mayorista && tipoEnvio === "correo";
  const usaTandaMoto = tipoEnvio === "moto" || despachoMayorista;
  let opciones = [];
  let cuando = tipoEnvio === "correo" ? null : salidaDeUnPedidoNuevo(op, await pedidosEnCola());
  const conservarSalida = anterior && !Object.hasOwn(entrada, "salidaSeleccionada") && anterior.fechaSalida && anterior.horaSalida && tipoEnvio === (anterior.datosCorreo ? "correo" : anterior.tipoEnvio);
  if (!usaTandaMoto && conservarSalida) cuando = { fecha: anterior.fechaSalida, hora: anterior.horaSalida, dia: anterior.fechaSalida === fechaBA(new Date()) ? "hoy" : `el ${corta(anterior.fechaSalida)}` };
  if (usaTandaMoto) {
    opciones = opcionesMoto(op, await pedidosMoto(), new Date(), pedidoEditarRef?.id);
    const seleccion = entrada.salidaSeleccionada;
    cuando = conservarSalida
      ? { fecha: anterior.fechaSalida, hora: anterior.horaSalida, tandaId: anterior.tandaSalida, dia: anterior.fechaSalida === fechaBA(new Date()) ? "hoy" : `el ${corta(anterior.fechaSalida)}` }
      : elegirSalida(opciones, seleccion, despachoMayorista);
    if (!cuando || (!preview && !despachoMayorista && !seleccion && !conservarSalida)) {
      return res.status(400).json({ ok: false, error: "elegi una fecha y tanda de moto disponible; no se puede usar una salida pasada o llena", opcionesMoto: opciones.slice(0, 4) });
    }
  }
  if(tipoEnvio==="uber"&&!cuando) return rechazar(res,"No hay una salida de Uber disponible en las fechas configuradas; ofrece correo con su plazo real o consulta al equipo.");
  const horaSolicitadaTexto = String(b.horaSolicitada || "").trim();
  if (horaSolicitadaTexto && tipoEnvio !== "uber") {
    return rechazar(res, "la hora solicitada solo se puede programar para Uber");
  }
  if (horaSolicitadaTexto && !(conservarSalida && entrada.horaSolicitada === undefined)) {
    const solicitada = minutosDe(horaSolicitadaTexto);
    const ahora = horaBuenosAires(new Date());
    const primeraDisponible = cuando && cuando.dia === "hoy" ? minutosDe(cuando.hora) : null;
    if (solicitada === null || solicitada < 13 * 60 + 30 || solicitada > (horarioUber(ahora.dia,ahora.fecha,op.horariosUberPorFecha)?.fin ?? -1)) {
      return rechazar(res, "la hora de Uber tiene que estar entre 13:30 y 20:00, en formato HH:mm");
    }
    if (ahora.minutos >= CORTE_DESPACHO || !cuando || cuando.dia !== "hoy") {
      return rechazar(res, `hoy ya no se puede programar ese Uber: la próxima salida disponible es ${cuando ? `${cuando.dia} a las ${cuando.hora}` : "el próximo día con despacho"}`);
    }
    if (solicitada < ahora.minutos || (primeraDisponible !== null && solicitada < primeraDisponible)) {
      return rechazar(res, `no llegamos a programar el Uber a las ${hhmmDe(solicitada)}; la primera salida disponible es hoy a las ${cuando.hora}`);
    }
    cuando = { dia: "hoy", fecha: fechaBA(new Date()), hora: hhmmDe(solicitada) };
  }

  const esperadoPago = medioPago === "mitad y mitad" ? aTransferir : total;
  const pagoAdicional = entrada.comprobanteAdicional;
  if (pagoAdicional && (!anterior || !String(pagoAdicional.numero || "").trim() || !(Number.isFinite(Number(pagoAdicional.monto)) && Number(pagoAdicional.monto) > 0))) return rechazar(res, "el comprobante adicional requiere numero y monto positivo, y un pedido existente");
  const adicionales = anterior?.comprobantesAdicionales || [];
  if (pagoAdicional && adicionales.some((p) => String(p.numero) === String(pagoAdicional.numero))) return rechazar(res, "ese comprobante adicional ya esta registrado: no lo sumes otra vez");
  const montoBase = anterior && entrada.comprobante === undefined ? Number(anterior.montoPagado ?? anterior.comprobante?.monto ?? anterior.montoTransferencia ?? 0) : b.comprobante?.monto != null ? Number(b.comprobante.monto) : null;
  const montoRecibido = conComprobante && montoBase !== null ? montoBase + (pagoAdicional ? Number(pagoAdicional.monto) : 0) : null;
  const diferenciaPago = montoRecibido !== null ? montoRecibido - esperadoPago : null;
  if (!preview && conComprobante && montoRecibido !== null && (!Number.isFinite(montoRecibido) || Math.abs(diferenciaPago) > TOLERANCIA_COMPROBANTE)) {
    return res.status(400).json({ ok: false, requierePago: !!anterior && diferenciaPago < 0, derivar: diferenciaPago > TOLERANCIA_COMPROBANTE || !anterior || !!entrada.comprobante || !!pagoAdicional, motivo: "comprobante_dudoso", diferencia: diferenciaPago, error: anterior && diferenciaPago < 0 && !entrada.comprobante && !pagoAdicional ? `el cambio requiere un pago adicional de ${$(-diferenciaPago)}: pide ese comprobante antes de modificar` : "el importe difiere en mas de $5.000 del monto a transferir: deriva para verificar" });
  }

  // Si no sale hoy, va arriba de todo: la gente no lee el detalle y después se queja.
  const noSaleHoy = cuando && cuando.dia !== "hoy";
  const avisoNoRegistrado = preview && anterior
    ? "Cambio propuesto: el pedido existente todavia no fue actualizado."
    : preview
    ? conComprobante
      ? "⚠️ Todavía no está registrado para despacho. Para registrarlo, mandá el comprobante de pago."
      : "⚠️ Todavía no está registrado para despacho. Para registrarlo, confirmame el pedido."
    : null;
  const avisoSalida = noSaleHoy
    ? preview
      ? `⚠️ OJO: SI CONFIRMÁS AHORA, SALE ${cuando.dia.toUpperCase()}, ${corta(cuando.fecha)}, A LAS ${cuando.hora}`
      : `⚠️ OJO: SALE ${cuando.dia.toUpperCase()}, ${corta(cuando.fecha)}, A LAS ${cuando.hora}`
    : null;
  const lineaSalida = cuando
    ? preview
      ? `🕐 Si confirmás el pedido ahora, sale ${cuando.dia}, ${corta(cuando.fecha)}, a las ${cuando.hora}${horaSolicitadaTexto ? " (horario pedido por el cliente)" : ""}`
      : `🕐 Sale ${cuando.dia}, ${corta(cuando.fecha)}, a las ${cuando.hora}${horaSolicitadaTexto ? " (horario pedido por el cliente)" : ""}`
    : null;
  const ahoraAtencion=horaBuenosAires(new Date()),hAtencion=horarioUber(ahoraAtencion.dia,ahoraAtencion.fecha,op.horariosUberPorFecha||{});
  const avisoAntesPago=preview&&['moto','uber'].includes(tipoEnvio)&&cuando?.fecha===ahoraAtencion.fecha?datosAtencionEnvios({fecha:ahoraAtencion.fecha,hora:hhmmDe(ahoraAtencion.minutos),cierreHora:hAtencion?hhmmDe(hAtencion.fin):'20:00',moto:tipoEnvio==='moto'?cuando:null,uber:tipoEnvio==='uber'?cuando:null}).aviso:null;
  const mensaje = [
    avisoSalida,
    avisoSalida ? "" : null,
    avisoNoRegistrado,
    avisoNoRegistrado ? "" : null,
    avisoAntesPago?.texto||null,
    avisoAntesPago ? '' : null,
    "🛒 PRODUCTOS",
    ...lineas.map((l) => `* ${l.cantidad}x ${l.producto}${l.variante ? " - " + l.variante : ""}: ${$(l.importe)}${mayorista ? ` (mayorista USD ${l.precioUnitarioUSD} c/u)` : ""}`),
    "",
    "💰 TOTALES",
    `Subtotal: ${$(subtotal)}`,
    mayorista ? `Subtotal mayorista: USD ${subtotalUSD} — dolar: ${$(conservarPrecios ? anterior.dolarMayorista : dolarMayorista)}` : null,
    valorEnvio ? `Envío: ${$(valorEnvio)}` : null,
    envioSeguro ? `🛡️ Envío seguro: ${$(montoEnvioSeguro)}` : null,
    montoDescuento ? `💵 Descuento por efectivo: -${$(montoDescuento)}` : null,
    `TOTAL A PAGAR: ${$(total)}`,
    envioCorreo ? `(el envío por correo, ${$(envioCorreo)}, se le paga a Vía Cargo al recibir)` : null,
    "",
    "📦 ENTREGA",
    ENVIO_LABEL[tipoEnvio] + (envioSeguro ? " — 🛡️ CON ENVÍO SEGURO" : "") +
      (tipoEnvio === "correo" ? (correo.aSucursal ? " a sucursal" : " a domicilio") : ""),
    despachoMayorista ? "Traslado interno a despacho: motomensajeria, primera tanda. No es la entrega al cliente." : null,
    lineaSalida,
    dir.texto,
    ubicacion && ubicacion.zona ? `Zona ${ubicacion.zona}` : null,
    dir.referencias ? `Ref: ${dir.referencias}` : null,
    tipoEnvio === "correo" && correo.dni ? `DNI: ${correo.dni} — ${correo.localidad} (CP ${correo.cp})` : null,
    "",
    "👤 CLIENTE",
    `${b.cliente || "-"} — ${telefono}`,
    "",
    `💳 ${PAGO_LABEL[medioPago]}`,
    aTransferir ? `A transferir ahora: ${$(aTransferir)}` : null,
    aTransferir ? `En efectivo al recibir: ${$(total - aTransferir)}` : null,
    b.comprobante && b.comprobante.numero ? `Comprobante: ${b.comprobante.numero}` : null,
    ...[...adicionales, ...(pagoAdicional ? [pagoAdicional] : [])].map((p) => `Comprobante adicional: ${p.numero} — ${$(p.monto)}`),
  ].filter((l) => l !== null).join("\n");

  if (preview) {
    let cierreVersion = null;
    if (b.idConversacion && !anterior) {
      const pedido = datosCierreCompra({...b, ...(usaTandaMoto && cuando ? {salidaSeleccionada:{fecha:cuando.fecha,tandaId:cuando.tandaId,hora:cuando.hora}} : {}), cuentaCobro: ALIASES[b.cuentaCobro] ? b.cuentaCobro : ALIASES[op.aliasActivo] ? op.aliasActivo : "alias1"});
      cierreVersion = huellaCierreCompra(pedido);
      const ref = refCierreCompra(telefono,b.idConversacion);
      await db.runTransaction(async tx => { const snap=await tx.get(ref), anterior=snap.exists && snap.data(); const igual=anterior?.version===cierreVersion && anterior.mensaje===mensaje && !anterior.pedidoId && Date.now()-Date.parse(anterior.createdAt)<24*3600000; tx.set(ref,{pedido,version:cierreVersion,mensaje,total,createdAt:igual?anterior.createdAt:new Date().toISOString(),detalleEnviadoEn:igual?anterior.detalleEnviadoEn||null:null,mensajeEnviadoId:igual?anterior.mensajeEnviadoId||null:null,pedidoId:null}); });
    }
    return res.json({ok:true,preview:true,mensaje,total,salida:cuando,avisoHorarioClave:avisoAntesPago?.clave||null,opcionesMoto:opciones.slice(0,4),pedidoId:pedidoEditarRef?.id||null,saldoPendiente:anterior&&diferenciaPago<0?-diferenciaPago:0,cierreVersion,requiereTransferencia:conComprobante&&(!anterior||diferenciaPago<0)});
  }

  // El depósito maneja el correo como un retiro (arma el paquete y lo lleva a Vía Cargo), así que
  // va a la columna Retiro del panel con una primera línea que lo deja claro, igual que lo cargan ellos.
  const esCorreo = tipoEnvio === "correo";
  const idConversacion = String(b.idConversacion || "").trim();
  const idMensajeOrigen = String(b.idMensajeOrigen || "").trim();
  const numeroComprobante = String(b.comprobante?.numero || "").replace(/\D/g, "");
  const idempotenciaOrigen = entrada._idempotenciaCierre || (idConversacion && idMensajeOrigen
    ? `chatwoot:${idConversacion}:${idMensajeOrigen}`
    : numeroComprobante
      ? `comprobante:${telefono}:${numeroComprobante}`
      : "");
  const idempotencia = idempotenciaOrigen ? hashCorto(idempotenciaOrigen) : null;
  const pedidos = db.collection("pedidos");
  const pedidoRef = idempotencia ? pedidos.doc(`bot-${idempotencia}`) : null;
  if (pedidoRef && !pedidoEditarRef) {
    const existente = await pedidoRef.get();
    if (existente.exists) {
      const data = existente.data();
      return res.json({
        ok: true,
        pedidoId: pedidoRef.id,
        mensaje: data.mensaje,
        total: data.total,
        reutilizado: true,
      });
    }
  }

  const pedidoData = {
    // Campos que ya usaba el panel:
    mensaje: esCorreo ? `📦 VÍA CARGO — ${correo.aSucursal ? "SUCURSAL" : "DOMICILIO"}\n\n${mensaje}` : mensaje,
    estado: "pendiente",
    tipoEnvio: despachoMayorista ? "moto" : esCorreo ? "retiro" : tipoEnvio,
    createdAt: new Date().toISOString(),
    // Estructurados del agente:
    telefono,
    idConversacion: idConversacion || null,
    idMensajeOrigen: idMensajeOrigen || null,
    origen: "bot_n8n",
    schemaVersion: 3,
    idempotencia,
    cliente: String(b.cliente).trim(),
    direccion: {
      texto: dir.texto,
      referencias: dir.referencias || null,
      lat: ubicacion ? ubicacion.lat : null,
      lng: ubicacion ? ubicacion.lng : null,
      zona: ubicacion ? ubicacion.zona : null,
    },
    items: lineas,
    valorEnvio,
    envioSeguro,
    montoEnvioSeguro,
    montoDescuento,
    total,
    mayorista,
    subtotalUSD: mayorista ? subtotalUSD : null,
    dolarMayorista: mayorista ? (conservarPrecios ? anterior.dolarMayorista : dolarMayorista) : null,
    entregaCliente: tipoEnvio,
    despachoInterno: despachoMayorista ? "moto_a_via_cargo" : null,
    fechaSalida: cuando?.fecha || null,
    horaSalida: cuando?.hora || null,
    tandaSalida: cuando?.tandaId || null,
    repartidor: usaTandaMoto ? (conservarSalida && anterior.repartidor ? anterior.repartidor : cuando.tandaId === "segunda" ? "moto2" : "moto1") : null,
    medioPago,
    horaSolicitada: horaSolicitadaTexto ? cuando.hora : null,
    montoTransferencia: aTransferir || null,
    cuentaCobro: conComprobante ? (ALIASES[b.cuentaCobro] ? b.cuentaCobro : ALIASES[op.aliasActivo] ? op.aliasActivo : "alias1") : null,
    comprobante: b.comprobante || null,
    montoPagado: conComprobante ? montoRecibido : null,
    comprobantesAdicionales: [...adicionales, ...(pagoAdicional ? [{ numero: String(pagoAdicional.numero), monto: Number(pagoAdicional.monto) }] : [])],
    comprobanteImagen: null,
    datosCorreo: tipoEnvio === "correo"
      ? { dni: String(correo.dni).trim(), localidad: String(correo.localidad).trim(), cp: String(correo.cp).trim(), aSucursal: correo.aSucursal, valor: envioCorreo }
      : null,
  };
  if(!preview&&anterior&&conComprobante&&!entrada.comprobante&&!entrada.comprobanteAdicional&&montoRecibido===0) return res.status(400).json({ok:false,requierePago:true,derivar:false,error:"El pedido anterior se pagaba al recibir y no tiene un pago previo registrado. Pedí la transferencia del total y el comprobante antes de cambiarlo a Uber o correo."});
  const pedidoGuardado = pedidoEditarRef || pedidoRef || pedidos.doc();
  const numeroOperacionActual=String(entrada.comprobanteAdicional?.numero || entrada.comprobante?.numero || (!anterior && b.comprobante?.numero) || "").replace(/\D/g,"");
  const pagoRef = entrada.exigirDetalle && conComprobante && numeroOperacionActual ? db.collection("bot_pagos").doc(hashCorto(String(b.cuentaCobro || "") + "|" + numeroOperacionActual)) : null;
  const resultado = await db.runTransaction(async (tx) => {
    const actualSnap = await tx.get(pedidoGuardado);
    const actual = actualSnap.exists ? actualSnap.data() : null;
    const pagoSnap = pagoRef ? await tx.get(pagoRef) : null;
    if(entrada.turno && !(await verificarTurno(db,entrada.turno,tx)))return {obsoleto:true};
    if (pagoSnap?.exists && pagoSnap.data().pedidoId !== pedidoGuardado.id) return {pagoRepetido:true};
    if (pedidoEditarRef) {
      if (actual?.estado !== "pendiente") return { bloqueado: true, cambio: restriccionCambio(actual) };
      if (actual.telefono !== telefono || actual.origen !== "bot_n8n") return { bloqueado: true };
      if (actual.updatedAt !== anterior.updatedAt || actual.total !== anterior.total || actual.mensaje !== anterior.mensaje) return { conflicto: true };
    } else if (actual) return { reutilizado: true, data: actual };
    if (usaTandaMoto && !conservarSalida) {
      // El documento de tanda serializa altas concurrentes, incluso cuando la tanda estaba vacia.
      const lockRef = db.collection("bot_tandas").doc(`${cuando.fecha}-${cuando.tandaId}`);
      const lock = await tx.get(lockRef);
      const config = await tx.get(db.collection("settings").doc("operativo"));
      const agendados = await tx.get(db.collection("pedidos").where("fechaSalida", "==", cuando.fecha));
      const disponibles = opcionesMoto(config.exists ? config.data() : {}, agendados.docs.map((d) => ({ ...d.data(), id: d.id })), new Date(), pedidoEditarRef?.id);
      if (!elegirSalida(disponibles, cuando, despachoMayorista)) return { sinCupo: true };
      tx.set(lockRef, { version: Number(lock.exists ? lock.data().version : 0) + 1 });
    }
    if (pagoRef) tx.set(pagoRef,{pedidoId:pedidoGuardado.id,telefono,createdAt:new Date().toISOString()});
    tx.set(pedidoGuardado, pedidoEditarRef ? {
      ...actual, ...pedidoData, estado: actual.estado, createdAt: actual.createdAt,
      idempotencia: actual.idempotencia, idMensajeOrigen: actual.idMensajeOrigen,
      cuentaCobro: actual.cuentaCobro || pedidoData.cuentaCobro, comprobanteImagen: actual.comprobanteImagen,
      updatedAt: new Date().toISOString(), ultimoMensajeModificacion: String(entrada.idMensajeOrigen || ""),
    } : pedidoData);
    return { reutilizado: false };
  });
  if (resultado.obsoleto) return res.status(409).json({ok:false,obsoleto:true,derivar:false,error:"Llegó otro mensaje o el equipo tomó la conversación. Este turno no guardó cambios."});
  if (resultado.pagoRepetido) return res.status(409).json({ok:false,derivar:true,motivo:"comprobante_dudoso",error:"Ese comprobante ya está vinculado a otro pedido; no se puede volver a usar."});
  if (resultado.bloqueado) return res.status(409).json({ok:false,...(resultado.cambio||{derivar:true,motivo:"modificar_pedido_armado"}),error:resultado.cambio?.mensaje || "el depósito cambió el estado; no crees otro pedido"});
  if (resultado.conflicto) return res.status(409).json({ ok: false, error: "el pedido cambio durante la modificacion: consulta el estado y vuelve a confirmar" });
  if (resultado.sinCupo) return res.status(409).json({ ok: false, error: "la tanda elegida ya no esta disponible: consulta las salidas y pide elegir otra" });
  if (resultado.reutilizado) return res.json({ ok: true, pedidoId: pedidoGuardado.id, mensaje: resultado.data.mensaje, total: resultado.data.total, reutilizado: true });

  // La foto del comprobante se copia a Storage para no depender de la URL de Chatwoot. Si falla,
  // el pedido queda cargado igual, sin foto.
  if (entrada.comprobanteUrl && conComprobante) {
    const adicionalId = pagoAdicional ? hashCorto(pagoAdicional.numero) : null;
    const imagen = await copiarComprobante(b.comprobanteUrl, pedidoGuardado.id, adicionalId);
    if (imagen && adicionalId) {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(pedidoGuardado);
        const data = snap.data();
        tx.set(pedidoGuardado, { ...data, comprobantesAdicionales: data.comprobantesAdicionales.map((p) => String(p.numero) === String(pagoAdicional.numero) ? { ...p, imagen } : p) });
      });
    } else if (imagen) await pedidoGuardado.update({ comprobanteImagen: imagen });
    // El mismo comprobante ya quedó guardado como suelto al llegar: se vincula a este pedido.
    await db.collection("comprobantes").doc(idComprobanteSuelto(b.comprobanteUrl)).update({ pedidoId: pedidoGuardado.id })
      .catch(() => { /* no estaba guardado como suelto: no hay nada que vincular */ });
  }

  if (entrada.exigirDetalle && entrada.idConversacion && !pedidoEditarRef) {
    const ref = refCierreCompra(telefono,entrada.idConversacion); await db.runTransaction(async tx => {const snap=await tx.get(ref); if(snap.exists && snap.data().version===huellaCierreCompra(entrada)) tx.set(ref,{...snap.data(),pedidoId:pedidoGuardado.id,registradoEn:new Date().toISOString()});});
  }
  await cerrarCotizacionesDePedido(telefono,pedidoGuardado.id,tipoEnvio,dir.texto);
  res.json({ ok: true, pedidoId: pedidoGuardado.id, mensaje, total, salida: cuando, reutilizado: false, modificado: !!pedidoEditarRef, tipoEnvio });
}
exports.agentPedido = conClave(procesarPedido);

function restriccionCambio(pedido) {
  if (!pedido) return {permitido:false,derivar:false,mensaje:"No figura un pedido para modificar."};
  const salidaMs=Date.parse(String(pedido.fechaSalida||"")+"T"+String(pedido.horaSalida||"")+":00-03:00");
  if(pedido.estado==="armado" && Number.isFinite(salidaMs) && Date.now()>=salidaMs) return {permitido:false,derivar:false,bloqueadoSalida:true,motivo:"salida_cerrada",mensaje:"tu pedido ya está armado y llegó la hora de salida; ya no podemos modificarlo"};
  if(pedido.estado==="armado") return {permitido:false,derivar:true,motivo:"modificar_pedido_armado",mensaje:"el pedido ya está armado; el equipo tiene que revisar si todavía puede hacer el cambio antes de la salida"};
  return {permitido:pedido.estado==="pendiente",derivar:pedido.estado!=="pendiente",motivo:"modificar_pedido_armado"};
}
async function vigenciaAvisoUber(b) {
  if(!b.idCotizacion) return {permitir:true};
  const snap=await db.collection("cotizaciones_uber").doc(String(b.idCotizacion)).get();
  if(!snap.exists) return {permitir:false,obsoleta:true,motivo:"cotizacion_inexistente"};
  const c=snap.data();
  if(String(c.idConversacion)!==String(b.idConversacion)||c.canceladaEn||c.pedidoId||c.usadaEnPedidoId||["cancelada","sustituida"].includes(c.estado))return {permitir:false,obsoleta:true,motivo:"cotizacion_cancelada"};
  const pedidos=await db.collection("pedidos").where("telefono","==",normalizarTelefono(c.telefonoCliente)).get();
  const posterior=pedidos.docs.map(d=>d.data()).some(p=>p.estado!=="cancelado"&&Date.parse(p.createdAt)>Date.parse(c.createdAt||0));
  if(posterior)return {permitir:false,obsoleta:true,motivo:"compra_ya_confirmada"};
  const actuales=await cotizacionesDeCompra(c.telefonoCliente,c.direccion);
  if(cotizacionActual(actuales.cotizaciones)?.id!==String(b.idCotizacion))return {permitir:false,obsoleta:true,motivo:"cotizacion_sustituida"};
  return {permitir:true};
}
async function cerrarCotizacionesDePedido(telefono,pedidoId,tipoEnvio,direccion) {
  const snap=await db.collection("cotizaciones_uber").where("telefonoCliente","==",telefono).get();
  for(const d of snap.docs){const c=d.data();if(c.pedidoId||c.usadaEnPedidoId||c.canceladaEn)continue;
    if(tipoEnvio==="uber"&&mismaDireccionCotizacion(c.direccion,direccion))await db.collection("cotizaciones_uber").doc(d.id).update({usadaEnPedidoId:pedidoId});
    else await db.collection("cotizaciones_uber").doc(d.id).update({canceladaEn:new Date().toISOString(),canceladaPorPedidoId:pedidoId,estado:"cancelada"});
  }
}


const EXTENSIONES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };

// Baja el archivo del adjunto y lo guarda en Storage como comprobantes/AAAA/MM/<nombre>.<ext>.
async function guardarArchivoComprobante(url, nombre) {
  const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 15000, maxContentLength: 15 * 1024 * 1024 });
  const tipo = String(resp.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!EXTENSIONES[tipo]) return null;
  const path = `comprobantes/${new Date().toISOString().slice(0, 7).replace("-", "/")}/${nombre}.${EXTENSIONES[tipo]}`;
  await admin.storage().bucket(STORAGE_BUCKET).file(path).save(Buffer.from(resp.data), { contentType: tipo });
  return { path, contentType: tipo };
}

async function copiarComprobante(url, pedidoId, adicionalId = null) {
  try {
    const archivo = await guardarArchivoComprobante(url, `${pedidoId}${adicionalId ? "-" + adicionalId : ""}`);
    return archivo && { url: `${SERVE_COMPROBANTE_BASE}?pedido=${pedidoId}${adicionalId ? "&adicional=" + adicionalId : ""}`, ...archivo };
  } catch (e) {
    console.error("[agente-api] no se pudo copiar el comprobante", e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Comprobantes sueltos: todos los que manda un cliente quedan guardados en "comprobantes", se cargue o
// no el pedido (si el bot deriva o el pedido se carga a mano, Lucio igual los manda a la financiera).
// El id sale de la URL del adjunto: el mismo comprobante no se guarda dos veces y, cuando crear_pedido
// recibe esa URL, lo vincula al pedido (pedidoId) y el panel deja de mostrarlo como suelto.
// ─────────────────────────────────────────────────────────────────────────────
const idComprobanteSuelto = (url) => `cw-${hashCorto(String(url).trim())}`;

// Cada cuenta del negocio, por los datos que aparecen como destino en un comprobante.
const CUENTAS_COMPROBANTE = [
  { alias: "alias3", claves: ["0000510400000000001348", "tame lake", "tamelake", "30718603702"] },
  { alias: "alias2", claves: ["0070181130004057764295", "gieco", "028import.gal2"] },
  { alias: "alias1", claves: ["0070194130004014092980", "bunge", "028import.gl"] },
];

// La descripción la arma el bot al leer la imagen, con renglones "Campo: valor" ("**Monto:** $65.990",
// "**Número de operación:** 185563329942", "**Titular:** ...", "**Destinatario:** ...").
function datosDeComprobante(descripcion) {
  const texto = soloLecturaArchivo(descripcion);
  if (/no (?:es|parece|corresponde a) (?:un )?comprobante|no se pudo leer|no es (?:un )?pago/i.test(texto)) return {esComprobante:false,monto:null,numero:null,nombre:null,cuentaCobro:null};
  const campo = (nombre) => {
    const m = texto.match(new RegExp(`${nombre}[^:\\n]*:\\**\\s*([^\\n]+)`, "i"));
    return m ? m[1].replace(/\*+/g, "").trim() : null;
  };
  const montoTexto = campo("Monto");
  const monto = importeDeTexto(montoTexto);
  const numero = (campo("N[uú]mero de operaci[oó]n") || "").match(/\d{6,}/)?.[0] || null;
  const titular = campo("Titular");
  const nombre = titular && !/^no (especificad|visible|aparece|figura)/i.test(titular) ? titular.slice(0, 80) : null;
  const destino = normalizar(`${campo("Destinatario") || ""} ${campo("Alias visible") || ""} ${campo("CUIT") || ""} ${campo("CBU o CVU") || ""}`) + " " + `${campo("CBU o CVU") || ""}`.replace(/\D/g, " ");
  const cuenta = CUENTAS_COMPROBANTE.find((c) => c.claves.some((k) => destino.includes(normalizar(k))));
  return {
    esComprobante: /comprobante de pago/i.test(texto) || !!(monto && numero),
    monto: Number.isFinite(monto) && monto > 0 ? monto : null,
    numero,
    nombre,
    cuentaCobro: cuenta ? cuenta.alias : null,
  };
}

// POST /agentGuardarComprobante — lo llama el bot con cada imagen o PDF que manda un cliente, antes de
// responder. Si la descripción no es de un comprobante, no guarda nada.
// Body: { url, descripcion, telefono, cliente, idConversacion, idMensaje }
exports.agentGuardarComprobante = conClave(async (req, res) => {
  const b = req.body || {};
  const url = String(b.url || "").trim();
  if (!/^https:\/\//.test(url)) return rechazar(res, "falta la url del adjunto");
  const descripcion = b.lectura !== undefined ? descripcionDeLectura(b.lectura) : soloLecturaArchivo(b.descripcion);
  const datos = datosDeComprobante(descripcion);
  if(b.soloValidar===true)return res.json({ok:true,versionLectura:'2026-10-25-v2',esComprobante:datos.esComprobante,guardable:!!(datos.esComprobante&&datos.monto&&datos.numero&&datos.cuentaCobro),datos,
    formatoRecibido:{tipoLectura:typeof b.lectura,esComprobante:b.lectura?.esComprobante,edicionDetectada:b.lectura?.edicionDetectada,tipoMonto:typeof b.lectura?.monto,tipoNumero:typeof b.lectura?.numeroOperacion,descripcionGenerada:!!descripcion}});
  if (!datos.esComprobante) return res.json({ ok: true, guardado: false, motivo: b.lectura?.esComprobante===true?'lectura_incompleta':'archivo_no_comprobante',versionLectura:'2026-10-25-v2' });
  const ref = db.collection("comprobantes").doc(idComprobanteSuelto(url));
  if ((await ref.get()).exists) return res.json({ ok: true, guardado: true, id: ref.id, reutilizado: true });
  let archivo = null;
  try {
    archivo = await guardarArchivoComprobante(url, `sueltos/${ref.id}`);
  } catch (e) {
    console.error("[agente-api] no se pudo guardar el comprobante suelto", e.message);
  }
  await ref.set({
    createdAt: new Date().toISOString(),
    origen: "bot_n8n",
    cliente: String(b.cliente || "").slice(0, 80) || null,
    telefono: normalizarTelefono(b.telefono) || null,
    idConversacion: b.idConversacion != null ? String(b.idConversacion) : null,
    idMensaje: b.idMensaje != null ? String(b.idMensaje) : null,
    comprobante: { numero: datos.numero, monto: datos.monto, nombre: datos.nombre },
    cuentaCobro: datos.cuentaCobro,
    descripcion: String(descripcion || "").slice(0, 2000),
    urlFuente: url,
    comprobanteImagen: archivo ? { url: `${SERVE_COMPROBANTE_BASE}?comprobante=${ref.id}`, ...archivo } : null,
    pedidoId: null,
  });
  res.json({ ok: true, guardado: true, id: ref.id });
});

// GET /serveComprobante?pedido= — la foto del comprobante para el panel. Sin clave a propósito,
// igual que servePdf: el panel la muestra con un <img>. La "clave" es el id aleatorio del pedido.
// Con ?comprobante=<id> sirve un comprobante suelto (colección "comprobantes").
exports.serveComprobante = functions.https.onRequest(async (req, res) => {
  const pedidoId = String(req.query.pedido || "").trim();
  const sueltoId = String(req.query.comprobante || "").trim();
  const snap = sueltoId ? await db.collection("comprobantes").doc(sueltoId).get()
    : pedidoId ? await db.collection("pedidos").doc(pedidoId).get() : null;
  const img = snap && snap.exists && (!sueltoId && req.query.adicional
    ? snap.data().comprobantesAdicionales?.find((p) => hashCorto(p.numero) === req.query.adicional)?.imagen
    : snap.data().comprobanteImagen);
  if (!img || !img.path) return res.status(404).send("ese pedido no tiene comprobante guardado");
  res.setHeader("Content-Type", img.contentType);
  // Sin este header el panel puede MOSTRAR la foto (un <img> no necesita permiso) pero no puede
  // BAJARLA con fetch: el navegador bloquea la respuesta por ser de otro dominio. La pestaña
  // Comprobantes de Gestión 028 la baja así para armar el ZIP con todos los comprobantes del mes.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "private, max-age=3600");
  admin.storage().bucket(STORAGE_BUCKET).file(img.path).createReadStream()
    .on("error", () => res.status(404).end())
    .pipe(res);
});

// ─────────────────────────────────────────────────────────────────────────────
// Cotización de Uber: el agente deriva → el depósito carga el monto en /cotizar-uber → este
// trigger le avisa a n8n, que le manda el precio al cliente y reactiva el bot.
// ─────────────────────────────────────────────────────────────────────────────
exports.agentCrearCotizacionUber = conClave(async (req, res) => {
  const b = req.body || {};
  if(b.turno && !(await verificarTurno(db,b.turno)))return res.status(409).json({ok:false,obsoleto:true,derivar:false,error:"El turno ya no está vigente"});
  const idConversacion = String(b.idConversacion || "").trim();
  const telefonoCliente = normalizarTelefono(b.telefonoCliente);
  if (!idConversacion || !telefonoCliente) return rechazar(res, "faltan idConversacion o telefonoCliente");
  const direccion = String(b.direccion || "").trim();
  const { cotizaciones, cicloCompra } = await cotizacionesDeCompra(telefonoCliente, direccion);
  const responderExistente = (cot) => Number(cot.montoUber) > 0 ? {
    ok: true, creada: false, yaCotizado: true, id: cot.id, montoUber: Number(cot.montoUber),
    venceEn: vencimientoUber(cot), vigenciaMinutos: 45,
    mensaje: `El precio de Uber vigente es ${$(cot.montoUber)}. Usá ese monto hasta ${vencimientoUber(cot)}. Después de 45 minutos necesita una nueva cotización.`,
  } : sinCoberturaUber(cot) ? {
    ok: true, creada: false, sinCobertura: true, id: cot.id,
    mensaje: "Ofrecele correo a sucursal o domicilio. No repitas el aviso de que Uber no llega ni vuelvas a cotizar por tu cuenta.",
  } : {
    ok: true, creada: false, yaPendiente: true, id: cot.id,
    mensaje: "Ya hay una cotización pendiente para esta compra y dirección. No crees otra ni repitas que vas a cotizar: esperá al depósito.",
  };
  const ultima = cotizacionActual(cotizaciones);
  const vencida = precioUberVencido(ultima);
  const puedeReintentar = vencida || (b.recotizarSolicitado === true && ultima && Date.now() - tiempoCotizacionUber(ultima) >= MINUTOS_REINTENTO_UBER * 60000);
  const existente = precioVigente(cotizaciones) || (!puedeReintentar && ultima && (ultima.estado === "pendiente" || sinCoberturaUber(ultima)) && ultima);
  if (existente) return res.json(responderExistente(existente));

  if (b.soloConsultar === true) return res.json({ ok: true, creada: false, necesitaCotizacion: true, cotizacionVencida: vencida, ...(vencida ? { mensaje: AVISO_UBER_VENCIDO } : {}) });

  // Id determinista + transacción: dos llamadas simultáneas no pueden abrir dos avisos.
  const clave = hashCorto(`${telefonoCliente}|${normalizar(direccion)}|${cicloCompra}${puedeReintentar ? "|reintento:" + ultima.id : ""}`);
  const ref = db.collection("cotizaciones_uber").doc(`compra-${clave}`);
  const resultado = await db.runTransaction(async (tx) => {
    const previa = await tx.get(ref);
    if(b.turno && !(await verificarTurno(db,b.turno,tx)))return {obsoleto:true};
    if (previa.exists) return { nueva: false, cot: { ...previa.data(), id: ref.id } };
    tx.set(ref, {
      idConversacion, telefonoCliente,
      nombreCliente: String(b.nombreCliente || "").trim(), direccion,
      explicacionCaso: String(b.explicacionCaso || "").trim(),
      pedidoBorrador: b.pedido && typeof b.pedido === 'object' ? JSON.parse(JSON.stringify(datosCierreCompra(b.pedido))) : null,
      estado: "pendiente", montoUber: null, cicloCompra,
      cotizacionAnteriorId: puedeReintentar ? ultima.id : null,
      recotizacionPorVencimiento: vencida,
      createdAt: new Date().toISOString(),
    });
    return { nueva: true };
  });
  if (resultado.obsoleto) return res.status(409).json({ok:false,obsoleto:true,derivar:false,error:"El turno ya no está vigente"});
  if (!resultado.nueva) return res.json(responderExistente(resultado.cot));
  res.json({ ok: true, creada: true, id: ref.id, recotizacionPorVencimiento: vencida, ...(vencida ? { mensaje: AVISO_UBER_VENCIDO } : {}) });
});

// La cotización resuelta continúa la compra: calcula el detalle y el alias, sin registrar ni cobrar.
// La extracción de la conversación aporta productos; los importes y la identidad salen del servidor.
exports.agentPrepararDetalleUber = conClave(async (req,res) => {
  res.setHeader('X-028-Atencion','2026-10-26-estandar-v1');
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"Usá POST"});
  const b=req.body||{};
  const snap=b.idCotizacion?await db.collection("cotizaciones_uber").doc(String(b.idCotizacion)).get():null;
  if(!snap?.exists)return res.status(404).json({ok:false,error:"No existe la cotización"});
  const cot={...snap.data(),id:snap.id};
  const vigencia=await vigenciaAvisoUber({idCotizacion:snap.id,idConversacion:cot.idConversacion,montoUber:cot.montoUber});
  if(!vigencia.permitir)return res.json({ok:true,obsoleta:true,...vigencia});
  const actual=await leerCierreCompra({telefono:cot.telefonoCliente,idConversacion:cot.idConversacion});
  const extraido=b.pedido && typeof b.pedido==='object' && !Array.isArray(b.pedido)?b.pedido:{};
  const borrador=cot.pedidoBorrador||{};
  const anterior=actual&&!actual.pedidoId&&mismaDireccionCotizacion(armarDireccion(actual.pedido.direccion).texto,cot.direccion)?actual.pedido:{};
  const datos=datosCierreCompra({...anterior,...borrador});
  // La conversación puede contener un cambio posterior a la solicitud de Uber. Solo datos explícitos
  // y no vacíos reemplazan al borrador; una extracción incompleta no borra productos ya conocidos.
  for(const [campo,valor] of Object.entries(datosCierreCompra(extraido))){
    if(campo==='items' ? Array.isArray(valor)&&valor.length>0 : valor!==null&&valor!==undefined&&valor!=='')datos[campo]=valor;
  }
  delete datos.pedidoId;
  // Nunca reutilizar un pedido anterior como si fuera una compra nueva ni aceptar precios/pagos del modelo.
  const pedido={...datos,items:Array.isArray(datos.items)?datos.items.map(i=>({producto:String(i.producto||''),variante:String(i.variante||''),cantidad:i.cantidad})):[],
    tipoEnvio:'uber',medioPago:'transferencia',direccion:{texto:cot.direccion,referencias:datos.direccion?.referencias||null},
    telefono:cot.telefonoCliente,idConversacion:cot.idConversacion,cliente:datos.cliente||cot.nombreCliente,preview:true};
  let resultado,status=200;
  await procesarPedido({body:pedido},{status(s){status=s;return this;},json(d){resultado=d;return this;}});
  if(resultado?.ok&&resultado.preview&&Number.isFinite(resultado.total)){
    const op=await leerOperativo();
    return res.json({...resultado,detalleListo:true,telefono:cot.telefonoCliente,idConversacion:cot.idConversacion,
      contenido:resultado.mensaje+'\n\n'+(ALIASES[op.aliasActivo]||ALIASES.alias1),vigenciaMinutos:45});
  }
  if(resultado?.ok&&resultado.necesitaTipoCambio)return res.json({ok:true,detalleListo:false,contenido:resultado.mensaje,necesitaTipoCambio:true});
  const error=String(resultado?.error||'faltan los productos y cantidades para completar el pedido');
  const pregunta=/sabor|variante/i.test(error)?'qué sabor elegís para completar el detalle ?':/stock/i.test(error)?error:/productos|cantidad/i.test(error)?'confirmame qué productos, sabores y cantidades llevás y te paso el detalle con el alias':/hora|salida|horario/i.test(error)?error:'para completar el detalle: '+error;
  return res.json({ok:true,detalleListo:false,incidencia:{status,...resultado},contenido:'El Uber a tu dirección sale '+$(cot.montoUber)+'. Esta cotización es válida por 45 minutos.\n'+pregunta});
});

exports.onCotizacionUberConfirmada = onDocumentUpdated({document:"cotizaciones_uber/{id}",retry:true,timeoutSeconds:180}, async (event) => {
  const antes = event.data.before.data() || {};
  const cot = event.data.after.data() || {};
  // "no_llegamos": el depósito avisa que hoy el Uber no llega; n8n se lo dice al cliente y nada más.
  if (!["cotizado", "no_llegamos"].includes(cot.estado) || antes.estado === cot.estado) return;
  const noLlegamos = cot.estado === "no_llegamos";
  try {
    const respuesta = await axios.post(
      await urlCotizacionUber(),
      noLlegamos
        ? { idConversacion: cot.idConversacion, idCotizacion: event.params.id, noLlegamos: true }
        : { idConversacion: cot.idConversacion, idCotizacion: event.params.id, montoUber: cot.montoUber },
      { headers: { "X-Agent-Key": AGENT_API_KEY }, timeout: 120000 }
    );
    if(respuesta.data?.obsoleta)return;
    if(respuesta.data?.confirmado!==true)throw new Error("n8n no confirmó el envío del aviso al cliente");
    await db.runTransaction(async tx=>{
      const ref=db.collection("cotizaciones_uber").doc(String(event.params.id));
      const actual=await tx.get(ref);
      if(!actual.exists || !["cotizado","no_llegamos"].includes(actual.data().estado) || actual.data().canceladaEn)return;
      tx.set(ref,{...actual.data(),estado:"procesado",sinCoberturaUber:noLlegamos,procesadoEn:new Date().toISOString(),informadoEn:respuesta.data.enviadoEn||new Date().toISOString()});
    });
  } catch (e) {
    // Queda en "cotizado" y el panel lo sigue mostrando como "Enviando al cliente…".
    console.error("[agente-api] no se pudo avisar a n8n de la cotización", event.params.id, e.message);
    throw e;
  }
});
