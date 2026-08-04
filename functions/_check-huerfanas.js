'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const { projects } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.firebaserc'), 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, 'service-account.json'))),
  projectId: projects.default,
});
const db = admin.firestore();

(async () => {
  const facturasSnap = await db.collection('facturas').get();
  const caesEnFacturas = new Set(facturasSnap.docs.map(d => d.id));
  console.log('Documentos en facturas:', facturasSnap.size);

  const salesSnap = await db.collection('sales').where('invoiceStatus', '==', 'emitida').get();
  console.log('Ventas con invoiceStatus emitida:', salesSnap.size);

  const huerfanas = [];
  salesSnap.forEach(d => {
    const s = d.data();
    const cae = s.invoiceCAE || s.facturaId;
    if (!cae || !caesEnFacturas.has(cae)) {
      huerfanas.push({ id: d.id, cae: cae || null, invoiceNumber: s.invoiceNumber || null, invoiceDate: s.invoiceDate || null });
    }
  });
  console.log('Ventas "emitida" SIN doc correspondiente en facturas:', huerfanas.length);
  console.log(JSON.stringify(huerfanas, null, 2));

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
