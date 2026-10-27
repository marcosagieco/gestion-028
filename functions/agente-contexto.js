'use strict';
const DIA=86400000;
function instante(v){if(v?.toMillis)return v.toMillis();if(v instanceof Date)return v.getTime();if(v&&typeof v==='object'&&Number.isFinite(v.seconds))return v.seconds*1000;return typeof v==='number'?v:Date.parse(v||'');}
function diaBuenosAires(v){const d=new Date(v);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):null;}
function clasificarPedido(p,ahora=Date.now()){
 if(!p)return {actual:false,motivo:'sin_pedido'};
 if(!['pendiente','armado'].includes(p.estado)||p.entregadoEn||p.canceladoAt||p.finalizadoAt)return {actual:false,motivo:'cerrado'};
 const hoy=diaBuenosAires(ahora),fecha=String(p.fechaSalida||'');
 if(/^\d{4}-\d{2}-\d{2}$/.test(fecha)&&diaBuenosAires(fecha+'T12:00:00-03:00')===fecha&&fecha>=hoy)return {actual:true,motivo:'salida_vigente'};
 const actividad=Math.max(...[p.createdAt,p.armadoAt].map(instante).filter(Number.isFinite));
 const ventana=p.datosCorreo||p.tipoEnvio==='correo'?4*DIA:DIA;
 return Number.isFinite(actividad)&&actividad<=ahora+5*60000&&ahora-actividad<=ventana?{actual:true,motivo:'operacion_reciente'}:{actual:false,motivo:Number.isFinite(actividad)?'registro_anterior':'fecha_no_verificada'};
}
function consultaHistorica(texto){const t=String(texto||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return /\b(anterior|viejo|histori\w*|hace (?:\d+|un[ao]?|dos|tres|cuatro) (?:dias?|semanas?)|la semana pasada|el otro dia|pedido del \d|que consiste el pedido|que tiene el pedido|que pedido (?:esta|figura) armado)\b/.test(t);}
function recorridoDelPedido(p,r,ahora=Date.now()){
 if(!r||r.estado!=='en_calle'||!Number.isFinite(instante(r.salidaEn)))return false;
 const fecha=diaBuenosAires(instante(r.salidaEn));
 return fecha===diaBuenosAires(ahora)&&(!p.fechaSalida||p.fechaSalida===fecha);
}
module.exports={instante,diaBuenosAires,clasificarPedido,consultaHistorica,recorridoDelPedido};
