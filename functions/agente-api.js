/**
 * agente-api.js — endpoints HTTP para el agente conversacional de IA (n8n).
 *
 * TODO ES ADITIVO. No modifica nada del sistema existente:
 *  - Solo LEE de `batches`, `pedidos`, `settings`.
 *  - ESCRIBE únicamente en `pedidos` (con los mismos campos que hoy + campos nuevos opcionales)
 *    y en colecciones nuevas: `clientes_bot`, `comprobantes_financiera`, `settings/operativo`.
 *  - No toca `sales`, la facturación, ni el parser de comandos del staff.
 *
 * Se engancha desde index.js con una sola línea al final:
 *    Object.assign(exports, require('./agente-api'));
 *
 * Endpoints (todos requieren header  X-Agent-Key: <AGENT_API_KEY>):
 *   GET  /agentStock?producto=&variante=
 *   GET  /agentCliente?telefono=
 *   GET  /agentCotizarEnvio?direccion=   (o  ?lat=&lng= )
 *   POST /agentPedido
 *   GET  /agentEstadoOperativo
 *
 * Contrato completo: ../AGENTE_API.md
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const AGENT_API_KEY = process.env.AGENT_API_KEY || "";
const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY || "";

// Depósito — mismas coordenadas que src/reparto/zonas.js (DEPOSITO_ORIGEN).
const DEPOSITO = { lat: -34.55359497285959, lng: -58.4523699884262 };
const TARIFA_POR_KM = 1000;
const MINIMO_ENVIO = 3000;

const ALIAS_FINANCIERA = "alias3";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de texto — copiados de index.js (no se importan para no acoplar).
// ─────────────────────────────────────────────────────────────────────────────
const normalizar = (texto) =>
  String(texto || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/ +/g, " ");

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
  const pu = userTxt.split(" ").filter(Boolean);
  const pb = bdTxt.split(" ").filter(Boolean);
  if (pu.length === 0) return false;
  for (const w of pu) {
    let ok = false;
    for (const x of pb) {
      if (w.length <= 2 ? w === x : similitud(w, x) >= 0.75) {
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
    const key = req.get("X-Agent-Key") || req.query.key;
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

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /agentStock?producto=&variante=
// ─────────────────────────────────────────────────────────────────────────────
exports.agentStock = withAuth(async (req, res) => {
  const pQ = normalizar(req.query.producto);
  const vQ = normalizar(req.query.variante);
  if (!pQ) return res.status(400).json({ ok: false, error: "falta 'producto'" });

  const snap = await db.collection("batches").orderBy("createdAt", "asc").get();

  // Acumula stock por (producto, variante) sumando todos los lotes vivos.
  const acc = new Map();
  for (const doc of snap.docs) {
    const b = doc.data();
    if (b.finalizedAt) continue;
    for (const item of b.items || []) {
      const prod = normalizar(item.product);
      const varr = normalizar(item.variant);
      if (!esParecido(pQ, prod)) continue;
      if (vQ && !esParecido(vQ, varr)) continue;
      const clave = `${item.product}||${item.variant}`;
      const prev = acc.get(clave) || { product: item.product, variant: item.variant, stock: 0 };
      prev.stock += Number(item.currentStock) || 0;
      acc.set(clave, prev);
    }
  }

  const matches = [...acc.values()].sort((a, b) => b.stock - a.stock);
  return res.json({
    ok: true,
    matches,
    totalStock: matches.reduce((s, m) => s + m.stock, 0),
  });
});

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

  if (isNaN(lat) || isNaN(lng)) {
    if (!texto) return res.status(400).json({ ok: false, error: "falta 'direccion' o 'lat'+'lng'" });
    if (!GOOGLE_MAPS_KEY) {
      return res.status(200).json({
        ok: true,
        needsManualQuote: true,
        mensaje: "sin geocoding configurado — cotizar el envío a mano",
      });
    }
    const geo = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
      params: {
        address: `${texto}, CABA, Argentina`,
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
  } else if (texto) {
    for (const w of texto.split(/[,\-]/)) {
      const z = BARRIO_A_ZONA[normalizar(w)];
      if (z) { zona = z; break; }
    }
  }

  const km = haversineKm(DEPOSITO, { lat, lng });
  const monto = aplicarTarifa(km);
  // Cobertura: dentro de ~18km del depósito y (si tenemos zona) que sea una conocida.
  const cubiertoMoto = km <= 18;

  return res.json({
    ok: true,
    encontrada: true,
    direccion: { texto, lat, lng, zona },
    zonaNombre: zona ? ZONA_NOMBRE[zona] : null,
    km: Math.round(km * 10) / 10,
    monto,
    cubiertoMoto,
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
  const tipoEnvio = ["moto", "uber", "retiro"].includes(b.tipoEnvio) ? b.tipoEnvio : null;
  if (!tipoEnvio) return res.status(400).json({ ok: false, error: "'tipoEnvio' debe ser moto|uber|retiro" });

  // Arma el texto del pedido — mismo formato que la "cotización" que pidió Lucio.
  const lineasItems = b.items.map(
    (it) => `• ${it.cantidad}x ${it.producto}${it.variante ? " - " + it.variante : ""}` +
      (it.precioUnitario ? ` ($${Number(it.precioUnitario).toLocaleString("es-AR")} c/u)` : "")
  );
  const subtotal = b.items.reduce(
    (s, it) => s + (Number(it.precioUnitario) || 0) * (Number(it.cantidad) || 0),
    0
  );
  const valorEnvio = Number(b.valorEnvio) || 0;
  const total = subtotal + valorEnvio;
  const dir = b.direccion || {};

  const mensaje = [
    "PRODUCTOS",
    ...lineasItems,
    "",
    `Subtotal: $${subtotal.toLocaleString("es-AR")}`,
    valorEnvio ? `Envío: $${valorEnvio.toLocaleString("es-AR")}` : null,
    `TOTAL: $${total.toLocaleString("es-AR")}`,
    "",
    `Entrega: ${tipoEnvio.toUpperCase()}`,
    dir.texto ? `Dirección: ${dir.texto}` : null,
    dir.referencias ? `Referencia: ${dir.referencias}` : null,
    "",
    `Cliente: ${b.cliente || "-"} — ${tel}`,
    b.medioPago ? `Pago: ${b.medioPago}` : null,
    b.notas ? `Nota: ${b.notas}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");

  // 1) Pedido — MISMOS campos base que hoy + estructurados nuevos.
  const pedidoRef = await db.collection("pedidos").add({
    mensaje,
    estado: "pendiente",
    tipoEnvio,
    createdAt: new Date().toISOString(),
    // nuevos (opcionales — no rompen nada que lea pedidos):
    origen: "agente-ia",
    telefono: tel,
    cliente: b.cliente || "",
    direccion: dir.texto
      ? {
          texto: dir.texto,
          lat: typeof dir.lat === "number" ? dir.lat : null,
          lng: typeof dir.lng === "number" ? dir.lng : null,
          zona: dir.zona || null,
          referencias: dir.referencias || null,
        }
      : null,
    valorEnvio,
    medioPago: b.medioPago || null,
    comprobante: b.comprobante || null,
    items: b.items,
  });

  // 2) clientes_bot — registra/incrementa.
  await db
    .collection("clientes_bot")
    .doc(tel)
    .set(
      {
        cantidadPedidos: admin.firestore.FieldValue.increment(1),
        ultimoPedido: new Date().toISOString(),
        primerContacto: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  // 3) ultimo_pedido_whatsapp — para que el "cancelar" por WhatsApp que ya existe siga andando.
  await db
    .collection("ultimo_pedido_whatsapp")
    .doc(tel)
    .set({ pedidoId: pedidoRef.id, createdAt: new Date().toISOString() });

  // 4) Alias financiera → registra el comprobante aparte (lo pidió Lucio explícito).
  if (b.medioPago === ALIAS_FINANCIERA && b.comprobante) {
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

exports.agentEstadoOperativo = withAuth(async (req, res) => {
  const doc = await db.collection("settings").doc("operativo").get();
  const d = doc.exists ? doc.data() : {};
  const situacion = SITUACIONES_VALIDAS.includes(d.situacion) ? d.situacion : "sin_demora";
  return res.json({
    ok: true,
    abierto: d.abierto !== false,
    situacion,                    // sin_demora | normal | demora | demora_fuerte | solo_manana
    proximaSalida: d.proximaSalida || null,
    actualizadoEn: d.actualizadoEn || null,
  });
});
