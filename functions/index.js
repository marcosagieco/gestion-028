const functions = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler"); 
const admin = require("firebase-admin");
const { google } = require("googleapis"); 
admin.initializeApp();

const db = admin.firestore();

const VERIFY_TOKEN = "028_Import_Master_2026";

// 👇 TUS DATOS REALES DE META 👇
const META_TOKEN = "EAANhs8CZCMhUBRfllbvBZCzHH83H31sZCZC6ISpFo1ylsq3XOTEQXZCd1dIyUPXVHNjCfNDmG4Jnrnk4G7U9kBTsFdhkOs7WUiVrchrLLomAZAy4ydcSrNhlbzPTbVlMDpxZAVfKBj4uePi2xFjYuPW1hLAKcAlr98EHPkKWDS2TaFlb1TKVxmFDCvmkzNqZCmCZC1wZDZD";
const PHONE_ID = "984636221409591";

// 👇 TUS DATOS PARA GOOGLE SHEETS Y RESÚMENES 👇
const SPREADSHEET_ID = "1f5r9oYyUyB3GTI62fn1uvAJuiOUdWDLkVRm7LBhzMNc";
const ADMIN_NUMBER = "541153412358"; 

const https = require('https');

// ==========================================
// FUNCIONES PARA GOOGLE SHEETS
// ==========================================
async function getSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        keyFile: "service-account.json",
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const client = await auth.getClient();
    return google.sheets({ version: "v4", auth: client });
}

async function registrarEnSheet(pestaña, fila) {
    try {
        const sheets = await getSheetsClient();
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${pestaña}!A1`,
            valueInputOption: "USER_ENTERED",
            resource: { values: [fila] },
        });
    } catch (e) {
        console.error("❌ Error escribiendo en Sheets:", e);
    }
}

// Función nativa para enviar mensajes con LOGS
async function enviarMensajeWhatsApp(telefonoDestino, texto) {
    if (META_TOKEN === "PONE_ACA_TU_TOKEN_DE_META") {
        console.log("❌ ERROR INTERNO: El token de Meta no fue configurado.");
        return;
    }

    console.log(`Intentando enviar WhatsApp a: ${telefonoDestino}...`);

    const data = JSON.stringify({
        messaging_product: "whatsapp",
        to: telefonoDestino,
        type: "text",
        text: { body: texto }
    });

    const options = {
        hostname: 'graph.facebook.com',
        path: `/v17.0/${PHONE_ID}/messages`,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${META_TOKEN}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => responseBody += chunk);
            res.on('end', () => {
                console.log(`Respuesta de Meta (Status ${res.statusCode}):`, responseBody);
                if (res.statusCode >= 400) {
                    console.error("❌ Error de Meta:", responseBody);
                }
                resolve(responseBody);
            });
        });

        req.on('error', (e) => {
            console.error("❌ Error enviando WhatsApp:", e);
            reject(e);
        });

        req.write(data);
        req.end();
    });
}

// Función para limpiar textos
const normalizarParaComparar = (texto) => {
    return String(texto || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") 
        .replace(/[^a-z0-9 ]/g, "")      
        .replace(/\s+/g, " ");          
};

// ==========================================
// PARSER NUEVO WHATSAPP (bloques humanos)
// Mantiene intacto el formato viejo VENTA|... / NEUTRO|...
// ==========================================
const limpiarNumero = (texto) => {
    return parseFloat(String(texto ?? "").replace(/[^0-9,-]+/g, "").replace(",", ".")) || 0;
};

const normalizarCampoMensaje = (key) => {
    const k = normalizarParaComparar(key).trim();
    const aliases = {
        "producto": "producto", "modelo": "producto", "marca": "producto", "prod": "producto",
        "precio": "precio", "valor": "precio", "precio unitario": "precio", "unitario": "precio",
        "sabor": "variante", "variante": "variante", "gusto": "variante",
        "cantidad": "cantidad", "cant": "cantidad", "unidades": "cantidad", "unidad": "cantidad",
        "cliente": "cliente", "nombre": "cliente", "consignatario": "cliente",
        "tipo cliente": "tipoCliente", "cliente tipo": "tipoCliente", "estado cliente": "tipoCliente", "origen cliente": "tipoCliente",
        "canal": "canal", "origen": "canal",
        "fecha": "fecha", "dia": "fecha",
        "fecha limite": "fechaLimite", "limite": "fechaLimite", "vencimiento": "fechaLimite",
        "accion": "accion", "acción": "accion", "movimiento": "accion",
        "nota": "nota", "detalle": "nota", "obs": "nota", "observacion": "nota", "observación": "nota",
        "motivo": "motivo", "vendedor": "vendedor"
    };
    return aliases[k] || k;
};

const detectarTipoMensajeNuevo = (linea) => {
    const t = normalizarParaComparar(linea).trim();
    if (["venta", "vender"].includes(t)) return "VENTA";
    if (["mayorista", "mayor", "revendedor", "mayoreo"].includes(t)) return "MAYORISTA";
    if (["neutro", "neutral", "stock neutro"].includes(t)) return "NEUTRO";
    if (["consignacion", "consignación", "consigna", "cons"].includes(t)) return "CONSIGNACION";
    return null;
};

const normalizarTipoCliente = (value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "Frecuente";
    const v = normalizarParaComparar(raw);
    if (["publicidad", "publi", "ads", "ad", "anuncio", "anuncios", "pauta", "pago", "paid", "nuevo publicidad", "nuevo por publicidad"].includes(v)) return "Nuevo - Publicidad";
    if (["organico", "orgánico", "org", "ig", "instagram", "instagram organico", "instagram orgánico", "nuevo organico", "nuevo orgánico"].includes(v)) return "Nuevo - Organico";
    if (["si", "sí", "true", "nuevo", "yes", "1"].includes(v)) return "Nuevo - Organico";
    return "Frecuente";
};

const parseItemCompacto = (linea) => {
    const limpia = String(linea || "")
        .replace(/[^\w\s|\/\-\+&.áéíóúñüÁÉÍÓÚÑÜ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!limpia) return null;
    const match = limpia.match(/^(.+?)(?:\s*(?:\||-|x)\s*|\s+)(\d+)\s*$/i);
    if (!match) return null;
    const variante = String(match[1] || "").trim();
    const cantidad = parseInt(match[2]) || 0;
    if (!variante || cantidad <= 0) return null;
    return { variante, cantidad };
};

const errorConProducto = (item, index, errorMsg) => {
    const producto = String(item?.producto || "Sin producto").trim();
    const modelo = String(item?.variante || "Sin modelo").trim();
    const linea = Number.isInteger(index) ? index + 1 : "?";

    return `${errorMsg}\n\nFalló en: *${producto} / ${modelo}*\nModelo: *${modelo}*\nLínea: *${linea}*`;
};

const parseMensajeNuevo = (textoOriginal) => {
    const lineas = String(textoOriginal || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lineas.length) return null;
    if (lineas[0].includes("|")) return null;
    const tipo = detectarTipoMensajeNuevo(lineas[0]);
    if (!tipo) return null;
    const general = {};
    const items = [];
    let productoBase = "";
    let precioBase = "";
    let itemActual = null;
    const guardarItemActual = () => {
        if (!itemActual) return;
        const tieneDatos = itemActual.producto || itemActual.variante || itemActual.cantidad || itemActual.precio;
        const esSoloBase = itemActual.producto && !itemActual.variante && !itemActual.cantidad;
        if (tieneDatos && !esSoloBase) items.push(itemActual);
        itemActual = null;
    };
    for (let i = 1; i < lineas.length; i++) {
        const linea = lineas[i];
        const idx = linea.indexOf(":");
        if (idx === -1) {
            const compacto = parseItemCompacto(linea);
            if (compacto && productoBase) items.push({ producto: productoBase, variante: compacto.variante, cantidad: compacto.cantidad, precio: precioBase });
            else if (linea) general.nota = general.nota ? `${general.nota} | ${linea}` : linea;
            continue;
        }
        const key = normalizarCampoMensaje(linea.slice(0, idx).trim());
        const value = linea.slice(idx + 1).trim();
        if (key === "producto") { guardarItemActual(); productoBase = value; itemActual = { producto: value }; continue; }
        if (key === "precio") { precioBase = value; if (!itemActual) itemActual = { producto: productoBase }; itemActual.precio = value; continue; }
        if (["variante", "cantidad"].includes(key)) { if (!itemActual) itemActual = { producto: productoBase, precio: precioBase }; itemActual[key] = value; continue; }
        general[key] = value;
    }
    guardarItemActual();
    const parsedItems = items.map((item, index) => ({ producto: String(item.producto || "").trim(), variante: String(item.variante || "").trim(), cantidad: parseInt(item.cantidad) || 0, precio: limpiarNumero(item.precio), index: index + 1 })).filter(item => item.producto && item.variante && item.cantidad > 0);
    return { tipo, general, items: parsedItems };
};

const numeroMeta = (numeroRemitente) => {
    let numeroParaMeta = numeroRemitente;
    if (numeroParaMeta.startsWith("549") && numeroParaMeta.length === 13) numeroParaMeta = numeroParaMeta.replace(/^549/, "54");
    return numeroParaMeta;
};


exports.webhook = functions.https.onRequest(async (req, res) => {
    if (req.method === "GET") {
        if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
            return res.status(200).send(req.query["hub.challenge"]);
        }
        return res.status(403).send("Error de verificación");
    }

    if (req.method === "POST") {
        try {
            const body = req.body;
            if (body.object === "whatsapp_business_account" && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
                const msg = body.entry[0].changes[0].value.messages[0];
                
                const textoOriginal = msg.text.body;
                let numeroRemitente = msg.from;
                const fechaHoySheet = new Date().toLocaleString("es-AR", {timeZone: "America/Argentina/Buenos_Aires"});

                if (numeroRemitente.startsWith("54") && numeroRemitente.length === 12) {
                    numeroRemitente = numeroRemitente.replace(/^54/, "549");
                } 

                console.log(`📩 Mensaje recibido de ${numeroRemitente}: ${textoOriginal}`);

                const mensajeNuevo = parseMensajeNuevo(textoOriginal);
                if (mensajeNuevo) {
                    const resultadoNuevo = await procesarMensajeNuevoWhatsapp(mensajeNuevo, numeroRemitente, fechaHoySheet, textoOriginal);
                    if (resultadoNuevo && resultadoNuevo.exito === false) {
                        await enviarMensajeWhatsApp(numeroMeta(numeroRemitente), resultadoNuevo.error_msg);
                        await registrarEnSheet("Intentos", [fechaHoySheet, numeroRemitente, textoOriginal, resultadoNuevo.error_msg]);
                    } else if (resultadoNuevo && resultadoNuevo.mensaje) {
                        await enviarMensajeWhatsApp(numeroMeta(numeroRemitente), resultadoNuevo.mensaje);
                    }
                    return res.sendStatus(200);
                }

                const lineas = textoOriginal.split('\n');

                for (const linea of lineas) {
                    if (linea.trim() === "") continue;

                    const partes = linea.split("|").map(t => t.trim());

                    const tipoMovimiento = String(partes[0] || "").trim().toUpperCase();
                    const esNeutroDirecto = tipoMovimiento === "NEUTRO";
                    const esVentaNormal = tipoMovimiento === "VENTA";
                    const esVentaMarcadaComoNeutra = esVentaNormal && String(partes[1] || "").trim().toUpperCase() === "NEUTRO";
                    const esMovimientoValido = esVentaNormal || esNeutroDirecto;

                    if (partes.length >= 5 && esMovimientoValido) {
                        const esMovimientoNeutro = esNeutroDirecto || esVentaMarcadaComoNeutra;
                        console.log(`✅ Formato ${esMovimientoNeutro ? "NEUTRO" : "VENTA"} detectado. Procesando...`);

                        // Formatos soportados:
                        // VENTA|Producto|Variante|Cantidad|Precio|...
                        // VENTA|B|Producto|Variante|Cantidad|Precio|...
                        // NEUTRO|Producto|Variante|Cantidad|Precio|Motivo opcional|Nota opcional
                        // NEUTRO|B|Producto|Variante|Cantidad|Precio|Motivo opcional|Nota opcional
                        // VENTA|NEUTRO|Producto|Variante|Cantidad|Precio|Motivo opcional|Nota opcional
                        // VENTA|NEUTRO|B|Producto|Variante|Cantidad|Precio|Motivo opcional|Nota opcional

                        let vendedor = "028 Import";
                        let baseIndex = esVentaMarcadaComoNeutra ? 2 : 1;
                        let indexOffset = 0;

                        // Si después del tipo viene una sigla corta, es vendedor.
                        if (partes[baseIndex] && partes[baseIndex].length <= 2) {
                            let letra = partes[baseIndex].toUpperCase();
                            if (letra === "B") {
                                vendedor = "Buono";
                            } else {
                                vendedor = letra;
                            }
                            indexOffset = 1;
                        }

                        const productoRaw = String(partes[baseIndex + indexOffset] || "");
                        const varianteRaw = String(partes[baseIndex + 1 + indexOffset] || "");
                        const cantidad = parseInt(partes[baseIndex + 2 + indexOffset]) || 1;

                        const limpiarNum = (texto) => parseFloat(String(texto).replace(/[^0-9,-]+/g,"").replace(",", ".")) || 0;
                        const precioUnitario = limpiarNum(partes[baseIndex + 3 + indexOffset]);

                        if (!productoRaw || !varianteRaw || !cantidad) {
                            let numFallo = numeroRemitente.startsWith("549") ? numeroRemitente.replace(/^549/, "54") : numeroRemitente;
                            await registrarEnSheet("Intentos", [fechaHoySheet, numFallo, linea, "Formato incompleto"]);
                            continue;
                        }

                        let fechaManual = "hoy"; 
                        let costoEnvioMio = 0;
                        let precioEnvioCliente = 0;
                        let esRevendedor = false;
                        let esNuevo = false;
                        let numerosEncontrados = 0;

                        let motivoNeutro = "Stock perdido";
                        let notaNeutra = "";

                        for (let i = baseIndex + 4 + indexOffset; i < partes.length; i++) {
                            let dato = String(partes[i]).trim();
                            let datoUpper = dato.toUpperCase();

                            if (datoUpper === "") continue;

                            if (esMovimientoNeutro) {
                                // En neutro no usamos fecha ni envío: lo que viene después del precio es motivo/nota.
                                if (motivoNeutro === "Stock perdido") {
                                    motivoNeutro = dato;
                                } else {
                                    notaNeutra = notaNeutra ? `${notaNeutra} | ${dato}` : dato;
                                }
                                continue;
                            }

                            if (dato.includes("/") || dato.includes("-")) {
                                fechaManual = dato;
                            } 
                            else if (datoUpper === "SI" || datoUpper === "REV" || datoUpper === "TRUE") {
                                esRevendedor = true;
                            } 
                            else if (datoUpper === "NUEVO") {
                                esNuevo = true;
                            } 
                            else if (/[0-9]/.test(dato)) {
                                let posibleNum = limpiarNum(dato);
                                if (!isNaN(posibleNum)) {
                                    if (numerosEncontrados === 0) {
                                        costoEnvioMio = posibleNum;
                                        numerosEncontrados++;
                                    } else {
                                        precioEnvioCliente = posibleNum;
                                    }
                                }
                            }
                        }

                        console.log(`Buscando producto: ${productoRaw} | Variante: ${varianteRaw} | Cantidad: ${cantidad} | Vendedor: ${vendedor} | Modo: ${esMovimientoNeutro ? "NEUTRO" : "VENTA"}`);

                        const resultado = esMovimientoNeutro
                            ? await procesarStockNeutro(productoRaw, varianteRaw, cantidad, precioUnitario, motivoNeutro, notaNeutra, vendedor)
                            : await procesarVenta(productoRaw, varianteRaw, cantidad, precioUnitario, fechaManual, costoEnvioMio, precioEnvioCliente, esRevendedor, esNuevo, vendedor);

                        let numeroParaMeta = numeroRemitente;
                        if (numeroParaMeta.startsWith("549") && numeroParaMeta.length === 13) {
                            numeroParaMeta = numeroParaMeta.replace(/^549/, "54");
                        }

                        if (resultado && resultado.exito === false) {
                            console.log(`⚠️ Error procesando ${esMovimientoNeutro ? "stock neutro" : "venta"}. Avisando...`);
                            await enviarMensajeWhatsApp(numeroParaMeta, `${resultado.error_msg}\n\nFalló en: *${productoRaw} / ${varianteRaw}*\nModelo: *${varianteRaw}*`);
                            await registrarEnSheet("Intentos", [fechaHoySheet, numeroRemitente, linea, resultado.error_msg]);
                        } else {
                            if (esMovimientoNeutro) {
                                console.log("✅ Stock neutro anotado con éxito.");
                                await registrarEnSheet("Neutro", [fechaHoySheet, numeroRemitente, productoRaw, varianteRaw, cantidad, precioUnitario, motivoNeutro, `ÉXITO (${vendedor})`]);
                            } else {
                                console.log("✅ Venta anotada con éxito.");
                                await registrarEnSheet("Ventas", [fechaHoySheet, numeroRemitente, productoRaw, varianteRaw, cantidad, precioUnitario, `ÉXITO (${vendedor})`]);
                            }
                        }

                    } else {
                        console.log("❌ El mensaje no cumple el formato VENTA/NEUTRO");
                        let numFallo = numeroRemitente.startsWith("549") ? numeroRemitente.replace(/^549/, "54") : numeroRemitente;
                        await registrarEnSheet("Intentos", [fechaHoySheet, numFallo, linea, "Formato Incorrecto. Usá VENTA|... o NEUTRO|..."]);
                    }
                }
            }
        } catch (error) {
            console.error("❌ Error crítico en el bot:", error);
        }
        return res.sendStatus(200);
    }
});



// ==========================================
// PROCESADOR DEL FORMATO NUEVO
// Usa las funciones viejas cuando conviene. Solo agrega lo necesario.
// ==========================================
async function procesarMensajeNuevoWhatsapp(mensaje, numeroRemitente, fechaHoySheet, textoOriginal) {
    const { tipo, general, items } = mensaje;
    if (!items.length) return { exito: false, error_msg: "❌ No encontré productos válidos para registrar." };
    const vendedor = general.vendedor || "028 Import";
    const canal = general.canal || "Whatsapp";
    const fecha = general.fecha || "hoy";
    const tipoCliente = normalizarTipoCliente(general.tipoCliente ?? "");
    const esRevendedor = tipo === "MAYORISTA";
    const ticketIdGrupo = Date.now().toString();
    let total = 0;
    let unidades = 0;
    if (tipo === "VENTA" || tipo === "MAYORISTA") {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.precio || item.precio <= 0) return { exito: false, error_msg: errorConProducto(item, i, `❌ Falta precio en ${item.producto} (${item.variante}).`) };
            const costoEnvio = i === 0 ? limpiarNumero(general.envioCosto || 0) : 0;
            const cobroEnvio = i === 0 ? limpiarNumero(general.envioCobro || 0) : 0;
            const r = await procesarVenta(item.producto, item.variante, item.cantidad, item.precio, fecha, costoEnvio, cobroEnvio, esRevendedor, tipoCliente, vendedor, ticketIdGrupo, canal);
            if (r && r.exito === false) return { ...r, error_msg: errorConProducto(item, i, r.error_msg) };
            total += item.precio * item.cantidad + (i === 0 ? (cobroEnvio || 0) : 0);
            unidades += item.cantidad;
            await registrarEnSheet(tipo === "MAYORISTA" ? "Mayorista" : "Ventas", [fechaHoySheet, numeroRemitente, item.producto, item.variante, item.cantidad, item.precio, `ÉXITO (${vendedor})`, tipoCliente]);
        }
        return { exito: true, mensaje: `✅ ${tipo === "MAYORISTA" ? "Mayorista" : "Venta"} registrada` };
    }
    if (tipo === "NEUTRO") {
        const motivo = general.motivo || general.accion || "Venta neutra";
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.precio || item.precio <= 0) return { exito: false, error_msg: errorConProducto(item, i, `❌ Falta precio en ${item.producto} (${item.variante}).`) };
            const r = await procesarStockNeutro(item.producto, item.variante, item.cantidad, item.precio, motivo, general.nota || "", vendedor);
            if (r && r.exito === false) return { ...r, error_msg: errorConProducto(item, i, r.error_msg) };
            total += item.precio * item.cantidad;
            unidades += item.cantidad;
            await registrarEnSheet("Neutro", [fechaHoySheet, numeroRemitente, item.producto, item.variante, item.cantidad, item.precio, motivo, `ÉXITO (${vendedor})`]);
        }
        return { exito: true, mensaje: "✅ Neutro registrado" };
    }
    if (tipo === "CONSIGNACION") {
        const cliente = String(general.cliente || "").trim();
        if (!cliente) return { exito: false, error_msg: "❌ En consignación falta el cliente. Ej: cliente: Juan" };
        const accion = normalizarParaComparar(general.accion || "entrega");
        if (["entrega", "entregar", "dejo", "dejar"].includes(accion)) {
            const consignmentTicketId = `CONS-${Date.now()}`;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item.precio || item.precio <= 0) return { exito: false, error_msg: errorConProducto(item, i, `❌ Falta precio acordado en ${item.producto} (${item.variante}).`) };
                const r = await procesarConsignacionEntregaItem(cliente, item, general.fechaLimite || "", general.nota || "", consignmentTicketId, tipoCliente);
                if (r && r.exito === false) return { ...r, error_msg: errorConProducto(item, i, r.error_msg) };
                unidades += item.cantidad;
                total += item.precio * item.cantidad;
            }
            await registrarEnSheet("Consignacion", [fechaHoySheet, numeroRemitente, cliente, "entrega", items.length, unidades, total, "ÉXITO"]);
            return { exito: true, mensaje: "✅ Consignación registrada" };
        }
        if (["pago", "pagar", "cobro", "cobrar", "liquidacion", "liquidar", "liquidación"].includes(accion)) {
            const ticketIdPago = `CONS-PAGO-${Date.now()}`;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const r = await procesarConsignacionPagoItem(cliente, item, fecha, vendedor, ticketIdPago, tipoCliente);
                if (r && r.exito === false) return { ...r, error_msg: errorConProducto(item, i, r.error_msg) };
                unidades += item.cantidad;
                total += r.total || 0;
            }
            await registrarEnSheet("ConsignacionPagos", [fechaHoySheet, numeroRemitente, cliente, "pago", items.length, unidades, total, "ÉXITO"]);
            return { exito: true, mensaje: "✅ Pago registrado" };
        }
        if (["devolucion", "devolver", "devuelve", "devuelto", "devolución"].includes(accion)) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const r = await procesarConsignacionDevolucionItem(cliente, item, general.nota || "");
                if (r && r.exito === false) return { ...r, error_msg: errorConProducto(item, i, r.error_msg) };
                unidades += item.cantidad;
            }
            await registrarEnSheet("ConsignacionDevoluciones", [fechaHoySheet, numeroRemitente, cliente, "devolucion", items.length, unidades, "ÉXITO"]);
            return { exito: true, mensaje: "✅ Devolución registrada" };
        }
        if (["perdido", "perdida", "perder", "perdio", "perdió"].includes(accion)) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const r = await procesarConsignacionPerdidoItem(cliente, item, general.nota || "");
                if (r && r.exito === false) return { ...r, error_msg: errorConProducto(item, i, r.error_msg) };
                unidades += item.cantidad;
            }
            await registrarEnSheet("ConsignacionPerdidos", [fechaHoySheet, numeroRemitente, cliente, "perdido", items.length, unidades, "ÉXITO"]);
            return { exito: true, mensaje: "✅ Pérdida registrada" };
        }
        return { exito: false, error_msg: `❌ Acción de consignación no reconocida: ${general.accion}. Usá entrega, pago, devolucion o perdido.` };
    }
    return { exito: false, error_msg: "❌ Tipo de mensaje no reconocido." };
}

async function descontarStockParaConsignacion(userProducto, userVariante, cantidad) {
    const pBuscar = normalizarParaComparar(userProducto);
    const vBuscar = normalizarParaComparar(userVariante);
    const snapshot = await db.collection("batches").orderBy("createdAt", "asc").get();
    let productoEncontrado = false;
    let stockDisponible = 0;
    for (const docSnap of snapshot.docs) {
        const batchData = docSnap.data();
        if (batchData.finalizedAt) continue;
        const items = batchData.items || [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const productMatches = esParecido(pBuscar, normalizarParaComparar(item.product));
            const variantMatches = esParecido(vBuscar, normalizarParaComparar(item.variant));
            if (productMatches && variantMatches) {
                productoEncontrado = true;
                stockDisponible = Number(item.currentStock) || 0;
                if (stockDisponible < cantidad) continue;
                items[i] = { ...item, currentStock: stockDisponible - cantidad };
                await docSnap.ref.update({ items });
                return { exito: true, batchId: docSnap.id, batchName: batchData.name || "Venta por WhatsApp", itemId: item.id, productName: item.product || userProducto, variant: item.variant || userVariante, unitCost: Number(item.costArs) || 0 };
            }
        }
    }
    if (!productoEncontrado) return { exito: false, error_msg: `⚠️ No encontré *${userProducto}* (${userVariante}) en stock.` };
    return { exito: false, error_msg: `🛑 Stock insuficiente\nProducto: *${userProducto}*\nModelo: *${userVariante || 'Único'}*\nPediste: *${cantidad}*\nDisponible: *${stockDisponible}*` };
}

async function procesarConsignacionEntregaItem(cliente, item, fechaLimite, nota, consignmentTicketId, tipoCliente) {
    const stock = await descontarStockParaConsignacion(item.producto, item.variante, item.cantidad);
    if (!stock.exito) return stock;
    const now = new Date().toISOString();
    await db.collection("consignments").add({
        consignmentTicketId, createdAt: now, updatedAt: now, status: "active", clientName: cliente, clientType: tipoCliente || "Frecuente",
        batchId: stock.batchId, batchName: stock.batchName, itemId: stock.itemId, productName: stock.productName, variant: stock.variant,
        quantityDelivered: item.cantidad, quantityPending: item.cantidad, quantityPaid: 0, quantityReturned: 0, quantityLost: 0,
        unitCost: stock.unitCost, unitPrice: item.precio, dueDate: fechaLimite || "", note: nota || ""
    });
    return { exito: true };
}

async function buscarConsignacionesPendientes(cliente, itemPedido) {
    const snap = await db.collection("consignments").orderBy("createdAt", "asc").get();
    const clienteBuscar = normalizarParaComparar(cliente);
    const pBuscar = normalizarParaComparar(itemPedido.producto);
    const vBuscar = normalizarParaComparar(itemPedido.variante);
    let restante = itemPedido.cantidad;
    let encontro = false;
    let disponible = 0;
    const consumos = [];
    for (const docSnap of snap.docs) {
        if (restante <= 0) break;
        const entry = { id: docSnap.id, ref: docSnap.ref, ...docSnap.data() };
        const pending = Number(entry.quantityPending) || 0;
        if (pending <= 0) continue;
        const matchCliente = esParecido(clienteBuscar, normalizarParaComparar(entry.clientName)) || esParecido(normalizarParaComparar(entry.clientName), clienteBuscar);
        const matchProd = esParecido(pBuscar, normalizarParaComparar(entry.productName));
        const matchVar = esParecido(vBuscar, normalizarParaComparar(entry.variant));
        if (matchCliente && matchProd && matchVar) {
            encontro = true;
            disponible += pending;
            const take = Math.min(pending, restante);
            consumos.push({ entry, quantity: take });
            restante -= take;
        }
    }
    if (!encontro) return { exito: false, error_msg: `⚠️ No encontré consignación activa para *${cliente}* con *${itemPedido.producto}* (${itemPedido.variante}).` };
    if (restante > 0) return { exito: false, error_msg: `🛑 Consignación insuficiente. Pendiente disponible: ${disponible}, pedido: ${itemPedido.cantidad}.` };
    return { exito: true, consumos };
}

async function procesarConsignacionPagoItem(cliente, itemPedido, fechaManual, vendedor, ticketIdPago, tipoCliente) {
    const buscado = await buscarConsignacionesPendientes(cliente, itemPedido);
    if (!buscado.exito) return buscado;
    let total = 0;
    let fechaFinalVenta = new Date().toISOString();
    if (fechaManual && String(fechaManual).trim().toLowerCase() !== "hoy") {
        const partesF = String(fechaManual).split(/[\/\-]/);
        if (partesF.length >= 2) {
            const dia = parseInt(partesF[0]); const mes = parseInt(partesF[1]) - 1; const anio = partesF[2] ? parseInt(partesF[2]) : new Date().getFullYear();
            const fechaCustom = new Date(anio, mes, dia, 12, 0, 0);
            if (!isNaN(fechaCustom.getTime())) fechaFinalVenta = fechaCustom.toISOString();
        }
    }
    for (const c of buscado.consumos) {
        const entry = c.entry;
        const unitPrice = itemPedido.precio && itemPedido.precio > 0 ? itemPedido.precio : (Number(entry.unitPrice) || 0);
        const subtotal = unitPrice * c.quantity;
        total += subtotal;
        await db.collection("sales").add({
            ticketId: ticketIdPago, createdAt: new Date().toISOString(), date: fechaFinalVenta,
            batchId: entry.batchId, batchName: entry.batchName, itemId: entry.itemId, productName: entry.productName, variant: entry.variant,
            quantity: c.quantity, unitPrice, totalSaleRaw: subtotal, costArsAtSale: Number(entry.unitCost) || 0, shippingCostArs: 0,
            source: "Consignación", consignmentId: entry.id, consignmentClient: cliente, isReseller: true, isNewClient: tipoCliente || "Frecuente", seller: vendedor || "028 Import"
        });
        const pending = Math.max(0, (Number(entry.quantityPending) || 0) - c.quantity);
        await entry.ref.update({ quantityPending: pending, quantityPaid: (Number(entry.quantityPaid) || 0) + c.quantity, status: pending <= 0 ? "closed" : "active", updatedAt: new Date().toISOString(), lastPaidAt: new Date().toISOString() });
    }
    return { exito: true, total };
}

async function procesarConsignacionDevolucionItem(cliente, itemPedido, nota) {
    const buscado = await buscarConsignacionesPendientes(cliente, itemPedido);
    if (!buscado.exito) return buscado;
    const returnsByBatch = {};
    for (const c of buscado.consumos) {
        const entry = c.entry;
        const pending = Math.max(0, (Number(entry.quantityPending) || 0) - c.quantity);
        await entry.ref.update({ quantityPending: pending, quantityReturned: (Number(entry.quantityReturned) || 0) + c.quantity, status: pending <= 0 ? "closed" : "active", updatedAt: new Date().toISOString(), returnNote: nota || "" });
        if (entry.batchId && entry.itemId) {
            if (!returnsByBatch[entry.batchId]) returnsByBatch[entry.batchId] = {};
            returnsByBatch[entry.batchId][entry.itemId] = (returnsByBatch[entry.batchId][entry.itemId] || 0) + c.quantity;
        }
    }
    for (const batchId of Object.keys(returnsByBatch)) {
        const batchDoc = await db.collection("batches").doc(batchId).get();
        if (!batchDoc.exists) continue;
        const batchData = batchDoc.data();
        const returns = returnsByBatch[batchId];
        const newItems = (batchData.items || []).map(item => ({ ...item, currentStock: (Number(item.currentStock) || 0) + (Number(returns[item.id]) || 0) }));
        await batchDoc.ref.update({ items: newItems, finalizedAt: admin.firestore.FieldValue.delete() });
    }
    return { exito: true };
}

async function procesarConsignacionPerdidoItem(cliente, itemPedido, nota) {
    const buscado = await buscarConsignacionesPendientes(cliente, itemPedido);
    if (!buscado.exito) return buscado;
    for (const c of buscado.consumos) {
        const entry = c.entry;
        const pending = Math.max(0, (Number(entry.quantityPending) || 0) - c.quantity);
        await entry.ref.update({ quantityPending: pending, quantityLost: (Number(entry.quantityLost) || 0) + c.quantity, status: pending <= 0 ? "closed" : "active", updatedAt: new Date().toISOString(), lostNote: nota || "" });
    }
    return { exito: true };
}

// ==========================================
// RESÚMENES AUTOMÁTICOS
// ==========================================

exports.resumenDiario = onSchedule({
    schedule: "50 23 * * *",
    timeZone: "America/Argentina/Buenos_Aires"
}, async (event) => {
    const ahoraAR = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Argentina/Buenos_Aires"}));
    const inicioHoyAR = new Date(ahoraAR);
    inicioHoyAR.setHours(0,0,0,0);

    const ventasSnapshot = await db.collection("sales")
        .where("createdAt", ">=", inicioHoyAR.toISOString())
        .get();

    let totalPlata = 0;
    let resumenText = `📊 *RESUMEN DIARIO (${inicioHoyAR.toLocaleDateString('es-AR')})*\n\n`;

    if (ventasSnapshot.empty) {
        resumenText += "No hubo ventas registradas hoy.";
    } else {
        ventasSnapshot.forEach(doc => {
            const v = doc.data();
            
            // Lógica para que en el WhatsApp no te ponga [028 Import] a cada rato, pero sí ponga [Buono]
            let nomVend = v.seller || "028 Import";
            if (nomVend.toUpperCase() === "B") nomVend = "Buono"; // Por si quedó alguno viejo
            const etiquetaVendedor = (nomVend !== "028 Import" && nomVend.toLowerCase() !== "marcos") ? `[${nomVend}] ` : "";
            
            resumenText += `• ${etiquetaVendedor}${v.quantity}x ${v.productName} (${v.variant}) - $${v.totalSaleRaw}\n`;
            totalPlata += (v.totalSaleRaw || 0);
        });
        resumenText += `\n💰 *TOTAL DEL DÍA: $${totalPlata}*`;
    }

    let numeroParaMeta = ADMIN_NUMBER;
    if (numeroParaMeta.startsWith("549") && numeroParaMeta.length === 13) {
        numeroParaMeta = numeroParaMeta.replace(/^549/, "54");
    }
    await enviarMensajeWhatsApp(numeroParaMeta, resumenText);
});

exports.resumenSemanal = onSchedule({
    schedule: "59 23 * * 0",
    timeZone: "America/Argentina/Buenos_Aires"
}, async (event) => {
    const ahoraAR = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Argentina/Buenos_Aires"}));
    const haceSieteDias = new Date(ahoraAR);
    haceSieteDias.setDate(haceSieteDias.getDate() - 7);
    haceSieteDias.setHours(0,0,0,0);
    
    const ventasSnapshot = await db.collection("sales")
        .where("createdAt", ">=", haceSieteDias.toISOString())
        .get();

    let totalSemana = 0;
    let cantidadVentas = 0;

    ventasSnapshot.forEach(doc => {
        totalSemana += (doc.data().totalSaleRaw || 0);
        cantidadVentas++;
    });

    const msg = `📅 *RESUMEN SEMANAL (Cierre Domingo)*\n\n` +
                `✅ Ventas procesadas: *${cantidadVentas}*\n` +
                `💰 Total acumulado: *$${totalSemana}*\n\n` +
                `¡Buen comienzo de semana para el equipo de 028! 🚀`;
    
    let numeroParaMeta = ADMIN_NUMBER;
    if (numeroParaMeta.startsWith("549") && numeroParaMeta.length === 13) {
        numeroParaMeta = numeroParaMeta.replace(/^549/, "54");
    }
    await enviarMensajeWhatsApp(numeroParaMeta, msg);
});

// ==========================================
// FUNCIÓN PROCESAR STOCK NEUTRO
// ==========================================
async function procesarStockNeutro(userProducto, userVariante, cantARestar, precioUnitario, motivoNeutro, notaNeutra, vendedor) {
    if (isNaN(cantARestar) || cantARestar <= 0) return { exito: false, error_msg: "❌ La cantidad ingresada no es válida." };

    const pBuscar = normalizarParaComparar(userProducto);
    const vBuscar = normalizarParaComparar(userVariante);

    const batchesRef = db.collection("batches");
    const snapshot = await batchesRef.orderBy("createdAt", "asc").get();

    let restante = cantARestar;
    let itemsActualizados = false;

    let productoEncontrado = false;
    let stockInsuficiente = false;
    let stockMascercanoDisponible = 0;

    let batchNameOficial = "Stock neutro por WhatsApp";
    let batchIdOficial = null;
    let itemIdOficial = null;
    let nombreOficial = userProducto;
    let varianteOficial = userVariante;
    let costoUnitarioOficial = 0;

    for (const doc of snapshot.docs) {
        if (restante <= 0) break;
        const batchData = doc.data();

        if (batchData.finalizedAt) continue;

        let items = batchData.items || [];
        let batchModificado = false;

        for (let i = 0; i < items.length; i++) {
            if (restante <= 0) break;
            let item = items[i];

            const dbProd = normalizarParaComparar(item.product);
            const dbVar = normalizarParaComparar(item.variant);

            const productMatches = esParecido(pBuscar, dbProd);
            const variantMatches = esParecido(vBuscar, dbVar);

            if (productMatches && variantMatches) {
                productoEncontrado = true;
                stockMascercanoDisponible = item.currentStock;

                if (item.currentStock >= restante) {
                    let cantidadADescontar = Math.min(item.currentStock, restante);

                    item.currentStock -= cantidadADescontar;
                    restante -= cantidadADescontar;

                    batchModificado = true;
                    itemsActualizados = true;

                    batchNameOficial = batchData.name || "Stock neutro por WhatsApp";
                    batchIdOficial = doc.id;
                    itemIdOficial = item.id;
                    nombreOficial = item.product || userProducto;
                    varianteOficial = item.variant || userVariante;
                    costoUnitarioOficial = item.costArs || 0;
                } else {
                    stockInsuficiente = true;
                }
            }
        }

        if (batchModificado) await doc.ref.update({ items: items });
    }

    if (itemsActualizados) {
        const fechaCreacionReal = new Date().toISOString();
        const totalVentaCalculado = (precioUnitario || 0) * cantARestar;
        const totalCostoCalculado = (costoUnitarioOficial || 0) * cantARestar;
        const gananciaCalculada = totalVentaCalculado - totalCostoCalculado;

        await db.collection("neutral_stock").add({
            createdAt: fechaCreacionReal,
            accountingType: "neutral",
            reason: motivoNeutro || "Stock perdido",
            note: notaNeutra || "",
            batchId: batchIdOficial,
            batchName: batchNameOficial,
            itemId: itemIdOficial,
            productName: nombreOficial,
            variant: varianteOficial,
            quantity: cantARestar,
            unitPrice: precioUnitario || 0,
            costArsAtEntry: costoUnitarioOficial,
            totalSaleRaw: totalVentaCalculado,
            totalCostRaw: totalCostoCalculado,
            grossProfitRaw: gananciaCalculada,
            source: "Whatsapp",
            seller: vendedor || "028 Import"
        });

        return { exito: true };
    } 
    else {
        if (!productoEncontrado) {
            return { exito: false, error_msg: `⚠️ *Error de Inventario NEUTRO:*\nEl producto *"${userProducto}"* (Variante: ${userVariante || 'Única'}) no existe o está mal escrito.` };
        } else if (stockInsuficiente) {
            return { exito: false, error_msg: `🛑 *Stock insuficiente NEUTRO:*\nProducto: *${userProducto}*\nModelo: *${userVariante || 'Único'}*\nPediste: *${cantARestar}*\nDisponible: *${stockMascercanoDisponible}*` };
        } else {
            return { exito: false, error_msg: `⚠️ *Error desconocido* al procesar el stock neutro.` };
        }
    }
}


// ==========================================
// FUNCIÓN PROCESAR VENTA
// ==========================================
async function procesarVenta(userProducto, userVariante, cantARestar, precioUnitario, fechaManual, costoEnvioMio, precioEnvioCliente, esRevendedor, esNuevo, vendedor, ticketIdManual = null, source = "Whatsapp") {
    if (isNaN(cantARestar) || cantARestar <= 0) return { exito: false, error_msg: "❌ La cantidad ingresada no es válida." };

    const pBuscar = normalizarParaComparar(userProducto);
    const vBuscar = normalizarParaComparar(userVariante);

    let fechaFinalVenta = new Date().toISOString();
    if (fechaManual && String(fechaManual).trim().toLowerCase() !== "hoy") {
        const partesF = String(fechaManual).split(/[\/\-]/); 
        if (partesF.length >= 2) {
            const dia = parseInt(partesF[0]);
            const mes = parseInt(partesF[1]) - 1;
            const anio = partesF[2] ? parseInt(partesF[2]) : new Date().getFullYear();
            const fechaCustom = new Date(anio, mes, dia, 12, 0, 0); 
            if (!isNaN(fechaCustom.getTime())) fechaFinalVenta = fechaCustom.toISOString();
        }
    }

    const batchesRef = db.collection("batches");
    const snapshot = await batchesRef.orderBy("createdAt", "asc").get(); 

    let restante = cantARestar;
    let itemsActualizados = false;
    
    let productoEncontrado = false;
    let stockInsuficiente = false;
    let stockMascercanoDisponible = 0;
    
    let batchNameOficial = "Venta por WhatsApp";
    let batchIdOficial = null; 
    let itemIdOficial = null;
    let nombreOficial = userProducto; 
    let varianteOficial = userVariante;
    let costoUnitarioOficial = 0; 

    for (const doc of snapshot.docs) {
        if (restante <= 0) break;
        const batchData = doc.data();

        if (batchData.finalizedAt) continue; 

        let items = batchData.items || [];
        let batchModificado = false;

        for (let i = 0; i < items.length; i++) {
            if (restante <= 0) break;
            let item = items[i];
            
            const dbProd = normalizarParaComparar(item.product);
            const dbVar = normalizarParaComparar(item.variant);

            const productMatches = esParecido(pBuscar, dbProd);
            const variantMatches = esParecido(vBuscar, dbVar);

            if (productMatches && variantMatches) {
                productoEncontrado = true;
                stockMascercanoDisponible = item.currentStock;

                if (item.currentStock >= restante) {
                    let cantidadADescontar = Math.min(item.currentStock, restante);
                    
                    item.currentStock -= cantidadADescontar;
                    restante -= cantidadADescontar;
                    
                    batchModificado = true;
                    itemsActualizados = true;
                    
                    batchNameOficial = batchData.name || "Venta por WhatsApp";
                    batchIdOficial = doc.id; 
                    itemIdOficial = item.id; 
                    nombreOficial = item.product || userProducto; 
                    varianteOficial = item.variant || userVariante; 
                    costoUnitarioOficial = item.costArs || 0; 
                } else {
                    stockInsuficiente = true;
                }
            }
        }
        if (batchModificado) await doc.ref.update({ items: items });
    }

    if (itemsActualizados) {
        const totalVentaCalculado = (precioUnitario * cantARestar) + precioEnvioCliente;
        const ticketIdGenerado = ticketIdManual || Date.now().toString(); 
        const fechaCreacionReal = new Date().toISOString(); 

        await db.collection("sales").add({
            batchId: batchIdOficial, 
            batchName: batchNameOficial,
            costArsAtSale: costoUnitarioOficial, 
            createdAt: fechaCreacionReal,   
            date: fechaFinalVenta,
            isReseller: esRevendedor,
            isNewClient: esNuevo,       
            itemId: itemIdOficial,   
            productName: nombreOficial, 
            quantity: cantARestar,
            shippingCostArs: costoEnvioMio, 
            source: source || "Whatsapp",
            ticketId: ticketIdGenerado,     
            totalSaleRaw: totalVentaCalculado, 
            unitPrice: precioUnitario,
            variant: varianteOficial,
            seller: vendedor // 👈 Guarda correctamente "028 Import" o "Buono"
        });

        return { exito: true };
    } 
    else {
        if (!productoEncontrado) {
            return { exito: false, error_msg: `⚠️ *Error de Inventario:*\nEl producto *"${userProducto}"* (Variante: ${userVariante || 'Única'}) no existe o está mal escrito.` };
        } else if (stockInsuficiente) {
            return { exito: false, error_msg: `🛑 *Stock insuficiente:*\nProducto: *${userProducto}*\nModelo: *${userVariante || 'Único'}*\nPediste: *${cantARestar}*\nDisponible: *${stockMascercanoDisponible}*` };
        } else {
            return { exito: false, error_msg: `⚠️ *Error desconocido* al procesar la venta.` };
        }
    }
}

// ==========================================
// FÓRMULAS MATEMÁTICAS INTACTAS
// ==========================================

function distanciaLevenshtein(a, b) {
    const matriz = [];
    for (let i = 0; i <= b.length; i++) { matriz[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matriz[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matriz[i][j] = matriz[i - 1][j - 1];
            } else {
                matriz[i][j] = Math.min(
                    matriz[i - 1][j - 1] + 1, 
                    Math.min(matriz[i][j - 1] + 1, matriz[i - 1][j] + 1)
                );
            }
        }
    }
    return matriz[b.length][a.length];
}

function calcularSimilitud(str1, str2) {
    let masLarga = str1.length > str2.length ? str1 : str2;
    let masCorta = str1.length > str2.length ? str2 : str1;
    let longitudMax = masLarga.length;
    if (longitudMax === 0) return 1.0;
    return (longitudMax - distanciaLevenshtein(masLarga, masCorta)) / parseFloat(longitudMax);
}

function esParecido(usuarioTexto, bdTexto) {
    if (bdTexto.includes(usuarioTexto)) return true;

    const palabrasUsuario = usuarioTexto.split(" ").filter(p => p.length > 0);
    const palabrasBD = bdTexto.split(" ").filter(p => p.length > 0);

    if (palabrasUsuario.length === 0) return false;

    for (let pUser of palabrasUsuario) {
        let encontroParecida = false;
        for (let pBD of palabrasBD) {
            if (pUser.length <= 2) {
                if (pUser === pBD) { encontroParecida = true; break; }
            } else {
                if (calcularSimilitud(pUser, pBD) >= 0.75) { 
                    encontroParecida = true; 
                    break; 
                }
            }
        }
        if (!encontroParecida) return false;
    }
    return true;
}