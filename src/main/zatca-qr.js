// توليد باركود (QR) للفاتورة الضريبية السعودية وفق معيار ZATCA
// يعتمد على صيغة TLV ثم Base64 ثم توليد صورة QR (PNG)
// المتطلبات: qrcode (تم تثبيتها كما هو ظاهر)

const fs = require('fs');
const path = require('path');
let QRCode;
try { QRCode = require('qrcode'); } catch (e) { QRCode = null; }

// بناء حقل TLV (Tag-Length-Value)
function _tlv(tag, value) {
  const vBuf = Buffer.from(String(value), 'utf8');
  const tBuf = Buffer.from([tag]);
  const lBuf = Buffer.from([vBuf.length]);
  return Buffer.concat([tBuf, lBuf, vBuf]);
}

// إنشاء سلسلة TLV ثم تحويلها Base64
function buildZatcaTLV({ sellerName, vatNumber, invoiceDate, totalWithVat, vatAmount }) {
  if (!sellerName) throw new Error('Missing sellerName');
  if (!vatNumber) throw new Error('Missing vatNumber');
  if (!invoiceDate) throw new Error('Missing invoiceDate');
  if (totalWithVat == null) throw new Error('Missing totalWithVat');
  if (vatAmount == null) throw new Error('Missing vatAmount');
  const iso = new Date(invoiceDate).toISOString();
  const fields = Buffer.concat([
    _tlv(1, sellerName),
    _tlv(2, vatNumber),
    _tlv(3, iso),
    _tlv(4, String(totalWithVat)),
    _tlv(5, String(vatAmount))
  ]);
  return fields.toString('base64');
}

/**
 * توليد ملف QR PNG وحفظه
 * @param {Object} params
 * @param {string} params.sellerName اسم المورد
 * @param {string|number} params.vatNumber الرقم الضريبي للمورد
 * @param {string|Date} params.invoiceDate تاريخ/وقت الفاتورة (أي قيمة تقبلها Date)
 * @param {number|string} params.totalWithVat إجمالي الفاتورة مع الضريبة
 * @param {number|string} params.vatAmount مبلغ الضريبة
 * @param {string} [params.outputDir] مجلد الحفظ (افتراضي exports)
 * @param {string} [params.fileName] اسم الملف (افتراضي invoice_qr.png)
 * @returns {Promise<{file:string, base64TLV:string}>}
 */
async function generateZatcaInvoiceQR(params) {
  if (!QRCode) throw new Error('مكتبة qrcode غير مثبتة');
  const base64TLV = buildZatcaTLV(params);
  const outputDir = params.outputDir || path.join(process.cwd(), 'exports');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const fileName = params.fileName || 'invoice_qr.png';
  const filePath = path.join(outputDir, fileName);
  // توليد صورة PNG (نستعمل مستوى خطأ متوسط M لضمان قراءة جيدة)
  await QRCode.toFile(filePath, base64TLV, {
    errorCorrectionLevel: 'M',
    type: 'png',
    margin: 1,
    scale: 8
  });
  return { file: filePath, base64TLV };
}

module.exports = { buildZatcaTLV, generateZatcaInvoiceQR };
