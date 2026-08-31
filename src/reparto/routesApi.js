// Cliente mínimo de Routes API (REST) — SIEMPRE Routes API, nunca Directions API ni Distance
// Matrix. Cada llamada de acá factura, así que quien importa este módulo es responsable de no
// llamarlo más que en los momentos puntuales que definimos (ver recorridoEngine.js): abrir el
// panel de reparto, marcar una entrega, entrar un pedido nuevo al recorrido, o reordenar a mano.
// Nunca en cada render ni por cada tick de GPS.

const ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';

const toWaypoint = (stop) => ({ location: { latLng: { latitude: stop.lat, longitude: stop.lng } } });

// Optimiza el orden de un grupo de paradas saliendo de `origin`, con destino fijo en la última
// parada del array recibido (Routes API necesita un destino fijo — ver comentario abajo). Devuelve
// las paradas reordenadas (mismos objetos de entrada, en el orden óptimo).
//
// Si el grupo tiene 0 o 1 parada, no hace falta llamar a la API — se devuelve tal cual.
export async function optimizeStopOrder(origin, stops) {
  if (!stops || stops.length === 0) return [];
  if (stops.length === 1) return stops;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('Falta VITE_GOOGLE_MAPS_API_KEY en el entorno');

  // Routes API con optimizeWaypointOrder reordena los "intermediates", pero el "destination" queda
  // fijo donde lo pongamos — no hay forma de pedirle que optimice TODAS las paradas sin fijar
  // ninguna como destino. Como acá no nos importa cuál termina siendo la última parada del grupo
  // (eso lo decide la distancia, no una parada en particular), se toma la última del array tal
  // como llegó como destino fijo, y el resto como intermediates a optimizar — el resultado sigue
  // siendo un recorrido válido y cercano al óptimo para el grupo completo.
  const destination = stops[stops.length - 1];
  const intermediates = stops.slice(0, -1);

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
