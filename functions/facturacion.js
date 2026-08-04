'use strict';

const fs     = require('fs');
const path   = require('path');

// Ruta explícita: dotenv por defecto busca ".env" relativo al directorio desde el que se invocó
// node (process.cwd()), no relativo a este archivo. Si este módulo se corre como script suelto
// desde la raíz del repo (ej. "node functions/verificar-emisor1.js"), sin esto cargaría por
// error el .env de la raíz (el del frontend, con las variables VITE_*) en vez de functions/.env.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const https  = require('https');
const forge  = require('node-forge');
const axios  = require('axios');

// Reutiliza la app default de Firebase Admin si ya fue inicializada (caso normal: index.js
// la inicializa antes de hacer require('./facturacion')). Necesario para cachear el Ticket de
// Acceso de WSAA en Firestore (ver obtenerTA).
//
// En Cloud Functions / el emulador, admin.initializeApp() sin argumentos sigue funcionando
// exactamente igual que antes (detecta projectId/credenciales del entorno solo).
//
// Corriendo como script suelto local (node functions/verificar-emisor1.js) NO hay metadata de
// GCP de la que inferir el projectId ("Unable to detect a Project Id in the current environment")
// — en ese caso lo tomamos de .firebaserc (mismo project que usa el resto del repo) y usamos
// functions/service-account.json (ya existe, lo usa la integración de Google Sheets) como
// credencial explícita.
const admin = require('firebase-admin');
if (!admin.apps.length) {
    const enEntornoCloud = !!(process.env.K_SERVICE || process.env.FUNCTION_TARGET || process.env.FUNCTIONS_EMULATOR);
    if (enEntornoCloud) {
        admin.initializeApp();
    } else {
        const firebaseRcPath = path.join(__dirname, '..', '.firebaserc');
        const serviceAccountPath = path.join(__dirname, 'service-account.json');
        if (!fs.existsSync(firebaseRcPath) || !fs.existsSync(serviceAccountPath)) {
            throw new Error(
                'No se pudo inicializar Firebase Admin para un script local: falta .firebaserc ' +
                'en la raíz del repo o functions/service-account.json.'
            );
        }
        const { projects } = JSON.parse(fs.readFileSync(firebaseRcPath, 'utf8'));
        admin.initializeApp({
            credential: admin.credential.cert(require(serviceAccountPath)),
            projectId:  projects.default,
        });
    }
}
const db = admin.firestore();

// AFIP/ARCA usa DH keys de 1024 bits que Node.js 18+ rechaza por defecto.
// Este agente baja el SECLEVEL solo para las llamadas al WSFE.
const wsfeAgent = new https.Agent({
    ciphers: 'DEFAULT:@SECLEVEL=0',
});

// ⚠️  PRODUCCIÓN — estos certificados son reales, las facturas emitidas son válidas ante ARCA
const WSAA_URL = 'https://wsaa.afip.gov.ar/ws/services/LoginCms';
const WSFE_URL = 'https://servicios1.afip.gov.ar/wsfev1/service.asmx';

// ---------------------------------------------------------------------------
// Credenciales del emisor (objeto de functions/emisores.js)
// ---------------------------------------------------------------------------
function leerCredenciales(emisor) {
    const raw_cert = emisor.cert;
    const raw_key  = emisor.key;

    if (!raw_cert || !raw_key || !emisor.cuit || !emisor.ptoVta) {
        throw new Error(
            `Faltan credenciales/configuración para el emisor "${emisor.id}".\n` +
            'Revisá functions/.env y functions/emisores.js (cuit/cert/key/ptoVta deben estar completos).'
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
// WSAA — Obtener Ticket de Acceso, cacheado en Firestore por CUIT (colección
// wsaa_tokens, doc ID = emisor.cuit). ARCA rechaza pedir un TA nuevo si el
// anterior sigue vigente (~12hs), así que el cache tiene que sobrevivir entre
// cold starts e instancias concurrentes de la Cloud Function — un solo valor
// en memoria de proceso (como antes) no alcanza con dos emisores.
//
// Lock optimista (fetchingDesde): si dos invocaciones concurrentes del MISMO
// CUIT ven "no hay TA vigente" al mismo tiempo, sin esto ambas pedirían un TA
// nuevo a WSAA y una de las dos recibiría el fault "el CEE ya posee un TA
// válido para el acceso solicitado". Con el lock, la segunda espera unos
// segundos y relee el cache en vez de duplicar el pedido.
// ---------------------------------------------------------------------------
async function obtenerTA(emisor) {
    const ref     = db.collection('wsaa_tokens').doc(emisor.cuit);
    const margenMs = 5 * 60 * 1000; // 5 min de margen antes de expirar

    const snap = await ref.get();
    const data = snap.data();

    if (data?.expiracion && new Date(data.expiracion) > new Date(Date.now() + margenMs)) {
        return { token: data.token, sign: data.sign };
    }

    const lockVigente = data?.fetchingDesde &&
        (Date.now() - new Date(data.fetchingDesde).getTime()) < 15000; // 15s
    if (lockVigente) {
        await new Promise(r => setTimeout(r, 3000));
        return obtenerTA(emisor);
    }

    await ref.set({ fetchingDesde: new Date().toISOString() }, { merge: true });

    const { cert, key } = leerCredenciales(emisor);
    const tra        = crearTRA('wsfe');
    const cmsFirmado = firmarTRA(tra, cert, key);

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

    const nuevoTA = { token, sign, expiracion: exp || new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), fetchingDesde: null };
    await ref.set(nuevoTA);
    return { token: nuevoTA.token, sign: nuevoTA.sign };
}

// ---------------------------------------------------------------------------
// WSFE — Helpers
// ---------------------------------------------------------------------------
function authXml(token, sign, cuit) {
    return `<ar:Auth>
        <ar:Token>${token}</ar:Token>
        <ar:Sign>${sign}</ar:Sign>
        <ar:Cuit>${cuit}</ar:Cuit>
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
async function getUltimoComprobante(ta, emisor, cbteTipo) {
    const xml = await llamarWSFE('FECompUltimoAutorizado', `
    <ar:FECompUltimoAutorizado>
      ${authXml(ta.token, ta.sign, emisor.cuit)}
      <ar:PtoVta>${emisor.ptoVta}</ar:PtoVta>
      <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>`);

    const nro = xml.match(/<CbteNro>(\d+)<\/CbteNro>/)?.[1];
    if (nro == null) throw new Error('FECompUltimoAutorizado: no se encontró CbteNro en:\n' + xml);
    return parseInt(nro, 10);
}

// ---------------------------------------------------------------------------
// WSFE — FEParamGetCondicionIvaReceptor
// Tabla de referencia de ARCA con los Id/Desc válidos para "Condición Frente
// al IVA del receptor" (obligatorio en FECAESolicitar desde el 01/09/2026).
// Es una tabla GLOBAL (no depende del CUIT que la consulta), así que el
// cache es una simple variable de módulo, no hace falta Firestore.
// ---------------------------------------------------------------------------
let _condIvaReceptorCache = null;

async function obtenerCondicionIvaReceptorId(token, sign, cuit, descripcionBuscada = 'Consumidor Final') {
    if (_condIvaReceptorCache != null) return _condIvaReceptorCache;

    const xml = await llamarWSFE('FEParamGetCondicionIvaReceptor', `
    <ar:FEParamGetCondicionIvaReceptor>
      ${authXml(token, sign, cuit)}
    </ar:FEParamGetCondicionIvaReceptor>`);

    const buscado = descripcionBuscada.trim().toLowerCase();
    const bloques = [...xml.matchAll(/<CondicionIvaReceptor>([\s\S]*?)<\/CondicionIvaReceptor>/g)];
    for (const [, bloque] of bloques) {
        const id   = bloque.match(/<Id>(\d+)<\/Id>/)?.[1];
        const desc = bloque.match(/<Desc>([\s\S]*?)<\/Desc>/)?.[1]?.trim();
        if (id && desc && desc.toLowerCase() === buscado) {
            _condIvaReceptorCache = parseInt(id, 10);
            return _condIvaReceptorCache;
        }
    }

    throw new Error(`FEParamGetCondicionIvaReceptor: no se encontró "${descripcionBuscada}" en la respuesta:\n${xml}`);
}

// ---------------------------------------------------------------------------
// WSFE — FECAESolicitar
// ---------------------------------------------------------------------------
async function solicitarCAE(ta, emisor, datos) {
    const xml = await llamarWSFE('FECAESolicitar', `
    <ar:FECAESolicitar>
      ${authXml(ta.token, ta.sign, emisor.cuit)}
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${emisor.ptoVta}</ar:PtoVta>
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
// Funciones públicas
// ---------------------------------------------------------------------------

/**
 * Emite una Factura C a Consumidor Final (sin IVA, monotributo/exento).
 *
 * @param {number} monto  Importe total en pesos
 * @param {object} emisor Objeto de functions/emisores.js (EMISORES.alias1 / EMISORES.alias2)
 * @returns {{ CAE: string, vencimientoCAE: string, nroComprobante: number }}
 */
async function emitirFacturaC(monto, emisor) {
    // 1. Autenticación WSAA (cacheada por CUIT en Firestore)
    const ta = await obtenerTA(emisor);

    // 2. Condición Frente al IVA del receptor — ver "Rollout seguro" en emisores.js:
    //    valor histórico hardcodeado para emisores con el flag apagado, dinámico (consultado
    //    en vivo contra WSFEv1) para los que lo tengan activado.
    let condIVAReceptor = 5; // 5 = Consumidor Final (valor histórico, sin cambios para emisores con el flag en false)
    if (emisor.usarCondicionIvaDinamica) {
        condIVAReceptor = await obtenerCondicionIvaReceptorId(ta.token, ta.sign, emisor.cuit);
    }

    // 3. Último comprobante autorizado para Factura C (tipo 11), punto de venta del emisor
    const ultimo         = await getUltimoComprobante(ta, emisor, 11);
    const nroComprobante = ultimo + 1;

    // 4. Fecha de emisión YYYYMMDD
    const hoy   = new Date();
    const fecha = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}`;

    // 5. Solicitar CAE
    const { cae, vencimientoCAE } = await solicitarCAE(ta, emisor, {
        cbteTipo:       11,   // Factura C
        concepto:       1,    // Productos
        docTipo:        99,   // Consumidor Final
        docNro:         0,
        nroComprobante,
        fecha,
        impTotal:          monto,
        condIVAReceptor,
    });

    return { CAE: cae, vencimientoCAE, nroComprobante };
}

/**
 * Consulta de SOLO LECTURA: último comprobante autorizado para un emisor. No llama a
 * FECAESolicitar bajo ninguna circunstancia — no puede emitir ni consumir numeración fiscal.
 *
 * @param {object} emisor
 * @param {number} cbteTipo Default 11 (Factura C)
 */
async function consultarUltimoComprobante(emisor, cbteTipo = 11) {
    const ta = await obtenerTA(emisor);
    return getUltimoComprobante(ta, emisor, cbteTipo);
}

module.exports = { emitirFacturaC, consultarUltimoComprobante };
