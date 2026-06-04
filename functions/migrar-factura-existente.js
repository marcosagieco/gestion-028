'use strict';

/**
 * Script de migración único para registrar la Factura C ya emitida
 * (00001-00000002, CAE 86228193709416) en Firestore + Firebase Storage.
 *
 * NO llama a ARCA. NO modifica la colección sales. NO reemite nada.
 * Ejecutar UNA SOLA VEZ: node functions/migrar-factura-existente.js
 */

require('dotenv').config();
const admin  = require('firebase-admin');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

// Usar Application Default Credentials (gcloud auth application-default login)
// o GOOGLE_APPLICATION_CREDENTIALS apuntando al service account de Firebase Admin.
// El service-account.json de Google Sheets NO tiene permisos suficientes.
admin.initializeApp({
    credential:    admin.credential.applicationDefault(),
    storageBucket: 'gestion-028.firebasestorage.app',
});

const db             = admin.firestore();
const STORAGE_BUCKET = 'gestion-028.firebasestorage.app';

// ─── Datos de la factura ya emitida ──────────────────────────────────────────
const FACTURA = {
    cae:                  '86228193709416',
    fechaEmision:         '2026-06-03',
    vencimientoCAE:       '2026-06-13',
    puntoVenta:           1,
    nroComprobante:       2,
    importeTotal:         26000,
    receptorNombre:       'Consumidor Final',
    docTipo:              99,
    docNro:               0,
};

async function main() {
    // Idempotencia: verificar si el doc ya existe
    const existing = await db.collection('facturas').doc(FACTURA.cae).get();
    if (existing.exists) {
        console.log('⚠️  El documento ya existe en Firestore. Abortando para no sobreescribir.');
        process.exit(0);
    }

    // Leer PDF del disco (generado y corregido previamente)
    const pdfLocal = path.join(__dirname, 'factura-c-0001-00000002.pdf');
    if (!fs.existsSync(pdfLocal)) {
        console.error('❌ Archivo PDF no encontrado:', pdfLocal);
        process.exit(1);
    }
    const pdfBuffer = fs.readFileSync(pdfLocal);
    console.log(`✓ PDF leído (${pdfBuffer.length} bytes)`);

    // Subir a Firebase Storage con token permanente
    const bucket   = admin.storage().bucket(STORAGE_BUCKET);
    const pvStr    = String(FACTURA.puntoVenta).padStart(5, '0');
    const nroStr   = String(FACTURA.nroComprobante).padStart(8, '0');
    const [yy, mm] = FACTURA.fechaEmision.split('-');
    const filePath = `facturas/${yy}/${mm}/factura-c-${pvStr}-${nroStr}.pdf`;

    const file   = bucket.file(filePath);
    const token  = crypto.randomUUID();
    console.log(`Subiendo a Storage: ${filePath} ...`);
    await file.save(pdfBuffer, {
        contentType: 'application/pdf',
        metadata: { firebaseStorageDownloadTokens: token },
    });
    const encoded = encodeURIComponent(filePath);
    const pdfUrl  = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encoded}?alt=media&token=${token}`;
    console.log('✓ PDF subido.');
    console.log('  URL:', pdfUrl);

    // Construir QR URL (mismo payload que usó ARCA al autorizar)
    const qrPayload = {
        ver: 1, fecha: FACTURA.fechaEmision, cuit: 20484597953,
        ptoVta:     FACTURA.puntoVenta,
        tipoCmp:    11,
        nroCmp:     FACTURA.nroComprobante,
        importe:    FACTURA.importeTotal,
        moneda:     'PES',
        ctz:        1,
        tipoDocRec: FACTURA.docTipo,
        nroDocRec:  FACTURA.docNro,
        tipoCodAut: 'E',
        codAut:     parseInt(FACTURA.cae),
    };
    const qrUrl = 'https://www.afip.gob.ar/fe/qr/?p=' +
        Buffer.from(JSON.stringify(qrPayload)).toString('base64');

    // Guardar documento en Firestore
    const comprobanteFormateado = `${pvStr}-${nroStr}`;
    await db.collection('facturas').doc(FACTURA.cae).set({
        ventaId:              '',
        fechaEmision:         FACTURA.fechaEmision,
        tipoComprobante:      'Factura C',
        cbteTipo:             11,
        puntoVenta:           FACTURA.puntoVenta,
        nroComprobante:       FACTURA.nroComprobante,
        comprobanteFormateado,
        importeTotal:         FACTURA.importeTotal,
        cae:                  FACTURA.cae,
        vencimientoCAE:       FACTURA.vencimientoCAE,
        receptorNombre:       FACTURA.receptorNombre,
        docTipo:              FACTURA.docTipo,
        docNro:               FACTURA.docNro,
        qrUrl,
        pdfUrl,
        estado:               'emitida',
        createdAt:            new Date().toISOString(),
    });

    console.log(`\n✓ Documento creado: facturas/${FACTURA.cae}`);
    console.log('✓ Migración completada. La factura ya aparece en /facturas.');
    process.exit(0);
}

main().catch(err => {
    console.error('\n❌ Error en migración:', err.message || err);
    process.exit(1);
});
