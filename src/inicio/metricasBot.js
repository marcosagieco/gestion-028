// Cuentas de las métricas del bot de WhatsApp que se muestran en Inicio. Junta dos fuentes:
// - bot_estadisticas/{AAAA-MM-DD}: lo que cuenta n8n cada hora (clientes que escriben, resúmenes,
//   abandonos, derivaciones, publicidad). Arranca el 29/10/2026.
// - pedidos con origen 'bot_n8n': los que cargó el bot, con su total, productos, envío y anuncio.
// Funciones puras (sin Firebase) para poder probarlas sueltas: ver metricasBot.test.mjs.

export const INICIO_ESTADISTICAS_BOT = '2026-10-29';

// Día calendario local (AAAA-MM-DD) de una fecha: los días de bot_estadisticas son días de Argentina.
export function diaLocal(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// El período anterior de igual duración, terminando justo antes de que empiece el actual.
export function periodoAnterior(desde, hasta) {
  const dur = hasta.getTime() - desde.getTime();
  const fin = new Date(desde.getTime() - 1);
  return { desde: new Date(fin.getTime() - dur), hasta: fin };
}

const dividir = (a, b) => (b > 0 ? a / b : null);
const sumar = (dias, campo) => dias.reduce((s, d) => s + (Number(d[campo]) || 0), 0);

const ETIQUETA_ENVIO = { moto: 'Moto', uber: 'Flash (Uber)', retiro: 'Retiro', correo: 'Correo' };
const ETIQUETA_PAGO = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', 'al recibir': 'Al recibir',
  'mitad y mitad': 'Mitad y mitad', alias1: 'Alias 1', alias2: 'Alias 2', alias3: 'Alias 3', alias4: 'Alias 4',
};

function repartir(lista, clave, etiquetas) {
  const cuenta = {};
  for (const p of lista) {
    const k = clave(p) || 'otro';
    const c = cuenta[k] || (cuenta[k] = { clave: k, nombre: etiquetas[k] || k, pedidos: 0, monto: 0 });
    c.pedidos += 1;
    c.monto += Number(p.total) || 0;
  }
  return Object.values(cuenta).sort((a, b) => b.pedidos - a.pedidos);
}

// Las métricas de un período: `dias` = documentos de bot_estadisticas del período, `pedidos` = los
// pedidos del bot creados en el período (cualquier estado; los cancelados se cuentan aparte).
export function calcularPeriodo(dias, pedidos) {
  const clientes = sumar(dias, 'clientes');
  const mensajes = sumar(dias, 'mensajes');
  const resumenes = sumar(dias, 'resumenes');
  const clientesConPedido = sumar(dias, 'clientesConPedido');
  const abandonos = sumar(dias, 'abandonos');
  const derivaciones = dias.reduce((s, d) => s + (Number(d.totalDerivaciones) || 0), 0);
  const clientesPublicidad = sumar(dias, 'clientesPublicidad');
  const pedidosPublicidadStats = sumar(dias, 'pedidosPublicidad');

  const validos = pedidos.filter((p) => p.estado !== 'cancelado');
  const cancelados = pedidos.length - validos.length;
  const facturacion = validos.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const envios = validos.reduce((s, p) => s + (Number(p.valorEnvio) || 0), 0);
  const descuentos = validos.reduce((s, p) => s + (Number(p.montoDescuento) || 0), 0);
  const unidades = validos.reduce((s, p) => s + (p.items || []).reduce((a, it) => a + (Number(it.cantidad) || 0), 0), 0);
  const mayoristas = validos.filter((p) => p.mayorista === true);

  const dePublicidad = validos.filter((p) => p.publicidad && (p.publicidad.anuncioId || p.publicidad.titulo));
  const facturacionPublicidad = dePublicidad.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const clientesOrganicos = Math.max(0, clientes - clientesPublicidad);
  const pedidosOrganicos = Math.max(0, clientesConPedido - pedidosPublicidadStats);

  // Anuncios: clientes de bot_estadisticas + pedidos y plata de los pedidos que trajo cada uno.
  const anuncios = {};
  for (const d of dias) {
    for (const [titulo, n] of Object.entries(d.porAnuncio || {})) {
      const a = anuncios[titulo] || (anuncios[titulo] = { titulo, clientes: 0, pedidos: 0, monto: 0 });
      a.clientes += Number(n?.clientes) || 0;
    }
  }
  for (const p of dePublicidad) {
    const titulo = String(p.publicidad.titulo || 'Anuncio sin nombre').replace(/[./\\[\]*`~]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
    const a = anuncios[titulo] || (anuncios[titulo] = { titulo, clientes: 0, pedidos: 0, monto: 0 });
    a.pedidos += 1;
    a.monto += Number(p.total) || 0;
  }

  const productos = {};
  for (const p of validos) {
    for (const it of p.items || []) {
      const nombre = String(it.producto || '').trim() || 'Sin nombre';
      const x = productos[nombre] || (productos[nombre] = { nombre, unidades: 0, monto: 0 });
      x.unidades += Number(it.cantidad) || 0;
      x.monto += Number(it.importe) || 0;
    }
  }

  // Pedidos por hora del día (hora local en que el bot cargó el pedido).
  const porHora = Array.from({ length: 24 }, (_, h) => ({ hora: h, pedidos: 0 }));
  for (const p of validos) {
    const d = new Date(p.createdAt);
    if (!isNaN(d)) porHora[d.getHours()].pedidos += 1;
  }

  return {
    clientes, mensajes, resumenes, clientesConPedido, abandonos, derivaciones,
    pedidos: validos.length, cancelados, pedidosTotales: pedidos.length,
    facturacion, envios, descuentos, unidades,
    pedidosMayoristas: mayoristas.length,
    ticket: dividir(facturacion, validos.length),
    conversion: dividir(clientesConPedido, clientes),
    cierreResumen: dividir(clientesConPedido, resumenes),
    abandonoResumen: dividir(abandonos, resumenes),
    llegaAResumen: dividir(resumenes, clientes),
    ingresoPorCliente: dividir(facturacion, clientes),
    mensajesPorCliente: dividir(mensajes, clientes),
    resolucionAutomatica: clientes > 0 ? Math.max(0, 1 - derivaciones / clientes) : null,
    tasaCancelacion: dividir(cancelados, pedidos.length),
    unidadesPorPedido: dividir(unidades, validos.length),
    clientesPublicidad, pedidosPublicidad: dePublicidad.length, facturacionPublicidad,
    conversionPublicidad: dividir(pedidosPublicidadStats, clientesPublicidad),
    conversionOrganica: dividir(pedidosOrganicos, clientesOrganicos),
    participacionPublicidad: dividir(facturacionPublicidad, facturacion),
    ticketPublicidad: dividir(facturacionPublicidad, dePublicidad.length),
    anuncios: Object.values(anuncios).sort((a, b) => b.monto - a.monto || b.clientes - a.clientes),
    envio: repartir(validos, (p) => (p.despachoInterno === 'moto_a_via_cargo' || p.datosCorreo ? 'correo' : (p.entregaCliente || p.tipoEnvio)), ETIQUETA_ENVIO),
    pago: repartir(validos, (p) => p.medioPago, ETIQUETA_PAGO),
    productos: Object.values(productos).sort((a, b) => b.monto - a.monto).slice(0, 8),
    porHora,
    diasConDatos: dias.length,
  };
}

// Serie por día para el gráfico: clientes, pedidos, facturación y conversión.
export function serieDiaria(dias, pedidos, desde, hasta) {
  const porDia = new Map();
  for (let d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()); d <= hasta; d.setDate(d.getDate() + 1)) {
    const k = diaLocal(d);
    if (k >= INICIO_ESTADISTICAS_BOT) porDia.set(k, { dia: k, clientes: 0, conPedido: 0, pedidos: 0, facturacion: 0 });
  }
  for (const d of dias) {
    const x = porDia.get(d.dia);
    if (x) { x.clientes = Number(d.clientes) || 0; x.conPedido = Number(d.clientesConPedido) || 0; }
  }
  for (const p of pedidos) {
    if (p.estado === 'cancelado') continue;
    const x = porDia.get(diaLocal(p.createdAt));
    if (x) { x.pedidos += 1; x.facturacion += Number(p.total) || 0; }
  }
  // El día de hoy está en curso: se muestra como «Hoy» y sin conversión (a media mañana daría casi 0%).
  const hoy = diaLocal(new Date());
  return [...porDia.values()].map((x) => ({
    ...x,
    enCurso: x.dia === hoy,
    nombre: x.dia === hoy ? 'Hoy' : `${x.dia.slice(8)}/${x.dia.slice(5, 7)}`,
    conversion: x.dia !== hoy && x.clientes > 0 ? Math.round((x.conPedido / x.clientes) * 1000) / 10 : null,
  }));
}

const limpiarTitulo = (t) => String(t || '').replace(/[./\\[\]*`~]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);

// Anuncios de Meta cruzados con el bot (para la pestaña Meta Ads). `insights` = filas de Meta a nivel
// anuncio ({ ad_id, ad_name, campaign_name, spend, clicks, impressions }). Se agrupa por el TÍTULO que vio
// el cliente («Entrega rápida en tu zona»): bot_estadisticas cuenta los clientes por título y varios
// anuncios de Meta comparten el mismo título. El gasto de cada anuncio se suma a su título usando los
// pedidos, que traen las dos cosas (publicidad.anuncioId + titulo); un anuncio de Meta que todavía no
// trajo ningún pedido queda en su propia fila con su nombre de Meta.
export function metricasAnuncios(dias, pedidos, insights) {
  const validos = pedidos.filter((p) => p.estado !== 'cancelado');
  const dePub = validos.filter((p) => p.publicidad && (p.publicidad.anuncioId || p.publicidad.titulo));
  const filas = new Map();
  const fila = (clave, nombre) => {
    if (!filas.has(clave)) filas.set(clave, { clave, nombre, campanias: new Set(), ids: new Set(), gasto: 0, clics: 0, impresiones: 0, clientes: 0, pedidos: 0, facturacion: 0 });
    return filas.get(clave);
  };
  const tituloPorId = {};
  for (const p of dePub) if (p.publicidad.anuncioId && p.publicidad.titulo) tituloPorId[String(p.publicidad.anuncioId)] = limpiarTitulo(p.publicidad.titulo);
  const titulos = new Set([...Object.values(tituloPorId), ...dias.flatMap((d) => Object.keys(d.porAnuncio || {}))]);

  for (const i of insights || []) {
    const id = String(i.ad_id);
    const porNombre = limpiarTitulo(i.ad_name);
    const titulo = tituloPorId[id] || (titulos.has(porNombre) ? porNombre : null);
    const f = titulo ? fila(`t:${titulo}`, titulo) : fila(`m:${id}`, i.ad_name || 'Anuncio sin nombre');
    if (i.campaign_name) f.campanias.add(i.campaign_name);
    f.ids.add(id);
    f.gasto += parseFloat(i.spend || 0);
    f.clics += parseInt(i.clicks || 0, 10);
    f.impresiones += parseInt(i.impressions || 0, 10);
  }
  for (const p of dePub) {
    const titulo = limpiarTitulo(p.publicidad.titulo) || tituloPorId[String(p.publicidad.anuncioId)] || 'Anuncio sin nombre';
    const f = fila(`t:${titulo}`, titulo);
    if (p.publicidad.anuncioId) f.ids.add(String(p.publicidad.anuncioId));
    f.pedidos += 1;
    f.facturacion += Number(p.total) || 0;
  }
  for (const d of dias) {
    for (const [titulo, n] of Object.entries(d.porAnuncio || {})) fila(`t:${titulo}`, titulo).clientes += Number(n?.clientes) || 0;
  }

  const lista = [...filas.values()]
    .filter((f) => f.gasto > 0 || f.clientes > 0 || f.pedidos > 0)
    .map(({ campanias, ids, ...f }) => ({
      ...f,
      campania: [...campanias].join(' · '),
      cantidadAnuncios: ids.size,
      costoPorCliente: dividir(f.gasto, f.clientes),
      costoPorVenta: dividir(f.gasto, f.pedidos),
      conversion: dividir(f.pedidos, f.clientes),
      roas: dividir(f.facturacion, f.gasto),
      ticket: dividir(f.facturacion, f.pedidos),
    }))
    .sort((a, b) => b.facturacion - a.facturacion || b.gasto - a.gasto);

  const gasto = lista.reduce((s, f) => s + f.gasto, 0);
  const clientesPub = sumar(dias, 'clientesPublicidad');
  const pedidosPubStats = sumar(dias, 'pedidosPublicidad');
  const clientes = sumar(dias, 'clientes');
  const conPedido = sumar(dias, 'clientesConPedido');
  const facturacion = dePub.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const facturacionBot = validos.reduce((s, p) => s + (Number(p.total) || 0), 0);
  return {
    anuncios: lista,
    gasto,
    facturacion,
    pedidos: dePub.length,
    clientes: clientesPub,
    roas: dividir(facturacion, gasto),
    costoPorCliente: dividir(gasto, clientesPub),
    costoPorVenta: dividir(gasto, dePub.length),
    ticket: dividir(facturacion, dePub.length),
    conversion: dividir(pedidosPubStats, clientesPub),
    conversionOrganica: dividir(Math.max(0, conPedido - pedidosPubStats), Math.max(0, clientes - clientesPub)),
    participacion: dividir(facturacion, facturacionBot),
    parteDeClientes: dividir(clientesPub, clientes),
  };
}

// Variación entre dos valores: relativa (montos y cantidades) o en puntos (porcentajes).
export function variacion(actual, anterior, enPuntos = false) {
  if (actual == null || anterior == null) return null;
  if (enPuntos) return (actual - anterior) * 100;
  if (anterior === 0) return null;
  return ((actual - anterior) / anterior) * 100;
}
