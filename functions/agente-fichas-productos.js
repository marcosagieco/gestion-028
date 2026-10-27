'use strict';
// Formato físico confirmado por el negocio. No determina stock, precios ni compatibilidad universal.
function fichaFisicaProducto(nombre,lista){
 if(lista!=='PRECIOS_THC')return null;
 const n=String(nombre||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 // El formato del modelo prevalece sobre palabras que también pueden ser parte de un sabor.
 if(/\b(?:dozo|blow)\b/.test(n))return {tipoDispositivo:'descartable todo en uno',bateriaIntegrada:true,capsulaIntercambiable:false,requierePenExterno:false,compatibilidadPen:'No se conecta a un pen ni a una batería externa. No es una cápsula intercambiable; no corresponde revisar una rosca 510 para conectarlo.'};
 if(/\bcapsulas?\b/.test(n)&&/\b(?:cookies|muha|028)\b/.test(n))return {tipoDispositivo:'cápsula intercambiable',bateriaIntegrada:false,capsulaIntercambiable:true,requierePenExterno:true,compatibilidadPen:'Se utiliza con un pen o batería compatible con su conector. La marca o haber utilizado otra cápsula no confirma compatibilidad universal.'};
 return null;
}
function incorporarFichaFisica(resultado){
 const ficha=fichaFisicaProducto(resultado.nombre,resultado.lista);if(!ficha)return resultado;
 const r={...resultado,fichaProducto:ficha};
 if(ficha.capsulaIntercambiable===false)r.detalle=String(r.detalle||'').split(' · ').filter(s=>!(/510|rosca|intercambiable/i.test(s)||/compatib|capsulas?/i.test(s))).join(' · ');
 return r;
}
module.exports={fichaFisicaProducto,incorporarFichaFisica};
