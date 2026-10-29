// Información de productos de la web (028import.com): qué es cada modelo, sus especificaciones y el perfil
// de cada sabor, para que el bot conteste preguntas como «¿qué diferencia hay entre estos dos?». Una vez
// por día se lee el sitemap y los datos estructurados (JSON-LD) de cada producto y queda en settings/infoWeb.
// De la web sale solo la descripción: precio, stock y sabores salen siempre del panel (la web no siempre
// está al día), así que se borra todo renglón con precios o promociones.
"use strict";

const axios = require("axios");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { db } = require("./firebase");
const { conClave } = require("./http");
const { normalizar } = require("./texto");

const WEB = "https://028import.com";
const MAX_DESCRIPCION = 900;

// La descripción sin precios, promociones, stock ni lo que dice la tienda sobre originalidad o garantía:
// eso sale del panel y de las reglas del bot, no de la web.
function limpiarDescripcion(texto) {
  const renglones = String(texto || "").replace(/\r/g, "").split("\n").map((l) => l.trim())
    .filter((l) => !/\$\s?\d|\d+\s?x\s?\$|precio|ahorr|descuento|oferta|promo|2x|3x|5x/i.test(l))
    .filter((l) => !/stock|reposici|reingreso|agotad|disponible|\d+\s+sabores|original|foxconn|garant/i.test(l))
    .filter((l) => !/^[━─—_\-=·•\s]+$/.test(l) && !/028 import/i.test(l));
  return renglones.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_DESCRIPCION);
}

// El producto de una página de la web, de su JSON-LD: { modelo, sabor, descripcion, url } o null.
function extraerProducto(html, url) {
  for (const m of String(html || "").matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let d;
    try { d = JSON.parse(m[1]); } catch { continue; }
    if (d && d["@type"] === "Product") {
      const descripcion = limpiarDescripcion(d.description);
      const modelo = String(d.brand?.name || "").trim();
      if (!modelo || !descripcion) return null;
      return { modelo, sabor: String(d.name || "").trim(), descripcion, url };
    }
  }
  return null;
}

// Las especificaciones de un modelo (el bloque «Especificaciones» de la descripción), o la descripción entera.
function especificaciones(descripcion) {
  const m = String(descripcion).match(/especificaciones\s*\n+([\s\S]*?)(?:\n\s*\n|$)/i);
  return (m ? m[1] : descripcion).trim().slice(0, 500);
}

// Palabras que no distinguen un producto de otro.
const GENERICAS = new Set(["edition", "edicion", "de", "the", "y", "con", "ml", "g", "mg"]);
const palabrasClave = (t) => normalizar(t).split(/\s+/).filter((w) => w && !GENERICAS.has(w));

// Lo que dice la web de un modelo del panel y de los sabores que preguntó el cliente. En la web, los vapes de
// nicotina tienen el modelo en la marca y el sabor en el nombre; el resto (THC, perfumes, Apple) tiene la
// categoría en la marca y el producto en el nombre. Coincide si todas las palabras de la web (al menos dos)
// están en el nombre del panel, que suele agregar «40K» o «NUEVO»: «ELFBAR ICE KING» es «ELFBAR ICE KING 40K»,
// pero «AMBER OUD GOLD» no es «AMBER OUD WHITE». Al revés solo vale si lo que sobra son números o medidas:
// «AIRPODS PRO GEN 4» no es «AIRPODS GEN 4».
function infoWebDe(productos, nombreModelo, saboresPedidos = []) {
  const delPanel = palabrasClave(nombreModelo);
  const coincide = (texto) => {
    const w = palabrasClave(texto);
    if (w.length < 2 || delPanel.length < 2) return false;
    return w.every((x) => delPanel.includes(x)) || (delPanel.every((x) => w.includes(x)) && w.filter((x) => !delPanel.includes(x)).every((x) => /^\d/.test(x)));
  };
  const porModelo = (productos || []).filter((p) => coincide(p.modelo));
  if (porModelo.length) {
    const sabor = (s) => normalizar(String(s).replace(/\s*\(\d+\)\s*$/, ""));
    const pedidos = saboresPedidos.map(sabor).filter(Boolean);
    const sabores = porModelo.filter((p) => pedidos.includes(normalizar(p.sabor))).slice(0, 2)
      .map((p) => ({ sabor: p.sabor, descripcion: p.descripcion }));
    // Del modelo, la descripción más completa: la que trae las especificaciones o, si no, la más larga.
    const completa = [...porModelo].sort((a, b) => /especificaciones/i.test(b.descripcion) - /especificaciones/i.test(a.descripcion)
      || b.descripcion.length - a.descripcion.length)[0];
    return { modelo: especificaciones(completa.descripcion), ...(sabores.length ? { sabores } : {}) };
  }
  const porNombre = (productos || []).find((p) => coincide(p.sabor));
  return porNombre ? { modelo: porNombre.descripcion.slice(0, 600) } : null;
}

// La lectura de la web guardada (se cachea unos minutos: cambia una vez por día).
let cache = null;
async function leerInfoWeb() {
  if (cache && Date.now() - cache.leido < 10 * 60000) return cache.productos;
  const d = await db.collection("settings").doc("infoWeb").get();
  cache = { leido: Date.now(), productos: d.exists ? d.data().productos || [] : [] };
  return cache.productos;
}

// Lee todos los productos de la web. Si falla o no encuentra ninguno, no pisa lo que ya había.
async function actualizarInfoWeb() {
  const { data: sitemap } = await axios.get(WEB + "/sitemap.xml", { timeout: 20000, responseType: "text" });
  const urls = [...new Set([...String(sitemap).matchAll(/<loc>([^<]+\/producto\/[^<]+)<\/loc>/g)].map((m) => m[1].trim()))];
  const productos = [];
  for (let i = 0; i < urls.length; i += 4) {
    const tanda = await Promise.all(urls.slice(i, i + 4).map((url) => axios.get(url, { timeout: 15000, responseType: "text" })
      .then((r) => extraerProducto(r.data, url)).catch(() => null)));
    productos.push(...tanda.filter(Boolean));
  }
  if (!productos.length) throw new Error(`la web no devolvió productos (${urls.length} páginas en el sitemap)`);
  await db.collection("settings").doc("infoWeb").set({ productos, cantidad: productos.length, actualizado: new Date().toISOString() });
  cache = null;
  return { productos: productos.length, paginas: urls.length };
}

// Todos los días a las 6 (Buenos Aires), antes de que empiece la atención.
const actualizarInfoWebDiario = onSchedule({ schedule: "0 6 * * *", timeZone: "America/Argentina/Buenos_Aires", timeoutSeconds: 300 }, async () => {
  const r = await actualizarInfoWeb();
  console.log("[bot] info de la web actualizada", r);
});

// POST /agentActualizarInfoWeb — para actualizarla en el momento (por ejemplo, después de cambiar la web).
const agentActualizarInfoWeb = conClave(async (req, res) => {
  res.json({ ok: true, ...(await actualizarInfoWeb()) });
});

module.exports = { limpiarDescripcion, extraerProducto, infoWebDe, leerInfoWeb, actualizarInfoWebDiario, agentActualizarInfoWeb };
