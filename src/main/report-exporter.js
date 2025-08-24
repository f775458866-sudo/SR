// أداة تصدير تقارير عامة إلى PDF باستخدام pdfkit
// المتطلبات: npm i pdfkit

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const PDFDocument = require('pdfkit');

/**
 * تصدير تقرير إلى PDF
 * @param {Object} params
 * @param {string} params.type نوع التقرير (invoice, customer_report, sales_report ...)
 * @param {string|number} [params.identifier] رقم فاتورة / اسم عميل / معرف إضافي
 * @param {Array<any>} params.content مصفوفة عناصر (سلاسل أو كائنات)
 * @param {Object} [params.meta] كائن بيانات إضافية تُطبع أعلى التقرير
 * @returns {Promise<string>} مسار الملف الناتج
 */
async function exportReportPDF({ type, identifier, content, meta = {} }) {
  if (!type) throw new Error('type مطلوب');
  if (!Array.isArray(content)) throw new Error('content يجب أن يكون مصفوفة');

  const safe = s =>
    String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_\-آ-ي]+/gi, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const baseName = identifier
    ? `${safe(type)}_${safe(identifier)}`
    : `${safe(type)}_${dateStr}`;

  const reportsDir = path.join(os.homedir(), 'Desktop', 'Reports');
  await fsp.mkdir(reportsDir, { recursive: true });

  // معالجة تعارض الاسم
  let fileName = `${baseName}.pdf`;
  let attempt = 1;
  while (fs.existsSync(path.join(reportsDir, fileName))) {
    fileName = `${baseName}_${attempt++}.pdf`;
  }
  const fullPath = path.join(reportsDir, fileName);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const stream = fs.createWriteStream(fullPath);
  doc.pipe(stream);

  // العنوان
  doc.fontSize(18).text(titleFromType(type, identifier), { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#555').text(`تاريخ الإنشاء: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown();

  // ميتا (اختياري)
  const metaKeys = Object.keys(meta);
  if (metaKeys.length) {
    doc.fontSize(12).fillColor('#000').text('بيانات إضافية:', { underline: true });
    metaKeys.forEach(k => {
      doc.fontSize(10).fillColor('#222').text(`${k}: ${meta[k]}`);
    });
    doc.moveDown();
  }

  doc.fontSize(12).fillColor('#000').text('المحتوى:', { underline: true });
  doc.moveDown(0.5);

  const lineify = item => {
    if (item == null) return '';
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') return String(item);
    if (Array.isArray(item)) return item.map(lineify).join(' | ');
    if (typeof item === 'object') {
      return Object.entries(item)
        .map(([k, v]) => `${k}: ${formatValue(v)}`)
        .join(' | ');
    }
    return String(item);
  };

  content.forEach((row, idx) => {
    const line = lineify(row);
    if (!line) return;
    doc.fontSize(10).fillColor('#000').text(`${idx + 1}. ${line}`, { align: 'right' });
  });

  if (content.length === 0) {
    doc.fontSize(11).fillColor('#999').text('لا توجد بيانات', { align: 'center' });
  }

  doc.end();

  await new Promise((res, rej) => {
    stream.on('finish', res);
    stream.on('error', rej);
  });

  console.log('تم إنشاء التقرير:', fullPath);
  return fullPath;
}

function titleFromType(type, identifier) {
  const map = {
    invoice: 'فاتورة',
    customer_report: 'تقرير عميل',
    customer_statement: 'كشف حساب',
    inventory_report: 'تقرير مخزون',
    sales_report: 'تقرير مبيعات'
  };
  const base = map[type] || type;
  return identifier ? `${base} - ${identifier}` : base;
}

function formatValue(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? v : '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.join(',');
  if (typeof v === 'object') return Object.entries(v).map(([k, val]) => `${k}=${val}`).join(',');
  return String(v);
}

module.exports = { exportReportPDF };

// مثال استخدام (اختياري):
// (async () => {
//   await exportReportPDF({
//     type: 'invoice',
//     identifier: 1001,
//     meta: { العميل: 'شركة المثال', الإجمالي: '1500.00', الضريبة: '225.00' },
//     content: [
//       { المنتج: 'عنصر 1', الكمية: 2, السعر: 100 },
//       { المنتج: 'عنصر 2', الكمية: 3, السعر: 150 },
//       'ملاحظة: تم التسليم'
//     ]
//   });
// })();
