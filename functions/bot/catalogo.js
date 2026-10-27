// Catálogo: las listas de precios y de stock que el depósito carga en /operativo, leídas como texto.
//
// Las listas son texto libre, con bloques como
//     ✨ ELFBAR EB CREATE 40K        ← nombre (en mayúsculas)
//     🚀 Modelo económico            ← descripción
//     💰 1x $22.000                  ← precio por cantidad: "2x $40.000" es el combo de 2 entero
// o precios sueltos ("💰 $75.000" = una unidad) y renglones con nombre y precio juntos
// ("🔌 USB-C a Lightning → $13.000"). Las de stock tienen un título por modelo y debajo sus sabores,
// en nicotina con la cantidad entre paréntesis ("Miami Mint 🌴🌿❄️ (3)").
"use strict";

const { normalizar, palabras, sinEmojis, textoDe, coincidencia, pesos } = require("./texto");

// Listas del panel: nombre de la plantilla → campo de settings/operativo.
const LISTAS_DEL_PANEL = {
  STOCK_NICOTINA: "stockNicotinaTexto",
  PRECIOS_VAPES: "preciosVapesTexto",
  STOCK_THC: "stockThcTexto",
  PRECIOS_THC: "preciosThcTexto",
  PERFUMES: "perfumesTexto",
  APPLE_ACCESORIOS: "appleTexto",
  PRECIOS_MAYORISTA: "preciosMayoristaTexto",
  OFERTAS: "ofertasTexto",
  COMBOS_BATERIAS: "combosBateriasTexto",
};
const NOMBRE_LISTA = Object.fromEntries(Object.entries(LISTAS_DEL_PANEL).map(([nombre, campo]) => [campo, nombre]));
// Listas minoristas en pesos: todas menos las de stock, la mayorista (en USD, ver precios.js) y las
// ofertas (pisan precios). Una lista nueva que se sume a LISTAS_DEL_PANEL se cobra sola.
const LISTAS_CON_PRECIO = Object.values(LISTAS_DEL_PANEL)
  .filter((campo) => !/^stock/.test(campo) && !["preciosMayoristaTexto", "ofertasTexto"].includes(campo));
// La lista de stock de cada lista de precios (perfumes y Apple no tienen).
const STOCK_DE = { preciosVapesTexto: "stockNicotinaTexto", preciosThcTexto: "stockThcTexto" };

const SEPARADOR_RE = /^[\s⸻━─—–=_-]+$/;
const PRECIO_RE = /\$\s*([\d.,]+)/;
const CANTIDAD_RE = /(\d+)\s*x\b/i;

function esNombre(linea) {
  const letras = linea.match(/\p{L}/gu) || [];
  const mayusculas = letras.filter((c) => c !== c.toLowerCase()).length;
  return letras.length >= 2 && mayusculas / letras.length >= 0.6;
}

// Cada producto guarda además `lineas`: todos los renglones de texto de su bloque (título de sección,
// nombre y descripción). El nombre se adivina por las mayúsculas, y cada lista se escribe distinto
// ("🔥 COMBOS DISPONIBLES" arriba de "🖊️ Batería ELFTHC + Cápsula 028 1ML"): buscarProducto busca en
// todos los renglones, así un producto se encuentra aunque su nombre no sea el renglón elegido.
function parsearProductos(texto) {
  const productos = [];
  let nombres = [];
  let detalles = [];
  let bloque = []; // los renglones de texto desde el último precio o separador
  let vienePrecio = false;
  let actual = null; // el producto que está recibiendo renglones de precio
  for (const cruda of String(texto || "").split("\n")) {
    const linea = cruda.trim();
    if (!linea) continue;
    if (SEPARADOR_RE.test(linea)) {
      nombres = [];
      detalles = [];
      bloque = [];
      actual = null;
      continue;
    }
    const precio = linea.match(PRECIO_RE);
    if (precio) vienePrecio = true;
    if (!precio) {
      if (vienePrecio) bloque = []; // texto después de precios: empieza el bloque de otro producto
      vienePrecio = false;
      actual = null;
      if (/lista|precio/i.test(linea)) continue; // encabezados: "LISTA DE PRECIOS", "PRECIO LIQUIDACIÓN"
      (esNombre(linea) ? nombres : detalles).push(sinEmojis(linea));
      bloque.push(sinEmojis(linea));
      continue;
    }
    const monto = parseInt(precio[1].replace(/\D/g, ""), 10);
    if (!(monto > 0)) continue;
    const antes = linea.slice(0, precio.index);
    const cantidad = Number((antes.match(CANTIDAD_RE) || [])[1]) || 1;
    const nombreEnLinea = sinEmojis(antes.replace(CANTIDAD_RE, " "));
    if ((nombreEnLinea.match(/\p{L}/gu) || []).length >= 3) {
      productos.push({ nombre: nombreEnLinea, detalle: [...nombres, ...detalles].join(" "), lineas: [nombreEnLinea], precios: { [cantidad]: monto } });
      continue;
    }
    if (!actual) {
      actual = { nombre: nombres.join(" ") || detalles[0] || "", detalle: detalles.join(" "), lineas: bloque, precios: {} };
      productos.push(actual);
      nombres = [];
      detalles = [];
    }
    actual.precios[cantidad] = monto;
  }
  return productos.filter((p) => p.nombre);
}

// Los productos de todas las listas en pesos, cada uno con la lista de la que salió.
const productosEnPesos = (op) => LISTAS_CON_PRECIO.flatMap((campo) => parsearProductos(op[campo]).map((p) => ({ ...p, lista: campo })));

// Busca el producto que nombró el agente. Casi todas sus palabras tienen que estar en el producto, y
// se compara con cada renglón del producto (su nombre y los de su bloque): gana el renglón más
// parecido, así "Ignite V400" no se confunde con "Ignite V400 Mix" y "Batería ELFTHC" no se confunde
// con el combo "Batería ELFTHC + Cápsula 028 1ML". Si dos quedan empatados es ambiguo y no se elige.
function buscarProducto(productos, nombre) {
  const q = palabras(nombre);
  if (!q.length) return null;
  const candidatos = [];
  for (const p of productos) {
    const renglones = [p.nombre, ...(p.lineas || [])];
    const enTodo = [...renglones, p.detalle].flatMap(palabras);
    const encontradas = q.filter((w) => coincidencia(w, enTodo) > 0).length;
    if (encontradas / q.length < 2 / 3) continue;
    let mejor = null;
    for (const renglon of renglones) {
      const enRenglon = palabras(renglon);
      if (!enRenglon.length) continue;
      const parecido = q.reduce((s, w) => s + coincidencia(w, enRenglon), 0) / q.length;
      if (!parecido) continue;
      // Pesa más cuánto del pedido está en el renglón que cuánto del renglón cubre el pedido: si no,
      // una descripción corta ("🌿 Live Rosin" de otra cápsula) le gana al nombre ("DOZO LIVE ROSIN 2.5G").
      const cubierto = enRenglon.filter((w) => coincidencia(w, q) > 0).length / enRenglon.length;
      const puntaje = 2 * parecido + cubierto;
      if (!mejor || puntaje > mejor.puntaje) mejor = { puntaje, renglon };
    }
    if (mejor) candidatos.push({ p, ...mejor });
  }
  candidatos.sort((a, b) => b.puntaje - a.puntaje);
  if (!candidatos.length) return null;
  if (candidatos[1] && candidatos[1].puntaje === candidatos[0].puntaje) {
    return { ambiguo: [candidatos[0].renglon, candidatos[1].renglon] };
  }
  return { producto: candidatos[0].p };
}

// { producto, precios } o { error } para una línea del pedido. Las ofertas pisan los precios de la
// lista para las cantidades que tengan cargadas.
function productoDeLinea(listas, ofertas, item) {
  const regular = buscarProducto(listas, item.producto);
  const oferta = buscarProducto(ofertas, item.producto);
  const ambiguo = (regular && regular.ambiguo) || (oferta && oferta.ambiguo);
  if (ambiguo) {
    return { error: `"${item.producto}" coincide con más de un producto (${ambiguo.join(" / ")}): usá el nombre exacto de la lista` };
  }
  if (!(regular && regular.producto) && !(oferta && oferta.producto)) {
    return { error: `no encontré "${item.producto}" en las listas de precios de hoy: usá el nombre tal cual figura en la lista` };
  }
  const precios = { ...(regular && regular.producto && regular.producto.precios), ...(oferta && oferta.producto && oferta.producto.precios) };
  return { producto: (regular && regular.producto) || oferta.producto, precios };
}

// Un modelo sin stock no aparece en la lista.
function parsearStock(texto) {
  const modelos = [];
  for (const cruda of String(texto || "").split("\n")) {
    const linea = cruda.trim();
    if (!linea || SEPARADOR_RE.test(linea) || /stock|lista/i.test(linea)) continue;
    if (esNombre(linea)) {
      // Un título sin sabores seguido de otro título es de sección ("DESCARTABLES THC"), no un modelo.
      if (modelos.length && !modelos[modelos.length - 1].sabores.length) modelos.pop();
      modelos.push({ nombre: sinEmojis(linea), titulo: linea, detalle: "", sabores: [] });
    } else if (modelos.length) {
      const cantidad = linea.match(/\((\d+)\)\s*$/);
      modelos[modelos.length - 1].sabores.push({ texto: sinEmojis(linea.replace(/\(\d+\)\s*$/, "")), cantidad: cantidad ? Number(cantidad[1]) : null, linea });
    }
  }
  return modelos;
}

// El modelo de la lista de stock para un nombre de la lista de precios. En precios el nombre a veces
// arrastra el título de la sección ("DESCARTABLES THC DOZO LIVE ROSIN"): vale el modelo de stock
// cuyo nombre entero esté dentro del nombre de precios.
function modeloEnStock(modelos, nombre) {
  const hallado = buscarProducto(modelos, nombre);
  if (hallado && hallado.producto) return hallado.producto;
  const buscadas = palabras(nombre);
  return modelos.filter((m) => palabras(m.nombre).every((w) => coincidencia(w, buscadas) > 0))
    .sort((a, b) => palabras(b.nombre).length - palabras(a.nombre).length)[0] || null;
}

// null si hay stock; si no, el error para el agente. Sin lista de stock cargada no se frena la venta.
function faltaStock(textoStock, producto, variante, cantidad) {
  if (!String(textoStock || "").trim()) return null;
  const modelo = modeloEnStock(parsearStock(textoStock), producto);
  if (!modelo) return `no hay stock de ${producto}: ofrecele otro de la lista de stock`;
  const { sabores } = modelo;
  if (!sabores.length) return null;
  const listado = sabores.filter((s) => s.cantidad !== 0).map((s) => s.texto + (s.cantidad ? ` (${s.cantidad})` : "")).join(", ");
  const pedidas = palabras(variante);
  if (!pedidas.length) return `falta el sabor de ${producto}; con stock hay: ${listado}`;
  const candidatos = sabores
    .map((s) => ({ s, puntaje: pedidas.filter((w) => coincidencia(w, palabras(s.texto)) > 0).length / pedidas.length }))
    .filter((x) => x.puntaje >= 2 / 3)
    .sort((a, b) => b.puntaje - a.puntaje || palabras(a.s.texto).length - palabras(b.s.texto).length);
  const sabor = candidatos[0];
  // "menta" en un modelo con Cool Mint y Winter Mint: no se elige uno por el cliente, se le pregunta.
  const empatados = candidatos.filter((x) => x.puntaje === (sabor && sabor.puntaje) && x.s.cantidad !== 0);
  if (empatados.length > 1 && !empatados.some((x) => normalizar(x.s.texto) === normalizar(variante))) {
    return `"${variante}" puede ser más de un sabor de ${producto}: ${empatados.map((x) => x.s.texto).join(", ")}. Preguntale al cliente cuál quiere`;
  }
  if (!sabor || sabor.s.cantidad === 0) return `no hay stock de ${producto} ${variante}; con stock hay: ${listado}`;
  if (sabor.s.cantidad !== null && sabor.s.cantidad < cantidad) return `de ${producto} ${sabor.s.texto} hay solo ${sabor.s.cantidad}`;
  return null;
}

// El modelo de stock de un producto de precios: null si su lista no tiene stock cargado.
function stockDelProducto(op, producto) {
  const campo = STOCK_DE[producto.lista];
  if (!campo || !textoDe(op[campo])) return null;
  return modeloEnStock(parsearStock(op[campo]), producto.nombre) || { titulo: "", sabores: [] };
}

// Formato físico de los productos THC, confirmado por el negocio. No dice nada de stock ni precios.
function fichaDelProducto(nombre, lista) {
  if (lista !== "PRECIOS_THC") return null;
  const n = normalizar(nombre);
  // El formato del modelo prevalece sobre palabras que también pueden ser parte de un sabor.
  if (/\b(?:dozo|blow)\b/.test(n)) {
    return { tipoDispositivo: "descartable todo en uno", bateriaIntegrada: true, capsulaIntercambiable: false, requierePenExterno: false,
      compatibilidadPen: "No se conecta a un pen ni a una batería externa. No es una cápsula intercambiable; no corresponde revisar una rosca 510 para conectarlo." };
  }
  if (/\bcapsulas?\b/.test(n) && /\b(?:cookies|muha|028)\b/.test(n)) {
    return { tipoDispositivo: "cápsula intercambiable", bateriaIntegrada: false, capsulaIntercambiable: true, requierePenExterno: true,
      compatibilidadPen: "Se utiliza con un pen o batería compatible con su conector. La marca o haber utilizado otra cápsula no confirma compatibilidad universal." };
  }
  return null;
}

// Lo que dice la lista sobre si un accesorio Apple es original: el agente no lo puede afirmar por su cuenta.
function autenticidadDeclarada(producto) {
  const texto = normalizar(producto.nombre + " " + (producto.lineas || []).join(" "));
  if (/original/.test(texto)) return "original según la lista del negocio";
  if (/foxconn|foxcom/.test(texto)) return "Foxconn según la lista del negocio; no equivale por sí solo a original Apple";
  return "no especificada; no afirmar original ni Foxconn";
}

// Palabras que no distinguen un producto ("¿qué vapes tenés?"): no cuentan para buscar.
const PALABRAS_GENERICAS = new Set(["vape", "vapes", "vaper", "vapers", "pod", "pods", "descartable", "descartables", "thc", "nicotina",
  "perfume", "perfumes", "accesorio", "accesorios", "stock", "precio", "precios", "lista", "catalogo", "hay", "tenes", "tienen", "tenian",
  "que", "sabor", "sabores", "producto", "productos", "quiero", "busco", "uno", "una"]);

// Lo que hay de lo que pidió el cliente: los modelos que coinciden, con sus sabores en stock. El agente
// no recibe el catálogo entero en cada turno (se paga en cada respuesta) y se busca con el mismo
// buscador que después cobra.
function buscarEnCatalogo(op, consulta, { conPrecios = true } = {}) {
  const q = palabras(consulta).filter((w) => !PALABRAS_GENERICAS.has(w));
  const ofertas = parsearProductos(op.ofertasTexto);
  const precios = (p) => Object.entries(p.precios).map(([n, m]) => `${n}x ${pesos(m)}`).join(", ");
  const respuesta = { ok: true, consulta: String(consulta || ""), resultados: [] };
  if (q.length) {
    const conStock = productosEnPesos(op).map((p) => {
      const modelo = stockDelProducto(op, p);
      const sabores = modelo && modelo.sabores.filter((s) => s.cantidad !== 0);
      return { p, modelo, sabores };
    });
    // Se busca en el nombre, la descripción y los sabores con stock ("watermelon" trae los modelos que lo tienen).
    const puntaje = ({ p, sabores }) => {
      const enTodo = [p.nombre, ...(p.lineas || []), p.detalle, ...(sabores || []).map((s) => s.texto)].flatMap(palabras);
      return q.filter((w) => coincidencia(w, enTodo) > 0).length / q.length;
    };
    let hallados = conStock.map((x) => ({ ...x, s: puntaje(x), exacto: !!buscarProducto([x.p], consulta)?.producto }))
      .filter((x) => x.s >= (q.length === 1 ? 1 : 0.5))
      .sort((a, b) => b.s - a.s || b.exacto - a.exacto);
    // Si hay productos que coinciden con todo lo pedido, los parciales sobran ("ice king" no trae "Sweet King").
    if (hallados.some((x) => x.s === 1)) hallados = hallados.filter((x) => x.s === 1);
    respuesta.resultados = hallados.slice(0, 8).map(({ p, modelo, sabores }) => {
      const r = { lista: NOMBRE_LISTA[p.lista], nombre: p.nombre, detalle: (p.lineas || []).filter((l) => l !== p.nombre).join(" · ") };
      if (conPrecios) {
        r.precios = precios(p);
        const oferta = buscarProducto(ofertas, p.nombre);
        if (oferta && oferta.producto) r.oferta = precios(oferta.producto);
      }
      if (p.lista === "appleTexto") r.autenticidadDeclarada = autenticidadDeclarada(p);
      if (sabores) {
        r.saboresConStock = sabores.length ? sabores.map((s) => s.texto + (s.cantidad ? ` (${s.cantidad})` : "")) : "sin stock";
        // Si lo buscado es un sabor ("menta"), cuáles de este modelo son. Solo cuentan las palabras
        // que no son del nombre del modelo ("ice king" no filtra los sabores Ice).
        const delModelo = [p.nombre, ...(p.lineas || [])].flatMap(palabras);
        const deSabor = q.filter((w) => !coincidencia(w, delModelo));
        const coinciden = deSabor.length ? sabores.filter((s) => deSabor.some((w) => coincidencia(w, palabras(s.texto)) > 0)) : [];
        if (coinciden.length) r.saboresQueCoinciden = coinciden.map((s) => s.texto + (s.cantidad ? ` (${s.cantidad})` : ""));
        // El pedazo de la lista de stock de este modelo, tal como lo escribió el depósito.
        if (sabores.length) r.bloqueStock = [modelo.titulo, "", ...sabores.map((s) => s.linea)].join("\n");
      }
      const ficha = fichaDelProducto(p.nombre, r.lista);
      if (ficha) {
        r.fichaProducto = ficha;
        // Un descartable no lleva rosca: se sacan de la descripción las líneas que lo contradicen.
        if (!ficha.capsulaIntercambiable) r.detalle = r.detalle.split(" · ").filter((s) => !/510|rosca|intercambiable|compatib|capsulas?/i.test(s)).join(" · ");
      }
      return r;
    });
  }
  if (conPrecios && /mayor/i.test(consulta || "") && textoDe(op.preciosMayoristaTexto)) respuesta.listaMayorista = textoDe(op.preciosMayoristaTexto);
  if (textoDe(op.informacionProductosTexto)) respuesta.informacionAdicionalProductos = textoDe(op.informacionProductosTexto);
  if (!respuesta.resultados.length) {
    respuesta.indice = Object.fromEntries(LISTAS_CON_PRECIO.map((campo) => [NOMBRE_LISTA[campo], parsearProductos(op[campo]).map((p) => p.nombre)]).filter(([, v]) => v.length));
    respuesta.nota = q.length
      ? `no encontré "${consulta}" en las listas de hoy: no digas que no hay sin ofrecer lo más parecido del índice`
      : "consulta general: si quiere ver todo, mandá la plantilla de esa categoría; si no, preguntale qué busca";
  }
  return respuesta;
}

// La misma lista sin precios, para mandar como stock ("CATÁLOGO" en vez de "LISTA DE PRECIOS").
const TIENE_PRECIO = /\$|\b(?:USD|USDT|ARS)\s*\d|\d[\d.,]*\s*(?:USD|USDT)\b/i;
function sinPrecios(texto) {
  const original = String(texto || "");
  if (!TIENE_PRECIO.test(original) && !/lista de precios/i.test(original)) return original.trim();
  return original.split("\n").map((linea) => {
    let s = linea.replace(/lista de precios/gi, "CATÁLOGO");
    if (!TIENE_PRECIO.test(s)) return /precio liquidaci[oó]n/i.test(s) ? "" : s;
    s = s.replace(/(?:\s*[→:—–-]\s*)?(?:(?:USD|USDT|ARS)\s*)?\$\s*[\d.,]+(?:\s*(?:c\/u|cada uno|pesos|ARS))?/gi, "")
      .replace(/\b(?:USD|USDT|ARS)\s*[\d.,]+(?:\s*c\/u)?|[\d.,]+\s*(?:USD|USDT)(?:\s*c\/u)?/gi, "")
      .trim();
    // Un renglón que solo tenía el precio ("💰 1x $22.000") desaparece.
    if (/^[^\p{L}\p{N}]*(?:\d+\s*x\s*)?[→:—–-]*$/u.test(s)) return "";
    if (/^(?:precio|total|subtotal|desde|c\/u)\s*[:→-]?$/i.test(s.replace(/[^\p{L}\p{N}\s/:→-]/gu, ""))) return "";
    return s;
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

module.exports = {
  LISTAS_DEL_PANEL, STOCK_DE, parsearProductos, productosEnPesos, buscarProducto, productoDeLinea, faltaStock,
  buscarEnCatalogo, sinPrecios,
};
