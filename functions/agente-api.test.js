// Test harness para agente-api.js SIN Firestore real ni emulador (no hace falta Java ni
// credenciales de Firebase). Mockea firebase-admin y firebase-functions inyectándolos en
// require.cache antes de cargar el módulo real, con un Firestore falso en memoria que soporta
// exactamente las llamadas que usa agente-api.js: collection().doc().get/set, collection().add,
// collection().where().get, collection().orderBy().get, runTransaction.
//
// Correr: node functions/agente-api.test.js
"use strict";
const path = require("path");
const Module = require("module");

const FUNCTIONS_DIR = __dirname;
process.env.AGENT_API_KEY = "test-local-key-12345";
delete process.env.GOOGLE_MAPS_KEY; // forzamos needsManualQuote en cotizar_envio

// ---------- Firestore falso en memoria ----------
const store = {}; // { "coleccion/doc": data }
function colKey(col) { return col; }
function docKey(col, id) { return `${col}/${id}`; }

function makeDocRef(col, id) {
  return {
    id,
    async get() {
      const data = store[docKey(col, id)];
      return { exists: data !== undefined, data: () => data, id };
    },
    async set(data, opts) {
      const k = docKey(col, id);
      if (opts && opts.merge && store[k]) {
        store[k] = applyFieldValues({ ...store[k] }, data);
      } else {
        store[k] = applyFieldValues({}, data);
      }
    },
    async update(data) {
      const k = docKey(col, id);
      store[k] = applyFieldValues({ ...(store[k] || {}) }, data);
    },
  };
}

function applyFieldValues(base, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && v.__fieldValue === "increment") {
      base[k] = (base[k] || 0) + v.n;
    } else if (v && v.__fieldValue === "serverTimestamp") {
      base[k] = new Date().toISOString();
    } else {
      base[k] = v;
    }
  }
  return base;
}

let autoId = 1000;
function makeCollectionRef(col) {
  return {
    doc(id) { return makeDocRef(col, id); },
    async add(data) {
      const id = "auto" + autoId++;
      store[docKey(col, id)] = applyFieldValues({}, data);
      return { id };
    },
    orderBy() { return this; },
    where(field, op, value) {
      this._filter = { field, op, value };
      return this;
    },
    async get() {
      const prefix = colKey(col) + "/";
      const docs = Object.entries(store)
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, data]) => ({ id: k.slice(prefix.length), data: () => data, ref: makeDocRef(col, k.slice(prefix.length)) }));
      let filtered = docs;
      if (this._filter) {
        const { field, op, value } = this._filter;
        filtered = docs.filter((d) => {
          const v = d.data()[field];
          if (op === "==") return v === value;
          return true;
        });
      }
      return { docs: filtered, size: filtered.length, empty: filtered.length === 0 };
    },
  };
}

const fakeDb = {
  collection(col) { return makeCollectionRef(col); },
  async runTransaction(fn) {
    const t = {
      async get(ref) { return ref.get(); },
      set(ref, data, opts) { ref.set(data, opts); },
      update(ref, data) { ref.update(data); },
    };
    return fn(t);
  },
};

const fakeAdmin = {
  apps: [{}],
  initializeApp() {},
  firestore() { return fakeDb; },
};
fakeAdmin.firestore.FieldValue = {
  increment: (n) => ({ __fieldValue: "increment", n }),
  serverTimestamp: () => ({ __fieldValue: "serverTimestamp" }),
};

const fakeFunctions = {
  https: {
    onRequest(handler) { return handler; }, // devolvemos el handler tal cual, invocable como fn(req,res)
  },
};

function injectMock(moduleName, exportsObj, fromDir) {
  const resolved = Module._resolveFilename(moduleName, { id: fromDir, filename: path.join(fromDir, "x.js"), paths: Module._nodeModulePaths(fromDir) });
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
}

injectMock("firebase-admin", fakeAdmin, FUNCTIONS_DIR);
injectMock("firebase-functions", fakeFunctions, FUNCTIONS_DIR);

const api = require(path.join(FUNCTIONS_DIR, "agente-api.js"));

// ---------- helper para simular req/res ----------
function callFn(fn, { method = "GET", query = {}, body = {}, headers = {} } = {}) {
  return new Promise((resolve) => {
    const req = {
      method,
      query,
      body,
      get(name) { return headers[name]; },
    };
    let statusCode = 200;
    const res = {
      status(code) { statusCode = code; return this; },
      json(obj) { resolve({ status: statusCode, body: obj }); },
      set() { return this; },
    };
    fn(req, res);
  });
}

const KEY = "test-local-key-12345";

async function main() {
  const results = [];
  const ok = (name, cond, extra) => results.push({ name, ok: !!cond, extra });

  // --- Seed: un batch de stock con productos reales ---
  await fakeDb.collection("batches").doc("b1").set({
    createdAt: "2026-09-01T00:00:00.000Z",
    items: [
      { id: "i1", product: "Elfbar Ice King", variant: "Blue Razz Ice", currentStock: 8, costArs: 10000 },
      { id: "i2", product: "Elfbar Ice King", variant: "Sour Apple Ice", currentStock: 0, costArs: 10000 },
      { id: "i3", product: "Capsulas 028 1ml", variant: "Mango Kush", currentStock: 5, costArs: 20000 },
    ],
  });
  await fakeDb.collection("batches").doc("b2-finalizado").set({
    createdAt: "2026-08-01T00:00:00.000Z",
    finalizedAt: "2026-08-15T00:00:00.000Z",
    items: [{ id: "iX", product: "Ghost 7g", variant: "Watermelon", currentStock: 99, costArs: 1 }],
  });

  // 1) agentStock — match normal
  {
    const r = await callFn(api.agentStock, { query: { producto: "elf bar ice king" }, headers: { "X-Agent-Key": KEY } });
    ok("agentStock: 'elf bar ice king' matchea Elfbar Ice King", r.status === 200 && r.body.ok && r.body.matches.length === 2, r.body);
  }
  // 2) agentStock — con variante sin stock -> stock 0
  {
    const r = await callFn(api.agentStock, { query: { producto: "elfbar ice king", variante: "sour apple" }, headers: { "X-Agent-Key": KEY } });
    ok("agentStock: variante sin stock devuelve 0, no error", r.status === 200 && r.body.matches[0]?.stock === 0, r.body);
  }
  // 3) agentStock — lote finalizado se ignora
  {
    const r = await callFn(api.agentStock, { query: { producto: "ghost" }, headers: { "X-Agent-Key": KEY } });
    ok("agentStock: batch finalizado se excluye (sin stock de Ghost)", r.status === 200 && r.body.totalStock === 0, r.body);
  }
  // 4) auth: sin header -> 401
  {
    const r = await callFn(api.agentStock, { query: { producto: "elfbar" }, headers: {} });
    ok("agentStock: sin X-Agent-Key -> 401", r.status === 401, r.body);
  }
  // 5) agentStock: falta producto -> 400
  {
    const r = await callFn(api.agentStock, { query: {}, headers: { "X-Agent-Key": KEY } });
    ok("agentStock: sin 'producto' -> 400", r.status === 400, r.body);
  }

  // 6) agentCliente — nuevo
  {
    const r = await callFn(api.agentCliente, { query: { telefono: "5491158696086" }, headers: { "X-Agent-Key": KEY } });
    ok("agentCliente: telefono nuevo -> nuevo=true", r.status === 200 && r.body.nuevo === true, r.body);
  }

  // 7) agentCotizarEnvio — sin GOOGLE_MAPS_KEY -> needsManualQuote
  {
    const r = await callFn(api.agentCotizarEnvio, { query: { direccion: "Cabildo 2500, Belgrano" }, headers: { "X-Agent-Key": KEY } });
    ok("agentCotizarEnvio: sin GOOGLE_MAPS_KEY -> needsManualQuote", r.status === 200 && r.body.needsManualQuote === true, r.body);
  }
  // 8) agentCotizarEnvio — con lat/lng (zona A, cerca del deposito)
  {
    const r = await callFn(api.agentCotizarEnvio, { query: { lat: "-34.5540", lng: "-58.4530" }, headers: { "X-Agent-Key": KEY } });
    ok("agentCotizarEnvio: lat/lng cerca del deposito -> cubiertoMoto=true, monto=minimo", r.status === 200 && r.body.cubiertoMoto === true && r.body.monto === 3000, r.body);
  }
  // 9) agentCotizarEnvio — lejos (La Plata aprox, ~50km)
  {
    const r = await callFn(api.agentCotizarEnvio, { query: { lat: "-34.92", lng: "-57.95" }, headers: { "X-Agent-Key": KEY } });
    ok("agentCotizarEnvio: lejos -> cubiertoMoto=false", r.status === 200 && r.body.cubiertoMoto === false, r.body);
  }

  // 10) agentEstadoOperativo — sin doc -> default sin_demora
  {
    const r = await callFn(api.agentEstadoOperativo, { headers: { "X-Agent-Key": KEY } });
    ok("agentEstadoOperativo: default sin_demora, sin campo 'abierto'", r.status === 200 && r.body.situacion === "sin_demora" && !("abierto" in r.body), r.body);
  }
  // 11) agentEstadoOperativo — con doc seteado
  {
    await fakeDb.collection("settings").doc("operativo").set({ situacion: "demora", proximaSalida: "16:00" });
    const r = await callFn(api.agentEstadoOperativo, { headers: { "X-Agent-Key": KEY } });
    ok("agentEstadoOperativo: lee situacion+proximaSalida seteadas", r.status === 200 && r.body.situacion === "demora" && r.body.proximaSalida === "16:00", r.body);
  }
  // 12) agentEstadoOperativo — situacion invalida -> fallback
  {
    await fakeDb.collection("settings").doc("operativo").set({ situacion: "algo_invalido" });
    const r = await callFn(api.agentEstadoOperativo, { headers: { "X-Agent-Key": KEY } });
    ok("agentEstadoOperativo: situacion invalida -> fallback sin_demora", r.status === 200 && r.body.situacion === "sin_demora", r.body);
  }

  // 13) agentPedido — pedido completo con alias3 (financiera) -> registra comprobante
  {
    const body = {
      telefono: "5491158696086",
      cliente: "Uma Bach",
      items: [{ producto: "Elfbar Ice King", variante: "Dragon Strawnana", cantidad: 1, precioUnitario: 26000 }],
      tipoEnvio: "moto",
      direccion: { texto: "Sanchez de Bustamante 1623", zona: "E", referencias: "3B timbre negro" },
      valorEnvio: 8000,
      medioPago: "alias3",
      comprobante: { numero: "0012345", monto: 34000, nombre: "Uma Bach" },
      origen: "publicidad",
    };
    const r = await callFn(api.agentPedido, { method: "POST", body, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: crea pedido ok", r.status === 200 && r.body.ok === true && !!r.body.pedidoId, r.body);
    ok("agentPedido: mensaje tiene formato de cotizacion (TOTAL A PAGAR)", r.body.mensaje?.includes("TOTAL A PAGAR") && r.body.mensaje?.includes("👤 CLIENTE"), r.body.mensaje);
    const cliente = await fakeDb.collection("clientes_bot").doc("5491158696086").get();
    ok("agentPedido: clientes_bot creado con cantidadPedidos=1 y origen=publicidad", cliente.data().cantidadPedidos === 1 && cliente.data().origen === "publicidad", cliente.data());
    const compSnap = await fakeDb.collection("comprobantes_financiera").get();
    ok("agentPedido: alias3 registra comprobante en comprobantes_financiera", compSnap.size === 1 && compSnap.docs[0].data().numero === "0012345", compSnap.docs.map(d=>d.data()));
  }
  // 14) agentPedido — segundo pedido del mismo telefono: incrementa, NO pisa origen ni primerContacto
  {
    const before = await fakeDb.collection("clientes_bot").doc("5491158696086").get();
    const primerContactoAntes = before.data().primerContacto;
    const body = {
      telefono: "5491158696086",
      cliente: "Uma Bach",
      items: [{ producto: "Capsulas 028 1ml", variante: "Mango Kush", cantidad: 1, precioUnitario: 45000 }],
      tipoEnvio: "retiro",
      valorEnvio: 0,
      medioPago: "efectivo",
      origen: null, // no viene de un anuncio esta vez -> no debe pisar el origen ya guardado
    };
    const r = await callFn(api.agentPedido, { method: "POST", body, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: 2do pedido ok", r.status === 200 && r.body.ok, r.body);
    const after = await fakeDb.collection("clientes_bot").doc("5491158696086").get();
    ok("agentPedido: cantidadPedidos incrementa a 2 (transaccion)", after.data().cantidadPedidos === 2, after.data());
    ok("agentPedido: origen='publicidad' NO se pisa con null", after.data().origen === "publicidad", after.data());
    ok("agentPedido: primerContacto NO cambia en el 2do pedido", after.data().primerContacto === primerContactoAntes, { antes: primerContactoAntes, despues: after.data().primerContacto });
  }
  // 15) agentPedido — validaciones: falta telefono, falta items, tipoEnvio invalido
  {
    let r = await callFn(api.agentPedido, { method: "POST", body: { items: [{}], tipoEnvio: "moto" }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: sin telefono -> 400", r.status === 400, r.body);
    r = await callFn(api.agentPedido, { method: "POST", body: { telefono: "1158696086", items: [], tipoEnvio: "moto" }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: items vacio -> 400", r.status === 400, r.body);
    r = await callFn(api.agentPedido, { method: "POST", body: { telefono: "1158696086", items: [{ producto: "x", cantidad: 1 }], tipoEnvio: "avion" }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: tipoEnvio invalido -> 400", r.status === 400, r.body);
  }
  // 16) normalizarTelefono: variantes de formato dan la misma clave en clientes_bot
  {
    const body1 = { telefono: "1158696086", items: [{ producto: "x", cantidad: 1, precioUnitario: 1 }], tipoEnvio: "retiro", valorEnvio: 0 };
    const body2 = { telefono: "541158696086", items: [{ producto: "x", cantidad: 1, precioUnitario: 1 }], tipoEnvio: "retiro", valorEnvio: 0 };
    await callFn(api.agentPedido, { method: "POST", body: body1, headers: { "X-Agent-Key": KEY } });
    await callFn(api.agentPedido, { method: "POST", body: body2, headers: { "X-Agent-Key": KEY } });
    const c = await fakeDb.collection("clientes_bot").doc("5491158696086").get();
    ok("normalizarTelefono: '1158696086' y '541158696086' -> mismo 5491158696086 (ahora 4 pedidos totales)", c.data().cantidadPedidos === 4, c.data());
  }

  // ---------- Reporte ----------
  console.log("\n=== RESULTADOS ===");
  let fails = 0;
  for (const r of results) {
    console.log((r.ok ? "OK   " : "FALLO") + " - " + r.name);
    if (!r.ok) { fails++; console.log("       detalle:", JSON.stringify(r.extra)); }
  }
  console.log(`\n${results.length - fails}/${results.length} pasaron.`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error("ERROR FATAL:", e); process.exit(1); });
