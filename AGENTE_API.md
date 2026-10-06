# API del agente de WhatsApp — contrato

Cloud Functions que usa el agente de n8n (`functions/agente-api.js`). Todo lo que es plata o
logística se resuelve acá, nunca en el modelo.

- **Base:** `https://us-central1-gestion-028.cloudfunctions.net/`
- **Auth:** header `X-Agent-Key: <AGENT_API_KEY>` (en `functions/.env` y en la credencial
  "028 Agent API" de n8n). Sin la clave: `401`.
- **Errores:** `{ ok: false, error }` con status 4xx. El texto de `error` está escrito para el
  agente: le dice qué le falta pedirle al cliente.
- **Tests:** `node functions/agente-api.test.js` (sin Firestore ni Google reales).

## GET `/agentEstadoOperativo?telefono=`

Todo lo del día, en una sola llamada:

```json
{
  "ok": true,
  "salida": { "dia": "hoy", "fecha": "2026-10-06", "hora": "15:30", "tandaId": "primera" },
  "opcionesMoto": [{ "dia": "hoy", "fecha": "2026-10-06", "hora": "15:30", "tandaId": "primera" }],
  "salidaUber": { "dia": "hoy", "fecha": "2026-10-06", "hora": "17:30" },
  "pedidosEnCola": 8,
  "demora": "hoy estamos con una demora de alrededor de 2 hs en los envíos",
  "pedidoActual": {
    "id": "…",
    "estado": "pendiente",
    "tipoEnvio": "uber",
    "descripcion": "el pedido está registrado y pendiente de armado; todavía no figura como despachado",
    "puedeAfirmarEnCamino": false,
    "puedeAfirmarEntregado": false
  },
  "plantillas": { "STOCK_NICOTINA": "…", "PRECIOS_VAPES": "…", "ALIAS": "…", "FORMAS_DE_ENTREGA": "…" }
}
```

- `salida` es la primera opción de moto; `opcionesMoto` ofrece hasta cuatro opciones con fecha,
  hora y `tandaId`. Hay dos salidas (`primera` y `segunda`), por defecto 15:30 y 18:30, editables
  como `salidasMoto` en `/operativo`. Una tanda a la hora exacta o ya pasada no se ofrece hoy.
  El cliente elige la fecha y tanda; la API exige `salidaSeleccionada` para cargar moto.
  El cupo se cuenta por fecha y tanda, incluyendo pendientes y armados no cancelados.
  `primera` se asigna a `repartidor: "moto1"` y `segunda` a `"moto2"`, los repartos existentes del depósito.
  Una transacción vuelve a validar horario y cupo al guardar. `proximaSalida` queda obsoleto.
- `salidaUber` conserva tandas cada 30 minutos hasta las 20:00, desde 13:30 (miércoles 14:00,
  domingos 17:00), contando la cola pendiente. El cierre a las 20:00 sigue siendo estricto.
  Los días sin despacho (feriados, domingos que no se trabaja) se cargan en `/operativo`
  (`diasSinDespacho`, fechas `AAAA-MM-DD`): ese día no sale nada y lo que se pide sale el próximo
  día con despacho (`"dia": "el lunes"`).
- `demora`: se ajusta automáticamente por cantidad de pedidos pendientes de moto/Uber: desde 5
  pedidos informa aprox. 2 hs, desde 8 informa aprox. 2:30 hs, y con más de 10 informa más de 3 hs.
  Si `/operativo` está en `solo_manana`, esa regla le gana a todo y dice que sale mañana.
- `pedidoActual`: último pedido estructurado de ese teléfono, con una descripción segura del estado.
  El agente usa este campo para seguimiento y nunca infiere que salió. Un pedido `pendiente` todavía
  no salió; una moto `armada` solo puede figurar en camino si el recorrido global está `en_calle`.
  Incluye `fechaSalida`, `horaSalida`, `tandaSalida`, `puedeModificar` y detalle estructurado
  para modificar un pedido del bot. Si no hay un pedido estructurado para ese teléfono, llega `null`.
- `plantillas`: las listas de `/operativo` (`STOCK_NICOTINA`, `PRECIOS_VAPES`, `STOCK_THC`,
  `PRECIOS_THC`, `PERFUMES`, `APPLE_ACCESORIOS`, `PRECIOS_MAYORISTA`, `OFERTAS`, `COMBOS_BATERIAS`), el `ALIAS` activo
  y los textos fijos (`FORMAS_DE_ENTREGA`, `ENVIO_SEGURO`, `WEB`, `DESCUENTO_EFECTIVO`, `GRACIAS`,
  `CONFIANZA`, `COMUNIDAD`, `COMPROBANTES_VALIDOS`). Una lista vacía llega como `""`.
  `COMUNIDAD` se usa cuando piden aviso de reingreso/stock nuevo/ofertas, y también como cierre
  liviano cuando el cliente confirma que llegó todo bien. `COMPROBANTES_VALIDOS` es regla interna:
  incluye las tres cuentas: Lucio Felix Bunge/Galicia para alias1, Marcos Agustin Gieco/Galicia
  para alias2 y Tame Lake S.A./Secpaynet para alias3. Identifica la cuenta activa y compara contra
  los datos enviados al cliente, incluso si el alias cambia luego. No confirma acreditación bancaria.
  La diferencia de importe se tolera hasta $5.000 inclusive en ambos sentidos. Si supera ese
  rango se deriva; un destino explícitamente incorrecto o evidencia de edición se sigue revisando.
- `mayorista`: informa mínimo de 10 unidades, agrupación y valor del dólar cargado en el panel.

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
  "idConversacion": "485",
  "idMensajeOrigen": "18106",
  "cliente": "Uma Bach",
  "items": [{ "producto": "Elfbar Ice King", "variante": "Peach", "cantidad": 2 }],
  "tipoEnvio": "moto",
  "salidaSeleccionada": { "fecha": "2026-10-06", "tandaId": "primera", "hora": "15:30" },
  "horaSolicitada": null,
  "direccion": { "texto": "Cabildo 2000, Belgrano", "referencias": "3B, timbre negro" },
  "medioPago": "transferencia",
  "comprobante": { "numero": "0012345", "monto": 52000, "nombre": "Uma Bach" },
  "comprobanteUrl": "https://…",
  "envioSeguro": false,
  "datosCorreo": { "aSucursal": true, "dni": "…", "localidad": "…", "cp": "…" }
}
```

Respuesta: `{ ok, mensaje, total }` (+ `pedidoId` y `reutilizado` si se cargó). `mensaje` es el resumen que se le
manda al cliente tal cual y el que ve el depósito en el panel. Con `preview: true`, el resumen
aclara que el pedido todavía no está registrado para despacho y la salida aparece como condicional
("si confirmás..."). Solo la llamada definitiva (`preview: false`) con los datos obligatorios
devuelve un pedido registrado y puede informar la salida prevista. El seguimiento real depende del
estado persistido en `pedidoActual`.

La carga definitiva es idempotente. n8n manda `idConversacion` e `idMensajeOrigen`; si reintenta el
mismo mensaje, la API devuelve el pedido existente con `reutilizado: true` y no crea un duplicado.
Como respaldo, una transferencia con el mismo teléfono y número de comprobante también reutiliza el
pedido. Los documentos nuevos guardan esos identificadores, `origen: "bot_n8n"` y `schemaVersion: 3`.

**Precios:** salen de las listas de `/operativo` (vapes, THC, perfumes, Apple), con sus combos
(`2x $49.000` es el combo de 2 entero). Las `OFERTAS` escritas con el mismo formato pisan esos
precios. Si un producto no está, es ambiguo o esa cantidad no se vende, el pedido no se calcula.
El agente nunca manda precios.

**Mayorista:** `mayorista: true` usa exclusivamente `preciosMayoristaTexto`. Se interpretan precios
unitarios en USD (incluidos decimales con coma) y se toma el tramo más alto alcanzado.
`dolarMayorista` es el valor en pesos por USD editable en el panel. Sin ese valor, el preview
devuelve `necesitaTipoCambio: true` y subtotal en USD, pero no un total en pesos ni una carga definitiva.
Por defecto los tramos y el mínimo se aplican por modelo, mezclando sabores. `mayoristaAgrupacion:
"total"` permite sumar modelos; este criterio requiere confirmación del negocio. No se deriva por
superar 100 unidades, solo si piden negociar el precio. No se agrega descuento minorista por efectivo.

**Stock:** vapes y THC se controlan contra `STOCK_NICOTINA` y `STOCK_THC` de `/operativo`. Si el
modelo no figura, el sabor no está o está en `(0)`, o se pide más de lo que dice el `(n)`, el pedido
no se calcula y el error lista los sabores con stock. Perfumes y Apple no tienen lista de stock.
Con la lista de stock vacía no se frena la venta.

**Envío:**

| tipoEnvio | Envío | Pago |
|---|---|---|
| `moto` | lo calcula el backend con la dirección | transferencia antes, efectivo, al recibir (efectivo o transferencia) o mitad y mitad |
| `uber` | la última cotización del depósito para ese teléfono (vale 3 hs) | transferencia; envío seguro opcional ($1.990) |
| `correo` | $19.000 sucursal / $29.000 domicilio, se le paga a Vía Cargo al recibir (no suma al total) | transferencia |

El correo se guarda con `tipoEnvio: "retiro"`: el depósito lo maneja como un retiro (arma el paquete
y lo lleva a Vía Cargo). El mensaje del panel arranca con `📦 VÍA CARGO — SUCURSAL` (o DOMICILIO) y
el pedido trae `datosCorreo`.
Excepción: el **correo mayorista** se guarda con `tipoEnvio: "moto"`, `entregaCliente: "correo"` y
`despachoInterno: "moto_a_via_cargo"`. Se agenda en la primera tanda disponible (si ya pasó, primera
del próximo día hábil). El resumen distingue traslado interno y entrega Vía Cargo al cliente.

**Formas de pago** (`medioPago`): `transferencia` (antes, con comprobante), `efectivo` (al recibir,
con descuento), `al recibir` (efectivo o transferencia cuando llega, sin comprobante ni descuento) y
`mitad y mitad` (mitad por transferencia antes, con comprobante, y mitad en efectivo al recibir, sin
descuento; el resumen muestra los dos montos y el pedido guarda `montoTransferencia`). Uber y correo:
solo `transferencia`.

**Uber programado:** si el cliente pide explícitamente una hora de salida para hoy, se manda
`horaSolicitada: "HH:mm"`. Se acepta entre 13:30 y 20:00, siempre que sea futura, no anterior a la
primera tanda disponible y que el pedido se confirme antes del cierre estricto de las 20:00. La hora
queda visible en el resumen y guardada en el pedido. No se aplica a moto ni correo.

**Efectivo:** descuento sobre el subtotal de productos: $1.500 (hasta $50.000), $2.500 (desde
$50.000), $5.000 (desde $100.000).

**Obligatorio para cargar:** nombre, productos, dirección, medio de pago, comprobante (en
transferencia y mitad y mitad) y, para correo, sucursal/domicilio, DNI, localidad y CP.

**Qué guarda en el pedido**, además de los campos de siempre (`mensaje`, `estado: "pendiente"`,
`tipoEnvio`, `createdAt`): `telefono`, `idConversacion`, `idMensajeOrigen`, `origen`, `schemaVersion`,
`cliente`, `direccion {texto, referencias, lat, lng, zona}`,
`items`, `valorEnvio`, `envioSeguro`, `montoEnvioSeguro`, `montoDescuento`, `total`, `medioPago`, `horaSolicitada`,
`cuentaCobro` (el alias activo al cargarlo, para el CSV por cuenta), `comprobante`,
`comprobanteImagen` (la foto copiada a Storage) y `datosCorreo`. No descuenta stock ni crea la
venta: eso lo sigue haciendo el depósito.
También se guardan `fechaSalida`, `horaSalida`, `tandaSalida`, `mayorista`, `subtotalUSD`,
`dolarMayorista`, `entregaCliente`, `despachoInterno`, `montoPagado` y `comprobantesAdicionales`.

### Modificar el Mismo Pedido

POST `/agentPedido` con `pedidoId`, teléfono y solo los campos a cambiar. `preview: true`
calcula sin escribir; devuelve `saldoPendiente`. La tool definitiva `modificar_pedido` fuerza
`modificar: true` y `preview: false`: exige el ID para no crear otro por accidente.
La API verifica que sea un pedido del bot de ese cliente y que siga `pendiente`, tanto antes
de calcular como en una transacción al escribir. Si está armado/finalizado devuelve `409`,
`derivar: true`, `motivo: "modificar_pedido_armado"`. Si otro cambio concurrente alteró el detalle,
devuelve conflicto y exige revisar de nuevo.

Se conservan ID, fecha de creación, trazabilidad original, cuenta de cobro, comprobante y campos
omitidos. Cambiar solo dirección/referencia no recalcula los precios de productos ya acordados.
Cambiar dirección de Uber exige cotización válida para esa nueva dirección.
Si se agrega un producto a un pedido transferido y falta más de $5.000, no se actualiza hasta
recibir `comprobanteAdicional: {numero, monto}` por el saldo. No se suma el mismo comprobante dos veces.
Los reintentos del mismo `idMensajeOrigen` reutilizan el cambio ya aplicado.

## Cotización de Uber

1. El agente deriva con motivo `cotizar_uber` → n8n llama a POST `/agentCrearCotizacionUber`
   `{ idConversacion, telefonoCliente, nombreCliente, direccion, explicacionCaso }`.
   Si ya existe una cotización reciente para ese teléfono y esa misma dirección (menos de 30 min),
   responde `{ ok: true, yaCotizado: true, montoUber, mensaje }`: usá ese monto y no vuelvas a pedir
   cotización. Si ya hay una pendiente reciente para esa misma dirección, responde
   `{ ok: true, yaPendiente: true, id, mensaje }`: no crees otra ni le digas al cliente que vas a
   cotizar de nuevo. Si pasaron más de 30 min o cambió la dirección, puede crear una nueva.
2. El depósito carga el monto en `/cotizar-uber` (estado `cotizado`).
3. El trigger `onCotizacionUberConfirmada` manda `{ idConversacion, montoUber }` al webhook
   `cotizacion-uber-confirmada` de n8n (con `X-Agent-Key`) y marca la cotización `procesado`.
   n8n le manda el precio al cliente y reactiva el bot.
4. Si el Uber no llega, el depósito toca "No llegamos" (estado `no_llegamos`): el trigger manda
   `{ idConversacion, noLlegamos: true }` al mismo webhook y n8n le avisa al cliente solo eso
   ("hoy por Uber no llegamos") y reactiva el bot.

## GET `/serveComprobante?pedido=<id>`

La foto del comprobante de un pedido, para el panel. Sin clave, igual que `servePdf`.
