"use strict";
const crypto = require("node:crypto");
const clave = s => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0,32);
const referencia = (db,id) => db.collection("agente_turnos").doc(clave(id));

function vigente(d,turno) {
  return !!d && String(d.ultimoMensaje)===String(turno.idMensaje) && d.ejecucionId===String(turno.ejecucionId) && Number(d.pausadoHasta||0)<=Date.now();
}

async function verificarTurno(db,turno,tx=null) {
  if (!turno) return true;
  if (!turno.idConversacion || !turno.idMensaje || !turno.ejecucionId) return false;
  const ref=referencia(db,turno.idConversacion),snap=await (tx?tx.get(ref):ref.get());
  return snap.exists && vigente(snap.data(),turno);
}

async function controlarTurno(db,b) {
  const id=String(b.idConversacion||"").trim();
  if(!id || !/^[\w-]{1,100}$/.test(id)) return {ok:false,permitir:false,error:"Conversación inválida"};
  const ref=referencia(db,id),accion=b.accion||"registrar";
  if(accion==='registrar_salida'&&/^\d+$/.test(String(b.idMensajeSalida||''))&&b.comunidadEnviada!==true&&!/^\d{4}-\d{2}-\d{2}:(?:sin_salidas|cierre_proximo)$/.test(String(b.avisoHorarioClave||'')))return {ok:true,registrado:false};
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref),d=snap.exists?snap.data():{},ahora=Date.now();
    if(accion==='registrar_salida'){
      if(!/^\d+$/.test(String(b.idMensajeSalida||'')))return {ok:false,error:'Falta el ID del mensaje enviado'};
      const avisos=[...(d.avisosHorarioEnviados||[])];
      if(/^\d{4}-\d{2}-\d{2}:(?:sin_salidas|cierre_proximo)$/.test(String(b.avisoHorarioClave||''))&&!avisos.includes(b.avisoHorarioClave))avisos.push(b.avisoHorarioClave);
      tx.set(ref,{...d,comunidadEnviada:d.comunidadEnviada===true||b.comunidadEnviada===true,avisosHorarioEnviados:avisos.slice(-10)});
      return {ok:true,registrado:true};
    }
    if(accion==="pausar") {
      const evento=Number(b.ultimoEquipoEn)||ahora;
      if(evento<Number(d.ultimoEventoEquipo||0))return {ok:true,permitir:false,obsoleto:true};
      tx.set(ref,{...d,pausadoHasta:ahora+45*60000,ultimoEventoEquipo:evento});
      return {ok:true,pausado:true};
    }
    if(accion==="liberar") {
      if(b.ultimoEquipoEn && Number(b.ultimoEquipoEn)<Number(d.ultimoEventoEquipo||0))return {ok:true,permitir:false,obsoleto:true};
      tx.set(ref,{...d,pausadoHasta:0,reanudable:true});
      return {ok:true,liberado:true};
    }
    const turno={idConversacion:id,idMensaje:String(b.idMensaje||""),ejecucionId:String(b.ejecucionId||"")};
    if(!turno.idMensaje||!turno.ejecucionId)return {ok:false,permitir:false,error:"Falta identidad del turno"};
    if(accion==="registrar") {
      if(d.ultimoMensaje && /^\d+$/.test(turno.idMensaje) && /^\d+$/.test(String(d.ultimoMensaje)) && BigInt(turno.idMensaje)<BigInt(d.ultimoMensaje))return {ok:true,permitir:false,obsoleto:true};
      if(String(d.ultimoMensaje)===turno.idMensaje) {
        if(d.reanudable&&Number(d.pausadoHasta||0)<=ahora){tx.set(ref,{...d,ejecucionId:turno.ejecucionId,reanudable:false});return {ok:true,permitir:true,turno};}
        return {ok:true,permitir:d.ejecucionId===turno.ejecucionId,duplicado:d.ejecucionId!==turno.ejecucionId,turno};
      }
      tx.set(ref,{...d,ultimoMensaje:turno.idMensaje,ejecucionId:turno.ejecucionId,reanudable:false,actualizadoEn:new Date().toISOString()});
      return {ok:true,permitir:true,turno};
    }
    if(!vigente(d,turno))return {ok:true,permitir:false,obsoleto:true};
    if(accion==="validar")return {ok:true,permitir:true,turno};
    if(accion==="reservar_salida") {
      const salidaRef=db.collection("agente_salidas").doc(clave(id+"|"+turno.idMensaje+"|"+JSON.stringify(b.contenido||[])));
      const salida=await tx.get(salidaRef);
      if(salida.exists)return {ok:true,permitir:false,duplicado:true};
      tx.set(salidaRef,{...turno,estado:"reservado",createdAt:new Date().toISOString()});
      return {ok:true,permitir:true,turno};
    }
    return {ok:false,permitir:false,error:"Acción de turno no reconocida"};
  });
}

async function leerAtencionConversacion(db,id){
 if(!id||!/^\w[\w-]{0,99}$/.test(String(id)))return {comunidadEnviada:false,avisosHorarioEnviados:[]};
 const s=await referencia(db,String(id)).get(),d=s.exists?s.data():{};
 return {comunidadEnviada:d.comunidadEnviada===true,avisosHorarioEnviados:d.avisosHorarioEnviados||[]};
}
module.exports={controlarTurno,verificarTurno,leerAtencionConversacion};
