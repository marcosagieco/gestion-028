// Reglas sueltas del bot: importes, sabores, fichas THC, listas sin precios, formas de pago, qué pedido
// cuenta como "en curso" y el horario pedido para un Uber. Correr: node functions/bot/test/reglas.test.js
"use strict";
const { api, store, LISTAS, llamar, resumen, conHora, ok, resultados } = require("./dobles");
const { importeDeTexto, coincidencia } = require("../texto");
const { sinPrecios } = require("../catalogo");
const { formaDePago } = require("../precios");
const { esPedidoEnCurso } = require("../seguimiento");
const { avisoDeHorario } = require("../salidas");

const post = (fn, body) => llamar(fn, { method: "POST", body });
const limpiar = (operativo = { ...LISTAS }) => { for (const k of Object.keys(store)) delete store[k]; store["settings/operativo"] = operativo; };

async function main() {
  // ── importes leídos de un comprobante ──
  for (const [texto, n] of [["$65.990", 65990], ["$65990.00", 65990], ["65.990,50", 65990.5], ["65,990.50", 65990.5], ["65990,5", 65990.5], ["1.000.000", 1000000]]) {
    ok(`importe: ${texto}`, importeDeTexto(texto) === n, importeDeTexto(texto));
  }
  for (const texto of ["-1000", "1,2,34", "1.000.00", "0", "sin monto"]) ok(`importe: rechaza ${texto}`, importeDeTexto(texto) === null, importeDeTexto(texto));

  // ── sabores en castellano ──
  ok("sabores: menta = mint", coincidencia("menta", ["miami", "mint"]) === 1, null);
  ok("sabores: frutillas = strawberry", coincidencia("frutillas", ["strawberry"]) === 1, null);
  ok("sabores: sandía no es menta", coincidencia("sandia", ["mint"]) === 0, null);

  // ── formas de pago ──
  for (const [texto, forma] of [["USDT en efectivo", ""], ["tarjeta", ""], ["efectivo al recibir", "efectivo"], ["al recibir (efectivo o transferencia)", "al recibir"],
    ["efectivo o transferencia", "efectivo"], ["mitad y mitad", "mitad y mitad"], ["te paso por alias", "transferencia"], ["como quieras", ""]]) {
    ok(`pago: "${texto}" → ${forma || "ninguna"}`, formaDePago(texto) === forma, formaDePago(texto));
  }

  // ── listas sin precios (para mandar como stock) ──
  const sin = sinPrecios("LISTA DE PRECIOS\nAdaptador 35W → $22.000\nBlueberry Ice (20)\n💰 1x $26.000\n🔥 2x $49.000");
  ok("sin precios: no borra productos ni cantidades de stock", sin.includes("Adaptador 35W") && sin.includes("Blueberry Ice (20)") && !sin.includes("$") && !sin.includes("1x"), sin);
  const stock = "STOCK\n\n\n🧊 ELFBAR ICE KING\n\nBlueberry Ice 🫐 (20)\nMiami Mint 🌿 (18)";
  ok("sin precios: una lista de stock queda exactamente igual", sinPrecios(stock) === stock, sinPrecios(stock));

  // ── catálogo y cotización contra las listas reales ──
  limpiar({ ...LISTAS, stockNicotinaTexto: "STOCK\nELFBAR TE 30K\nBubbaloo Grape (5)" });
  const cuatro = await post(api.agentCotizarProductos, { items: [{ producto: "ELFBAR TE 30K", variante: "Bubbaloo Grape", cantidad: 4 }] });
  ok("cotizar: cuatro TE sin combo son $92.000", cuatro.body.totalProductos === 92000, cuatro.body);
  const sinSabor = await post(api.agentCotizarProductos, { items: [{ producto: "ELFBAR TE 30K", cantidad: 4 }] });
  ok("cotizar: para consultar el precio alcanza el modelo, sin sabor", sinSabor.body.totalProductos === 92000, sinSabor.body);
  const repetidos = await post(api.agentCotizarProductos, { items: [{ producto: "ELFBAR TE 30K", variante: "Bubbaloo Grape", cantidad: 3 }, { producto: "ELFBAR TE 30K", variante: "Bubbaloo Grape", cantidad: 3 }] });
  ok("cotizar: suma el stock de renglones repetidos del mismo sabor", repetidos.body.ok === false && /hay solo 5/.test(repetidos.body.error), repetidos.body);
  for (const cantidad of [0, -1, 1.5, Infinity]) {
    const r = await post(api.agentCotizarProductos, { items: [{ producto: "ELFBAR TE 30K", cantidad }] });
    ok(`cotizar: rechaza la cantidad ${cantidad}`, r.body.ok === false, r.body);
  }
  const sinPreciosApi = await llamar(api.agentBuscarCatalogo, { query: { consulta: "Elfbar TE", sinPrecios: "true" } });
  ok("catálogo: si no pidió precios, no los manda", sinPreciosApi.body.resultados.length && sinPreciosApi.body.resultados.every((r) => r.precios === undefined && r.oferta === undefined), sinPreciosApi.body);
  const conPrecios = await llamar(api.agentBuscarCatalogo, { query: { consulta: "Elfbar TE" } });
  ok("catálogo: si pidió precios, los manda", conPrecios.body.resultados[0].precios.includes("$"), conPrecios.body);

  // ── fichas de los productos THC ──
  for (const consulta of ["DOZO", "BLOW"]) {
    const r = await llamar(api.agentBuscarCatalogo, { query: { consulta, sinPrecios: "true" } });
    const p = r.body.resultados.find((x) => x.nombre.includes(consulta));
    ok(`ficha: ${consulta} es descartable, sin pen ni rosca 510`, p && p.fichaProducto.requierePenExterno === false && p.fichaProducto.bateriaIntegrada && !/510/.test(p.detalle), p);
  }
  const capsula = await llamar(api.agentBuscarCatalogo, { query: { consulta: "cápsulas 028" } });
  const c028 = capsula.body.resultados.find((x) => /028/.test(x.nombre));
  ok("ficha: la cápsula 028 necesita una batería compatible", c028 && c028.fichaProducto.requierePenExterno && /no confirma compatibilidad universal/.test(c028.fichaProducto.compatibilidadPen), c028);
  const vape = await llamar(api.agentBuscarCatalogo, { query: { consulta: "Elfbar TE" } });
  ok("ficha: un vape de nicotina no lleva ficha THC", !vape.body.resultados[0].fichaProducto, vape.body.resultados[0]);

  // ── formas de pago en el resumen ──
  limpiar();
  await conHora("2026-10-06T09:00:00", async () => {
    const usdt = await resumen({ medioPago: "USDT en efectivo" });
    ok("resumen: USDT no es efectivo ni transferencia", usdt.body.ok === false, usdt.body);
    const efectivo = await resumen({ medioPago: "efectivo al recibir" });
    ok("resumen: efectivo al recibir lleva el descuento", efectivo.body.ok && efectivo.body.mensaje.includes("Descuento por efectivo"), efectivo.body);
    const alRecibir = await resumen({ medioPago: "al recibir (efectivo o transferencia)" });
    ok("resumen: al recibir no inventa el descuento", alRecibir.body.ok && !alRecibir.body.mensaje.includes("Descuento por efectivo"), alRecibir.body);
  });

  // ── qué pedido cuenta como "en curso" ──
  const ahora = Date.parse("2026-10-25T19:30:00-03:00");
  const viejo = { estado: "armado", tipoEnvio: "uber", createdAt: "2026-10-19T22:39:55Z", armadoAt: "2026-10-19T22:42:05Z", fechaSalida: "2026-10-19", origen: "bot_n8n" };
  ok("en curso: una compra de hace días no es la de ahora", !esPedidoEnCurso(viejo, ahora), null);
  ok("en curso: un pendiente de hoy sí", esPedidoEnCurso({ ...viejo, estado: "pendiente", createdAt: "2026-10-25T18:00:00-03:00", armadoAt: null, fechaSalida: "2026-10-25" }, ahora), null);
  ok("en curso: uno agendado para más adelante sigue, aunque se compró hace días", esPedidoEnCurso({ ...viejo, fechaSalida: "2026-10-28" }, ahora), null);
  ok("en curso: entregado no", !esPedidoEnCurso({ ...viejo, estado: "entregado", fechaSalida: "2026-10-25", entregadoEn: "2026-10-25T19:00:00-03:00" }, ahora), null);
  ok("en curso: finalizado no bloquea una compra nueva", !esPedidoEnCurso({ ...viejo, estado: "finalizado", fechaSalida: "2026-10-25" }, ahora), null);
  ok("en curso: un registro sin fecha no prueba nada", !esPedidoEnCurso({ estado: "armado", tipoEnvio: "uber" }, ahora), null);
  ok("en curso: el correo conserva cuatro días de tránsito", esPedidoEnCurso({ ...viejo, tipoEnvio: "correo", createdAt: "2026-10-23T12:00:00-03:00", armadoAt: null, fechaSalida: null }, ahora), null);

  // ── una compra nueva no usa el pedido de una compra anterior ──
  await conHora("2026-10-25T17:05:00", async () => {
    limpiar({ ...LISTAS, limitePorTanda: 100 });
    const telefono = "5491100000333";
    store["pedidos/anterior"] = { ...viejo, telefono, cliente: "Cliente QA", items: [{ producto: "Cápsulas MUHA MEDS", cantidad: 2 }], total: 101990 };
    const antes = structuredClone(store);
    const r = await post(api.agentPedido, { pedidoId: "anterior", telefono, items: [{ producto: "Dozo Live Rosin", cantidad: 1 }] });
    ok("compra nueva: el pedido viejo no se modifica ni deriva", r.body.ok === false && r.body.motivo === "pedido_anterior" && r.body.continuarCompra && !r.body.derivar, r.body);
    ok("compra nueva: no cambia nada guardado", JSON.stringify(store) === JSON.stringify(antes), null);
    const estado = await llamar(api.agentEstadoOperativo, { query: { telefono } });
    ok("compra nueva: el estado del día no lo muestra como pedido actual", estado.body.pedidoActual === null, estado.body.pedidoActual);
    store["pedidos/agendado"] = { ...store["pedidos/anterior"], fechaSalida: "2026-10-28" };
    store["pedidos/entregado"] = { ...store["pedidos/anterior"], estado: "entregado", createdAt: "2026-10-25T10:00:00-03:00", entregadoEn: "2026-10-25T12:00:00-03:00" };
    const agendado = await llamar(api.agentEstadoOperativo, { query: { telefono } });
    ok("en curso: encuentra el agendado aunque el más nuevo ya se entregó", agendado.body.pedidoActual?.id === "agendado", agendado.body.pedidoActual);
  });

  // ── el reparto en la calle, solo si es el de hoy y el de ese pedido ──
  await conHora("2026-10-25T19:30:00", async () => {
    limpiar();
    const telefono = "5491100000444";
    const enCalle = async (pedido, salidaEn) => {
      store["pedidos/moto"] = { telefono, origen: "bot_n8n", estado: "armado", tipoEnvio: "moto", repartidor: "moto1", createdAt: "2026-10-25T12:00:00-03:00", ...pedido };
      store["recorridos/activo"] = { estado: "en_calle", salidaEn };
      return (await llamar(api.agentEstadoOperativo, { query: { telefono } })).body.pedidoActual.puedeAfirmarEnCamino;
    };
    ok("reparto: un recorrido de otro día no despacha este pedido", !(await enCalle({ fechaSalida: "2026-10-25" }, "2026-10-24T18:30:00-03:00")), null);
    ok("reparto: el recorrido de hoy sí", await enCalle({ fechaSalida: "2026-10-25" }, "2026-10-25T18:30:00-03:00"), null);
    ok("reparto: el de hoy no despacha un pedido de mañana", !(await enCalle({ fechaSalida: "2026-10-26" }, "2026-10-25T18:30:00-03:00")), null);
  });

  // ── horarios ──
  await conHora("2026-10-27T19:10:00", async () => {
    const cerca = avisoDeHorario({}, null, { fecha: "2026-10-27", hora: "19:30", dia: "hoy" });
    ok("horario: cerca de las 20 avisa sin exigir anticipado en moto al recibir", cerca.cercaDelCierre && cerca.aviso.texto.includes("20:00") && cerca.aviso.texto.includes("no necesitan el 100% anticipado"), cerca);
  });
  await conHora("2026-10-27T13:00:00", async () => {
    limpiar({ ...LISTAS, limitePorTanda: 100 });
    const estado = await llamar(api.agentEstadoOperativo);
    ok("uber: la plantilla de entregas dice que se puede coordinar un horario", estado.body.plantillas.FORMAS_DE_ENTREGA.includes("Podés coordinar un horario de envío"), null);
    const telefono = "5491100000888", direccion = "Cabildo 2000, Belgrano";
    const items = [{ producto: "ELFBAR TE 30K", variante: "Bubbaloo Grape", cantidad: 1 }];
    const q = await post(api.agentCrearCotizacionUber, { idConversacion: "qa-uber-horario", telefonoCliente: telefono, direccion, pedido: { items, cliente: "QA horario", horaSolicitada: "16:30" } });
    const clave = "cotizaciones_uber/" + q.body.id;
    ok("uber: la cotización guarda las 16:30 que pidió el cliente", store[clave]?.pedidoBorrador?.horaSolicitada === "16:30", store[clave]);
    store[clave] = { ...store[clave], estado: "cotizado", montoUber: 7500, resueltoEn: new Date().toISOString() };
    const r = await resumen({ telefono, tipoEnvio: "uber", direccion: { texto: direccion }, items, horaSolicitada: "16:30" });
    ok("uber: el resumen sale a las 16:30 pedidas y no en la primera tanda", r.body.ok && /16:30 \(horario pedido por el cliente\)/.test(r.body.mensaje) && r.body.total === 23000 + 7500, r.body);
  });

  const fallas = resultados.filter((r) => !r.ok);
  for (const r of resultados) console.log(`${r.ok ? "OK  " : "FALLA"} - ${r.nombre}${r.ok ? "" : "\n        " + String(JSON.stringify(r.detalle)).slice(0, 600)}`);
  console.log(`\n${resultados.length - fallas.length}/${resultados.length} pasaron.`);
  process.exit(fallas.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
