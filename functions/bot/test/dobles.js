// Dobles para probar el backend del bot sin Firestore, Storage, Google ni n8n reales: se reemplazan
// firebase-admin, firebase-functions y axios antes de cargar ../ (bot/index.js).
"use strict";
const path = require("path");
const Module = require("module");

process.env.AGENT_API_KEY = "clave-test";
const KEY = { "X-Agent-Key": "clave-test" };

// Listas reales del panel (22/09/2026), tal cual las cargó el depósito.
const LISTAS = {
  preciosVapesTexto: "💰 LISTA VAPES PRECIOS - CLIENTES\n\n━━━━━━━━━━━━━\n\n✨ ELFBAR EB CREATE 40K\n🚀 Modelo económico\n💰 1x $22.000\n🔥 2x $40.000\n🎁 5x $90.000\n\n━━━━━━━━━━━━━\n\n⚡ ELFBAR DUKE 35K\n💨 35.000 puff\n🔥 Muchísimo sabor y excelente duración\n💰 1x $24.000\n🎁 2x $46.000\n\n━━━━━━━━━━━━━\n\n👑 ELFBAR ICE KING\n🧊 El más buscado\n💰 1x $26.000\n🔥 2x $49.000\n\n━━━━━━━━━━━━━\n\n💨 ELFBAR TE 30K\n⚡ 30.000 puff\n💰 1x $23.000\n\n━━━━━━━━━━━━━\n\n👾🆕 FLAVOR BEAST 50K\n⚡ 50.000 puff\n🔥 Sabores intensos y mucha duración\n💰 1x $27.000\n🔥 2x $51.000\n\n━━━━━━━━━━━━━\n\n🌌🆕 DINNER LADY GALAXY 60K\n🚀 60.000 puff\n🔥 De los modelos con mayor duración\n💰 1x $30.000\n🔥 2x $56.000\n\n━━━━━━━━━━━━━\n\n🔥 IGNITE V400\n💰 1x $27.000\n🔥 2x $51.000\n\n━━━━━━━━━━━━━\n\n🧪 IGNITE V400 MIX\n🧬 Doble gusto, variedad\n💰 1x $29.000\n🔥 2x $53.000",
  preciosThcTexto: "💰 LISTA PRECIOS THC - CLIENTES\n\n━━━━━━━━━━━━━━━\n\n💨 CÁPSULAS THC\n\n💎 CÁPSULAS 028 1ML — LAS MEJORES\n💭 Calidad premium\n🧪 Lab Tested\n💰 1x $45.000\n🎁 2x $85.000\n\n🍯 CÁPSULAS BLOW LIVE ROSIN 1.2ML\n🔥 De las más pedidas\n🌿 Live Rosin\n🔋 Compatible con baterías de rosca 510\n💰 1x $45.000\n🎁 2x $85.000\n\n💎 CÁPSULAS JEETER CONCENTRATES 1ML\n🔥 Calidad premium\n💨 Premium Diamonds Vape Cartridge\n🔋 Compatible con baterías de rosca 510\n💰 1x $50.000\n🎁 2x $90.000\n\n━━━━━━━━━━━━━━━\n\n🍬 BUZZ GUMMIES\n\n🎁 2x $25.000\n🔥 4x $44.000\n🚀 6x $60.000\n\n━━━━━━━━━━━━━━━\n\n💨 DESCARTABLES THC\n\n😠 DOZO LIVE ROSIN 2.5G — MUY PEDIDO 🔥\n💎 Live Rosin premium\n🌿 Excelente sabor y calidad\n💰 1x $60.000\n🎁 2x $110.000",
  perfumesTexto: "🕌 LISTA DE PRECIOS — PERFUMES ÁRABES\n\n✨ ECLAIRE — LATTAFA\n🍮 Cremoso, gourmand, vainilla y caramelo. Dulce y adictivo.\n💰 $75.000\n\n🔥 HONOR & GLORY — LATTAFA\n🍍 Ananá caramelizada + vainilla. Cremoso, distinto y adictivo.\n💰 $60.000\n\n❤️ BADE’E AL OUD SUBLIME — LATTAFA\n🍎 Frutal y dulce con fondo cálido. Moderno y atractivo.\n💰 $75.000\n\n🤎 KHAMRAH — LATTAFA\n🍮 Dulce especiado, vainilla y canela. Intenso, cálido e ideal para la noche.\n💰 $80.000\n\n━━━━━━━━━━━━━━━\n\n🌙 9PM — AFNAN\n🍏 Manzana + vainilla. Dulce, intenso y seductor para la noche.\n💰 $75.000\n\n🖤 9PM NIGHT OUT — AFNAN\n🌙 Dulce, ambarado y amaderado. Nocturno, seductor y elegante.\n💰 $75.000\n\n━━━━━━━━━━━━━━━\n\n💙 AMBER OUD AQUA DUBAI — AL HARAMAIN\n🌊 Fresco acuático, cítrico y premium. Sensación de recién bañado.\n💰 $75.000\n\n🤍 AMBER OUD WHITE EDITION — AL HARAMAIN\n🍐 Frutal, vainilla suave y almizcle. Limpio, dulce y elegante.\n💰 $75.000\n\n━━━━━━━━━━━━━━━\n\n💚 HAWAS TROPICAL — RASASI\n🍍 Frutas tropicales y frescura. Veraniego, juvenil y diferente.\n💰 $70.000\n\n🌊 HAWAS ATLANTIS — RASASI\n💰 $60.000\n\n🧊 HAWAS ICE — RASASI\n🌊 Acuático, frutal y fresco. Excelente para todos los días.\n💰 $60.000\n\n━━━━━━━━━━━━━━━\n\n🖤 CLUB DE NUIT URBAN MAN ELIXIR — ARMAF\n🍋 Fresco, especiado y amaderado. Masculino y versátil.\n💰 $75.000\n\n💙 ODYSSEY AQUA — ARMAF\n🌊 Fresco acuático y moderno. Limpio y súper versátil.\n💰 $60.000\n\n━━━━━━━━━━━━━━━\n\n🔥 VULCAN FEU BLUE EDITION\n🥭 Tropical, frutal y moderno. Fresco pero llamativo.\n💰 $70.000\n\n━━━━━━━━━━━━━━━\n\n📲 Consultanos y te recomendamos cuál elegir según la ocasión, el tipo de aroma que te guste y si lo buscás para día, noche, citas o uso diario.",
  appleTexto: "💰 LISTA DE PRECIOS – APPLE & ACCESORIOS 🍏\n\n✨ Calidad premium al mejor precio.\n\n━━━━━━━━━━━━━\n\n🎧 AIRPODS PRO GEN 3\n💎 Diseño más moderno\n🔊 Sonido premium\n🔇 Cancelación de ruido\n🎤 Excelente micrófono\n🔋 Gran autonomía\n\n💰 $30.000\n\n━━━━━━━━━━━━━\n\n🎧 EARPODS FOXCONN – USB-C 🆕\n🎵 Sonido nítido y potente\n🎙️ Micrófono integrado\n🔊 Control de volumen y reproducción\n📏 Cable de 1 metro\n⚡ Compatible con iPhone, iPad y MacBook USB-C\n\n💰 $25.000\n\n━━━━━━━━━━━━━\n\n🔌 CARGADORES APPLE – FOXCONN\n⚡ Calidad premium y carga rápida\n\n🔌 USB-C a Lightning → $13.000\n🔌 USB-C a USB-C → $13.500\n\n🔋 Adaptador 35W → $22.000 🆕\n🔋 Adaptador 40W → $24.000 🆕\n\n━━━━━━━━━━━━━\n\n🍏 APPLE ORIGINAL\n\n🔋 Adaptador 20W Original Apple\n💎 Producto 100% original y sellado\n⚡ Carga rápida\n\n💰 $65.000\n\n━━━━━━━━━━━━━\n\n🌸 BODY SPLASH VICTORIA’S SECRET ✨\n\n💎 Fragancias originales\n🌸 Aroma intenso y excelente duración\n\n🚨 PRECIO LIQUIDACIÓN\n\n💰 1x → $30.000\n🔥 2x → $50.000",
};

// ---------- Firestore en memoria ----------
const store = {};
let autoId = 1;
function docRef(col, id) {
  id = id || "id" + autoId++;
  const k = `${col}/${id}`;
  return {
    id,
    async get() { return { exists: k in store, data: () => store[k] && structuredClone(store[k]), id }; },
    async set(data) { store[k] = { ...data }; },
    async update(data) { if (!(k in store)) throw new Error("5 NOT_FOUND"); store[k] = { ...store[k], ...data }; }, // como Firestore: update no crea
  };
}
function colRef(col) {
  const filtros = [];
  return {
    doc: (id) => docRef(col, id),
    async add(data) { const id = "id" + autoId++; store[`${col}/${id}`] = { ...data }; return docRef(col, id); },
    where(campo, op, valor) { filtros.push({ campo, op, valor }); return this; },
    async get() {
      const docs = Object.keys(store)
        .filter((k) => k.startsWith(col + "/"))
        .map((k) => ({ id: k.slice(col.length + 1), data: () => store[k] }))
        .filter((d) => filtros.every(({ campo, op, valor }) =>
          op === "in" ? valor.includes(d.data()[campo]) : d.data()[campo] === valor));
      return { docs, size: docs.length };
    },
  };
}
const guardadoEnStorage = [];
let antesTransaccion = null;
let transacciones = Promise.resolve();
const runTransaction = (fn) => {
  const tarea = transacciones.then(async () => {
    if (antesTransaccion) { const hook = antesTransaccion; antesTransaccion = null; hook(); }
    const cambios = [];
    const resultado = await fn({ get: (ref) => ref.get(), set: (ref, data) => cambios.push(() => ref.set(data)) });
    for (const guardar of cambios) await guardar();
    return resultado;
  });
  transacciones = tarea.catch(() => {});
  return tarea;
};
const fakeAdmin = {
  apps: [{}],
  initializeApp() {},
  firestore: () => ({ collection: colRef, runTransaction }),
  storage: () => ({ bucket: () => ({ file: (p) => ({ save: async () => guardadoEnStorage.push(p) }) }) }),
};

// ---------- Google Geocoding y n8n ----------
const comp = (nombre, tipo, corto) => ({ long_name: nombre, short_name: corto || nombre, types: [tipo] });
const CABA = comp("Ciudad Autónoma de Buenos Aires", "administrative_area_level_1", "CABA");
const PBA = comp("Buenos Aires", "administrative_area_level_1");
const DIRECCIONES = {
  "Cabildo 2000, Belgrano": { lat: -34.5610, lng: -58.4560, c: [comp("Avenida Cabildo", "route"), comp("Belgrano", "neighborhood"), CABA] },
  "Florida 500, San Nicolás": { lat: -34.6010, lng: -58.3750, c: [comp("Florida", "route"), comp("San Nicolás", "neighborhood"), CABA] },
  "Mozart 3000, Villa Lugano": { lat: -34.6800, lng: -58.4700, c: [comp("Villa Lugano", "neighborhood"), CABA] },
  "Maipú 1000, Olivos": { lat: -34.5100, lng: -58.4900, c: [comp("Olivos", "locality"), comp("Vicente López", "administrative_area_level_2"), PBA] },
  "Centenario 500, San Isidro": { lat: -34.4700, lng: -58.5100, c: [comp("San Isidro", "locality"), comp("San Isidro", "administrative_area_level_2"), PBA] },
};
const paginasWeb = {};
const fakeAxios = {
  async get(url, opts) {
    // La web de 028 (028import.com): la arma cada test en paginasWeb.
    if (String(url).startsWith("https://028import.com")) {
      if (!(url in paginasWeb)) throw new Error("404 " + url);
      return { data: paginasWeb[url] };
    }
    if (url.includes("geocode")) {
      const d = DIRECCIONES[Object.keys(DIRECCIONES).find((k) => opts.params.address.startsWith(k))];
      return { data: { results: d ? [{ geometry: { location: { lat: d.lat, lng: d.lng } }, address_components: d.c }] : [] } };
    }
    return { headers: { "content-type": "image/jpeg" }, data: Buffer.from("foto") }; // descarga del comprobante
  },
  // Routes API: el backend le pregunta a Google los km REALES por calle para cobrar el envío de moto
  // con la misma vara con la que se le paga al motomensajero. Acá se responde con la línea recta por
  // 1,4 (el factor real medido sobre las entregas), para que las cuentas del test sean deterministas.
  async post(url, body) {
    if (String(url).includes("routes.googleapis.com")) {
      const o = body.origin.location.latLng, d = body.destination.location.latLng;
      const rad = (g) => (g * Math.PI) / 180;
      const h = Math.sin(rad(d.latitude - o.latitude) / 2) ** 2 +
        Math.cos(rad(o.latitude)) * Math.cos(rad(d.latitude)) * Math.sin(rad(d.longitude - o.longitude) / 2) ** 2;
      const km = 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.4;
      return { status: 200, data: { routes: [{ distanceMeters: Math.round(km * 1000) }] } };
    }
    throw new Error("POST inesperado en el test: " + url);
  },
};

function mockear(nombre, exp) {
  const dir = __dirname;
  const resuelto = Module._resolveFilename(nombre, { id: dir, filename: path.join(dir, "x.js"), paths: Module._nodeModulePaths(dir) });
  require.cache[resuelto] = { id: resuelto, filename: resuelto, loaded: true, exports: exp };
}
mockear("firebase-admin", fakeAdmin);
mockear("firebase-functions", { https: { onRequest: (h) => h } });
mockear("axios", fakeAxios);
mockear("firebase-functions/v2/scheduler", { onSchedule: (_opciones, h) => h });
const api = require("..");

// ---------- helpers ----------
function llamar(fn, { method = "GET", query = {}, body = {}, headers = KEY } = {}) {
  return new Promise((resolve) => {
    let status = 200;
    const res = {
      headersSent: false,
      status(c) { status = c; return this; },
      json(b) { resolve({ status, body: b }); },
      send(b) { resolve({ status, body: b }); },
      setHeader() {},
    };
    fn({ method, query, body, path: "/test", get: (h) => headers[h] }, res);
  });
}
// Como en el flujo real: si el pedido se paga antes, el comprobante ya quedó guardado al llegar
// (agentGuardarComprobante) con el importe del resumen, salvo que el test diga otro.
const { hashCorto: _hash, normalizarTelefono: _tel } = require('../texto');
// Los tests mueven el reloj hacia atrás y hacia adelante: un comprobante recién llegado tiene que quedar
// después de cualquier pedido anterior del mismo teléfono.
const LLEGO_RECIEN = "2999-01-01T00:00:00.000Z";
const pedido = async (extra) => {
  let salidaSeleccionada;
  if (!extra?.pedidoId && !Object.hasOwn(extra || {}, 'salidaSeleccionada') && (!extra?.tipoEnvio || extra.tipoEnvio === 'moto')) {
    const estado = await llamar(api.agentEstadoOperativo);
    salidaSeleccionada = estado.body.opcionesMoto[0];
  }
  const body = {
    telefono: '+5491158696086', cliente: 'Uma Bach', medioPago: 'transferencia', comprobanteUrl: 'https://chatwoot/x-' + (autoId++) + '.jpg',
    tipoEnvio: 'moto', direccion: { texto: 'Cabildo 2000, Belgrano', referencias: '3B' },
    items: [{ producto: 'Elfbar Ice King', variante: 'Peach', cantidad: 1 }], salidaSeleccionada, ...extra };
  // El comprobante lo guarda agentGuardarComprobante cuando llega; acá se simula ese guardado con
  // comprobanteUrl (el backend lo encuentra por la conversación, no por la URL). Si el pedido no lo
  // usó, se borra: cada llamada del test es una compra aparte.
  const clave = body.comprobanteUrl && 'comprobantes/cw-' + _hash(String(body.comprobanteUrl).trim());
  let creado = false;
  if (!body.preview && clave && !store[clave] && /transfer|mitad/.test(String(body.medioPago))) {
    const r = await llamar(api.agentPedido, { method: 'POST', body: { ...body, preview: true } });
    const esperado = /mitad/.test(String(body.medioPago)) ? Math.ceil((r.body.total || 0) / 2) : (r.body.saldoPendiente || r.body.total);
    store[clave] = { telefono: _tel(body.telefono), idConversacion: body.idConversacion, cuentaCobro: body.cuentaCobro || 'alias3',
      comprobante: { numero: body.comprobante?.numero || String(90000000 + autoId++), monto: body.comprobante?.monto ?? esperado },
      urlFuente: body.comprobanteUrl, createdAt: LLEGO_RECIEN, pedidoId: null };
    creado = true;
  }
  const respuesta = await llamar(api.agentPedido, { method: 'POST', body });
  if (creado && store[clave] && !store[clave].pedidoId) delete store[clave];
  return respuesta;
};
const resumen = (extra) => pedido({ preview: true, ...extra });

// Congela el reloj en una hora de Buenos Aires (UTC-3).
function conHora(isoBA, fn) {
  const RealDate = Date;
  const fijo = new RealDate(isoBA + "-03:00").getTime();
  global.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [fijo])); }
    static now() { return fijo; }
  };
  return Promise.resolve(fn()).finally(() => { global.Date = RealDate; });
}

const resultados = [];
const ok = (nombre, cond, detalle) => resultados.push({ nombre, ok: !!cond, detalle });

module.exports = {
  api, store, LISTAS, llamar, pedido, resumen, conHora, ok, resultados, guardadoEnStorage, hashCorto: _hash, LLEGO_RECIEN, paginasWeb,
  setAntesTransaccion(fn) { antesTransaccion = fn; },
  nuevoId: () => autoId++,
};
