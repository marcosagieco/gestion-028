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

                const lineas = textoOriginal.split('\n');

                for (const linea of lineas) {
                    if (linea.trim() === "") continue;

                    const partes = linea.split("|").map(t => t.trim());

                    if (partes.length >= 5 && partes[0].toUpperCase() === "VENTA") {
                        console.log("✅ Formato VENTA detectado. Procesando...");
                        
                        // LÓGICA NUEVA: Identificador de vendedor mejorado
                        let vendedor = "028 Import"; // Ahora el default es 028 Import
                        let indexOffset = 0;

                        // Si la segunda palabra tiene 1 o 2 letras, es el vendedor
                        if (partes[1] && partes[1].length <= 2) {
                            let letra = partes[1].toUpperCase();
                            if (letra === "B") {
                                vendedor = "Buono"; // Convertimos la B en Buono
                            } else {
                                vendedor = letra; // Si es otra letra, la deja
                            }
                            indexOffset = 1;
                        }

                        const productoRaw = String(partes[1 + indexOffset] || "");
                        const varianteRaw = String(partes[2 + indexOffset] || "");
                        const cantidad = parseInt(partes[3 + indexOffset]) || 1;
                        
                        const limpiarNum = (texto) => parseFloat(String(texto).replace(/[^0-9,-]+/g,"").replace(",", ".")) || 0;
                        const precioUnitario = limpiarNum(partes[4 + indexOffset]);
                        
                        let fechaManual = "hoy"; 
                        let costoEnvioMio = 0;
                        let precioEnvioCliente = 0;
                        let esRevendedor = false;
                        let esNuevo = false;
                        let numerosEncontrados = 0;

                        for (let i = 5 + indexOffset; i < partes.length; i++) {
                            let dato = String(partes[i]).trim();
                            let datoUpper = dato.toUpperCase();

                            if (datoUpper === "") continue;

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

                        console.log(`Buscando producto: ${productoRaw} | Variante: ${varianteRaw} | Cantidad: ${cantidad} | Vendedor: ${vendedor}`);
                        
                        const resultado = await procesarVenta(productoRaw, varianteRaw, cantidad, precioUnitario, fechaManual, costoEnvioMio, precioEnvioCliente, esRevendedor, esNuevo, vendedor);
                        
                        let numeroParaMeta = numeroRemitente;
                        if (numeroParaMeta.startsWith("549") && numeroParaMeta.length === 13) {
                            numeroParaMeta = numeroParaMeta.replace(/^549/, "54");
                        }

                        if (resultado && resultado.exito === false) {
                            console.log("⚠️ Error procesando la venta. Avisando...");
                            await enviarMensajeWhatsApp(numeroParaMeta, resultado.error_msg);
                            await registrarEnSheet("Intentos", [fechaHoySheet, numeroRemitente, linea, resultado.error_msg]);
                        } else {
                            console.log("✅ Venta anotada con éxito.");
                            await registrarEnSheet("Ventas", [fechaHoySheet, numeroRemitente, productoRaw, varianteRaw, cantidad, precioUnitario, `ÉXITO (${vendedor})`]);
                        }
                    } else {
                        console.log("❌ El mensaje no cumple el formato VENTA");
                        let numFallo = numeroRemitente.startsWith("549") ? numeroRemitente.replace(/^549/, "54") : numeroRemitente;
                        await registrarEnSheet("Intentos", [fechaHoySheet, numFallo, linea, "Formato Incorrecto"]);
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
// FUNCIÓN PROCESAR VENTA
// ==========================================
async function procesarVenta(userProducto, userVariante, cantARestar, precioUnitario, fechaManual, costoEnvioMio, precioEnvioCliente, esRevendedor, esNuevo, vendedor) {
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
        const ticketIdGenerado = Date.now().toString(); 
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
            source: "Whatsapp",
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
            return { exito: false, error_msg: `🛑 *Stock Insuficiente:*\nIntentaste vender ${cantARestar} unidades de *"${userProducto}"*, pero solo quedan *${stockMascercanoDisponible}* en stock.` };
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