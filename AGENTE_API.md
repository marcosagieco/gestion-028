# API del agente de WhatsApp — contrato

Cloud Functions que usa el agente de n8n (`functions/agente-api.js`). Todo lo que es plata o
logística se resuelve acá, nunca en el modelo.

- **Base:** `https://us-central1-gestion-028.cloudfunctions.net/`
- **Auth:** header `X-Agent-Key: <AGENT_API_KEY>` (en `functions/.env` y en la credencial
  "028 Agent API" de n8n). Sin la clave: `401`.
- **Errores:** `{ ok: false, error }` con status 4xx. El texto de `error` está escrito para el
  agente: le dice qué le falta pedirle al cliente.
- **Tests:** `node functions/agente-api.test.js` (sin Firestore ni Google reales).

## GET `/agentEstadoOperativo`

Todo lo del día, en una sola llamada:

```json
{
  "ok": true,
  "salida": { "dia": "hoy", "hora": "18:00" },
  "salidaUber": { "dia": "hoy", "hora": "17:30" },
  "demora": "hoy estamos con una demora de alrededor de 2 hs en los envíos",
  "plantillas": { "STOCK_NICOTINA": "…", "PRECIOS_VAPES": "…", "ALIAS": "…", "FORMAS_DE_ENTREGA": "…" }
}
```

- `salida` (moto) y `salidaUber`: en qué tanda sale un pedido tomado ahora. Salen tandas cada 30 min
  hasta las 20:00, desde las 13:30 (miércoles 14:00, domingos 17:00); hasta las 20:15 todavía entra
  en la de las 20:00. Cada tanda lleva hasta el límite de `/operativo`, contando los pedidos de moto
  y Uber "para armar" (los armados ya salieron y no cuentan): con la de las 17:00 llena, sale 17:30. Si hoy no entra, o el
  panel dice que hoy no sale nada más, sale mañana. La misma hora va en el resumen del pedido.
  Si el depósito carga una "próxima salida" de moto en `/operativo` ("18", "18:00", "18 hs"), esa hora
  le gana a todo para la moto, cupo incluido (si ya pasó, es la de mañana), mientras esté cargada.
  El Uber no la usa: sale siempre por tandas. Vacía = tandas.
- `plantillas`: las 8 listas de `/operativo` (`STOCK_NICOTINA`, `PRECIOS_VAPES`, `STOCK_THC`,
  `PRECIOS_THC`, `PERFUMES`, `APPLE_ACCESORIOS`, `PRECIOS_MAYORISTA`, `OFERTAS`), el `ALIAS` activo
  y los textos fijos (`FORMAS_DE_ENTREGA`, `ENVIO_SEGURO`, `WEB`, `DESCUENTO_EFECTIVO`, `GRACIAS`,
  `CONFIANZA`). Una lista vacía llega como `""`.

## GET `/agentCotizarEnvio?direccion=`

```json
{ "ok": true, "encontrada": true, "cubiertoMoto": true, "monto": 5467, "km": 5.5, "zona": "C1", "admiteEfectivo": true }
```

- Cobertura de moto: CABA entera + Corredor Norte (zona B: Vicente López, Olivos, La Lucila,
  Florida, Munro, Martínez). Fuera de eso `cubiertoMoto: false` y `monto: null`.
- Precio: $1.000 por km en línea recta desde el depósito, mínimo $3.000.
- `admiteEfectivo`: en toda la zona de moto (CABA y Corredor Norte).

## POST `/agentPedido`

Calcula el resumen (`preview: true`, no guarda nada) o carga el pedido en `pedidos`.

```json
{
  "preview": false,
  "telefono": "+5491158696086",
  "cliente": "Uma Bach",
  "items": [{ "producto": "Elfbar Ice King", "variante": "Peach", "cantidad": 2 }],
  "tipoEnvio": "moto",
  "direccion": { "texto": "Cabildo 2000, Belgrano", "referencias": "3B, timbre negro" },
  "medioPago": "transferencia",
  "comprobante": { "numero": "0012345", "monto": 52000, "nombre": "Uma Bach" },
  "comprobanteUrl": "https://…",
  "envioSeguro": false,
  "datosCorreo": { "aSucursal": true, "dni": "…", "localidad": "…", "cp": "…" }
}
```

Respuesta: `{ ok, mensaje, total }` (+ `pedidoId` si se cargó). `mensaje` es el resumen que se le
manda al cliente tal cual y el que ve el depósito en el panel.

**Precios:** salen de las listas de `/operativo` (vapes, THC, perfumes, Apple), con sus combos
(`2x $49.000` es el combo de 2 entero). Las `OFERTAS` escritas con el mismo formato pisan esos
precios. Si un producto no está, es ambiguo o esa cantidad no se vende, el pedido no se calcula.
El agente nunca manda precios.

**Envío:**

| tipoEnvio | Envío | Pago |
|---|---|---|
| `moto` | lo calcula el backend con la dirección | transferencia antes, efectivo, al recibir (efectivo o transferencia) o mitad y mitad |
| `uber` | la última cotización del depósito para ese teléfono (vale 3 hs) | transferencia; envío seguro opcional ($1.990) |
| `correo` | $19.000 sucursal / $29.000 domicilio, se le paga a Vía Cargo al recibir (no suma al total) | transferencia |

El correo se guarda con `tipoEnvio: "retiro"`: el depósito lo maneja como un retiro (arma el paquete
y lo lleva a Vía Cargo). El mensaje del panel arranca con `📦 VÍA CARGO — SUCURSAL` (o DOMICILIO) y
el pedido trae `datosCorreo`.

**Formas de pago** (`medioPago`): `transferencia` (antes, con comprobante), `efectivo` (al recibir,
con descuento), `al recibir` (efectivo o transferencia cuando llega, sin comprobante ni descuento) y
`mitad y mitad` (mitad por transferencia antes, con comprobante, y mitad en efectivo al recibir, sin
descuento; el resumen muestra los dos montos y el pedido guarda `montoTransferencia`). Uber y correo:
solo `transferencia`.

**Efectivo:** descuento sobre el subtotal de productos: $1.500 (hasta $50.000), $2.500 (desde
$50.000), $5.000 (desde $100.000).

**Obligatorio para cargar:** nombre, productos, dirección, medio de pago, comprobante (en
transferencia y mitad y mitad) y, para correo, sucursal/domicilio, DNI, localidad y CP.

**Qué guarda en el pedido**, además de los campos de siempre (`mensaje`, `estado: "pendiente"`,
`tipoEnvio`, `createdAt`): `telefono`, `cliente`, `direccion {texto, referencias, lat, lng, zona}`,
`items`, `valorEnvio`, `envioSeguro`, `montoEnvioSeguro`, `montoDescuento`, `total`, `medioPago`,
`cuentaCobro` (el alias activo al cargarlo, para el CSV por cuenta), `comprobante`,
`comprobanteImagen` (la foto copiada a Storage) y `datosCorreo`. No descuenta stock ni crea la
venta: eso lo sigue haciendo el depósito.

## Cotización de Uber

1. El agente deriva con motivo `cotizar_uber` → n8n llama a POST `/agentCrearCotizacionUber`
   `{ idConversacion, telefonoCliente, nombreCliente, direccion, explicacionCaso }`.
2. El depósito carga el monto en `/cotizar-uber` (estado `cotizado`).
3. El trigger `onCotizacionUberConfirmada` manda `{ idConversacion, montoUber }` al webhook
   `cotizacion-uber-confirmada` de n8n (con `X-Agent-Key`) y marca la cotización `procesado`.
   n8n le manda el precio al cliente y reactiva el bot.

## GET `/serveComprobante?pedido=<id>`

La foto del comprobante de un pedido, para el panel. Sin clave, igual que `servePdf`.
