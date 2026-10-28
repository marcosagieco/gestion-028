# Backend del bot de WhatsApp — contrato

Cloud Functions que usa el bot de n8n. El código está en `functions/bot/`, un archivo por tema. Todo
lo que es plata o logística se resuelve acá y nunca en el modelo: precios, combos, envío, descuentos,
total, salida, cupo y validación del pago. El backend no lee la conversación: recibe datos.

- **Base:** `https://us-central1-gestion-028.cloudfunctions.net/`
- **Auth:** header `X-Agent-Key: <AGENT_API_KEY>` (en `functions/.env` y en la credencial "028 Agent API"
  de n8n). Sin la clave: `401`.
- **Método:** todos aceptan POST con JSON. Las consultas también aceptan los datos en la query (GET).
- **Errores:** `{ ok: false, error, ... }`. El texto de `error` está escrito para el agente: le dice qué
  pedirle al cliente. `400` = falta o no sirve un dato; `409` = conflicto (cotización vencida, tanda
  llena, pedido que cambió). Si viene `derivar: true`, el caso lo tiene que ver el equipo.
- **Tests:** `node functions/bot/test/api.test.js` y `node functions/bot/test/reglas.test.js`, con
  dobles de Firestore, Storage, Google y n8n (`functions/bot/test/dobles.js`).

## Archivos

| Archivo | Qué tiene |
|---|---|
| `bot/index.js` | Qué endpoints se publican |
| `bot/estado.js` | `agentEstadoOperativo` y las plantillas fijas |
| `bot/consultas.js` | `agentBuscarCatalogo`, `agentCotizarProductos`, `agentCotizarEnvio` |
| `bot/pedidos.js` | `agentPedido`: resumen, carga y cambio de pedidos |
| `bot/comprobantes.js` | `agentGuardarComprobante`, `serveComprobante` y la tolerancia del pago |
| `bot/uber.js` | `agentCrearCotizacionUber` y `agentAvisosCotizacionUber` |
| `bot/catalogo.js` | Lectura de las listas del panel, búsqueda, stock y fichas THC |
| `bot/precios.js` | Combos, lista mayorista, descuento por efectivo y formas de pago |
| `bot/envios.js` | Ubicación, zonas, costo de la moto, correo y envío seguro |
| `bot/salidas.js` | Salidas de moto con cupo, tandas del Uber, demora y aviso de cierre |
| `bot/seguimiento.js` | Qué pedido del cliente está en curso y si se puede cambiar |
| `bot/texto.js` | Normalizar y comparar texto, sabores en castellano, teléfonos, importes |

## `agentEstadoOperativo` — `{ telefono }`

Lo del día, en una sola llamada, antes de cada respuesta del agente.

```json
{
  "ok": true,
  "opcionesMoto": [{ "fecha": "2026-10-27", "hora": "15:30", "tandaId": "primera", "dia": "hoy", "fechaTexto": "27/10", "cuposDisponibles": 6 }],
  "salidaUber": { "dia": "hoy", "fecha": "2026-10-27", "hora": "13:30" },
  "atencionEnvios": { "cerradoHoy": false, "cercaDelCierre": false, "proximaMoto": {}, "proximoUber": {}, "aviso": null },
  "demora": "sale con la demora habitual, más o menos 1:30 hs desde que sale la moto",
  "mayorista": { "minimoUnidades": 10, "agrupacion": "por_modelo", "dolarEnPesos": 1585, "derivarSoloNegociacion": true },
  "pedidoActual": { "id": "…", "estado": "pendiente", "tipoEnvio": "moto", "descripcion": "…", "puedeAfirmarEnCamino": false, "puedeModificar": true, "cambio": {}, "detalle": {} },
  "cotizacionUber": { "id": "…", "estado": "cotizado", "montoUber": 7500, "venceEn": "…" },
  "plantillas": { "FORMAS_DE_ENTREGA": "…", "ALIAS": "…", "PRECIOS_VAPES": "…", "STOCK_NICOTINA": "…" }
}
```

- `opcionesMoto`: hasta cuatro salidas que no pasaron y tienen cupo. Son dos por día (`primera` y
  `segunda`, 15:30 y 18:30 por defecto, editables en `/operativo` como `salidasMoto`).
- `salidaUber`: la tanda de media hora en la que entra un pedido nuevo según la cola.
- `atencionEnvios.aviso`: el texto para el cliente si hoy ya no hay salidas o falta menos de una hora.
- `pedidoActual`: el pedido **en curso** del teléfono, o `null`. Un pedido viejo que quedó pendiente
  no cuenta: en curso es el que sale hoy o más adelante, o el que se movió en el último día (cuatro
  para el correo). `puedeAfirmarEnCamino` solo es `true` si el reparto de ese pedido está en la calle hoy.
- `cotizacionUber`: la cotización de la compra en curso, con `estado` `cotizado`, `pendiente`,
  `vencido` (`necesitaRecotizacion: true`) o `sin_cobertura`. `null` si no hay.
- `plantillas`: las fijas (`FORMAS_DE_ENTREGA`, `ENVIO_SEGURO`, `DESCUENTO_EFECTIVO`, `COMUNIDAD`,
  `COMPROBANTES_VALIDOS`, `GRACIAS`, `CONFIANZA`), `ALIAS` con los datos de la cuenta activa, las listas
  del panel y las de stock sin precios (`STOCK_PERFUMES`, `STOCK_APPLE_ACCESORIOS`).

## `agentBuscarCatalogo` — `{ consulta, sinPrecios }`

Lo que hay de lo que pidió el cliente, con el mismo buscador que después cobra.

- Devuelve hasta 8 `resultados`: `{ lista, nombre, detalle, precios, oferta, saboresConStock, saboresQueCoinciden, bloqueStock, fichaProducto, autenticidadDeclarada }`.
- Los sabores se buscan también en castellano: «menta» encuentra Mint y Menthol, «frutilla»
  Strawberry, «sandía» Watermelon (grupos en `bot/texto.js`). Si lo buscado es un sabor,
  `saboresQueCoinciden` dice cuáles de cada modelo son.
- Con `sinPrecios: true` no manda precios ni ofertas.
- Sin resultados: `indice` con los nombres de cada lista y una `nota` para el agente.

## `agentCotizarProductos` — `{ items: [{ producto, variante, cantidad }], medioPago, mayorista }`

Precio de los productos con los combos. Para cotizar alcanza el modelo; el sabor se exige al cargar.
Responde `{ items, subtotal, montoDescuento, totalProductos, mensaje }`. Si un sabor puede ser más de
uno («menta» en un modelo con Cool Mint y Winter Mint), el error pide preguntarle al cliente.

## `agentCotizarEnvio` — `{ direccion }`

`{ encontrada, cubiertoMoto, monto, km, zona, admiteEfectivo }`. La moto cubre CABA y el Corredor Norte
(zona B) y se cobra por kilómetro real por calle ($1.000/km, mínimo $3.000).

## `agentPedido`

| Pedido | Qué hace |
|---|---|
| `{ preview: true, ...compra }` | Calcula el resumen. No guarda nada |
| `{ ...compra, desdeCompra? }` | Carga el pedido en el panel |
| `{ pedidoId, ...cambios, preview }` | Calcula (`preview`) o aplica un cambio a un pedido pendiente |

`compra = { telefono, idConversacion, idMensajeOrigen, cliente, items, tipoEnvio (moto | uber | correo), direccion, salidaSeleccionada, horaSolicitada, medioPago, envioSeguro, datosCorreo, mayorista }`

- **Resumen:** `{ preview: true, mensaje, total, salida, opcionesMoto, saldoPendiente, requiereTransferencia }`.
  `mensaje` es el detalle para mandarle al cliente tal cual.
- **Carga:** `{ pedidoId, mensaje, total, salida, tipoEnvio }`. El id sale de `idConversacion` +
  `idMensajeOrigen`: si n8n reintenta, devuelve el mismo pedido con `reutilizado: true`.
- **Moto:** exige `salidaSeleccionada` (una de `opcionesMoto`). El cupo se controla de nuevo al guardar.
- **Uber:** usa el precio vigente que cargó el depósito. Sin precio: `400` con `necesitaCotizacion`.
  Vencido (más de 45 minutos desde que se le informó): `409` con `necesitaRecotizacion`. Si ya pagó,
  se carga con el último precio que se le pasó. `horaSolicitada` programa el Uber a esa hora si se puede.
- **Pago por transferencia o mitad y mitad:** el backend toma los comprobantes de la compra: los que
  guardó `agentGuardarComprobante` en esta conversación y teléfono, sin usar en ningún pedido, llegados
  después del pedido que se cambia o, si es nuevo, después del último pedido, de `desdeCompra` (cuando
  empezó la compra en el bot) y de las últimas 24 horas. El modelo no pasa links (los copiaba mal). El
  número y el importe salen del comprobante guardado. Se suman todos; el primero es el principal y los
  otros, adicionales. No cuentan los que van a otra cuenta, no se leen o ya pagaron otro pedido: si
  ninguno sirve, `400` con `requiereComprobante` y qué decirle al cliente; si sirve alguno, la `nota` lo
  avisa. Tolerancia: $5.000. Si falta más, `400` con `requierePago` y `faltante`; si sobra, se carga
  con `pagoDeMas`. Un mismo pago no paga dos pedidos.
- **Cambios:** solo de un pedido del bot, de ese cliente, en curso y pendiente. Uno armado deriva
  (`modificar_pedido_armado`), salvo que ya pasó la hora de salida (`bloqueadoSalida`). Uno de una
  compra anterior responde `continuarCompra` (`pedido_anterior`). Si el cambio sube el total de un
  pedido pagado, pide un comprobante adicional (`requierePago`).

## `agentGuardarComprobante` — `{ url, lectura, telefono, cliente, idConversacion, idMensaje }`

Lo llama el bot con cada imagen o PDF que manda un cliente. `lectura` es lo que leyó el modelo del
archivo, como objeto o JSON:
`{ esComprobante, edicionDetectada, monto, numeroOperacion, titular, destinatario, cbuCvu, alias, cuit }`.

- Guarda el comprobante en `comprobantes` (se cargue o no el pedido; el panel lo muestra como suelto).
- Responde `{ guardado: true, id, monto, numero, cuentaDelNegocio }`, o `guardado: false` con `motivo`:
  `no_es_comprobante` o `lectura_incompleta`. Que parezca editado no frena: queda `posibleEdicion`.
- La cuenta se reconoce por cualquiera de sus datos (titular, alias, CUIT o CBU/CVU).

## `serveComprobante` — `?pedido=` o `?comprobante=` (sin clave)

La foto del comprobante para el panel.

## `agentCrearCotizacionUber` — `{ idConversacion, telefonoCliente, nombreCliente, direccion, explicacion, pedido }`

Le pide al depósito el precio del Flash. Si ya hay un precio vigente (`yaCotizado`), una pendiente
(`yaPendiente`) o la dirección no tiene cobertura (`sinCobertura`), la devuelve sin crear otra. Una
pendiente sin respuesta en 45 minutos, o un precio vencido, se vuelve a pedir.

## GET/POST `agentAvisosCotizacionUber`

Cuando el depósito carga el precio (`cotizado`) o avisa que no llega (`no_llegamos`), el bot se lo
avisa al cliente. El n8n lo busca cada minuto (el backend no llama al n8n: esa llamada se cortaba en el
servidor y el cliente se quedaba sin el precio).

- `GET` devuelve `{ avisos: [{ id, idConversacion, telefono, direccion, montoUber | noLlegamos }] }`: los
  precios cargados hace menos de 45 minutos y los «no llegamos» de las últimas 24 horas. Una que ya no
  corresponde avisar (venció sin avisarse, se canceló, se sustituyó o el cliente ya compró) queda
  `procesado` con `avisoNoEnviado: true`, así el panel no la muestra como «Enviando al cliente…».
- `POST { id, enviadoEn }` cuando el mensaje salió: queda `procesado` y el precio vale 45 minutos desde
  `enviadoEn`. Si no se confirma, el siguiente minuto se vuelve a intentar.

## Lo que lee y escribe en Firestore

| Colección | Uso |
|---|---|
| `settings/operativo` | Listas, salidas, cupo, alias activo, situación, días sin despacho (lo carga el depósito) |
| `pedidos` | Los pedidos del bot (`origen: "bot_n8n"`, `schemaVersion: 3`), con los mismos campos que usa el panel |
| `comprobantes` | Los comprobantes recibidos, vinculados al pedido cuando se usan (`pedidoId`) |
| `cotizaciones_uber` | Las cotizaciones del Flash (las ve y resuelve el depósito en /cotizar-uber) |
| `bot_tandas`, `bot_pagos` | Bloqueos: cupo de la tanda y un pago por pedido |
| `recorridos` | Si el reparto salió (lo escribe /reparto) |
