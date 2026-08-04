'use strict';

require('dotenv').config();

const https = require('https');
const forge = require('node-forge');
const axios = require('axios');

// ---------------------------------------------------------------------------
// Script SUELTO de validación para el certificado nuevo (segundo monotributista,
// PtoVta 2). Replica el mismo mecanismo de auth que functions/facturacion.js
// (WSAA + firma CMS + WSFEv1), pero:
//   - usa variables de entorno DISTINTAS para no tocar/pisar AFIP_CERT/AFIP_KEY
//   - solo llama a FECompUltimoAutorizado (consulta de lectura)
//   - NO define ni llama a nada de FECAESolicitar -> no puede emitir facturas
// facturacion.js queda intacto, sin modificar.
// ---------------------------------------------------------------------------

const CUIT      = process.env.AFIP_CUIT_2;
const PTO_VTA   = 2;
const CBTE_TIPO = 11; // Factura C

const WSAA_URL = 'https://wsaa.afip.gov.ar/ws/services/LoginCms';
const WSFE_URL = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx';

// Mismo ajuste de SECLEVEL que facturacion.js (AFIP/ARCA usa DH keys de 1024 bits)
const wsfeAgent = new https.Agent({ ciphers: 'DEFAULT:@SECLEVEL=0' });

function leerCredenciales() {
    const raw_cert = process.env.AFIP_CERT_2;
    const raw_key  = process.env.AFIP_KEY_2;

    if (!raw_cert || !raw_key || !CUIT) {
        throw new Error(
            'Faltan variables de entorno.\n' +
            'Agregá a functions/.env: AFIP_CERT_2, AFIP_KEY_2 y AFIP_CUIT_2\n' +
            '(mismo formato que AFIP_CERT/AFIP_KEY: PEM completo, con \\n literales en vez de saltos de línea reales).'
        );
    }

    const cert = raw_cert.replace(/\\n/g, '\n');
    const key  = raw_key.replace(/\\n/g, '\n');
    return { cert, key };
}

function crearTRA(service = 'wsfe') {
    const ahora = new Date();
    const desde = new Date(ahora.getTime() - 10 * 60 * 1000);
    const hasta = new Date(ahora.getTime() + 12 * 60 * 60 * 1000);
    const uid   = Math.floor(ahora.getTime() / 1000);

    const iso = d => {
        const ar = new Date(d.getTime() - 3 * 60 * 60 * 1000);
        return ar.toISOString().slice(0, 19) + '-03:00';
    };

    return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uid}</uniqueId>
    <generationTime>${iso(desde)}</generationTime>
    <expirationTime>${iso(hasta)}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`;
}

function firmarTRA(tra, certPem, keyPem) {
    const cert = forge.pki.certificateFromPem(certPem);
    const key  = forge.pki.privateKeyFromPem(keyPem);

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(tra, 'utf8');
    p7.addCertificate(cert);
    p7.addSigner({
        key,
        certificate: cert,
        digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
            { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
            { type: forge.pki.oids.messageDigest },
            { type: forge.pki.oids.signingTime, value: new Date() },
        ],
    });
    p7.sign();

    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    return forge.util.encode64(der);
}

async function obtenerTA(certPem, keyPem) {
    const tra        = crearTRA('wsfe');
    const cmsFirmado = firmarTRA(tra, certPem, keyPem);

    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:wsaa="https://wsaa.afip.gov.ar/ws/services/LoginCms">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cmsFirmado}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

    const res = await axios.post(WSAA_URL, envelope, {
        headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction':   '""',
        },
    });

    const outerXml = res.data;
    const match = outerXml.match(/<loginCmsReturn[^>]*>([\s\S]*?)<\/loginCmsReturn>/);
    if (!match) throw new Error('WSAA: respuesta inesperada:\n' + outerXml);

    const innerXml = match[1]
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&apos;/g, "'")
        .trim();

    const token = innerXml.match(/<token>([\s\S]*?)<\/token>/)?.[1]?.trim();
    const sign  = innerXml.match(/<sign>([\s\S]*?)<\/sign>/)?.[1]?.trim();

    if (!token || !sign) throw new Error('WSAA: no se encontraron token/sign en:\n' + innerXml);
    return { token, sign };
}

async function getUltimoComprobante(token, sign, ptoVta, cbteTipo) {
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body>
    <ar:FECompUltimoAutorizado>
      <ar:Auth>
        <ar:Token>${token}</ar:Token>
        <ar:Sign>${sign}</ar:Sign>
        <ar:Cuit>${CUIT}</ar:Cuit>
      </ar:Auth>
      <ar:PtoVta>${ptoVta}</ar:PtoVta>
      <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soap:Body>
</soap:Envelope>`;

    const res = await axios.post(WSFE_URL, envelope, {
        httpsAgent: wsfeAgent,
        headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction':   '"http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado"',
        },
    });

    const xml = res.data;
    if (xml.includes('<faultstring>')) {
        const msg = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/)?.[1] || xml;
        throw new Error(`WSFE SOAP Fault en FECompUltimoAutorizado: ${msg}`);
    }
    return xml;
}

(async () => {
    console.log('=== Validación de certificado nuevo — SOLO LECTURA, no emite comprobantes ===');
    console.log(`CUIT     : ${CUIT || '(falta AFIP_CUIT_2 en functions/.env)'}`);
    console.log(`PtoVta   : ${PTO_VTA}`);
    console.log(`CbteTipo : ${CBTE_TIPO} (Factura C)\n`);

    try {
        const { cert, key } = leerCredenciales();

        console.log('1. Autenticando contra WSAA con el certificado nuevo...');
        const { token, sign } = await obtenerTA(cert, key);
        console.log('   ✓ Ticket de acceso obtenido correctamente (token/sign recibidos)\n');

        console.log('2. Llamando a FECompUltimoAutorizado (PtoVta=2, CbteTipo=11)...');
        const xml = await getUltimoComprobante(token, sign, PTO_VTA, CBTE_TIPO);
        const nro = xml.match(/<CbteNro>(\d+)<\/CbteNro>/)?.[1];

        console.log('   ✓ Respuesta recibida de ARCA\n');
        console.log(`   Último comprobante autorizado (PtoVta 2, Factura C): ${nro ?? '(no encontrado, ver XML crudo abajo)'}`);
        console.log('\n--- XML crudo de la respuesta ---');
        console.log(xml);
        console.log('\n=== Certificado validado correctamente. No se emitió ninguna factura. ===');
    } catch (err) {
        console.error('\n✗ Error:', err.message || err);
        process.exit(1);
    }
})();
