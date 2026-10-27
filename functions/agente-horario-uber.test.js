'use strict';const assert=require('assert/strict');const {api,store,LISTAS,llamar,conHora}=require('./agente-api.test');
(async()=>{let checks=0;const check=(name,fn)=>{fn();checks++;console.log('OK - '+name);};await conHora('2026-10-27T13:00:00',async()=>{
 for(const k of Object.keys(store))delete store[k];store['settings/operativo']={...LISTAS,limitePorTanda:100};
 const estado=await llamar(api.agentEstadoOperativo);check('La plantilla informa que Uber permite coordinar horario',()=>assert(estado.body.plantillas.FORMAS_DE_ENTREGA.includes('Podés coordinar un horario de envío')));
 const pedido={items:[{producto:'ELFBAR TE 30K',variante:'Bubbaloo Grape',cantidad:1}],cliente:'QA horario',horaSolicitada:'16:30'};
 const q=await llamar(api.agentCrearCotizacionUber,{method:'POST',body:{idConversacion:'qa-uber-horario',telefonoCliente:'5491100000888',direccion:'Cabildo 2000, Belgrano',pedido}});assert(q.body.creada);const key='cotizaciones_uber/'+q.body.id;
 check('La solicitud conserva las 16:30 elegidas por el cliente',()=>assert.equal(store[key].pedidoBorrador.horaSolicitada,'16:30'));
 store[key]={...store[key],estado:'cotizado',montoUber:7500,resueltoEn:new Date().toISOString()};
 const resumen=await llamar(api.agentPrepararDetalleUber,{method:'POST',body:{idCotizacion:q.body.id}});
 check('El detalle Uber queda listo para el pago',()=>assert.equal(resumen.body.detalleListo,true));
 check('El detalle mantiene 16:30 y no la primera salida',()=>assert.match(resumen.body.contenido,/16:30 \(horario pedido por el cliente\)/));
 });
 console.log(checks+'/'+checks+' comprobaciones aprobadas');})().catch(e=>{console.error(e);process.exitCode=1;});
