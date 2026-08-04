'use strict';

// Las credenciales se cargan desde functions/.env via dotenv (dentro de facturacion.js)
const { emitirFacturaC } = require('./facturacion');
const { EMISORES } = require('./emisores');

// ⚠️ NO correr como parte de una verificación de rutina: emite una Factura C REAL y consume
// numeración fiscal real del emisor 1. Para confirmar que un refactor no rompió nada, usar
// functions/verificar-emisor1.js (solo lectura) en vez de este script.
(async () => {
    console.log('⚠️  PRODUCCIÓN — esta factura será real ante ARCA');
    console.log('Conectando con ARCA...');
    console.log('Emitiendo Factura C por $1000\n');
    try {
        const res = await emitirFacturaC(1000, EMISORES.alias1);
        console.log('✓ Factura emitida correctamente:');
        console.log(`  Nro. comprobante : ${res.nroComprobante}`);
        console.log(`  CAE              : ${res.CAE}`);
        console.log(`  Vencimiento CAE  : ${res.vencimientoCAE}`);
    } catch (err) {
        console.error('✗ Error:', err.message || err);
        process.exit(1);
    }
})();
