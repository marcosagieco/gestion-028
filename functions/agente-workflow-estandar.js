'use strict';
const crypto=require('crypto');const {codigoRuntime}=require('./agente-workflow-runtime');const {PROMPT}=require('./agente-prompt');const {solicitudCliente,normalizarAtencion,pidePrecios}=require('./agente-atencion');
const {limpiarPrincipal}=require('./agente-workflow-limpieza');
function estandarizarPrincipal(original){
 const w=structuredClone(original),n=name=>{const r=w.nodes.find(n=>n.name===name);if(!r)throw new Error('Falta nodo '+name);return r;};
 const runtime=codigoRuntime(),put=(name,js)=>{n(name).parameters.jsCode=js;};
 for(const name of ['AI Agent','Completar compra'])n(name).parameters.options.systemMessage='='+PROMPT;
 n('Formato: lista de mensajes').parameters.jsonSchemaExample=JSON.stringify({mensajes:['PLANTILLA:FORMAS_DE_ENTREGA','¿Cómo querés recibirlo?']},null,2);
 put('Evaluar cierre de compra',runtime+"\nconst a=$('AI Agent').first().json,e=$('Estado del día').first().json,c=$('Resolver cierre de compra').first().json;return [{json:{...a,...evaluarCierre(a,{...e,cierre:c.cierre,mensaje:$('Juntar mensajes').first().json.mensaje})},pairedItem:{item:0}}];");
 put('Respuesta del agente',runtime+"\nconst auto=$('Resolver cierre de compra').first().json,a=$('Completar compra').isExecuted?$('Completar compra').first().json:$('AI Agent').isExecuted?$('AI Agent').first().json:{};const e=$('Estado del día').first().json;return [{json:cerrarRespuesta(a,e.plantillas,{...e,automatico:auto,cierre:auto.cierre,mensaje:$('Juntar mensajes').first().json.mensaje}),pairedItem:{item:0}}];");
 put('Confirmación de registro automático',runtime+"\nconst e=$('Estado del día').first().json;return [{json:cerrarRespuesta({},e.plantillas,{...e,automatico:$json,mensaje:$('Juntar mensajes').first().json.mensaje}),pairedItem:{item:0}}];");
 const estado=n('Estado del día');estado.parameters.sendQuery=true;estado.parameters.queryParameters||={parameters:[]};
 estado.parameters.queryParameters.parameters=estado.parameters.queryParameters.parameters.filter(p=>p.name!=='idConversacion');estado.parameters.queryParameters.parameters.push({name:'idConversacion',value:"={{ $('Datos del mensaje').first().json.conversacion }}"});
 const catalogo=n('buscar_catalogo');catalogo.parameters.queryParameters||={parameters:[]};catalogo.parameters.queryParameters.parameters=catalogo.parameters.queryParameters.parameters.filter(p=>p.name!=='sinPrecios');
 const funciones=[solicitudCliente,normalizarAtencion,pidePrecios].map(f=>f.toString()).join('\n');
 catalogo.parameters.queryParameters.parameters.push({name:'sinPrecios',value:"={{ (()=>{ "+funciones+";return !pidePrecios($('Juntar mensajes').first().json.mensaje);})() }}"});
 const name='Registrar atención enviada',old=w.nodes.find(x=>x.name===name);
 const node={...(old||{}),id:old?.id||crypto.createHash('sha256').update('028-estandar-registrar-atencion-20261025').digest('hex').slice(0,32),name,type:'n8n-nodes-base.httpRequest',typeVersion:4.3,position:old?.position||[n('Enviar por Chatwoot').position[0]+300,n('Enviar por Chatwoot').position[1]+280],credentials:structuredClone(n('Resolver cierre de compra').credentials),onError:'continueRegularOutput',retryOnFail:true,maxTries:2,waitBetweenTries:1000,parameters:{method:'POST',url:'https://us-central1-gestion-028.cloudfunctions.net/agentTurno',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:"={{ JSON.stringify({accion:'registrar_salida',idConversacion:$('Datos del mensaje').first().json.conversacion,idMensajeSalida:String($json.id),comunidadEnviada:($('Estado del día').first().json.plantillas.COMUNIDAD.match(/https:\\/\\/chat\\.whatsapp\\.com\\/[^\\s]+/g)||[]).some(url=>String($json.content||'').includes(url)),avisoHorarioClave:($('Confirmación de registro automático').isExecuted&&$('Confirmación de registro automático').first().json.avisoHorarioClave)||($('Respuesta del agente').isExecuted&&$('Respuesta del agente').first().json.avisoHorarioClave)||null}) }}",options:{timeout:15000}}};
 if(old)w.nodes[w.nodes.indexOf(old)]=node;else w.nodes.push(node);
 const salidas=w.connections['Enviar por Chatwoot'].main[0];if(!salidas.some(e=>e.node===name))salidas.push({node:name,type:'main',index:0});
 return limpiarPrincipal(w);
}
function estandarizarUber(original){
 const w=structuredClone(original),find=name=>{const n=w.nodes.find(n=>n.name===name);if(!n)throw new Error('Falta nodo '+name);return n;};
 const name='Registrar aviso horario informado',old=w.nodes.find(n=>n.name===name),despues=w.connections['Confirmar detalle Uber enviado'].main[0].filter(e=>e.node!==name);
 const siguiente=old?w.connections[name].main[0]:despues;
 const n={id:old?.id||crypto.createHash('sha256').update('028-estandar-aviso-uber-20261025').digest('hex').slice(0,32),name,type:'n8n-nodes-base.httpRequest',typeVersion:4.3,position:old?.position||[find('Confirmar detalle Uber enviado').position[0]+200,find('Confirmar detalle Uber enviado').position[1]+100],credentials:structuredClone(find('Reservar aviso único').credentials),onError:'continueRegularOutput',retryOnFail:true,maxTries:2,waitBetweenTries:1000,parameters:{method:'POST',url:'https://us-central1-gestion-028.cloudfunctions.net/agentTurno',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:"={{ JSON.stringify({accion:'registrar_salida',idConversacion:$('Webhook cotización confirmada').first().json.body.idConversacion,idMensajeSalida:String($('Avisar al cliente').first().json.id),avisoHorarioClave:$('Preparar detalle completo Uber').first().json.avisoHorarioClave||null}) }}",options:{timeout:15000}}};
 if(old)w.nodes[w.nodes.indexOf(old)]=n;else w.nodes.push(n);
 w.connections['Confirmar detalle Uber enviado'].main[0]=[{node:name,type:'main',index:0}];w.connections[name]={main:[siguiente]};
 return w;
}
module.exports={estandarizarPrincipal,estandarizarUber};
