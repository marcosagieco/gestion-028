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

  // 1) auth: sin header -> 401 (cubre el wrapper withAuth de todos los endpoints)
  {
    const r = await callFn(api.agentCliente, { query: { telefono: "5491158696086" }, headers: {} });
    ok("withAuth: sin X-Agent-Key -> 401", r.status === 401, r.body);
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
    ok("agentEstadoOperativo: sin doc -> aliasActivo default alias1", r.body.aliasActivo === "alias1", r.body);
  }
  // 11) agentEstadoOperativo — con doc seteado
  {
    await fakeDb.collection("settings").doc("operativo").set({ situacion: "demora", proximaSalida: "16:00", aliasActivo: "alias2" });
    const r = await callFn(api.agentEstadoOperativo, { headers: { "X-Agent-Key": KEY } });
    ok("agentEstadoOperativo: lee situacion+proximaSalida seteadas", r.status === 200 && r.body.situacion === "demora" && r.body.proximaSalida === "16:00", r.body);
    ok("agentEstadoOperativo: lee aliasActivo seteado", r.body.aliasActivo === "alias2", r.body);
  }
  // 12) agentEstadoOperativo — situacion/alias invalidos -> fallback
  {
    await fakeDb.collection("settings").doc("operativo").set({ situacion: "algo_invalido", aliasActivo: "alias99" });
    const r = await callFn(api.agentEstadoOperativo, { headers: { "X-Agent-Key": KEY } });
    ok("agentEstadoOperativo: situacion invalida -> fallback sin_demora", r.status === 200 && r.body.situacion === "sin_demora", r.body);
    ok("agentEstadoOperativo: aliasActivo invalido -> fallback alias1", r.body.aliasActivo === "alias1", r.body);
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
    const base = { items: [{ producto: "x", cantidad: 1, precioUnitario: 1 }], tipoEnvio: "retiro", valorEnvio: 0, cliente: "Uma Bach", medioPago: "efectivo" };
    const body1 = { ...base, telefono: "1158696086" };
    const body2 = { ...base, telefono: "541158696086" };
    await callFn(api.agentPedido, { method: "POST", body: body1, headers: { "X-Agent-Key": KEY } });
    await callFn(api.agentPedido, { method: "POST", body: body2, headers: { "X-Agent-Key": KEY } });
    const c = await fakeDb.collection("clientes_bot").doc("5491158696086").get();
    ok("normalizarTelefono: '1158696086' y '541158696086' -> mismo 5491158696086 (ahora 4 pedidos totales)", c.data().cantidadPedidos === 4, c.data());
  }

  // 17) agentPedido — datos obligatorios segun tipoEnvio y medioPago
  {
    const base = {
      telefono: "5491158696086",
      cliente: "Uma Bach",
      items: [{ producto: "Elfbar Ice King", cantidad: 1, precioUnitario: 26000 }],
      valorEnvio: 8000,
    };
    const dir = { texto: "Sanchez de Bustamante 1623", zona: "E" };
    const comp = { numero: "0012345", monto: 34000 };

    // moto sin direccion -> 400, y el error nombra lo que falta (el agente lo lee y lo pide)
    let r = await callFn(api.agentPedido, { method: "POST", body: { ...base, tipoEnvio: "moto", medioPago: "transferencia", comprobante: comp }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: moto sin direccion -> 400", r.status === 400 && /direcci/i.test(r.body.error || ""), r.body);

    // uber sin direccion -> 400 (uber tambien entrega a domicilio)
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, tipoEnvio: "uber", medioPago: "transferencia", comprobante: comp }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: uber sin direccion -> 400", r.status === 400, r.body);

    // retiro sin direccion -> OK, es el unico que no la necesita
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, tipoEnvio: "retiro", valorEnvio: 0, medioPago: "efectivo" }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: retiro sin direccion -> 200", r.status === 200 && r.body.ok, r.body);

    // transferencia sin comprobante -> 400
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, tipoEnvio: "moto", direccion: dir, medioPago: "transferencia" }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: transferencia sin comprobante -> 400", r.status === 400 && /comprobante/i.test(r.body.error || ""), r.body);

    // efectivo contra entrega en moto: NO necesita comprobante
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, tipoEnvio: "moto", direccion: dir, medioPago: "efectivo" }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: moto + efectivo sin comprobante -> 200", r.status === 200 && r.body.ok, r.body);

    // uber en efectivo -> 400, el flash es siempre transferencia previa
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, tipoEnvio: "uber", direccion: dir, medioPago: "efectivo" }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: uber + efectivo -> 400", r.status === 400 && /transferencia/i.test(r.body.error || ""), r.body);

    // sin medioPago y sin cliente -> 400
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, cliente: "", tipoEnvio: "moto", direccion: dir }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: sin cliente ni medioPago -> 400", r.status === 400 && /cliente/i.test(r.body.error || ""), r.body);

    // preview: corre ANTES del pago, no exige nada de esto y no escribe nada
    const pedidosAntes = (await fakeDb.collection("pedidos").get()).size;
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, tipoEnvio: "moto", preview: true }, headers: { "X-Agent-Key": KEY } });
    const pedidosDespues = (await fakeDb.collection("pedidos").get()).size;
    ok("agentPedido: preview sin direccion ni pago -> 200 y no escribe", r.status === 200 && r.body.preview === true && pedidosAntes === pedidosDespues, r.body);
  }

  // 18) agentPedido — el efectivo contra entrega se revalida contra la zona
  {
    const base = {
      telefono: "5491158696086",
      cliente: "Uma Bach",
      items: [{ producto: "Elfbar Ice King", cantidad: 1, precioUnitario: 26000 }],
      tipoEnvio: "moto",
      valorEnvio: 8000,
      medioPago: "efectivo",
    };

    // zona B = Corredor Norte, no es CABA -> no admite efectivo
    let r = await callFn(api.agentPedido, { method: "POST", body: { ...base, direccion: { texto: "Av. Maipu 2500, Olivos", zona: "B" } }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: moto + efectivo en zona B -> 400", r.status === 400 && /efectivo/i.test(r.body.error || ""), r.body);

    // sin zona y con un barrio que no esta en el mapa: no sabemos si es CABA -> tampoco
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, direccion: { texto: "Calle Falsa 123, Quilmes" } }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: moto + efectivo sin zona reconocible -> 400", r.status === 400, r.body);

    // sin zona explicita pero el barrio del texto si esta en el mapa -> se resuelve y pasa
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, direccion: { texto: "Av. Cabildo 2100, Belgrano" } }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: moto + efectivo con barrio CABA en el texto -> 200", r.status === 200 && r.body.ok, r.body);
  }

  // 19) agentPedido — el cobro por la financiera lo decide el alias activo, no el medioPago
  {
    await fakeDb.collection("settings").doc("operativo").set({ aliasActivo: "alias3" });
    const antes = (await fakeDb.collection("comprobantes_financiera").get()).size;
    const body = {
      telefono: "5491158696086",
      cliente: "Uma Bach",
      items: [{ producto: "Elfbar Ice King", cantidad: 1, precioUnitario: 26000 }],
      tipoEnvio: "moto",
      direccion: { texto: "Sanchez de Bustamante 1623", zona: "E" },
      valorEnvio: 8000,
      medioPago: "transferencia", // lo que manda el agente de verdad, NUNCA "alias3"
      comprobante: { numero: "0099887", monto: 34000, nombre: "Uma Bach" },
    };
    const r = await callFn(api.agentPedido, { method: "POST", body, headers: { "X-Agent-Key": KEY } });
    const despues = await fakeDb.collection("comprobantes_financiera").get();
    ok("agentPedido: aliasActivo=alias3 + medioPago='transferencia' registra el comprobante", r.status === 200 && despues.size === antes + 1, { antes, despues: despues.size, body: r.body });
    ok("agentPedido: el comprobante registrado es el del pedido", despues.docs.some((d) => d.data().numero === "0099887"), despues.docs.map((d) => d.data()));

    // con el alias comun NO se registra nada aparte
    await fakeDb.collection("settings").doc("operativo").set({ aliasActivo: "alias1" });
    const antes2 = (await fakeDb.collection("comprobantes_financiera").get()).size;
    await callFn(api.agentPedido, { method: "POST", body: { ...body, comprobante: { numero: "0011111", monto: 34000 } }, headers: { "X-Agent-Key": KEY } });
    const despues2 = (await fakeDb.collection("comprobantes_financiera").get()).size;
    ok("agentPedido: aliasActivo=alias1 NO registra en comprobantes_financiera", despues2 === antes2, { antes2, despues2 });
  }

  // 20) agentPedido — envio por correo
  {
    const base = {
      telefono: "5491158696086",
      cliente: "Uma Bach",
      items: [{ producto: "Elfbar Ice King", cantidad: 1, precioUnitario: 26000 }],
      tipoEnvio: "correo",
      direccion: { texto: "Belgrano 123, Rosario" },
      valorEnvio: 19000,
      medioPago: "contra reembolso",
    };
    const datos = { dni: "30111222", localidad: "Rosario", cp: "2000" };

    // correo completo -> 200 (y NO exige comprobante: se abona al recibir)
    let r = await callFn(api.agentPedido, { method: "POST", body: { ...base, datosCorreo: datos }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: correo con DNI/localidad/CP -> 200", r.status === 200 && r.body.ok, r.body);
    ok("agentPedido: el mensaje al deposito muestra el DNI y el CP", /DNI: 30111222/.test(r.body.mensaje || "") && /Rosario \(CP 2000\)/.test(r.body.mensaje || ""), r.body.mensaje);
    ok("agentPedido: la etiqueta de envio dice Correo", /Correo \(Cargo\)/.test(r.body.mensaje || ""), r.body.mensaje);

    // correo sin los datos del correo -> 400, nombrando lo que falta
    r = await callFn(api.agentPedido, { method: "POST", body: base, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: correo sin DNI/localidad/CP -> 400", r.status === 400 && /DNI/.test(r.body.error || ""), r.body);

    // correo sin direccion -> 400 (igual que moto y uber)
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, direccion: undefined, datosCorreo: datos }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: correo sin direccion -> 400", r.status === 400, r.body);

    // el doc guardado tiene datosCorreo
    const snap = await fakeDb.collection("pedidos").get();
    const ultimoCorreo = snap.docs.map((d) => d.data()).filter((d) => d.tipoEnvio === "correo").pop();
    ok("agentPedido: el pedido guarda datosCorreo", !!ultimoCorreo && ultimoCorreo.datosCorreo && ultimoCorreo.datosCorreo.cp === "2000", ultimoCorreo && ultimoCorreo.datosCorreo);

    // en un pedido que no es correo, datosCorreo queda null
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, tipoEnvio: "moto", direccion: { texto: "Av. Cabildo 2100, Belgrano", zona: "A" }, medioPago: "efectivo" }, headers: { "X-Agent-Key": KEY } });
    const snap2 = await fakeDb.collection("pedidos").get();
    const ultimoMoto = snap2.docs.map((d) => d.data()).filter((d) => d.tipoEnvio === "moto").pop();
    ok("agentPedido: en un pedido de moto datosCorreo es null", r.status === 200 && ultimoMoto.datosCorreo === null, ultimoMoto && ultimoMoto.datosCorreo);
  }

  // 21) agentPedido — envio seguro (solo flash, monto fijo resuelto por el backend)
  {
    const base = {
      telefono: "5491158696086",
      cliente: "Uma Bach",
      items: [{ producto: "Elfbar Ice King", cantidad: 1, precioUnitario: 26000 }],
      direccion: { texto: "Av. Cabildo 2100, Belgrano", zona: "A" },
      valorEnvio: 8000,
      medioPago: "alias1",
      comprobante: { numero: "0012345" },
    };

    // uber + envioSeguro -> suma 1990 al total y aparece en el resumen
    let r = await callFn(api.agentPedido, { method: "POST", body: { ...base, tipoEnvio: "uber", envioSeguro: true, preview: true }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: envio seguro suma 1990 al total", r.status === 200 && r.body.total === 26000 + 8000 + 1990, { total: r.body.total });
    ok("agentPedido: el resumen muestra la linea de envio seguro", /Envío seguro/.test(r.body.mensaje || "") && /\$1\.990/.test(r.body.mensaje || ""), r.body.mensaje);
    ok("agentPedido: la entrega queda marcada CON ENVIO SEGURO", /CON ENVÍO SEGURO/.test(r.body.mensaje || ""), r.body.mensaje);

    // el mismo pedido sin envio seguro no lo cobra
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, tipoEnvio: "uber", preview: true }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: sin envio seguro el total no lo incluye", r.status === 200 && r.body.total === 26000 + 8000 && r.body.envioSeguro === false, { total: r.body.total });

    // moto con envioSeguro -> se ignora, es solo para flash
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, tipoEnvio: "moto", envioSeguro: true, preview: true }, headers: { "X-Agent-Key": KEY } });
    ok("agentPedido: en moto el envio seguro se ignora", r.status === 200 && r.body.envioSeguro === false && r.body.total === 26000 + 8000, { total: r.body.total, envioSeguro: r.body.envioSeguro });

    // queda guardado en el pedido real
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, tipoEnvio: "uber", envioSeguro: true }, headers: { "X-Agent-Key": KEY } });
    const snap = await fakeDb.collection("pedidos").get();
    const ultimo = snap.docs.map((d) => d.data()).filter((d) => d.envioSeguro === true).pop();
    ok("agentPedido: el pedido guarda envioSeguro y su monto", r.status === 200 && !!ultimo && ultimo.montoEnvioSeguro === 1990, ultimo && { envioSeguro: ultimo.envioSeguro, monto: ultimo.montoEnvioSeguro });
  }

  // 22) agentPedido — descuento por pagar en efectivo (tramos sobre el SUBTOTAL, sin envio)
  {
    const base = {
      telefono: "5491158696086",
      cliente: "Uma Bach",
      tipoEnvio: "moto",
      direccion: { texto: "Av. Cabildo 2100, Belgrano", zona: "A" },
      valorEnvio: 8000,
      preview: true,
    };
    const item = (precio) => [{ producto: "Producto suelto de prueba", cantidad: 1, precioUnitario: precio }];

    // menos de 50.000 -> 1.500 off
    let r = await callFn(api.agentPedido, { method: "POST", body: { ...base, items: item(30000), medioPago: "efectivo" }, headers: { "X-Agent-Key": KEY } });
    ok("descuento efectivo: subtotal 30.000 -> 1.500 off", r.body.montoDescuento === 1500 && r.body.total === 30000 + 8000 - 1500, { desc: r.body.montoDescuento, total: r.body.total });

    // desde 50.000 -> 2.500 off
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, items: item(50000), medioPago: "efectivo" }, headers: { "X-Agent-Key": KEY } });
    ok("descuento efectivo: subtotal 50.000 -> 2.500 off", r.body.montoDescuento === 2500 && r.body.total === 50000 + 8000 - 2500, { desc: r.body.montoDescuento, total: r.body.total });

    // desde 100.000 -> 5.000 off
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, items: item(120000), medioPago: "efectivo" }, headers: { "X-Agent-Key": KEY } });
    ok("descuento efectivo: subtotal 120.000 -> 5.000 off", r.body.montoDescuento === 5000 && r.body.total === 120000 + 8000 - 5000, { desc: r.body.montoDescuento, total: r.body.total });

    // el tramo se mide SIN el envio: 48.000 + 8.000 de envio sigue siendo el tramo chico
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, items: item(48000), medioPago: "efectivo" }, headers: { "X-Agent-Key": KEY } });
    ok("descuento efectivo: el envio no empuja al tramo siguiente", r.body.montoDescuento === 1500, { desc: r.body.montoDescuento });

    // por transferencia NO hay descuento
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, items: item(30000), medioPago: "alias1", comprobante: { numero: "1" } }, headers: { "X-Agent-Key": KEY } });
    ok("descuento efectivo: por transferencia no se aplica", r.body.montoDescuento === 0 && r.body.total === 30000 + 8000, { desc: r.body.montoDescuento, total: r.body.total });

    // el resumen lo muestra como linea propia
    r = await callFn(api.agentPedido, { method: "POST", body: { ...base, items: item(30000), medioPago: "efectivo" }, headers: { "X-Agent-Key": KEY } });
    ok("descuento efectivo: aparece en el resumen", /Descuento por efectivo: -\$1\.500/.test(r.body.mensaje || ""), r.body.mensaje);
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
