'use strict';

// Carga functions/.env con ruta explícita (no relativa al cwd desde el que se invoque node),
// independiente de si algún otro módulo ya llamó a dotenv antes. Este archivo lee process.env
// en el momento en que se hace require(), así que no puede depender de que facturacion.js (u
// otro require anterior) ya haya cargado el .env correcto — algunos scripts (ej.
// verificar-emisor1.js) hacen require('./emisores') antes que require('./facturacion').
// En Cloud Functions esto es un no-op inofensivo (las env vars ya están inyectadas por Firebase
// antes de que corra este código, y si functions/.env no existe en el bundle desplegado, dotenv
// simplemente no encuentra nada para cargar, sin tirar error).
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// ---------------------------------------------------------------------------
// Configuración de emisores de Factura C (ARCA/WSFEv1). Cada emisor = un CUIT/
// certificado propio, con su propio punto de venta e identidad fiscal. El
// alias que llega del bot de WhatsApp (normalizarMedioPago en index.js) elige
// cuál se usa: 'alias1' -> emisor 1, 'alias2' -> emisor 2.
//
// Solo cuit/cert/key/ptoVta de emisor 1 vienen de env (antes hardcodeados en
// facturacion.js) — el resto de la identidad fiscal (razón social, domicilio,
// inicio de actividad) queda como literal, igual que ya estaba en
// generar-factura-pdf.js. cert/cert/key nunca se leen acá: se leen recién al
// usarlos (leerCredenciales en facturacion.js), para no romper un emisor si
// el otro queda mal configurado.
// ---------------------------------------------------------------------------

const soloDigitos = (v) => String(v || '').replace(/\D/g, '');
const formatCuit  = (v) => { const d = soloDigitos(v); return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`; };
const cuitNum      = (v) => parseInt(soloDigitos(v), 10);

const EMISORES = {
  alias1: {
    id: 'alias1',
    cuit: process.env.AFIP_CUIT,
    cert: process.env.AFIP_CERT,
    key:  process.env.AFIP_KEY,
    ptoVta: parseInt(process.env.AFIP_PTO_VTA, 10),
    razonSocial:       '028 Import',
    razonSocialFiscal: 'BUNGE LUCIO FELIX',
    condIVA:           'Responsable Monotributo',
    domicilio:         'MIÑONES 2061',
    localidad:         '1428 - Ciudad Autónoma de Buenos Aires',
    inicioActividad:   '01/05/2026',
    // Emisor de producción — sigue con el valor histórico hardcodeado (5) hasta que se confirme
    // la primera emisión real de alias2 con CAE. Recién ahí se cambia este flag a true a mano.
    usarCondicionIvaDinamica: false,
  },
  alias2: {
    id: 'alias2',
    cuit: process.env.AFIP_CUIT_2,
    cert: process.env.AFIP_CERT_2,
    key:  process.env.AFIP_KEY_2,
    // Punto de venta dado directamente por el usuario (no un hardcodeo "recordado" de memoria),
    // no necesita variable de entorno.
    ptoVta: 2,
    razonSocial:       'GIECO MARCOS AGUSTIN',
    razonSocialFiscal: 'GIECO MARCOS AGUSTIN',
    condIVA:           'Responsable Monotributo',
    domicilio:         'SUIPACHA 1162',
    localidad:         '1646 - SAN FERNANDO, BUENOS AIRES',
    inicioActividad:   '01/08/2026',
    // Emisor nuevo, sin producción que romper — puede usar la Condición IVA Receptor dinámica desde el arranque.
    usarCondicionIvaDinamica: true,
  },
};

module.exports = { EMISORES, soloDigitos, formatCuit, cuitNum };
