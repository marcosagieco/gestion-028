// Cliente mínimo de Routes API (REST) — SIEMPRE Routes API, nunca Directions API ni Distance
// Matrix. Cada llamada de acá factura, así que quien importa este módulo es responsable de no
// llamarlo más que en los momentos puntuales que definimos (ver recorridoEngine.js): abrir el
// panel de reparto, marcar una entrega, entrar un pedido nuevo al recorrido, o reordenar a mano.
// Nunca en cada render ni por cada tick de GPS. Mismo criterio para getDrivingDistanceKm de acá
// abajo — se llama UNA vez por envío al marcar "Entregado" (ver reparto/motomensajeria.js), nunca
// en cada render del historial.

const ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';

const toWaypoint = (stop) => ({ location: { latLng: { latitude: stop.lat, longitude: stop.lng } } });

// Haversine: distancia en línea recta entre dos puntos lat/lng, en kilómetros. Se usa acá solo
// para ELEGIR el destino fijo (ver optimizeStopOrder) — no para medir plata ni kilómetros reales,
// eso lo hace getDrivingDistanceKm.
function distanciaKmLineaRecta(a, b) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Optimiza el orden de un grupo de paradas saliendo de `origin`, con destino fijo en la parada más
// lejana de `origin` en línea recta (Routes API necesita un destino fijo — ver comentario abajo).
// Devuelve las paradas reordenadas (mismos objetos de entrada, en el orden óptimo).
//
// Si el grupo tiene 0 o 1 parada, no hace falta llamar a la API — se devuelve tal cual.
export async function optimizeStopOrder(origin, stops) {
  if (!stops || stops.length === 0) return [];
  if (stops.length === 1) return stops;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('Falta VITE_GOOGLE_MAPS_API_KEY en el entorno');

  // Routes API con optimizeWaypointOrder reordena los "intermediates", pero el "destination" queda
  // fijo donde lo pongamos — no hay forma de pedirle que optimice TODAS las paradas sin fijar
  // ninguna como destino. Elegimos como destino la parada más lejana de `origin` (línea recta,
  // sin llamar a la API): es determinístico para un mismo conjunto de paradas sin importar en qué
  // orden llegaron (antes se tomaba "la última del array tal como llegó", que dependía del orden de
  // carga y podía dar un recorrido distinto para las mismas paradas — ver notas de la auditoría,
  // hallazgo D4) y de paso tiene sentido de reparto: se termina en el punto más alejado.
  let destination = stops[0];
  let maxDist = -1;
  for (const s of stops) {
    const d = distanciaKmLineaRecta(origin, s);
    if (d > maxDist) { maxDist = d; destination = s; }
  }
  const intermediates = stops.filter(s => s !== destination);

  const body = {
    origin: toWaypoint(origin),
    destination: toWaypoint(destination),
    intermediates: intermediates.map(toWaypoint),
    travelMode: 'TWO_WHEELER',
    optimizeWaypointOrder: true,
  };

  const resp = await fetch(ROUTES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Routes API respondió ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  const route = data.routes?.[0];
  const order = route?.optimizedIntermediateWaypointIndex;

  // Si Google no devolvió el orden optimizado (respuesta rara/vacía), no rompemos el recorrido:
  // se usa el orden tal cual llegó en vez de tirar un error que deje sin recorrido a todo el mundo.
  if (!Array.isArray(order)) return stops;

  const orderedIntermediates = order.map(i => intermediates[i]);
  return [...orderedIntermediates, destination];
}

// Distancia real por calle entre dos puntos — la usa la plata de la motomensajería (ver
// reparto/motomensajeria.js), que necesita los km que realmente se manejan, no la línea recta.
// A propósito en modo DRIVE (auto), no TWO_WHEELER (moto): Google Maps no ofrece un modo "moto" en
// la app común en Argentina, así que el dueño del negocio solo puede chequear a mano en modo auto
// — para que el número de acá coincida con lo que él ve, se pide lo mismo que él puede verificar.
// Pide solo distanceMeters, el field mask más chico posible. Devuelve null (no tira error) si
// Google no devolvió una ruta válida, para que quien llama pueda caer a un estimado.
export async function getDrivingDistanceKm(origin, destino) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('Falta VITE_GOOGLE_MAPS_API_KEY en el entorno');

  const resp = await fetch(ROUTES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.distanceMeters',
    },
    body: JSON.stringify({
      origin: toWaypoint(origin),
      destination: toWaypoint(destino),
      travelMode: 'DRIVE',
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Routes API respondió ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  const meters = data.routes?.[0]?.distanceMeters;
  return typeof meters === 'number' ? meters / 1000 : null;
}
