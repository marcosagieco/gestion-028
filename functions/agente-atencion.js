'use strict';
function solicitudCliente(v){return String(v||'').replace(/\[Adjunto:[\s\S]*?\]\s*\[Link de la url fuente:[^\]]*\]\s*Texto escrito por el cliente \(no es lectura del archivo\):\s*/g,'');}
function normalizarAtencion(v){return solicitudCliente(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
function pidePrecios(v){return /\b(precios?|cuanto\w*|cuesta\w*|sale[n]?|saldri\w*|valor|costo|total|importe)\b/.test(normalizarAtencion(v));}
function pideResumen(v){return /\b(detalle|resumen|total|importe)\b/.test(normalizarAtencion(v));}
function saludoSimple(v){return /^(?:hola+|holis|buenas|buen (?:dia|finde)|buenos dias|buenas (?:tardes|noches))(?:[\s,!?.]*(?:que tal|como (?:va|estas|estan)|todo bien|buenas?))*[\s,!?.]*$/.test(normalizarAtencion(v));}
function preguntaHorario(v){const t=normalizarAtencion(v);if(/stock|sabores|catalogo|precios?|comprobante|cambiar|reclamo/.test(t))return false;return /hasta (?:que|q) (?:hora|hs)|hasta cuando (?:toman|atienden|hacen)|a que hora (?:cierran|dejan)|horarios? (?:de )?(?:atencion|pedidos|envios)|toman pedidos.{0,20}(?:hora|noche)|atienden (?:las )?24/.test(t);}
function preguntaReposicion(v){const t=normalizarAtencion(v);if(/mi pedido|cuando llega|cuando sale (?:mi|el) pedido|seguimiento/.test(t))return false;return /(?:cuando|que dia|fecha).{0,55}(?:ingres|reingres|repon|reposicion|entr[ae]\w*|vuelv\w*)|(?:avisa\w*|novedades).{0,55}(?:stock|ingres|entr[ae]|repon)|(?:ingres|reposicion).{0,40}(?:cuando|fecha)/.test(t);}
function pideComunidad(v){const t=normalizarAtencion(v);return /^(?:la )?comunidad[\s?!.]*$/.test(t)||(/comunidad|grupo/.test(t)&&/link|enlace|pasame|mandame|enviame|quiero (?:entrar|sumarme)|como (?:entro|me sumo)/.test(t));}
function sinPrecios(texto){if(!/\$|\b(?:USD|USDT|ARS)\s*\d|\d[\d.,]*\s*(?:USD|USDT)\b|lista de precios/i.test(String(texto||'')))return String(texto||'').trim();return String(texto||'').split('\n').map(linea=>{
 let s=linea.replace(/lista de precios/gi,'CATÁLOGO');
 if(!/\$|\b(?:USD|USDT|ARS)\s*\d|\d[\d.,]*\s*(?:USD|USDT)\b/i.test(s))return /precio (?:liquidacion|liquidación)/i.test(s)?'':s;
 s=s.replace(/(?:\s*[→:—–-]\s*)?(?:(?:USD|USDT|ARS)\s*)?\$\s*[\d.,]+(?:\s*(?:c\/u|cada uno|pesos|ARS))?/gi,'').replace(/\b(?:USD|USDT|ARS)\s*[\d.,]+(?:\s*c\/u)?|[\d.,]+\s*(?:USD|USDT)(?:\s*c\/u)?/gi,'').trim();
 if(/^[^\p{L}\p{N}]*(?:\d+\s*x\s*)?[→:—–-]*$/u.test(s)||/^(?:precio|total|subtotal|desde|c\/u)\s*[:→-]?$/i.test(s.replace(/[^\p{L}\p{N}\s/:→-]/gu,'')))return '';
 return s;
 }).join('\n').replace(/\n{3,}/g,'\n\n').trim();}
function datosAtencionEnvios({fecha,hora,cierreHora='20:00',moto,uber}){
 const proximaMoto=moto||null,proximoUber=uber||null;
 const haySalidasHoy=[moto,uber].some(s=>s?.fecha===fecha);
 const minutos=h=>Number(h.slice(0,2))*60+Number(h.slice(3,5));
 const cercaDelCierre=haySalidasHoy&&minutos(hora)>=minutos(cierreHora)-60&&minutos(hora)<minutos(cierreHora);
 const cerradoHoy=!haySalidasHoy;
 const siguientes=[moto&&`moto: ${moto.fecha.slice(8,10)}/${moto.fecha.slice(5,7)} a las ${moto.hora}`,uber&&`Uber/Flash: ${uber.fecha.slice(8,10)}/${uber.fecha.slice(5,7)} a las ${uber.hora}`].filter(Boolean);
 const aviso=cerradoHoy?{clave:fecha+':sin_salidas',texto:'Seguimos tomando pedidos las 24 horas, pero hoy ya no hay más salidas.'+(siguientes.length?' Próximas salidas disponibles: '+siguientes.join('; ')+'.':' Consultá la próxima salida antes de realizar un pago.')}:cercaDelCierre?{clave:fecha+':cierre_proximo',texto:`Los envíos de hoy finalizan a las ${cierreHora}. Para salir hoy, hay que confirmar antes del cierre y completar el pago anticipado cuando corresponda; los pedidos con pago al recibir no necesitan el 100% anticipado.`}:null;
 return {fecha,hora,cierreHora,haySalidasHoy,cercaDelCierre,cerradoHoy,proximaMoto,proximoUber,aviso};
}
module.exports={solicitudCliente,normalizarAtencion,pidePrecios,pideResumen,saludoSimple,preguntaHorario,preguntaReposicion,pideComunidad,sinPrecios,datosAtencionEnvios};
