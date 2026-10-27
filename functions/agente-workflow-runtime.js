"use strict";
const {importeDeTexto,lecturaEstructurada,descripcionDeLectura}=require('./agente-comprobantes');
const {solicitudCliente,normalizarAtencion,pidePrecios,pideResumen,saludoSimple,preguntaHorario,preguntaReposicion,pideComunidad,sinPrecios}=require('./agente-atencion');

function objetos(v) {
  if(typeof v==='string'){try{return objetos(JSON.parse(v));}catch{return [];}}
  if(Array.isArray(v))return v.flatMap(objetos);
  if(v&&typeof v==='object'){
    if(v.ok!==undefined || v.resultado!==undefined)return [v];
    for(const k of ['json','body','data','response'])if(v[k])return objetos(v[k]);
    return [v];
  }
  return [];
}

function observaciones(agent,nombre) {
  return (agent.intermediateSteps||[]).filter(p=>p.action?.tool===nombre).flatMap(p=>objetos(p.observation));
}

function evaluarCierre(agent,contexto={}) {
  const texto=normalizarAtencion(contexto.mensaje);
  const exito=n=>observaciones(agent,n).some(x=>x.ok===true);
  const derivado=observaciones(agent,'avisar_al_equipo').some(x=>x.derivado===true);
  const confirmacion=/^(?:s+i+|sip|si+si+|dale+|ok(?:ey|ay)?|confirmo|confirmar pedido|perfecto|joya|listo|bueno|de una)\b/.test(texto.trim());
  const precio=/cuanto|precio|total|cuestan|salen|saldri|saldria|\b[23456789]\b/.test(texto);
  const pago=/alias|cbu|cvu|transfer|comprobante de pago/.test(texto)||(/\[Adjunto:[\s\S]*?comprobante de (?:pago|transferencia)/i.test(String(contexto.mensaje||''))&&!!contexto.cierre);
  const corregirOperacion=(agent.intermediateSteps||[]).flatMap(p=>objetos(p.observation)).some(x=>x.continuarCompra===true&&['pedido_anterior','operacion_incorrecta'].includes(x.motivo));
  const requiere=pago||(confirmacion&&!!(contexto.cierre||contexto.cotizacionUber))||corregirOperacion;
  const faltaPrecio=precio&&!exito('cotizar_productos')&&!exito('armar_resumen')&&!exito('crear_pedido');
  return {requiere,reintentar:!derivado&&((requiere&&!exito('armar_resumen')&&!exito('crear_pedido')&&!exito('modificar_pedido'))||faltaPrecio),consultaPrecio:faltaPrecio};
}

function respuestaDeStock(agent,contexto,plantillas){
 const t=normalizarAtencion(contexto.mensaje);
 const resultados=observaciones(agent,'buscar_catalogo').flatMap(r=>r.resultados||[]);
 const original=typeof agent.output==='string'?agent.output:JSON.stringify(agent.output||{});
 const limpio=v=>normalizarAtencion(v).replace(/\s*\(\d+\)\s*$/,'').replace(/[^\p{L}\p{N}\s]/gu,'').replace(/\s+/g,' ').trim();
 const enumerado=resultados.some(r=>Array.isArray(r.saboresConStock)&&r.saboresConStock.filter(s=>limpio(s).length>3&&limpio(original).includes(limpio(s))).length>=3)||original.length>350&&(original.match(/,/g)||[]).length>=6&&/sabores|stock|disponibles/i.test(original)&&/elfbar|ignite|flavor beast|muha|dozo|capsulas/i.test(original);
 if(/envio|direccion|ubicacion|horario|pedido|comprobante|transfer|alias|cbu|cvu|cambi|agreg|\bllevo\b|\bcomprar\b|recomend|aconsej/.test(t))return null;
 if(!enumerado&&/\b\d+\s*(?:x\s*)?(?:unidades?|dozo|capsulas?|elfbar|vapes?|muha)\b|\b(?:llevar|pedir|reservar|armame|anotame|sumame)\b|\bquiero (?:un[ao]?|\d+)\b/.test(t))return null;
 const consulta=/\bstock\b|\bsabores?\b|\bcatalogo\b|\blista\b|\bdisponibles?\b|\btenes\b|\bque hay\b|^vape(?:r|s)?[\s.!?]*$/.test(t);
 if(!consulta&&/precio|cuanto|cuestan|salen|saldria|total/.test(t))return null;
 const aclaracion=/^[^a-z0-9]+$/u.test(t.trim())||/^(?:y )?(?:cuales|cual|como|eh)[\s.!?]*$/.test(t.trim());
 if(!consulta&&!enumerado&&!(aclaracion&&original.length>260&&resultados.some(r=>Array.isArray(r.saboresConStock)&&r.saboresConStock.length)))return null;
 const listas=new Set();
 const thc=/\bthc\b|capsul|muha|dozo|jeeter|cookies|gummies|\b028\b/.test(t);
 if(thc)listas.add('PRECIOS_THC');
 if(/nicotina|elfbar|ignite|flavor beast|dinner lady|blvk/.test(t)||(!thc&&/\bvape(?:r|s)?\b|\bpods?\b/.test(t)))listas.add('PRECIOS_VAPES');
 if(/perfume|lattafa|rasasi|afnan|armaf/.test(t))listas.add('PERFUMES');
 if(/apple|airpods|earpods|foxconn|cargador|body splash/.test(t))listas.add('APPLE_ACCESORIOS');
 if(!listas.size)for(const r of resultados)if(['PRECIOS_VAPES','PRECIOS_THC','PERFUMES','APPLE_ACCESORIOS','COMBOS_BATERIAS'].includes(r.lista))listas.add(r.lista);
 if(!listas.size&&enumerado){if(/elfbar|ignite|flavor beast/i.test(original))listas.add('PRECIOS_VAPES');else if(/muha|dozo|capsulas/i.test(original))listas.add('PRECIOS_THC');}
 if(!listas.size)return null;
 const precios=pidePrecios(t);
 const mayorista=/mayorista/.test(t);
 const nombres=[];
 for(const l of listas){if(l==='PRECIOS_VAPES'||l==='PRECIOS_THC'){
   nombres.push(l==='PRECIOS_VAPES'?'STOCK_NICOTINA':'STOCK_THC');if(precios)nombres.push(mayorista?'PRECIOS_MAYORISTA':l);
  }else nombres.push(!precios&&l==='PERFUMES'?'STOCK_PERFUMES':!precios&&l==='APPLE_ACCESORIOS'?'STOCK_APPLE_ACCESORIOS':l);}
 const disponibles=[...new Set(nombres)].flatMap(n=>{if(typeof plantillas[n]==='string'&&plantillas[n].trim())return ['PLANTILLA:'+n];const origen=n==='STOCK_PERFUMES'?'PERFUMES':n==='STOCK_APPLE_ACCESORIOS'?'APPLE_ACCESORIOS':null;const texto=origen?sinPrecios(plantillas[origen]):'';return texto?[texto]:[];});
 return disponibles.length?disponibles:null;
}

function respuestaComunidad(mensaje,contexto,plantillas){
 const reposicion=preguntaReposicion(mensaje),explicita=pideComunidad(mensaje);
 if(!reposicion&&!explicita)return null;
 if(!plantillas.COMUNIDAD)return null;
 if(contexto.atencionConversacion?.comunidadEnviada&&!explicita)return ['Todavía no tengo una fecha de reposición confirmada. En la comunidad que te compartí publicamos los nuevos ingresos y el stock actualizado.'];
 return [...(reposicion?['Todavía no tengo una fecha de reposición confirmada. En la comunidad publicamos los nuevos ingresos y el stock actualizado.']:[]),'PLANTILLA:COMUNIDAD'];
}

function cerrarRespuestaBase(agent,plantillas,contexto={}) {
  const auto=contexto.automatico||{};
  if(auto.respuestaPreparada)return auto.respuestaPreparada;
  const cargado=auto.resuelto&&auto.pedidoId?auto:[...observaciones(agent,'crear_pedido'),...observaciones(agent,'modificar_pedido')].filter(x=>x.ok===true&&x.pedidoId).at(-1);
  if(cargado){
    const salida=String(cargado.mensaje||'').split('\n').find(l=>/^🕐 Sale /.test(l));
    const texto=pideResumen(contexto.mensaje)&&cargado.mensaje?cargado.mensaje:(cargado.modificado?'El cambio quedó registrado.':'Tu pedido quedó registrado.')+(salida?'\n'+salida:'');
    return {output:{mensajes:[texto+'\nGracias por tu compra.']},pedidoId:cargado.pedidoId};
  }
  if(preguntaHorario(contexto.mensaje))return {output:{mensajes:['Tomamos pedidos las 24 horas; hacemos envíos hasta las '+(contexto.atencionEnvios?.cierreHora||'20:00')+'.']}};
  if(saludoSimple(contexto.mensaje))return {output:{mensajes:[contexto.cierre?'Hola, ¿seguimos con tu pedido?':'Hola, buenas, ¿todo bien? ¿Qué estás buscando?']}};
  const comunidad=respuestaComunidad(contexto.mensaje,contexto,plantillas);
  if(comunidad&&!pidePrecios(contexto.mensaje))return {output:{mensajes:comunidad}};
  const ultimo=observaciones(agent,'armar_resumen').at(-1);
  if(ultimo?.ok===true&&ultimo.preview===true&&typeof ultimo.mensaje==='string'&&Number.isFinite(ultimo.total)){
    const repetido=contexto.cierre?.detalleEnviadoEn&&contexto.cierre.version===ultimo.cierreVersion&&contexto.cierre.mensaje===ultimo.mensaje;
    if(repetido&&!pideResumen(contexto.mensaje)){
      if(/\b(alias|cbu|cvu|datos de pago)\b/.test(normalizarAtencion(contexto.mensaje)))return {output:{mensajes:['PLANTILLA:ALIAS']},cierreVersion:null};
      return {output:{mensajes:[ultimo.requiereTransferencia?'Dale, quedo atento al comprobante para registrar el pedido.':'¿Confirmamos ese pedido?']}};
    }
    return {output:{mensajes:[ultimo.mensaje,ultimo.requiereTransferencia&&plantillas.ALIAS?'PLANTILLA:ALIAS':'lo confirmamos ?']},cierreVersion:ultimo.cierreVersion||null};
  }
  const cotizacion=observaciones(agent,'cotizar_productos').filter(x=>x.ok===true).at(-1);
  if(cotizacion?.mensaje){const stock=respuestaDeStock(agent,contexto,plantillas);if(stock&&!pidePrecios(contexto.mensaje))return {output:{mensajes:comunidad||stock}};return {output:{mensajes:[...(comunidad||stock||[]),cotizacion.mensaje]}};}
  const cotizacionUSD=ultimo?.ok===true&&ultimo.necesitaTipoCambio?ultimo:null;
  if(cotizacionUSD)return {output:{mensajes:[cotizacionUSD.mensaje]}};
  const derivado=observaciones(agent,'avisar_al_equipo').some(x=>x.derivado===true||x.cotizacionCreada===true);
  if(derivado)return {output:{mensajes:[]}};
  if(comunidad)return {output:{mensajes:comunidad}};
  const stock=respuestaDeStock(agent,contexto,plantillas);
  if(stock)return {output:{mensajes:stock}};
  let original=agent.output;
  if(typeof original==='string'){try{original=JSON.parse(original);}catch{original={mensajes:[original]};}}
  let mensajes=Array.isArray(original?.mensajes)?original.mensajes.map(String).map(s=>s.trim()).filter(Boolean):[];
  mensajes=mensajes.flatMap(texto=>{
    const partes=[];let inicio=0,m;const re=/[⟦\[]?PLANTILLA\s*:\s*([A-Z_]+)[⟧\]]?/gi;
    while((m=re.exec(texto))){if(texto.slice(inicio,m.index).trim())partes.push(texto.slice(inicio,m.index).trim());const n=m[1].toUpperCase();if(n!=='WEB'&&plantillas[n])partes.push('PLANTILLA:'+n);inicio=re.lastIndex;}
    if(texto.slice(inicio).trim())partes.push(texto.slice(inicio).trim());return partes;
  });
  if(mensajes.includes('PLANTILLA:ALIAS')){
    if(contexto.cierre?.mensaje&&contexto.cierre?.detalleEnviadoEn)return {output:{mensajes:[...(pideResumen(contexto.mensaje)?[contexto.cierre.mensaje]:[]),'PLANTILLA:ALIAS']},cierreVersion:pideResumen(contexto.mensaje)?contexto.cierre.version:null};
    mensajes=mensajes.filter(x=>x!=='PLANTILLA:ALIAS');
  }
  const afirmaRegistro=t=>!/(?:todav[ií]a no|no (?:est[aá]|qued[oó]|pude|se)|sin registrar)/i.test(t)&&/(?:pedido|cambio).{0,45}(?:registrad|cargad|anotad)|ya (?:te |lo )?(?:registr[eé]|cargu[eé]|anot[eé])/.test(t.toLowerCase());
  if(mensajes.some(afirmaRegistro)){
    mensajes=[contexto.pedidoActual?.id?'tu pedido ya figura en el sistema. '+contexto.pedidoActual.descripcion:'todavía no pude confirmar el registro. Escribí «confirmar pedido» para reintentarlo sin duplicarlo'];
  }
  if(!contexto.pedidoActual&&mensajes.some(t=>/(?:pedido|compra).{0,100}(?:ya est[aá] armado|figura armado|est[aá] armado|no se puede modificar|no podemos modificar|salida (?:est[aá] )?cerrada)|(?:ten[eé]s|hay).{0,25}pedido.{0,30}armado/i.test(t))){
    mensajes=[contexto.consultaPedidoHistorico&&contexto.pedidoHistorico?contexto.pedidoHistorico.descripcion:'el registro que se mencionó corresponde a una compra anterior; no hay un pedido nuevo registrado. Seguimos con esta compra'];
  }
  const referencia=contexto.pedidoActual||(contexto.consultaPedidoHistorico?contexto.pedidoHistorico:null);
  if((mensajes.some(t=>/ya (?:sal[ií][oó]|est[aá] en camino)/i.test(t))&&!referencia?.puedeAfirmarEnCamino) || (mensajes.some(t=>/ya (?:te )?(?:lleg[oó]|entregamos)|figura entregado/i.test(t))&&!referencia?.puedeAfirmarEntregado)){
    mensajes=[referencia?.descripcion||'todavía no tengo una salida ni una entrega confirmada de ese pedido'];
  }
  const herramientas=(agent.intermediateSteps||[]).flatMap(p=>objetos(p.observation));
  const problema= [...herramientas].reverse().find(x=>x.ok===false&&x.error);
  if(problema?.obsoleto)return {output:{mensajes:[]},obsoleto:true};
  if(!mensajes.length)mensajes=[problema?.error||'decime qué producto o cantidad querés consultar y seguimos con tu pedido'];
  return {output:{mensajes:[...new Set(mensajes)]}};
}

function cerrarRespuesta(agent,plantillas,contexto={}){
 const r=cerrarRespuestaBase(agent,plantillas,contexto),aviso=contexto.atencionEnvios?.aviso;
 if(r.pedidoId||!r.output?.mensajes?.length||!aviso||contexto.atencionConversacion?.avisosHorarioEnviados?.includes(aviso.clave))return r;
 const texto=r.output.mensajes.join('\n');
 if(!texto.includes(aviso.texto)){
   if(saludoSimple(contexto.mensaje)||preguntaHorario(contexto.mensaje)){const textoAviso=preguntaHorario(contexto.mensaje)?aviso.texto.replace(/^Los envíos de hoy finalizan a las [\d:]+\.\s*/,'').replace(/^Seguimos tomando pedidos las 24 horas, pero /,''):aviso.texto;r.output.mensajes[0]+='\n\n'+textoAviso;}
   else r.output.mensajes.unshift(aviso.texto);
 }
 r.avisoHorarioClave=aviso.clave;
 return r;
}

function dividirMensajes(partes,max=4000) {
  if(!Number.isInteger(max)||max<2)throw new Error('Límite inválido');
  const resultado=[];let actual='';
  const texto=partes.map(String).map(s=>s.trim()).filter(Boolean).join('\n\n');
  for(const caracter of texto){if(actual.length+caracter.length>max){resultado.push(actual);actual='';}actual+=caracter;}
  if(actual)resultado.push(actual);
  return resultado;
}

function prepararAdjunto(respuesta,datos) {
  const raw=String(respuesta.choices?.[0]?.message?.content||'').trim();
  const lectura=lecturaEstructurada(raw);
  const comprobante=lectura&&lectura.esComprobante===true?lectura:null;
  const descripcion=lectura?(lectura.descripcion||(!comprobante?'no es un comprobante':'Comprobante de pago recibido; datos sujetos a validación')):raw||'no se pudo leer el archivo';
  return {texto:'[Adjunto: '+descripcion+'] [Link de la url fuente: '+datos.adjuntoUrl+']\nTexto escrito por el cliente (no es lectura del archivo): '+String(datos.texto||''),lecturaComprobante:comprobante,descripcionComprobante:descripcionDeLectura(comprobante)||''};
}

function codigoRuntime(){return [importeDeTexto,lecturaEstructurada,descripcionDeLectura,solicitudCliente,normalizarAtencion,pidePrecios,pideResumen,saludoSimple,preguntaHorario,preguntaReposicion,pideComunidad,sinPrecios,objetos,observaciones,evaluarCierre,respuestaDeStock,respuestaComunidad,cerrarRespuestaBase,cerrarRespuesta,dividirMensajes,prepararAdjunto].map(fn=>fn.toString()).join('\n\n');}
module.exports={objetos,observaciones,evaluarCierre,respuestaDeStock,respuestaComunidad,cerrarRespuesta,dividirMensajes,prepararAdjunto,codigoRuntime};
