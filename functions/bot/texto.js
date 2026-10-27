// Comparar y formatear texto: lo que escribe el cliente (o el modelo) contra lo que cargó el depósito.
"use strict";

const crypto = require("crypto");

// "Honor & Glory" → "honor glory". Saca tildes, emojis y la capacidad en puffs ("35K"), que el
// agente a veces pega al nombre pero nunca forma parte de él.
const normalizar = (texto) =>
  String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b\d+k\b/g, " ")
    .replace(/\b(y|and)\b/g, " ")
    .replace(/ +/g, " ")
    .trim();

// "combo" tampoco distingue un producto: en las listas va en el título de la sección ("COMBOS
// DISPONIBLES"), no en el nombre de cada combo.
const PALABRAS_VACIAS = new Set(["de", "del", "la", "el", "los", "las", "con", "a", "x", "combo", "combos"]);
const palabras = (texto) => normalizar(texto).split(" ").filter((p) => p && !PALABRAS_VACIAS.has(p));

const sinEmojis = (linea) => linea.replace(/[^\p{L}\p{N}\s.,&'’%-]/gu, " ").replace(/\s+/g, " ").trim();

const textoDe = (v) => (typeof v === "string" ? v.trim() : "");

function distanciaLevenshtein(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const arriba = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = arriba;
    }
  }
  return fila[b.length];
}

// Los sabores de las listas están en inglés y los clientes los piden en castellano ("menta" es Miami
// Mint, Cool Mint o Menthol): cada grupo son palabras que valen lo mismo. Solo sabores, nunca marcas.
const GRUPOS_DE_SABOR = [
  ["menta", "mint", "menthol", "mentol", "peppermint", "spearmint"],
  ["frutilla", "fresa", "strawberry"],
  ["sandia", "watermelon"],
  ["uva", "grape"],
  ["durazno", "melocoton", "peach"],
  ["manzana", "apple"],
  ["anana", "pina", "pineapple"],
  ["arandano", "blueberry"],
  ["cereza", "cherry", "cherries"],
  ["limon", "lemon"],
  ["frambuesa", "raspberry"],
  ["mora", "blackberry"],
  ["naranja", "orange"],
  ["maracuya", "passion"],
  ["guayaba", "guava"],
  ["coco", "coconut"],
  ["vainilla", "vanilla"],
  ["hielo", "frio", "ice", "freeze", "frozen", "frost"],
];
const GRUPO_DE = new Map(GRUPOS_DE_SABOR.flatMap((g) => g.map((w) => [w, g])));
const sinPlural = (w) => (GRUPO_DE.has(w) ? w : w.replace(/(es|s)$/, ""));
const mismoSabor = (a, b) => {
  const [x, y] = [sinPlural(a), sinPlural(b)];
  return GRUPO_DE.has(x) && GRUPO_DE.get(x) === GRUPO_DE.get(y);
};

// 1 si la palabra está tal cual (o es el mismo sabor en otro idioma), algo menos si está con un typo,
// 0 si no está. Las palabras cortas y las que tienen números ("028", "v400", "35w") solo valen exactas.
function coincidencia(palabra, lista) {
  let mejor = 0;
  // Singular y plural son la misma palabra ("cápsula" / "CÁPSULAS", "cargador" / "cargadores"): si no,
  // el plural de la lista pierde contra un singular exacto de otro producto.
  const plural = (a, b) => a.length > 3 && !/\d/.test(a) && (b === a + "s" || b === a + "es");
  for (const w of lista) {
    if (w === palabra || plural(w, palabra) || plural(palabra, w) || mismoSabor(palabra, w)) return 1;
    if (palabra.length > 3 && !/\d/.test(palabra)) {
      const largo = Math.max(w.length, palabra.length);
      mejor = Math.max(mejor, (largo - distanciaLevenshtein(palabra, w)) / largo);
    }
  }
  return mejor >= 0.8 ? mejor : 0;
}

// Teléfono → 549XXXXXXXXXX, igual que el webhook de index.js.
function normalizarTelefono(tel) {
  let n = String(tel || "").replace(/\D/g, "");
  if (n.startsWith("54") && n.length === 12) n = "549" + n.slice(2);
  if (!n.startsWith("54") && n.length === 10) n = "549" + n;
  return n;
}

const hashCorto = (valor) => crypto.createHash("sha256").update(String(valor)).digest("hex").slice(0, 32);

const pesos = (n) => `$${Number(n || 0).toLocaleString("es-AR")}`;

// "$65.990", "65.990,50", 65990 → número. null si no es un importe positivo claro.
function importeDeTexto(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) && valor > 0 ? valor : null;
  let s = String(valor ?? "").trim();
  if (/^-|\(-?\s*\d/.test(s)) return null;
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const ultimo = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  const decimales = ultimo >= 0 ? s.length - ultimo - 1 : 0;
  if (ultimo >= 0 && decimales > 0 && decimales <= 2) {
    const entero = s.slice(0, ultimo);
    if (entero.includes(s[ultimo]) || !/^\d+$|^\d{1,3}(?:[.,]\d{3})+$/.test(entero)) return null;
    s = entero.replace(/[.,]/g, "") + "." + s.slice(ultimo + 1);
  } else if (ultimo >= 0) {
    if (!/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) return null;
    s = s.replace(/[.,]/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER ? Math.round(n * 100) / 100 : null;
}

module.exports = {
  normalizar, palabras, sinEmojis, textoDe, coincidencia, normalizarTelefono, hashCorto, pesos, importeDeTexto,
};
