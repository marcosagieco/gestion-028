# API para el Agente de IA — contrato

Endpoints HTTP (Cloud Functions) que consume el agente conversacional de WhatsApp desde n8n.
Todo lo que el agente necesita leer/escribir de `gestion-028` pasa por acá — **no** toca Firestore
directo.

## Convenciones

- **Base:** `https://us-central1-gestion-028.cloudfunctions.net/`
- **Auth:** header `X-Agent-Key: <AGENT_API_KEY>` en todos los endpoints. La clave vive en la
  config de Functions (`functions.config()` / env) y en una credencial de n8n. Mismo criterio que
  `FACTURA_WEB_KEY` / `VERIFY_TOKEN` que ya usan.
- **Errores:** siempre `{ "ok": false, "error": "<motivo>" }` con status 4xx/5xx. Nunca 200 con error.
- Fuzzy match de producto/variante: reusar `normalizarParaComparar` de `index.js`.

---

## 1. `GET /agentStock` — consultar stock

Query params:
| param | req | ejemplo |
|---|---|---|
| `producto` | sí | `elfbar ice king` |
| `variante` | no | `dragon strawnana` |

Lógica: recorre `batches` (ordenado por `createdAt`, salteando los que tienen `finalizedAt`),
matchea `items[]` por `product` (+ `variant` si vino), suma `currentStock`.

- Con `variante` → devuelve esa variante.
- Sin `variante` → devuelve todas las variantes del producto con su stock.

```json
{
  "ok": true,
  "matches": [
    { "product": "Elfbar Ice King", "variant": "Dragon Strawnana", "stock": 8 },
    { "product": "Elfbar Ice King", "variant": "Blue Razz Ice", "stock": 20 }
  ],
  "totalStock": 28
}
```

Sin match → `{ "ok": true, "matches": [], "totalStock": 0 }`.

---

## 2. `GET /agentCliente` — nuevo vs. recurrente

Query: `telefono` (req) — normalizado a `549...` (como hace `numeroRemitente` en `index.js`).

Lógica:
1. Lee `clientes_bot/{telefono}` (colección nueva que mantiene el agente).
2. Fallback: si no existe, cuenta `pedidos` con `telefono == X`.
3. Si no hay nada → nuevo.

```json
{
  "ok": true,
  "telefono": "5491158696086",
  "nuevo": true,
  "cantidadPedidos": 0,
  "ultimoPedido": null,
  "origen": null
}
```

> Nota: clientes que llegan por IG/orgánico y nunca compraron por acá se leen como `nuevo` la
> primera vez — aceptado por el cliente en el onboarding.

---

## 3. `GET /agentCotizarEnvio` — valor de envío en moto

Query: `direccion` (texto libre) **o** `lat` + `lng`.

Lógica (reusar `src/reparto/`):
1. Geocodificar `direccion` (Geocoding API) → `lat/lng` + `address_components`.
2. Zona: `sugerirZonaPorComponentesDireccion(...)` de `zonas.js`.
3. Km real: `getDrivingDistanceKm(DEPOSITO_ORIGEN, {lat,lng})` de `routesApi.js`.
4. Monto: `Math.max(km * 1000, 3000)` (`aplicarTarifa` de `motomensajeria.js`).
5. Cobertura: si no hay zona conocida y el punto cae fuera del área CABA + Corredor Norte →
   `cubiertoMoto: false` (el agente ofrece Uber o correo).

```json
{
  "ok": true,
  "direccion": { "texto": "Sánchez de Bustamante 1623, CABA", "lat": -34.61, "lng": -58.41, "zona": "E" },
  "zonaNombre": "Zona E — Centro-oeste",
  "km": 4.2,
  "monto": 4200,
  "cubiertoMoto": true
}
```

---

## 4. `POST /agentPedido` — crear el pedido

Body:
```json
{
  "telefono": "5491158696086",
  "cliente": "Uma Bach",
  "items": [
    { "producto": "Elfbar Ice King", "variante": "Dragon Strawnana", "cantidad": 1, "precioUnitario": 26000 }
  ],
  "tipoEnvio": "moto",
  "direccion": {
    "texto": "Sánchez de Bustamante 1623",
    "lat": -34.61, "lng": -58.41, "zona": "E",
    "referencias": "3ºB, timbre negro"
  },
  "valorEnvio": 4200,
  "medioPago": "alias1",
  "comprobante": { "numero": "0001234", "monto": 30200, "nombre": "Uma Bach" },
  "notas": ""
}
```

- `tipoEnvio`: `moto` | `uber` | `retiro`.
- `medioPago`: `alias1` (Lucio) | `alias2` (Marcos) | `alias3` (financiera) | `efectivo`.
- `direccion` completa solo para `moto`. `uber` → `texto` + `zona`/barrio + `referencias`.
  `retiro` → sin dirección.
- `comprobante` solo si ya lo mandó el cliente.

Lógica:
1. Crea `pedidos` doc — **mismos campos que hoy** (`mensaje`, `estado: 'pendiente'`, `tipoEnvio`,
   `createdAt`) **+ campos estructurados nuevos**: `telefono`, `cliente`, `direccion` (objeto
   completo, así el depósito no lo recarga a mano), `valorEnvio`, `medioPago`, `comprobante`,
   `origen: 'agente-ia'`. El `mensaje` se arma formateado (productos + total + envío + dirección +
   **teléfono siempre**), igual que la "cotización" que pidió Lucio.
2. `clientes_bot/{telefono}`: incrementa `cantidadPedidos`, setea `ultimoPedido`.
3. `ultimo_pedido_whatsapp/{telefono}`: `{ pedidoId, createdAt }` (para que el "cancelar" por
   WhatsApp que ya existe siga funcionando).
4. Si `medioPago === 'alias3'` → además registra en el Sheet (pestaña financiera): nº comprobante,
   monto, nombre, fecha/hora. (El cliente lo pidió explícito para la financiera.)
5. **NO** descuenta stock ni crea `sales` — eso lo hace el depósito al confirmar, igual que hoy.
   (Si más adelante se quiere, se agrega `registrarVenta: true` que llame a `procesarVenta`.)

```json
{ "ok": true, "pedidoId": "abc123", "estado": "pendiente" }
```

---

## 5. `GET /agentEstadoOperativo` — estado del día

Sin params. Lee `settings/operativo`. **Solo campos estructurados** — nada de texto libre, para
que el bot no se confunda; la frase la arma el prompt según `situacion`.

```json
{
  "ok": true,
  "abierto": true,
  "situacion": "demora",
  "proximaSalida": "16:00",
  "actualizadoEn": "2026-09-10T18:30:00.000Z"
}
```

`situacion` ∈ `sin_demora` | `normal` | `demora` | `demora_fuerte` | `solo_manana`.

> Lo setea el staff desde **`/operativo`** en el dashboard (pantalla `src/OperativoPage.jsx`):
> toggle abierto/cerrado + un botón para la demora del día + próxima salida opcional. 2 toques.

---

## Fuera de la API (lo hace n8n)

- **Derivación a humano:** el agente manda un WhatsApp con el resumen de la conversación a los
  números de escalación (Jero, Bauti, Marcos, Lucio) y se pausa. No necesita endpoint.
- **Notificación de entrega:** cuando el depósito toca "ya llegué / entregado" en el panel de
  moto, hay que avisarle al cliente. Opciones: (a) el panel llama a un webhook de n8n al cambiar
  el estado, o (b) n8n escucha cambios en `pedidos`. A confirmar si entra en esta fase.

## Colecciones nuevas que introduce el agente

- `clientes_bot/{telefono}` — `{ cantidadPedidos, ultimoPedido, primerContacto, origen }`.
- `comprobantes_financiera` — un doc por comprobante de la alias financiera (`alias3`):
  `{ pedidoId, numero, monto, nombre, telefono, createdAt }`.
- `settings/operativo` — estado del día (lo setea el staff desde `/operativo`):
  `{ abierto: bool, situacion: string, proximaSalida: string, actualizadoEn: string }`.

## Implementación y deploy

- Código: `functions/agente-api.js` (archivo nuevo). Se engancha desde `index.js` con **una
  línea** al final: `Object.assign(exports, require("./agente-api"))`. Nada más de `index.js`
  se toca.
- Env vars (agregar al `.env` de `functions/`, junto a los `AFIP_*` y `ADMIN_SECRET` que ya
  están):
  - `AGENT_API_KEY` — secreto compartido con n8n. **Obligatorio.**
  - `GOOGLE_MAPS_KEY` — para geocodificar direcciones en `agentCotizarEnvio`. Opcional: sin
    esta key el endpoint devuelve `needsManualQuote: true` y el agente cotiza el envío a mano
    (avisando al depósito, igual que el flujo de Uber).
- Deploy: `firebase deploy --only functions` desde `gestion-028/`. Solo agrega las 5 funciones
  nuevas; no redeploya ni toca las existentes salvo `webhook`/etc. que comparten `index.js`
  (mismo código, se redeploya idéntico).
- URLs resultantes: `https://us-central1-gestion-028.cloudfunctions.net/agentStock`, etc.
