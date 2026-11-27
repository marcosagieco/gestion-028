// Clientes por teléfono: qué tipo de cliente se anotó en cada compra, para completar solo el «Tipo de
// cliente» al anotar la venta de un pedido (PedidosPage → handleAbrirFinalizar).
//
// Colección `clientes`, un documento por teléfono (id = los últimos 10 dígitos, así «5491140987284»,
// «+54 9 11 4098-7284» y «1140987284» son el mismo cliente):
//   { telefono, compras, tipos: { 'Frecuente': n, … }, ultimoTipo, ultimaCompra, tipoSugerido, actualizadoEn }
//
// Regla (Marcos, 27/11): si alguna vez vino por publicidad → «Clientes - Publicidad»; si no → «Frecuente»
// (un orgánico que vuelve ya no es nuevo). Revendedor y Dropdeal se mantienen si fue lo último que se anotó.
import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';

export const COLECCION_CLIENTES = 'clientes';
const PUBLICIDAD = ['Nuevo - Publicidad', 'Clientes - Publicidad'];
const SE_MANTIENEN = ['Revendedor', 'Dropdeal'];

// Los últimos 10 dígitos de un teléfono argentino, o null.
export function claveTelefono(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos.length >= 10 && digitos.length <= 13 ? digitos.slice(-10) : null;
}

// El teléfono de un pedido: el del bot, o el que está en el mensaje después del nombre
// («Fede — 5491140987284»), como lo arman la web y los pedidos cargados a mano.
export function telefonoDePedido(p) {
  const delBot = claveTelefono(p?.telefono);
  if (delBot) return delBot;
  const m = String(p?.mensaje || '').match(/[—–-]\s*\+?(\d[\d\s-]{8,17}\d)/);
  return m ? claveTelefono(m[1]) : null;
}

export function tipoSugerido(cliente) {
  if (!cliente) return null;
  if (SE_MANTIENEN.includes(cliente.ultimoTipo)) return cliente.ultimoTipo;
  if (PUBLICIDAD.some(t => (cliente.tipos?.[t] || 0) > 0)) return 'Clientes - Publicidad';
  return 'Frecuente';
}

// Suma una compra al historial del cliente (en memoria).
function sumarCompra(cliente, tipo, fecha) {
  const c = cliente || { compras: 0, tipos: {}, ultimoTipo: null, ultimaCompra: null };
  c.compras += 1;
  c.tipos = { ...c.tipos, [tipo]: (c.tipos[tipo] || 0) + 1 };
  if (!c.ultimaCompra || String(fecha || '') >= c.ultimaCompra) { c.ultimaCompra = fecha || c.ultimaCompra; c.ultimoTipo = tipo; }
  return c;
}

// Arma la colección entera desde los pedidos finalizados. Se puede correr las veces que haga falta:
// recalcula todo y pisa lo que había. Devuelve { pedidos, conTelefono, clientes }.
export async function reconstruirClientes(db) {
  const snap = await getDocs(collection(db, 'pedidos'));
  const porTel = {};
  let pedidos = 0, conTelefono = 0;
  snap.docs.forEach(d => {
    const p = d.data();
    if (p.estado !== 'finalizado' || !p.venta?.tipoCliente) return;
    pedidos++;
    const tel = telefonoDePedido(p);
    if (!tel) return;
    conTelefono++;
    porTel[tel] = sumarCompra(porTel[tel], p.venta.tipoCliente, p.finalizadoAt || p.createdAt || null);
  });
  const ahora = new Date().toISOString();
  const entradas = Object.entries(porTel);
  for (let i = 0; i < entradas.length; i += 450) {
    const batch = writeBatch(db);
    entradas.slice(i, i + 450).forEach(([tel, c]) => {
      batch.set(doc(db, COLECCION_CLIENTES, tel), { telefono: tel, ...c, tipoSugerido: tipoSugerido(c), actualizadoEn: ahora });
    });
    await batch.commit();
  }
  return { pedidos, conTelefono, clientes: entradas.length };
}

// Lo que se sabe del cliente de un pedido: { telefono, cliente | null }. Sin teléfono, null.
export async function clienteDelPedido(db, pedido) {
  const tel = telefonoDePedido(pedido);
  if (!tel) return null;
  const snap = await getDoc(doc(db, COLECCION_CLIENTES, tel));
  return { telefono: tel, cliente: snap.exists() ? snap.data() : null };
}

// Al anotar la venta de un pedido: suma esa compra al cliente.
export async function anotarCompraDelCliente(db, pedido, tipo, fecha) {
  const tel = telefonoDePedido(pedido);
  if (!tel || !tipo) return;
  const ref = doc(db, COLECCION_CLIENTES, tel);
  const snap = await getDoc(ref);
  const c = sumarCompra(snap.exists() ? snap.data() : null, tipo, fecha);
  await setDoc(ref, { telefono: tel, compras: c.compras, tipos: c.tipos, ultimoTipo: c.ultimoTipo, ultimaCompra: c.ultimaCompra, tipoSugerido: tipoSugerido(c), actualizadoEn: new Date().toISOString() });
}
