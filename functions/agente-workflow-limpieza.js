'use strict';
const RETIRADOS=['Borrar precio avisado','¿Mensaje corto para verificar?','Leer última respuesta','Verificador: ¿hay que responder?','¿Hay que responder?','Memoria después','Cuántos sacar','Sacar respuesta de la memoria','Pausar: escribió el equipo'];
function alcanzables(w){
 const vivos=new Set(),visitar=n=>{if(vivos.has(n))return;vivos.add(n);for(const salida of w.connections[n]?.main||[])for(const e of salida)visitar(e.node);};visitar('Webhook');
 let cambio=true;while(cambio){cambio=false;for(const [n,canales]of Object.entries(w.connections))for(const [tipo,salidas]of Object.entries(canales))if(tipo!=='main'&&salidas.flat().some(e=>vivos.has(e.node))&&!vivos.has(n)){vivos.add(n);cambio=true;}}
 return vivos;
}
function limpiarPrincipal(original){
 const w=structuredClone(original),vivos=alcanzables(w),retirados=new Set(RETIRADOS.filter(n=>w.nodes.some(x=>x.name===n)));
 for(const nombre of retirados)if(vivos.has(nombre))throw new Error('No se puede retirar un nodo activo: '+nombre);
 for(const n of w.nodes.filter(n=>!retirados.has(n.name)))for(const nombre of retirados)if(JSON.stringify(n.parameters).includes(nombre))throw new Error('Referencia activa a nodo anterior: '+n.name+' → '+nombre);
 w.nodes=w.nodes.filter(n=>!retirados.has(n.name));
 for(const nombre of retirados)delete w.connections[nombre];
 for(const canales of Object.values(w.connections))for(const salidas of Object.values(canales))for(let i=0;i<salidas.length;i++)salidas[i]=salidas[i].filter(e=>!retirados.has(e.node));
 const notas={
  'AI Agent':'Atención principal. Consulta herramientas y prepara la respuesta. No envía directamente al cliente.',
  'Completar compra':'Reintento condicional: solo se ejecuta desde ¿Completar compra? cuando falta resolver precio, detalle, alias o registro. Su salida reemplaza la del primer agente; no es un segundo bot atendiendo en paralelo.',
  'Conservar memoria de turnos nuevos':'Fin intencional. Llegó un mensaje más reciente: se descarta esta respuesta vieja. No se borra memoria y no se envía al cliente; el turno más reciente continúa.',
  'Registrar atención enviada':'Fin intencional después del envío: guarda que se informó comunidad/horarios. No necesita devolver otra respuesta al cliente.'
 };
 for(const [nombre,nota]of Object.entries(notas)){const n=w.nodes.find(n=>n.name===nombre);if(!n)throw new Error('Falta nodo vigente: '+nombre);n.notes=nota;n.notesInFlow=true;}
 const nombres=new Set(w.nodes.map(n=>n.name));for(const [origen,canales]of Object.entries(w.connections)){if(!nombres.has(origen))throw new Error('Origen inexistente: '+origen);for(const salidas of Object.values(canales))for(const e of salidas.flat())if(!nombres.has(e.node))throw new Error('Destino inexistente: '+e.node);}
 return w;
}
module.exports={RETIRADOS,alcanzables,limpiarPrincipal};
