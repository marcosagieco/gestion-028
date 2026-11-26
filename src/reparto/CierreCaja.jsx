import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, where, writeBatch, setDoc } from 'firebase/firestore';
import { X, ArrowLeft, Image as ImageIcon, Loader2, AlertTriangle, CheckCircle2, ChevronDown, Copy, Plus, Trash2, RotateCcw, FileText } from 'lucide-react';
import { METODO_POR_ID, diaLocal, formatARS, formatUSD, labelMetodo, labelPago } from './cobro';
import { repartidorConfig, repartidorDe } from './repartidores';
import { costoMotomensajeriaEstimado } from './motomensajeria';

// Cierre de caja con cada motomensajero, con la misma forma que el cierre que se armaba a mano y se
// mandaba por WhatsApp:
//
//   💵 Recibido por la moto ......... lo que cobró y quedó en sus manos: efectivo y lo que el
//                                      cliente le transfirió a SU cuenta (los dólares, aparte).
//   🏦 Transferencias directas ...... lo que entró a las cuentas de 028 (alias 1-4), al entregar o
//                                      antes (los que pagaron por el bot). No pasa por la moto.
//   🛵 Envíos para la moto .......... sus viajes (km medidos con Google Maps al entregar) y otros
//                                      gastos que se anotan a mano (ej. una guía de Vía Cargo).
//   💰 Saldo ........................ recibido − envíos − lo que ya te entregó a cuenta
//                                      (+ lo que vos le adelantaste).
//   ⚠️ Pendiente para cerrar exacto . pedidos donde lo cobrado no da el total, transferencias sin foto.
//
// Los cobros salen de `cobroEntrega` (lo carga el motomensajero al tocar "Entregado", ver
// CobroEntregaModal). Los movimientos a mano (ya te entregó plata, le adelantaste, gastos) van en
// `cajaMovimientos` con cierreId null hasta que se cierran.
//
// "Cerrar caja" salda todo lo pendiente de ese motomensajero: cobros rendidos, viajes pagados
// (igual que Inicio, que muestra la misma deuda) y movimientos cerrados, y guarda el cierre en
// `cierresCaja` con el texto para WhatsApp. Solo el depósito lo puede tocar.

const MOVIMIENTOS = {
  entrego: { label: 'Ya te entregó plata', corto: 'Ya entregó', signo: -1, ayuda: 'Plata que la moto te dio a cuenta antes del cierre.' },
  cargo: { label: 'Otro gasto de la moto', corto: 'Gasto', signo: -1, ayuda: 'Algo que le tenés que pagar además de los viajes (ej. una guía de Vía Cargo).' },
  adelanto: { label: 'Le adelantaste plata', corto: 'Adelanto', signo: +1, ayuda: 'Plata que le diste vos antes del cierre.' },
};

const nombreDia = (key, largo = false) => {
  if (!key) return 'Sin fecha';
  const [a, m, d] = key.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  const dia = f.toLocaleDateString('es-AR', { weekday: 'long' });
  const fecha = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  if (largo) return `${dia} ${fecha}`;
  if (key === diaLocal(new Date().toISOString())) return `Hoy ${fecha}`;
  if (key === diaLocal(new Date(Date.now() - 864e5).toISOString())) return `Ayer ${fecha}`;
  return `${dia} ${fecha}`;
};
const fechaHora = (iso) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const esEntrega = (p) => p.tipoEnvio === 'moto' && (p.estado === 'entregado' || p.estado === 'finalizado') && p.entregadoEn;
const lugar = (p) => (p.direccion?.texto || p.cliente || 'Sin dirección').split(',')[0].trim();
const comoLoRecibio = (medioPago) => medioPago === 'efectivo' ? 'en efectivo' : medioPago === 'repartidor' ? 'por transferencia a la moto' : labelMetodo(medioPago);

// Lo que el cliente ya había transferido a 028 antes de que salga la moto (pedidos del bot).
const pagadoAntes = (p) => {
  if (typeof p.total !== 'number') return 0;
  if (p.medioPago === 'transferencia' && p.comprobante) return p.total;
  if (p.medioPago === 'mitad y mitad' && p.comprobante && p.aTransferir > 0) return p.aTransferir;
  return 0;
};

function cuentaPendiente(pedidos, repartidorId, movimientos) {
  const suyos = pedidos.filter(p => repartidorDe(p) === repartidorId);
  // Solo las entregas hechas con el cierre de caja (las que tienen el cobro anotado) y que todavía no
  // entraron en un cierre. Los viajes de antes (cientos, nunca marcados como pagados) quedan afuera:
  // siguen en la deuda de Inicio como siempre.
  const abiertas = suyos.filter(p => esEntrega(p) && p.cobroEntrega && !p.cobroEntrega.cierreId)
    .sort((a, b) => new Date(a.entregadoEn) - new Date(b.entregadoEn));
  const cobros = abiertas.filter(p => !p.cobroEntrega.yaPagado);

  const recibido = []; // { p, medioPago, monto } — en manos de la moto, en pesos
  const dolares = [];
  const directo = []; // a cuentas de 028
  abiertas.forEach(p => {
    const antes = pagadoAntes(p);
    if (antes > 0) directo.push({ p, medioPago: p.cuentaCobro || 'antes', monto: antes, antes: true });
    if (p.cobroEntrega.yaPagado) return;
    (p.cobroEntrega.pagos || []).forEach(pg => {
      const fila = { p, medioPago: pg.medioPago, detalle: pg.detalle, monto: Number(pg.monto) || 0 };
      if (pg.medioPago === 'usd') dolares.push(fila);
      else if (METODO_POR_ID[pg.medioPago]?.loTieneElRepartidor) recibido.push(fila);
      else directo.push(fila);
    });
  });

  // El viaje de cada entrega. Si la medición con Google Maps no llegó a guardarse se usa el
  // estimado en línea recta, para que nunca cuente $0.
  const viajes = abiertas
    .filter(p => !p.motomensajeria || p.motomensajeria.pagado === false)
    .map(p => {
      const m = p.motomensajeria || costoMotomensajeriaEstimado(p.direccion) || { km: 0, monto: 3000 }; // sin coordenadas: el mínimo
      return { p, monto: m.monto || 0, km: m.km || 0, estimado: !p.motomensajeria || m.exacto === false, sinGuardar: !p.motomensajeria };
    });
  const viajePorId = Object.fromEntries(viajes.map(v => [v.p.id, v]));

  const movs = movimientos.filter(m => m.repartidor === repartidorId);
  const sumaMov = (tipo) => movs.filter(m => m.tipo === tipo).reduce((s, m) => s + (Number(m.monto) || 0), 0);
  const suma = (l) => l.reduce((s, x) => s + x.monto, 0);

  const totalRecibido = suma(recibido);
  const totalViajes = suma(viajes);
  const totalGastos = sumaMov('cargo');
  const totalEnvios = totalViajes + totalGastos;
  const yaEntrego = sumaMov('entrego');
  const adelantado = sumaMov('adelanto');
  const saldo = totalRecibido - totalEnvios - yaEntrego + adelantado;

  // Para cerrar exacto: pedidos donde lo cobrado (antes + al entregar) no da el total del pedido.
  const pendientes = [];
  abiertas.forEach(p => {
    const cb = p.cobroEntrega;
    if (!cb.yaPagado && (cb.pagos || []).some(pg => METODO_POR_ID[pg.medioPago]?.transferencia) && !(cb.fotos || []).length) {
      pendientes.push(`${lugar(p)}: la transferencia no tiene foto del comprobante.`);
    }
    if (typeof p.total !== 'number' || cb.yaPagado || (cb.pagos || []).some(pg => pg.medioPago === 'usd')) return;
    const cobrado = pagadoAntes(p) + (cb.pagos || []).reduce((s, pg) => s + (Number(pg.monto) || 0), 0);
    const dif = p.total - cobrado;
    if (Math.abs(dif) >= 100) {
      pendientes.push(dif > 0
        ? `${lugar(p)}: el pedido suma ${formatARS(p.total)} y se cobraron ${formatARS(cobrado)}. Faltan ${formatARS(dif)}.`
        : `${lugar(p)}: el pedido suma ${formatARS(p.total)} y se cobraron ${formatARS(cobrado)}. Son ${formatARS(-dif)} de más.`);
    }
  });

  const sinViaje = viajes.filter(v => v.sinGuardar && Date.now() - new Date(v.p.entregadoEn).getTime() < 2 * 60e3).length;
  const dias = [...new Set(abiertas.map(p => diaLocal(p.entregadoEn)))];

  return {
    abiertas, cobros, recibido, dolares, directo, viajes, viajePorId, movs,
    totalRecibido, totalDolares: suma(dolares), totalDirecto: suma(directo), totalViajes, totalGastos, totalEnvios,
    yaEntrego, adelantado, saldo, pendientes, sinViaje, dias,
    estimados: viajes.filter(v => v.estimado).length,
  };
}

// El cierre en texto, con el mismo formato que se mandaba por WhatsApp.
function textoWhatsApp(c, nombre) {
  const L = [];
  const porDia = (filas) => {
    const g = {};
    filas.forEach(f => { const k = diaLocal(f.p.entregadoEn); (g[k] = g[k] || []).push(f); });
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  };
  const dias = [...c.dias].sort().map(d => nombreDia(d, true));
  L.push(`📋 *CIERRE ${nombre.toUpperCase()} — ${dias.join(' Y ').toUpperCase()}*`);

  const recibidoPorDia = porDia(c.recibido);
  recibidoPorDia.forEach(([k, filas]) => {
    L.push('', `💵 *Recibido por la moto${recibidoPorDia.length > 1 ? ` — ${nombreDia(k, true)}` : ''}*`);
    filas.forEach(f => L.push(`• ${lugar(f.p)}: ${formatARS(f.monto)} ${comoLoRecibio(f.medioPago)}`));
    L.push(`• *Total: ${formatARS(filas.reduce((s, f) => s + f.monto, 0))}*`);
  });
  if (!c.recibido.length) L.push('', '💵 *Recibido por la moto*', '• Nada');

  if (c.directo.length) {
    L.push('', '🏦 *Transferencias directas a ustedes*');
    c.directo.forEach(f => L.push(`• ${lugar(f.p)}: ${formatARS(f.monto)}${f.antes ? ' (antes del envío)' : ` (${labelPago(f)})`}`));
    L.push(`• *Total: ${formatARS(c.totalDirecto)}*`);
  }

  L.push('', '🛵 *Envíos para la moto*');
  c.viajes.forEach(v => L.push(`• ${lugar(v.p)}: ${formatARS(v.monto)}${v.estimado ? ' (estimado)' : ''}`));
  c.movs.filter(m => m.tipo === 'cargo').forEach(m => L.push(`• ${m.nota || 'Otro gasto'}: ${formatARS(m.monto)}`));
  L.push(`• *Total: ${formatARS(c.totalEnvios)}*`);

  L.push('', '💰 *Saldo*');
  L.push(`• Recibido por la moto en pesos: ${formatARS(c.totalRecibido)}`);
  L.push(`• Menos envíos${c.totalGastos ? ' y gastos' : ''}: ${formatARS(c.totalEnvios)}`);
  c.movs.filter(m => m.tipo === 'entrego').forEach(m => L.push(`• Menos los ${formatARS(m.monto)} que ya te entregó${m.nota ? ` (${m.nota})` : ''}`));
  c.movs.filter(m => m.tipo === 'adelanto').forEach(m => L.push(`• Más los ${formatARS(m.monto)} que le adelantaste${m.nota ? ` (${m.nota})` : ''}`));
  const s = Math.round(c.saldo);
  L.push(s > 0 ? `• *La moto te tiene que entregar: ${formatARS(s)}*` : s < 0 ? `• *Le tenés que pagar a la moto: ${formatARS(-s)}*` : '• *Están a mano*');

  if (c.totalDolares > 0) {
    L.push('', `💵 Además la moto recibió *${formatUSD(c.totalDolares)}* (${c.dolares.map(f => lugar(f.p)).join(', ')}). Aparte, sin convertir.`);
  }
  if (c.pendientes.length) {
    L.push('', '⚠️ *Pendiente para cerrar exacto*');
    c.pendientes.forEach(t => L.push(`• ${t}`));
  }
  return L.join('\n');
}


// ¿Este pago lo marcó el cierre `ci`? Los cierres viejos no guardaban el cierreId en el viaje: se
// reconoce porque se marcó pagado en el mismo momento del cierre.
const viajeDeEsteCierre = (m, ci) => m && m.pagado && (m.cierreId === ci.id
  || (!m.cierreId && m.pagadaEl && Math.abs(new Date(m.pagadaEl) - new Date(ci.fecha)) < 5 * 60e3));

// Pantalla del cierre de caja. En el depósito es una página propia (/pedidos/reparto/cierre-de-caja,
// con `volverA`); en el celular del motomensajero se abre encima de su recorrido (`onClose`), solo
// para mirar.
export default function CierreCaja({ dm, db, pedidos, repartidores, puedeCerrar = false, onClose, volverA, volverLabel = 'Volver' }) {
  const [sel, setSel] = useState(repartidores[0]);
  const yo = repartidorConfig(sel);
  const esRepartidor = !puedeCerrar;

  // Movimientos a mano todavía sin cerrar (de los tres motomensajeros, para el saldo de cada solapa).
  const [movimientos, setMovimientos] = useState([]);
  useEffect(() => onSnapshot(query(collection(db, 'cajaMovimientos'), where('cierreId', '==', null)),
    snap => setMovimientos(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))),
    () => setMovimientos([])), [db]);

  const cuentas = useMemo(() => Object.fromEntries(repartidores.map(id => [id, cuentaPendiente(pedidos, id, movimientos)])), [pedidos, repartidores, movimientos]);
  const c = cuentas[sel];
  const texto = useMemo(() => textoWhatsApp(c, yo.nombre), [c, yo.nombre]);

  const [cierres, setCierres] = useState([]);
  useEffect(() => onSnapshot(query(collection(db, 'cierresCaja'), where('repartidor', '==', sel)),
    snap => setCierres(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 30)),
    () => setCierres([])), [db, sel]);

  const [aviso, setAviso] = useState('');
  const avisar = (t) => { setAviso(t); setTimeout(() => setAviso(''), 3500); };
  const copiar = async (t) => {
    try { await navigator.clipboard.writeText(t); avisar('Copiado. Pegalo en WhatsApp.'); }
    catch { avisar('No se pudo copiar.'); }
  };

  // --- movimientos a mano ---
  const [nuevoMov, setNuevoMov] = useState(null); // { tipo, monto, nota }
  const guardarMov = async () => {
    const monto = parseFloat(String(nuevoMov?.monto || '').replace(/\./g, '').replace(',', '.')) || 0;
    if (!monto) return;
    try {
      await addDoc(collection(db, 'cajaMovimientos'), { repartidor: sel, tipo: nuevoMov.tipo, monto, nota: nuevoMov.nota.trim(), fecha: new Date().toISOString(), cierreId: null });
      setNuevoMov(null);
    } catch (e) { avisar('No se pudo guardar: ' + e.message); }
  };
  const borrarMov = async (m) => {
    if (!window.confirm(`¿Borrar "${MOVIMIENTOS[m.tipo]?.label}: ${formatARS(m.monto)}"?`)) return;
    try { await deleteDoc(doc(db, 'cajaMovimientos', m.id)); } catch (e) { avisar('No se pudo borrar: ' + e.message); }
  };

  // --- cerrar ---
  const [confirmando, setConfirmando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const hayAlgo = c.abiertas.length > 0 || c.movs.length > 0;

  const aplicar = async (ops) => {
    for (let i = 0; i < ops.length; i += 450) {
      const batch = writeBatch(db);
      ops.slice(i, i + 450).forEach(([ref, cambios]) => batch.update(ref, cambios));
      await batch.commit();
    }
  };

  const cerrarCaja = async () => {
    if (cerrando || !hayAlgo) return;
    setCerrando(true);
    try {
      const nowIso = new Date().toISOString();
      const cierreRef = doc(collection(db, 'cierresCaja'));
      await aplicar([
        ...c.abiertas.map(p => {
          const v = c.viajePorId[p.id];
          const cambios = { 'cobroEntrega.rendido': true, 'cobroEntrega.rendidoEn': nowIso, 'cobroEntrega.cierreId': cierreRef.id };
          // Si el viaje nunca se llegó a medir, queda guardado el estimado con el que se pagó.
          if (v && v.sinGuardar) cambios.motomensajeria = { km: v.km, monto: v.monto, exacto: false, pagado: true, pagadaEl: nowIso, cierreId: cierreRef.id };
          else if (v) Object.assign(cambios, { 'motomensajeria.pagado': true, 'motomensajeria.pagadaEl': nowIso, 'motomensajeria.cierreId': cierreRef.id });
          return [doc(db, 'pedidos', p.id), cambios];
        }),
        ...c.movs.map(m => [doc(db, 'cajaMovimientos', m.id), { cierreId: cierreRef.id }]),
      ]);
      await setDoc(cierreRef, {
        repartidor: sel, fecha: nowIso,
        recibido: c.totalRecibido, directo: c.totalDirecto, usd: c.totalDolares,
        viajes: c.totalViajes, cantidadViajes: c.viajes.length, gastos: c.totalGastos,
        yaEntrego: c.yaEntrego, adelantado: c.adelantado, saldo: c.saldo,
        pedidos: c.abiertas.map(p => p.id), texto,
      });
      if (c.viajes.length) {
        await setDoc(doc(db, 'settings', yo.docUltimoPago), { monto: c.totalViajes, cantidadEnvios: c.viajes.length, fecha: nowIso });
      }
      setConfirmando(false);
      avisar('Caja cerrada. Quedó guardada en el historial.');
    } catch (e) {
      avisar('No se pudo cerrar la caja: ' + e.message);
    } finally {
      setCerrando(false);
    }
  };

  // --- borrar un cierre del historial ---
  // "Volver a abrir": las entregas, viajes y movimientos de ese cierre vuelven a quedar pendientes
  // (para corregir algo y cerrarlo de nuevo). "Borrar del todo": solo desaparece del historial; lo que
  // tenía no vuelve a la caja (sirve para un cierre de prueba).
  const [borrando, setBorrando] = useState(null); // id del cierre con el cartel abierto
  const [trabajando, setTrabajando] = useState(false);
  const reabrirCierre = async (ci) => {
    setTrabajando(true);
    try {
      const ids = new Set([...(ci.pedidos || []), ...pedidos.filter(p => p.cobroEntrega?.cierreId === ci.id).map(p => p.id)]);
      const ops = [];
      ids.forEach(id => {
        const p = pedidos.find(x => x.id === id);
        if (!p?.cobroEntrega) return;
        const cambios = { 'cobroEntrega.rendido': false, 'cobroEntrega.rendidoEn': null, 'cobroEntrega.cierreId': null };
        if (viajeDeEsteCierre(p.motomensajeria, ci)) Object.assign(cambios, { 'motomensajeria.pagado': false, 'motomensajeria.pagadaEl': null, 'motomensajeria.cierreId': null });
        ops.push([doc(db, 'pedidos', id), cambios]);
      });
      const movs = await getDocs(query(collection(db, 'cajaMovimientos'), where('cierreId', '==', ci.id)));
      movs.docs.forEach(d => ops.push([d.ref, { cierreId: null }]));
      await aplicar(ops);
      await deleteDoc(doc(db, 'cierresCaja', ci.id));
      setBorrando(null);
      avisar('Cierre borrado. Sus entregas volvieron a la caja de arriba.');
    } catch (e) {
      avisar('No se pudo borrar: ' + e.message);
    } finally {
      setTrabajando(false);
    }
  };
  const borrarCierre = async (ci) => {
    setTrabajando(true);
    try {
      await deleteDoc(doc(db, 'cierresCaja', ci.id));
      setBorrando(null);
      avisar('Cierre borrado del historial.');
    } catch (e) {
      avisar('No se pudo borrar: ' + e.message);
    } finally {
      setTrabajando(false);
    }
  };

  const [viendo, setViendo] = useState(null);
  const verComprobantes = async (p) => {
    setViendo({ cargando: true, fotos: [] });
    try {
      const snaps = await Promise.all((p.cobroEntrega?.fotos || []).map(id => getDoc(doc(db, 'comprobantesEntrega', id))));
      setViendo({ cargando: false, fotos: snaps.filter(s => s.exists()).map(s => s.data().imagen) });
    } catch (e) {
      setViendo({ cargando: false, fotos: [], error: e.message });
    }
  };
  const [abiertoCierre, setAbiertoCierre] = useState(null);
  const [detalle, setDetalle] = useState(null); // qué parte del detalle está desplegada
  const [mensajeAbierto, setMensajeAbierto] = useState(null); // renglón con el pedido desplegado

  const tx = dm ? 'text-zinc-100' : 'text-zinc-900';
  const suave = dm ? 'text-zinc-400' : 'text-zinc-500';
  const tarjeta = `rounded-2xl border ${dm ? 'bg-[#141414] border-white/[0.07]' : 'bg-white border-zinc-200'}`;
  const linea = `border-t ${dm ? 'border-white/[0.08]' : 'border-zinc-200'}`;
  const botonGris = dm ? 'bg-white/[0.06] text-zinc-200 hover:bg-white/[0.1]' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200';

  const saldo = Math.round(c.saldo);
  const quien = esRepartidor ? 'Vos' : yo.nombre;
  const titular = saldo === 0 ? 'Están a mano'
    : saldo > 0 ? (esRepartidor ? 'Tenés que entregar' : `${yo.nombre} te tiene que dar`)
      : (esRepartidor ? 'Te tienen que pagar' : `Le tenés que pagar a ${yo.nombre}`);
  const colorSaldo = saldo > 0 ? 'text-emerald-500' : saldo < 0 ? 'text-indigo-400' : suave;

  const recibidoPorDia = useMemo(() => {
    const g = {};
    c.recibido.forEach(f => { const k = diaLocal(f.p.entregadoEn); (g[k] = g[k] || []).push(f); });
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [c.recibido]);

  // Un renglón de la cuenta: "texto ......... $monto". Con `pedido`, abajo aparece "Ver pedido",
  // que despliega el mensaje con el que se cargó el pedido en la web (el mismo de Pedidos reparto).
  const fila = (key, izq, der, { signo, fuerte, ayuda, borrar, p, pedido } = {}) => {
    const abierto = pedido && mensajeAbierto === key;
    return (
      <div key={key} className="py-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className={`min-w-0 ${fuerte ? `text-[15px] font-black ${tx}` : `text-[14px] ${tx}`}`}>
            {izq}
            {ayuda && <span className={`block text-[12px] font-normal ${suave}`}>{ayuda}</span>}
            {(pedido || p?.cobroEntrega?.fotos?.length > 0 || borrar) && (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                {pedido && (
                  <button onClick={() => setMensajeAbierto(abierto ? null : key)} className="inline-flex items-center gap-0.5 text-[12px] font-bold text-indigo-400">
                    <FileText size={13}/> {abierto ? 'Ocultar pedido' : 'Ver pedido'}
                  </button>
                )}
                {p?.cobroEntrega?.fotos?.length > 0 && (
                  <button onClick={() => verComprobantes(p)} className="inline-flex items-center gap-0.5 text-[12px] font-bold text-indigo-400"><ImageIcon size={13}/> Ver comprobante</button>
                )}
                {borrar && <button onClick={borrar} title="Borrar" className="text-rose-400"><Trash2 size={13}/></button>}
              </span>
            )}
          </span>
          <span className={`flex-shrink-0 tabular-nums ${fuerte ? `text-[17px] font-black ${tx}` : `text-[14px] font-bold ${tx}`}`}>
            {signo && <span className={suave}>{signo} </span>}{der}
          </span>
        </div>
        {abierto && (
          <div className={`mt-2 rounded-xl p-3 text-[13px] ${dm ? 'bg-white/[0.04] text-zinc-300' : 'bg-zinc-50 text-zinc-700'}`}>
            <p className="whitespace-pre-wrap leading-relaxed">{pedido.mensaje?.trim() || 'Este pedido no tiene mensaje cargado.'}</p>
            <div className={`flex flex-wrap gap-x-4 gap-y-0.5 mt-2 pt-2 border-t text-[12px] ${dm ? 'border-white/[0.06]' : 'border-zinc-200'} ${suave}`}>
              {pedido.direccion?.texto && <span>📍 {pedido.direccion.texto}</span>}
              {typeof pedido.total === 'number' && <span>Total del pedido: <b className={tx}>{formatARS(pedido.total)}</b></span>}
              {pedido.medioPago && <span>Le dijo al bot: {pedido.medioPago}</span>}
              {pedido.entregadoEn && <span>Entregado: {fechaHora(pedido.entregadoEn)}</span>}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Una parte del detalle, plegada: el título con su total, y al tocar se abre la lista.
  const plegable = (id, titulo, explicacion, totalTxt, contenido) => {
    const abierto = detalle === id;
    return (
      <div className={tarjeta}>
        <button onClick={() => setDetalle(abierto ? null : id)} className="w-full flex items-center gap-3 p-4 text-left">
          <span className="flex-1 min-w-0">
            <span className={`block text-[15px] font-black ${tx}`}>{titulo}</span>
            <span className={`block text-[12.5px] mt-0.5 ${suave}`}>{explicacion}</span>
          </span>
          <span className={`text-[15px] font-black tabular-nums ${tx}`}>{totalTxt}</span>
          <ChevronDown size={18} className={`flex-shrink-0 transition-transform ${suave} ${abierto ? 'rotate-180' : ''}`}/>
        </button>
        {abierto && <div className={`px-4 pb-3 pt-1 ${linea}`}>{contenido}</div>}
      </div>
    );
  };

  const volver = volverA ? (
    <Link to={volverA} className={`h-10 pl-2 pr-3 -ml-2 rounded-xl flex items-center gap-1.5 text-[14px] font-bold ${dm ? 'text-zinc-300 hover:bg-white/[0.06]' : 'text-zinc-600 hover:bg-zinc-100'}`}>
      <ArrowLeft size={19}/> <span className="hidden sm:inline">{volverLabel}</span><span className="sm:hidden">Volver</span>
    </Link>
  ) : (
    <button onClick={onClose} className={`h-10 pl-2 pr-3 -ml-2 rounded-xl flex items-center gap-1.5 text-[14px] font-bold ${dm ? 'text-zinc-300 hover:bg-white/[0.06]' : 'text-zinc-600 hover:bg-zinc-100'}`}>
      <ArrowLeft size={19}/> {volverLabel}
    </button>
  );

  return (
    <div className={`fixed inset-0 z-[200] flex flex-col ${dm ? 'bg-[#050505] text-zinc-100' : 'bg-slate-50 text-zinc-900'}`} style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className={`border-b flex-shrink-0 ${dm ? 'bg-[#101010] border-white/[0.06]' : 'bg-white border-zinc-200'}`} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto flex items-center gap-2 px-4 h-14">
          {volver}
          <p className="font-black text-lg tracking-tight flex-1 text-center sm:text-left">{esRepartidor ? 'Mi caja' : 'Cierre de caja'}</p>
          {hayAlgo ? (
            <button onClick={() => copiar(texto)} className={`h-9 px-3 rounded-lg text-sm font-bold flex items-center gap-1.5 ${botonGris}`}>
              <Copy size={15}/> <span className="hidden sm:inline">Copiar para WhatsApp</span><span className="sm:hidden">Copiar</span>
            </button>
          ) : <span className="w-16"/>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">

          {!esRepartidor && (
            <p className={`text-[13.5px] leading-snug px-1 ${suave}`}>
              Cuánta plata te tiene que dar cada moto (lo que cobró) y cuánto le tenés que pagar vos (sus viajes).
              Se arma solo con lo que anota el repartidor al tocar «Entregado».
            </p>
          )}

          {/* 1. Elegir la moto */}
          {repartidores.length > 1 && (
            <div className="grid grid-cols-3 gap-2">
              {repartidores.map(id => {
                const s = Math.round(cuentas[id].saldo);
                const nada = cuentas[id].abiertas.length === 0 && cuentas[id].movs.length === 0;
                const activo = id === sel;
                return (
                  <button key={id} onClick={() => { setSel(id); setConfirmando(false); setNuevoMov(null); setDetalle(null); setBorrando(null); }}
                    className={`rounded-2xl border-2 p-3 text-left transition-all ${activo
                      ? (dm ? 'border-indigo-400/70 bg-indigo-500/[0.08]' : 'border-indigo-400 bg-white shadow-sm')
                      : (dm ? 'border-white/[0.06] bg-[#111]' : 'border-zinc-200 bg-white/60')}`}>
                    <span className={`flex items-center gap-1.5 text-[14px] font-black ${tx}`}><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: repartidorConfig(id).color }}/>{repartidorConfig(id).nombre}</span>
                    <span className={`block text-[12.5px] font-bold mt-1 tabular-nums ${nada ? suave : s > 0 ? 'text-emerald-500' : s < 0 ? 'text-indigo-400' : suave}`}>
                      {nada ? 'Nada pendiente' : s === 0 ? 'A mano' : s > 0 ? `Te da ${formatARS(s)}` : `Le pagás ${formatARS(-s)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 2. La cuenta, a la vista */}
          {!hayAlgo ? (
            <div className={`${tarjeta} p-6 text-center`}>
              <CheckCircle2 size={34} className="mx-auto text-emerald-500"/>
              <p className={`text-lg font-black mt-2 ${tx}`}>No hay nada para cerrar{esRepartidor ? '' : ` con ${yo.nombre}`}</p>
              <p className={`text-[13.5px] mt-1 ${suave}`}>Cuando {esRepartidor ? 'entregues' : 'entregue'} pedidos y {esRepartidor ? 'anotes' : 'anote'} cómo pagaron, aparecen acá.</p>
            </div>
          ) : (
            <div className={`rounded-3xl border-2 p-5 ${dm ? 'bg-[#121212] border-white/[0.1]' : 'bg-white border-zinc-200'}`}>
              <p className={`text-[13px] font-bold ${suave}`}>
                {c.abiertas.length} {c.abiertas.length === 1 ? 'entrega' : 'entregas'} · {[...c.dias].sort().map(d => nombreDia(d)).join(', ')}
              </p>
              <p className={`text-[15px] font-black mt-2 ${colorSaldo}`}>{titular}</p>
              <p className={`text-[44px] leading-none font-black tabular-nums mt-1 ${saldo === 0 ? tx : colorSaldo}`}>{formatARS(Math.abs(saldo))}</p>
              {c.totalDolares > 0 && <p className={`text-lg font-black mt-1.5 ${tx}`}>+ {formatUSD(c.totalDolares)} en dólares <span className={`text-[13px] font-bold ${suave}`}>(aparte)</span></p>}

              <div className={`mt-4 pt-3 ${linea}`}>
                <p className={`text-[11px] font-black uppercase tracking-widest mb-1 ${suave}`}>Cómo sale la cuenta</p>
                {fila('r', `${quien} cobró en mano`, formatARS(c.totalRecibido), { ayuda: 'Efectivo y transferencias a su cuenta' })}
                {fila('v', `Menos ${c.viajes.length === 1 ? 'el viaje' : `los ${c.viajes.length} viajes`}${c.totalGastos ? ' y gastos' : ''}`, formatARS(c.totalEnvios), { signo: '−', ayuda: 'Lo que le pagás por llevar los pedidos' })}
                {c.movs.filter(m => m.tipo === 'entrego').map(m => fila(m.id, 'Menos lo que ya te dio', formatARS(m.monto), { signo: '−', ayuda: m.nota || fechaHora(m.fecha), borrar: puedeCerrar ? () => borrarMov(m) : null }))}
                {c.movs.filter(m => m.tipo === 'adelanto').map(m => fila(m.id, 'Más lo que le adelantaste', formatARS(m.monto), { signo: '+', ayuda: m.nota || fechaHora(m.fecha), borrar: puedeCerrar ? () => borrarMov(m) : null }))}
                <div className={`mt-1 pt-1 ${linea}`}>
                  {fila('s', saldo > 0 ? (esRepartidor ? 'Tenés que entregar' : 'Te tiene que dar') : saldo < 0 ? (esRepartidor ? 'Te tienen que pagar' : 'Le tenés que pagar') : 'Están a mano', formatARS(Math.abs(saldo)), { signo: '=', fuerte: true })}
                </div>
              </div>
            </div>
          )}

          {/* Lo que hay que revisar antes de cerrar */}
          {hayAlgo && c.pendientes.length > 0 && (
            <div className={`rounded-2xl border p-4 ${dm ? 'border-amber-500/30 bg-amber-500/[0.06]' : 'border-amber-200 bg-amber-50'}`}>
              <p className="text-[14px] font-black text-amber-500 flex items-center gap-1.5"><AlertTriangle size={16}/> Revisá esto antes de cerrar</p>
              {c.pendientes.map((t, i) => <p key={i} className={`text-[13.5px] mt-1 ${dm ? 'text-amber-200/90' : 'text-amber-800'}`}>• {t}</p>)}
            </div>
          )}
          {hayAlgo && c.sinViaje > 0 && (
            <p className="text-[13px] font-bold text-amber-500 flex gap-1.5 px-1"><AlertTriangle size={15} className="flex-shrink-0 mt-0.5"/> {c.sinViaje === 1 ? '1 viaje se está' : `${c.sinViaje} viajes se están`} midiendo todavía. Esperá unos segundos antes de cerrar.</p>
          )}

          {/* 3. El detalle, pedido por pedido (plegado) */}
          {hayAlgo && <>
            <p className={`text-[11px] font-black uppercase tracking-widest px-1 pt-2 ${suave}`}>Detalle · tocá para ver pedido por pedido</p>

            {plegable('cobro', `💵 Lo que cobró ${esRepartidor ? 'en mano' : 'la moto'}`, 'Efectivo y lo que le transfirieron a su cuenta',
              formatARS(c.totalRecibido), <>
                {recibidoPorDia.length === 0 && c.dolares.length === 0 && <p className={`text-[14px] py-1.5 ${suave}`}>No cobró nada en mano.</p>}
                {recibidoPorDia.map(([k, filas]) => (
                  <div key={k}>
                    {recibidoPorDia.length > 1 && <p className={`text-[11px] font-black uppercase tracking-widest mt-2 ${suave}`}>{nombreDia(k)}</p>}
                    {filas.map((f, i) => fila(`${f.p.id}${i}`, lugar(f.p), formatARS(f.monto), { ayuda: comoLoRecibio(f.medioPago), p: f.p, pedido: f.p }))}
                  </div>
                ))}
                {c.dolares.map((f, i) => fila(`usd${i}`, lugar(f.p), formatUSD(f.monto), { ayuda: 'en dólares (va aparte)', p: f.p, pedido: f.p }))}
              </>)}

            {plegable('viajes', '🛵 Viajes que le pagás', `$1.000 por km (Google Maps), mínimo $3.000${c.totalGastos ? ' · más gastos' : ''}`,
              formatARS(c.totalEnvios), <>
                {c.viajes.map(v => fila(v.p.id, lugar(v.p), formatARS(v.monto), { ayuda: `${Math.round(v.km * 10) / 10} km${v.estimado ? ' · estimado (no se pudo medir)' : ''}`, pedido: v.p }))}
                {c.movs.filter(m => m.tipo === 'cargo').map(m => fila(m.id, m.nota || 'Otro gasto', formatARS(m.monto), { ayuda: 'gasto anotado a mano', borrar: puedeCerrar ? () => borrarMov(m) : null }))}
              </>)}

            {c.directo.length > 0 && plegable('directo', '🏦 Entró directo a tus cuentas', 'Alias 3 u otro medio. No pasa por la moto: no se suma, es para controlar',
              formatARS(c.totalDirecto), <>
                {c.directo.map((f, i) => fila(`d${i}`, lugar(f.p), formatARS(f.monto), { ayuda: f.antes ? 'pagó antes del envío' : labelPago(f), p: f.antes ? null : f.p, pedido: f.p }))}
              </>)}
          </>}

          {/* 4. Acciones */}
          {puedeCerrar && (nuevoMov ? (
            <div className={`${tarjeta} p-4 space-y-3`}>
              <p className={`text-[15px] font-black ${tx}`}>¿Qué querés anotar?</p>
              <div className="grid grid-cols-3 gap-1.5">
                {Object.entries(MOVIMIENTOS).map(([id, m]) => (
                  <button key={id} onClick={() => setNuevoMov(v => ({ ...v, tipo: id }))}
                    className={`min-h-12 px-2 py-1.5 rounded-xl border text-[13px] font-bold leading-tight ${nuevoMov.tipo === id ? 'bg-indigo-500 border-transparent text-white' : (dm ? 'border-white/[0.08] text-zinc-300' : 'border-zinc-200 text-zinc-700')}`}>
                    {m.label}
                  </button>
                ))}
              </div>
              <p className={`text-[12.5px] ${suave}`}>{MOVIMIENTOS[nuevoMov.tipo].ayuda}</p>
              <div className="flex gap-2">
                <input value={nuevoMov.monto} onChange={e => setNuevoMov(v => ({ ...v, monto: e.target.value.replace(/[^\d.,]/g, '') }))} inputMode="decimal" placeholder="$ Monto" autoFocus
                  className={`w-32 h-11 px-3 rounded-xl border outline-none font-bold ${dm ? 'bg-[#101010] border-white/[0.08] text-zinc-100' : 'bg-white border-zinc-200'}`} />
                <input value={nuevoMov.nota} onChange={e => setNuevoMov(v => ({ ...v, nota: e.target.value }))} placeholder={nuevoMov.tipo === 'cargo' ? 'Ej: guía Vía Cargo' : 'Nota (opcional)'}
                  className={`flex-1 min-w-0 h-11 px-3 rounded-xl border outline-none ${dm ? 'bg-[#101010] border-white/[0.08] text-zinc-100' : 'bg-white border-zinc-200'}`} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setNuevoMov(null)} className={`flex-1 h-11 rounded-xl font-bold ${botonGris}`}>Cancelar</button>
                <button onClick={guardarMov} className="flex-1 h-11 rounded-xl font-black text-white bg-indigo-500">Anotar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setNuevoMov({ tipo: 'entrego', monto: '', nota: '' })}
              className={`w-full min-h-12 py-2 rounded-xl border border-dashed text-[14px] font-bold flex items-center justify-center gap-1.5 ${dm ? 'border-white/[0.15] text-zinc-300' : 'border-zinc-300 text-zinc-600'}`}>
              <Plus size={16}/> Anotar plata que ya te dio, un adelanto o un gasto
            </button>
          ))}

          {puedeCerrar && hayAlgo && (!confirmando ? (
            <div>
              <button onClick={() => setConfirmando(true)}
                className="w-full h-14 rounded-2xl font-black text-base text-white bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                <CheckCircle2 size={20}/> Cerrar la caja de {yo.nombre}
              </button>
              <p className={`text-[12.5px] text-center mt-1.5 ${suave}`}>Tocalo cuando ya se pagaron. Queda todo en cero y se guarda abajo, en el historial.</p>
            </div>
          ) : (
            <div className={`${tarjeta} p-4`}>
              <p className={`text-[15px] font-bold ${tx}`}>
                {saldo > 0 ? `¿${yo.nombre} ya te dio los ${formatARS(saldo)}` : saldo < 0 ? `¿Ya le pagaste los ${formatARS(-saldo)} a ${yo.nombre}` : '¿Cerrar la caja'}{c.totalDolares > 0 ? ` y los ${formatUSD(c.totalDolares)}` : ''}?
              </p>
              <p className={`text-[13px] mt-1 ${suave}`}>Se guarda el cierre y la caja vuelve a cero. {c.viajes.length} {c.viajes.length === 1 ? 'viaje queda pagado' : 'viajes quedan pagados'} (también en Inicio). Si te equivocás, lo podés borrar del historial.</p>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setConfirmando(false)} className={`flex-1 h-12 rounded-xl font-bold ${botonGris}`}>Todavía no</button>
                <button onClick={cerrarCaja} disabled={cerrando} className="flex-1 h-12 rounded-xl font-black text-white bg-emerald-500 disabled:opacity-60 flex items-center justify-center gap-2">
                  {cerrando ? <Loader2 size={18} className="animate-spin"/> : <CheckCircle2 size={18}/>} Sí, cerrar
                </button>
              </div>
            </div>
          ))}
          {aviso && <p className={`text-center text-sm font-bold ${aviso.startsWith('No') ? 'text-rose-500' : 'text-emerald-500'}`}>{aviso}</p>}

          {/* 5. Historial */}
          {cierres.length > 0 && (
            <div className="space-y-2 pt-4">
              <p className={`text-[11px] font-black uppercase tracking-widest px-1 ${suave}`}>Historial de cierres{repartidores.length > 1 ? ` · ${yo.nombre}` : ''}</p>
              {cierres.map(ci => {
                const s = Math.round(ci.saldo || 0);
                const abierto = abiertoCierre === ci.id;
                const n = ci.pedidos?.length || 0;
                return (
                  <div key={ci.id} className={tarjeta}>
                    <button onClick={() => setAbiertoCierre(abierto ? null : ci.id)} className="w-full flex items-center gap-3 p-3.5 text-left">
                      <span className="flex-1 min-w-0">
                        <span className={`block text-[14px] font-bold ${tx}`}>{fechaHora(ci.fecha)}</span>
                        <span className={`block text-[12px] ${suave}`}>{n} {n === 1 ? 'entrega' : 'entregas'}{ci.usd ? ` · ${formatUSD(ci.usd)}` : ''}</span>
                      </span>
                      <span className={`text-[13.5px] font-black tabular-nums ${s > 0 ? 'text-emerald-500' : s < 0 ? 'text-indigo-400' : suave}`}>
                        {s === 0 ? 'A mano' : s > 0 ? `${esRepartidor ? 'Entregaste' : 'Te dio'} ${formatARS(s)}` : `${esRepartidor ? 'Te pagaron' : 'Le pagaste'} ${formatARS(-s)}`}
                      </span>
                      <ChevronDown size={16} className={`flex-shrink-0 transition-transform ${suave} ${abierto ? 'rotate-180' : ''}`}/>
                    </button>
                    {abierto && (
                      <div className={`px-3.5 pb-3.5 pt-2 ${linea}`}>
                        {ci.texto ? (
                          <pre className={`text-[12.5px] whitespace-pre-wrap font-sans leading-relaxed ${suave}`}>{ci.texto}</pre>
                        ) : (
                          <div className={`text-[13px] space-y-0.5 ${suave}`}>
                            <p>Cobró: {formatARS(ci.recibido ?? ((ci.efectivo || 0) + (ci.transferidoASuCuenta || 0)))}{ci.usd ? ` · Dólares: ${formatUSD(ci.usd)}` : ''}</p>
                            <p>Viajes: {formatARS(ci.viajes)} ({ci.cantidadViajes})</p>
                          </div>
                        )}
                        {borrando === ci.id ? (
                          <div className={`mt-3 rounded-xl border p-3 ${dm ? 'border-rose-500/30 bg-rose-500/[0.06]' : 'border-rose-200 bg-rose-50'}`}>
                            <p className={`text-[14px] font-black ${tx}`}>¿Borrar este cierre?</p>
                            <div className="grid sm:grid-cols-2 gap-2 mt-2.5">
                              <button onClick={() => reabrirCierre(ci)} disabled={trabajando}
                                className={`rounded-xl border p-3 text-left disabled:opacity-50 ${dm ? 'border-white/[0.1] bg-[#141414]' : 'border-zinc-200 bg-white'}`}>
                                <span className={`flex items-center gap-1.5 text-[14px] font-black ${tx}`}><RotateCcw size={15}/> Borrar y volver a abrir</span>
                                <span className={`block text-[12px] mt-0.5 ${suave}`}>Sus entregas vuelven a la caja de arriba, para corregir algo y cerrarla de nuevo.</span>
                              </button>
                              <button onClick={() => borrarCierre(ci)} disabled={trabajando}
                                className={`rounded-xl border p-3 text-left disabled:opacity-50 ${dm ? 'border-white/[0.1] bg-[#141414]' : 'border-zinc-200 bg-white'}`}>
                                <span className="flex items-center gap-1.5 text-[14px] font-black text-rose-500"><Trash2 size={15}/> Borrar del todo</span>
                                <span className={`block text-[12px] mt-0.5 ${suave}`}>Desaparece del historial y sus entregas no vuelven (ej. un cierre de prueba).</span>
                              </button>
                            </div>
                            <button onClick={() => setBorrando(null)} disabled={trabajando} className={`w-full mt-2 h-10 rounded-xl text-[13px] font-bold ${botonGris}`}>
                              {trabajando ? <Loader2 size={16} className="animate-spin mx-auto"/> : 'No, dejarlo'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2 mt-3">
                            {ci.texto && <button onClick={() => copiar(ci.texto)} className={`h-9 px-3 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 ${botonGris}`}><Copy size={14}/> Copiar</button>}
                            {puedeCerrar && <button onClick={() => setBorrando(ci.id)} className={`h-9 px-3 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 ${dm ? 'text-rose-400 bg-rose-500/[0.08]' : 'text-rose-600 bg-rose-50'}`}><Trash2 size={14}/> Borrar</button>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {viendo && (
        <div className="fixed inset-0 z-[400] bg-black/90 flex flex-col" onClick={() => setViendo(null)}>
          <div className="flex justify-end p-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
            <button className="p-2 text-white"><X size={26}/></button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4 flex flex-col items-center">
            {viendo.cargando && <Loader2 size={32} className="animate-spin text-white mt-20"/>}
            {viendo.error && <p className="text-rose-300 mt-20">No se pudo cargar: {viendo.error}</p>}
            {!viendo.cargando && !viendo.error && viendo.fotos.length === 0 && <p className="text-zinc-300 mt-20">No se encontró la foto.</p>}
            {viendo.fotos.map((f, i) => <img key={i} src={f} alt="Comprobante" className="max-w-full rounded-xl" onClick={e => e.stopPropagation()} />)}
          </div>
        </div>
      )}
    </div>
  );
}
