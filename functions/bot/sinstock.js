// «No hay stock»: el depósito marca en /pedidos qué producto de un pedido no está, y el bot se lo avisa
// al cliente en su conversación con lo que sí hay. Mismo camino que el aviso del Uber (uber.js): el
// backend no llama al n8n, el n8n consulta cada minuto.
//
// El pedido guarda
//   sinStock = { faltantes: [{ producto, variante, cantidad }], nota, marcadoEn, avisadoEn?, resueltoEn? }
//   avisoSinStock = "pendiente" | "enviado" | "sin_whatsapp" | "descartado"   (campo suelto, para buscarlo)
"use strict";

const { db } = require("./firebase");
const { conClave, rechazar } = require("./http");
const { palabras, coincidencia, pesos, sinEmojis, textoDe } = require("./texto");
const { buscarEnCatalogo, esNombre, LISTAS_DEL_PANEL } = require("./catalogo");
const { leerOperativo } = require("./campania");
const { estaPagado, restriccionCambio } = require("./seguimiento");

const AVISO_MAX_MS = 24 * 3600000;
const sinVolver = (s) => String(s || "").replace(/\s*\(\d+\)\s*$/, "").trim();

// Lo que hay en lugar de un faltante: otros sabores del mismo modelo con stock (sin el que falta) y, si
// el modelo no tiene otro, los modelos parecidos que salgan en el buscador del catálogo.
function alternativasDe(op, faltante) {
  const r = buscarEnCatalogo(op, faltante.producto, { conPrecios: true });
  const falta = palabras(faltante.variante);
  const mismoSabor = (s) => falta.length && falta.every((w) => coincidencia(w, palabras(sinVolver(s))) > 0);
  return (r.resultados || []).map((x) => {
    const sabores = Array.isArray(x.saboresConStock) ? x.saboresConStock.filter((s) => !mismoSabor(s)) : null;
    return { producto: x.nombre, precios: x.precios || null, sabores };
  }).filter((x) => x.sabores === null || x.sabores.length).slice(0, 4);
}

const { nombreFaltante } = require("./seguimiento");

// La lista de cada categoría que se le manda al cliente entera ("todo el stock actual", Marcos 27/11):
// de vapes y THC, la de stock; de perfumes y Apple, que no tienen stock aparte, la de productos.
const LISTA_A_MANDAR = { PRECIOS_VAPES: "STOCK_NICOTINA", PRECIOS_THC: "STOCK_THC", STOCK_NICOTINA: "STOCK_NICOTINA", STOCK_THC: "STOCK_THC", PERFUMES: "PERFUMES", APPLE_ACCESORIOS: "APPLE_ACCESORIOS" };
const contiene = (todas, buscadas) => buscadas.length && buscadas.every((w) => coincidencia(w, todas) > 0);

// La lista de stock tal como está en /operativo, sin los sabores en (0) y sin el que el depósito acaba de
// marcar que falta (puede que todavía no lo haya sacado de la lista).
function listaSinFaltantes(texto, faltantes) {
  let modelo = [];
  return String(texto || "").split("\n").filter((linea) => {
    const limpia = linea.trim();
    if (!limpia) return true;
    if (esNombre(limpia)) { modelo = palabras(sinEmojis(limpia)); return true; }
    if (/\(0\)\s*$/.test(limpia)) return false;
    const sabor = palabras(sinEmojis(limpia.replace(/\(\d+\)\s*$/, "")));
    return !faltantes.some((f) => {
      const delProducto = palabras(f.producto).filter((w) => !coincidencia(w, sabor));
      const mismoModelo = contiene(modelo, delProducto) || contiene(palabras(f.producto), modelo);
      return mismoModelo && contiene(sabor, palabras(f.variante || "") );
    });
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Las listas completas de las categorías de los faltantes: [{ lista, texto }].
function stockActualizado(op, faltantes) {
  const nombres = new Set();
  for (const f of faltantes) {
    const lista = buscarEnCatalogo(op, f.producto, { conPrecios: false }).resultados?.[0]?.lista;
    if (LISTA_A_MANDAR[lista]) nombres.add(LISTA_A_MANDAR[lista]);
  }
  // Si no se reconoce el producto, van las dos de stock.
  if (!nombres.size) { nombres.add("STOCK_NICOTINA"); nombres.add("STOCK_THC"); }
  return [...nombres].map((lista) => ({ lista, texto: listaSinFaltantes(textoDe(op[LISTAS_DEL_PANEL[lista]]), faltantes) })).filter((x) => x.texto);
}

// Un texto armado para el cliente, por si el bot lo quiere usar tal cual (el agente igual puede redactarlo).
function mensajeSugerido(cliente, faltantes, stock, nota) {
  const nombre = String(cliente || "").split(/\s+/)[0];
  const L = [`Hola${nombre ? ` ${nombre}` : ""}! Te escribimos por tu pedido: nos quedamos sin ${faltantes.map(nombreFaltante).join(" ni ")} 😔`];
  if (nota) L.push(nota);
  if (stock.length) {
    L.push("", "Te paso el stock actualizado:");
    for (const s of stock) L.push("", s.texto);
    L.push("", "¿Querés cambiarlo por alguno de estos?");
  } else {
    L.push("¿Querés cambiarlo por otro producto?");
  }
  return L.join("\n");
}

// GET /agentAvisosSinStock — los pedidos que el depósito marcó sin stock y el bot todavía no avisó.
// Un pedido que ya no está en curso (se canceló, salió) o que se marcó hace más de 24 horas queda
// "descartado" sin aviso. Uno sin conversación de WhatsApp (cargado a mano) queda "sin_whatsapp": el
// panel le dice al depósito que avise él.
// POST /agentAvisosSinStock { pedidoId, enviadoEn } — el bot ya se lo mandó al cliente.
const agentAvisosSinStock = conClave(async (req, res) => {
  const ahora = new Date().toISOString();
  if (req.method === "POST") {
    const id = String(req.body?.pedidoId || "").trim();
    if (!id) return rechazar(res, "falta el pedidoId");
    const ref = db.collection("pedidos").doc(id);
    const actual = await ref.get();
    if (!actual.exists || actual.data().avisoSinStock !== "pendiente") return res.json({ ok: true, marcado: false });
    await ref.update({ avisoSinStock: "enviado", sinStock: { ...actual.data().sinStock, avisadoEn: String(req.body.enviadoEn || ahora) } });
    return res.json({ ok: true, marcado: true });
  }
  const snap = await db.collection("pedidos").where("avisoSinStock", "==", "pendiente").get();
  if (snap.empty) return res.json({ ok: true, avisos: [] });
  const op = await leerOperativo();
  const avisos = [];
  for (const d of snap.docs) {
    const p = d.data();
    const s = p.sinStock || {};
    const faltantes = (s.faltantes || []).filter((f) => f && f.producto);
    const vigente = ["pendiente", "armado"].includes(p.estado) && !s.resueltoEn && faltantes.length
      && Date.now() - (Date.parse(s.marcadoEn || "") || 0) < AVISO_MAX_MS;
    if (!vigente) {
      await db.collection("pedidos").doc(d.id).update({ avisoSinStock: "descartado" });
      continue;
    }
    if (!p.telefono || !p.idConversacion) {
      await db.collection("pedidos").doc(d.id).update({ avisoSinStock: "sin_whatsapp" });
      continue;
    }
    const alternativas = faltantes.map((f) => ({ faltante: nombreFaltante(f), opciones: alternativasDe(op, f) }));
    const stock = stockActualizado(op, faltantes);
    const cambio = restriccionCambio(p);
    const pagado = estaPagado(p);
    avisos.push({
      pedidoId: d.id,
      idConversacion: p.idConversacion,
      telefono: p.telefono,
      cliente: p.cliente || "",
      faltantes: faltantes.map((f) => ({ producto: f.producto, variante: f.variante || "", cantidad: Number(f.cantidad) || 1 })),
      nota: s.nota || "",
      alternativas,
      // Todo el stock actual de esa categoría (Marcos 27/11: que le mande todo el stock actualizado).
      stockActual: stock,
      pagado,
      total: typeof p.total === "number" ? p.total : null,
      totalTexto: typeof p.total === "number" ? pesos(p.total) : null,
      // Lo mismo que agentEstadoOperativo.pedidoActual.cambio: si el bot puede cambiar el pedido o se deriva.
      puedeModificar: p.origen === "bot_n8n" && cambio.permitido,
      cambio,
      // Si el cliente no quiere otro producto: pagado, se deriva a una persona (Marcos 27/11), nunca se
      // ofrece devolución desde el bot; sin pagar, se saca el producto o se cancela.
      siNoQuiereOtro: pagado
        ? "Ya pagó: no ofrezcas devolución. Derivá a una persona del equipo con el motivo sin_stock_pagado y contale qué faltaba."
        : "No pagó: si no quiere otro, sacá ese producto del pedido con agentPedido (o cancelalo si no queda nada) y confirmale el nuevo total.",
      mensajeSugerido: mensajeSugerido(p.cliente, faltantes, stock, s.nota),
    });
  }
  res.json({ ok: true, avisos });
});

module.exports = { agentAvisosSinStock, alternativasDe };
