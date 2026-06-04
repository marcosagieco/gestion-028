'use strict';

const PDFDocument = require('pdfkit');
const QRCode     = require('qrcode');
const fs         = require('fs');
const path       = require('path');

// ─── Datos del emisor (constantes fiscales) ───────────────────────────────────
const EMISOR = {
    razonSocial:       '028 Import',
    razonSocialFiscal: 'BUNGE LUCIO FELIX',
    cuit:              '20-48459795-3',
    cuitNum:           20484597953,
    condIVA:           'Responsable Monotributo',
    inicioAct:         '01/05/2026',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const money      = n => '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const padPtoVta  = n => String(n).padStart(5, '0');
const padNroCbte = n => String(n).padStart(8, '0');
const nroCbteStr = (pv, n) => `${padPtoVta(pv)}-${padNroCbte(n)}`;

// ─── URL QR ARCA ──────────────────────────────────────────────────────────────
function buildQRUrl({ ptoVta, nroCmp, fecha, importe, tipoDocRec, nroDocRec, codAut }) {
    const payload = {
        ver: 1, fecha,
        cuit:       EMISOR.cuitNum,
        ptoVta,
        tipoCmp:    11,
        nroCmp,
        importe,
        moneda:     'PES',
        ctz:        1,
        tipoDocRec,
        nroDocRec,
        tipoCodAut: 'E',
        codAut:     parseInt(codAut),
    };
    return 'https://www.afip.gob.ar/fe/qr/?p=' + Buffer.from(JSON.stringify(payload)).toString('base64');
}

// ─── Render del contenido del PDF ────────────────────────────────────────────
function _renderPDF(doc, { ptoVta, numero, fechaDisplay, cae, vencCAEDisp,
    receptorNombre, condIVAReceptor, items, total, qrBuffer }) {

    const PW       = doc.page.width;
    const MX       = 40;
    const CW       = PW - MX * 2;
    const C_DARK   = '#1a2e4a';
    const C_BLUE   = '#2563eb';
    const C_GRAY   = '#6b7280';
    const C_LGRAY  = '#f3f4f6';
    const C_BORDER = '#d1d5db';
    const C_WHITE  = '#ffffff';

    // Banda superior
    doc.rect(0, 0, PW, 8).fill(C_BLUE);

    let y = 20;

    // Header 3 columnas: EMISOR | C | COMPROBANTE
    const cBoxW = 72;
    const cBoxH = 100;
    const cBoxX = (PW - cBoxW) / 2;
    const col1W = cBoxX - MX - 8;
    const col3X = cBoxX + cBoxW + 8;
    const col3W = PW - MX - col3X;

    // Emisor (izquierda)
    doc.fontSize(15).font('Helvetica-Bold').fillColor(C_DARK)
       .text(EMISOR.razonSocial, MX, y, { width: col1W });
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C_DARK)
       .text(EMISOR.razonSocialFiscal, MX, y + 19, { width: col1W });
    doc.fontSize(8).font('Helvetica').fillColor(C_GRAY)
       .text(`CUIT: ${EMISOR.cuit}`,                           MX, y + 31, { width: col1W })
       .text(`Cond. IVA: ${EMISOR.condIVA}`,                   MX, y + 43, { width: col1W })
       .text('Domicilio: MIÑONES 2061',                        MX, y + 55, { width: col1W })
       .text('1428 - Ciudad Autónoma de Buenos Aires',         MX, y + 65, { width: col1W })
       .text(`Inicio de Actividades: ${EMISOR.inicioAct}`,     MX, y + 78, { width: col1W });

    // Caja central con la letra C
    doc.rect(cBoxX, y, cBoxW, cBoxH).lineWidth(2.5).strokeColor(C_DARK).stroke();
    doc.fontSize(44).font('Helvetica-Bold').fillColor(C_DARK)
       .text('C', cBoxX, y + 6, { width: cBoxW, align: 'center' });
    doc.fontSize(7).font('Helvetica').fillColor(C_GRAY)
       .text('Código 11', cBoxX, y + cBoxH - 15, { width: cBoxW, align: 'center' });

    // Comprobante (derecha)
    doc.fontSize(15).font('Helvetica-Bold').fillColor(C_DARK)
       .text('FACTURA C', col3X, y, { width: col3W, align: 'right' });
    doc.fontSize(9).font('Helvetica-Bold').fillColor(C_DARK)
       .text(`Nro. ${padNroCbte(numero)}`, col3X, y + 22, { width: col3W, align: 'right' });
    doc.fontSize(8).font('Helvetica').fillColor(C_GRAY)
       .text(`Pto. de Venta: ${padPtoVta(ptoVta)}`, col3X, y + 35, { width: col3W, align: 'right' })
       .text(`Fecha de Emisión: ${fechaDisplay}`,   col3X, y + 47, { width: col3W, align: 'right' });

    y += cBoxH + 16;

    // Línea divisoria
    doc.moveTo(MX, y).lineTo(PW - MX, y).lineWidth(2).strokeColor(C_DARK).stroke();
    y += 14;

    // Datos del receptor
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(C_GRAY).text('DATOS DEL RECEPTOR', MX, y);
    y += 12;

    doc.fontSize(8.5).font('Helvetica').fillColor(C_DARK);
    doc.font('Helvetica-Bold').text('Razón Social / Nombre: ', MX, y, { continued: true })
       .font('Helvetica').text(receptorNombre);
    doc.font('Helvetica-Bold').text('Condición IVA: ', col3X, y, { continued: true })
       .font('Helvetica').text(condIVAReceptor || 'Consumidor Final');
    y += 13;

    doc.font('Helvetica-Bold').text('CUIT / DNI: ', MX, y, { continued: true })
       .font('Helvetica').text('—');
    doc.font('Helvetica-Bold').text('Domicilio: ', col3X, y, { continued: true })
       .font('Helvetica').text('—');
    y += 13;

    doc.font('Helvetica-Bold').text('Documento: ', MX, y, { continued: true })
       .font('Helvetica').text('No informado');
    doc.font('Helvetica-Bold').text('Código ARCA receptor: ', col3X, y, { continued: true })
       .font('Helvetica').text('99 / 0');
    y += 20;

    // Línea fina
    doc.moveTo(MX, y).lineTo(PW - MX, y).lineWidth(0.5).strokeColor(C_BORDER).stroke();
    y += 14;

    // Tabla de ítems
    const T = {
        desc: { x: MX,             w: CW * 0.48 },
        cant: { x: MX + CW * 0.48, w: CW * 0.13 },
        pu:   { x: MX + CW * 0.61, w: CW * 0.19 },
        sub:  { x: MX + CW * 0.80, w: CW * 0.20 },
    };
    const ROW_H = 20;

    // Cabecera
    doc.rect(MX, y, CW, ROW_H).fill(C_DARK);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(C_WHITE);
    doc.text('DESCRIPCIÓN',  T.desc.x + 5, y + 5, { width: T.desc.w - 5 });
    doc.text('CANT.',        T.cant.x,     y + 5, { width: T.cant.w, align: 'center' });
    doc.text('PRECIO UNIT.', T.pu.x,       y + 5, { width: T.pu.w,   align: 'right' });
    doc.text('SUBTOTAL',     T.sub.x,      y + 5, { width: T.sub.w - 4, align: 'right' });
    y += ROW_H;

    // Filas
    items.forEach((item, i) => {
        doc.rect(MX, y, CW, ROW_H).fill(i % 2 === 0 ? C_WHITE : C_LGRAY);
        doc.fontSize(9).font('Helvetica').fillColor(C_DARK);
        doc.text(item.descripcion,       T.desc.x + 5, y + 5, { width: T.desc.w - 5 });
        doc.text(String(item.cantidad),  T.cant.x,     y + 5, { width: T.cant.w, align: 'center' });
        doc.text(money(item.precioUnit), T.pu.x,       y + 5, { width: T.pu.w,   align: 'right' });
        doc.text(money(item.subtotal),   T.sub.x,      y + 5, { width: T.sub.w - 4, align: 'right' });
        y += ROW_H;
    });

    // Borde tabla
    doc.rect(MX, y - ROW_H * (items.length + 1), CW, ROW_H * (items.length + 1))
       .lineWidth(0.5).strokeColor(C_BORDER).stroke();
    y += 12;

    // Nota monotributo + caja total
    doc.fontSize(7.5).font('Helvetica-Oblique').fillColor(C_GRAY)
       .text('El emisor no es responsable inscripto en IVA. No discrimina impuesto.',
             MX, y + 6, { width: CW * 0.60 });

    const totBoxW = 200, totBoxH = 30;
    const totBoxX = PW - MX - totBoxW;
    doc.rect(totBoxX, y, totBoxW, totBoxH).fill(C_DARK);
    doc.fontSize(10).font('Helvetica-Bold').fillColor(C_WHITE)
       .text('TOTAL', totBoxX + 10, y + 8, { width: 80 });
    doc.fontSize(14).font('Helvetica-Bold').fillColor(C_WHITE)
       .text(money(total), totBoxX + 80, y + 5, { width: totBoxW - 88, align: 'right' });

    y += totBoxH + 22;

    // Línea separadora
    doc.moveTo(MX, y).lineTo(PW - MX, y).lineWidth(1).strokeColor(C_BORDER).stroke();
    y += 16;

    // Sección CAE + QR
    const QR_SIZE = 95;
    const QR_X   = PW - MX - QR_SIZE;
    const TXT_W  = CW - QR_SIZE - 16;

    doc.image(qrBuffer, QR_X, y, { width: QR_SIZE, height: QR_SIZE });

    doc.fontSize(8).font('Helvetica-Bold').fillColor(C_DARK)
       .text('Comprobante autorizado por ARCA', MX, y);
    y += 14;

    doc.font('Helvetica-Bold').fillColor(C_DARK)
       .text('CAE N°:  ', MX, y, { continued: true })
       .font('Helvetica-Bold').fillColor(C_BLUE).text(cae);
    y += 13;

    doc.font('Helvetica-Bold').fillColor(C_DARK)
       .text('Vencimiento CAE:  ', MX, y, { continued: true })
       .font('Helvetica').fillColor(C_DARK).text(vencCAEDisp);
    y += 13;

    doc.font('Helvetica-Bold').fillColor(C_DARK)
       .text('Fecha de emisión:  ', MX, y, { continued: true })
       .font('Helvetica').fillColor(C_DARK).text(fechaDisplay);
    y += 20;

    doc.fontSize(7).font('Helvetica-Oblique').fillColor(C_GRAY)
       .text(
           'Comprobante emitido en los términos del Art. 36 de la R.G. N° 1415 (ARCA/AFIP). ' +
           'Esta representación impresa es válida como Comprobante Electrónico Autorizado (CEA).',
           MX, y, { width: TXT_W }
       );

    // Banda inferior
    doc.rect(0, doc.page.height - 8, PW, 8).fill(C_BLUE);
}

// ─── Función exportable: retorna Buffer ───────────────────────────────────────
async function generarFacturaPDFBuffer({
    ptoVta, numero, fecha, fechaDisplay,
    cae, vencCAEDisp,
    receptorNombre, tipoDoc, nroDoc, condIVAReceptor,
    items, total,
}) {
    const qrUrl    = buildQRUrl({ ptoVta, nroCmp: numero, fecha, importe: total,
                                  tipoDocRec: tipoDoc, nroDocRec: nroDoc, codAut: cae });
    const qrBuffer = await QRCode.toBuffer(qrUrl, {
        type: 'png', width: 150, margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
    });

    return new Promise((resolve, reject) => {
        const chunks = [];
        const doc = new PDFDocument({
            size:    'A4',
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            info:    { Title: `Factura C ${nroCbteStr(ptoVta, numero)}`, Author: EMISOR.razonSocial },
        });
        doc.on('data',  chunk => chunks.push(chunk));
        doc.on('end',   () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        _renderPDF(doc, { ptoVta, numero, fechaDisplay, cae, vencCAEDisp,
                          receptorNombre, condIVAReceptor, items, total, qrBuffer });
        doc.end();
    });
}

module.exports = { generarFacturaPDFBuffer, buildQRUrl, nroCbteStr };

// ─── Script standalone para uso manual ───────────────────────────────────────
if (require.main === module) {
    const FECHA = '2026-06-03';
    const [yy, mm, dd] = FECHA.split('-');

    generarFacturaPDFBuffer({
        ptoVta:          1,
        numero:          2,
        fecha:           FECHA,
        fechaDisplay:    `${dd}/${mm}/${yy}`,
        cae:             '86228193709416',
        vencCAEDisp:     '13/06/2026',
        receptorNombre:  'Consumidor Final',
        tipoDoc:         99,
        nroDoc:          0,
        condIVAReceptor: 'Consumidor Final',
        items: [{ descripcion: 'Venta al contado', cantidad: 1, precioUnit: 26000, subtotal: 26000 }],
        total: 26000,
    }).then(buffer => {
        const outFile = path.join(__dirname, `factura-c-${nroCbteStr(1, 2)}.pdf`);
        fs.writeFileSync(outFile, buffer);
        console.log(`✓ PDF generado: ${outFile}`);
    }).catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
    });
}
