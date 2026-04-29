const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

const VERIFY_TOKEN = "028_Import_Master_2026";

// 👇 TUS DATOS REALES DE META 👇
const META_TOKEN = "EAANhs8CZCMhUBRfllbvBZCzHH83H31sZCZC6ISpFo1ylsq3XOTEQXZCd1dIyUPXVHNjCfNDmG4Jnrnk4G7U9kBTsFdhkOs7WUiVrchrLLomAZAy4ydcSrNhlbzPTbVlMDpxZAVfKBj4uePi2xFjYuPW1hLAKcAlr98EHPkKWDS2TaFlb1TKVxmFDCvmkzNqZCmCZC1wZDZD";
const PHONE_ID = "984636221409591";

const https = require('https');

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

// Función para limpiar textos (quita emojis, tildes y símbolos)
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
                // REEMPLAZALO POR ESTO (El parche argentino 🇦🇷):
const textoOriginal = msg.text.body;
let numeroRemitente = msg.from;

// Si el número es de Argentina y Meta se comió el 9, se lo ponemos a la fuerza
if (numeroRemitente.startsWith("54") && numeroRemitente.length === 12) {
    numeroRemitente = numeroRemitente.replace(/^54/, "549");
    console.log(`🔧 Corrigiendo número argentino a: ${numeroRemitente}`);
} else if (numeroRemitente.startsWith("549") && numeroRemitente.length === 13) {
    // A veces Meta lo pide sin el 9, si te tira error de vuelta, 
    // invertimos esta lógica sacándole el 9.
}

                console.log(`📩 Mensaje recibido de ${numeroRemitente}: ${textoOriginal}`);

                const lineas = textoOriginal.split('\n');

                for (const linea of lineas) {
                    if (linea.trim() === "") continue;

                    const partes = linea.split("|").map(t => t.trim());

                    if (partes.length >= 5 && partes[0].toUpperCase() === "VENTA") {
                        console.log("✅ Formato VENTA detectado. Procesando...");
                        
                        const productoRaw = String(partes[1] || "");
                        const varianteRaw = String(partes[2] || "");
                        const cantidad = parseInt(partes[3]) || 1;
                        
                        const limpiarNum = (texto) => parseFloat(String(texto).replace(/[^0-9,-]+/g,"").replace(",", ".")) || 0;
                        const precioUnitario = limpiarNum(partes[4]);
                        
                        let fechaManual = "hoy"; 
                        let costoEnvioMio = 0;
                        let precioEnvioCliente = 0;
                        let esRevendedor = false;
                        let esNuevo = false;
                        let numerosEncontrados = 0;

                        for (let i = 5; i < partes.length; i++) {
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

                        console.log(`Buscando producto: ${productoRaw} | Variante: ${varianteRaw} | Cantidad: ${cantidad}`);
                        
                        const resultado = await procesarVenta(productoRaw, varianteRaw, cantidad, precioUnitario, fechaManual, costoEnvioMio, precioEnvioCliente, esRevendedor, esNuevo);
                        
                        console.log("Resultado de la búsqueda:", resultado);

                        if (resultado && resultado.exito === false) {
    console.log("⚠️ Stock insuficiente o producto no encontrado. Disparando aviso a WhatsApp...");
    
    // 🇦🇷 EL PARCHE ARGENTINO DEFINITIVO: Le amputamos el 9 a la fuerza
    let numeroParaMeta = numeroRemitente;
    if (numeroParaMeta.startsWith("549") && numeroParaMeta.length === 13) {
        numeroParaMeta = numeroParaMeta.replace(/^549/, "54");
        console.log(`🔧 Meta odia el 9. Forzando envío a: ${numeroParaMeta}`);
    }

    await enviarMensajeWhatsApp(numeroParaMeta, resultado.error_msg);
} else {
    console.log("✅ Venta anotada con éxito. No se requiere aviso.");
}
                    } else {
                        console.log("❌ El mensaje no cumple el formato VENTA | Producto | Variante | Cantidad | Precio");
                    }
                }
            }
        } catch (error) {
            console.error("❌ Error crítico en el bot:", error);
        }
        return res.sendStatus(200);
    }
});

async function procesarVenta(userProducto, userVariante, cantARestar, precioUnitario, fechaManual, costoEnvioMio, precioEnvioCliente, esRevendedor, esNuevo) {
    if (isNaN(cantARestar) || cantARestar <= 0) return { exito: false, error_msg: "❌ La cantidad ingresada no es válida." };

    const pBuscar = normalizarParaComparar(userProducto);
    const vBuscar = normalizarParaComparar(userVariante);

    // Lógica de fechas
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
    
    // Variables de validación para responderte
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

        if (batchData.finalizedAt) {
            continue; 
        }

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
                stockMascercanoDisponible = item.currentStock; // Guardamos cuánto queda para avisarte si te quedás corto

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

    // SI TODO SALIÓ BIEN Y SE DESCONTÓ EL STOCK
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
            variant: varianteOficial    
        });

        return { exito: true };
    } 
    // SI NO SE ENCONTRÓ EL PRODUCTO O NO HAY STOCK, DEVOLVEMOS EL ERROR
    else {
        if (!productoEncontrado) {
            return { exito: false, error_msg: `⚠️ *Error de Inventario:*\nEl producto *"${userProducto}"* (Variante: ${userVariante || 'Única'}) no existe en ninguna de tus carpetas activas o está mal escrito.` };
        } else if (stockInsuficiente) {
            return { exito: false, error_msg: `🛑 *Stock Insuficiente:*\nIntentaste vender ${cantARestar} unidades de *"${userProducto}"*, pero solo te quedan *${stockMascercanoDisponible}* en stock.` };
        } else {
            return { exito: false, error_msg: `⚠️ *Error desconocido* al intentar procesar la venta de ${userProducto}.` };
        }
    }
}

// === FÓRMULAS MATEMÁTICAS PARA ERRORES DE TIPEO (LEVENSHTEIN) ===

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