const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

const VERIFY_TOKEN = "028_Import_Master_2026";

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
                const textoOriginal = msg.text.body;

                const lineas = textoOriginal.split('\n');

                for (const linea of lineas) {
                    if (linea.trim() === "") continue;

                    const partes = linea.split("|").map(t => t.trim());

                    if (partes.length >= 5 && partes[0].toUpperCase() === "VENTA") {
                        const productoRaw = String(partes[1] || "");
                        const varianteRaw = String(partes[2] || "");
                        const cantidad = parseInt(partes[3]) || 1;
                        
                        const limpiarNum = (texto) => parseFloat(String(texto).replace(/[^0-9,-]+/g,"").replace(",", ".")) || 0;
                        
                        const precioUnitario = limpiarNum(partes[4]);
                        const fechaManual = partes[5];
                        const costoEnvioMio = limpiarNum(partes[6]);
                        const precioEnvioCliente = limpiarNum(partes[7]);
                        
                        // NUEVO: Verificamos si es revendedor (SI, REV, TRUE son válidos)
                        const revStr = String(partes[8] || "").toLowerCase();
                        const esRevendedor = (revStr === "si" || revStr === "rev" || revStr === "true");

                        await procesarVenta(productoRaw, varianteRaw, cantidad, precioUnitario, fechaManual, costoEnvioMio, precioEnvioCliente, esRevendedor);
                    }
                }
            }
        } catch (error) {
            console.error("Error crítico en el bot:", error);
        }
        return res.sendStatus(200);
    }
});

async function procesarVenta(userProducto, userVariante, cantARestar, precioUnitario, fechaManual, costoEnvioMio, precioEnvioCliente, esRevendedor) {
    if (isNaN(cantARestar) || cantARestar <= 0) return;

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
    
    let batchNameOficial = "Venta por WhatsApp";
    let batchIdOficial = null; 
    let itemIdOficial = null;
    let nombreOficial = userProducto; 
    let varianteOficial = userVariante;
    let costoUnitarioOficial = 0; 

    for (const doc of snapshot.docs) {
        if (restante <= 0) break;
        const batchData = doc.data();

        // Filtro de lotes archivados
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

            // Buscador con tolerancia a errores (Levenshtein)
            const productMatches = esParecido(pBuscar, dbProd);
            const variantMatches = esParecido(vBuscar, dbVar);

            if (productMatches && variantMatches && item.currentStock > 0) {
                let cantidadADescontar = Math.min(item.currentStock, restante);
                
                item.currentStock -= cantidadADescontar;
                restante -= cantidadADescontar;
                
                batchModificado = true;
                itemsActualizados = true;
                
                batchNameOficial = batchData.batchName || "Venta por WhatsApp";
                batchIdOficial = doc.id; 
                itemIdOficial = item.id; 
                nombreOficial = item.product || userProducto; 
                varianteOficial = item.variant || userVariante; 
                
                costoUnitarioOficial = item.costArs || 0; 
            }
        }
        if (batchModificado) await doc.ref.update({ items: items });
    }

    if (itemsActualizados) {
        // CÁLCULO: (Precio Unitario * Cantidad Total) + Lo que pagó el cliente de envío
        const totalVentaCalculado = (precioUnitario * cantARestar) + precioEnvioCliente;
        const ticketIdGenerado = Date.now().toString(); 
        const fechaCreacionReal = new Date().toISOString(); 

        await db.collection("sales").add({
            batchId: batchIdOficial, 
            batchName: batchNameOficial,
            costArsAtSale: costoUnitarioOficial, 
            createdAt: fechaCreacionReal,   
            date: fechaFinalVenta,
            isReseller: esRevendedor,   // <--- AHORA USA EL DATO DEL MENSAJE
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