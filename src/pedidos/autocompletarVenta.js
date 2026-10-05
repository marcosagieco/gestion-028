// Autocompletado del formulario "Finalizar pedido" de /pedidos (ver PedidosPage.jsx).
//
// Vive en su propio archivo, sin React ni Firebase, por dos razones: es la parte con mas reglas de
// toda la pantalla (interpreta plata) y asi se puede probar sola, corriendola contra los pedidos
// reales sin tener que abrir el navegador.
// ───────────────────────────────────────────────────────────────────────────────────────────
// AUTOCOMPLETADO DEL FORMULARIO DE FINALIZAR
// Con 150 pedidos esperando, cargar la venta campo por campo es lo que traba todo. Estos helpers
// arman el formulario ya lleno a partir del pedido, y todo queda editable: lo que se autocompleta
// se marca en pantalla y arriba hay un control contra el total del pedido.
//
// Hay dos clases de pedido y se tratan distinto:
//   1) Los que cargó el bot traen los datos separados (items con producto, variante, cantidad e
//      importe de la línea, envío, medio de pago, cuenta): no hace falta interpretar ningún texto.
//   2) Los cargados a mano son un mensaje libre. Muchos son el resumen del bot pegado tal cual
//      ("* 2x Dozo Live Rosin - Papaya: $110.000 / Envío: $6.700 / transferencia"), así que de ahí
//      se saca casi todo; los más sueltos ("benja / elfbar peach") al menos dejan el producto
//      buscado en el stock.
// ───────────────────────────────────────────────────────────────────────────────────────────

// Texto comparable: sin mayúsculas, sin acentos, sin emojis ni puntuación. Es lo que permite que
// "ELFBAR ICE KING - Watermelon Ice" y "elfbar ice king watermelon" se reconozcan como lo mismo.
export const normalizarParaBuscar = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Número escrito como lo escribe la gente: "$110.000", "110.000", "6700", "1.990". El punto de mil
// se saca; la coma se toma como decimal.
export const numeroDeTexto = (txt) => {
  if (txt == null) return null;
  const limpio = String(txt).replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : null;
};

// Palabras que no distinguen un producto de otro: medidas y capacidades ("2.5g", "35k", "60k",
// "40000"). El mismo modelo aparece escrito con y sin ellas, así que no se exigen para dar por
// bueno un producto — pero si coinciden, desempatan.
const esPalabraDeMedida = (p) => /^\d+(g|gr|k|ml|mg|mah|puff|puffs)?$/.test(p);

// Una palabra "está" en un nombre si aparece tal cual, o si una palabra del nombre es casi la misma:
// se acepta que una sea prefijo de la otra solo con 4 letras o más en común y como máximo 2 letras
// de diferencia, para cubrir plurales y palabras cortadas ("gummie"/"gummies", "elfbar"/"elfbars").
// Sin ese límite, "blueberry" daba por bueno "blue" y un Blueberry Ice se confirmaba como Blue Razz
// Ice: otro sabor, otro lote.
const casiIgual = (a, b) => {
  const corta = a.length <= b.length ? a : b;
  const larga = a.length <= b.length ? b : a;
  return corta.length >= 4 && larga.length - corta.length <= 2 && larga.startsWith(corta);
};
const palabraAparece = (palabra, texto, palabrasTexto) =>
  palabrasTexto.includes(palabra) || palabrasTexto.some(pt => casiIgual(pt, palabra));

// Ordena el stock real por parecido con un texto suelto. Lo usan las dos cosas que necesitan
// entender nombres: el autocompletado del formulario y el buscador que se escribe a mano.
//
// Por qué no alcanza con "el nombre contiene lo que escribí": el bot y los lotes le ponen nombres
// distintos al mismo producto. El bot vende "ELFBAR ICE KING - Watermelon Ice" (así figura en las
// listas de /operativo) y en el stock ese mismo vape está cargado como "Elfbar ice - Watermelon
// ice". Comparando palabra por palabra se reconocen igual, y las palabras que sobran de un lado
// ("king") restan en vez de descartar el producto.
//
// El puntaje: suma por cada palabra del texto que aparece en el nombre, resta por las que faltan y
// resta (menos) por las palabras del nombre que no estaban en el texto — eso último es lo que
// diferencia "Elfbar ice - Grape ice" de "Elfbar duke - Grape ice" cuando se busca un Elfbar ice.
// Las medidas y capacidades ("2.5g", "35k") no se exigen, solo desempatan.
export function rankearItemsEnStock(texto, items) {
  const objetivo = normalizarParaBuscar(texto);
  if (objetivo.length < 2 || !items?.length) return [];
  const palabras = [...new Set(objetivo.split(' ').filter(p => p.length >= 2))];
  const importantes = palabras.filter(p => !esPalabraDeMedida(p));
  const medidas = palabras.filter(esPalabraDeMedida);
  if (!importantes.length) return [];

  return items.map(it => {
    const candidato = normalizarParaBuscar(it.label);
    const palabrasCandidato = [...new Set(candidato.split(' '))];
    if (candidato === objetivo) return { it, score: 100, faltan: 0 };
    const encontradas = importantes.filter(p => palabraAparece(p, candidato, palabrasCandidato)).length;
    const faltan = importantes.length - encontradas;
    const medidasOk = medidas.filter(p => palabraAparece(p, candidato, palabrasCandidato)).length;
    const sobran = palabrasCandidato.filter(pc => !esPalabraDeMedida(pc) && !palabraAparece(pc, objetivo, palabras)).length;
    return { it, score: encontradas * 2 - faltan * 1.5 - sobran * 0.75 + medidasOk * 0.25, faltan };
  }).filter(c => c.score > 0).sort((a, b) => b.score - a.score);
}

// Confirma un producto del stock solo cuando hay un ganador claro. Si el segundo queda cerca (el
// mismo sabor en dos lotes, o dos modelos parecidos), devuelve null a propósito: lo elige una
// persona. Confirmar mal sería peor que no confirmar, porque la venta descuenta stock de ese lote.
export function buscarItemEnStock(texto, items) {
  const ranking = rankearItemsEnStock(texto, items);
  if (!ranking.length) return null;
  const mejor = ranking[0];
  // Tiene que haber reconocido al menos dos palabras y no puede faltarle más de una (así
  // "ELFBAR ICE KING Watermelon Ice" encuentra "Elfbar ice - Watermelon ice", a la que solo le
  // falta "king", pero "Elfbar duke - Watermelon ice" queda atrás por la palabra que sobra).
  if (mejor.score < 3 || mejor.faltan > 1) return null;

  // El mismo producto suele estar cargado en dos lotes (dos compras del mismo vape, o el mismo
  // sabor escrito igual en lotes distintos). Ahí no hay nada que decidir sobre QUÉ se vende, solo
  // de qué lote sale: se toma el que tiene más stock, que es el que más aguanta la venta. El lote
  // elegido se ve en pantalla y se puede cambiar.
  const nombreMejor = normalizarParaBuscar(mejor.it.label);
  const mismoProducto = ranking.filter(c => normalizarParaBuscar(c.it.label) === nombreMejor);
  const elegido = mismoProducto.reduce((a, b) => (b.it.currentStock > a.it.currentStock ? b : a));

  // Contra un producto DISTINTO sí hace falta diferencia: alcanza con que el segundo tenga una
  // palabra de más que nadie pidió (eso vale 0,75 de penalización), que es lo que separa a
  // "Elfbar ice - Grape ice" de "Elfbar duke - grape ice" cuando se pidió un Elfbar ice. Si quedan
  // más parejos que eso, no se confirma nada y lo elige una persona.
  const otroProducto = ranking.find(c => normalizarParaBuscar(c.it.label) !== nombreMejor);
  if (otroProducto && mejor.score - otroProducto.score < 0.7) return null;
  return elegido.it;
}

// Lee un mensaje escrito a mano. Entiende el formato del resumen del bot (que es el que más se
// pega) y, si no, cae a buscar nombres de productos renglón por renglón.
export function leerMensajePedido(mensaje, sellableItems) {
  const texto = String(mensaje || '');
  const renglones = texto.split('\n').map(r => r.trim()).filter(Boolean);
  const lineas = [];

  // Formato del resumen: los productos van después de "PRODUCTOS" y antes de "TOTALES".
  const iProductos = renglones.findIndex(r => /productos/i.test(r));
  const iTotales = renglones.findIndex(r => /totales|total a pagar|subtotal/i.test(r));
  const zonaProductos = iProductos >= 0
    ? renglones.slice(iProductos + 1, iTotales > iProductos ? iTotales : undefined)
    : renglones;

  for (const renglon of zonaProductos) {
    if (/^(entrega|cliente|pago|envio|envío|subtotal|total|ref|descuento)/i.test(renglon)) continue;
    // El precio puede venir con dos puntos o pegado al final del nombre, con o sin signo $:
    //   "* 2x Nombre - Variante: $110.000"   "* 1x Nombre $60.000"   "2 x Nombre"
    const precioFinal = renglon.match(/\$\s*([\d.,]+)\s*$/);
    const sinPrecio = (precioFinal ? renglon.slice(0, precioFinal.index) : renglon).replace(/[\s:–-]+$/, '');
    const m = sinPrecio.match(/^[*\-•·\s]*(?:(\d{1,3})\s*[xX]\s*|[xX]\s*(\d{1,3})\s+)?(.+)$/);
    if (!m) continue;
    const cantidad = parseInt(m[1] || m[2] || '', 10) || null;
    const nombre = (m[3] || '').trim();
    const importe = numeroDeTexto(precioFinal && precioFinal[1]);
    if (nombre.length < 3) continue;
    const item = buscarItemEnStock(nombre, sellableItems);
    // Sin formato de resumen, un renglón que no matchea ningún producto es el nombre del cliente,
    // la dirección o un comentario: se descarta en vez de ensuciar el formulario.
    if (!item && iProductos < 0) continue;
    lineas.push({ nombre, cantidad: cantidad || 1, importe, item });
    if (lineas.length >= 8) break;
  }

  // "Envío: $6.700" — se busca el renglón del envío, no cualquier mención (el de envío seguro tiene
  // su propio renglón y no se suma acá: va en el sí/no del formulario).
  const envio = numeroDeTexto((texto.match(/env[ií]o\s*:?\s*\$\s*([\d.,]+)/i) || [])[1]);
  const total = numeroDeTexto((texto.match(/total\s*a\s*pagar[^\n$]*\$\s*([\d.,]+)/i) || [])[1]);
  const subtotal = numeroDeTexto((texto.match(/subtotal\s*:?\s*\$\s*([\d.,]+)/i) || [])[1]);
  const descuento = numeroDeTexto((texto.match(/descuento[^\n$]*\$\s*([\d.,]+)/i) || [])[1]);

  // ¿El precio de cada renglón es el de la línea entera o el de una unidad? Los mensajes vienen de
  // las dos formas ("2x Grape Ice: $23.000" con subtotal $46.000 es unitario; "2x Papaya: $110.000"
  // con subtotal $110.000 es la línea entera). Se resuelve con el subtotal, que es el árbitro: se
  // prueban las dos lecturas y se usa la que cierra.
  if (subtotal != null && lineas.length && lineas.every(l => l.importe != null)) {
    const comoLinea = lineas.reduce((s, l) => s + l.importe, 0);
    const comoUnitario = lineas.reduce((s, l) => s + l.importe * (l.cantidad || 1), 0);
    if (Math.abs(comoUnitario - subtotal) < 1 && Math.abs(comoLinea - subtotal) >= 1) {
      for (const l of lineas) l.importe = l.importe * (l.cantidad || 1);
    }
  }
  const bajo = texto.toLowerCase();
  const medioPago = /mitad/.test(bajo) ? 'mitad y mitad'
    : /(al recibir|contra entrega)/.test(bajo) ? 'al recibir'
    : /efectivo/.test(bajo) ? 'efectivo'
    : /transferencia/.test(bajo) ? 'transferencia'
    : null;

  return { lineas, envio, total, medioPago, descuento };
}

// Reparte el descuento por pagar en efectivo entre los productos, para que el total de la venta sea
// igual a la plata que entró de verdad (el bot descuenta sobre el subtotal de productos). El
// redondeo sobrante se ajusta en la última línea, así la suma cierra exacta.
export function aplicarDescuentoALineas(lineas, descuento) {
  // Si alguna línea no trae precio no hay sobre qué repartir: se deja todo como está y el precio lo
  // carga una persona (el control de total de arriba del formulario le va a marcar la diferencia).
  if (!lineas.length || lineas.some(l => l.importe == null)) return lineas;
  const subtotal = lineas.reduce((s, l) => s + (l.importe || 0), 0);
  if (!descuento || descuento <= 0 || subtotal <= 0) return lineas;
  const factor = (subtotal - descuento) / subtotal;
  let acumulado = 0;
  return lineas.map((l, i) => {
    const esUltima = i === lineas.length - 1;
    const nuevo = esUltima ? (subtotal - descuento) - acumulado : Math.round((l.importe || 0) * factor);
    acumulado += nuevo;
    return { ...l, importe: nuevo };
  });
}

const nuevoUid = () => Math.random().toString(36).slice(2);

// Arma el formulario de finalizar ya lleno. Todo lo que devuelve es editable en pantalla; `origen`
// dice qué se autocompletó para poder marcarlo, y `totalEsperado` es contra qué se compara el total
// que se está cargando.
export function armarPrefillFinalizar(pedido, sellableItems, hoy, aliasDelDia = '') {
  const delBot = Array.isArray(pedido?.items) && pedido.items.length > 0;
  const origen = { items: null, envio: false, pago: false, vendedor: false, sinMatch: 0, aliasAdivinado: false };

  let lineas = [];
  let envio = null;
  let medioPago = null;
  let totalEsperado = null;

  if (delBot) {
    origen.items = 'bot';
    lineas = pedido.items.map(it => {
      const texto = [it.producto, it.variante].filter(Boolean).join(' ');
      return {
        nombre: texto,
        cantidad: parseInt(it.cantidad, 10) || 1,
        importe: typeof it.importe === 'number' ? it.importe : numeroDeTexto(it.importe),
        item: buscarItemEnStock(texto, sellableItems),
      };
    });
    lineas = aplicarDescuentoALineas(lineas, pedido.montoDescuento || 0);
    envio = typeof pedido.valorEnvio === 'number' ? pedido.valorEnvio : null;
    medioPago = pedido.medioPago || null;
    totalEsperado = typeof pedido.total === 'number' ? pedido.total : null;
  } else {
    const leido = leerMensajePedido(pedido?.mensaje, sellableItems);
    if (leido.lineas.length) origen.items = 'mensaje';
    // Mismo criterio que con los pedidos del bot: el descuento por efectivo se reparte entre los
    // productos, para que el total de la venta sea la plata que entró de verdad.
    lineas = aplicarDescuentoALineas(leido.lineas, leido.descuento || 0);
    envio = leido.envio;
    medioPago = leido.medioPago;
    totalEsperado = leido.total;
  }

  const items = (lineas.length ? lineas : [{ nombre: '', cantidad: 1, importe: null, item: null }]).map(l => {
    if (l.item == null && l.nombre) origen.sinMatch++;
    const unitario = l.importe != null && l.cantidad > 0 ? Math.round(l.importe / l.cantidad) : null;
    return {
      uid: nuevoUid(),
      producto: l.item ? l.item.label : (l.nombre || ''),
      selectedProductItem: l.item || null,
      unidades: String(l.cantidad || 1),
      precio: unitario != null ? String(unitario) : '',
      auto: !!(l.item || unitario != null),
    };
  });

  // El envío seguro no se mete en "Envío cobrado": tiene su propio sí/no, y se suma aparte al
  // guardar. Así se ve y se puede corregir sin tener que hacer la cuenta a mano.
  const envioSeguro = delBot
    ? !!pedido.envioSeguro
    : /env[ií]o\s*seguro/i.test(String(pedido?.mensaje || ''));
  if (envio != null) origen.envio = true;

  // Medio de pago. "al recibir" queda vacío a propósito: el cliente paga cuando llega la moto y
  // hasta ahí no se sabe si fue efectivo o transferencia; inventarlo descuadra la caja.
  // "mitad y mitad" sí se puede: el bot cobra la mitad por transferencia antes (redondeada para
  // arriba, igual que él) y la otra mitad en efectivo al recibir.
  // Los pedidos del bot guardan a qué cuenta se cobró. Los cargados a mano no: el mensaje dice
  // "transferencia" y nada más, así que se usa el alias que está marcado en /operativo, que es el
  // que se le pasa al cliente ese día. Queda marcado como autocompletado para poder corregirlo si
  // ese pedido se cobró en otra cuenta.
  const alias = pedido?.cuentaCobro || aliasDelDia || '';
  let pagos = [{ uid: nuevoUid(), medioPago: '', monto: '' }];
  if (medioPago === 'transferencia' && alias) {
    pagos = [{ uid: nuevoUid(), medioPago: alias, monto: '' }];
    origen.pago = true;
    origen.aliasAdivinado = !pedido?.cuentaCobro;
  } else if (medioPago === 'efectivo') {
    pagos = [{ uid: nuevoUid(), medioPago: 'efectivo', monto: '' }];
    origen.pago = true;
  } else if (medioPago === 'mitad y mitad' && totalEsperado) {
    const transferido = Math.ceil(totalEsperado / 2);
    pagos = [
      { uid: nuevoUid(), medioPago: alias || '', monto: String(transferido) },
      { uid: nuevoUid(), medioPago: 'efectivo', monto: String(totalEsperado - transferido) },
    ];
    origen.pago = !!alias;
  }

  // Los pedidos del bot los vende el bot. Los cargados a mano los atendió una persona y el mensaje
  // no dice quién, así que ese queda para elegir.
  const vendedor = delBot ? '028 Import' : '';
  if (vendedor) origen.vendedor = true;

  return {
    form: {
      // Frecuente por defecto (es el caso más común); se cambia con el desplegable de siempre.
      tipoCliente: 'Frecuente',
      vendedor,
      envioCliente: envio != null ? String(envio) : '',
      costoEnvio: '',
      fecha: hoy,
    },
    items,
    pagos,
    envioSeguro,
    totalEsperado,
    origen,
  };
}
