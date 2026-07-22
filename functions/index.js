const functions = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler"); 
const admin = require("firebase-admin");
const { google } = require("googleapis"); 
admin.initializeApp();

const db = admin.firestore();

const { emitirFacturaC } = require('./facturacion');
const { generarFacturaPDFBuffer } = require('./generar-factura-pdf');
const crypto = require('crypto');

const STORAGE_BUCKET  = 'gestion-028.firebasestorage.app';
const SERVE_PDF_BASE  = 'https://us-central1-gestion-028.cloudfunctions.net/servePdf';

// ─── Subir PDF a Storage (solo guarda; la URL se sirve vía servePdf) ──────────
async function subirPDFStorage(pdfBuffer, filePath) {
    const bucket = admin.storage().bucket(STORAGE_BUCKET);
    const file   = bucket.file(filePath);
    await file.save(pdfBuffer, { contentType: 'application/pdf' });
}

// ─── Generar PDF + subir + guardar en colección facturas ─────────────────────
async function guardarFacturaConPDF({ ventaId, ptoVta, numero, fecha, fechaDisplay,
    cae, vencimientoCAE, vencCAEDisp, monto }) {

    const qrPayload = {
        ver: 1, fecha, cuit: 20484597953,
        ptoVta, tipoCmp: 11, nroCmp: numero, importe: monto,
        moneda: 'PES', ctz: 1, tipoDocRec: 99, nroDocRec: 0,
        tipoCodAut: 'E', codAut: parseInt(cae),
    };
    const qrUrl = 'https://www.afip.gob.ar/fe/qr/?p=' +
        Buffer.from(JSON.stringify(qrPayload)).toString('base64');

    const pdfBuffer = await generarFacturaPDFBuffer({
        ptoVta, numero, fecha, fechaDisplay,
        cae, vencCAEDisp,
        receptorNombre:  'Consumidor Final',
        tipoDoc:         99,
        nroDoc:          0,
        condIVAReceptor: 'Consumidor Final',
        items: [{ descripcion: 'Venta al contado', cantidad: 1, precioUnit: monto, subtotal: monto }],
        total: monto,
    });

    const [yy, mm]  = fecha.split('-');
    const pvStr     = String(ptoVta).padStart(5, '0');
    const nroStr    = String(numero).padStart(8, '0');
    const filePath  = `facturas/${yy}/${mm}/factura-c-${pvStr}-${nroStr}.pdf`;
    await subirPDFStorage(pdfBuffer, filePath);

    // URL permanente: servida por Cloud Function, nunca expira
    const pdfUrl = `${SERVE_PDF_BASE}?cae=${cae}`;

    const comprobanteFormateado = `${pvStr}-${nroStr}`;
    await db.collection('facturas').doc(cae).set({
        ventaId,
        fechaEmision:         fecha,
        tipoComprobante:      'Factura C',
        cbteTipo:             11,
        puntoVenta:           ptoVta,
        nroComprobante:       numero,
        comprobanteFormateado,
        importeTotal:         monto,
        cae,
        vencimientoCAE,
        receptorNombre:       'Consumidor Final',
        docTipo:              99,
        docNro:               0,
        qrUrl,
        pdfUrl,
        estado:               'emitida',
        createdAt:            new Date().toISOString(),
    });
    console.log(`✓ Factura guardada en Firestore: facturas/${cae}`);
}

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
        "telefono": "telefono", "teléfono": "telefono", "tel": "telefono", "celular": "telefono", "cel": "telefono", "whatsapp": "telefono", "numero": "telefono", "número": "telefono",
        "dni": "dni", "documento": "dni", "doc": "dni", "documento nacional": "dni",
        "tipo cliente": "tipoCliente", "cliente tipo": "tipoCliente", "estado cliente": "tipoCliente", "origen cliente": "tipoCliente",
        "canal": "canal", "origen": "canal",
        "fecha": "fecha", "dia": "fecha",
        "fecha limite": "fechaLimite", "limite": "fechaLimite", "vencimiento": "fechaLimite",
        "accion": "accion", "acción": "accion", "movimiento": "accion",
        "nota": "nota", "detalle": "nota", "obs": "nota", "observacion": "nota", "observación": "nota",
        "motivo": "motivo", "vendedor": "vendedor",
        "pago": "medioPago", "medio pago": "medioPago", "medio de pago": "medioPago",
        "metodo pago": "medioPago", "metodo de pago": "medioPago", "forma pago": "medioPago",
        "envio": "envioCobro", "envío": "envioCobro", "envio total": "envioCobro", "total envio": "envioCobro",
        "cobro envio": "envioCobro", "cobro de envio": "envioCobro", "cobro envío": "envioCobro",
        "envio cliente": "envioCobro", "shipping": "envioCobro",
        "costo envio": "envioCosto", "costo de envio": "envioCosto", "costo envío": "envioCosto",
        "mi costo envio": "envioCosto", "costo ship": "envioCosto"
    };
    return aliases[k] || k;
};

const normalizarMedioPago = (v) => {
    const n = normalizarParaComparar(String(v || ''));
    if (['alias1', 'a1', 'alias 1', '1'].includes(n)) return 'alias1';
    if (['alias2', 'a2', 'alias 2', '2'].includes(n)) return 'alias2';
    if (['alias3', 'a3', 'alias 3', '3'].includes(n)) return 'alias3';
    if (['efe', 'efectivo', 'cash', 'efectico'].includes(n)) return 'efectivo';
    return n || null;
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
    if (["revendedor", "revend", "rev", "distribuidor", "mayoreo", "reventa"].includes(v)) return "Revendedor";
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


// ─── Migrar TODAS las facturas emitidas → genera PDF + Firestore facturas ─────
// Idempotente: saltea las que ya existen en la colección facturas.
// POST /migrarTodasLasFacturas
exports.migrarTodasLasFacturas = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    // Leer todas las ventas con factura emitida
    const salesSnap = await db.collection('sales')
        .where('invoiceStatus', '==', 'emitida').get();

    if (salesSnap.empty) {
        return res.status(200).json({ ok: true, message: 'No hay ventas con factura emitida.' });
    }

    // Agrupar por CAE (puede haber múltiples sales por factura)
    const byCae = {};
    salesSnap.docs.forEach(doc => {
        const d = doc.data();
        if (!d.invoiceCAE) return;
        const cae = String(d.invoiceCAE);
        if (!byCae[cae]) {
            byCae[cae] = {
                cae,
                nroComprobante: d.invoiceNumber,
                fecha:          d.invoiceDate,   // YYYY-MM-DD
                monto:          0,
                ventaId:        doc.id,
            };
        }
        byCae[cae].monto += Number(d.totalSaleRaw) || 0;
    });

    const results = [];

    for (const [cae, data] of Object.entries(byCae)) {
        // Idempotencia: saltar si ya existe
        const existing = await db.collection('facturas').doc(cae).get();
        if (existing.exists) {
            results.push({ cae, nroComprobante: data.nroComprobante, status: 'ya_existe' });
            continue;
        }

        try {
            const fecha   = data.fecha;          // YYYY-MM-DD
            const [yy, mm, dd] = fecha.split('-');
            const fechaDisplay = `${dd}/${mm}/${yy}`;

            // ARCA da exactamente 10 días de vigencia al CAE
            const vencDate = new Date(`${fecha}T12:00:00`);
            vencDate.setDate(vencDate.getDate() + 10);
            const vencimientoCAE = vencDate.toISOString().slice(0, 10);
            const vd = vencimientoCAE.split('-');
            const vencCAEDisp = `${vd[2]}/${vd[1]}/${vd[0]}`;

            const ptoVta = 1;
            const monto  = data.monto;
            const numero = data.nroComprobante;

            const pdfBuffer = await generarFacturaPDFBuffer({
                ptoVta, numero, fecha, fechaDisplay,
                cae, vencCAEDisp,
                receptorNombre:  'Consumidor Final',
                tipoDoc:         99,
                nroDoc:          0,
                condIVAReceptor: 'Consumidor Final',
                items: [{ descripcion: 'Venta al contado', cantidad: 1, precioUnit: monto, subtotal: monto }],
                total: monto,
            });

            const pvStr    = String(ptoVta).padStart(5, '0');
            const nroStr   = String(numero).padStart(8, '0');
            const filePath = `facturas/${yy}/${mm}/factura-c-${pvStr}-${nroStr}.pdf`;
            await subirPDFStorage(pdfBuffer, filePath);
            const pdfUrl = `${SERVE_PDF_BASE}?cae=${cae}`;

            const qrPayload = {
                ver: 1, fecha, cuit: 20484597953,
                ptoVta, tipoCmp: 11, nroCmp: numero, importe: monto,
                moneda: 'PES', ctz: 1, tipoDocRec: 99, nroDocRec: 0,
                tipoCodAut: 'E', codAut: parseInt(cae),
            };
            const qrUrl = 'https://www.afip.gob.ar/fe/qr/?p=' +
                Buffer.from(JSON.stringify(qrPayload)).toString('base64');

            const comprobanteFormateado = `${pvStr}-${nroStr}`;

            await db.collection('facturas').doc(cae).set({
                ventaId:              data.ventaId,
                fechaEmision:         fecha,
                tipoComprobante:      'Factura C',
                cbteTipo:             11,
                puntoVenta:           ptoVta,
                nroComprobante:       numero,
                comprobanteFormateado,
                importeTotal:         monto,
                cae,
                vencimientoCAE,
                receptorNombre:       'Consumidor Final',
                docTipo:              99,
                docNro:               0,
                qrUrl,
                pdfUrl,
                estado:               'emitida',
                createdAt:            new Date().toISOString(),
            });

            console.log(`✓ Migrada: facturas/${cae} (Nro ${comprobanteFormateado})`);
            results.push({ cae, nroComprobante: comprobanteFormateado, monto, status: 'migrada' });

        } catch (e) {
            console.error(`❌ Error migrando CAE ${cae}:`, e.message);
            results.push({ cae, status: 'error', error: e.message });
        }
    }

    const migradas  = results.filter(r => r.status === 'migrada').length;
    const yaExisten = results.filter(r => r.status === 'ya_existe').length;
    const errores   = results.filter(r => r.status === 'error').length;

    return res.status(200).json({ ok: true, migradas, yaExisten, errores, results });
});

// ─── Migración única de factura ya emitida ────────────────────────────────────
// Llamar UNA SOLA VEZ: POST /migrarFacturaExistente
// Luego de ejecutado, este endpoint puede quedar (es idempotente y seguro).
exports.migrarFacturaExistente = functions.https.onRequest(async (req, res) => {
    const secret = req.query.secret || req.headers['x-admin-secret'];
    if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
        return res.status(403).send('Forbidden');
    }
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const CAE = '86228193709416';
    const existing = await db.collection('facturas').doc(CAE).get();
    if (existing.exists) {
        return res.status(200).json({ ok: false, message: 'Ya migrado. El documento existe en Firestore.' });
    }

    try {
        const FECHA  = '2026-06-03';
        const [yy, mm, dd] = FECHA.split('-');
        const pdfBuffer = await generarFacturaPDFBuffer({
            ptoVta:          1,
            numero:          2,
            fecha:           FECHA,
            fechaDisplay:    `${dd}/${mm}/${yy}`,
            cae:             CAE,
            vencCAEDisp:     '13/06/2026',
            receptorNombre:  'Consumidor Final',
            tipoDoc:         99,
            nroDoc:          0,
            condIVAReceptor: 'Consumidor Final',
            items: [{ descripcion: 'Venta al contado', cantidad: 1, precioUnit: 26000, subtotal: 26000 }],
            total: 26000,
        });

        const filePath = `facturas/2026/06/factura-c-00001-00000002.pdf`;
        await subirPDFStorage(pdfBuffer, filePath);
        const pdfUrl = `${SERVE_PDF_BASE}?cae=${CAE}`;

        const qrPayload = {
            ver: 1, fecha: FECHA, cuit: 20484597953,
            ptoVta: 1, tipoCmp: 11, nroCmp: 2, importe: 26000,
            moneda: 'PES', ctz: 1, tipoDocRec: 99, nroDocRec: 0,
            tipoCodAut: 'E', codAut: parseInt(CAE),
        };
        const qrUrl = 'https://www.afip.gob.ar/fe/qr/?p=' +
            Buffer.from(JSON.stringify(qrPayload)).toString('base64');

        await db.collection('facturas').doc(CAE).set({
            ventaId:              '',
            fechaEmision:         FECHA,
            tipoComprobante:      'Factura C',
            cbteTipo:             11,
            puntoVenta:           1,
            nroComprobante:       2,
            comprobanteFormateado: '00001-00000002',
            importeTotal:         26000,
            cae:                  CAE,
            vencimientoCAE:       '2026-06-13',
            receptorNombre:       'Consumidor Final',
            docTipo:              99,
            docNro:               0,
            qrUrl,
            pdfUrl,
            estado:               'emitida',
            createdAt:            new Date().toISOString(),
        });

        console.log('✓ Migración completada: facturas/' + CAE);
        return res.status(200).json({ ok: true, message: 'Migración completada.', pdfUrl });
    } catch (e) {
        console.error('❌ Error en migración:', e.message);
        return res.status(500).json({ ok: false, error: e.message });
    }
});

// ─── Servir PDF desde Storage con headers correctos ──────────────────────────
exports.servePdf = functions.https.onRequest(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).send('');

    const { cae, dl } = req.query;
    if (!cae) return res.status(400).send('Missing cae');

    const snap = await db.collection('facturas').doc(cae).get();
    if (!snap.exists) return res.status(404).send('Factura no encontrada');

    const { puntoVenta, nroComprobante, fechaEmision } = snap.data();
    const pvStr  = String(puntoVenta).padStart(5, '0');
    const nroStr = String(nroComprobante).padStart(8, '0');
    const [yy, mm] = (fechaEmision || '').split('-');
    const filePath = `facturas/${yy}/${mm}/factura-c-${pvStr}-${nroStr}.pdf`;

    const bucket = admin.storage().bucket(STORAGE_BUCKET);
    const file   = bucket.file(filePath);
    const [exists] = await file.exists();
    if (!exists) return res.status(404).send('Archivo PDF no encontrado en Storage');

    const filename = `factura-c-${pvStr}-${nroStr}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
        dl === '1'
            ? `attachment; filename="${filename}"`
            : `inline; filename="${filename}"`
    );
    file.createReadStream()
        .on('error', err => { console.error('stream error:', err); res.status(500).end(); })
        .pipe(res);
});

// ─── Parchar pdfUrl de docs existentes al formato servePdf ───────────────────
// Llamar UNA SOLA VEZ después de deployar: POST /patchPdfUrls
exports.patchPdfUrls = functions.https.onRequest(async (req, res) => {
    const secret = req.query.secret || req.headers['x-admin-secret'];
    if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
        return res.status(403).send('Forbidden');
    }
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    const snap  = await db.collection('facturas').get();
    const batch = db.batch();
    snap.docs.forEach(d => {
        batch.update(d.ref, { pdfUrl: `${SERVE_PDF_BASE}?cae=${d.id}` });
    });
    await batch.commit();
    return res.status(200).json({ ok: true, updated: snap.size });
});

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

                // ── Factura pendiente ──────────────────────────────────────
                const pendingSnap = await db.collection('pending_invoice').doc(numeroRemitente).get();
                if (pendingSnap.exists) {
                    const { texto, solo } = await resolverPendingFactura(pendingSnap, textoOriginal);
                    if (texto) await enviarMensajeWhatsApp(numeroMeta(numeroRemitente), texto);
                    if (solo) return res.sendStatus(200);
                    // solo=false → respuesta no reconocida o expirada → procesar como mensaje nuevo
                }
                // ──────────────────────────────────────────────────────────

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

                        // Si después del tipo viene una sigla o nombre de vendedor, lo detecta.
                        const _detectarVendedor = (v) => {
                            const u = (v || "").toUpperCase().trim();
                            if (u === "B" || u === "BUONO") return "Buono";
                            if (u === "D" || u === "DELFINA") return "Delfina";
                            if (u === "J" || u === "JERO" || u === "JERONIMO") return "Jeronimo";
                            if (u.length <= 2) return u; // otras siglas
                            return null;
                        };
                        const _vend = _detectarVendedor(partes[baseIndex]);
                        if (_vend !== null) {
                            vendedor = _vend;
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
                        let medioPagoViejo = null;
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
                            else if (["ALIAS1","A1"].includes(datoUpper)) {
                                medioPagoViejo = 'alias1';
                            }
                            else if (["ALIAS2","A2"].includes(datoUpper)) {
                                medioPagoViejo = 'alias2';
                            }
                            else if (["ALIAS3","A3"].includes(datoUpper)) {
                                medioPagoViejo = 'alias3';
                            }
                            else if (["EFE","EFECTIVO","CASH"].includes(datoUpper)) {
                                medioPagoViejo = 'efectivo';
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
                            : await procesarVenta(productoRaw, varianteRaw, cantidad, precioUnitario, fechaManual, costoEnvioMio, precioEnvioCliente, esRevendedor, esNuevo, vendedor, null, "Whatsapp", "", medioPagoViejo);

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
                                if (resultado.saleId) {
                                    const monto = (resultado.totalSaleRaw || 0) + (resultado.clientShippingCharge || 0);
                                    if (resultado.medioPago === 'alias1') {
                                        await guardarPendingFactura(numeroRemitente, [resultado.saleId], monto);
                                        await enviarMensajeWhatsApp(numeroParaMeta, `✅ Venta registrada.\n\n🧾 ¿Emito Factura C por $${monto.toLocaleString('es-AR')} a Consumidor Final?\nRespondé *sí* o *no*.`);
                                    } else {
                                        await enviarMensajeWhatsApp(numeroParaMeta, `✅ Venta registrada.`);
                                    }
                                }
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
// FACTURACIÓN ELECTRÓNICA — ESTADO PENDIENTE
// ==========================================

async function guardarPendingFactura(numeroRemitente, saleIds, monto) {
    await db.collection('pending_invoice').doc(numeroRemitente).set({
        saleIds,
        monto,
        createdAt: new Date().toISOString(),
    });
}

async function resolverPendingFactura(pendingSnap, textoRespuesta) {
    const { saleIds, monto, createdAt } = pendingSnap.data();

    // Expiración: si tiene más de 1 hora, auto-skip sin molestar
    const edadMs = Date.now() - new Date(createdAt).getTime();
    if (edadMs > 60 * 60 * 1000) {
        await pendingSnap.ref.delete();
        for (const id of saleIds) {
            await db.collection('sales').doc(id).update({ invoiceStatus: 'sin_factura' }).catch(() => {});
        }
        return { texto: null, solo: false }; // expired → procesar como mensaje nuevo
    }

    const t = normalizarParaComparar(textoRespuesta).trim();
    const afirmativos = ['si', 'sí', 'dale', 'ok', 'yes', 'claro', 'bueno', 'va', 'emiti', 'emitila'];
    const negativos   = ['no', 'nop', 'nel', 'para nada', 'no gracias'];
    const esAf  = afirmativos.some(p => t === p || t.startsWith(p + ' '));
    const esNeg = negativos.some(p => t === p || t.startsWith(p + ' '));

    // Respuesta no reconocida → auto-skip y procesar el mensaje como nuevo comando
    if (!esAf && !esNeg) {
        await pendingSnap.ref.delete();
        for (const id of saleIds) {
            await db.collection('sales').doc(id).update({ invoiceStatus: 'sin_factura' }).catch(() => {});
        }
        return { texto: null, solo: false };
    }

    await pendingSnap.ref.delete();

    if (esNeg) {
        for (const id of saleIds) {
            await db.collection('sales').doc(id).update({ invoiceStatus: 'sin_factura' }).catch(() => {});
        }
        return { texto: '✅ Venta registrada sin factura.', solo: true };
    }

    // Afirmativo → verificar anti-duplicado ANTES de llamar a ARCA
    for (const id of saleIds) {
        const snap = await db.collection('sales').doc(id).get();
        if (!snap.exists) continue;
        const d = snap.data();
        if (d.invoiceStatus === 'emitida' || d.invoiceCAE || d.invoiceNumber || d.facturaId) {
            return {
                texto: `⚠️ La factura ya fue emitida (CAE: ${d.invoiceCAE || d.facturaId}, Nro: ${d.invoiceNumber}).`,
                solo: true,
            };
        }
    }

    try {
        const resultado = await emitirFacturaC(monto);
        const hoy             = new Date().toISOString().slice(0, 10);
        const [yy, mm, dd]    = hoy.split('-');
        const fechaDisplay    = `${dd}/${mm}/${yy}`;
        const ptoVta          = 1;
        const vencParts       = (resultado.vencimientoCAE || '').split('-');
        const vencCAEDisp     = vencParts.length === 3
            ? `${vencParts[2]}/${vencParts[1]}/${vencParts[0]}` : '';

        // Actualizar sales primero: protección anti-duplicado activada
        for (const id of saleIds) {
            await db.collection('sales').doc(id).update({
                invoiceStatus:  'emitida',
                invoiceCAE:     resultado.CAE,
                invoiceNumber:  resultado.nroComprobante,
                invoiceDate:    hoy,
                facturaId:      resultado.CAE,
            });
        }

        // PDF + Storage + Firestore facturas (no bloquea la respuesta WhatsApp)
        guardarFacturaConPDF({
            ventaId:       saleIds[0] || '',
            ptoVta,
            numero:        resultado.nroComprobante,
            fecha:         hoy,
            fechaDisplay,
            cae:           resultado.CAE,
            vencimientoCAE: resultado.vencimientoCAE,
            vencCAEDisp,
            monto,
        }).catch(e => console.error('❌ Error guardando PDF/factura (CAE ya emitido):', e.message));

        return {
            texto: `🧾 *Factura C emitida*\n• Nro: ${resultado.nroComprobante}\n• CAE: ${resultado.CAE}\n• Vence: ${resultado.vencimientoCAE}`,
            solo: true,
        };
    } catch (e) {
        console.error('❌ Error ARCA al emitir factura:', e.message);
        for (const id of saleIds) {
            await db.collection('sales').doc(id).update({ invoiceStatus: 'pendiente' }).catch(() => {});
        }
        return {
            texto: '⚠️ ARCA no respondió. La factura quedó como *pendiente* y se reintentará.',
            solo: true,
        };
    }
}

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
    const clienteMayorista = esRevendedor ? String(general.cliente || general.clientName || general.nombre || "").trim() : "";
    const ticketIdGrupo = Date.now().toString();
    let total = 0;
    let unidades = 0;
    if (tipo === "VENTA" || tipo === "MAYORISTA") {
        const medioPago = normalizarMedioPago(general.medioPago);

        // Fase 1: validar todos los items en memoria sin escribir nada
        const batchesSnap = await db.collection("batches").orderBy("createdAt", "asc").get();
        const memBatches = batchesSnap.docs
            .filter(doc => !doc.data().finalizedAt)
            .map(doc => ({ id: doc.id, items: (doc.data().items || []).map(it => ({ ...it })) }));

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.precio || item.precio <= 0)
                return { exito: false, error_msg: errorConProducto(item, i, `❌ Falta precio en ${item.producto} (${item.variante}).`) };
            const pBuscar = normalizarParaComparar(item.producto);
            const vBuscar = normalizarParaComparar(item.variante);
            let restante = item.cantidad;
            let encontrado = false;
            for (const mb of memBatches) {
                if (restante <= 0) break;
                for (const mi of mb.items) {
                    if (restante <= 0) break;
                    if (esParecido(pBuscar, normalizarParaComparar(mi.product)) && esParecido(vBuscar, normalizarParaComparar(mi.variant))) {
                        encontrado = true;
                        const descontar = Math.min(mi.currentStock, restante);
                        mi.currentStock -= descontar;
                        restante -= descontar;
                    }
                }
            }
            if (restante > 0) {
                const msg = encontrado
                    ? `❌ Stock insuficiente para "${item.producto} (${item.variante})". Ningún producto del mensaje fue registrado.`
                    : `❌ No encontré "${item.producto} (${item.variante})" en el stock. Ningún producto del mensaje fue registrado.`;
                return { exito: false, error_msg: errorConProducto(item, i, msg) };
            }
        }

        // Fase 2: todos válidos — ahora sí escribir
        const saleIds = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const costoEnvio = i === 0 ? limpiarNumero(general.envioCosto || 0) : 0;
            const cobroEnvio = i === 0 ? limpiarNumero(general.envioCobro || 0) : 0;
            const r = await procesarVenta(item.producto, item.variante, item.cantidad, item.precio, fecha, costoEnvio, cobroEnvio, esRevendedor, tipoCliente, vendedor, ticketIdGrupo, canal, clienteMayorista, medioPago);
            if (r && r.exito === false) return { ...r, error_msg: errorConProducto(item, i, r.error_msg) };
            if (r.saleId) saleIds.push(r.saleId);
            total += item.precio * item.cantidad + (i === 0 ? (cobroEnvio || 0) : 0);
            unidades += item.cantidad;
            await registrarEnSheet(tipo === "MAYORISTA" ? "Mayorista" : "Ventas", [fechaHoySheet, numeroRemitente, item.producto, item.variante, item.cantidad, item.precio, `ÉXITO (${vendedor})`, tipoCliente]);
        }
        if (saleIds.length > 0 && medioPago === 'alias1') {
            await guardarPendingFactura(numeroRemitente, saleIds, total);
            const montoFmt = total.toLocaleString('es-AR');
            return { exito: true, mensaje: `✅ Venta registrada.\n\n🧾 ¿Emito Factura C por $${montoFmt} a Consumidor Final?\nRespondé *sí* o *no*.` };
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
        const telefono = String(general.telefono || "").trim();
        const dni = String(general.dni || "").trim();
        if (!cliente) return { exito: false, error_msg: "❌ En consignación falta el cliente. Ej: cliente: Juan" };
        const accion = normalizarParaComparar(general.accion || "entrega");
        if (["entrega", "entregar", "dejo", "dejar"].includes(accion)) {
            const consignmentTicketId = `CONS-${Date.now()}`;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item.precio || item.precio <= 0) return { exito: false, error_msg: errorConProducto(item, i, `❌ Falta precio acordado en ${item.producto} (${item.variante}).`) };
                const r = await procesarConsignacionEntregaItem(cliente, item, general.fechaLimite || "", general.nota || "", consignmentTicketId, tipoCliente, telefono, dni);
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

async function procesarConsignacionEntregaItem(cliente, item, fechaLimite, nota, consignmentTicketId, tipoCliente, telefono = "", dni = "") {
    const stock = await descontarStockParaConsignacion(item.producto, item.variante, item.cantidad);
    if (!stock.exito) return stock;
    const now = new Date().toISOString();
    await db.collection("consignments").add({
        consignmentTicketId, createdAt: now, updatedAt: now, status: "active", clientName: cliente, clientPhone: telefono || "", clientDni: dni || "", clientType: tipoCliente || "Frecuente",
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
            if (nomVend.toUpperCase() === "D") nomVend = "Delfina"; // Por si quedó alguno viejo
            if (nomVend.toUpperCase() === "J") nomVend = "Jeronimo"; // Por si quedó alguno viejo
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
async function procesarVenta(userProducto, userVariante, cantARestar, precioUnitario, fechaManual, costoEnvioMio, precioEnvioCliente, esRevendedor, esNuevo, vendedor, ticketIdManual = null, source = "Whatsapp", clienteMayorista = "", medioPago = null) {
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
        // totalSaleRaw = solo producto (el envío no es ganancia del emisor)
        const totalVentaCalculado = precioUnitario * cantARestar;
        const ticketIdGenerado = ticketIdManual || Date.now().toString(); 
        const fechaCreacionReal = new Date().toISOString(); 

        const saleRef = await db.collection("sales").add({
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
            clientShippingCharge: precioEnvioCliente,
            medioPago: medioPago || null,
            source: source || "Whatsapp",
            operationType: esRevendedor ? "MAYORISTA" : "VENTA",
            clientName: esRevendedor ? (clienteMayorista || "") : "",
            ticketId: ticketIdGenerado,
            totalSaleRaw: totalVentaCalculado,
            unitPrice: precioUnitario,
            variant: varianteOficial,
            seller: vendedor
        });

        const aliasWalletMap = { alias1: 'GALICIA', alias2: 'ASTROPAY', alias3: 'LEMON' };
        if (medioPago && aliasWalletMap[medioPago]) {
            const wName = aliasWalletMap[medioPago];
            const wAmount = totalVentaCalculado + Math.max(0, (precioEnvioCliente || 0) - (costoEnvioMio || 0));
            const walletsRef = db.collection('settings').doc('wallets');
            await db.runTransaction(async t => {
                const walletsDoc = await t.get(walletsRef);
                const current = walletsDoc.exists ? (walletsDoc.data()[wName] || 0) : 0;
                t.set(walletsRef, { [wName]: current + wAmount }, { merge: true });
            });
        }
        return { exito: true, saleId: saleRef.id, totalSaleRaw: totalVentaCalculado, clientShippingCharge: precioEnvioCliente, medioPago: medioPago || null };
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
// MIGRACIÓN: SINCRONIZAR BILLETERAS CON VENTAS HISTÓRICAS
// Llamar UNA SOLA VEZ: POST /sincronizarBilleteras
// Suma todos los totales de ventas con alias1/2/3 y pisa los saldos.
// ==========================================
exports.sincronizarBilleteras = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const aliasWalletMap = { alias1: 'GALICIA', alias2: 'ASTROPAY', alias3: 'LEMON' };
    const totales = { GALICIA: 0, ASTROPAY: 0, LEMON: 0 };

    const snap = await db.collection('sales').get();
    let contadas = 0;

    snap.docs.forEach(doc => {
        const s = doc.data();
        const mp = s.medioPago;
        if (mp && aliasWalletMap[mp]) {
            const wallet = aliasWalletMap[mp];
            totales[wallet] += (s.totalSaleRaw || 0) + (s.clientShippingCharge || 0);
            contadas++;
        }
    });

    await db.collection('settings').doc('wallets').set(totales);

    return res.status(200).json({
        ok: true,
        ventasContadas: contadas,
        saldos: totales
    });
});

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