const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

// CONFIGURACIÓN DE META
const WA_TOKEN = "EAANhs8CZCMhUBRBNo7EJ6PquMZAYD7JgOFIYTtrRKMZBv3p35qS1bJPk0YMEIQX46vJdd4jkZAZBSyWRl70ZB9ASnYFFZBrLS4qh7XkNE0v8zR8mfZBdY1FS5R6ZANNgQdcZCdJRhXUC3VZAbeaAJkRP08J71DDRLjV8cD1xhrBAL56uLEhrxG1J5lH1wok39syuDlC0IZAME2UEekZCaaTjjK5Hyv5fZCCGlI4YswbHUYwYC3LkOF4NCCPDCd6b7HiMlDIiuEZA3Qe2sbXo0FTZBnoTFSKaKZCcA";
const VERIFY_TOKEN = "028_Import_Master_2026";

exports.webhook = functions.https.onRequest(async (req, res) => {
    // 1. Verificación para Meta
    if (req.method === "GET") {
        if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
            return res.status(200).send(req.query["hub.challenge"]);
        }
        return res.status(403).send("Error de verificación");
    }

    // 2. Procesar el mensaje de WhatsApp
    if (req.method === "POST") {
        const body = req.body;
        if (body.object === "whatsapp_business_account" && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            const msg = body.entry[0].changes[0].value.messages[0];
            const textoOriginal = msg.text.body;

            const partes = textoOriginal.split("|").map(t => t.trim());

            // Formato esperado de 5 partes: VENTA | PRODUCTO | VARIANTE | CANTIDAD | PRECIO
            if (partes.length >= 5 && partes[0].toUpperCase() === "VENTA") {
                const producto = partes[1];
                const variante = partes[2];
                const cantidad = parseInt(partes[3]);
                const precio = parseFloat(partes[4]); // Cambiado a parseFloat por si hay decimales

                await procesarVenta(producto, variante, cantidad, precio);
            }
        }
        return res.sendStatus(200);
    }
});

async function procesarVenta(nombreProd, varianteProd, cantARestar, precio) {
    if (isNaN(cantARestar) || cantARestar <= 0) return;

    // Buscar en TODOS los documentos de 'batches' (ya que no se puede hacer query directo en arrays)
    const batchesRef = db.collection("batches");
    const snapshot = await batchesRef.orderBy("createdAt", "asc").get(); // Ordenamos por fecha de creación del batch

    let restante = cantARestar;
    let itemsActualizados = false;
    let batchNameUtilizado = "Venta por WhatsApp";

    for (const doc of snapshot.docs) {
        if (restante <= 0) break;
        const batchData = doc.data();
        let items = batchData.items || [];
        let batchModificado = false;

        // Recorrer los items dentro del batch
        for (let i = 0; i < items.length; i++) {
            if (restante <= 0) break;
            
            let item = items[i];
            
            // Comprobación EXACTA ignorando mayúsculas y espacios extra para evitar errores tontos
            const productMatches = item.product && item.product.trim().toLowerCase() === nombreProd.trim().toLowerCase();
            const variantMatches = item.variant && item.variant.trim().toLowerCase() === varianteProd.trim().toLowerCase();

            if (productMatches && variantMatches && item.currentStock > 0) {
                if (item.currentStock >= restante) {
                    item.currentStock -= restante;
                    restante = 0;
                } else {
                    restante -= item.currentStock;
                    item.currentStock = 0;
                }
                batchModificado = true;
                itemsActualizados = true;
                batchNameUtilizado = batchData.batchName || "Venta por WhatsApp"; // Guardamos el nombre del batch para el registro
            }
        }

        // Si se modificó algún item en este batch, lo actualizamos en Firestore
        if (batchModificado) {
            await doc.ref.update({ items: items });
        }
    }

    // Registrar la venta en 'sales' (NO en 'ventas', basándonos en tu captura de sales)
    if (itemsActualizados) {
        await db.collection("sales").add({
            batchName: batchNameUtilizado,
            costArsAtSale: 0, // No tenemos este dato desde WhatsApp
            date: new Date().toISOString(), // Formato ISO usado en tu base de datos
            isReseller: false, // Asumimos false por defecto
            itemId: "generado-por-bot",
            productName: nombreProd,
            quantity: cantARestar,
            shippingCostArs: 0,
            source: "Whatsapp",
            totalSaleRaw: precio,
            unitPrice: precio / cantARestar,
            variant: varianteProd
        });
    } else {
        console.error(`ERROR: No se encontró stock para ${nombreProd} - ${varianteProd}`);
    }
}