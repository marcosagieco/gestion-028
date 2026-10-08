// Tests de agente-api.js sin Firestore, Google ni n8n reales: se reemplazan firebase-admin,
// firebase-functions y axios por dobles en memoria antes de cargar el módulo.
//
// Correr: node functions/agente-api.test.js
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
    async update(data) { store[k] = { ...store[k], ...data }; },
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
const postsAN8n = [];
const fakeAxios = {
  async get(url, opts) {
    if (url.includes("geocode")) {
      const d = DIRECCIONES[Object.keys(DIRECCIONES).find((k) => opts.params.address.startsWith(k))];
      return { data: { results: d ? [{ geometry: { location: { lat: d.lat, lng: d.lng } }, address_components: d.c }] : [] } };
    }
    return { headers: { "content-type": "image/jpeg" }, data: Buffer.from("foto") }; // descarga del comprobante
  },
  async post(url, body) { postsAN8n.push({ url, body }); return { status: 200 }; },
};

function mockear(nombre, exp) {
  const dir = path.join(__dirname);
  const resuelto = Module._resolveFilename(nombre, { id: dir, filename: path.join(dir, "x.js"), paths: Module._nodeModulePaths(dir) });
  require.cache[resuelto] = { id: resuelto, filename: resuelto, loaded: true, exports: exp };
}
mockear("firebase-admin", fakeAdmin);
mockear("firebase-functions", { https: { onRequest: (h) => h } });
mockear("firebase-functions/v2/firestore", { onDocumentUpdated: (_ruta, h) => h });
mockear("axios", fakeAxios);
const api = require("./agente-api.js");

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
const pedido = async (extra) => {
  let salidaSeleccionada;
  if (!extra?.pedidoId && !Object.hasOwn(extra || {}, "salidaSeleccionada") && (!extra?.tipoEnvio || extra.tipoEnvio === "moto")) {
    const estado = await llamar(api.agentEstadoOperativo);
    salidaSeleccionada = estado.body.opcionesMoto[0];
  }
  return llamar(api.agentPedido, { method: "POST", body: {
  telefono: "+5491158696086", cliente: "Uma Bach", medioPago: "transferencia", comprobanteUrl: "https://chatwoot/x.jpg",
  tipoEnvio: "moto", direccion: { texto: "Cabildo 2000, Belgrano", referencias: "3B" },
  items: [{ producto: "Elfbar Ice King", variante: "Peach", cantidad: 1 }], salidaSeleccionada, ...extra } });
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

async function main() {
  store["settings/operativo"] = { ...LISTAS, aliasActivo: "alias3", situacion: "demora", proximaSalida: "16:00", limitePorTanda: 10 };

  // ── auth ──
  {
    const r = await llamar(api.agentEstadoOperativo, { headers: {} });
    ok("sin X-Agent-Key -> 401", r.status === 401, r.body);
  }

  // ── precios: las listas reales del panel ──
  const CASOS = [
    ["Elfbar Ice King", 3, 75000], ["Ignite V400", 1, 27000], ["Ignite V400 Mix", 1, 29000],
    ["Elfbar Duke", 2, 46000], ["Elfbar TE", 1, 23000], ["Elfbar EB Create", 6, 112000],
    ["Cápsulas 028", 1, 45000], ["Cápsulas Blow Live Rosin", 1, 45000], ["Jeeter", 2, 90000],
    ["Buzz Gummies", 4, 44000], ["Dozo Live Rosin", 1, 60000], ["Eclaire Lattafa", 1, 75000],
    ["Khamrah", 1, 80000], ["9PM Night Out", 1, 75000], ["AirPods Pro", 1, 30000],
    ["Body Splash Victoria's Secret", 2, 50000], ["Adaptador 35W", 1, 22000],
    ["Adaptador 20W Original Apple", 1, 65000], ["Cable USB-C a Lightning", 1, 13000], ["Hawas Ice", 1, 60000],
  ];
  for (const [producto, cantidad, esperado] of CASOS) {
    const r = await resumen({ tipoEnvio: "correo", datosCorreo: { aSucursal: true }, items: [{ producto, cantidad }] });
    ok(`precio: ${cantidad}x ${producto} = ${esperado}`, r.body.total === esperado, r.body);
  }
  {
    const r = await resumen({ tipoEnvio: "correo", datosCorreo: { aSucursal: true }, items: [{ producto: "Elfbar", cantidad: 1 }] });
    ok("precio: un nombre ambiguo no elige ninguno", r.status === 400 && /más de un producto/.test(r.body.error), r.body);
  }
  {
    const r = await resumen({ tipoEnvio: "correo", datosCorreo: { aSucursal: true }, items: [{ producto: "Buzz Gummies", cantidad: 3 }] });
    ok("precio: una cantidad que no se vende se rechaza", r.status === 400 && /2x, 4x, 6x/.test(r.body.error), r.body);
  }
  {
    const r = await resumen({ tipoEnvio: "correo", datosCorreo: { aSucursal: true }, items: [{ producto: "Vaper Fantasma", cantidad: 1, precioUnitario: 1 }] });
    ok("precio: un producto que no está en las listas no se carga (ni con el precio del agente)", r.status === 400 && /no encontré/.test(r.body.error), r.body);
  }
  {
    store["settings/operativo"].ofertasTexto = "✨ OFERTAS DE LA SEMANA\n\n🔥 ELFBAR ICE KING 2x $45.000";
    const r = await resumen({ tipoEnvio: "correo", datosCorreo: { aSucursal: true }, items: [{ producto: "Elfbar Ice King", cantidad: 3 }] });
    ok("ofertas: pisan el combo de la lista (2x 45.000 + 1x 26.000)", r.body.total === 71000, r.body);
    store["settings/operativo"].ofertasTexto = "";
  }

  // ── moto ──
  {
    const r = await resumen({ medioPago: "efectivo" });
    ok("moto: el envío lo calcula el backend (mínimo $3.000)", r.body.ok && /Envío: \$3\.000/.test(r.body.mensaje), r.body);
    ok("moto: efectivo en CABA descuenta 1.500 del subtotal", r.body.total === 26000 + 3000 - 1500, r.body);
    ok("moto: la zona sale de la dirección", /Zona A/.test(r.body.mensaje), r.body.mensaje);
  }
  {
    const r = await resumen({ direccion: { texto: "Cabildo", altura: "2000", barrio: "Belgrano", piso: "3 B", depto: "3 B", referencias: "timbre 3B" } });
    ok("moto: una dirección partida en campos se arma entera", r.body.ok && r.body.mensaje.includes("Cabildo 2000, Belgrano, piso 3 B") && r.body.mensaje.includes("Ref: timbre 3B"), r.body);
    const r2 = await resumen({ direccion: "Cabildo 2000, Belgrano" });
    ok("moto: la dirección también puede venir como texto", r2.body.ok && r2.body.mensaje.includes("Cabildo 2000, Belgrano"), r2.body);
  }
  {
    const r = await resumen({ direccion: { texto: "Florida 500, San Nicolás" } });
    ok("moto: una calle llamada Florida no es la localidad de Florida", r.body.ok && !/Zona B/.test(r.body.mensaje), r.body);
  }
  {
    const r = await resumen({ direccion: { texto: "Mozart 3000, Villa Lugano" }, medioPago: "efectivo" });
    ok("moto: un barrio de CABA fuera del mapa igual entra y admite efectivo", r.body.ok, r.body);
  }
  {
    const r = await resumen({ direccion: { texto: "Maipú 1000, Olivos" }, medioPago: "efectivo" });
    ok("moto: Corredor Norte también admite efectivo", r.body.ok && /Descuento por efectivo/.test(r.body.mensaje), r.body);
    const r2 = await resumen({ direccion: { texto: "Maipú 1000, Olivos" } });
    ok("moto: Corredor Norte con transferencia sí", r2.body.ok, r2.body);
  }
  {
    const r = await resumen({ direccion: { texto: "Centenario 500, San Isidro" } });
    ok("moto: fuera de CABA y del Corredor Norte no entra", r.status === 400 && /no entra en moto/.test(r.body.error), r.body);
    const r2 = await resumen({ direccion: { texto: "Calle Inventada 123" } });
    ok("moto: una dirección que Google no ubica se rechaza", r2.status === 400 && /no pude ubicar/.test(r2.body.error), r2.body);
  }
  {
    const r = await llamar(api.agentCotizarEnvio, { query: { direccion: "Maipú 1000, Olivos" } });
    ok("cotizar_envio: Olivos cubierto, con efectivo y con monto", r.body.cubiertoMoto && r.body.admiteEfectivo && r.body.monto >= 3000, r.body);
    const r2 = await llamar(api.agentCotizarEnvio, { query: { direccion: "Centenario 500, San Isidro" } });
    ok("cotizar_envio: San Isidro no cubierto y sin monto", r2.body.cubiertoMoto === false && r2.body.monto === null, r2.body);
    const r3 = await llamar(api.agentCotizarEnvio, { query: { direccion: "Calle Inventada 123" } });
    ok("cotizar_envio: dirección no encontrada", r3.body.ok && r3.body.encontrada === false, r3.body);
  }

  // ── descuento por efectivo: tramos sobre el subtotal, sin el envío ──
  for (const [items, off] of [
    [[{ producto: "Elfbar Ice King", cantidad: 1 }], 1500],
    [[{ producto: "Elfbar Ice King", cantidad: 1 }, { producto: "Elfbar Duke", cantidad: 1 }], 2500],
    [[{ producto: "Dozo Live Rosin", cantidad: 2 }], 5000],
    [[{ producto: "Elfbar Ice King", cantidad: 1 }, { producto: "Elfbar EB Create", cantidad: 1 }], 1500], // 48.000 + envío: el envío no lo sube de tramo
  ]) {
    const r = await resumen({ medioPago: "efectivo", items });
    ok(`efectivo: descuento de ${off}`, r.body.ok && r.body.mensaje.includes(`-$${off.toLocaleString("es-AR")}`), r.body);
  }

  // ── combos de baterías (lista propia del panel, con los nombres en minúscula) ──
  {
    const operativo = store["settings/operativo"];
    store["settings/operativo"] = { ...operativo, combosBateriasTexto: "\n\n🔥 COMBOS DISPONIBLES\n\n🖊️ Batería ELFTHC + Cápsula 028 1ML\n💰 $70.000\n\n⚡ Batería TORUS + Cápsula 028 1ML\n💰 $75.000\n\n━━━━━━━━━━━━━━━\n\n💨 Elegí tu batería y llevátela lista con Cápsula 028 1ML." };
    for (const [nombre, total] of [
      ["Batería ELFTHC + Cápsula 028 1ML", "70.000"],
      ["🖊️ Batería ELFTHC + Cápsula 028 1ML", "70.000"],
      ["BATERÍA ELFTHC + CÁPSULA 028", "70.000"],
      ["Batería TORUS + Cápsula 028 1ML", "75.000"],
    ]) {
      const r = await resumen({ medioPago: "transferencia", items: [{ producto: nombre, variante: "Pineapple Express", cantidad: 1 }] });
      ok(`combos: "${nombre}" sale $${total}`, r.body.ok && r.body.mensaje.includes(`$${total}`), r.body);
    }
    store["settings/operativo"] = operativo;
  }

  // ── uber ──
  {
    const r = await resumen({ tipoEnvio: "uber" });
    ok("uber: sin cotización del depósito no hay resumen", r.status === 400 && /cotizar_uber/.test(r.body.error), r.body);
    await llamar(api.agentCrearCotizacionUber, { method: "POST", body: { idConversacion: "77", telefonoCliente: "+54 9 11 5869-6086" } });
    const [idCot] = Object.keys(store).filter((k) => k.startsWith("cotizaciones_uber/"));
    ok("uber: la cotización guarda el teléfono normalizado", store[idCot].telefonoCliente === "5491158696086", store[idCot]);
    const rPend = await llamar(api.agentCrearCotizacionUber, { method: "POST", body: { idConversacion: "77b", telefonoCliente: "+54 9 11 5869-6086" } });
    ok("uber: si ya hay cotización pendiente no crea otra", rPend.body.yaPendiente && Object.keys(store).filter((k) => k.startsWith("cotizaciones_uber/")).length === 1, rPend.body);
    store[idCot] = { ...store[idCot], estado: "cotizado", montoUber: 8500, resueltoEn: new Date(Date.now() - 4 * 3600e3).toISOString() };
    const r2 = await resumen({ tipoEnvio: "uber" });
    ok("uber: una cotización de hace 4 hs ya no vale", r2.status === 400, r2.body);
    store[idCot].resueltoEn = new Date().toISOString();
    const rVig = await llamar(api.agentCrearCotizacionUber, { method: "POST", body: { idConversacion: "77c", telefonoCliente: "+54 9 11 5869-6086" } });
    ok("uber: si ya hay cotización reciente devuelve el monto y no recotiza", rVig.body.yaCotizado && rVig.body.montoUber === 8500 && /Usá ese monto/.test(rVig.body.mensaje), rVig.body);
    const rOld = await llamar(api.agentCrearCotizacionUber, { method: "POST", body: { idConversacion: "88", telefonoCliente: "+54 9 11 2222-3333", direccion: "Cabildo 2000, Belgrano" } });
    store[`cotizaciones_uber/${rOld.body.id}`].createdAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const rOld2 = await llamar(api.agentCrearCotizacionUber, { method: "POST", body: { idConversacion: "88b", telefonoCliente: "+54 9 11 2222-3333", direccion: "Cabildo 2000, Belgrano" } });
    ok("uber: después de 30 min permite recotizar la misma dirección", rOld2.body.ok && !rOld2.body.yaPendiente && rOld2.body.id !== rOld.body.id, rOld2.body);
    const rDir = await llamar(api.agentCrearCotizacionUber, { method: "POST", body: { idConversacion: "99", telefonoCliente: "+54 9 11 3333-4444", direccion: "Cabildo 2000, Belgrano" } });
    const rDir2 = await llamar(api.agentCrearCotizacionUber, { method: "POST", body: { idConversacion: "99b", telefonoCliente: "+54 9 11 3333-4444", direccion: "Lacroze 2542, Colegiales" } });
    ok("uber: si cambia la dirección permite una nueva cotización aunque sea reciente", rDir2.body.ok && !rDir2.body.yaPendiente && rDir2.body.id !== rDir.body.id, rDir2.body);
    // La misma dirección escrita distinto (casos reales del 6/10) no pide otra cotización.
    for (const [n, a, b] of [
      ["10", "Av. del Libertador 5930, Belgrano, CABA, esquina Juramento", "Av. del Libertador 5930, entre Juramento y Echeverría, Belgrano, CABA. Coordenadas: -34.557,-58.447"],
      ["11", "Defensa 649, entre Chile y México, San Telmo", "Defensa 649, San Telmo"],
      ["12", "YPF de Av. Balbín y Av. General Paz, ubicación: https://maps.google.com/?q=-34.55,-58.49", "YPF de Av. Balbín y General Paz"],
      ["13", "Av. 9 de Julio 1200, CABA", "Avenida 9 de Julio 1200"],
    ]) {
      await llamar(api.agentCrearCotizacionUber, { method: "POST", body: { idConversacion: n, telefonoCliente: `+54 9 11 4444-00${n}`, direccion: a } });
      const rMisma = await llamar(api.agentCrearCotizacionUber, { method: "POST", body: { idConversacion: n + "b", telefonoCliente: `+54 9 11 4444-00${n}`, direccion: b } });
      ok(`uber: "${b.slice(0, 30)}…" es la misma dirección`, rMisma.body.yaPendiente, rMisma.body);
    }
    const rOtra = await llamar(api.agentCrearCotizacionUber, { method: "POST", body: { idConversacion: "14b", telefonoCliente: "+54 9 11 4444-0013", direccion: "Avenida 9 de Julio 1500" } });
    ok("uber: otra altura de la misma calle es otra dirección", rOtra.body.ok && !rOtra.body.yaPendiente, rOtra.body);
    const r3 = await resumen({ tipoEnvio: "uber", envioSeguro: true });
    ok("uber: usa el monto que cargó el depósito + envío seguro", r3.body.total === 26000 + 8500 + 1990, r3.body);
    const r4 = await resumen({ tipoEnvio: "uber", medioPago: "efectivo" });
    ok("uber: nunca en efectivo", r4.status === 400, r4.body);
    const r5 = await conHora("2026-09-22T14:00:00", () => resumen({ tipoEnvio: "uber", horaSolicitada: "19:00" }));
    ok("uber: permite programar una salida futura dentro del horario", r5.body.ok && /19:00 \(horario pedido por el cliente\)/.test(r5.body.mensaje), r5.body);
    const r6 = await conHora("2026-09-22T14:00:00", () => resumen({ tipoEnvio: "uber", horaSolicitada: "13:00" }));
    ok("uber: rechaza una hora programada fuera del horario", r6.status === 400 && /13:30 y 20:00/.test(r6.body.error), r6.body);
    const r7 = await conHora("2026-09-22T20:00:00", () => resumen({ tipoEnvio: "uber", horaSolicitada: "20:00" }));
    ok("uber: a las 20:00 ya no permite programar para hoy", r7.status === 400 && /hoy ya no/.test(r7.body.error), r7.body);
    const r8 = await resumen({ tipoEnvio: "moto", horaSolicitada: "19:00" });
    ok("moto: no acepta la hora programada de Uber", r8.status === 400 && /solo se puede programar para Uber/.test(r8.body.error), r8.body);
    const r9 = await conHora("2026-09-22T14:00:00", () => pedido({ tipoEnvio: "uber", horaSolicitada: "19:00", comprobante: { numero: "19000001" } }));
    const p9 = store[`pedidos/${r9.body.pedidoId}`];
    ok("uber: el pedido guarda la hora solicitada y la modalidad", r9.body.ok && p9?.tipoEnvio === "uber" && p9?.horaSolicitada === "19:00", p9);
  }
  {
    const r = await resumen({ envioSeguro: true });
    ok("envío seguro: en moto se ignora", r.body.ok && !/Envío seguro/.test(r.body.mensaje), r.body);
  }

  // ── correo ──
  {
    const r = await resumen({ tipoEnvio: "correo", datosCorreo: { aSucursal: false } });
    ok("correo: el envío no se suma al total, se paga a Vía Cargo", r.body.total === 26000 && /\$29\.000, se le paga a Vía Cargo/.test(r.body.mensaje), r.body);
    ok("correo: no lleva hora de salida (no va en las tandas)", !/🕐/.test(r.body.mensaje), r.body.mensaje);
    const r2 = await resumen({ tipoEnvio: "correo", medioPago: "efectivo", datosCorreo: { aSucursal: true } });
    ok("correo: nunca en efectivo", r2.status === 400, r2.body);
    const r3 = await resumen({ tipoEnvio: "correo" });
    ok("correo: pide sucursal o domicilio", r3.status === 400 && /sucursal o a domicilio/.test(r3.body.error), r3.body);
    const r4 = await pedido({ tipoEnvio: "correo", datosCorreo: { aSucursal: true, dni: "30111222" } });
    ok("correo: sin localidad ni CP no se carga", r4.status === 400 && /localidad/.test(r4.body.error) && /código postal/.test(r4.body.error), r4.body);
    const r5 = await pedido({ tipoEnvio: "correo", direccion: { texto: "Córdoba 1500, Rosario" }, datosCorreo: { aSucursal: true, dni: "30111222", localidad: "Rosario", cp: "2000" } });
    const p5 = store[`pedidos/${r5.body.pedidoId}`];
    ok("correo: se carga en Retiro, con VÍA CARGO arriba para el depósito", r5.body.ok && p5.tipoEnvio === "retiro" && p5.mensaje.startsWith("📦 VÍA CARGO — SUCURSAL") && p5.datosCorreo.dni === "30111222", p5);
    ok("correo: al cliente le llega el resumen sin esa línea", !r5.body.mensaje.startsWith("📦 VÍA CARGO"), r5.body.mensaje);
  }

  // ── cargar el pedido ──
  {
    const r = await pedido({ comprobanteUrl: undefined });
    ok("pedido: por transferencia sin comprobante no se carga", r.status === 400 && /comprobante/.test(r.body.error), r.body);
    const r2 = await pedido({ cliente: "" });
    ok("pedido: sin nombre no se carga", r2.status === 400 && /a nombre de quién/.test(r2.body.error), r2.body);
  }
  {
    const r = await pedido({ comprobante: { numero: "0012345" } });
    const p = store[`pedidos/${r.body.pedidoId}`];
    ok("pedido: se carga pendiente con el total que vio el cliente", r.body.ok && p.estado === "pendiente" && p.total === 29000 && p.total === r.body.total, p);
    ok("pedido: guarda qué cuenta cobró (alias activo)", p.cuentaCobro === "alias3", p);
    ok("pedido: guarda la dirección con coordenadas y zona", p.direccion.zona === "A" && typeof p.direccion.lat === "number", p.direccion);
    ok("pedido: guarda la foto del comprobante en Storage", p.comprobanteImagen && guardadoEnStorage.some((f) => f.endsWith(`${r.body.pedidoId}.jpg`)), p.comprobanteImagen);
    ok("pedido: el mensaje del panel trae teléfono y comprobante", /Uma Bach — 5491158696086/.test(p.mensaje) && /Comprobante: 0012345/.test(p.mensaje), p.mensaje);
  }
  {
    const r = await pedido({ medioPago: "efectivo", comprobanteUrl: undefined });
    const p = store[`pedidos/${r.body.pedidoId}`];
    ok("pedido: en efectivo no pide comprobante ni asigna cuenta", r.body.ok && p.cuentaCobro === null, r.body);
  }
  {
    // Moto: al recibir (efectivo o transferencia cuando llega) y mitad y mitad.
    const r = await pedido({ medioPago: "al recibir", comprobanteUrl: undefined });
    const p = store[`pedidos/${r.body.pedidoId}`];
    ok("pedido: al recibir no pide comprobante, sin descuento ni cuenta", r.body.ok && p.cuentaCobro === null && p.montoDescuento === 0 && /al recibir \(efectivo o transferencia\)/.test(p.mensaje), r.body);
    const r2 = await pedido({ medioPago: "mitad y mitad", comprobanteUrl: undefined });
    ok("pedido: mitad y mitad pide el comprobante de la mitad", r2.status === 400 && /comprobante/.test(r2.body.error), r2.body);
    const r3 = await pedido({ medioPago: "mitad transferencia mitad efectivo" });
    const p3 = store[`pedidos/${r3.body.pedidoId}`];
    ok("pedido: mitad y mitad divide el total y asigna la cuenta, sin descuento",
      r3.body.ok && p3.montoDescuento === 0 && p3.montoTransferencia === Math.ceil(p3.total / 2) && p3.cuentaCobro === "alias3"
      && /A transferir ahora/.test(p3.mensaje) && /En efectivo al recibir/.test(p3.mensaje), p3);
    const r4 = await resumen({ tipoEnvio: "uber", medioPago: "al recibir" });
    ok("uber: nunca al recibir", r4.status === 400 && /solo por transferencia/.test(r4.body.error), r4.body);
    const r5 = await resumen({ tipoEnvio: "correo", medioPago: "mitad y mitad", datosCorreo: { aSucursal: true } });
    ok("correo: nunca mitad y mitad", r5.status === 400, r5.body);
  }
  {
    const guardados = Object.entries(store).filter(([k]) => k.startsWith("pedidos/"));
    for (const k of Object.keys(store)) if (k.startsWith("pedidos/")) delete store[k];
    const datos = {
      idConversacion: "485",
      idMensajeOrigen: "18106",
      comprobante: { numero: "182025450674" },
    };
    const r1 = await pedido(datos);
    const r2 = await pedido(datos);
    const pedidosGuardados = Object.keys(store).filter((k) => k.startsWith("pedidos/"));
    const p = store[`pedidos/${r1.body.pedidoId}`];
    ok("pedido: el mismo mensaje no crea duplicados", r1.body.ok && r2.body.reutilizado === true && r1.body.pedidoId === r2.body.pedidoId && pedidosGuardados.length === 1, { r1: r1.body, r2: r2.body });
    ok("pedido: guarda trazabilidad de Chatwoot", p.idConversacion === "485" && p.idMensajeOrigen === "18106" && p.origen === "bot_n8n" && p.schemaVersion === 3, p);

    const estadoPendiente = await llamar(api.agentEstadoOperativo, { query: { telefono: "+54 9 11 5869-6086" } });
    ok("estado: un pedido pendiente nunca figura en camino", estadoPendiente.body.pedidoActual?.estado === "pendiente" && /todavía no figura como despachado/.test(estadoPendiente.body.pedidoActual.descripcion) && !estadoPendiente.body.pedidoActual.puedeAfirmarEnCamino, estadoPendiente.body.pedidoActual);
    store[`pedidos/${r1.body.pedidoId}`].estado = "armado";
    // El reparto que le toca depende de la hora (15:30 o 18:30): se pone en la calle ese.
    store[`recorridos/${p.repartidor === "moto2" ? "activo_moto2" : "activo"}`] = { estado: "en_calle", salidaEn: new Date().toISOString() };
    const estadoEnCalle = await llamar(api.agentEstadoOperativo, { query: { telefono: "5491158696086" } });
    ok("estado: moto solo puede decir en camino si el reparto salió", estadoEnCalle.body.pedidoActual?.puedeAfirmarEnCamino === true && /reparto ya está en la calle/.test(estadoEnCalle.body.pedidoActual.descripcion), estadoEnCalle.body.pedidoActual);

    delete store["recorridos/activo"];
    for (const k of Object.keys(store)) if (k.startsWith("pedidos/")) delete store[k];
    for (const [k, v] of guardados) store[k] = v;
  }

  // ── combos por modelo, mezclando sabores ──
  {
    const r = await resumen({ items: [{ producto: "Elfbar EB Create", variante: "Golden Berry", cantidad: 1 }, { producto: "Elfbar EB Create", variante: "Pink Lemonade", cantidad: 1 }] });
    ok("combo: 2 EB Create de sabores distintos = 2x $40.000", r.body.ok && r.body.mensaje.includes("Subtotal: $40.000"), r.body.mensaje);
    const r2 = await resumen({ items: [{ producto: "Buzz Gummies", variante: "Sandía", cantidad: 1 }, { producto: "Buzz Gummies", variante: "Uva", cantidad: 1 }] });
    ok("combo: 1 + 1 gummies de sabores distintos arman el pack de 2", r2.body.ok && r2.body.mensaje.includes("Subtotal: $25.000"), r2.body);
    const r3 = await resumen({ items: [{ producto: "Elfbar Ice King", variante: "Peach", cantidad: 2 }, { producto: "Elfbar EB Create", variante: "Golden Berry", cantidad: 1 }] });
    ok("combo: modelos distintos no se mezclan", r3.body.ok && r3.body.mensaje.includes("Subtotal: $71.000"), r3.body.mensaje);
  }
  // ── preview: cotiza, pero no promete despacho hasta que el pedido quede cargado ──
  {
    const r = await conHora("2026-09-22T21:00:00", () => resumen());
    ok("preview: si no sale hoy lo avisa como condicional", r.body.ok && /^⚠️ OJO: SI CONFIRMÁS AHORA, SALE MAÑANA, 23\/09, A LAS/.test(r.body.mensaje), r.body.mensaje.slice(0, 100));
    const r2 = await conHora("2026-09-22T12:00:00", () => resumen());
    ok("preview: aclara que el pedido todavía no está registrado", r2.body.ok && /^⚠️ Todavía no está registrado para despacho/.test(r2.body.mensaje), r2.body.mensaje.slice(0, 120));
    ok("preview: la hora de salida queda condicionada a confirmar", /Si confirmás el pedido ahora, sale hoy, 22\/09, a las/.test(r2.body.mensaje) && !/🕐 Sale hoy/.test(r2.body.mensaje), r2.body.mensaje);
    const r3 = await conHora("2026-09-22T12:00:00", () => pedido({ comprobante: { numero: "0099999" } }));
    ok("pedido cargado: con comprobante sí promete salida", r3.body.ok && /🕐 Sale hoy, 22\/09, a las/.test(r3.body.mensaje), r3.body.mensaje);
  }

  // ── stock: se vende solo lo que está en las listas de stock del panel ──
  {
    const operativo = { ...store["settings/operativo"] };
    store["settings/operativo"] = { ...operativo,
      stockNicotinaTexto: "STOCK ACTUALIZADO VAPES\n\n⸻\n\n👑 ELFBAR ICE KING 40K\n\nPeach 🍑 (3)\nStrawberry Ice 🍓🧊 (0)\n\n⸻\n\n⚡ IGNITE V400 40K\n\nStrawberry Kiwi 🍓🥝 (5)\nStrawberry 🍓 (1)",
      stockThcTexto: "🔥 STOCK COMPLETO THC\n\n━━━━━━━━━━━━━━━\n\n💨 DESCARTABLES THC\n\n😠 DOZO LIVE ROSIN 2.5G\nAir Headz → ⚡ Sativa\n\n━━━━━━━━━━━━━━━\n\n🆕🍬 BUZZ GUMMIES THC" };
    const conStock = (item) => resumen({ items: [item] });
    const r1 = await conStock({ producto: "Elfbar Ice King", variante: "Peach", cantidad: 2 });
    ok("stock: con stock se vende", r1.body.ok, r1.body);
    const r2 = await conStock({ producto: "Elfbar Ice King", variante: "Peach", cantidad: 4 });
    ok("stock: no vende más de lo que hay", r2.status === 400 && /hay solo 3/.test(r2.body.error), r2.body);
    const r3 = await conStock({ producto: "Elfbar Ice King", variante: "Strawberry Ice", cantidad: 1 });
    ok("stock: un sabor en (0) no se vende", r3.status === 400 && /no hay stock/.test(r3.body.error), r3.body);
    const r4 = await conStock({ producto: "Elfbar Duke", variante: "Grape Ice", cantidad: 1 });
    ok("stock: un modelo que no está en el stock no se vende", r4.status === 400 && /no hay stock de ELFBAR DUKE/.test(r4.body.error), r4.body);
    const r5 = await conStock({ producto: "Cápsulas 028", variante: "", cantidad: 1 });
    ok("stock: cápsulas sin stock de THC no se venden", r5.status === 400 && /no hay stock/.test(r5.body.error), r5.body);
    const r6 = await conStock({ producto: "Dozo Live Rosin", variante: "Air Headz", cantidad: 1 });
    ok("stock: el Dozo (título pegado a la sección en precios) sí se vende", r6.body.ok, r6.body);
    const r7 = await conStock({ producto: "Buzz Gummies", variante: "", cantidad: 2 });
    ok("stock: un modelo sin sabores listados se vende", r7.body.ok, r7.body);
    const r8 = await conStock({ producto: "Ignite V400", variante: "Strawberry", cantidad: 2 });
    ok("stock: toma el sabor exacto (Strawberry, no Strawberry Kiwi)", r8.status === 400 && /hay solo 1/.test(r8.body.error), r8.body);
    const r9 = await conStock({ producto: "Eclaire Lattafa", variante: "", cantidad: 1 });
    ok("stock: los perfumes no tienen lista de stock y se venden", r9.body.ok, r9.body);
    store["settings/operativo"] = operativo;
  }

  // ── estado operativo ──
  {
    const guardados = Object.entries(store).filter(([k]) => k.startsWith("pedidos/"));
    for (const k of Object.keys(store)) if (k.startsWith("pedidos/")) delete store[k];
    store["settings/operativo"] = { ...store["settings/operativo"], situacion: "demora" };
    const r = await conHora("2026-09-22T15:00:00", () => llamar(api.agentEstadoOperativo));
    ok("estado: manda el alias activo, nunca otro", r.body.plantillas.ALIAS.includes("CALMO.DURO.DIA") && r.body.plantillas.ALIAS.includes("CBU: 0000598201000000015014") && !/028import\.gal?2?/.test(r.body.plantillas.ALIAS), r.body.plantillas.ALIAS);
    ok("estado: manda las listas del panel", r.body.plantillas.PRECIOS_VAPES === LISTAS.preciosVapesTexto.trim(), null);
    ok("estado: demora del día y tandas independientes", /2 hs/.test(r.body.demora) && r.body.salidasMoto[0].hora === "15:30", r.body);
    ok("estado: manda comunidad y regla de Secpaynet", /COMUNIDAD 028 IMPORT/.test(r.body.plantillas.COMUNIDAD) && /Secpaynet/.test(r.body.plantillas.COMPROBANTES_VALIDOS), r.body.plantillas);
    const aliasGuardado = store["settings/operativo"].aliasActivo;
    for (const [alias, titular, cbu] of [
      ["alias1", "Lucio Felix Bunge", "0070194130004014092980"],
      ["alias2", "Marcos Agustin Gieco", "0070181130004057764295"],
      ["alias3", "Tame Lake S.A.", "0000598201000000015014"],
    ]) {
      store["settings/operativo"].aliasActivo = alias;
      const estado = await llamar(api.agentEstadoOperativo);
      const regla = estado.body.plantillas.COMPROBANTES_VALIDOS;
      ok(`comprobantes: ${alias} identifica su titular, CBU y cuenta activa`, regla.includes(titular) && regla.includes(cbu) && regla.includes(`Cuenta activa para una venta nueva (${alias})`) && regla.includes(estado.body.plantillas.ALIAS) && regla.includes("$5000"), regla);
    }
    store["settings/operativo"].aliasActivo = "desconocido";
    const fallback = await llamar(api.agentEstadoOperativo);
    ok("comprobantes: alias inválido usa Galicia tanto en pago como en validación", fallback.body.plantillas.ALIAS.includes("Lucio Felix Bunge") && fallback.body.plantillas.COMPROBANTES_VALIDOS.includes("Cuenta activa para una venta nueva (alias1)"), fallback.body.plantillas);
    store["settings/operativo"].aliasActivo = aliasGuardado;

    const cola = async (n, extra = {}) => {
      for (const k of Object.keys(store)) if (k.startsWith("pedidos/")) delete store[k];
      for (let i = 0; i < n; i++) store[`pedidos/demora${i}`] = { estado: "pendiente", tipoEnvio: "moto" };
      store["settings/operativo"] = { ...store["settings/operativo"], situacion: "sin_demora", ...extra };
      return (await conHora("2026-09-22T15:00:00", () => llamar(api.agentEstadoOperativo))).body.demora;
    };
    ok("estado: con 5 pedidos la demora sube a 2 hs", /2 hs/.test(await cola(5)), null);
    ok("estado: con 8 pedidos la demora sube a 2:30 hs", /2:30 hs/.test(await cola(8)), null);
    ok("estado: con 11 pedidos la demora sube a más de 3 hs", /más de 3 hs/.test(await cola(11)), null);
    ok("estado: solo mañana le gana a la demora automática", /sale mañana/.test(await cola(11, { situacion: "solo_manana" })), null);
    for (const k of Object.keys(store)) if (k.startsWith("pedidos/")) delete store[k];
    for (const [k, v] of guardados) store[k] = v;
    store["settings/operativo"] = { ...store["settings/operativo"], situacion: "demora" };
  }

  // ── salida: en qué tanda sale un pedido nuevo ──
  {
    // Depende de cuántos pedidos de moto/Uber hay sin completar: la cola se arma a mano.
    const guardados = Object.entries(store).filter(([k]) => k.startsWith("pedidos/"));
    const operativo = { ...store["settings/operativo"] };
    const salidaCon = async (hora, enCola, extra = {}, campo = "salidaUber") => {
      extra = { diasSinDespacho: ["2026-09-27"], ...extra }; // el domingo 27/9 cargado en el panel
      for (const k of Object.keys(store)) if (k.startsWith("pedidos/")) delete store[k];
      for (let i = 0; i < enCola; i++) store[`pedidos/cola${i}`] = { estado: "pendiente", tipoEnvio: i % 3 ? "moto" : "uber" };
      for (let i = 0; i < 30; i++) store[`pedidos/armado${i}`] = { estado: "armado", tipoEnvio: "uber" }; // ya salieron: no ocupan lugar
      store["pedidos/unRetiro"] = { estado: "pendiente", tipoEnvio: "retiro" }; // retiro y correo no ocupan tanda
      store["settings/operativo"] = { ...operativo, proximaSalida: "", ...extra };
      const x = await conHora(hora, () => llamar(api.agentEstadoOperativo));
      return `${x.body[campo].dia} ${x.body[campo].hora}`;
    };
    const casos = [
      ["martes 04:00: hoy en la primera tanda", "2026-09-22T04:00:00", 0, "hoy 13:30"],
      ["miércoles 04:00: hoy 14:00", "2026-09-23T04:00:00", 0, "hoy 14:00"],
      ["domingo 04:00: hoy 17:00", "2026-10-04T04:00:00", 0, "hoy 17:00"],
      ["domingo 17:10: también cada 30 min", "2026-10-04T17:10:00", 0, "hoy 17:30"],
      ["16:50 con 9 en cola: entra en la de las 17:00", "2026-09-22T16:50:00", 9, "hoy 17:00"],
      ["16:50 con 10 en cola: tanda llena, sale 17:30", "2026-09-22T16:50:00", 10, "hoy 17:30"],
      ["16:50 con 25 en cola: dos tandas llenas, sale 18:00", "2026-09-22T16:50:00", 25, "hoy 18:00"],
      ["19:59: todavía entra en la de las 20:00", "2026-09-22T19:59:00", 0, "hoy 20:00"],
      ["20:00: ya sale mañana", "2026-09-22T20:00:00", 0, "mañana 14:00"],
      ["martes 21:00: mañana miércoles 14:00", "2026-09-22T21:00:00", 0, "mañana 14:00"],
      ["sábado 22:00: mañana domingo 17:00", "2026-10-03T22:00:00", 0, "mañana 17:00"],
      ["19:40 con 30 en cola: hoy no entra, mañana en la tercera", "2026-09-22T19:40:00", 30, "mañana 15:00"],
      ["domingo 27/9 sin despacho: sábado 22:00 sale el lunes", "2026-09-26T22:00:00", 0, "el lunes 13:30"],
      ["domingo 27/9 sin despacho: el domingo al mediodía sale mañana (lunes)", "2026-09-27T12:00:00", 0, "mañana 13:30"],
      ["sábado 26/9 a la tarde sale hoy igual", "2026-09-26T15:10:00", 0, "hoy 15:30"],
    ];
    for (const [nombre, hora, enCola, esperado] of casos) {
      const s = await salidaCon(hora, enCola);
      ok("salida: " + nombre, s === esperado, s);
    }
    const d1 = await salidaCon("2026-09-26T22:00:00", 0, { diasSinDespacho: [] });
    ok("salida: sin días cargados en el panel, el domingo sale normal", d1 === "mañana 17:00", d1);
    const d2 = await salidaCon("2026-09-26T22:00:00", 0, { diasSinDespacho: ["2026-09-27", "2026-09-28"] });
    ok("salida: dos días seguidos sin despacho, sale el martes", d2 === "el martes 13:30", d2);
    const d3 = await salidaCon("2026-09-26T22:00:00", 0, { diasSinDespacho: ["27/9", 5, null] });
    ok("salida: fechas mal cargadas se ignoran", d3 === "mañana 17:00", d3);
    const d4 = await salidaCon("2026-09-27T12:00:00", 0, { salidasMoto: { primera: "16:00", segunda: "19:00" } }, "salida");
    ok("moto: un dia sin despacho respeta las nuevas tandas del panel", d4 === "mañana 16:00", d4);
    const s1 = await salidaCon("2026-09-22T15:00:00", 0, { situacion: "solo_manana" });
    ok("salida: si el panel dice que hoy no sale más, mañana", s1 === "mañana 14:00", s1);
    const s2 = await salidaCon("2026-09-22T16:50:00", 3, { limitePorTanda: 3 });
    ok("salida: usa el límite por tanda del panel", s2 === "hoy 17:30", s2);

    // La moto ofrece solo dos salidas y nunca una tanda a la hora exacta o anterior.
    const panel = [
      ["antes de primera", "2026-10-06T09:00:00", "hoy 15:30"],
      ["a las 15:30 solo segunda", "2026-10-06T15:30:00", "hoy 18:30"],
      ["a las 18:30 manana", "2026-10-06T18:30:00", "mañana 15:30"],
      ["cierre20 manana", "2026-10-06T20:00:00", "mañana 15:30"],
      ["solo manana prevalece", "2026-10-06T09:00:00", "mañana 15:30", { situacion: "solo_manana" }],
      ["horarios editados", "2026-10-06T16:00:00", "hoy 19:00", { salidasMoto: { primera: "16:00", segunda: "19:00" } }],
    ];
    for (const [nombre, hora, esperado, extra] of panel) {
      const s = await salidaCon(hora, 0, extra, "salida");
      ok("moto: " + nombre, s === esperado, s);
    }
    // La próxima salida es de la moto: el Uber sigue saliendo por tandas (con su cupo).
    const u1 = await salidaCon("2026-09-22T16:50:00", 0, { proximaSalida: "18:00" }, "salidaUber");
    ok("salida: el Uber no usa la próxima salida de moto", u1 === "hoy 17:00", u1);
    const u2 = await salidaCon("2026-09-22T16:50:00", 10, { proximaSalida: "18:00" }, "salidaUber");
    ok("salida: el Uber respeta el cupo de la tanda", u2 === "hoy 17:30", u2);
    const u3 = await salidaCon("2026-09-22T20:00:00", 0, {}, "salidaUber");
    ok("salida: el Uber desde las 20:00 sale mañana", u3 === "mañana 14:00", u3);

    for (const k of Object.keys(store)) if (k.startsWith("pedidos/")) delete store[k];
    for (const [k, v] of guardados) store[k] = v;
    store["settings/operativo"] = operativo; // tiene próxima salida 16:00
    const r = await conHora("2026-09-22T04:00:00", () => pedido({ comprobante: { numero: "0098765" } }));
    ok("salida: el pedido guarda fecha y hora de primera tanda", /🕐 Sale hoy, 22\/09, a las 15:30/.test(r.body.mensaje) && store[`pedidos/${r.body.pedidoId}`].fechaSalida === "2026-09-22", r.body);
  }

  // ── cotización de Uber confirmada en el panel ──
  {
    const [idCot] = Object.keys(store).filter((k) => k.startsWith("cotizaciones_uber/"));
    const ref = { update: async (d) => { store[idCot] = { ...store[idCot], ...d }; } };
    const evento = (antes, despues) => ({ params: { id: idCot }, data: { before: { data: () => antes }, after: { data: () => despues, ref } } });
    await api.onCotizacionUberConfirmada(evento({ estado: "pendiente" }, { estado: "cotizado", idConversacion: "77", montoUber: 8500 }));
    ok("uber confirmado: avisa a n8n con la conversación y el monto", postsAN8n.length === 1 && postsAN8n[0].body.montoUber === 8500 && postsAN8n[0].body.idConversacion === "77", postsAN8n);
    ok("uber confirmado: queda procesado", store[idCot].estado === "procesado", store[idCot]);
    await api.onCotizacionUberConfirmada(evento({ estado: "cotizado" }, { estado: "procesado" }));
    ok("uber confirmado: no vuelve a avisar", postsAN8n.length === 1, postsAN8n);
    await api.onCotizacionUberConfirmada(evento({ estado: "pendiente" }, { estado: "no_llegamos", idConversacion: "78", noLlegamos: true }));
    ok("uber no llegamos: avisa a n8n sin monto", postsAN8n.length === 2 && postsAN8n[1].body.noLlegamos === true && postsAN8n[1].body.idConversacion === "78" && !("montoUber" in postsAN8n[1].body), postsAN8n);
    ok("uber no llegamos: queda procesado", store[idCot].estado === "procesado", store[idCot]);
  }

  // ── comprobante ──
  {
    const r = await llamar(api.serveComprobante, { query: {} });
    ok("serveComprobante: sin pedido -> 404", r.status === 404, r.body);
  }

  // Reglas nuevas: pagos, mayorista, tandas elegidas y modificacion atomica.
  await conHora("2026-10-06T09:00:00", async () => {
    for (const k of Object.keys(store)) if (k.startsWith("pedidos/")) delete store[k];
    store["settings/operativo"] = { ...LISTAS, aliasActivo: "alias1", limitePorTanda: 10,
      preciosMayoristaTexto: "LISTA MAYORISTA\nELFBAR ICE KING\n10x → 14 USD c/u\n20x → 13 USD c/u\n50x → 12 USD c/u\n100x → 11,5 USD c/u\n⸻\nELFBAR DUKE 35K\n10x → 14 USD c/u\n20x → 13 USD c/u\n⸻\nDINNER LADY GALAXY 60K — PRE PAGO\n5x → 15 USD c/u\n10x → 14 USD c/u", dolarMayorista: 1500,
      combosBateriasTexto: "Combo capsula y bateria", combosBateriasTitulo: "Combos" };
    const selection = { fecha: "2026-10-06", tandaId: "segunda", hora: "18:30" };
    const r = await pedido({ medioPago: "al recibir", comprobanteUrl: undefined, salidaSeleccionada: selection });
    const guardado = store[`pedidos/${r.body.pedidoId}`];
    ok("tandas: guarda segunda elegida, fecha y hora en detalle", r.body.ok && guardado.fechaSalida === selection.fecha && guardado.tandaSalida === "segunda" && guardado.horaSalida === "18:30" && /06\/10, a las 18:30/.test(guardado.mensaje), r.body);
    ok("tandas: segunda se asigna al reparto moto2", guardado.repartidor === "moto2", guardado.repartidor);
    guardado.estado = "armado";
    store["recorridos/activo"] = { estado: "en_calle" };
    store["recorridos/activo_moto2"] = { estado: "preparando" };
    const primeraEnCalle = await llamar(api.agentEstadoOperativo, { query: { telefono: "5491158696086" } });
    ok("estado: primera moto en calle no despacha pedidos de segunda", !primeraEnCalle.body.pedidoActual.puedeAfirmarEnCamino, primeraEnCalle.body.pedidoActual);
    store["recorridos/activo_moto2"].estado = "en_calle";
    const segundaEnCalle = await llamar(api.agentEstadoOperativo, { query: { telefono: "5491158696086" } });
    ok("estado: segunda en calle informa solo su recorrido", segundaEnCalle.body.pedidoActual.puedeAfirmarEnCamino, segundaEnCalle.body.pedidoActual);
    guardado.estado = "pendiente";
    const sinEleccion = await pedido({ medioPago: "al recibir", salidaSeleccionada: undefined });
    ok("tandas: exige elegir antes de cargar moto", sinEleccion.status === 400 && sinEleccion.body.opcionesMoto?.length, sinEleccion.body);
    const invalida = await pedido({ salidaSeleccionada: { fecha: "2026-02-30", tandaId: "primera" } });
    ok("tandas: rechaza fechas inexistentes", invalida.status === 400, invalida.body);
    const pasada = await conHora("2026-10-06T15:30:00", () => pedido({ salidaSeleccionada: { fecha: "2026-10-06", tandaId: "primera" } }));
    ok("tandas: exacta hora no permite cargar primera", pasada.status === 400, pasada.body);
    const manana = await pedido({ medioPago: "al recibir", salidaSeleccionada: { fecha: "2026-10-07", tandaId: "primera" } });
    ok("tandas: cliente puede elegir manana aun con salidas hoy", manana.body.ok && /07\/10, a las 15:30/.test(manana.body.mensaje), manana.body);
    const movidaPanel = await llamar(api.agentEstadoOperativo);
    ok("panel: combos y baterias disponibles como plantilla", movidaPanel.body.plantillas.COMBOS_BATERIAS === "Combo capsula y bateria" && movidaPanel.body.combosBateriasTitulo === "Combos", movidaPanel.body);
    ok("panel: entrega informa dos horarios actualizados", /15:30 y 18:30/.test(movidaPanel.body.plantillas.FORMAS_DE_ENTREGA), movidaPanel.body.plantillas.FORMAS_DE_ENTREGA);

    for (const delta of [-5001, -5000, 0, 5000, 5001]) {
      const pago = await pedido({ comprobante: { numero: `delta-${delta}`, monto: 29000 + delta } });
      ok(`pagos: diferencia ${delta} ${Math.abs(delta) > 5000 ? "deriva" : "acepta"}`, Math.abs(delta) > 5000 ? pago.status === 400 && pago.body.derivar : pago.body.ok, pago.body);
    }
    for (const cantidad of [0, -1, 1.5, "abc"]) {
      const inv = await resumen({ items: [{ producto: "Elfbar Ice King", cantidad }] });
      ok(`cantidad invalida ${cantidad} no se registra`, inv.status === 400, inv.body);
    }
    for (const [cantidad, unidad] of [[10, 14], [20, 13], [50, 12], [100, 11.5], [101, 11.5]]) {
      const cot = await resumen({ mayorista: true, tipoEnvio: "correo", datosCorreo: { aSucursal: true }, items: [{ producto: "Elfbar Ice King", cantidad }] });
      ok(`mayorista: ${cantidad} usa USD ${unidad}, sin derivar por volumen`, cot.body.ok && cot.body.total === cantidad * unidad * 1500 && cot.body.mensaje.includes(`USD ${unidad} c/u`), cot.body);
    }
    const mezclado = await resumen({ mayorista: true, tipoEnvio: "correo", datosCorreo: { aSucursal: true }, items: [{ producto: "Elfbar Ice King", cantidad: 5, variante: "Peach" }, { producto: "Elfbar Ice King", cantidad: 5, variante: "Miami Mint" }] });
    ok("mayorista: agrega sabores del mismo modelo para el tramo", mezclado.body.total === 210000, mezclado.body);
    const menor = await resumen({ mayorista: true, items: [{ producto: "Elfbar Ice King", cantidad: 9 }] });
    ok("mayorista: menos de diez no aplica", menor.status === 400, menor.body);
    const prePago = await resumen({ mayorista: true, medioPago: "al recibir", items: [{ producto: "Dinner Lady Galaxy", cantidad: 10 }] });
    ok("mayorista: respeta pre pago de lista", prePago.status === 400 && /pre pago/.test(prePago.body.error), prePago.body);
    const correo = await pedido({ mayorista: true, tipoEnvio: "correo", direccion: "Cordoba 1500, Rosario", datosCorreo: { aSucursal: true, dni: "30111222", localidad: "Rosario", cp: "2000" }, items: [{ producto: "Elfbar Ice King", cantidad: 10 }], comprobante: { numero: "wholesale-1", monto: 210000 } });
    const pc = store[`pedidos/${correo.body.pedidoId}`];
    ok("mayorista correo: entrega Via Cargo, traslado interno moto primera", correo.body.ok && pc.tipoEnvio === "moto" && pc.entregaCliente === "correo" && pc.despachoInterno === "moto_a_via_cargo" && pc.tandaSalida === "primera" && pc.fechaSalida === "2026-10-06" && pc.total === 210000 && /No es la entrega al cliente/.test(pc.mensaje), correo.body);
    delete store["settings/operativo"].dolarMayorista;
    const usd = await resumen({ mayorista: true, items: [{ producto: "Elfbar Ice King", cantidad: 10 }] });
    ok("mayorista: sin dolar solo cotiza USD, no inventa pesos", usd.body.necesitaTipoCambio && usd.body.subtotalUSD === 140 && usd.body.total === undefined, usd.body);
    const sinDolar = await pedido({ mayorista: true, items: [{ producto: "Elfbar Ice King", cantidad: 10 }] });
    ok("mayorista: sin dolar no carga ni cobra", sinDolar.status === 400 && /dolar/.test(sinDolar.body.error), sinDolar.body);
    store["settings/operativo"].dolarMayorista = 1500;

    const modificar = (body) => llamar(api.agentPedido, { method: "POST", body: { pedidoId: r.body.pedidoId, telefono: "5491158696086", idConversacion: "777", idMensajeOrigen: "mod-1", ...body } });
    const count = () => Object.keys(store).filter((k) => k.startsWith("pedidos/")).length;
    const antes = count();
    const vista = await modificar({ preview: true, direccion: { texto: "Florida 500, San Nicolás", referencias: "guardia" } });
    ok("modificacion preview: no toca deposito", vista.body.ok && store[`pedidos/${r.body.pedidoId}`].direccion.texto === guardado.direccion.texto, vista.body);
    const editado = await modificar({ direccion: { texto: "Florida 500, San Nicolás", referencias: "guardia" } });
    const pe = store[`pedidos/${r.body.pedidoId}`];
    ok("modifica mismo pedido sin duplicar ni cambiar tanda", editado.body.ok && editado.body.modificado && count() === antes && pe.direccion.texto === "Florida 500, San Nicolás" && pe.tandaSalida === "segunda" && pe.createdAt === guardado.createdAt, editado.body);
    const repetido = await modificar({ direccion: "Florida 500, San Nicolás" });
    ok("modificacion repetida es idempotente", repetido.body.reutilizado && count() === antes, repetido.body);
    const otro = await modificar({ telefono: "5491100000000", idMensajeOrigen: "mod-2" });
    ok("no modifica pedidos de otro telefono", otro.status === 403 && count() === antes, otro.body);
    store["settings/operativo"].stockNicotinaTexto = "STOCK\nIGNITE V400\nPeach (1)";
    const ref = await modificar({ direccion: { referencias: "Timbre 5" }, idMensajeOrigen: "mod-ref" });
    ok("solo referencia conserva direccion y permite producto sin stock actual", ref.body.ok && store[`pedidos/${r.body.pedidoId}`].direccion.texto === "Florida 500, San Nicolás" && store[`pedidos/${r.body.pedidoId}`].direccion.referencias === "Timbre 5", ref.body);
    delete store["settings/operativo"].stockNicotinaTexto;
    const agregar = await modificar({ idMensajeOrigen: "mod-3", items: [{ producto: "Elfbar Ice King", cantidad: 2, variante: "Peach" }] });
    ok("agrega productos al mismo pedido al recibir", agregar.body.ok && count() === antes && store[`pedidos/${r.body.pedidoId}`].items[0].cantidad === 2, agregar.body);
    antesTransaccion = () => { store[`pedidos/${r.body.pedidoId}`].estado = "armado"; };
    const carrera = await modificar({ idMensajeOrigen: "mod-4", direccion: "Cabildo 2000, Belgrano" });
    ok("si deposito arma durante cambio, bloquea y deriva", carrera.status === 409 && carrera.body.derivar && store[`pedidos/${r.body.pedidoId}`].direccion.texto !== "Cabildo 2000, Belgrano" && count() === antes, carrera.body);
    const armado = await modificar({ idMensajeOrigen: "mod-5" });
    ok("pedido armado deriva sin duplicado", armado.status === 409 && armado.body.motivo === "modificar_pedido_armado", armado.body);
    const pagado = await pedido({ comprobante: { numero: "pago-base", monto: 29000 } });
    const cambios = { pedidoId: pagado.body.pedidoId, telefono: "5491158696086", items: [{ producto: "Elfbar Ice King", cantidad: 2, variante: "Peach" }] };
    const extra = await llamar(api.agentPedido, { method: "POST", body: cambios });
    ok("agregar a pagado pide diferencia antes de guardar", extra.status === 400 && extra.body.requierePago && !extra.body.derivar && store[`pedidos/${pagado.body.pedidoId}`].items[0].cantidad === 1, extra.body);
    const fotoOriginal = store[`pedidos/${pagado.body.pedidoId}`].comprobanteImagen;
    const saldo = await llamar(api.agentPedido, { method: "POST", body: { ...cambios, idMensajeOrigen: "saldo-1", comprobanteAdicional: { numero: "pago-saldo", monto: 23000 }, comprobanteUrl: "https://chatwoot/saldo.jpg" } });
    ok("pago adicional permite actualizar sin duplicar", saldo.body.ok && store[`pedidos/${pagado.body.pedidoId}`].montoPagado === 52000 && store[`pedidos/${pagado.body.pedidoId}`].comprobantesAdicionales.length === 1, saldo.body);
    ok("pago adicional conserva foto original y guarda segunda aparte", store[`pedidos/${pagado.body.pedidoId}`].comprobanteImagen.path === fotoOriginal.path && store[`pedidos/${pagado.body.pedidoId}`].comprobantesAdicionales[0].imagen.path !== fotoOriginal.path, store[`pedidos/${pagado.body.pedidoId}`].comprobantesAdicionales);
    const saldoRetry = await llamar(api.agentPedido, { method: "POST", body: { ...cambios, idMensajeOrigen: "saldo-1", comprobanteAdicional: { numero: "pago-saldo", monto: 23000 } } });
    ok("reintento no suma pago adicional dos veces", saldoRetry.body.reutilizado && store[`pedidos/${pagado.body.pedidoId}`].montoPagado === 52000, saldoRetry.body);

    for (const k of Object.keys(store)) if (k.startsWith("pedidos/")) delete store[k];
    store["settings/operativo"].limitePorTanda = 1;
    const primera = { fecha: "2026-10-06", tandaId: "primera", hora: "15:30" };
    const concurrentes = await Promise.all([pedido({ idConversacion: "800", idMensajeOrigen: "8001", medioPago: "al recibir", salidaSeleccionada: primera }), pedido({ idConversacion: "801", idMensajeOrigen: "8002", medioPago: "al recibir", salidaSeleccionada: primera })]);
    ok("cupo: dos altas concurrentes no sobrellenan la tanda", concurrentes.filter((x) => x.body.ok).length === 1 && count() === 1, concurrentes);
    const e = await llamar(api.agentEstadoOperativo);
    ok("cupo: primera llena ofrece segunda del mismo dia", e.body.salida.tandaId === "segunda", e.body.salida);
    const inicial = concurrentes.find((x) => x.body.ok);
    const retry = await conHora("2026-10-06T20:30:00", () => pedido({ idConversacion: "800", idMensajeOrigen: "8001", medioPago: "al recibir", salidaSeleccionada: primera }));
    ok("reintento despues de salida devuelve pedido existente", retry.body.reutilizado && retry.body.pedidoId === inicial.body.pedidoId && count() === 1, retry.body);
  });

  const fallas = resultados.filter((r) => !r.ok);
  for (const r of resultados) console.log(`${r.ok ? "OK  " : "FALLA"} - ${r.nombre}${r.ok ? "" : "\n        " + JSON.stringify(r.detalle).slice(0, 600)}`);
  console.log(`\n${resultados.length - fallas.length}/${resultados.length} pasaron.`);
  process.exit(fallas.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
