// Envíos: dónde queda una dirección, si llega la moto y cuánto sale. También el correo y el envío seguro.
"use strict";

const axios = require("axios");
const { GOOGLE_MAPS_KEY } = require("./firebase");
const { normalizar } = require("./texto");

const DEPOSITO = { lat: -34.55359497285959, lng: -58.4523699884262 }; // Libertador 6299 (src/reparto/zonas.js)
const TARIFA_POR_KM = 1000;
const MINIMO_ENVIO = 3000;
const PRECIO_ENVIO_SEGURO = 1990; // solo flash (Uber)
const CORREO = { sucursal: 19000, domicilio: 29000 }; // lo paga el cliente a Vía Cargo al recibir

// Barrio/localidad → zona del mapa de reparto (mismo mapeo que src/reparto/zonas.js). La zona B es
// el Corredor Norte: la única parte de la cobertura que no es CABA.
const BARRIO_A_ZONA = {
  belgrano: "A", nunez: "A", colegiales: "A", coghlan: "A", "las canitas": "A",
  "palermo chico": "A", "barrio parque": "A", "villa ortuzar": "A",
  "vicente lopez": "B", olivos: "B", "la lucila": "B", florida: "B", munro: "B", martinez: "B",
  palermo: "C1", "palermo hollywood": "C1", "palermo soho": "C1", "palermo botanico": "C1",
  "alto palermo": "C1", "barrio norte": "C1",
  recoleta: "C2", retiro: "C2", "san nicolas": "C2", tribunales: "C2", monserrat: "C2",
  "villa urquiza": "D", "parque chas": "D", chacarita: "D", agronomia: "D",
  "villa pueyrredon": "D", "villa del parque": "D",
  "villa crespo": "E", almagro: "E", caballito: "E",
  "villa santa rita": "F", floresta: "F", liniers: "F", "velez sarsfield": "F", "villa real": "F",
  versalles: "F", "monte castro": "F", "villa luro": "F", mataderos: "F",
  "san telmo": "G", constitucion: "G", barracas: "G", "la boca": "G",
  "parque patricios": "G", "nueva pompeya": "G",
};
// Solo estos componentes de Google nombran un barrio o localidad (una calle "Florida" en San
// Nicolás no es la localidad de Florida).
const TIPOS_DE_BARRIO = ["neighborhood", "sublocality", "sublocality_level_1", "locality", "administrative_area_level_2"];
const NOMBRES_CABA = new Set(["ciudad autonoma de buenos aires", "caba", "capital federal"]);

function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Kilómetros REALES por calle entre el depósito y un punto, con la misma vara con la que se le paga
// al motomensajero en /reparto (Routes API, moto, con tránsito — ver src/reparto/routesApi.js). La
// calle es un 39% más larga que la línea recta (medido sobre 131 entregas reales): si se cobrara en
// línea recta, cada envío en moto perdería plata. Si Google no contesta, se usa la línea recta por
// ese mismo factor: menos exacto, pero no deja el cobro corto.
const FACTOR_CALLE = 1.4;

async function kmPorCalle(destino) {
  try {
    const { data } = await axios.post(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        origin: { location: { latLng: { latitude: DEPOSITO.lat, longitude: DEPOSITO.lng } } },
        destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lng } } },
        travelMode: "TWO_WHEELER",
        routingPreference: "TRAFFIC_AWARE",
      },
      { headers: { "X-Goog-Api-Key": GOOGLE_MAPS_KEY, "X-Goog-FieldMask": "routes.distanceMeters" }, timeout: 8000 }
    );
    const metros = data.routes && data.routes[0] && data.routes[0].distanceMeters;
    return typeof metros === "number" ? metros / 1000 : null;
  } catch (e) {
    console.error("[bot] Routes API no respondió, se usa el estimado:", e.message);
    return null;
  }
}

// Ubica la dirección y resuelve todo lo que depende de ella. La moto cubre CABA entera y el
// Corredor Norte (zona B); en toda esa zona se puede pagar al recibir. null si Google no la ubica.
async function ubicar(direccion) {
  if (!String(direccion || "").trim()) return null;
  const { data } = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
    params: { address: direccion, key: GOOGLE_MAPS_KEY, region: "ar", components: "country:AR" },
    timeout: 8000,
  });
  const r = data.results && data.results[0];
  if (!r) return null;
  const componentes = r.address_components || [];
  const barrios = componentes
    .filter((c) => c.types.some((t) => TIPOS_DE_BARRIO.includes(t)))
    .flatMap((c) => [normalizar(c.long_name), normalizar(c.short_name)]);
  const zona = barrios.map((b) => BARRIO_A_ZONA[b]).find(Boolean) || null;
  const esCABA = componentes.some((c) => NOMBRES_CABA.has(normalizar(c.long_name)) || NOMBRES_CABA.has(normalizar(c.short_name)));
  const { lat, lng } = r.geometry.location;
  const kmCalle = await kmPorCalle({ lat, lng });
  const km = Math.round((kmCalle !== null ? kmCalle : haversineKm(DEPOSITO, { lat, lng }) * FACTOR_CALLE) * 10) / 10;
  return {
    lat, lng, zona, km, esCABA, kmExacto: kmCalle !== null,
    cubiertoMoto: esCABA || zona === "B",
    monto: Math.max(Math.round(km * TARIFA_POR_KM), MINIMO_ENVIO),
  };
}

// El agente a veces manda la dirección como texto y a veces partida en campos (calle, altura,
// barrio, piso…): se arma siempre entera, para cotizar bien y para que el depósito la vea completa.
function armarDireccion(d) {
  if (typeof d === "string") return { texto: d.trim(), referencias: null };
  const dir = d || {};
  let texto = String(dir.texto || dir.calle || "").trim();
  if (dir.altura && !texto.includes(String(dir.altura))) texto += ` ${dir.altura}`;
  const piso = dir.piso && `piso ${dir.piso}`;
  const depto = dir.depto && dir.depto !== dir.piso && `depto ${dir.depto}`;
  for (const parte of [dir.barrio, dir.localidad, piso, depto]) {
    if (parte && !texto.toLowerCase().includes(String(parte).toLowerCase())) texto += `, ${parte}`;
  }
  return { texto: texto.trim(), referencias: dir.referencias || null };
}

// El agente escribe la misma dirección distinta cada vez ("Av. del Libertador 5930, Belgrano, CABA,
// esquina Juramento" / "Av. del Libertador 5930, entre Juramento y Echeverría"): se compara solo la
// calle y la altura, y la localidad si las dos la dicen. Sin dirección no hay con qué comparar.
function nucleoDireccion(direccion) {
  const calle = normalizar(String(direccion || "").split(/[,(]|\bentre\b|\besquina\b/i)[0]).replace(/\b(av|avda|avenida|calle)\b/g, " ").replace(/\s+/g, " ").trim();
  const numero = [...calle.matchAll(/\b\d{1,5}\b/g)].find((m) => !/^ de\b/.test(calle.slice(m.index + m[0].length)));
  return numero ? calle.slice(0, numero.index).trim() + "|" + numero[0] : calle;
}
const LOCALIDADES_FUERA_DE_CABA = ["vicente lopez", "olivos", "la lucila", "florida", "munro", "martinez", "san isidro", "san fernando",
  "tigre", "san martin", "avellaneda", "lanus", "quilmes", "moron"];
function localidadDe(direccion) {
  const resto = normalizar(String(direccion).split(",").slice(1).join(" "));
  const fuera = LOCALIDADES_FUERA_DE_CABA.find((l) => new RegExp("\\b" + l + "\\b").test(resto));
  if (fuera) return fuera;
  if (/\bcaba\b|capital federal|ciudad autonoma|belgrano|palermo|recoleta|san telmo|caballito|villa urquiza|nunez|colegiales/.test(resto)) return "caba";
  return null;
}
function mismaDireccion(a, b) {
  if (!String(a || "").trim() || !String(b || "").trim()) return true;
  const [la, lb] = [localidadDe(a), localidadDe(b)];
  return nucleoDireccion(a) === nucleoDireccion(b) && (!la || !lb || la === lb);
}

module.exports = { PRECIO_ENVIO_SEGURO, CORREO, ubicar, armarDireccion, mismaDireccion };
