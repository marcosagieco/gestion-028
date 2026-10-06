"use strict";

const crypto = require("crypto");

function actualizarReglas(workflow) {
  const w = structuredClone(workflow);
  const agente = w.nodes.find((n) => n.name === "AI Agent");
  let prompt = agente?.parameters.options.systemMessage;
  if (!prompt || !/^El comprobante llega descripto.*$/m.test(prompt)) throw new Error("No se encontro el prompt esperado: revisar antes de publicar");
  prompt = prompt.replace(/Derivá solo si le faltan más de \$1\.000 para el total,/, "Derivá por importe solo si la diferencia absoluta supera $5.000, tanto de mas como de menos, respecto del monto a transferir (la mitad si es mitad y mitad),");
  prompt = prompt.replace("Si pagó de más o le faltan unos pocos pesos, seguí.", "Hasta $5.000 inclusive de mas o de menos, segui sin derivar por importe. Si supera $5.000 en cualquiera de los dos sentidos, deriva para validar.");
  prompt = prompt.replace("compras por mayor;", "negociacion de precios mayoristas; modificaciones de pedidos ya armados;");
  prompt = prompt.replace("cambios o devoluciones;", "devoluciones; cambios de pedidos ya armados;");
  prompt = prompt.replace(/^4\. Si todavía no dijo cómo lo quiere recibir.*$/m,
    "4. Si todavia no dijo como lo quiere recibir, manda PLANTILLA:FORMAS_DE_ENTREGA y recomenda moto. Si elige moto, ofrece las opciones de OPCIONES MOTO con fecha y hora y pedi que elija una. Conserva salidaSeleccionada: {fecha, tandaId, hora}. No ofrezcas una tanda que ya llego, paso o no esta disponible. Puede elegir la siguiente hoy o una del proximo dia habil. La API vuelve a validar antes de cargar: si ya no esta disponible, ofrece las nuevas opciones y pedi otra eleccion. Uber usa SALIDA UBER. Si no sale hoy, aclaralo antes de pedir el pago. Nunca mezcles modalidades.");
  prompt = prompt.replace(/^Salida si compra ahora:.*$/m,
    "OPCIONES MOTO (fecha AAAA-MM-DD, tandaId y hora; solo opciones disponibles): {{ JSON.stringify($('Estado del día').item.json.opcionesMoto || []) }}\nSALIDA UBER: {{ JSON.stringify($('Estado del día').item.json.salidaUber) }}\nREGLA MAYORISTA: {{ JSON.stringify($('Estado del día').item.json.mayorista) }}");
  prompt = prompt.replace(/^Moto: llega en el día.*$/m,
    "Moto: dos salidas configurables en el panel, por defecto 15:30 y 18:30. Usa solo OPCIONES MOTO, nunca horarios fijos de tu memoria. La demora empieza desde la salida y depende de la cola real. No prometas hora exacta de llegada.");
  // El bloque tiene marcador para poder actualizarlo sin duplicarlo en sucesivas publicaciones.
  prompt = prompt.replace(/\nREGLAS NUEVAS 06-10[\s\S]*?\nFIN REGLAS NUEVAS 06-10\n/g, "\n");
  const reglas = [
    "REGLAS NUEVAS 06-10",
    "Resumen: fecha dd/mm y hora deben coincidir con salidaSeleccionada y la respuesta de la API. Nunca digas solo sale manana. No confirmes registrado ni modificado sin ok:true y pedidoId de la tool definitiva.",
    "Mayorista: desde 10 unidades, usa la lista mayorista y armar_resumen/crear_pedido con mayorista:true. Las tools calculan los tramos y la conversion del dolar del panel: no hagas cuentas ni uses precios minoristas para una compra mayorista. En agrupacion por_modelo se suman sabores del mismo modelo; en total, se suman los modelos. Nunca derives solo por ser mayorista ni por superar 100 unidades. Dentro del flujo mayorista, deriva solo si pide negociar el precio, no por preguntar el total. Si falta el dolar, podes dar la cotizacion USD que devuelve la tool, pero no inventes pesos ni pidas una transferencia con un total sin calcular.",
    "Mayorista Via Cargo: tipoEnvio:'correo' y datosCorreo completos. Es el envio al cliente. El traslado al despacho va internamente por moto en la primera tanda disponible, con fecha; no cambies tipoEnvio del cliente a moto ni cobresle dos envios. Si la primera tanda ya paso, usa primera del proximo dia habil. El resumen separa ambos tramos. No afirmes que llegara al cliente a esa hora.",
    "Modificar un pedido existente: usa pedidoActual.id y el detalle del estado real. Nunca llames crear_pedido como si fuera nuevo para cambiar direccion, producto, cantidad, referencia, pago o envio. Primero armar_resumen con pedidoId y solo los campos a cambiar; mostra el cambio, total y saldoPendiente. Con la confirmacion, llama modificar_pedido con ese pedidoId y esos cambios. La API lee nuevamente el estado y actualiza el mismo registro atomico. Solo permite estado pendiente. Si dice derivar:true por armado u otro estado final, avisa al equipo con motivo modificar_pedido_armado. Si devuelve conflicto o tanda sin cupo, consulta nuevas opciones y pedi confirmacion; no crees otro pedido. Si el cambio requiere un pago adicional, pide solo ese saldo y manda comprobanteAdicional:{numero,monto}; nunca uses como monto la suma inventada de dos comprobantes. Conserva el original. Si ya se registro ese pago adicional no lo sumes de nuevo. Cuando solo cambia direccion/referencia, no vuelvas a negociar productos ni precios.",
    "Comprobantes: distinguir archivo recibido de acreditacion bancaria. CBU y titular se comparan con la cuenta enviada al cliente, no con la cuenta activa de hoy. Las tres cuentas validas son distintas. Inclui cuentaCobro:'alias1'|'alias2'|'alias3' segun la plantilla que efectivamente mandaste para ese pedido. Diferencia tolerada hasta $5.000 inclusive en ambos sentidos; mas de $5.000 deriva. Sigue verificando destino explicito incorrecto o evidencia concreta de edicion. No frenes por tildes, guiones, remitente distinto o falta de alias escrito.",
    "Combos y baterias: usa PLANTILLA:COMBOS_BATERIAS si esta cargada y aplica a la consulta. Ese texto es editable por el equipo y tiene prioridad sobre descripciones viejas de combos o baterias. No inventes precios si no hay lista con el valor del producto; pide el dato faltante.",
    "FIN REGLAS NUEVAS 06-10",
  ].join("\n");
  prompt += `\n\n${reglas}\n\nCOMBOS_BATERIAS:\n{{ $('Estado del día').item.json.plantillas.COMBOS_BATERIAS || '(vacia hoy)' }}`;
  // Limpiar el catalogo agregado por una ejecucion anterior de esta transformacion.
  const bloqueCombos = "\n\nCOMBOS_BATERIAS:\n{{ $('Estado del día').item.json.plantillas.COMBOS_BATERIAS || '(vacia hoy)' }}";
  const partes = prompt.split(bloqueCombos);
  prompt = partes.join("") + bloqueCombos;
  agente.parameters.options.systemMessage = prompt;
  for (const nombre of ["Leer imagen (Gemini)", "Leer PDF (Gemini)"]) {
    const lector = w.nodes.find((n) => n.name === nombre);
    if (lector?.parameters.jsonBody) lector.parameters.jsonBody = lector.parameters.jsonBody.replace("titular, destinatario y fecha", "titular, destinatario, CBU o CVU de destino, alias visible y fecha");
  }

  const extra = " Para moto incluye salidaSeleccionada:{fecha:'AAAA-MM-DD',tandaId:'primera'|'segunda',hora:'HH:mm'} elegida por el cliente. Para mayorista incluye mayorista:true. Para previsualizar cambios incluye pedidoId y solo campos a cambiar. cuentaCobro es el alias enviado al cliente para este pedido.";
  for (const nombre of ["armar_resumen", "crear_pedido"]) {
    const tool = w.nodes.find((n) => n.name === nombre);
    if (!tool?.parameters.jsonBody.includes("$fromAI('pedido'")) throw new Error(`Tool ${nombre} no coincide con el contrato esperado`);
    if (!tool.parameters.jsonBody.includes("salidaSeleccionada:")) {
      tool.parameters.jsonBody = tool.parameters.jsonBody.replace("\", 'json')", `${extra}\", 'json')`);
    }
  }
  const crear = w.nodes.find((n) => n.name === "crear_pedido");
  crear.parameters.toolDescription = "Carga un pedido nuevo una sola vez, con comprobante valido o confirmacion de pago al recibir. Para cambios usa modificar_pedido, nunca crees otro. Inclui fecha y tanda moto elegidas y mayorista:true si corresponde. Confirma carga solo con ok:true y pedidoId.";
  crear.parameters.jsonBody = crear.parameters.jsonBody.replace("{ telefono: $('Datos del mensaje')", "{ preview: false, telefono: $('Datos del mensaje')");
  let modificar = w.nodes.find((n) => n.name === "modificar_pedido");
  if (!modificar) {
    modificar = structuredClone(crear);
    modificar.id = crypto.randomUUID();
    modificar.name = "modificar_pedido";
    modificar.position = [crear.position[0] + 240, crear.position[1]];
    w.nodes.push(modificar);
  }
  const descripcion = "Objeto JSON con pedidoId obligatorio del pedidoActual, y SOLO los campos a cambiar: items (lista completa nueva), direccion:{texto,referencias}, tipoEnvio, medioPago, envioSeguro, salidaSeleccionada:{fecha,tandaId,hora}, horaSolicitada (Uber), datosCorreo o cliente. mayorista:true si aplica. Si el cambio aumenta el monto ya pagado, comprobanteAdicional:{numero,monto} del nuevo archivo por el saldo y comprobanteUrl de ese archivo; no reemplaces el comprobante original. La API conserva todos los campos omitidos y valida el estado del deposito.";
  modificar.parameters.toolDescription = "Modifica el MISMO pedido pendiente, sin duplicarlo. Usar con pedidoId y cambios confirmados, despues de armar_resumen con pedidoId. Si el deposito ya lo armo, devuelve derivar:true. Nunca confirmar cambios sin ok:true.";
  modificar.parameters.jsonBody = `={{ JSON.stringify(Object.assign({}, $fromAI('pedido', ${JSON.stringify(descripcion)}, 'json') || {}, { modificar: true, preview: false, telefono: $('Datos del mensaje').item.json.telefono, idConversacion: $('Datos del mensaje').item.json.conversacion, idMensajeOrigen: String($('Datos del mensaje').item.json.mensajeId) })) }}`;
  w.connections.modificar_pedido = structuredClone(w.connections.crear_pedido);
  const derivar = w.nodes.find((n) => n.name === "avisar_al_equipo");
  derivar.parameters.workflowInputs.value.motivo = "={{ $fromAI('motivo', 'reclamo | pedido_perdido | comprobante_dudoso | cobro | cambio | modificar_pedido_armado | falla | local | mayorista (solo negociacion de precio) | medico_legal | cotizar_uber | otro', 'string') }}";
  return w;
}

module.exports = { actualizarReglas };
