// Tests de los endpoints del bot, con los dobles de ./dobles.js. Correr: node functions/bot/test/api.test.js
"use strict";
const { api, store, LISTAS, llamar, pedido, resumen, conHora, ok, resultados, guardadoEnStorage, hashCorto, setAntesTransaccion, LLEGO_RECIEN, paginasWeb } = require("./dobles");

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
    // Texto real del panel (8/10): la batería sola arriba de los combos. El adaptador original ya está
    // en la lista de Apple de prueba, bajo el título de su sección ("APPLE ORIGINAL").
    store["settings/operativo"] = { ...operativo,
      combosBateriasTexto: "🔋 LISTA PRECIOS BATERÍAS THC - CLIENTES\n\n━━━━━━━━━━━━━━━\n\n🖊️ BATERÍA PEN ELFTHC\n\n💨 Diseño tipo Pen\n🔌 Compatible con cápsulas rosca 510\n💎 Compacta, práctica y fácil de usar\n\n💰 1x $35.000\n\n━━━━━━━━━━━━━━━\n\n🔥 COMBOS DISPONIBLES\n\n🖊️ Batería ELFTHC + Cápsula 028 1ML\n💰 $70.000\n\n⚡ Batería TORUS + Cápsula 028 1ML\n💰 $75.000\n\n━━━━━━━━━━━━━━━\n\n💨 Elegí tu batería y llevátela lista con Cápsula 028 1ML.",
    };
    for (const [nombre, total] of [
      ["Batería ELFTHC + Cápsula 028 1ML", "70.000"],
      ["🖊️ Batería ELFTHC + Cápsula 028 1ML", "70.000"],
      ["BATERÍA ELFTHC + CÁPSULA 028", "70.000"],
      ["Batería TORUS + Cápsula 028 1ML", "75.000"],
      ["combo torus", "75.000"],
      ["Batería ELFTHC", "35.000"], // la batería sola no es el combo
      ["BATERÍA PEN ELFTHC", "35.000"],
      ["Cápsula 028", "45.000"], // la cápsula sola (lista THC, en plural) no es un combo
      ["Adaptador 20W", "65.000"],
    ]) {
      const r = await resumen({ medioPago: "transferencia", items: [{ producto: nombre, variante: "Pineapple Express", cantidad: 1 }] });
      ok(`combos: "${nombre}" sale $${total}`, r.body.ok && r.body.mensaje.includes(`$${total}`), r.body);
    }
    store["settings/operativo"] = operativo;
  }

  // ── uber ──
  {
    const r = await resumen({ tipoEnvio: "uber" });
    ok("uber: sin cotización del depósito no hay resumen", r.status === 400 && /pedir_cotizacion_flash/.test(r.body.error), r.body);
    await llamar(api.agentCrearCotizacionUber, { method: "POST", body: { idConversacion: "77", telefonoCliente: "+54 9 11 5869-6086" } });
    const [idCot] = Object.keys(store).filter((k) => k.startsWith("cotizaciones_uber/"));
    ok("uber: la cotización guarda el teléfono normalizado", store[idCot].telefonoCliente === "5491158696086", store[idCot]);
    const rPend = await llamar(api.agentCrearCotizacionUber, { method: "POST", body: { idConversacion: "77b", telefonoCliente: "+54 9 11 5869-6086" } });
    ok("uber: si ya hay cotización pendiente no crea otra", rPend.body.yaPendiente && Object.keys(store).filter((k) => k.startsWith("cotizaciones_uber/")).length === 1, rPend.body);
    store[idCot] = { ...store[idCot], estado: "cotizado", montoUber: 8500, resueltoEn: new Date(Date.now() - 4 * 3600e3).toISOString() };
    const r2 = await resumen({ tipoEnvio: "uber" });
    ok("uber: un precio de hace 4 horas bloquea el resumen y exige recotizar", r2.status === 409 && r2.body.cotizacionVencida && r2.body.necesitaRecotizacion, r2.body);
    store[idCot].resueltoEn = new Date().toISOString();
    const rVig = await llamar(api.agentCrearCotizacionUber, { method: "POST", body: { idConversacion: "77c", telefonoCliente: "+54 9 11 5869-6086" } });
    ok("uber: si ya hay cotización reciente devuelve el monto y no recotiza", rVig.body.yaCotizado && rVig.body.montoUber === 8500 && /vigente/.test(rVig.body.mensaje), rVig.body);
    const rOld = await llamar(api.agentCrearCotizacionUber, { method: "POST", body: { idConversacion: "88", telefonoCliente: "+54 9 11 2222-3333", direccion: "Cabildo 2000, Belgrano" } });
    store[`cotizaciones_uber/${rOld.body.id}`].createdAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const rOld2 = await llamar(api.agentCrearCotizacionUber, { method: "POST", body: { idConversacion: "88b", telefonoCliente: "+54 9 11 2222-3333", direccion: "Cabildo 2000, Belgrano" } });
    ok("uber: después de 30 min no crea otra cotización para la misma compra", rOld2.body.ok && rOld2.body.yaPendiente && rOld2.body.id === rOld.body.id, rOld2.body);
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
    const r7 = await conHora("2026-09-22T20:00:00", async () => { const viejo = store[idCot].resueltoEn; store[idCot].resueltoEn = new Date().toISOString(); const r = await resumen({ tipoEnvio: "uber", horaSolicitada: "20:00" }); store[idCot].resueltoEn = viejo; return r; });
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
    const p5 = store[`pedidos/${r5.body.pedidoId}`]; if(!r5.body.ok) console.log("DEBUG r5", JSON.stringify(r5));
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
    store[`pedidos/${r1.body.pedidoId}`].fechaSalida = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
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

    // ── buscar_catalogo: el agente busca lo que pidió el cliente en vez de recibir el catálogo entero ──
    const buscar = (consulta) => llamar(api.agentBuscarCatalogo, { query: { consulta } });
    const b1 = await buscar("ice king");
    const ik = b1.body.resultados[0] || {};
    ok("catálogo: encuentra el Ice King con precio y sabores con stock", b1.body.ok && /ICE KING/.test(ik.nombre) && /1x \$26\.000/.test(ik.precios)
      && Array.isArray(ik.saboresConStock) && ik.saboresConStock.some((s) => /Peach.*\(3\)/.test(s)) && !ik.saboresConStock.some((s) => /Strawberry Ice/.test(s)), b1.body);
    const bloque = String(ik.bloqueStock || "");
    ok("catálogo: trae el bloque de stock del modelo tal cual la plantilla, sin los agotados", /ICE KING/.test(bloque.split("\n")[0]) && bloque.split("\n")[1] === ""
      && bloque.split("\n").slice(2).length === ik.saboresConStock.length && bloque.includes("(3)") && !/Strawberry Ice/.test(bloque), bloque);
    const b2 = await buscar("tenes dozo?");
    ok("catálogo: busca en THC y saca las palabras genéricas", b2.body.resultados.some((r) => r.lista === "PRECIOS_THC" && /DOZO/.test(r.nombre)), b2.body);
    const b3 = await buscar("elfbar duke");
    const duke = b3.body.resultados.find((r) => /DUKE/.test(r.nombre));
    ok("catálogo: un modelo con precio pero sin stock dice sin stock", duke && duke.saboresConStock === "sin stock", b3.body);
    const b4 = await buscar("eclaire");
    ok("catálogo: perfumes sin lista de stock no traen sabores", b4.body.resultados[0] && !("saboresConStock" in b4.body.resultados[0]), b4.body);
    const b5 = await buscar("producto inventado xyz");
    ok("catálogo: si no encuentra nada devuelve el índice para ofrecer lo más parecido", !b5.body.resultados.length && b5.body.indice && b5.body.indice.PRECIOS_VAPES && /no encontré/.test(b5.body.nota), b5.body);
    const b6 = await buscar("que vapes tenes");
    ok("catálogo: una consulta general no busca, devuelve el índice", !b6.body.resultados.length && /plantilla/.test(b6.body.nota), b6.body);
    ok("catálogo: devuelve pocos resultados, no la lista entera", (await buscar("elfbar")).body.resultados.length <= 6);
    const b7 = await buscar("strawberry kiwi");
    ok("catálogo: busca también por sabor con stock", b7.body.resultados.length >= 1 && /^IGNITE V400$/.test(b7.body.resultados[0].nombre)
      && b7.body.resultados.every((r) => Array.isArray(r.saboresConStock) && r.saboresConStock.some((x) => /Strawberry Kiwi/.test(x))), b7.body);
    const b8 = await buscar("strawberry ice");
    ok("catálogo: un sabor en (0) no cuenta como disponible", !b8.body.resultados.some((r) => /ICE KING/.test(r.nombre) && r.s === 1) && !b8.body.resultados.some((r) => Array.isArray(r.saboresConStock) && r.saboresConStock.some((x) => /Strawberry Ice/.test(x))), b8.body);
    store["settings/operativo"] = operativo;
  }

  // ── estado operativo ──
  {
    const guardados = Object.entries(store).filter(([k]) => k.startsWith("pedidos/"));
    for (const k of Object.keys(store)) if (k.startsWith("pedidos/")) delete store[k];
    store["settings/operativo"] = { ...store["settings/operativo"], situacion: "demora" };
    const r = await conHora("2026-09-22T15:00:00", () => llamar(api.agentEstadoOperativo));
    ok("estado: manda el alias activo, nunca otro", r.body.plantillas.ALIAS.includes("tamelake358sa.eluter") && r.body.plantillas.ALIAS.includes("CVU: 0000510400000000001348") && !/028import\.gal?2?/.test(r.body.plantillas.ALIAS), r.body.plantillas.ALIAS);
    ok("estado: manda las listas del panel", r.body.plantillas.PRECIOS_VAPES === LISTAS.preciosVapesTexto.trim(), null);
    ok("estado: demora del día y tandas independientes", /2 hs/.test(r.body.demora) && r.body.plantillas.FORMAS_DE_ENTREGA.includes("15:30"), r.body);
    ok("estado: manda comunidad y regla de Tame Lake", /COMUNIDAD 028 IMPORT/.test(r.body.plantillas.COMUNIDAD) && /30718603702/.test(r.body.plantillas.COMPROBANTES_VALIDOS), r.body.plantillas);
    const aliasGuardado = store["settings/operativo"].aliasActivo;
    for (const [alias, titular, cbu] of [
      ["alias1", "Lucio Felix Bunge", "0070194130004014092980"],
      ["alias2", "Marcos Agustin Gieco", "0070181130004057764295"],
      ["alias3", "Tame Lake S.A.", "0000510400000000001348"],
    ]) {
      store["settings/operativo"].aliasActivo = alias;
      const estado = await llamar(api.agentEstadoOperativo);
      const regla = estado.body.plantillas.COMPROBANTES_VALIDOS;
      ok(`comprobantes: ${alias} identifica su titular, CBU y cuenta activa`, regla.includes(titular) && regla.includes(cbu) && estado.body.plantillas.ALIAS.includes(cbu.slice(-6)) && regla.includes("$5.000"), regla);
    }
    store["settings/operativo"].aliasActivo = "desconocido";
    const fallback = await llamar(api.agentEstadoOperativo);
    ok("comprobantes: alias inválido usa Galicia tanto en pago como en validación", fallback.body.plantillas.ALIAS.includes("Lucio Felix Bunge") && fallback.body.plantillas.COMPROBANTES_VALIDOS.includes("alias1/028import.gl"), fallback.body.plantillas);
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
      const v = campo === "salida" ? x.body.opcionesMoto[0] : x.body[campo]; return v ? `${v.dia} ${v.hora}` : "ninguna";
    };
    const casos = [
      ["martes 04:00: hoy en la primera tanda", "2026-09-22T04:00:00", 0, "hoy 13:30"],
      ["miércoles 04:00: hoy 13:30", "2026-09-23T04:00:00", 0, "hoy 13:30"],
      ["domingo 04:00: hoy 17:00", "2026-10-04T04:00:00", 0, "hoy 17:00"],
      ["domingo 17:10: también cada 30 min", "2026-10-04T17:10:00", 0, "hoy 17:30"],
      ["16:50 con 9 en cola: entra en la de las 17:00", "2026-09-22T16:50:00", 9, "hoy 17:00"],
      ["16:50 con 10 en cola: tanda llena, sale 17:30", "2026-09-22T16:50:00", 10, "hoy 17:30"],
      ["16:50 con 25 en cola: dos tandas llenas, sale 18:00", "2026-09-22T16:50:00", 25, "hoy 18:00"],
      ["19:59: todavía entra en la de las 20:00", "2026-09-22T19:59:00", 0, "hoy 20:00"],
      ["20:00: ya sale mañana", "2026-09-22T20:00:00", 0, "mañana 13:30"],
      ["martes 21:00: mañana miércoles 13:30", "2026-09-22T21:00:00", 0, "mañana 13:30"],
      ["sábado 22:00: mañana domingo 17:00", "2026-10-03T22:00:00", 0, "mañana 17:00"],
      ["19:40 con 30 en cola: hoy no entra, mañana en la tercera", "2026-09-22T19:40:00", 30, "mañana 14:30"],
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
    ok("salida: si el panel dice que hoy no sale más, mañana", s1 === "mañana 13:30", s1);
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
    ok("salida: el Uber desde las 20:00 sale mañana", u3 === "mañana 13:30", u3);

    for (const k of Object.keys(store)) if (k.startsWith("pedidos/")) delete store[k];
    for (const [k, v] of guardados) store[k] = v;
    store["settings/operativo"] = operativo; // tiene próxima salida 16:00
    const r = await conHora("2026-09-22T04:00:00", () => pedido({ comprobante: { numero: "0098765" } }));
    ok("salida: el pedido guarda fecha y hora de primera tanda", /🕐 Sale hoy, 22\/09, a las 15:30/.test(r.body.mensaje) && store[`pedidos/${r.body.pedidoId}`].fechaSalida === "2026-09-22", r.body);
  }

  // Cotizaciones con vencimiento: reloj, historial, renovación y concurrencia.
  {
    const guardado = structuredClone(store);
    try {
      for (const k of Object.keys(store)) delete store[k];
      store["settings/operativo"] = { ...LISTAS, aliasActivo: "alias3" };
      const tel = "5491176441787", destino = "Paraguay 4194, Palermo";
      const args = { idConversacion: "212", telefonoCliente: tel, direccion: destino };
      const solicitar = (extra) => llamar(api.agentCrearCotizacionUber, { method: "POST", body: { ...args, ...extra } });
      store["cotizaciones_uber/actual"] = { ...args, telefonoCliente: tel, estado: "procesado", montoUber: 6500, createdAt: "2026-10-23T15:50:00Z", resueltoEn: "2026-10-23T16:00:00Z", procesadoEn: "2026-10-23T16:00:02Z" };
      store["cotizaciones_uber/ajeno"] = { ...store["cotizaciones_uber/actual"], telefonoCliente: "5491132961912", montoUber: 20000 };
      await conHora("2026-10-23T13:44:59", async () => {
        const e = await llamar(api.agentEstadoOperativo, { query: { telefono: tel } });
        ok("45min: antes de vencer muestra 6500 y fecha de vencimiento", e.body.cotizacionUber.estado === "cotizado" && e.body.cotizacionUber.montoUber === 6500 && e.body.cotizacionUber.venceEn === "2026-10-23T16:45:00.000Z", e.body.cotizacionUber);
        const precio = await solicitar({});
        ok("45min: no duplica ni mezcla teléfonos con conversación migrada", precio.body.creada === false && precio.body.yaCotizado && precio.body.montoUber === 6500, precio.body);
        const total = await resumen({ telefono: tel, tipoEnvio: "uber", direccion: { texto: destino } });
        ok("45min: resumen usa precio vigente", total.body.ok && total.body.total === 32500, total.body);
      });
      await conHora("2026-10-23T13:45:01", async () => {
        const e = await llamar(api.agentEstadoOperativo, { query: { telefono: tel } });
        ok("45min: vencimiento no reinicia al marcar procesado", e.body.cotizacionUber.estado === "vencido" && !e.body.cotizacionUber.montoUber && e.body.cotizacionUber.necesitaRecotizacion, e.body.cotizacionUber);
        const total = await resumen({ telefono: tel, tipoEnvio: "uber", direccion: { texto: destino } });
        ok("45min: precio vencido bloquea resumen y pide nueva cotización", total.status === 409 && total.body.cotizacionVencida && total.body.necesitaRecotizacion, total.body);
        // Si ya transfirió, el precio que se le pasó vale: se carga con ese, sin recotizar.
        const antesDelPago = structuredClone(store);
        const pago = await pedido({ telefono: tel, tipoEnvio: "uber", direccion: { texto: destino }, comprobante: { numero: "pago-vencido", monto: 32500 } });
        const cargado = store[`pedidos/${pago.body.pedidoId}`];
        ok("45min: si ya transfirió carga con el precio que se le pasó", pago.body.ok && cargado?.valorEnvio === 6500 && cargado.total === 32500, pago.body);
        for (const k of Object.keys(store)) delete store[k];
        Object.assign(store, antesDelPago);
        store["cotizaciones_uber/recotizando"] = { ...args, estado: "pendiente", montoUber: null, createdAt: "2026-10-23T16:46:00Z" };
        const conPendiente = await pedido({ telefono: tel, tipoEnvio: "uber", direccion: { texto: destino }, comprobante: { numero: "pago-vencido-2", monto: 32500 } });
        ok("45min: ya transfirió y hay recotización pendiente: carga con el precio que se le pasó", conPendiente.body.ok && store[`pedidos/${conPendiente.body.pedidoId}`]?.valorEnvio === 6500, conPendiente.body);
        for (const k of Object.keys(store)) delete store[k];
        Object.assign(store, antesDelPago);
        const seis = await Promise.all(Array.from({ length: 6 }, () => solicitar({})));
        ok("45min: seis renovaciones simultáneas crean una sola", seis.filter(x => x.body.creada).length === 1 && new Set(seis.map(x => x.body.id)).size === 1, seis.map(x => x.body));
        const nueva = seis.find(x => x.body.creada).body;
        ok("45min: nueva solicitud incluye el aviso exacto de vencimiento", nueva.recotizacionPorVencimiento && nueva.mensaje === "como pasaron más de 45 minutos, te tengo que cotizar el Uber de vuelta", nueva);
        const e2 = await llamar(api.agentEstadoOperativo, { query: { telefono: tel } });
        ok("45min: renovación pendiente reemplaza el precio anterior", e2.body.cotizacionUber.estado === "pendiente" && !e2.body.cotizacionUber.montoUber, e2.body.cotizacionUber);
        const repetida = await solicitar({});
        ok("45min: mensaje repetido no abre otra ni repite el aviso", repetida.body.yaPendiente && repetida.body.creada === false && !repetida.body.recotizacionPorVencimiento, repetida.body);
        store["cotizaciones_uber/" + nueva.id] = { ...store["cotizaciones_uber/" + nueva.id], estado: "procesado", montoUber: 7200, resueltoEn: "2026-10-23T16:46:00Z" };
        await conHora("2026-10-23T13:47:00", async () => {
          const n = await solicitar({});
          ok("45min: renovación resuelta usa el precio nuevo, no uno histórico", n.body.yaCotizado && n.body.montoUber === 7200, n.body);
          const t = await resumen({ telefono: tel, tipoEnvio: "uber", direccion: { texto: destino } });
          ok("45min: el total usa los 7200 de la renovación", t.body.ok && t.body.total === 33200, t.body);
          const ref = await solicitar({ direccion: destino + ", piso 3, para las 18:00 con seguro" });
          ok("45min: piso, seguro y horario no duplican una cotización vigente", ref.body.yaCotizado && ref.body.montoUber === 7200, ref.body);
          const otra = await solicitar({ direccion: "Paraguay 4500, Palermo" });
          ok("45min: cambio completo de altura habilita nueva cotización", otra.body.creada && otra.body.id !== nueva.id, otra.body);
        });
      });
      for (const k of Object.keys(store)) if (k.startsWith("cotizaciones_uber/") && k !== "cotizaciones_uber/actual" && k !== "cotizaciones_uber/ajeno") delete store[k];
      await conHora("2026-10-26T13:40:00", async () => {
        const viejo = await solicitar({});
        ok("compra nueva: después de varios días no arrastra el aviso de vencimiento histórico", viejo.body.creada && !viejo.body.recotizacionPorVencimiento && !viejo.body.montoUber, viejo.body);
      });
    } finally {
      for (const k of Object.keys(store)) delete store[k];
      Object.assign(store, guardado);
    }
  }

  // ── avisos de cotización de Uber: el bot los busca cada minuto ──
  {
    const guardado = { ...store };
    for (const k of Object.keys(store)) if (k.startsWith("cotizaciones_uber/") || k.startsWith("pedidos/")) delete store[k];
    const hace = (min) => new Date(Date.now() - min * 60000).toISOString();
    const nueva = (id, tel, extra) => { store["cotizaciones_uber/" + id] = { idConversacion: id, telefonoCliente: tel, direccion: "Paraguay 4500, Palermo", createdAt: hace(10), ...extra }; };
    const buscar = () => llamar(api.agentAvisosCotizacionUber, { method: "GET" });
    const confirmar = (id) => llamar(api.agentAvisosCotizacionUber, { method: "POST", body: { id, enviadoEn: "2026-10-28T15:00:00.000Z" } });
    nueva("77", "5491100000077", { estado: "cotizado", montoUber: 8500, resueltoEn: hace(2) });
    nueva("78", "5491100000078", { estado: "no_llegamos", resueltoEn: hace(2) });
    nueva("79", "5491100000079", { estado: "cotizado", montoUber: 9000, resueltoEn: hace(2), canceladaEn: hace(1) });
    nueva("80", "5491100000080", { estado: "cotizado", montoUber: 9000, resueltoEn: hace(2) });
    store["pedidos/ya-compro"] = { telefono: "5491100000080", estado: "pendiente", createdAt: hace(1) };
    nueva("81", "5491100000081", { estado: "cotizado", montoUber: 9000, createdAt: hace(90), resueltoEn: hace(60) });
    nueva("82", "5491100000082", { estado: "pendiente" });
    const r = await buscar();
    const ids = r.body.avisos.map((a) => a.id).sort();
    ok("avisos uber: devuelve el precio con la conversación, el teléfono y el monto", r.body.avisos.find((a) => a.id === "77")?.montoUber === 8500 && r.body.avisos.find((a) => a.id === "77").idConversacion === "77", r.body);
    ok("avisos uber: el «no llegamos» va sin monto", r.body.avisos.find((a) => a.id === "78")?.noLlegamos === true && !("montoUber" in r.body.avisos.find((a) => a.id === "78")), r.body);
    ok("avisos uber: no avisa canceladas, ya compradas, vencidas ni pendientes", JSON.stringify(ids) === JSON.stringify(["77", "78"]), ids);
    ok("avisos uber: la que venció sin avisar queda cerrada (el panel no la muestra «Enviando…»)", store["cotizaciones_uber/81"].estado === "procesado" && store["cotizaciones_uber/81"].avisoNoEnviado === true, store["cotizaciones_uber/81"]);
    const c = await confirmar("77");
    ok("avisos uber: al confirmar queda procesado y el precio vale desde el envío", c.body.marcado && store["cotizaciones_uber/77"].estado === "procesado" && store["cotizaciones_uber/77"].informadoEn === "2026-10-28T15:00:00.000Z", store["cotizaciones_uber/77"]);
    await confirmar("78");
    ok("avisos uber: no llegamos queda procesado y sin cobertura", store["cotizaciones_uber/78"].estado === "procesado" && store["cotizaciones_uber/78"].sinCoberturaUber === true, store["cotizaciones_uber/78"]);
    ok("avisos uber: ya avisadas, no se vuelven a mandar", (await buscar()).body.avisos.length === 0 && (await confirmar("77")).body.marcado === false);
    for (const k of Object.keys(store)) delete store[k];
    Object.assign(store, guardado);
  }

  // ── estadísticas del bot: las manda n8n cada hora ──
  {
    const mandar = (dias) => llamar(api.agentEstadisticasBot, { method: "POST", body: { dias } });
    const r = await mandar([{ dia: "2026-10-28", mensajes: 120, clientes: 40, resumenes: 12, pedidos: 9, clientesConPedido: 8, abandonos: 4, derivaciones: { reclamo: 2, "precio mayorista!": 1 } }]);
    const d = store["bot_estadisticas/2026-10-28"];
    ok("estadísticas: guarda el día con sus contadores", r.body.ok && d.mensajes === 120 && d.clientes === 40 && d.pedidos === 9 && d.abandonos === 4, d);
    ok("estadísticas: derivaciones por motivo y total", d.derivaciones.reclamo === 2 && d.derivaciones.preciomayorista === 1 && d.totalDerivaciones === 3, d.derivaciones);
    await mandar([{ dia: "2026-10-28", mensajes: 130, clientes: -5, pedidos: "x" }]);
    ok("estadísticas: el día se reemplaza entero y lo inválido queda en 0", store["bot_estadisticas/2026-10-28"].mensajes === 130 && store["bot_estadisticas/2026-10-28"].clientes === 0 && store["bot_estadisticas/2026-10-28"].pedidos === 0 && store["bot_estadisticas/2026-10-28"].totalDerivaciones === 0, store["bot_estadisticas/2026-10-28"]);
    const mal = await mandar([{ dia: "28/10" }]);
    ok("estadísticas: rechaza un día mal escrito", mal.status === 400, mal.body);
    delete store["bot_estadisticas/2026-10-28"];
  }

  // ── información de productos de la web (028import.com) ──
  {
    const web = require("../web");
    const ld = (producto) => `<html><script type="application/ld+json">{"@type":"Store"}</script><script type="application/ld+json">${JSON.stringify(producto)}</script></html>`;
    const limpia = web.limpiarDescripcion("🆕 FUME PRO 30K\n\n💨 Hasta 30.000 puffs\n💰 1x $25.000\n🔥 2x $50.000 $44.000\n━━━━━━\n🚀 028 IMPORT — IMPORTADOR DIRECTO");
    ok("web: la descripción queda sin precios ni promociones", limpia === "🆕 FUME PRO 30K\n\n💨 Hasta 30.000 puffs", limpia);
    const peach = { "@type": "Product", name: "PEACH", brand: { name: "ELFBAR ICE KING" },
      description: "PEACH 🍑\n\nDurazno puro y dulce.\n\n⚙️ Especificaciones\n\n40.000 puffs\nNicotina: 5% (50 mg/ml)\nBatería: 850 mAh recargable\n\n🎯 Para quién es Para el que le gustan las frutas." };
    const p = web.extraerProducto(ld(peach), "https://028import.com/producto/elfbar-ice-king-peach");
    ok("web: lee modelo, sabor y descripción del JSON-LD", p.modelo === "ELFBAR ICE KING" && p.sabor === "PEACH" && /Durazno puro/.test(p.descripcion), p);
    ok("web: una página sin producto no trae nada", web.extraerProducto("<html>nada</html>", "x") === null);
    const info = web.infoWebDe([p], "Elfbar Ice King 40K", ["Peach (9)"]);
    ok("web: el modelo del panel coincide con el de la web y trae sus especificaciones", /40.000 puffs/.test(info.modelo) && /850 mAh/.test(info.modelo) && !/Durazno/.test(info.modelo), info);
    ok("web: trae el perfil del sabor que preguntó", info.sabores?.[0]?.sabor === "PEACH" && /Durazno puro/.test(info.sabores[0].descripcion), info);
    ok("web: no mezcla modelos con una sola palabra en común", web.infoWebDe([{ ...p, modelo: "ELFBAR" }], "Elfbar Ice King 40K") === null && web.infoWebDe([p], "Elfbar Sweet King 40K") === null);

    paginasWeb["https://028import.com/sitemap.xml"] = "<urlset><url><loc>https://028import.com/</loc></url><url><loc>https://028import.com/producto/elfbar-ice-king-peach</loc></url><url><loc>https://028import.com/producto/rota</loc></url></urlset>";
    paginasWeb["https://028import.com/producto/elfbar-ice-king-peach"] = ld(peach);
    const act = await llamar(api.agentActualizarInfoWeb, { method: "POST", body: {} });
    ok("web: actualiza leyendo el sitemap y salteando las páginas que fallan", act.body.ok && act.body.productos === 1 && act.body.paginas === 2 && store["settings/infoWeb"].productos[0].sabor === "PEACH", act.body);
    const busqueda = await llamar(api.agentBuscarCatalogo, { query: { consulta: "ice king peach" } });
    const ice = busqueda.body.resultados.find((x) => /ice king/i.test(x.nombre));
    ok("web: buscar_catalogo suma la info de la web al modelo", ice?.infoWeb && /850 mAh/.test(ice.infoWeb.modelo), busqueda.body);
    delete paginasWeb["https://028import.com/producto/elfbar-ice-king-peach"];
    paginasWeb["https://028import.com/sitemap.xml"] = "<urlset></urlset>";
    const vacia = await llamar(api.agentActualizarInfoWeb, { method: "POST", body: {} });
    ok("web: si no lee ningún producto, no pisa lo que había", vacia.status === 500 && store["settings/infoWeb"].productos.length === 1, vacia.body);
    delete store["settings/infoWeb"];
  }

  // ── comprobante ──
  {
    const r = await llamar(api.serveComprobante, { query: {} });
    ok("serveComprobante: sin pedido -> 404", r.status === 404, r.body);
  }

  // ── comprobantes sueltos: se guardan todos, se cargue o no el pedido ──
  {
    const guardar = (body) => llamar(api.agentGuardarComprobante, { method: "POST", body: { telefono: "+5492235861032", cliente: "Celina", idConversacion: 201, idMensaje: 9, ...body } });
    const foto = await guardar({ url: "https://chatwoot/foto-vape.jpg", lectura: { esComprobante: false } });
    ok("suelto: una foto que no es comprobante no se guarda", foto.body.ok && foto.body.guardado === false, foto.body);
    // Lectura real (22/10): el CVU quedó leído con un cero menos, pero el destinatario es Tame Lake.
    const celina = { esComprobante: true, edicionDetectada: false, monto: "$65.990", numeroOperacion: "185563329942", titular: "Celina Luque Peluffo",
      destinatario: "Tame Lake 358 Sa", cbuCvu: "000051040000000001348", alias: "No aplica", cuit: "" };
    const r = await guardar({ url: "https://chatwoot/x.jpg", lectura: celina });
    const doc = store[`comprobantes/${r.body.id}`];
    ok("suelto: guarda el comprobante con sus datos", r.body.guardado && doc.comprobante.numero === "185563329942" && doc.comprobante.monto === 65990 && doc.comprobante.nombre === "Celina Luque Peluffo" && doc.telefono === "5492235861032" && doc.pedidoId === null, doc);
    ok("suelto: reconoce la cuenta aunque el CVU se haya leído mal", doc.cuentaCobro === "alias3", doc.cuentaCobro);
    ok("suelto: copia la foto a Storage y la sirve por serveComprobante", doc.comprobanteImagen.url.endsWith("?comprobante=" + r.body.id) && guardadoEnStorage.some((p) => p.includes("sueltos/" + r.body.id + ".jpg")), doc.comprobanteImagen);
    const otra = await guardar({ url: "https://chatwoot/x.jpg", lectura: JSON.stringify(celina) });
    ok("suelto: el mismo comprobante no se guarda dos veces (y acepta la lectura como JSON)", otra.body.reutilizado && otra.body.id === r.body.id, otra.body);
    const santander = await guardar({ url: "https://chatwoot/santander.pdf", lectura: { esComprobante: true, monto: "$37.990,00", numeroOperacion: "96401936",
      titular: "No especificado directamente como titular", destinatario: "Lucio Felix Bunge", cbuCvu: "0070194130004014092980" } });
    const ds = store["comprobantes/" + santander.body.id];
    ok("suelto: monto con decimales, sin titular y otra cuenta", ds.comprobante.monto === 37990 && ds.comprobante.numero === "96401936" && ds.comprobante.nombre === null && ds.cuentaCobro === "alias1", ds);
    const antesEditado = Object.keys(store).length;
    const editado = await guardar({ url: "https://chatwoot/editado.jpg", lectura: { ...celina, numeroOperacion: "111222333444", edicionDetectada: true } });
    ok("suelto: «parece editado» no frena: se guarda y queda anotado", editado.body.guardado === true && !editado.body.derivar && store["comprobantes/" + editado.body.id].posibleEdicion === true && Object.keys(store).length > antesEditado, editado.body);
    const incompleto = await guardar({ url: "https://chatwoot/borroso.jpg", lectura: { esComprobante: true, monto: "", numeroOperacion: "" } });
    ok("suelto: sin importe ni número no se guarda", incompleto.body.guardado === false && incompleto.body.motivo === "lectura_incompleta", incompleto.body);
    // Llega mientras atiende el equipo: se guarda (para el panel y la financiera) marcado conEquipo.
    const conEquipo = await guardar({ url: "https://chatwoot/con-equipo.jpg", conEquipo: true, lectura: { ...celina, numeroOperacion: "555000111222" } });
    ok("suelto: con el equipo atendiendo se guarda marcado", conEquipo.body.guardado && store["comprobantes/" + conEquipo.body.id].conEquipo === true, store["comprobantes/" + conEquipo.body.id]);
    // La charla volvió al bot con el cliente esperando: el mismo comprobante llega sin el equipo y se desmarca.
    await guardar({ url: "https://chatwoot/con-equipo.jpg", lectura: { ...celina, numeroOperacion: "555000111222" } });
    ok("suelto: si vuelve al bot sin respuesta del equipo, se desmarca", store["comprobantes/" + conEquipo.body.id].conEquipo === false, store["comprobantes/" + conEquipo.body.id]);
    delete store["comprobantes/" + conEquipo.body.id];
    const sirve = await llamar(api.serveComprobante, { query: { comprobante: "no-existe" } });
    ok("serveComprobante: suelto inexistente -> 404", sirve.status === 404, sirve.body);
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
    store["recorridos/activo"] = { estado: "en_calle",salidaEn:new Date().toISOString() };
    store["recorridos/activo_moto2"] = { estado: "preparando",salidaEn:new Date().toISOString() };
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
    ok("panel: combos y baterias disponibles como plantilla", movidaPanel.body.plantillas.COMBOS_BATERIAS === "Combo capsula y bateria", movidaPanel.body);
    ok("panel: entrega informa dos horarios actualizados", /15:30 y 18:30/.test(movidaPanel.body.plantillas.FORMAS_DE_ENTREGA), movidaPanel.body.plantillas.FORMAS_DE_ENTREGA);

    for (const delta of [-5001, -5000, 0, 5000, 5001]) {
      const pago = await pedido({ comprobante: { numero: `delta-${delta}`, monto: 29000 + delta } });
      const esperado = delta < -5000 ? "pide lo que falta" : delta > 5000 ? "carga y anota lo de más" : "acepta";
      ok(`pagos: diferencia ${delta} ${esperado}`, !pago.body.derivar && (delta < -5000 ? pago.status === 400 && pago.body.requierePago && pago.body.faltante === -delta && /faltan \$5\.001/.test(pago.body.error)
        : delta > 5000 ? pago.body.ok && store[`pedidos/${pago.body.pedidoId}`].pagoDeMas === delta && pago.body.pagoDeMas === delta : pago.body.ok && !pago.body.pagoDeMas), pago.body);
    }
    {
      // Pagó en dos transferencias: con la primera sola falta plata; cuando llega la segunda, el sistema
      // toma las dos de la charla, las suma y carga el pedido.
      const uno = "https://chatwoot/parte-1.jpg", dos = "https://chatwoot/parte-2.jpg";
      const guardado = (url, numero, monto, cuentaCobro) => { store["comprobantes/cw-" + hashCorto(url)] = { telefono: "5491158696086", cuentaCobro, comprobante: { numero, monto }, urlFuente: url, createdAt: LLEGO_RECIEN, pedidoId: null }; };
      guardado(uno, "parte-1001", 20000, "alias3");
      const falta = await pedido({ comprobanteUrl: undefined, idMensajeOrigen: "partes-1" });
      ok("dos transferencias: con una sola pide lo que falta", falta.status === 400 && falta.body.requierePago && falta.body.faltante === 9000 && !falta.body.derivar, falta.body);
      guardado(dos, "parte-1002", 9000, "alias1");
      const juntas = await pedido({ comprobanteUrl: undefined, idMensajeOrigen: "partes-2" });
      const p = store[`pedidos/${juntas.body.pedidoId}`];
      ok("dos transferencias: se suman y quedan las dos en el pedido", juntas.body.ok && p.montoPagado === 29000 && p.comprobantesAdicionales.length === 1 && p.comprobantesAdicionales[0].numero === "parte-1002"
        && store["comprobantes/cw-" + hashCorto(uno)].pedidoId === juntas.body.pedidoId && store["comprobantes/cw-" + hashCorto(dos)].pedidoId === juntas.body.pedidoId, { body: juntas.body, p });
      guardado("https://chatwoot/ajeno.jpg", "ajeno-55501", 29000, null);
      const ajena = await pedido({ comprobanteUrl: undefined, idMensajeOrigen: "partes-3" });
      ok("comprobante a otra cuenta: no se cuenta y se le explica al cliente", !ajena.body.ok && ajena.body.requiereComprobante && /no va a ninguna cuenta del negocio/.test(ajena.body.error), ajena.body);
      guardado("https://chatwoot/bueno.jpg", "bueno-55502", 29000, "alias2");
      const conAjena = await pedido({ comprobanteUrl: undefined, idMensajeOrigen: "partes-4" });
      ok("comprobante bueno después de uno ajeno: carga y avisa que el ajeno no contó", conAjena.body.ok && /cuenta que no es del negocio/.test(conAjena.body.nota), conAjena.body);
      delete store["comprobantes/cw-" + hashCorto("https://chatwoot/ajeno.jpg")];
      // Un comprobante sin usar de antes del último pedido, o de antes de que empezara esta compra, es de
      // otra compra: no paga esta.
      store["comprobantes/cw-viejo"] = { telefono: "5491158696086", cuentaCobro: "alias3", comprobante: { numero: "viejo-66601", monto: 29000 }, urlFuente: "https://chatwoot/viejo.jpg", createdAt: "2026-01-01T12:00:00.000Z", pedidoId: null };
      const viejo = await pedido({ comprobanteUrl: undefined, idMensajeOrigen: "partes-5" });
      ok("comprobante de una compra anterior: no paga esta", !viejo.body.ok && /falta el comprobante/.test(viejo.body.error), viejo.body);
      store["comprobantes/cw-viejo"].createdAt = "2998-12-31T00:00:00.000Z";
      const antesDeLaCompra = await pedido({ comprobanteUrl: undefined, idMensajeOrigen: "partes-6", desdeCompra: LLEGO_RECIEN });
      ok("comprobante de antes de que empezara la compra: no paga esta", !antesDeLaCompra.body.ok && /falta el comprobante/.test(antesDeLaCompra.body.error), antesDeLaCompra.body);
      delete store["comprobantes/cw-viejo"];
      // Uno que llegó mientras atendía el equipo: ese pedido lo carga el equipo a mano, el bot no lo usa.
      store["comprobantes/cw-equipo"] = { telefono: "5491158696086", cuentaCobro: "alias3", comprobante: { numero: "equipo-77701", monto: 29000 }, urlFuente: "https://chatwoot/equipo.jpg", createdAt: LLEGO_RECIEN, conEquipo: true, pedidoId: null };
      const delEquipo = await pedido({ comprobanteUrl: undefined, idMensajeOrigen: "partes-7" });
      ok("comprobante que llegó con el equipo atendiendo: el bot no lo usa", !delEquipo.body.ok && /falta el comprobante/.test(delEquipo.body.error), delEquipo.body);
      delete store["comprobantes/cw-equipo"];
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
    setAntesTransaccion(() => { store[`pedidos/${r.body.pedidoId}`].estado = "armado"; });
    const carrera = await modificar({ idMensajeOrigen: "mod-4", direccion: "Cabildo 2000, Belgrano" });
    ok("si deposito arma durante cambio, bloquea y deriva", carrera.status === 409 && carrera.body.derivar && store[`pedidos/${r.body.pedidoId}`].direccion.texto !== "Cabildo 2000, Belgrano" && count() === antes, carrera.body);
    const armado = await modificar({ idMensajeOrigen: "mod-5" });
    ok("pedido armado deriva sin duplicado", armado.status === 409 && armado.body.motivo === "modificar_pedido_armado", armado.body);
    const pagado = await pedido({ comprobante: { numero: "pago-base", monto: 29000 } });
    const cambios = { pedidoId: pagado.body.pedidoId, telefono: "5491158696086", items: [{ producto: "Elfbar Ice King", cantidad: 2, variante: "Peach" }] };
    const extra = await llamar(api.agentPedido, { method: "POST", body: cambios });
    ok("agregar a pagado pide diferencia antes de guardar", extra.status === 400 && extra.body.requierePago && !extra.body.derivar && store[`pedidos/${pagado.body.pedidoId}`].items[0].cantidad === 1, extra.body);
    const fotoOriginal = store[`pedidos/${pagado.body.pedidoId}`].comprobanteImagen;
    store["comprobantes/cw-" + hashCorto("https://chatwoot/saldo.jpg")] = { telefono: "5491158696086", cuentaCobro: "alias1", comprobante: { numero: "pago-saldo", monto: 23000 }, urlFuente: "https://chatwoot/saldo.jpg", createdAt: new Date().toISOString(), pedidoId: null };
    const saldo = await llamar(api.agentPedido, { method: "POST", body: { ...cambios, idMensajeOrigen: "saldo-1" } });
    ok("pago adicional permite actualizar sin duplicar", saldo.body.ok && store[`pedidos/${pagado.body.pedidoId}`].montoPagado === 52000 && store[`pedidos/${pagado.body.pedidoId}`].comprobantesAdicionales.length === 1, saldo.body);
    ok("pago adicional conserva foto original y guarda segunda aparte", store[`pedidos/${pagado.body.pedidoId}`].comprobanteImagen.path === fotoOriginal.path && store[`pedidos/${pagado.body.pedidoId}`].comprobantesAdicionales[0].imagen.path !== fotoOriginal.path, store[`pedidos/${pagado.body.pedidoId}`].comprobantesAdicionales);
    const saldoRetry = await llamar(api.agentPedido, { method: "POST", body: { ...cambios, idMensajeOrigen: "saldo-1" } });
    ok("reintento no suma pago adicional dos veces", saldoRetry.body.reutilizado && store[`pedidos/${pagado.body.pedidoId}`].montoPagado === 52000, saldoRetry.body);

    for (const k of Object.keys(store)) if (k.startsWith("pedidos/")) delete store[k];
    store["settings/operativo"].limitePorTanda = 1;
    const primera = { fecha: "2026-10-06", tandaId: "primera", hora: "15:30" };
    const concurrentes = await Promise.all([pedido({ idConversacion: "800", idMensajeOrigen: "8001", medioPago: "al recibir", salidaSeleccionada: primera }), pedido({ idConversacion: "801", idMensajeOrigen: "8002", medioPago: "al recibir", salidaSeleccionada: primera })]);
    ok("cupo: dos altas concurrentes no sobrellenan la tanda", concurrentes.filter((x) => x.body.ok).length === 1 && count() === 1, concurrentes);
    const e = await llamar(api.agentEstadoOperativo);
    ok("cupo: primera llena ofrece segunda del mismo dia", e.body.opcionesMoto[0].tandaId === "segunda", e.body.opcionesMoto[0]);
    const inicial = concurrentes.find((x) => x.body.ok);
    const retry = await conHora("2026-10-06T20:30:00", () => pedido({ idConversacion: "800", idMensajeOrigen: "8001", medioPago: "al recibir", salidaSeleccionada: primera }));
    ok("reintento despues de salida devuelve pedido existente", retry.body.reutilizado && retry.body.pedidoId === inicial.body.pedidoId && count() === 1, retry.body);
  });

  // El comprobante suelto de https://chatwoot/x.jpg quedó vinculado al pedido que se cargó con esa URL.
  {
    const url = "https://chatwoot/para-vincular.jpg";
    const datos = { telefono: "+5492235861032", idConversacion: "201", idMensajeOrigen: "vincular-1", comprobanteUrl: url };
    const previo = await resumen(datos);
    await llamar(api.agentGuardarComprobante, { method: "POST", body: { url, telefono: datos.telefono, idConversacion: "201", idMensaje: "vincular-0",
      lectura: { esComprobante: true, monto: previo.body.total, numeroOperacion: "777000111", destinatario: "Tame Lake S.A." } } });
    const cargado = await pedido(datos);
    const suelto = Object.values(store).find((v) => v.urlFuente === url);
    ok("suelto: crear_pedido lo vincula al pedido", cargado.body.ok && suelto?.pedidoId === cargado.body.pedidoId, { cargado: cargado.body, suelto });
    // El cliente vuelve a mandar la misma transferencia (otra captura) para otra compra.
    store["comprobantes/cw-" + hashCorto(url + "?otra")] = { ...suelto, urlFuente: url + "?otra", createdAt: LLEGO_RECIEN, pedidoId: null };
    const otraVez = await pedido({ ...datos, comprobanteUrl: undefined, idMensajeOrigen: "vincular-2" });
    ok("suelto: el mismo comprobante no paga un segundo pedido (y lo pide sin derivar)", !otraVez.body.ok && !otraVez.body.derivar && otraVez.body.requiereComprobante && /ya se usó/.test(otraVez.body.error), otraVez.body);
    delete store["comprobantes/cw-" + hashCorto(url + "?otra")];
    const ajeno = await pedido({ ...datos, comprobanteUrl: undefined, telefono: "+5491100000001", idMensajeOrigen: "vincular-3" });
    ok("suelto: el comprobante de otro cliente no sirve", !ajeno.body.ok && /comprobante/.test(ajeno.body.error), ajeno.body);
  }



  await conHora("2026-10-23T13:00:00",async()=>{
    store["settings/operativo"]={...LISTAS,aliasActivo:"alias3",limitePorTanda:100};
    const tel="5491199998101",conv="qa-rodolfo",dir="Cabildo 2000, Belgrano";
    store['cotizaciones_uber/historica-rodolfo']={telefonoCliente:tel,idConversacion:conv,direccion:dir,createdAt:'2026-10-15T18:00:00Z',resueltoEn:'2026-10-15T18:05:00Z',estado:'procesado',montoUber:10000};
    const estado=await llamar(api.agentEstadoOperativo,{query:{telefono:tel}});ok('Rodolfo: cotización de ocho días no aparece como compra actual',!estado.body.cotizacionUber,estado.body);
    const nueva=await llamar(api.agentCrearCotizacionUber,{method:'POST',body:{telefonoCliente:tel,idConversacion:conv,direccion:dir}});
    ok('Rodolfo: primera cotización nueva no dice que transcurrieron 45 minutos',nueva.body.creada&&!nueva.body.recotizacionPorVencimiento,nueva.body);
    const cotKey='cotizaciones_uber/'+nueva.body.id;store[cotKey]={...store[cotKey],createdAt:'2026-10-23T15:59:00Z',estado:'cotizado',montoUber:10000,resueltoEn:new Date().toISOString()};
    const p=await pedido({telefono:tel,idConversacion:conv,idMensajeOrigen:'confirmo-moto',cliente:'QA Rodolfo',medioPago:'efectivo',direccion:{texto:dir},salidaSeleccionada:{fecha:'2026-10-23',tandaId:'primera',hora:'15:30'}});
    ok('Rodolfo: moto confirmada cancela cotización que estaba pendiente',p.body.ok&&store[cotKey].canceladaEn&&store[cotKey].canceladaPorPedidoId===p.body.pedidoId,store[cotKey]);
    const ref='pedidos/'+p.body.pedidoId;store[ref].estado='armado';store[ref].fechaSalida='2026-10-23';store[ref].horaSalida='13:30';
    const cambio=()=>llamar(api.agentPedido,{method:'POST',body:{pedidoId:p.body.pedidoId,telefono:tel,preview:true,direccion:{texto:'Florida 500, San Nicolás'}}});
    const antes=await cambio();ok('Armado antes de salida: deriva al equipo',antes.status===409&&antes.body.derivar&&!antes.body.bloqueadoSalida,antes.body);
    await conHora('2026-10-23T13:30:00',async()=>{const limite=await cambio();ok('Armado a la hora exacta de salida: no modifica ni deriva',limite.body.bloqueadoSalida&&limite.body.derivar===false,limite.body);const e=await llamar(api.agentEstadoOperativo,{query:{telefono:tel}});ok('Estado real comunica que el cambio ya está cerrado',e.body.pedidoActual.cambio.bloqueadoSalida,e.body.pedidoActual);});
    const url='https://chatwoot/solo-alias.jpg';const c=await llamar(api.agentGuardarComprobante,{method:'POST',body:{url,telefono:tel,idConversacion:conv,idMensaje:'alias-solo',lectura:{esComprobante:true,monto:'$35.200',numeroOperacion:'90008101',alias:'028import.gl'}}});ok('Comprobante: reconoce una cuenta válida por el alias visible',c.body.guardado&&Object.values(store).some(x=>x.idMensaje==='alias-solo'&&x.cuentaCobro==='alias1'),c.body);
    const pagoTel='5491199998102',pagoConv='qa-efectivo-uber';
    const cash=await pedido({telefono:pagoTel,idConversacion:pagoConv,idMensajeOrigen:'cash',cliente:'QA',medioPago:'efectivo',direccion:{texto:dir},salidaSeleccionada:{fecha:'2026-10-23',tandaId:'segunda',hora:'18:30'}});
    store['cotizaciones_uber/nueva-cambio-uber']={telefonoCliente:pagoTel,idConversacion:pagoConv,direccion:dir,createdAt:new Date(Date.now()+1000).toISOString(),resueltoEn:new Date().toISOString(),estado:'cotizado',montoUber:10000};
    const prep=await llamar(api.agentPedido,{method:'POST',body:{telefono:pagoTel,pedidoId:cash.body.pedidoId,preview:true,tipoEnvio:'uber',medioPago:'transferencia'}});
    ok('Moto efectivo a Uber: no descuenta dinero que no fue pagado',prep.body.ok&&prep.body.saldoPendiente===prep.body.total,prep.body);
    const sinPago=await llamar(api.agentPedido,{method:'POST',body:{telefono:pagoTel,pedidoId:cash.body.pedidoId,tipoEnvio:'uber',medioPago:'transferencia'}});
    ok('Moto efectivo a Uber: sin comprobante no cambia ni confirma pago',!sinPago.body.ok&&store['pedidos/'+cash.body.pedidoId].tipoEnvio==='moto',sinPago.body);
    const fox=await llamar(api.agentBuscarCatalogo,{query:{consulta:'EarPods Foxconn'}});ok('Apple: Foxconn se informa sin certificar original Apple',fox.body.resultados.some(x=>/Foxconn según/.test(x.autenticidadDeclarada)&&/no equivale/.test(x.autenticidadDeclarada)),fox.body);
    const sinOrigen=await llamar(api.agentBuscarCatalogo,{query:{consulta:'AirPods Pro'}});ok('Apple: no inventa el origen de un producto sin ficha',sinOrigen.body.resultados.some(x=>/no especificada/.test(x.autenticidadDeclarada)),sinOrigen.body);
    const original=await llamar(api.agentBuscarCatalogo,{query:{consulta:'Adaptador 20W Original Apple'}});ok('Apple: distingue el original declarado en el catálogo',original.body.resultados.some(x=>/^original según/.test(x.autenticidadDeclarada)),original.body);
    store['settings/operativo'].informacionProductosTexto='Modelo confirmado: adaptador 20W original sellado';const fichas=await llamar(api.agentBuscarCatalogo,{query:{consulta:'adaptador'}});ok('Productos: devuelve fichas verificadas cargadas por el equipo',fichas.body.informacionAdicionalProductos===store['settings/operativo'].informacionProductosTexto,fichas.body);
    const gracias=await llamar(api.agentEstadoOperativo);ok('Reclamos: las 48 horas no generan rechazo absoluto de garantías',!/no podremos gestionar reclamos|no realizamos devoluciones/i.test(gracias.body.plantillas.GRACIAS)&&/equipo revisa/.test(gracias.body.plantillas.GRACIAS),gracias.body.plantillas.GRACIAS);
  });
  await conHora('2026-10-25T10:00:00',async()=>{
    const op={...LISTAS,limitePorTanda:100};store['settings/operativo']=op;
    for(const k of Object.keys(store))if(k.startsWith('pedidos/')&&store[k].estado==='pendiente')store[k].estado='entregado';
    const e=()=>llamar(api.agentEstadoOperativo);
    const normal=await e();ok('Domingo sin excepción conserva 17:00',normal.body.salidaUber.hora==='17:00',normal.body.salidaUber);
    op.horariosUberPorFecha={'2026-10-25':{desde:'13:30',hasta:'18:00'}};const configurado=await e();ok('Domingo configurable por fecha desde 13:30',configurado.body.salidaUber.fecha==='2026-10-25'&&configurado.body.salidaUber.hora==='13:30',configurado.body.salidaUber);
    op.horariosUberPorFecha['2026-10-25'].cerrado=true;const cerrado=await e();ok('Domingo sin Uber ofrece próxima fecha válida',cerrado.body.salidaUber.fecha==='2026-10-26'&&cerrado.body.salidaUber.hora==='13:30',cerrado.body.salidaUber);
    op.horariosUberPorFecha['2026-10-25']={desde:'13:30',hasta:'16:00'};
    await conHora('2026-10-25T16:01:00',async()=>{const fin=await e();ok('Respeta cierre especial del domingo',fin.body.salidaUber.fecha==='2026-10-26',fin.body.salidaUber);});
    await conHora('2026-10-28T10:00:00',async()=>{const mier=await e();ok('Miércoles vuelve a 13:30',mier.body.salidaUber.hora==='13:30',mier.body.salidaUber);});
  });

  const fallas = resultados.filter((r) => !r.ok);
  for (const r of resultados) console.log(`${r.ok ? "OK  " : "FALLA"} - ${r.nombre}${r.ok ? "" : "\n        " + String(JSON.stringify(r.detalle)).slice(0, 600)}`);
  console.log(`\n${resultados.length - fallas.length}/${resultados.length} pasaron.`);
  process.exit(fallas.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
