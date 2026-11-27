// Poner en (0) un sabor en las listas de stock de /operativo (settings/operativo.stockNicotinaTexto y
// stockThcTexto), que son las que lee el bot para saber qué hay. Se usa cuando el depósito marca «No hay
// stock» en un pedido (PedidosPage → SinStock): así el bot no se lo ofrece a otro cliente.
//
// Las listas son texto libre: un título por modelo (en mayúsculas) y debajo sus sabores, con la cantidad
// entre paréntesis ("Miami Mint 🌴🌿❄️ (3)"). Solo se toca un renglón si hay UNO solo que coincide con el
// producto y el sabor: ante la duda no se cambia nada y se avisa para hacerlo a mano.

export const LISTAS_STOCK = { stockNicotinaTexto: 'Nicotina', stockThcTexto: 'THC' };

const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const palabras = (s) => sinAcentos(s).toLowerCase().replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(w => w.length > 0);
const SEPARADOR = /^[\s⸻━─—–=_-]+$/;
const CANTIDAD = /\((\d+)\)\s*$/;

// Igual que esNombre del bot (functions/bot/catalogo.js): un renglón casi todo en mayúsculas es un modelo.
const esTitulo = (linea) => {
  const letras = linea.match(/\p{L}/gu) || [];
  const mayus = letras.filter(c => c !== c.toLowerCase()).length;
  return letras.length >= 2 && mayus / letras.length >= 0.6;
};
// "ice" = "ice"; plurales y cortes ("blueberr" / "blueberry") cuentan como la misma palabra.
const igual = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
const esta = (w, lista) => lista.some(x => igual(w, x));

// Los renglones de las listas que son ese faltante: [{ campo, indice, modelo, linea }].
export function renglonesDe(op, faltante) {
  const P = palabras(faltante.producto);
  const V = palabras(faltante.variante);
  const todas = [...P, ...V];
  const hallados = [];
  for (const campo of Object.keys(LISTAS_STOCK)) {
    let modelo = null;
    String(op?.[campo] || '').split('\n').forEach((cruda, indice) => {
      const linea = cruda.trim();
      if (!linea || SEPARADOR.test(linea) || /stock|lista/i.test(linea)) return;
      if (esTitulo(linea)) { modelo = { texto: linea, palabras: palabras(linea) }; return; }
      if (!modelo) return;
      const sabor = palabras(linea.replace(CANTIDAD, ''));
      if (!sabor.length) return;
      // El sabor: el que se eligió, o (si se escribió todo junto, «Ice King Peach») las palabras del renglón.
      const esSabor = V.length ? V.every(w => esta(w, sabor)) : sabor.every(w => esta(w, todas));
      if (!esSabor) return;
      // El modelo: lo que queda del producto sin el sabor tiene que estar en el título, o casi todo el
      // título en el producto («ELFBAR ICE KING 40K» para «Elfbar Ice King»).
      const delModelo = P.filter(w => !esta(w, sabor));
      const enTitulo = delModelo.length > 0 && delModelo.every(w => esta(w, modelo.palabras));
      const tituloEnProducto = modelo.palabras.filter(w => esta(w, P)).length / modelo.palabras.length >= 2 / 3;
      if (enTitulo || tituloEnProducto) hallados.push({ campo, indice, modelo: modelo.texto, linea, exacto: V.length > 0 && sabor.every(w => esta(w, V)) });
    });
  }
  // «Strawberry» en un modelo con «Strawberry» y «Strawberry Kiwi»: vale el que es exactamente ese sabor.
  const exactos = hallados.filter(h => h.exacto);
  return hallados.length > 1 && exactos.length === 1 ? exactos : hallados;
}

// Pone en (0) los faltantes que se encuentran sin dudas. Devuelve { cambios: { campo: textoNuevo },
// resultado: [{ faltante, estado: 'puesto' | 'ya_estaba' | 'no_encontrado' | 'ambiguo', linea? }] }.
export function ponerEnCero(op, faltantes) {
  const textos = Object.fromEntries(Object.keys(LISTAS_STOCK).map(c => [c, String(op?.[c] || '').split('\n')]));
  const tocados = new Set();
  const resultado = faltantes.map(f => {
    const nombre = [f.producto, f.variante].filter(Boolean).join(' ');
    const r = renglonesDe(op, f);
    if (!r.length) return { faltante: nombre, estado: 'no_encontrado' };
    if (r.length > 1) return { faltante: nombre, estado: 'ambiguo', opciones: r.map(x => `${x.modelo}: ${x.linea}`) };
    const { campo, indice, linea } = r[0];
    if (/\(0\)\s*$/.test(linea)) return { faltante: nombre, estado: 'ya_estaba', linea };
    const original = textos[campo][indice];
    textos[campo][indice] = CANTIDAD.test(original) ? original.replace(CANTIDAD, '(0)') : `${original.replace(/\s+$/, '')} (0)`;
    tocados.add(campo);
    return { faltante: nombre, estado: 'puesto', linea: textos[campo][indice].trim() };
  });
  return { cambios: Object.fromEntries([...tocados].map(c => [c, textos[c].join('\n')])), resultado };
}
