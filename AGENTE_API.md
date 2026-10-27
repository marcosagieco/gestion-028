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
  no salió; una moto `armada` solo puede figurar en camino si su recorrido asignado está `en_calle`
  (`moto1`: `recorridos/activo`, `moto2`: `recorridos/activo_moto2`).
  Incluye `fechaSalida`, `horaSalida`, `tandaSalida`, `puedeModificar` y detalle estructurado
  para modificar un pedido del bot. Si no hay un pedido estructurado para ese teléfono, llega `null`.
- `plantillas`: las listas de `/operativo` (`STOCK_NICOTINA`, `PRECIOS_VAPES`, `STOCK_THC`,
  `PRECIOS_THC`, `PERFUMES`, `APPLE_ACCESORIOS`, `PRECIOS_MAYORISTA`, `OFERTAS`, `COMBOS_BATERIAS`), el `ALIAS` activo
  y los textos fijos (`FORMAS_DE_ENTREGA`, `ENVIO_SEGURO`, `WEB`, `DESCUENTO_EFECTIVO`, `GRACIAS`,
  `CONFIANZA`, `COMUNIDAD`, `COMPROBANTES_VALIDOS`). Una lista vacía llega como `""`.
  `COMUNIDAD` se usa cuando piden aviso de reingreso/stock nuevo/ofertas, y también como cierre
  liviano cuando el cliente confirma que llegó todo bien. `COMPROBANTES_VALIDOS` es regla interna:
  incluye las tres cuentas: Lucio Felix Bunge/Galicia para alias1, Marcos Agustin Gieco/Galicia
  para alias2 y Tame Lake S.A. (tamelake358sa.eluter) para alias3. Identifica la cuenta activa y compara contra
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

**Precios:** salen de todas las listas de `/operativo` que el agente ve, menos stock, mayorista y
ofertas (hoy vapes, THC, perfumes, Apple y combos de baterías; una lista nueva del panel se cobra
sola), con sus combos (`2x $49.000` es el combo de 2 entero). Las `OFERTAS` escritas con el mismo
formato pisan esos precios. Cada precio queda con todos los renglones de su bloque (título de
sección, nombre, descripción) y el producto se busca contra todos: no hace falta que el nombre esté
en mayúsculas. Si un producto no está, es ambiguo o esa cantidad no se vende, el pedido no se
calcula. El agente nunca manda precios.

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
`cuentaCobro` (la cuenta enviada para ese pedido, o el alias activo si no se informa), `comprobante`,
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

## Cotización de Uber (publicación 25/10/2026)

1. `agentCrearCotizacionUber` recibe conversación, teléfono, dirección, explicación y un `pedido` opcional con los datos conocidos de la compra. Reutiliza una cotización vigente de la misma compra y destino; no duplica una pendiente. La vigencia del precio es de **45 minutos desde su aviso**, no 30.
2. Depósito resuelve la cotización en `/cotizar-uber`. El trigger `onCotizacionUberConfirmada` envía `idCotizacion`, `idConversacion` y `montoUber` al n8n actual de 028.
3. n8n valida y reserva el aviso, recupera la compra actual de Chatwoot y llama a POST `/agentPrepararDetalleUber` con `{idCotizacion,pedido}`. El servidor conserva identidad y destino de la cotización y calcula con listas y stock vigentes. Devuelve `contenido`, `total`, `cierreVersion`, `telefono`, `idConversacion` y `detalleListo:true` cuando el detalle está completo. El contenido incluye el resumen entero y el alias activo. Si falta algo, devuelve una pregunta concreta y no solicita un pago sin total calculado.
4. n8n envía el contenido y llama a `agentPedido` con `accionCierre:detalle_enviado`, la versión, el ID y el contenido efectivamente enviado. La cotización queda informada solo después de la confirmación del circuito. Un webhook recibido con HTTP 200 no prueba el envío. Los fallos se reintentan con reserva para evitar avisos repetidos.
5. El comprobante se guarda antes de resolver el cierre. Se acepta lectura estructurada del archivo; el texto del cliente junto al adjunto no constituye evidencia. `accionCierre:resolver` usa el cierre calculado y el comprobante válido de la misma conversación posterior al detalle; también encuentra la foto cuando otro mensaje llegó después dentro de la agrupación de mensajes. Registra una única vez y devuelve `resuelto:true,pedidoId` únicamente con alta confirmada.
6. `no_llegamos` conserva el aviso de falta de cobertura. Una cotización cancelada, sustituida o usada por una compra registrada no vuelve a abrirla.

## Cotización de productos y control de turnos (25/10/2026)

- POST `/agentCotizarProductos`: `{items:[{producto,variante?,cantidad}],medioPago?,mayorista?}`. No requiere datos personales ni entrega. Devuelve importes calculados, combos aplicados y `incluyeEnvio:false`; valida cantidades y stock. No registra ni reserva pedidos.
- POST `/agentTurno`: controla `registrar`, `validar`, `reservar_salida`, `pausar` y `liberar` por conversación. Las herramientas pasan `turno:{idConversacion,idMensaje,ejecucionId}` forzado por n8n. Un turno reemplazado o pausado no puede escribir un pedido ni enviar una respuesta.
- El resumen de moto persiste la `salidaSeleccionada` que mostró. Una confirmación afirmativa posterior, incluida la aceptación de esa misma hora, puede registrar efectivo/al recibir sin repetir el detalle.

## GET `/serveComprobante?pedido=<id>`

La foto del comprobante de un pedido, para el panel. Sin clave, igual que `servePdf`.

### Validación y contrato del comprobante (corrección posterior del 25/10)

`agentGuardarComprobante` admite `lectura` estructurada y `descripcion` canónica derivadas de la misma lectura del archivo. El texto escrito por el cliente no se mezcla en esa descripción. Con `soloValidar:true` devuelve `guardable`, `datos` y `versionLectura` sin descargar el archivo ni persistir comprobantes/pedidos. La validación confirma los datos del archivo; no acredita un ingreso bancario.

Después de publicar, comprobar el tráfico efectivo de Cloud Run con `node automation/n8n/verificar-despliegue-bot.cjs`; en las funciones del bot debe apuntar a la revisión indicada por Cloud Functions. Se corrigieron fijaciones a versiones antiguas que hacían que un despliegue exitoso siguiera atendiendo con código anterior.

## Estado actual e historial (25/10/2026)

GET agentEstadoOperativo distingue pedidoActual de pedidoHistorico. El historial no bloquea nuevas compras ni dispara por sí solo seguimiento automático. consultaPedidoHistorico autoriza contextualizar una consulta explícita sobre una compra anterior; el prompt omite sus detalles para consultas de stock y nuevas compras. Un pedido agendado a futuro sigue siendo actual aunque se haya creado antes. La antigüedad no cambia el estado guardado ni prueba entrega. El reparto en calle debe corresponder al día de ese pedido.

Las respuestas de stock usan los nombres PLANTILLA:STOCK_NICOTINA y PLANTILLA:STOCK_THC (o PERFUMES/APPLE_ACCESORIOS) para expandir el texto original del panel. No se sustituyen por listas reescritas por el modelo; las preguntas de compra y consultas mixtas conservan su atención específica.

### Separación entre crear y modificar (25/10/2026)

La herramienta crear_pedido fuerza operacion:crear. agentPedido rechaza que esa operación incluya pedidoId de otra compra. Un registro pendiente/armado antiguo no habilita un cambio de la compra actual: responde pedido_anterior, derivar:false y continuarCompra:true. El agente corrige la selección de herramienta y atiende la intención real del cliente; un reclamo nunca genera por sí solo un pedido nuevo.

Para probar el recorrido de clientes recurrentes: `node functions/agente-flujo-recompra.test.js`. Cubre los flujos de Uber con comprobante y moto en efectivo, con un pedido histórico en el mismo teléfono y sin duplicaciones.

## Atención estandarizada (26/10/2026)

agentEstadoOperativo acepta idConversacion y devuelve atencionEnvios (horarios, próximas salidas y aviso con clave estable) y atencionConversacion (comunidadEnviada y avisosHorarioEnviados). Las plantillas STOCK_NICOTINA/STOCK_THC conservan formato sin precios; STOCK_PERFUMES/STOCK_APPLE_ACCESORIOS son proyecciones de los catálogos existentes sin importes.

agentBuscarCatalogo acepta sinPrecios:true. La herramienta de n8n fuerza este valor según el texto real del cliente, sin tratar el contenido OCR de un adjunto como consulta de precios. El contrato anterior conserva precios por defecto para otros consumidores.

agentTurno admite accion:registrar_salida con idConversacion, idMensajeSalida numérico y flags opcionales comunidadEnviada/avisoHorarioClave. Se llama después del envío exitoso; rechaza mensajes sin ID y conserva las marcas previas. No registra pedidos ni modifica pagos.

Pedir alias después del detalle devuelve solo ALIAS, con cierreVersion:null. El primer mensaje válido del detalle se conserva al reenviarlo para no invalidar comprobantes enviados entre ambas copias. El cierre registrado confirma y agradece una vez; solo reenvía el detalle si el cliente lo pide. Pruebas: functions/agente-estandarizacion.test.js. Ver ESTANDAR_BOT_028_2026-10-26.md.

## Horario coordinado de Uber — 26/10/2026

Restaurada la aclaración «Podés coordinar un horario de envío, sujeto a disponibilidad» en FORMAS_DE_ENTREGA. El bot explica que Uber permite coordinar horario sin exigir cotización para una consulta general. Conserva horaSolicitada en cotización, detalle y pedido; diferencia «retomo a las 15» de «envío a las 16:30». No inventa una reserva ni ofrece un aviso automático. Moto conserva sus tandas y las excepciones de horarios del panel siguen vigentes.

Verificación: 309 pruebas API y 54 regresiones aprobadas; cuatro comprobaciones del horario y su conservación en el detalle; dos casos probados con el modelo real en n8n sin mensajes a clientes ni pedidos. Servidor: agentestadooperativo-00068-som recibe 100 % del tráfico y devuelve la plantilla actualizada. Principal activo: b0cb3d2f-ff25-44cb-ae2c-5836be6f297f. Se conservaron el orden, las notas y los cambios visuales del borrador revisado; no cambiaron conexiones ni herramientas.

## Formato físico de descartables y cápsulas — 26/10/2026

Datos confirmados por el negocio: DOZO y BLOW son descartables completos con batería integrada; no son cápsulas intercambiables ni se conectan a un pen. Las cápsulas Cookies, Muha y 028 usan una batería compatible con su conector; no se deduce compatibilidad universal porque el cliente haya usado Big Chief. Un sabor Cookies and Cream de DOZO no cambia su formato.

agentBuscarCatalogo incorpora fichaProducto para los modelos identificados de PRECIOS_THC: tipoDispositivo, bateriaIntegrada, capsulaIntercambiable, requierePenExterno y compatibilidadPen. Se retiran indicaciones contradictorias de rosca/conexión del detalle de DOZO/BLOW. La clasificación no se aplica a combos completos ni a otras categorías. No determina stock ni precios y no modifica pedidos. La plantilla de stock conserva su formato.

Las instrucciones del agente corrigen la explicación antigua del encastre y prevalecen sobre aquella memoria. Pruebas: 11 comprobaciones específicas, 309 de API y 54 regresiones aprobadas. Dos casos del modelo real comprobaron corrección de DOZO ante la referencia a Big Chief y descripción de BLOW; no enviaron mensajes a clientes ni realizaron operaciones comerciales. La consulta HTTP de producción verificó las fichas de DOZO, BLOW y Cookies y las instrucciones activas de ambos agentes. Principal vigente: fd5aa5ce-67c4-4b5b-b588-2eb1220dc4a7. Fuente: functions/agente-fichas-productos.js y functions/agente-prompt.js.
