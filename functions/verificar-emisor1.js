'use strict';

require('dotenv').config();

// Chequeo de SOLO LECTURA para confirmar que el refactor multi-emisor no rompió al emisor 1
// (el que ya factura en producción). Ejercita el camino real refactorizado — auth WSAA con
// cache de Ticket de Acceso en Firestore + emisor como parámetro — pero solo llama a
// FECompUltimoAutorizado. NUNCA llama a FECAESolicitar: no hay forma de que emita una factura
// ni consuma numeración fiscal.
const { EMISORES } = require('./emisores');
const { consultarUltimoComprobante } = require('./facturacion');

(async () => {
    console.log('=== Verificación de SOLO LECTURA — emisor 1, post-refactor ===');
    console.log(`CUIT     : ${EMISORES.alias1.cuit || '(falta AFIP_CUIT en functions/.env)'}`);
    console.log(`PtoVta   : ${EMISORES.alias1.ptoVta}`);
    console.log('CbteTipo : 11 (Factura C)\n');

    try {
        const nro = await consultarUltimoComprobante(EMISORES.alias1, 11);
        console.log(`Último comprobante autorizado: ${nro}`);
        console.log('\nComparalo contra el último número que ya conocías antes del refactor.');
        console.log('Si coincide, el emisor 1 sigue funcionando exactamente igual que antes.');
    } catch (err) {
        console.error('\n✗ Error:', err.message || err);
        process.exit(1);
    }
})();
