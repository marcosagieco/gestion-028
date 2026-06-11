'use strict';

require('dotenv').config();

const https  = require('https');
const forge  = require('node-forge');
const axios  = require('axios');

// AFIP/ARCA usa DH keys de 1024 bits que Node.js 18+ rechaza por defecto.
// Este agente baja el SECLEVEL solo para las llamadas al WSFE.
const wsfeAgent = new https.Agent({
    ciphers: 'DEFAULT:@SECLEVEL=0',
});

const CUIT    = '20484597953';
const PTO_VTA = 1;

// ⚠️  PRODUCCIÓN — este certificado es real, las facturas emitidas son válidas ante ARCA
const WSAA_URL = 'https://wsaa.afip.gov.ar/ws/services/LoginCms';
const WSFE_URL = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx';

// Cache en memoria del Ticket de Acceso (válido ~12 h)
let _taCache = null;

// ---------------------------------------------------------------------------
// Credenciales desde variables de entorno
// ---------------------------------------------------------------------------
function leerCredenciales() {
    // Firebase Functions incluye automáticamente functions/.env en el deploy.
    // En desarrollo local dotenv (llamado al top del archivo) carga el mismo archivo.
    const raw_cert = process.env.AFIP_CERT;
    const raw_key  = process.env.AFIP_KEY;

    if (!raw_cert || !raw_key) {
        throw new Error(
            'AFIP_CERT y/o AFIP_KEY no encontradas.\n' +
            'Asegurate de que functions/.env contenga ambas variables.'
        );
    }

    // El .env almacena \\n literales; los convertimos a saltos de línea reales
    const cert = raw_cert.replace(/\\n/g, '\n');
    const key  = raw_key.replace(/\\n/g, '\n');
    return { cert, key };
}

// ---------------------------------------------------------------------------
// WSAA — Ticket de Requerimiento de Acceso (TRA)
// ---------------------------------------------------------------------------
function crearTRA(service = 'wsfe') {
    const ahora  = new Date();
    const desde  = new Date(ahora.getTime() - 10 * 60 * 1000);        // -10 min
    const hasta  = new Date(ahora.getTime() + 12 * 60 * 60 * 1000);   // +12 h
    const uid    = Math.floor(ahora.getTime() / 1000);

    // Convertir a hora Argentina (UTC-3) y formatear con offset explícito
    // toISOString() es siempre UTC, así que restamos 3h para obtener la hora local
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

// ---------------------------------------------------------------------------
// WSAA — Firma PKCS#7 / CMS del TRA
// ---------------------------------------------------------------------------
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
            { type: forge.pki.oids.contentType,  value: forge.pki.oids.data },
            { type: forge.pki.oids.messageDigest },
            { type: forge.pki.oids.signingTime,  value: new Date() },
        ],
    });
    p7.sign();

    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    return forge.util.encode64(der);
}

// ---------------------------------------------------------------------------
// WSAA — Obtener Ticket de Acceso (con caché)
// ---------------------------------------------------------------------------
async function obtenerTA(certPem, keyPem) {
    const margenMs = 5 * 60 * 1000; // 5 min de margen antes de expirar
    if (_taCache && new Date(_taCache.expiracion) > new Date(Date.now() + margenMs)) {
        return _taCache;
    }

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

    // La respuesta de WSAA es un XML dentro de loginCmsReturn
    // Puede venir como CDATA o con entidades HTML escapadas (&lt; &gt; etc.)
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
    const exp   = innerXml.match(/<expirationTime>([\s\S]*?)<\/expirationTime>/)?.[1]?.trim();

    if (!token || !sign) throw new Error('WSAA: no se encontraron token/sign en:\n' + innerXml);

    _taCache = { token, sign, expiracion: exp || new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() };
    return _taCache;
}

// ---------------------------------------------------------------------------
// WSFE — Helpers
// ---------------------------------------------------------------------------
function authXml(token, sign) {
    return `<ar:Auth>
        <ar:Token>${token}</ar:Token>
        <ar:Sign>${sign}</ar:Sign>
        <ar:Cuit>${CUIT}</ar:Cuit>
      </ar:Auth>`;
}

async function llamarWSFE(method, bodyXml) {
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body>
    ${bodyXml}
  </soap:Body>
</soap:Envelope>`;

    const res = await axios.post(WSFE_URL, envelope, {
        httpsAgent: wsfeAgent,
        headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction':   `"http://ar.gov.afip.dif.FEV1/${method}"`,
        },
    });

    const xml = res.data;
    if (xml.includes('<faultstring>')) {
        const msg = xml.match(/<faultstring>([\s\S]*?)<\/faultstring>/)?.[1] || xml;
        throw new Error(`WSFE SOAP Fault en ${method}: ${msg}`);
    }
    return xml;
}

// ---------------------------------------------------------------------------
// WSFE — FECompUltimoAutorizado
// ---------------------------------------------------------------------------
async function getUltimoComprobante(token, sign, ptoVta, cbteTipo) {
    const xml = await llamarWSFE('FECompUltimoAutorizado', `
    <ar:FECompUltimoAutorizado>
      ${authXml(token, sign)}
      <ar:PtoVta>${ptoVta}</ar:PtoVta>
      <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>`);

    const nro = xml.match(/<CbteNro>(\d+)<\/CbteNro>/)?.[1];
    if (nro == null) throw new Error('FECompUltimoAutorizado: no se encontró CbteNro en:\n' + xml);
    return parseInt(nro, 10);
}

// ---------------------------------------------------------------------------
// WSFE — FECAESolicitar
// ---------------------------------------------------------------------------
async function solicitarCAE(token, sign, datos) {
    const xml = await llamarWSFE('FECAESolicitar', `
    <ar:FECAESolicitar>
      ${authXml(token, sign)}
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${datos.ptoVta}</ar:PtoVta>
          <ar:CbteTipo>${datos.cbteTipo}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>${datos.concepto}</ar:Concepto>
            <ar:DocTipo>${datos.docTipo}</ar:DocTipo>
            <ar:DocNro>${datos.docNro}</ar:DocNro>
            <ar:CbteDesde>${datos.nroComprobante}</ar:CbteDesde>
            <ar:CbteHasta>${datos.nroComprobante}</ar:CbteHasta>
            <ar:CbteFch>${datos.fecha}</ar:CbteFch>
            <ar:ImpTotal>${datos.impTotal.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${datos.impTotal.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>0.00</ar:ImpOpEx>
            <ar:ImpIVA>0.00</ar:ImpIVA>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
            <ar:CondicionIVAReceptorId>${datos.condIVAReceptor}</ar:CondicionIVAReceptorId>
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>`);

    const resultado = xml.match(/<Resultado>(.*?)<\/Resultado>/)?.[1];
    if (resultado !== 'A') {
        const errores = [...xml.matchAll(/<Code>(\d+)<\/Code>[\s\S]*?<Msg>([\s\S]*?)<\/Msg>/g)]
            .map(m => `[${m[1]}] ${m[2].trim()}`).join(' | ');
        throw new Error(`ARCA rechazó el comprobante (Resultado: ${resultado}). ${errores || 'Sin detalle.'}`);
    }

    const cae     = xml.match(/<CAE>(\d+)<\/CAE>/)?.[1];
    const vencRaw = xml.match(/<CAEFchVto>(\d{8})<\/CAEFchVto>/)?.[1];

    if (!cae) throw new Error('CAE no encontrado en respuesta:\n' + xml);

    const vencimientoCAE = vencRaw
        ? `${vencRaw.slice(0, 4)}-${vencRaw.slice(4, 6)}-${vencRaw.slice(6, 8)}`
        : null;

    return { cae, vencimientoCAE };
}

// ---------------------------------------------------------------------------
// Función pública
// ---------------------------------------------------------------------------

/**
 * Emite una Factura C a Consumidor Final (sin IVA, monotributo/exento).
 *
 * Lee AFIP_CERT y AFIP_KEY desde variables de entorno (PEM completo).
 *
 * @param {number} monto  Importe total en pesos
 * @returns {{ CAE: string, vencimientoCAE: string, nroComprobante: number }}
 */
async function emitirFacturaC(monto, fechaVenta = null) {
    const { cert, key } = leerCredenciales();

    // 1. Autenticación WSAA
    const ta = await obtenerTA(cert, key);

    // 2. Último comprobante autorizado para Factura C (tipo 11), punto de venta 1
    const ultimo         = await getUltimoComprobante(ta.token, ta.sign, PTO_VTA, 11);
    const nroComprobante = ultimo + 1;

    // 3. Fecha de emisión YYYYMMDD (usa la fecha de la venta si fue registrada con otra fecha)
    let fecha;
    if (fechaVenta) {
        fecha = fechaVenta.replace(/-/g, '');
    } else {
        const hoy = new Date();
        fecha = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}`;
    }

    // 4. Solicitar CAE
    const { cae, vencimientoCAE } = await solicitarCAE(ta.token, ta.sign, {
        ptoVta:         PTO_VTA,
        cbteTipo:       11,   // Factura C
        concepto:       1,    // Productos
        docTipo:        99,   // Consumidor Final
        docNro:         0,
        nroComprobante,
        fecha,
        impTotal:          monto,
        condIVAReceptor:   5,   // 5 = Consumidor Final (RG 5616)
    });

    return { CAE: cae, vencimientoCAE, nroComprobante };
}

module.exports = { emitirFacturaC };
