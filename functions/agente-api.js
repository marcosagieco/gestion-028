/**
 * agente-api.js — endpoints HTTP para el agente conversacional de IA (n8n).
 *
 * TODO ES ADITIVO. No modifica nada del sistema existente:
 *  - Solo LEE de `pedidos` y `settings`.
 *  - ESCRIBE únicamente en `pedidos` (con los mismos campos que hoy + campos nuevos opcionales)
 *    y en colecciones nuevas: `clientes_bot`, `comprobantes_financiera`, `settings/operativo`.
 *  - No toca `sales`, la facturación, ni el parser de comandos del staff.
 *
 * Se engancha desde index.js con una sola línea al final:
 *    Object.assign(exports, require('./agente-api'));
 *
 * Endpoints (todos requieren header  X-Agent-Key: <AGENT_API_KEY>):
 *   GET  /agentCliente?telefono=
 *   GET  /agentCotizarEnvio?direccion=   (o  ?lat=&lng= )
 *   POST /agentPedido
 *   GET  /agentEstadoOperativo
 *   POST /agentCrearCotizacionUber
 *   GET  /agentCotizacionesUberPendientes
 *   POST /agentMarcarCotizacionUberProcesada
 *
 * Además, onCotizacionUberConfirmada es un trigger de Firestore (no HTTP,
 * no requiere X-Agent-Key en la entrada): se dispara solo cuando un doc de
 * cotizaciones_uber pasa a estado "cotizado", y le avisa al webhook de n8n
 * al instante para no depender solo del polling de respaldo.
 *
 * Contrato completo: ../AGENTE_API.md
 */

const functions = require("firebase-functions");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const AGENT_API_KEY = process.env.AGENT_API_KEY || "";
const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY || "";
const N8N_COTIZACION_UBER_WEBHOOK = "https://n8n.bunge.agenticsia.agency/webhook/cotizacion-uber-confirmada";

// Mismo bucket que usan las facturas. El comprobante NO se deja apuntando a Chatwoot: esa URL
// muere el dia que se apague Chatwoot al migrar a Meta, y con ella los comprobantes de todos los
// pedidos viejos. Se copia una vez, al cargar el pedido, y se sirve desde acá.
const STORAGE_BUCKET = "gestion-028.firebasestorage.app";
const SERVE_COMPROBANTE_BASE = "https://us-central1-gestion-028.cloudfunctions.net/serveComprobante";
const MAX_COMPROBANTE_BYTES = 15 * 1024 * 1024;

const EXT_POR_TIPO = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

// Baja la imagen del comprobante y la guarda en Storage. Devuelve el path, o null si algo falló:
// un comprobante que no se pudo copiar NUNCA hace fallar el pedido, solo queda sin foto.
async function copiarComprobanteAStorage(url, pedidoId) {
  try {
    if (!/^https?:\/\//i.test(String(url || ""))) return null;
    const resp = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      maxContentLength: MAX_COMPROBANTE_BYTES,
      maxRedirects: 5,
    });
    const tipo = String(resp.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    const ext = EXT_POR_TIPO[tipo];
    if (!ext) return null; // no es una imagen ni un PDF: no lo guardamos
    const buf = Buffer.from(resp.data);
    if (!buf.length || buf.length > MAX_COMPROBANTE_BYTES) return null;

    const ahora = new Date();
    const yyyy = ahora.getFullYear();
    const mm = String(ahora.getMonth() + 1).padStart(2, "0");
    const filePath = `comprobantes/${yyyy}/${mm}/${pedidoId}.${ext}`;
    await admin.storage().bucket(STORAGE_BUCKET).file(filePath).save(buf, { contentType: tipo });
    return { path: filePath, contentType: tipo, bytes: buf.length };
  } catch (e) {
    console.error("no se pudo copiar el comprobante:", e.message);
    return null;
  }
}

// Depósito — mismas coordenadas que src/reparto/zonas.js (DEPOSITO_ORIGEN).
const DEPOSITO = { lat: -34.55359497285959, lng: -58.4523699884262 };
const TARIFA_POR_KM = 1000;
// Envio seguro: adicional opcional que cubre reposicion ante robo/perdida. Solo se ofrece en
// envio flash (Uber). El monto lo resuelve el backend, como todo el resto de la plata.
const PRECIO_ENVIO_SEGURO = 1990;

// Descuento por pagar en efectivo contra entrega. Los tramos se miden contra el SUBTOTAL de
// productos, sin el envio: el descuento es por pagar la mercaderia en efectivo, no por el flete.
// Hasta hoy el bot anunciaba este descuento con la plantilla DESCUENTO_EFECTIVO pero el total
// salia sin aplicarlo, asi que el cliente esperaba pagar menos de lo que decia el pedido y el
// que quedaba en el medio era el repartidor.
const TRAMOS_DESCUENTO_EFECTIVO = [
  { desde: 100000, off: 5000 },
  { desde: 50000, off: 2500 },
  { desde: 0, off: 1500 },
];

function descuentoEfectivo(subtotal) {
  const s = Number(subtotal) || 0;
  if (s <= 0) return 0;
  const tramo = TRAMOS_DESCUENTO_EFECTIVO.find((t) => s >= t.desde);
  return tramo ? tramo.off : 0;
}
const MINIMO_ENVIO = 3000;

const ALIAS_FINANCIERA = "alias3";

// Cupo por tanda: el deposito despacha de a tandas y no puede con mas de N pedidos por vez.
// Cuenta moto Y uber juntos (lo definio Lucio), sobre los pedidos que siguen SIN COMPLETAR en el
// panel — no sobre los vendidos en la ultima media hora: lo que satura es la cola, no la venta.
const LIMITE_POR_TANDA_DEFAULT = 10;
const ESTADOS_SIN_COMPLETAR = ["pendiente", "armado"];
const TIPOS_QUE_OCUPAN_TANDA = ["moto", "uber"];

// Interruptor de pruebas. En PRODUCCIÓN va en `false`: TODOS los pedidos van a la colección real
// `pedidos` y le llegan al panel del depósito, incluidos los de Gino.
// En `true`, los pedidos de NUMERO_TEST se desvían a `pedidos_test`, invisible para el panel, para
// que ningún pedido de prueba le aparezca a Jero/Bauti mientras trabajan de verdad.
const DESVIAR_PEDIDOS_DE_PRUEBA = false;
const NUMERO_TEST = "5492914643232";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de texto — copiados de index.js (no se importan para no acoplar).
// ─────────────────────────────────────────────────────────────────────────────
// Saca tokens de capacidad tipo "35k"/"60k" (puffs) — son un dato aparte, nunca forman parte
// del nombre real del producto en la base, pero el agente de IA a veces los pega al buscar
// (los ve juntos en CONOCIMIENTO DE PRODUCTO, ej. "Elfbar Duke 35K").
const normalizar = (texto) =>
  String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b\d+k\b/g, "")
    // Conectores ("&", "y", "and") no forman parte del nombre real — "Honor & Glory" y
    // "Honor and Glory" tienen que ser lo mismo para el buscador.
    .replace(/\b(y|and)\b/g, " ")
    .replace(/ +/g, " ")
    .trim();

function distanciaLevenshtein(a, b) {
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] =
        b.charAt(i - 1) === a.charAt(j - 1)
          ? m[i - 1][j - 1]
          : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
    }
  }
  return m[b.length][a.length];
}

function similitud(s1, s2) {
  const larga = s1.length > s2.length ? s1 : s2;
  const corta = s1.length > s2.length ? s2 : s1;
  if (larga.length === 0) return 1;
  return (larga.length - distanciaLevenshtein(larga, corta)) / larga.length;
}

function esParecido(userTxt, bdTxt) {
  if (!userTxt) return true; // sin filtro
  if (bdTxt.includes(userTxt)) return true;
  // "elf bar" → "elfbar": comparar sin espacios (solo si la query tiene algo de largo).
  const uJoin = userTxt.replace(/ /g, "");
  if (uJoin.length >= 4 && bdTxt.replace(/ /g, "").includes(uJoin)) return true;

  const pu = userTxt.split(" ").filter(Boolean);
  const pb = bdTxt.split(" ").filter(Boolean);
  if (pu.length === 0) return false;
  const sinCeros = (s) => s.replace(/^0+/, "") || "0";
  for (const w of pu) {
    let ok = false;
    for (const x of pb) {
      const corto = w.length <= 2;
      if (corto ? (w === x || (/^\d+$/.test(w) && /^\d+$/.test(x) && sinCeros(w) === sinCeros(x)))
                : similitud(w, x) >= 0.75) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }
  return true;
}

// Teléfono → formato canónico 549XXXXXXXXXX (mismo criterio que el webhook de index.js).
function normalizarTelefono(tel) {
  let n = String(tel || "").replace(/[^0-9]/g, "");
  if (n.startsWith("54") && n.length === 12) n = "549" + n.slice(2); // 54 11... → 549 11...
  if (!n.startsWith("54") && n.length === 10) n = "549" + n; // 11........ → 549 11........
  return n;
}

// Haversine — km en línea recta. Igual que costoMotomensajeriaEstimado de src/reparto.
function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const aplicarTarifa = (km) => Math.max(Math.round(km * TARIFA_POR_KM), MINIMO_ENVIO);

// ─────────────────────────────────────────────────────────────────────────────
// Precios: parseo de las listas de texto libre del panel
//
// El depósito pega las listas a mano en /operativo. Tienen una estructura regular:
// bloques separados por una línea de guiones/rayas, cada bloque arranca con el nombre del
// modelo y adentro trae líneas tipo "💰 1x $22.000" / "🔥 2x $40.000" / "🎁 5x $90.000".
// Parsearlas permite resolver el precio de un pedido POR CÓDIGO en vez de confiar en que el
// agente lea bien la tabla. OJO: "2x $40.000" es el precio TOTAL del combo de 2, no el unitario.
// ─────────────────────────────────────────────────────────────────────────────
function parsearListaPrecios(texto) {
  const bloques = String(texto || "").split(/\n[ \t]*[⸻─-╿=_—–-]+[ \t]*\n/);
  const out = [];
  for (const b of bloques) {
    const lineas = b.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lineas.length) continue;
    const precios = {};
    for (const l of lineas) {
      const m = l.match(/(\d+)\s*x\s*\$\s*([\d.,]+)/i);
      if (!m) continue;
      const cant = parseInt(m[1], 10);
      const monto = parseInt(String(m[2]).replace(/[^\d]/g, ""), 10);
      if (cant > 0 && monto > 0) precios[cant] = monto;
    }
    if (Object.keys(precios).length) out.push({ titulo: lineas[0], precios });
  }
  return out;
}

// Dado el nombre de un producto y una cantidad, devuelve el importe real de esa línea usando
// los combos de la lista (el más grande que entre, y el resto al precio de a uno). Si el
// producto no aparece en ninguna lista devuelve null, y el llamador cae al precio del agente.
function resolverPrecioLinea(listas, producto, cantidad) {
  const q = normalizar(producto);
  if (!q) return null;

  let mejor = null;
  for (const l of listas) {
    const t = normalizar(l.titulo);
    if (!t) continue;
    const score = coincideConTexto(q, t) ? 1 : fraccionDeCoincidencia(q, t);
    if (score >= 0.6 && (!mejor || score > mejor.score)) mejor = { lista: l, score };
  }
  if (!mejor) return null;

  const packs = mejor.lista.precios;
  const tamanos = Object.keys(packs).map(Number).filter((n) => n > 0).sort((a, b) => b - a);
  if (!tamanos.length) return null;

  let restante = Math.max(1, Number(cantidad) || 1);
  let importe = 0;
  for (const t of tamanos) {
    while (restante >= t) {
      importe += packs[t];
      restante -= t;
    }
  }
  if (restante > 0) {
    const masChico = tamanos[tamanos.length - 1];
    const unitario = packs[1] || Math.round(packs[masChico] / masChico);
    importe += unitario * restante;
  }
  return { importe, titulo: mejor.lista.titulo };
}

// Rubros que en el panel se cargan con un nombre genérico en `product` (Perfumes, Cápsulas,
// Batería) y el nombre real de la marca/modelo vive en `variant`. Para estos, buscar por
// "producto" tiene que mirar la variante — si no, preguntar por marca (ej. "rasasi", "028")
// nunca encuentra nada, porque ningún item tiene esa palabra en el campo `product`.

// Barrio → zona. Subconjunto del mapeo de src/reparto/zonas.js (solo barrios que caen enteros
// en una zona). Sirve para sugerir cobertura; si no matchea, cubiertoMoto = false.
const BARRIO_A_ZONA = {
  belgrano: "A", nunez: "A", colegiales: "A", coghlan: "A", "las canitas": "A",
  "palermo chico": "A", "barrio parque": "A", "villa ortuzar": "A",
  "vicente lopez": "B", olivos: "B", "la lucila": "B", martinez: "B",
  palermo: "C1", "palermo hollywood": "C1", "palermo soho": "C1", "barrio norte": "C1",
  recoleta: "C2", retiro: "C2", "san nicolas": "C2", tribunales: "C2", monserrat: "C2",
  "villa urquiza": "D", "parque chas": "D", chacarita: "D", agronomia: "D",
  "villa pueyrredon": "D", "villa del parque": "D",
  "villa crespo": "E", almagro: "E", caballito: "E",
  "villa santa rita": "F", floresta: "F", liniers: "F", "velez sarsfield": "F",
  "villa real": "F", versalles: "F", "monte castro": "F", "villa luro": "F", mataderos: "F",
  "san telmo": "G", constitucion: "G", barracas: "G", "la boca": "G",
  "parque patricios": "G", "nueva pompeya": "G",
};
// Resuelve la zona (A–G) a partir del texto de una dirección, con el mismo criterio que usa
// agentCotizarEnvio cuando no hay address_components de Google: se parte por comas/guiones y se
// busca cada pedazo en el mapa de barrios.
function zonaDesdeTexto(texto) {
  for (const w of String(texto || "").split(/[,-]/)) {
    const z = BARRIO_A_ZONA[normalizar(w)];
    if (z) return z;
  }
  return null;
}

// El efectivo contra entrega es solo para CABA. La única zona del mapa que NO es CABA es la B
// (Corredor Norte). Si no matcheó ninguna zona tampoco se admite: no sabemos si es CABA.
const zonaAdmiteEfectivo = (zona) => zona !== null && zona !== "B";

// El mapa BARRIO_A_ZONA no cubre toda CABA (le faltan Flores, Balvanera, Boedo, Saavedra y
// varios mas), asi que atar el efectivo SOLO a ese mapa se lo negaba a clientes de CABA por el
// simple hecho de que su barrio no estaba escrito en la lista. Google ya sabe en que ciudad
// cae la direccion: si dice CABA, hay efectivo, este o no el barrio mapeado.
function esCABAporGoogle(addressComponents) {
  for (const c of addressComponents || []) {
    const n = normalizar(c.long_name) + " " + normalizar(c.short_name);
    if (/ciudad autonoma de buenos aires|caba|capital federal/.test(n)) return true;
  }
  return false;
}

// Geocodifica una direccion y dice si cae en CABA. Devuelve null si no se pudo resolver.
async function direccionEsCABA(texto) {
  if (!GOOGLE_MAPS_KEY || !String(texto || "").trim()) return null;
  try {
    const geo = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
      params: { address: texto, key: GOOGLE_MAPS_KEY, region: "ar", components: "country:AR" },
      timeout: 8000,
    });
    const r = geo.data.results && geo.data.results[0];
    if (!r) return null;
    return esCABAporGoogle(r.address_components);
  } catch (e) {
    console.error("no se pudo verificar si la direccion es CABA:", e.message);
    return null;
  }
}

const ZONA_NOMBRE = {
  A: "Zona A — Núcleo", B: "Zona B — Corredor Norte", C1: "Zona C1 — Palermo extendido",
  C2: "Zona C2 — Centro / Recoleta", D: "Zona D — Oeste cercano", E: "Zona E — Centro-oeste",
  F: "Zona F — Oeste lejano", G: "Zona G — Sur",
};

// ─────────────────────────────────────────────────────────────────────────────
// Middleware de auth + wrapper
// ─────────────────────────────────────────────────────────────────────────────
function withAuth(handler) {
  return functions.https.onRequest(async (req, res) => {
    if (!AGENT_API_KEY) {
      return res.status(500).json({ ok: false, error: "AGENT_API_KEY no configurada en el servidor" });
    }
    const key = req.get("X-Agent-Key");
    if (key !== AGENT_API_KEY) {
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

// Coincide si CUALQUIERA de las dos direcciones matchea — cubre tanto "el query trae una
// palabra de más" (ej. buscar "elfbar ice king" contra el lote "elfbar ice") como el caso
// normal (buscar "elfbar duke" contra "elfbar duke").
function coincideConTexto(a, b) {
  if (!a || !b) return false;
  return esParecido(a, b) || esParecido(b, a);
}

// Para la búsqueda floja (fallback): compara palabra por palabra con un umbral más tolerante
// que esParecido, y NO exige que matcheen todas — devuelve qué fracción de las palabras del
// query encontró algo parecido en el texto del catálogo. Comparar la frase entera (en vez de
// palabra por palabra) penaliza mal cuando el query es más corto que el nombre real (ej. "hidn
// hils" vs "Hidden Hills Club" sale mal en similitud de texto completo, pero bien acá).
function fraccionDeCoincidencia(query, texto) {
  const pw = query.split(" ").filter(Boolean);
  const cw = texto.split(" ").filter(Boolean);
  if (!pw.length || !cw.length) return 0;
  let matched = 0;
  for (const w of pw) {
    if (w.length <= 2) { if (cw.includes(w)) matched++; continue; }
    const mejor = Math.max(0, ...cw.map((x) => similitud(w, x)));
    if (mejor >= 0.6) matched++;
  }
  return matched / pw.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /agentCliente?telefono=
// ─────────────────────────────────────────────────────────────────────────────
exports.agentCliente = withAuth(async (req, res) => {
  const tel = normalizarTelefono(req.query.telefono);
  if (!tel) return res.status(400).json({ ok: false, error: "falta 'telefono'" });

  const botDoc = await db.collection("clientes_bot").doc(tel).get();
  if (botDoc.exists) {
    const d = botDoc.data();
    return res.json({
      ok: true,
      telefono: tel,
      nuevo: (d.cantidadPedidos || 0) === 0,
      cantidadPedidos: d.cantidadPedidos || 0,
      ultimoPedido: d.ultimoPedido || null,
      origen: d.origen || null,
    });
  }

  // Fallback: pedidos que ya tengan el teléfono estructurado.
  const pedSnap = await db
    .collection("pedidos")
    .where("telefono", "==", tel)
    .get()
    .catch(() => ({ empty: true, size: 0, docs: [] }));

  const cantidad = pedSnap.size || 0;
  let ultimo = null;
  pedSnap.docs.forEach((doc) => {
    const c = doc.data().createdAt;
    if (c && (!ultimo || c > ultimo)) ultimo = c;
  });

  return res.json({
    ok: true,
    telefono: tel,
    nuevo: cantidad === 0,
    cantidadPedidos: cantidad,
    ultimoPedido: ultimo,
    origen: null,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /agentCotizarEnvio?direccion=   (o ?lat=&lng=)
// ─────────────────────────────────────────────────────────────────────────────
exports.agentCotizarEnvio = withAuth(async (req, res) => {
  let lat = parseFloat(req.query.lat);
  let lng = parseFloat(req.query.lng);
  let texto = String(req.query.direccion || "").trim();
  let zona = null;
  // Lo resuelve Google cuando geocodifica; queda en null si vinieron lat/lng directos.
  let esCABA = null;

  if (isNaN(lat) || isNaN(lng)) {
    if (!texto) return res.status(400).json({ ok: false, error: "falta 'direccion' o 'lat'+'lng'" });
    if (!GOOGLE_MAPS_KEY) {
      return res.status(200).json({
        ok: true,
        needsManualQuote: true,
        mensaje: "sin geocoding configurado — cotizar el envío a mano",
      });
    }
    // No se fuerza ", CABA, Argentina" en el texto: eso le puede hacer resolver mal una
    // dirección genuinamente lejana si coincide con un lugar/monumento que también existe
    // dentro de CABA (ej. "Pilar" solo, sin más datos, matcheaba con la Basílica del Pilar en
    // Recoleta en vez del partido de Pilar, a 43km). Se deja que Google resuelva la dirección
    // tal cual la escribió el cliente, solo acotado al país.
    const geo = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
      params: {
        address: texto,
        key: GOOGLE_MAPS_KEY,
        region: "ar",
        components: "country:AR",
      },
    });
    const r = geo.data.results && geo.data.results[0];
    if (!r) return res.status(200).json({ ok: true, encontrada: false, mensaje: "no se pudo ubicar la dirección" });
    lat = r.geometry.location.lat;
    lng = r.geometry.location.lng;
    texto = r.formatted_address;
    for (const c of r.address_components || []) {
      const z = BARRIO_A_ZONA[normalizar(c.long_name)] || BARRIO_A_ZONA[normalizar(c.short_name)];
      if (z) { zona = z; break; }
    }
    esCABA = esCABAporGoogle(r.address_components);
  } else if (texto) {
    zona = zonaDesdeTexto(texto);
  }

  const km = haversineKm(DEPOSITO, { lat, lng });
  const monto = aplicarTarifa(km);
  // Cobertura: si el barrio matcheó una zona conocida (A–G) está cubierto; si no matcheó ninguna,
  // se cubre solo si cae razonablemente cerca (~13 km en línea recta desde el depósito).
  // Nunca cubierto más allá de 20 km. La Boca es un caso a confirmar con Lucio (ver PROYECTO_028).
  const cubiertoMoto = km <= 20 && (zona !== null || km <= 13);

  return res.json({
    ok: true,
    encontrada: true,
    direccion: { texto, lat, lng, zona },
    zonaNombre: zona ? ZONA_NOMBRE[zona] : null,
    km: Math.round(km * 10) / 10,
    monto,
    cubiertoMoto,
    // El pago en efectivo contra entrega es solo para CABA. La única zona del mapa que NO es
    // CABA es la B (Corredor Norte: Vicente López, Olivos, La Lucila, Martínez). Si no matcheó
    // ninguna zona, tampoco se ofrece: no sabemos si es CABA.
    // CABA confirmada por Google gana sobre el mapa de barrios; si Google no opino, se cae al mapa.
    admiteEfectivo: esCABA === true ? true : (esCABA === false ? false : zonaAdmiteEfectivo(zona)),
    estimado: true, // línea recta — la medición real por calle la hace el panel de moto al entregar
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /agentPedido
// ─────────────────────────────────────────────────────────────────────────────
exports.agentPedido = withAuth(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "usar POST" });
  const b = req.body || {};

  const tel = normalizarTelefono(b.telefono);
  if (!tel) return res.status(400).json({ ok: false, error: "falta 'telefono'" });
  if (!Array.isArray(b.items) || b.items.length === 0) {
    return res.status(400).json({ ok: false, error: "falta 'items'" });
  }
  const tipoEnvio = ["moto", "uber", "correo", "retiro"].includes(b.tipoEnvio) ? b.tipoEnvio : null;
  if (!tipoEnvio) {
    return res.status(400).json({ ok: false, error: "'tipoEnvio' debe ser moto|uber|correo|retiro" });
  }

  const esPreview = b.preview === true || b.preview === "true";
  // El efectivo es contra entrega; cualquier otro medio (transferencia, dólares, USDT, el alias
  // de la financiera) es pago previo y tiene que venir con su comprobante.
  const esEfectivo = /efectivo/i.test(String(b.medioPago || ""));

  // ── Datos obligatorios para CARGAR el pedido ────────────────────────────────
  // No es una lista fija: primero se define el tipo de envío y el medio de pago, y recién esos
  // dos deciden qué más es obligatorio. Un pedido a moto sin dirección llega al depósito
  // imposible de despachar, y una transferencia sin comprobante es un pedido sin cobrar.
  // El preview (tool armar_resumen) corre ANTES del pago, así que ahí todavía no se exige nada.
  if (!esPreview) {
    const medioPago = String(b.medioPago || "").trim();
    const tieneComprobante =
      !!b.comprobante && typeof b.comprobante === "object" && Object.keys(b.comprobante).length > 0;

    const faltan = [];
    if (!String(b.cliente || "").trim()) faltan.push("el nombre del cliente");
    if (!medioPago) faltan.push("el medio de pago");
    // El correo necesita datos que la moto no: sin DNI, localidad y CP no se puede despachar.
    // El agente ya se los pide al cliente (ver Paso 4 del prompt), asi que tienen que llegar.
    if (tipoEnvio === "correo") {
      const dc = b.datosCorreo || {};
      if (!String(dc.dni || "").trim()) faltan.push("el DNI (hace falta para el correo)");
      if (!String(dc.localidad || "").trim()) faltan.push("la localidad (hace falta para el correo)");
      if (!String(dc.cp || "").trim()) faltan.push("el codigo postal (hace falta para el correo)");
    }
    // Retiro es el único tipo de envío que no necesita dirección.
    if (tipoEnvio !== "retiro" && !String((b.direccion || {}).texto || "").trim()) {
      faltan.push("la dirección de entrega");
    }
    // El comprobante solo es obligatorio cuando el pago es PREVIO. No lo es con efectivo contra
    // entrega ni con correo, que se abona al recibir. Si igual viene un comprobante, se guarda.
    const pagoContraEntrega = esEfectivo || tipoEnvio === "correo";
    if (medioPago && !pagoContraEntrega && !tieneComprobante) faltan.push("el comprobante de pago");
    // valorEnvio tiene que venir siempre que haya envio. Se acepta 0 (envio bonificado), pero no
    // que falte: si no, un pedido se carga con el envio sin cobrar y nadie se entera.
    if (tipoEnvio !== "retiro" && (b.valorEnvio === undefined || b.valorEnvio === null || b.valorEnvio === "")) {
      faltan.push("el valor del envío (poné 0 si se lo bonificás)");
    }

    // El efectivo contra entrega solo vale donde el cotizador lo habría ofrecido. Se revalida
    // acá y no se confía en el agente: la zona que mandó se usa si viene, y si no se recalcula
    // del texto de la dirección con el mismo mapa de barrios que usa agentCotizarEnvio.
    if (esEfectivo && tipoEnvio === "moto") {
      const zonaPedido = (b.direccion || {}).zona || zonaDesdeTexto((b.direccion || {}).texto);
      let admite = zonaAdmiteEfectivo(zonaPedido);
      // El mapa de barrios no cubre toda CABA. Antes de rechazar, se le pregunta a Google: asi
      // un cliente de Flores o de Once no se queda sin efectivo solo porque su barrio no figura
      // en la lista. Solo se llama en este caso, que es el raro, para no sumar latencia al resto.
      if (!admite) {
        const caba = await direccionEsCABA((b.direccion || {}).texto);
        if (caba === true) admite = true;
      }
      if (!admite) {
        return res.status(400).json({
          ok: false,
          error:
            "NO se cargó el pedido: esa dirección no admite pago en efectivo contra entrega " +
            "(el efectivo es solo para CABA). Ofrecele transferencia y volvé a intentar.",
        });
      }
    }

    // El Uber es siempre pago previo por transferencia: nunca puede cerrarse en efectivo.
    if (esEfectivo && tipoEnvio === "uber") {
      return res.status(400).json({
        ok: false,
        error:
          "NO se cargó el pedido: el envío flash (Uber) se paga siempre por transferencia previa, " +
          "nunca en efectivo. Confirmá con el cliente cómo va a pagar antes de volver a intentar.",
      });
    }

    if (faltan.length) {
      return res.status(400).json({
        ok: false,
        error:
          `NO se cargó el pedido porque falta ${faltan.join(", falta ")}. ` +
          "Pedíselo al cliente en tu próxima respuesta y recién después volvé a llamar a crear_pedido.",
        faltan,
      });
    }
  }

  // ── PRECIOS: no se confía en lo que dijo el modelo ──────────────────────────
  // Se leen las listas del día y se resuelve el importe de cada línea por código. El precio
  // que mandó el agente solo se usa de respaldo, si ese producto no figura en ninguna lista.
  const opDocPrecios = await db.collection("settings").doc("operativo").get();
  const opPrecios = opDocPrecios.exists ? opDocPrecios.data() : {};
  const listasPrecios = [
    ...parsearListaPrecios(opPrecios.preciosVapesTexto),
    ...parsearListaPrecios(opPrecios.preciosThcTexto),
    ...parsearListaPrecios(opPrecios.perfumesTexto),
    ...parsearListaPrecios(opPrecios.appleTexto),
  ];

  const $ = (n) => `$${Number(n || 0).toLocaleString("es-AR")}`;
  const lineas = b.items.map((it) => {
    const cantidad = Math.max(1, Number(it.cantidad) || 1);
    const resuelto = resolverPrecioLinea(listasPrecios, it.producto, cantidad);
    const importeAgente = (Number(it.precioUnitario) || 0) * cantidad;
    const importe = resuelto ? resuelto.importe : importeAgente;
    return {
      producto: it.producto,
      variante: it.variante,
      cantidad,
      importe,
      unitario: Math.round(importe / cantidad),
      fuente: resuelto ? "lista" : "agente",
      difiere: !!(resuelto && importeAgente && importeAgente !== resuelto.importe),
    };
  });

  const lineasItems = lineas.map(
    (l) => `* ${l.cantidad}x ${l.producto}${l.variante ? " - " + l.variante : ""}` +
      (l.unitario ? ` (${$(l.unitario)} c/u)` : "")
  );
  const subtotal = lineas.reduce((s, l) => s + l.importe, 0);
  const valorEnvio = Number(b.valorEnvio) || 0;
  // El envio seguro es solo para el flash: si viene marcado en otro tipo de envio, se ignora.
  const envioSeguro = (b.envioSeguro === true || b.envioSeguro === "true") && tipoEnvio === "uber";
  const montoEnvioSeguro = envioSeguro ? PRECIO_ENVIO_SEGURO : 0;
  // El descuento por efectivo solo corre si realmente paga en efectivo contra entrega.
  const montoDescuento = esEfectivo ? descuentoEfectivo(subtotal) : 0;
  const total = subtotal + valorEnvio + montoEnvioSeguro - montoDescuento;
  const dir = b.direccion || {};
  const ENVIO_LABEL = {
    moto: "🛵 Moto mensajería",
    uber: "⚡ Envío flash (Uber)",
    correo: "📮 Correo (Cargo)",
    retiro: "🏠 Retiro",
  };

  const mensaje = [
    "🛒 PRODUCTOS",
    ...lineasItems,
    "",
    "💰 TOTALES",
    `Subtotal: ${$(subtotal)}`,
    valorEnvio ? `Envío: ${$(valorEnvio)}` : null,
    envioSeguro ? `🛡️ Envío seguro: ${$(montoEnvioSeguro)}` : null,
    montoDescuento ? `💵 Descuento por efectivo: -${$(montoDescuento)}` : null,
    `TOTAL A PAGAR: ${$(total)}`,
    "",
    "📦 ENTREGA",
    ENVIO_LABEL[tipoEnvio] + (envioSeguro ? "  —  🛡️ CON ENVÍO SEGURO" : ""),
    dir.texto ? dir.texto : null,
    dir.zona ? `Zona ${dir.zona}` : null,
    dir.referencias ? `Ref: ${dir.referencias}` : null,
    tipoEnvio === "correo" && b.datosCorreo ? `DNI: ${b.datosCorreo.dni || "-"}` : null,
    tipoEnvio === "correo" && b.datosCorreo ? `${b.datosCorreo.localidad || "-"} (CP ${b.datosCorreo.cp || "-"})` : null,
    "",
    "👤 CLIENTE",
    `${b.cliente || "-"} — ${tel}`,
    b.origen === "publicidad" ? "📣 Viene de un anuncio (Ads) — tildar en \"Finalizar pedido\"" : null,
    "",
    b.medioPago ? `💳 ${b.medioPago}` : null,
    b.comprobante && b.comprobante.numero ? `Comprobante: ${b.comprobante.numero}` : null,
    b.notas ? `📝 ${b.notas}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");

  // ── preview: solo devuelve el resumen ya calculado, NO escribe nada ─────────
  // Lo usa la tool armar_resumen, para que el resumen que ve el cliente antes de pagar salga
  // de la misma cuenta que el pedido final y el agente no tenga que sumar nada.
  if (esPreview) {
    return res.json({
      ok: true,
      preview: true,
      mensaje,
      subtotal,
      valorEnvio,
      envioSeguro,
      montoEnvioSeguro,
      montoDescuento,
      total,
      lineas: lineas.map((l) => ({
        producto: l.producto, variante: l.variante, cantidad: l.cantidad,
        unitario: l.unitario, importe: l.importe, fuente: l.fuente, difiere: l.difiere,
      })),
    });
  }

  const coleccionPedidos =
    DESVIAR_PEDIDOS_DE_PRUEBA && tel === NUMERO_TEST ? "pedidos_test" : "pedidos";

  // 1) Pedido — MISMOS campos base que hoy + estructurados nuevos. Con el interruptor de pruebas
  // apagado (producción) esto siempre escribe en `pedidos` y le llega al panel del depósito.
  const pedidoRef = await db.collection(coleccionPedidos).add({
    mensaje,
    estado: "pendiente",
    tipoEnvio,
    createdAt: new Date().toISOString(),
    // nuevos (opcionales — no rompen nada que lea pedidos):
    telefono: tel,
    cliente: b.cliente || "",
    direccion: dir.texto
      ? {
          texto: dir.texto,
          lat: typeof dir.lat === "number" ? dir.lat : null,
          lng: typeof dir.lng === "number" ? dir.lng : null,
          // La zona SOLO puede ser una de las del mapa. Si el barrio no esta mapeado,
          // cotizar_envio devuelve null y el agente tiende a inventarla con el nombre del
          // barrio ("Flores"), que despues rompe el agrupado por zona del recorrido de moto.
          zona: ZONA_NOMBRE[dir.zona] ? dir.zona : null,
          referencias: dir.referencias || null,
        }
      : null,
    valorEnvio,
    envioSeguro,
    montoEnvioSeguro,
    montoDescuento,
    // Solo para correo: DNI, localidad y CP. En los demas envios queda null.
    datosCorreo:
      tipoEnvio === "correo" && b.datosCorreo
        ? {
            dni: String(b.datosCorreo.dni || "").trim(),
            localidad: String(b.datosCorreo.localidad || "").trim(),
            cp: String(b.datosCorreo.cp || "").trim(),
          }
        : null,
    medioPago: b.medioPago || null,
    comprobante: b.comprobante || null,
    comprobanteImagen: null, // se completa abajo si el agente mandó la foto
    origen: b.origen || null,   // publicidad / organico / null — atribución CTWA
    items: b.items,
  });

  // 1b) Comprobante: se copia la foto a Storage y el pedido guarda una URL propia, no la de
  // Chatwoot. Si la copia falla, el pedido queda cargado igual pero sin foto — nunca se pierde
  // una venta porque no se pudo bajar una imagen.
  if (b.comprobanteUrl) {
    const guardado = await copiarComprobanteAStorage(b.comprobanteUrl, pedidoRef.id);
    if (guardado) {
      await pedidoRef.update({
        comprobanteImagen: {
          url: `${SERVE_COMPROBANTE_BASE}?pedido=${pedidoRef.id}`,
          path: guardado.path,
          contentType: guardado.contentType,
        },
      });
    }
  }

  // 2) clientes_bot — registra/incrementa. primerContacto y origen solo se setean la 1ª vez.
  const clienteRef = db.collection("clientes_bot").doc(tel);
  const nowISO = new Date().toISOString();
  await db.runTransaction(async (t) => {
    const snap = await t.get(clienteRef);
    const patch = {
      cantidadPedidos: admin.firestore.FieldValue.increment(1),
      ultimoPedido: nowISO,
    };
    if (!snap.exists) {
      patch.primerContacto = nowISO;
      if (b.origen) patch.origen = b.origen;
    } else if (b.origen && !snap.data().origen) {
      patch.origen = b.origen;
    }
    t.set(clienteRef, patch, { merge: true });
  });

  // 3) ultimo_pedido_whatsapp — para que el "cancelar" por WhatsApp que ya existe siga andando.
  await db
    .collection("ultimo_pedido_whatsapp")
    .doc(tel)
    .set({ pedidoId: pedidoRef.id, createdAt: new Date().toISOString() });

  // 4) Alias financiera → registra el comprobante aparte (lo pidió Lucio explícito).
  // Quién cobró lo decide el alias activo del día en settings/operativo, NO lo que el agente
  // haya escrito en medioPago: el modelo manda "transferencia", nunca el nombre interno del
  // alias, así que con la comparación vieja esto no se disparaba nunca. Se sigue aceptando
  // medioPago === "alias3" por si alguien lo manda explícito.
  const aliasActivo = ALIASES_VALIDOS.includes(opPrecios.aliasActivo) ? opPrecios.aliasActivo : "alias1";
  const cobroFinanciera = aliasActivo === ALIAS_FINANCIERA || b.medioPago === ALIAS_FINANCIERA;
  if (cobroFinanciera && !esEfectivo && b.comprobante) {
    await db.collection("comprobantes_financiera").add({
      pedidoId: pedidoRef.id,
      numero: b.comprobante.numero || "",
      monto: Number(b.comprobante.monto) || total,
      nombre: b.comprobante.nombre || b.cliente || "",
      telefono: tel,
      createdAt: new Date().toISOString(),
    });
  }

  return res.json({ ok: true, pedidoId: pedidoRef.id, estado: "pendiente", mensaje });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET /agentEstadoOperativo
// ─────────────────────────────────────────────────────────────────────────────
// El staff setea esto desde /operativo en el dashboard. Solo campos estructurados (nada de
// texto libre) para que el bot no se confunda: la frase la arma el prompt segun `situacion`.
const SITUACIONES_VALIDAS = ["sin_demora", "normal", "demora", "demora_fuerte", "solo_manana"];
const ALIASES_VALIDOS = ["alias1", "alias2", "alias3"];

exports.agentEstadoOperativo = withAuth(async (req, res) => {
  const doc = await db.collection("settings").doc("operativo").get();
  const d = doc.exists ? doc.data() : {};
  const situacion = SITUACIONES_VALIDAS.includes(d.situacion) ? d.situacion : "sin_demora";
  const aliasActivo = ALIASES_VALIDOS.includes(d.aliasActivo) ? d.aliasActivo : "alias1";
  const tanda = await contarTanda(d.limitePorTanda);
  return res.json({
    ok: true,
    situacion,                    // sin_demora | normal | demora | demora_fuerte | solo_manana
    proximaSalida: d.proximaSalida || null,
    aliasActivo,                  // alias1 | alias2 | alias3 — cual usar hoy
    // Textos libres que le llegan al bot: los pega el staff a mano en /operativo (sección
    // "Agente IA"), se mandan tal cual como plantillas protegidas (ver PLANTILLAS en el prompt).
    stockNicotinaTexto: typeof d.stockNicotinaTexto === "string" ? d.stockNicotinaTexto.trim().slice(0, 10000) : "",
    stockThcTexto: typeof d.stockThcTexto === "string" ? d.stockThcTexto.trim().slice(0, 10000) : "",
    preciosVapesTexto: typeof d.preciosVapesTexto === "string" ? d.preciosVapesTexto.trim().slice(0, 10000) : "",
    preciosThcTexto: typeof d.preciosThcTexto === "string" ? d.preciosThcTexto.trim().slice(0, 10000) : "",
    perfumesTexto: typeof d.perfumesTexto === "string" ? d.perfumesTexto.trim().slice(0, 10000) : "",
    appleTexto: typeof d.appleTexto === "string" ? d.appleTexto.trim().slice(0, 10000) : "",
    preciosMayoristaTexto: typeof d.preciosMayoristaTexto === "string" ? d.preciosMayoristaTexto.trim().slice(0, 10000) : "",
    // Ofertas temporales: promo puntual de la semana. Vacío la mayor parte del tiempo.
    ofertasTexto: typeof d.ofertasTexto === "string" ? d.ofertasTexto.trim().slice(0, 10000) : "",
    // Cupo de la tanda, para que el agente sepa si puede prometer que sale en esta o en la siguiente.
    tanda,
    actualizadoEn: d.actualizadoEn || null,
  });
});

// Cuenta cuantos pedidos siguen sin completar en el panel y los compara contra el limite.
// Si algo falla, devuelve la tanda como NO llena: ante la duda se vende, no se frena.
async function contarTanda(limiteConfigurado) {
  const limite = Number(limiteConfigurado) > 0 ? Number(limiteConfigurado) : LIMITE_POR_TANDA_DEFAULT;
  try {
    const snap = await db.collection("pedidos").where("estado", "in", ESTADOS_SIN_COMPLETAR).get();
    let ocupados = 0;
    snap.forEach((doc) => {
      const p = doc.data() || {};
      // Los pedidos viejos no tienen tipoEnvio; se cuentan igual, ocupan lugar en la moto.
      if (!p.tipoEnvio || TIPOS_QUE_OCUPAN_TANDA.includes(p.tipoEnvio)) ocupados += 1;
    });
    return { ocupados, limite, llena: ocupados >= limite, ok: true };
  } catch (e) {
    console.error("no se pudo contar la tanda:", e.message);
    return { ocupados: 0, limite, llena: false, ok: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Cotización manual de Uber — cola de pedidos derivados
//
// El bot no puede cotizar Uber (el precio no sale de una fórmula), así que cuando
// lo necesita llama a avisar_al_equipo con motivo "cotizar_uber". Esa derivación
// crea un registro acá con POST /agentCrearCotizacionUber. El equipo lo resuelve
// desde /cotizar-uber en el panel (carga el monto ahí mismo, estado pasa a
// "cotizado"). Un workflow de n8n hace polling con GET
// /agentCotizacionesUberPendientes, manda el WhatsApp al cliente, reactiva la
// conversación pausada, y marca el registro como "procesado" con POST
// /agentMarcarCotizacionUberProcesada para no reenviarlo.
// ─────────────────────────────────────────────────────────────────────────────
exports.agentCrearCotizacionUber = withAuth(async (req, res) => {
  const b = req.body || {};
  const idConversacion = String(b.idConversacion || "").trim();
  const telefonoCliente = String(b.telefonoCliente || "").trim();
  if (!idConversacion || !telefonoCliente) {
    return res.status(400).json({ ok: false, error: "faltan 'idConversacion' o 'telefonoCliente'" });
  }
  const ref = await db.collection("cotizaciones_uber").add({
    idConversacion,
    telefonoCliente,
    nombreCliente: String(b.nombreCliente || "").trim(),
    direccion: String(b.direccion || "").trim(),
    explicacionCaso: String(b.explicacionCaso || "").trim(),
    estado: "pendiente", // pendiente -> cotizado (staff cargó el monto) -> procesado (n8n ya avisó)
    montoUber: null,
    createdAt: new Date().toISOString(),
  });
  return res.json({ ok: true, id: ref.id });
});

exports.agentCotizacionesUberPendientes = withAuth(async (req, res) => {
  const snap = await db.collection("cotizaciones_uber").where("estado", "==", "cotizado").get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return res.json({ ok: true, items });
});

exports.agentMarcarCotizacionUberProcesada = withAuth(async (req, res) => {
  const id = String((req.body || {}).id || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "falta 'id'" });
  await db.collection("cotizaciones_uber").doc(id).update({
    estado: "procesado",
    procesadoEn: new Date().toISOString(),
  });
  return res.json({ ok: true });
});

// Se dispara solo cuando el panel (CotizarUberPage.jsx) pasa un doc a
// estado "cotizado". Avisa al workflow de n8n al instante en vez de esperar
// a que el polling de respaldo (cada varios minutos) lo encuentre — el
// workflow de n8n vuelve a llamar a agentCotizacionesUberPendientes igual
// que en el polling normal, esto solo lo despierta antes.
exports.onCotizacionUberConfirmada = onDocumentUpdated("cotizaciones_uber/{id}", async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (after.estado !== "cotizado" || before.estado === "cotizado") return;
  try {
    await axios.post(N8N_COTIZACION_UBER_WEBHOOK, { id: event.params.id }, {
      headers: { "X-Agent-Key": AGENT_API_KEY },
      timeout: 5000,
    });
  } catch (e) {
    console.error("[agente-api] no se pudo avisar a n8n de la cotizacion confirmada, el polling de respaldo la va a agarrar igual", e.message);
  }
});

// ──────────────────────────────────────────────────────────────────────
// 9. GET /serveComprobante?pedido=<id>
// Sirve la foto del comprobante guardada en Storage. Sin X-Agent-Key a propósito, igual que
// servePdf: el panel la muestra con un <img>, donde no se pueden mandar headers. La "clave" es
// el id de Firestore, aleatorio de 20 caracteres.
// ──────────────────────────────────────────────────────────────────────
exports.serveComprobante = functions.https.onRequest(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).send("");

  const pedidoId = String(req.query.pedido || "").trim();
  if (!pedidoId) return res.status(400).send("falta 'pedido'");

  // El pedido puede estar en cualquiera de las dos colecciones.
  let data = null;
  for (const col of ["pedidos", "pedidos_test"]) {
    const snap = await db.collection(col).doc(pedidoId).get();
    if (snap.exists) { data = snap.data(); break; }
  }
  if (!data) return res.status(404).send("pedido no encontrado");

  const img = data.comprobanteImagen;
  if (!img || !img.path) return res.status(404).send("ese pedido no tiene comprobante guardado");

  const file = admin.storage().bucket(STORAGE_BUCKET).file(img.path);
  const [existe] = await file.exists();
  if (!existe) return res.status(404).send("el archivo no está en Storage");

  res.setHeader("Content-Type", img.contentType || "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=3600");
  file.createReadStream()
    .on("error", (err) => { console.error("stream comprobante:", err); res.status(500).end(); })
    .pipe(res);
});
