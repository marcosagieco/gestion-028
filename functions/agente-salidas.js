"use strict";

const ZONA = "America/Argentina/Buenos_Aires";
const DEFAULTS = [{ id: "primera", hora: "15:30" }, { id: "segunda", hora: "18:30" }];
const horaValida = (h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h) && h <= "20:00";
const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(`${f}T12:00:00-03:00`)) && new Date(`${f}T12:00:00-03:00`).toISOString().slice(0, 10) === f;
const fechaBA = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d);
const corta = (fecha) => fecha.slice(8, 10) + "/" + fecha.slice(5, 7);

function tandasMoto(op) {
  const horarios = DEFAULTS.map((t) => ({ ...t, hora: op.salidasMoto?.[t.id] ?? t.hora }));
  if (horarios.some((t) => !horaValida(t.hora)) || horarios[0].hora >= horarios[1].hora) {
    throw new Error("Las dos salidas de moto deben ser HH:mm, distintas, ordenadas y hasta las 20:00");
  }
  return horarios;
}

function opcionesMoto(op, pedidos, ahora = new Date(), excluirPedido = null) {
  const hoy = fechaBA(ahora);
  const manana = fechaBA(new Date(ahora.getTime() + 86400000));
  const tandas = tandasMoto(op);
  const diasSinDespacho = Array.isArray(op.diasSinDespacho) ? op.diasSinDespacho : [];
  const limite = Number(op.limitePorTanda) > 0 ? Number(op.limitePorTanda) : 10;
  const opciones = [];
  for (let n = 0; n <= 14; n++) {
    const fecha = fechaBA(new Date(ahora.getTime() + n * 86400000));
    if (diasSinDespacho.includes(fecha) || (n === 0 && op.situacion === "solo_manana")) continue;
    for (const tanda of tandas) {
      const instante = Date.parse(`${fecha}T${tanda.hora}:00-03:00`);
      if (instante <= ahora.getTime()) continue;
      const ocupados = pedidos.filter((p) => p.id !== excluirPedido && p.tipoEnvio === "moto" && !["cancelado"].includes(p.estado) && p.fechaSalida === fecha && p.tandaSalida === tanda.id).length;
      if (ocupados >= limite) continue;
      opciones.push({ fecha, hora: tanda.hora, tandaId: tanda.id, dia: fecha === hoy ? "hoy" : fecha === manana ? "mañana" : `el ${corta(fecha)}`, fechaTexto: corta(fecha), cuposDisponibles: limite - ocupados });
    }
  }
  return opciones;
}

function elegirSalida(opciones, seleccion, soloPrimera = false) {
  const posibles = soloPrimera ? opciones.filter((o) => o.tandaId === "primera") : opciones;
  if (!seleccion) return posibles[0] || null;
  if (!fechaValida(seleccion.fecha)) return null;
  return posibles.find((o) => o.fecha === seleccion.fecha && o.tandaId === seleccion.tandaId && (!seleccion.hora || o.hora === seleccion.hora)) || null;
}

module.exports = { opcionesMoto, elegirSalida, tandasMoto, fechaBA, corta };
