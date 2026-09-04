// Configuración de zonas de reparto en moto — editable acá sin tocar la lógica de cálculo del
// recorrido. Cada zona tiene una "temperatura": las CALIENTE son de alta demanda (ahí es donde
// conviene que el repartidor termine el recorrido, porque los pedidos nuevos suelen caer ahí),
// las FRIA se reparten primero.
//
// id: usado como value del <select> y guardado en pedido.direccion.zona — no cambiarlo sin migrar
// los pedidos que ya lo tengan guardado.

export const ZONAS = [
  {
    id: 'A',
    nombre: 'Zona A — Núcleo',
    temperatura: 'caliente',
    barrios: 'Belgrano (C, R y Barrio Chino), Núñez, Colegiales, Coghlan, Las Cañitas, Palermo Chico / Barrio Parque, Saavedra este de Balbín, Villa Ortúzar',
  },
  {
    id: 'B',
    nombre: 'Zona B — Corredor Norte',
    temperatura: 'fria',
    barrios: 'Vicente López, Olivos, La Lucila, Florida este de la vía, Munro este, Martínez',
  },
  {
    id: 'C1',
    nombre: 'Zona C1 — Palermo extendido',
    temperatura: 'caliente',
    barrios: 'Palermo completo (Hollywood, Soho, Botánico, Alto Palermo), Barrio Norte',
  },
  {
    id: 'C2',
    nombre: 'Zona C2 — Centro / Recoleta',
    temperatura: 'caliente',
    barrios: 'Recoleta, Retiro, San Nicolás, Tribunales, Monserrat',
  },
  {
    id: 'D',
    nombre: 'Zona D — Oeste cercano',
    temperatura: 'caliente',
    barrios: 'Villa Urquiza, Parque Chas, Chacarita, Agronomía, Villa Pueyrredón, Villa del Parque, Paternal norte, Devoto este (hasta Beiró)',
  },
  {
    id: 'E',
    nombre: 'Zona E — Centro-oeste',
    temperatura: 'caliente',
    barrios: 'Villa Crespo, Almagro, Caballito, Boedo, Paternal sur, Flores este (hasta Nazca)',
  },
  {
    id: 'F',
    nombre: 'Zona F — Oeste lejano',
    temperatura: 'fria',
    barrios: 'Villa Santa Rita, Floresta, Liniers, Vélez Sarsfield, Villa Real, Versalles, Monte Castro, Villa Luro, Mataderos',
  },
  {
    id: 'G',
    nombre: 'Zona G — Sur',
    temperatura: 'fria',
    barrios: 'San Telmo, Constitución, Barracas, La Boca, Parque Patricios, Nueva Pompeya, Boedo sur',
  },
];

export const ZONAS_POR_ID = Object.fromEntries(ZONAS.map(z => [z.id, z]));

export const getZonaTemperatura = (zonaId) => ZONAS_POR_ID[zonaId]?.temperatura || null;

const ACCENT_MAP = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n', ü: 'u' };
const stripAccents = (s) => s.replace(/[áéíóúñü]/g, ch => ACCENT_MAP[ch] || ch);
const normalizarBarrio = (s) => stripAccents(String(s || '').toLowerCase().trim());

// Mapeo barrio → zona para sugerir la zona sola a partir del barrio que devuelve Google en la
// dirección elegida. Solo entran acá los barrios que caen ENTEROS en una sola zona — los que la
// definición de arriba divide con un límite interno (ej. "Devoto este hasta Beiró", "Paternal
// norte" vs "Paternal sur", "Boedo" vs "Boedo sur", "Saavedra este de Balbín", "Florida este de
// la vía", "Munro este") quedan afuera a propósito: Google no distingue esas mitades, así que
// adivinar ahí metería la pata más de lo que ayuda — para esos, la persona sigue eligiendo a mano.
const BARRIO_A_ZONA = {
  'belgrano': 'A', 'nunez': 'A', 'colegiales': 'A', 'coghlan': 'A',
  'las cañitas': 'A', 'las canitas': 'A', 'palermo chico': 'A', 'barrio parque': 'A', 'villa ortuzar': 'A',
  'vicente lopez': 'B', 'olivos': 'B', 'la lucila': 'B', 'martinez': 'B',
  'palermo': 'C1', 'palermo hollywood': 'C1', 'palermo soho': 'C1', 'palermo botanico': 'C1', 'alto palermo': 'C1', 'barrio norte': 'C1',
  'recoleta': 'C2', 'retiro': 'C2', 'san nicolas': 'C2', 'tribunales': 'C2', 'monserrat': 'C2',
  'villa urquiza': 'D', 'parque chas': 'D', 'chacarita': 'D', 'agronomia': 'D', 'villa pueyrredon': 'D', 'villa del parque': 'D',
  'villa crespo': 'E', 'almagro': 'E', 'caballito': 'E',
  'villa santa rita': 'F', 'floresta': 'F', 'liniers': 'F', 'velez sarsfield': 'F', 'villa real': 'F', 'versalles': 'F', 'monte castro': 'F', 'villa luro': 'F', 'mataderos': 'F',
  'san telmo': 'G', 'constitucion': 'G', 'barracas': 'G', 'la boca': 'G', 'parque patricios': 'G', 'nueva pompeya': 'G',
};

// Sugiere una zona a partir del nombre de barrio/localidad que haya devuelto Google (ya sea de
// addressComponents o de cualquier texto libre) — devuelve null si no hay un match único y
// confiable, para que el desplegable quede vacío y lo complete la persona en esos casos.
export const sugerirZonaPorBarrio = (nombreBarrio) => {
  if (!nombreBarrio) return null;
  return BARRIO_A_ZONA[normalizarBarrio(nombreBarrio)] || null;
};

// Recorre TODOS los address_components que devolvió Google (no solo el que venga tageado como
// "neighborhood"/"sublocality" — para direcciones de Argentina esa etiqueta no siempre es
// consistente) probando cada longText y shortText contra el mapeo de barrios. Devuelve la primera
// zona que matchee, o null si ninguno de los componentes es un barrio conocido.
export const sugerirZonaPorComponentesDireccion = (addressComponents) => {
  if (!Array.isArray(addressComponents)) return null;
  for (const c of addressComponents) {
    const porLong = sugerirZonaPorBarrio(c?.longText);
    if (porLong) return porLong;
    const porShort = sugerirZonaPorBarrio(c?.shortText);
    if (porShort) return porShort;
  }
  return null;
};

// Punto de partida del recorrido (depósito). Coordenadas confirmadas por el dueño desde el mapa
// embebido de Google para esta dirección — reemplazan un punto anterior que estaba ~350m corrido
// (afectaba tanto el orden del recorrido como la plata de motomensajería, ver reparto/motomensajeria.js).
export const DEPOSITO_ORIGEN = {
  texto: 'Av. del Libertador 6299, Belgrano, CABA',
  lat: -34.55359497285959,
  lng: -58.4523699884262,
};

// Sesgo del autocompletado de direcciones: un círculo amplio que cubre CABA + GBA norte, centrado
// más o menos entre Belgrano y Vicente López. No restringe resultados fuera del círculo, solo los
// prioriza (locationBias, no locationRestriction) — restringir de más rompe direcciones válidas de
// zonas límite.
export const AUTOCOMPLETE_BIAS = {
  lat: -34.54,
  lng: -58.48,
  radiusMeters: 15000,
};
