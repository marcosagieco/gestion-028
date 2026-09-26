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

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const AGENT_API_KEY = process.env.AGENT_API_KEY || "";
const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY || "";
const N8N_COTIZACION_UBER_WEBHOOK = "https://n8n.bunge.agenticsia.agency/webhook/cotizacion-uber-confirmada";
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
const CADA_TANDA = 30; // minutos entre tandas (moto y Uber por igual)
const ULTIMA_TANDA = 20 * 60; // 20:00
const CORTE_DESPACHO = 20 * 60 + 15; // hasta las 20:15 todavía entra en la tanda de las 20:00
const VIGENCIA_COTIZACION_UBER_MS = 3 * 60 * 60 * 1000;

const DEMORAS = {
  sin_demora: "los envíos están saliendo normal, sin demora",
  normal: "sale con la demora habitual, más o menos 1:30 hs desde que sale la moto",
  demora: "hoy estamos con una demora de alrededor de 2 hs en los envíos",
  demora_fuerte: "hoy hay bastante demora, más de 3 hs; si lo necesita rápido le conviene el flash",
  solo_manana: "por hoy ya no se despacha más: se toma el pedido y sale mañana",
};

// Los datos de cobro viven acá y no en el prompt: el modelo nunca ve un CBU, así que no lo puede tipear mal.
const ALIASES = {
  alias1: "dale te paso los datos\nLucio Felix Bunge\nCBU: 00701941-30004014092980\nAlias: 028import.gl (Banco Galicia)\nmandame el comprobante cuando lo hagas",
  alias2: "dale te paso los datos\nMarcos Agustin Gieco\nCBU: 0070181130004057764295\nAlias: 028import.gal2 (Banco Galicia)\nmandame el comprobante cuando lo hagas",
  alias3: "dale te paso los datos\nTame Lake S.A.\nCBU: 0000598201000000015014\nAlias: CALMO.DURO.DIA\nmandame el comprobante cuando lo hagas",
};

const $ = (n) => `$${Number(n || 0).toLocaleString("es-AR")}`;

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
  if (t.includes("mitad")) return "mitad y mitad";
  if (t.includes("recibir") || t.includes("contra entrega")) return "al recibir";
  if (t.includes("efectivo")) return "efectivo";
  return "transferencia";
}

// Textos fijos del negocio que el agente manda tal cual con ⟦PLANTILLA:NOMBRE⟧.
const PLANTILLAS_FIJAS = {
  FORMAS_DE_ENTREGA: `🚚 FORMAS DE ENTREGA 🚚\n\n━━━━━━━━━━━━━\n\n⚡ FLASH — UBER ENVÍOS\n⏳ 13:30 hs a 20:00 hs\n🔥 Entrega en 30’ mins\n⚠️ Sin garantía\n💳 Pago previo - transferencia\n\n━━━━━━━━━━━━━\n\n🛵 MOTO MENSAJERÍA\n⏳ 13:30 hs - 🌙 20:00 hs\n🔒 Mayor seguridad en tu pedido\n⏱️ Demora aprox: 1:30 hs desde que sale la moto\n💸 Pagás al recibir (efectivo o transferencia), por transferencia antes o mitad y mitad\n💵 Abonando en efectivo tenés descuentos especiales según el monto de tu compra\n\n━━━━━━━━━━━━━\n\n📦 CORREO — 1 a 3 días\n🚚 Vía Cargo\n💳 Productos: pago previo por transferencia\n💸 Envío: se abona a Vía Cargo al recibir\n\n📍 A sucursal → ${$(CORREO.sucursal)}\n🏠 A domicilio → ${$(CORREO.domicilio)}\n\n━━━━━━━━━━━━━\n\n🌐 https://028import.com`,
  ENVIO_SEGURO: `🛡️ ¿QUERÉS AGREGAR ENVÍO SEGURO A TU PEDIDO?\n\n💰 Valor: solo ${$(PRECIO_ENVIO_SEGURO)}\n\nProtegé tu compra ante cualquier imprevisto durante el envío. Por solo ${$(PRECIO_ENVIO_SEGURO)} adicionales, evitás correr el riesgo de perder el valor completo de tu pedido.\n\n━━━━━━━━━━━━━━━\n\n🔒 ¿QUÉ CUBRE EL ENVÍO SEGURO?\n\n✅ Robo durante el envío\n✅ Pérdida o extravío\n✅ Inconvenientes durante el traslado que impidan la entrega\n✅ Si transcurren los 7 minutos de espera desde la llegada del Uber y el pedido no pudo ser entregado, queda cubierto por reposición.\n\nAnte cualquiera de estas situaciones cubiertas, 028 IMPORT vuelve a enviarte tu pedido sin que tengas que pagarlo nuevamente.\n\n━━━━━━━━━━━━━━━\n\n⚠️ ¿Y SI NO LO AGREGO?\n\nEl pedido se despacha igualmente, pero viaja sin cobertura de reposición.\n\nUna vez despachado correctamente a la dirección proporcionada, si ocurre un robo, pérdida, extravío o no se concreta la recepción dentro del tiempo de espera, 028 Import no cubre el valor ni la reposición del pedido.`,
  WEB: "📦 CATÁLOGO Y STOCK ACTUALIZADO\n\n🌐 Entrá a nuestra web y mirá todos los productos disponibles, precios y stock actualizado:\n\n👉 https://028import.com\n\n📲 Si tenés alguna duda o querés una recomendación personalizada escribinos por WhatsApp.\n\n🚚 Envíos en CABA y a todo el país.\n📍 Belgrano, CABA.",
  DESCUENTO_EFECTIVO: (([alto, medio, base]) =>
    `pagando en efectivo tenés descuento: si es menos de ${$(medio.desde)} son ${$(base.off)} off, desde ${$(medio.desde)} son ${$(medio.off)} off, y desde ${$(alto.desde)} son ${$(alto.off)} off`)(TRAMOS_DESCUENTO_EFECTIVO),
  // Uber y correo: al cargar el pedido (ya pagó). Moto: la manda "aviso de entrega" al entregarlo.
  GRACIAS: "❤️ ¡GRACIAS POR TU COMPRA!\n✈️ 028 IMPORT\n\nEsperamos que disfrutes tu pedido. ¡Gracias por confiar en nosotros! 🫶\n\n🔥 SUMATE A NUESTRA COMUNIDAD DE WHATSAPP\n\nEs donde primero avisamos:\n✅ Promociones exclusivas\n✅ Liquidaciones\n✅ Reingresos de stock\n✅ Nuevos productos\n✅ Sorteos\n✅ Ofertas que no publicamos en otros lados\n\n🔗 https://chat.whatsapp.com/JYgkBHg7P4DLwv1V2HCZUZ\n\n━━━━━━━━━━━━━\n\n📲 SEGUINOS EN INSTAGRAM\n\n🔗 https://www.instagram.com/028.import\n\n⭐ Si te gustó la experiencia, recomendanos a tus amigos o compartí tu compra en Instagram y etiquetanos @028.import.\n\n━━━━━━━━━━━━━\n\n🌐 WEB OFICIAL\n\nConsultá el catálogo actualizado con todos los productos, precios y stock disponible.\n\n🔗 https://028import.com\n\n━━━━━━━━━━━━━\n\n⚠️ IMPORTANTE\n\n• No realizamos devoluciones.\n• Únicamente realizamos cambios por fallas de fábrica.\n• El plazo para informar una falla es de 48 horas desde la recepción del producto.\n• Pasado ese plazo no podremos gestionar reclamos.\n\n🙏 ¡Gracias por elegir 028 Import!",
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
};
// Las que tienen precios minoristas (la mayorista está en USD y esas compras las cierra el equipo).
const LISTAS_CON_PRECIO = ["preciosVapesTexto", "preciosThcTexto", "perfumesTexto", "appleTexto"];
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

const PALABRAS_VACIAS = new Set(["de", "del", "la", "el", "los", "las", "con", "a", "x"]);
const palabras = (texto) => normalizar(texto).split(" ").filter((p) => p && !PALABRAS_VACIAS.has(p));

// Teléfono → 549XXXXXXXXXX, igual que el webhook de index.js.
function normalizarTelefono(tel) {
  let n = String(tel || "").replace(/\D/g, "");
  if (n.startsWith("54") && n.length === 12) n = "549" + n.slice(2);
  if (!n.startsWith("54") && n.length === 10) n = "549" + n;
  return n;
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

function parsearProductos(texto) {
  const productos = [];
  let nombres = [];
  let detalles = [];
  let actual = null; // el producto que está recibiendo renglones de precio
  for (const cruda of String(texto || "").split("\n")) {
    const linea = cruda.trim();
    if (!linea) continue;
    if (SEPARADOR_RE.test(linea)) {
      nombres = [];
      detalles = [];
      actual = null;
      continue;
    }
    const precio = linea.match(PRECIO_RE);
    if (!precio) {
      actual = null;
      if (/lista|precio/i.test(linea)) continue; // encabezados: "LISTA DE PRECIOS", "PRECIO LIQUIDACIÓN"
      (esNombre(linea) ? nombres : detalles).push(sinEmojis(linea));
      continue;
    }
    const monto = parseInt(precio[1].replace(/\D/g, ""), 10);
    if (!(monto > 0)) continue;
    const antes = linea.slice(0, precio.index);
    const cantidad = Number((antes.match(CANTIDAD_RE) || [])[1]) || 1;
    const nombreEnLinea = sinEmojis(antes.replace(CANTIDAD_RE, " "));
    if ((nombreEnLinea.match(/\p{L}/gu) || []).length >= 3) {
      productos.push({ nombre: nombreEnLinea, detalle: [...nombres, ...detalles].join(" "), precios: { [cantidad]: monto } });
      continue;
    }
    if (!actual) {
      actual = { nombre: nombres.join(" ") || detalles[0] || "", detalle: detalles.join(" "), precios: {} };
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
  for (const w of lista) {
    if (w === palabra) return 1;
    if (palabra.length > 3 && !/\d/.test(palabra)) {
      const largo = Math.max(w.length, palabra.length);
      mejor = Math.max(mejor, (largo - distanciaLevenshtein(palabra, w)) / largo);
    }
  }
  return mejor >= 0.8 ? mejor : 0;
}

// Busca el producto que nombró el agente. Casi todas sus palabras tienen que estar en el producto,
// al menos una en su nombre, y gana el nombre más parecido: "Ignite V400" no se confunde con
// "Ignite V400 Mix". Si dos quedan empatados es ambiguo y no se elige ninguno.
function buscarProducto(productos, nombre) {
  const q = palabras(nombre);
  if (!q.length) return null;
  const candidatos = [];
  for (const p of productos) {
    const enNombre = palabras(p.nombre);
    const enTodo = [...enNombre, ...palabras(p.detalle)];
    const encontradas = q.filter((w) => coincidencia(w, enTodo) > 0).length;
    const parecidoNombre = q.reduce((s, w) => s + coincidencia(w, enNombre), 0) / q.length;
    if (encontradas / q.length < 2 / 3 || !parecidoNombre) continue;
    const nombreCubierto = enNombre.filter((w) => coincidencia(w, q) > 0).length / enNombre.length;
    candidatos.push({ p, puntaje: parecidoNombre + nombreCubierto });
  }
  candidatos.sort((a, b) => b.puntaje - a.puntaje);
  if (!candidatos.length) return null;
  if (candidatos[1] && candidatos[1].puntaje === candidatos[0].puntaje) {
    return { ambiguo: [candidatos[0].p.nombre, candidatos[1].p.nombre] };
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

// Devuelve { importe } o { error } para una línea del pedido. Las ofertas pisan los precios de la
// lista para las cantidades que tengan cargadas.
function precioDeLinea(listas, ofertas, item) {
  const cantidad = Number(item.cantidad) || 1;
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
  const importe = importePorCantidad(precios, cantidad);
  if (importe === null) {
    const opciones = Object.keys(precios).map((n) => `${n}x`).join(", ");
    return { error: `"${item.producto}" no se vende de a ${cantidad} (opciones: ${opciones})` };
  }
  return { importe, producto: regular && regular.producto };
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
      modelos.push({ nombre: sinEmojis(linea), detalle: "", sabores: [] });
    } else if (modelos.length) {
      const cantidad = linea.match(/\((\d+)\)\s*$/);
      modelos[modelos.length - 1].sabores.push({ texto: sinEmojis(linea.replace(/\(\d+\)\s*$/, "")), cantidad: cantidad ? Number(cantidad[1]) : null });
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
  const km = Math.round(haversineKm(DEPOSITO, { lat, lng }) * 10) / 10;
  return {
    lat, lng, zona, km, esCABA,
    cubiertoMoto: esCABA || zona === "B",
    monto: Math.max(Math.round(km * TARIFA_POR_KM), MINIMO_ENVIO),
  };
}

// La última cotización de Uber que cargó el depósito para este cliente, si sigue vigente.
async function cotizacionUber(telefono) {
  const snap = await db.collection("cotizaciones_uber").where("telefonoCliente", "==", telefono).get();
  const desde = Date.now() - VIGENCIA_COTIZACION_UBER_MS;
  return snap.docs
    .map((d) => d.data())
    .filter((c) => Number(c.montoUber) > 0 && Date.parse(c.resueltoEn) >= desde)
    .sort((a, b) => Date.parse(b.resueltoEn) - Date.parse(a.resueltoEn))[0] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Salidas y tanda
// ─────────────────────────────────────────────────────────────────────────────
function horaBuenosAires(fecha) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Argentina/Buenos_Aires", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23",
    }).formatToParts(fecha).map((p) => [p.type, p.value])
  );
  return { dia: partes.weekday, minutos: Number(partes.hour) * 60 + Number(partes.minute) };
}

// Las tandas salen cada 30 minutos hasta las 20:00, desde las 13:30 (miércoles 14:00, domingos 17:00).
function tandasDelDia(dia) {
  const tandas = [];
  for (let m = dia === "Sun" ? 17 * 60 : dia === "Wed" ? 14 * 60 : 13 * 60 + 30; m <= ULTIMA_TANDA; m += CADA_TANDA) tandas.push(m);
  return tandas;
}

// "13", "13:00", "13.30" o "13 hs" → minutos del día; cualquier otra cosa → null.
function minutosDe(texto) {
  const m = String(texto || "").trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(?:h|hs|hrs)?\.?$/i);
  if (!m || Number(m[1]) > 23 || Number(m[2] || 0) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2] || 0);
}

// En qué tanda sale un pedido tomado ahora. El bot atiende 24/7: cada tanda lleva hasta `limite`
// pedidos, así que con `enCola` pedidos esperando, este sale tantas tandas después de la próxima.
// Si hoy ya no entra (o el panel dice que hoy no sale nada más), sale mañana. La "próxima salida"
// que carga el depósito le gana a todo (ej. si vienen atrasados): si esa hora ya pasó, es la de
// mañana. Rige mientras esté cargada; borrarla vuelve a las tandas.
function salida(fecha, { enCola, limite, soloManana, proximaSalida }) {
  const ahora = horaBuenosAires(fecha);
  const hhmm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  const delPanel = minutosDe(proximaSalida);
  if (delPanel !== null) return { dia: delPanel >= ahora.minutos ? "hoy" : "mañana", hora: hhmm(delPanel) };
  const hoy = soloManana ? [] : tandasDelDia(ahora.dia)
    .filter((m) => m >= ahora.minutos || (m === ULTIMA_TANDA && ahora.minutos < CORTE_DESPACHO));
  const saltear = Math.floor(enCola / limite);
  if (saltear < hoy.length) return { dia: "hoy", hora: hhmm(hoy[saltear]) };
  const manana = tandasDelDia(horaBuenosAires(new Date(fecha.getTime() + 24 * 60 * 60 * 1000)).dia);
  return { dia: "mañana", hora: hhmm(manana[Math.min(saltear - hoy.length, manana.length - 1)]) };
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

// La "próxima salida" del panel es solo para la moto: el Uber sale siempre por tandas.
function salidaDeUnPedidoNuevo(op, tipoEnvio, enCola) {
  const limite = Number(op.limitePorTanda) > 0 ? Number(op.limitePorTanda) : LIMITE_POR_TANDA;
  return salida(new Date(), { enCola, limite, soloManana: op.situacion === "solo_manana", proximaSalida: tipoEnvio === "moto" ? op.proximaSalida : "" });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /agentEstadoOperativo — todo lo que el agente necesita saber del día
// ─────────────────────────────────────────────────────────────────────────────
exports.agentEstadoOperativo = conClave(async (req, res) => {
  const op = await leerOperativo();
  const plantillas = { ...PLANTILLAS_FIJAS, ALIAS: ALIASES[op.aliasActivo] || ALIASES.alias1 };
  for (const [nombre, campo] of Object.entries(LISTAS_DEL_PANEL)) plantillas[nombre] = textoDe(op[campo]);
  const enCola = await pedidosEnCola();
  res.json({
    ok: true,
    salida: salidaDeUnPedidoNuevo(op, "moto", enCola),
    salidaUber: salidaDeUnPedidoNuevo(op, "uber", enCola),
    demora: DEMORAS[op.situacion] || DEMORAS.sin_demora,
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

exports.agentPedido = conClave(async (req, res) => {
  const b = req.body || {};
  const preview = b.preview === true || b.preview === "true";
  const telefono = normalizarTelefono(b.telefono);
  const tipoEnvio = b.tipoEnvio;
  const medioPago = formaDePago(b.medioPago);
  const efectivo = medioPago === "efectivo";
  const conComprobante = medioPago === "transferencia" || medioPago === "mitad y mitad";
  const dir = armarDireccion(b.direccion);
  const correo = b.datosCorreo || {};
  const items = Array.isArray(b.items) ? b.items : [];

  if (!["moto", "uber", "correo"].includes(tipoEnvio)) return rechazar(res, "tipoEnvio tiene que ser moto, uber o correo");
  if (medioPago && medioPago !== "transferencia" && tipoEnvio !== "moto") return rechazar(res, "en Uber y correo se paga solo por transferencia antes; efectivo, al recibir y mitad y mitad son solo con moto");

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
    const cot = await cotizacionUber(telefono);
    if (!cot) return rechazar(res, "todavía no hay una cotización de Uber vigente para este cliente: derivá con motivo cotizar_uber");
    valorEnvio = Number(cot.montoUber);
  }

  // Precios: siempre de las listas del día.
  const op = await leerOperativo();
  const listas = LISTAS_CON_PRECIO.flatMap((campo) => parsearProductos(op[campo]).map((p) => ({ ...p, lista: campo })));
  const ofertas = parsearProductos(op.ofertasTexto);
  const lineas = [];
  for (const it of items) {
    const cantidad = Number(it.cantidad) || 1;
    const r = precioDeLinea(listas, ofertas, { ...it, cantidad });
    if (r.error) return rechazar(res, r.error);
    const sinStock = r.producto && STOCK_DE[r.producto.lista] && faltaStock(op[STOCK_DE[r.producto.lista]], r.producto.nombre, it.variante, cantidad);
    if (sinStock) return rechazar(res, sinStock);
    lineas.push({ producto: String(it.producto), variante: String(it.variante || ""), cantidad, importe: r.importe });
  }

  const subtotal = lineas.reduce((s, l) => s + l.importe, 0);
  const envioSeguro = tipoEnvio === "uber" && (b.envioSeguro === true || b.envioSeguro === "true");
  const montoEnvioSeguro = envioSeguro ? PRECIO_ENVIO_SEGURO : 0;
  const montoDescuento = efectivo ? descuentoEfectivo(subtotal) : 0;
  const total = subtotal + valorEnvio + montoEnvioSeguro - montoDescuento;
  const envioCorreo = tipoEnvio === "correo" ? CORREO[correo.aSucursal ? "sucursal" : "domicilio"] : 0;
  const aTransferir = medioPago === "mitad y mitad" ? Math.ceil(total / 2) : 0;
  const cuando = tipoEnvio === "correo" ? null : salidaDeUnPedidoNuevo(op, tipoEnvio, await pedidosEnCola());

  const mensaje = [
    "🛒 PRODUCTOS",
    ...lineas.map((l) => `* ${l.cantidad}x ${l.producto}${l.variante ? " - " + l.variante : ""}: ${$(l.importe)}`),
    "",
    "💰 TOTALES",
    `Subtotal: ${$(subtotal)}`,
    valorEnvio ? `Envío: ${$(valorEnvio)}` : null,
    envioSeguro ? `🛡️ Envío seguro: ${$(montoEnvioSeguro)}` : null,
    montoDescuento ? `💵 Descuento por efectivo: -${$(montoDescuento)}` : null,
    `TOTAL A PAGAR: ${$(total)}`,
    envioCorreo ? `(el envío por correo, ${$(envioCorreo)}, se le paga a Vía Cargo al recibir)` : null,
    "",
    "📦 ENTREGA",
    ENVIO_LABEL[tipoEnvio] + (envioSeguro ? " — 🛡️ CON ENVÍO SEGURO" : "") +
      (tipoEnvio === "correo" ? (correo.aSucursal ? " a sucursal" : " a domicilio") : ""),
    cuando ? `🕐 Sale ${cuando.dia} a las ${cuando.hora}` : null,
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
  ].filter((l) => l !== null).join("\n");

  if (preview) return res.json({ ok: true, preview: true, mensaje, total });

  // El depósito maneja el correo como un retiro (arma el paquete y lo lleva a Vía Cargo), así que
  // va a la columna Retiro del panel con una primera línea que lo deja claro, igual que lo cargan ellos.
  const esCorreo = tipoEnvio === "correo";
  const pedidoRef = await db.collection("pedidos").add({
    // Campos que ya usaba el panel:
    mensaje: esCorreo ? `📦 VÍA CARGO — ${correo.aSucursal ? "SUCURSAL" : "DOMICILIO"}\n\n${mensaje}` : mensaje,
    estado: "pendiente",
    tipoEnvio: esCorreo ? "retiro" : tipoEnvio,
    createdAt: new Date().toISOString(),
    // Estructurados del agente:
    telefono,
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
    medioPago,
    montoTransferencia: aTransferir || null,
    cuentaCobro: conComprobante ? (ALIASES[op.aliasActivo] ? op.aliasActivo : "alias1") : null,
    comprobante: b.comprobante || null,
    comprobanteImagen: null,
    datosCorreo: tipoEnvio === "correo"
      ? { dni: String(correo.dni).trim(), localidad: String(correo.localidad).trim(), cp: String(correo.cp).trim(), aSucursal: correo.aSucursal, valor: envioCorreo }
      : null,
  });

  // La foto del comprobante se copia a Storage para no depender de la URL de Chatwoot. Si falla,
  // el pedido queda cargado igual, sin foto.
  if (b.comprobanteUrl && conComprobante) {
    const imagen = await copiarComprobante(b.comprobanteUrl, pedidoRef.id);
    if (imagen) await pedidoRef.update({ comprobanteImagen: imagen });
  }

  res.json({ ok: true, pedidoId: pedidoRef.id, mensaje, total });
});

const EXTENSIONES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };

async function copiarComprobante(url, pedidoId) {
  try {
    const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 15000, maxContentLength: 15 * 1024 * 1024 });
    const tipo = String(resp.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!EXTENSIONES[tipo]) return null;
    const path = `comprobantes/${new Date().toISOString().slice(0, 7).replace("-", "/")}/${pedidoId}.${EXTENSIONES[tipo]}`;
    await admin.storage().bucket(STORAGE_BUCKET).file(path).save(Buffer.from(resp.data), { contentType: tipo });
    return { url: `${SERVE_COMPROBANTE_BASE}?pedido=${pedidoId}`, path, contentType: tipo };
  } catch (e) {
    console.error("[agente-api] no se pudo copiar el comprobante", e.message);
    return null;
  }
}

// GET /serveComprobante?pedido= — la foto del comprobante para el panel. Sin clave a propósito,
// igual que servePdf: el panel la muestra con un <img>. La "clave" es el id aleatorio del pedido.
exports.serveComprobante = functions.https.onRequest(async (req, res) => {
  const pedidoId = String(req.query.pedido || "").trim();
  const snap = pedidoId ? await db.collection("pedidos").doc(pedidoId).get() : null;
  const img = snap && snap.exists && snap.data().comprobanteImagen;
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
  const idConversacion = String(b.idConversacion || "").trim();
  const telefonoCliente = normalizarTelefono(b.telefonoCliente);
  if (!idConversacion || !telefonoCliente) return rechazar(res, "faltan idConversacion o telefonoCliente");
  const ref = await db.collection("cotizaciones_uber").add({
    idConversacion,
    telefonoCliente,
    nombreCliente: String(b.nombreCliente || "").trim(),
    direccion: String(b.direccion || "").trim(),
    explicacionCaso: String(b.explicacionCaso || "").trim(),
    estado: "pendiente", // pendiente → cotizado (el depósito cargó el monto) → procesado (n8n ya avisó)
    montoUber: null,
    createdAt: new Date().toISOString(),
  });
  res.json({ ok: true, id: ref.id });
});

exports.onCotizacionUberConfirmada = onDocumentUpdated("cotizaciones_uber/{id}", async (event) => {
  const antes = event.data.before.data() || {};
  const cot = event.data.after.data() || {};
  if (cot.estado !== "cotizado" || antes.estado === "cotizado") return;
  try {
    await axios.post(
      N8N_COTIZACION_UBER_WEBHOOK,
      { idConversacion: cot.idConversacion, montoUber: cot.montoUber },
      { headers: { "X-Agent-Key": AGENT_API_KEY }, timeout: 10000 }
    );
    await event.data.after.ref.update({ estado: "procesado", procesadoEn: new Date().toISOString() });
  } catch (e) {
    // Queda en "cotizado" y el panel lo sigue mostrando como "Enviando al cliente…".
    console.error("[agente-api] no se pudo avisar a n8n de la cotización", event.params.id, e.message);
  }
});
