// Cálculo del recorrido de reparto en moto. Toda la lógica de orden vive acá, separada de las
// pantallas — así ninguna pantalla llama a Routes API por su cuenta ni duplica la regla de negocio.
//
// Regla central: las paradas de zona CALIENTE van al final del recorrido, porque ahí es donde caen
// los pedidos nuevos y conviene que el repartidor termine posicionado ahí. No es la ruta más corta.
import { getZonaTemperatura, DEPOSITO_ORIGEN } from './zonas';
import { optimizeStopOrder } from './routesApi';

// Arma el recorrido completo de una lista de pedidos (ya se sabe que todos son moto/armado/con
// dirección) SIN todavía aplicar la regla de "parada congelada" — eso lo hace computeRecorrido.
// 1) separa fría/caliente por la zona de cada pedido
// 2) optimiza el grupo frío saliendo de `origin`
// 3) optimiza el grupo caliente saliendo de la última parada fría (o de `origin` si no hay frías)
// 4) concatena: frías optimizadas + calientes optimizadas
async function computeAutoOrder(pedidos, origin) {
  if (pedidos.length === 0) return [];

  const frias = [];
  const calientes = [];
  for (const p of pedidos) {
    const temp = getZonaTemperatura(p.direccion?.zona);
    // Si por algún motivo un pedido llegó sin zona reconocida, se lo trata como frío (no lo
    // manda al final "por las dudas" a competir con las paradas calientes reales).
    (temp === 'caliente' ? calientes : frias).push(p);
  }

  const friasOrdenadas = await optimizeStopOrder(origin, frias);

  const origenCalientes = friasOrdenadas.length > 0
    ? { lat: friasOrdenadas[friasOrdenadas.length - 1].direccion.lat, lng: friasOrdenadas[friasOrdenadas.length - 1].direccion.lng }
    : origin;
  const calientesOrdenadas = await optimizeStopOrder(origenCalientes, calientes);

  return [...friasOrdenadas, ...calientesOrdenadas];
}

// `optimizeStopOrder` necesita { lat, lng } planos por parada — los pedidos tienen esos datos
// adentro de direccion.{lat,lng}. Este helper les agrega lat/lng "a nivel raíz" temporalmente para
// no tocar optimizeStopOrder/routesApi con conocimiento de la forma de un pedido.
const withLatLng = (pedidos) => pedidos.map(p => ({ ...p, lat: p.direccion.lat, lng: p.direccion.lng }));

// Punto de entrada que usan las pantallas. Aplica la regla de parada congelada y la de orden
// manual antes de decidir si hace falta llamar a Routes API:
//
// - Si hay pedidos con ordenManual=true en el grupo, el recorrido está en "modo manual": se
//   respeta el orden ya guardado (ordenRecorrido) de esos, y los que sean nuevos (sin ordenManual)
//   se agregan al final, sin llamar a Routes API — el orden manual no se vuelve a calcular solo.
// - Si no, se recalcula con computeAutoOrder, saliendo de `origin` si se pasó explícitamente
//   (ej. la ubicación donde se acaba de entregar), o si no de la parada congelada (repartidor ya
//   en la calle) o del depósito (todavía no salió, o no hay parada congelada).
//
// Devuelve la lista final de pedidos en orden (mismos objetos recibidos, reordenados), con
// paradaCongeladaId siempre en la posición 1 si existe.
export async function computeRecorrido({ pedidos, paradaCongeladaId, origin: origenExplicito }) {
  if (!pedidos || pedidos.length === 0) return [];

  const congelada = paradaCongeladaId ? pedidos.find(p => p.id === paradaCongeladaId) : null;
  const resto = pedidos.filter(p => p.id !== paradaCongeladaId);

  if (resto.length === 0) return congelada ? [congelada] : [];

  const hayOrdenManual = resto.some(p => p.ordenManual === true);

  let restoOrdenado;
  if (hayOrdenManual) {
    const conOrden = resto.filter(p => p.ordenManual === true)
      .sort((a, b) => (a.ordenRecorrido ?? 0) - (b.ordenRecorrido ?? 0));
    const nuevos = resto.filter(p => p.ordenManual !== true);
    restoOrdenado = [...conOrden, ...nuevos];
  } else {
    const origin = origenExplicito
      || (congelada ? { lat: congelada.direccion.lat, lng: congelada.direccion.lng } : null)
      || { lat: DEPOSITO_ORIGEN.lat, lng: DEPOSITO_ORIGEN.lng };
    restoOrdenado = await computeAutoOrder(withLatLng(resto), origin);
  }

  return congelada ? [congelada, ...restoOrdenado] : restoOrdenado;
}

// Arma el objeto { [pedidoId]: numeroDeOrden } a partir de la lista ya ordenada, listo para
// persistir en Firestore (ver handlers de guardado en las pantallas de reparto).
export function ordenAPersistir(pedidosOrdenados) {
  const out = {};
  pedidosOrdenados.forEach((p, i) => { out[p.id] = i + 1; });
  return out;
}
