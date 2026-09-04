// Tarifa de la motomensajería tercerizada que reparte en moto: cobra $1000 por kilómetro REAL
// manejado (por calle, no en línea recta) desde el depósito hasta la dirección de entrega, con un
// mínimo de $3000 por envío. Se usa para armar el historial de "cuánto se le debe" en RepartoMoto
// — no tiene nada que ver con el precio de la venta al cliente.
//
// La medición real (medirCostoMotomensajeriaReal) se hace UNA sola vez, al marcar la entrega (ver
// handleEntregado en RepartoMoto.jsx), y se guarda en pedido.motomensajeria — así el historial
// nunca dispara una llamada a Google por cada render. Para pedidos viejos que se entregaron antes
// de que existiera esto (o si esa llamada falló en su momento), costoMotomensajeriaDe cae a un
// estimado gratis en línea recta, marcado con exacto:false para que la pantalla lo aclare.
import { DEPOSITO_ORIGEN } from './zonas';
import { getDrivingDistanceKm } from './routesApi';

const TARIFA_POR_KM = 1000;
const MINIMO_POR_ENVIO = 3000;

const aplicarTarifa = (km) => Math.max(km * TARIFA_POR_KM, MINIMO_POR_ENVIO);

// Haversine: distancia en línea recta entre dos puntos lat/lng, en kilómetros. Sistemáticamente
// más corta que la ruta real por calle (comprobado: Av. Triunvirato 4099 da 3.4km en línea recta
// contra 5.3km reales de Google Maps) — por eso es solo el respaldo, no el cálculo principal.
function distanciaKmLineaRecta(a, b) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Estimado gratis en línea recta — respaldo para cuando todavía no hay medición real guardada.
export function costoMotomensajeriaEstimado(direccion) {
  if (typeof direccion?.lat !== 'number' || typeof direccion?.lng !== 'number') return null;
  const km = distanciaKmLineaRecta(DEPOSITO_ORIGEN, direccion);
  return { km, monto: aplicarTarifa(km), exacto: false };
}

// Medición real por calle (Routes API, modo auto — ver comentario en getDrivingDistanceKm sobre
// por qué no es modo moto). Async porque llama a Google — se usa una sola vez por envío, nunca
// para pintar la pantalla.
export async function medirCostoMotomensajeriaReal(direccion) {
  if (typeof direccion?.lat !== 'number' || typeof direccion?.lng !== 'number') return null;
  const km = await getDrivingDistanceKm(DEPOSITO_ORIGEN, direccion);
  if (km === null) return null;
  return { km, monto: aplicarTarifa(km), exacto: true };
}

// Punto de entrada del historial: usa la medición real ya guardada en el pedido si existe: si no,
// cae al estimado en línea recta.
export function costoMotomensajeriaDe(pedido) {
  if (pedido?.motomensajeria) return pedido.motomensajeria;
  return costoMotomensajeriaEstimado(pedido?.direccion);
}
