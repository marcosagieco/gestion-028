'use strict';

/**
 * Backfill único: le pone emisorId: 'alias1' a los documentos de la colección `facturas` que
 * no lo tengan (todas las facturas emitidas antes del refactor multi-emisor son del emisor 1,
 * no hay ambigüedad posible). Muestra cuántos documentos va a tocar y pide confirmación en la
 * terminal antes de escribir nada.
 *
 * Ejecutar: node functions/backfill-emisor-facturas.js
 */

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const admin    = require('firebase-admin');

// Mismo mecanismo local que facturacion.js/verificar-emisor1.js: no hay metadata de GCP para
// inferir el projectId corriendo como script suelto, así que se toma de .firebaserc y se usa
// la service account del repo como credencial.
const firebaseRcPath     = path.join(__dirname, '..', '.firebaserc');
const serviceAccountPath = path.join(__dirname, 'service-account.json');
if (!fs.existsSync(firebaseRcPath) || !fs.existsSync(serviceAccountPath)) {
    console.error('Falta .firebaserc en la raíz del repo o functions/service-account.json.');
    process.exit(1);
}
const { projects } = JSON.parse(fs.readFileSync(firebaseRcPath, 'utf8'));
admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
    projectId:  projects.default,
});
const db = admin.firestore();

function preguntar(mensaje) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(mensaje, (respuesta) => { rl.close(); resolve(respuesta); }));
}

async function main() {
    const snap = await db.collection('facturas').get();
    const sinEmisor = snap.docs.filter(d => !d.data().emisorId);

    console.log(`Total de facturas en la colección: ${snap.size}`);
    console.log(`Facturas SIN emisorId (se les va a poner 'alias1'): ${sinEmisor.length}`);

    if (sinEmisor.length === 0) {
        console.log('\nNo hay nada para hacer — todas las facturas ya tienen emisorId.');
        process.exit(0);
    }

    const respuesta = await preguntar(
        `\n¿Confirmás escribir emisorId: 'alias1' en esos ${sinEmisor.length} documento${sinEmisor.length !== 1 ? 's' : ''}? (escribí "si" para confirmar) `
    );
    if (respuesta.trim().toLowerCase() !== 'si') {
        console.log('Cancelado. No se escribió nada.');
        process.exit(0);
    }

    // Firestore permite hasta 500 escrituras por batch
    const LOTE = 500;
    let escritos = 0;
    for (let i = 0; i < sinEmisor.length; i += LOTE) {
        const chunk = sinEmisor.slice(i, i + LOTE);
        const batch = db.batch();
        for (const doc of chunk) batch.update(doc.ref, { emisorId: 'alias1' });
        await batch.commit();
        escritos += chunk.length;
        console.log(`  ...${escritos}/${sinEmisor.length}`);
    }

    console.log(`\n✓ Listo. ${escritos} factura${escritos !== 1 ? 's' : ''} actualizada${escritos !== 1 ? 's' : ''} con emisorId: 'alias1'.`);
    process.exit(0);
}

main().catch(err => {
    console.error('\n✗ Error:', err.message || err);
    process.exit(1);
});
