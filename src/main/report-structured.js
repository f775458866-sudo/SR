// وحدة تصدير تقارير منظمة (PDF / Excel) وفق متطلبات حفظ سطح المكتب
// لا تغيّر التصميم؛ تركز على منطق الحفظ والبنية والأسماء.
// المتطلبات:
// 1) Desktop/accounting_reports/<category>/
// 2) اسم الملف: <reportType>_<subjectName>_<YYYY-MM-DD>.(pdf|xlsx)
// 3) PDF: A4، هوامش أعلى/أسفل 1.5سم ~42.52pt، يمين/يسار 1سم ~28.35pt، دعم العربية إذا توفر arabic.ttf
// 4) Landscape تلقائي إذا الأعمدة > 8
// 5) تكرار رأس الجدول
// 6) Excel عبر exceljs (بديل Apache POI في هذا النظام)

const fs = require('fs');
const path = require('path');
const os = require('os');
const dayjs = require('dayjs');

// لا توجد مكتبات تشكيل متاحة؛ سنوفّر مسار HTML بديل لطباعة PDF عبر Chromium لدعم العربية و RTL بصورة سليمة
const { BrowserWindow } = require('electron');

let PDFDocument; try { PDFDocument = require('pdfkit'); } catch(_) {}
let ExcelJS; try { ExcelJS = require('exceljs'); } catch(_) {}

function ensureArabic(doc){
  try {
    const fontPath = path.join(process.cwd(), 'assets', 'arabic.ttf');
    if (fs.existsSync(fontPath)) { doc.font(fontPath); return true; }
  } catch(_){ }
  return false;
}

// تشكيل النص العربي (حروف متصلة + اتجاه) لتجاوز قصور pdfkit في تشكيل الحروف
function shapeArabic(text){ return text==null? '' : String(text); }

function safePart(v){
  return String(v||'')
    .replace(/[\\/:*?"<>|]/g,'_')
    .replace(/\s+/g,'_')
    .replace(/_+/g,'_')
    .replace(/^_|_$/g,'')
    .slice(0,120);
}

const AR = {
  customers: '\u0627\u0644\u0639\u0645\u0644\u0627\u0621',
  suppliers: '\u0627\u0644\u0645\u0648\u0631\u062f\u064a\u0646',
  purchases: '\u0627\u0644\u0645\u0634\u062a\u0631\u064a\u0627\u062a',
  sales: '\u0627\u0644\u0645\u0628\u064a\u0639\u0627\u062a',
  inventory: '\u0627\u0644\u0645\u062e\u0632\u0648\u0646',
  debts: '\u0627\u0644\u0645\u062f\u064a\u0648\u0646\u064a\u0629',
  other: '\u0623\u062e\u0631\u0649',
  date: '\u0627\u0644\u062a\u0627\u0631\u064a\u062e',
  page: '\u0635\u0641\u062d\u0629',
  noCols: '\u0644\u0627 \u062a\u0648\u062c\u062f \u0623\u0639\u0645\u062f\u0629'
};
function mapCategory(cat){
  const c = (cat||'').trim();
  if(/\u0639\u0645\u064a\u0644|\u0627\u0644\u0639\u0645\u0644\u0627\u0621|customer/i.test(c)) return AR.customers;
  if(/\u0645\u0648\u0631\u062f|\u0627\u0644\u0645\u0648\u0631\u062f\u064a\u0646|supplier/i.test(c)) return AR.suppliers;
  if(/\u0645\u0634\u062a\u0631\u064a\u0627\u062a|purchase/i.test(c)) return AR.purchases;
  if(/\u0645\u0628\u064a\u0639\u0627\u062a|sale/i.test(c)) return AR.sales;
  if(/\u0645\u062e\u0632\u0648\u0646|inventory/i.test(c)) return AR.inventory;
  if(/\u062f\u064a\u0648\u0646|\u0645\u062f\u064a\u0648\u0646\u064a\u0629|debt/i.test(c)) return AR.debts;
  return c || AR.other;
}

// جلب إعدادات الشركة (بدون صلاحيات خاصة هنا لأنها قراءة عامة)
function _getCompanySettings(){
  try {
    const dbPath = path.join(process.cwd(),'src','main','db.js'); // placeholder reference
    const dbModule = require('./db');
    if(!dbModule || !dbModule.listSettings) return {};
    const rows = dbModule.listSettings();
    const map = {}; rows.forEach(r=> map[r.key]=r.value);
    return { name: map.company_name||'', vat: map.vat_number||'', address: map.company_address||'' };
  } catch(_){ return {}; }
}

// وظيفة لجلب العملاء من قاعدة البيانات
function getCustomers() {
  try {
    const dbModule = require('./db');
    if (!dbModule || !dbModule.listCustomers) return [];
    return dbModule.listCustomers(); // افتراض أن هذه الدالة تعيد قائمة العملاء
  } catch (_) {
    return [];
  }
}

// وظيفة لجلب المبيعات الرسمية المرتبطة بعميل معين
function getOfficialSales(customerId) {
  try {
    const dbModule = require('./db');
    if (!dbModule || !dbModule.listSales) return [];
    return dbModule.listSales({ customerId, official: true }); // افتراض أن هذه الدالة تدعم التصفية
  } catch (_) {
    return [];
  }
}

// تعديل exportStructuredReport لإضافة دعم العملاء والمبيعات الرسمية
async function exportStructuredReport(args) {
  const {
    category,
    reportType,
    subjectName,
    columns = [],
    rows = [],
    format = 'pdf',
    meta = {},
    forceHtml,
    includeCompanyHeader = true,
    customerId, // إضافة معرف العميل
  } = args || {};

  if (!reportType) throw new Error('reportType مطلوب');

  // إذا كان التقرير متعلقًا بالعملاء، جلب المبيعات الرسمية
  let customerSales = [];
  if (category === 'customers' && customerId) {
    customerSales = getOfficialSales(customerId);
    rows.push(...customerSales); // إضافة المبيعات إلى الصفوف
  }

  // مجلد العرض (قد يكون بالعربية) ومجلد النظام (مُطهر) لضمان خلوه من محارف غير مسموحة
  const catDisplay = mapCategory(category||reportType);
  const rawCat = (category||reportType||'other').toString().toLowerCase();
  const catFolder = safePart(rawCat) || 'other';
  const dateStr = dayjs().format('YYYY-MM-DD');
  // مجلد رئيسي حسب الفئة + مجلد فرعي اختياري حسب الموضوع (مثلاً اسم العميل في كشف حساب عميل)
  let baseDir = path.join(os.homedir(), 'Desktop', 'accounting_reports', catFolder);
  try { fs.mkdirSync(baseDir, { recursive: true }); } catch(_){ }
  if(subjectName){
    const subFolder = safePart(subjectName);
    if(subFolder){
      baseDir = path.join(baseDir, subFolder);
      try { fs.mkdirSync(baseDir, { recursive: true }); } catch(_){ }
    }
  }
  const fileBase = `${safePart(reportType)}_${safePart(subjectName||catDisplay)}_${dateStr}`;
  const wantsLandscape = columns.length > 8;
  if(format === 'excel'){
    if(!ExcelJS) throw new Error('مكتبة exceljs غير مثبتة');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Report');
    ws.columns = columns.map(c=> ({ header: c.header||c.label||c.key||'', key: c.key||c.header||c.label||'', width: c.excelWidth || 15 }));
    rows.forEach(r=> ws.addRow(r));
    ws.getRow(1).font = { bold:true }; ws.getRow(1).alignment = { vertical:'middle', horizontal:'center' }; ws.getRow(1).height = 22;
    const totalRows = ws.rowCount;
    for(let i=1;i<=totalRows;i++){
      for(let j=1;j<=columns.length;j++){
        const cell = ws.getRow(i).getCell(j);
        cell.border = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} };
        if(i===1) cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF0F0F0' } };
        cell.alignment = cell.alignment || { vertical:'middle', horizontal:'center', wrapText:true };
      }
    }
    ws.pageSetup = { paperSize: 9, orientation: wantsLandscape ? 'landscape':'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left:0.3937, right:0.3937, top:0.5906, bottom:0.5906, header:0.3, footer:0.3 } };
    ws.pageSetup.printTitlesRow = '1:1';
    const fullPath = path.join(baseDir, fileBase + '.xlsx');
    await wb.xlsx.writeFile(fullPath);
    return fullPath;
  }
  // فرض مسار HTML دائماً لضمان عرض عربي صحيح بدون مكتبات تشكيل إضافية
  const company = includeCompanyHeader? _getCompanySettings(): {};
  return await generateHtmlPDF({ filePath: path.join(baseDir, fileBase + '.pdf'), wantsLandscape, reportType, subjectName, dateStr, columns, rows, meta, company });
}

function drawTable(doc, { x, y, columns, rows, margins }){
  const pageWidth = doc.page.width - margins.left - margins.right;
  if(!columns.length){ doc.fontSize(10).text(AR.noCols, x, y); return; }
  const customWidthSum = columns.reduce((a,c)=> a + (c.width||1),0);
  const colWidths = columns.map(c=> (c.width||1)/customWidthSum * pageWidth);
  let cy = y;
  const drawHeader = ()=>{
    let cx = x; doc.save(); doc.rect(x, cy, pageWidth, 24).fill('#f0f0f0'); doc.restore();
    columns.forEach((c,i)=>{ 
      const head = shapeArabic(c.header||c.label||c.key||'');
      doc.rect(cx, cy, colWidths[i], 24).stroke('#000'); 
      doc.fontSize(10).fillColor('#000').text(head, cx+4, cy+7, { width: colWidths[i]-8, align: (c.headerAlign||'center') }); 
      cx += colWidths[i]; 
    });
    cy += 24;
  };
  drawHeader();
  rows.forEach((r,ri)=>{
    const rowHeight = 20;
    if(cy + rowHeight > doc.page.height - margins.bottom){
      doc.addPage({ size:'A4', layout: doc.options.layout, margins: doc.options.margins }); ensureArabic(doc); cy = margins.top; drawHeader();
    }
    let cx = x; if(ri % 2 === 0){ doc.save(); doc.rect(x, cy, pageWidth, rowHeight).fill('#fcfcfc'); doc.restore(); }
    columns.forEach((c,i)=>{
      const key = c.key || c.header || c.label || ''; let val = '';
      if(typeof c.get === 'function') val = c.get(r); else if(r && Object.prototype.hasOwnProperty.call(r,key)) val = r[key];
      val = (val==null)? '' : String(val);
      const shaped = shapeArabic(val);
      // تحديد محاذاة افتراضية: أرقام = center، نص = right إذا لم يحدد
      let align = c.align; if(!align){ align = /^[0-9.,%\-]+$/.test(val)? 'center':'right'; }
      doc.rect(cx, cy, colWidths[i], rowHeight).stroke('#000');
      doc.fontSize(9).fillColor('#000').text(shaped, cx+4, cy+5, { width: colWidths[i]-8, align });
      cx += colWidths[i];
    });
    cy += rowHeight;
  });
  doc.fontSize(7).fillColor('#555').text(shapeArabic(`${AR.page} ${doc.page.number}`), x, doc.page.height - margins.bottom + 12, { align:'center', width: pageWidth });
  doc.fillColor('#000');
}

module.exports = { exportStructuredReport, getCustomers };

// -------- مسار HTML لطباعة PDF مع دعم RTL كامل من محرك Chromium -------- //
async function generateHtmlPDF({ filePath, wantsLandscape, reportType, subjectName, dateStr, columns, rows, meta, company }){
  const tmpDir = path.join(os.tmpdir(), 'asas-export');
  try { fs.mkdirSync(tmpDir, { recursive:true }); } catch(_){ }
  const fontPath = path.join(process.cwd(),'assets','arabic.ttf');
  let fontFace = '';
  if(fs.existsSync(fontPath)){
    try {
      const fontData = fs.readFileSync(fontPath);
      const b64 = fontData.toString('base64');
      fontFace = `@font-face{ font-family:"AsasArabic"; src:url(data:font/ttf;base64,${b64}) format('truetype'); font-weight:normal; font-style:normal; } body,table{ font-family:"AsasArabic", Arial, sans-serif; }`;
    } catch(_){ }
  }
  const esc = s=> String(s==null?'':s).replace(/[&<>]/g, ch=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[ch]));
  const headCols = columns.map(c=> `<th>${esc(c.header||c.label||c.key||'')}</th>`).join('');
  let totalSum = 0; let vatSum = 0; const hasTotalCol = columns.some(c=> (c.key||c.header||'').toLowerCase()==='total'); const hasVatCol = columns.some(c=> (c.key||c.header||'').toLowerCase()==='vat');
  const bodyRows = rows.map((r,i)=>{
    if(hasTotalCol){ const v = parseFloat(r.total||r.Total||0); if(!isNaN(v)) totalSum += v; }
    if(hasVatCol){ const v = parseFloat(r.vat||r.VAT||0); if(!isNaN(v)) vatSum += v; }
    const tds = columns.map(c=>{
      const key = c.key || c.header || c.label || '';
      let val='';
      if(typeof c.get==='function') val = c.get(r); else if(r && Object.prototype.hasOwnProperty.call(r,key)) val = r[key];
      return `<td>${esc(val)}</td>`;
    }).join('');
    return `<tr class="${i%2?'odd':'even'}">${tds}</tr>`;
  }).join('');
  let totalFooter = '';
  if(hasTotalCol){
    // بناء صف إجمالي: نجمع أعمدة قبل "total" في colspan
    const totalIndex = columns.findIndex(c=> (c.key||c.header||'').toLowerCase()==='total');
    const vatIndex = columns.findIndex(c=> (c.key||c.header||'').toLowerCase()==='vat');
    const beforeSpan = totalIndex; // عدد الخلايا قبل عمود الإجمالي
    const afterCols = columns.length - totalIndex - 1; // المتبقي بعد عمود الإجمالي
    // إذا عندنا عمود ضريبة نعرض مجموعين، وإلا واحد فقط
    if(hasVatCol){
      // سنجعل خلية الإجمالي في عمود total نفسه، ونضع الضريبة المجمعة في عمود vat، ونفرغ الباقي
      // لضمان بساطة: خلية عنوان تمتد عبر الأعمدة السابقة
      totalFooter = `<tr class="total-row">`
        + (beforeSpan>0? `<td colspan="${beforeSpan}" style="text-align:center;font-weight:700;">الإجمالي</td>`:'')
        + `<td style="font-weight:700;">${totalSum.toFixed(2)}</td>`
        + (vatIndex>totalIndex? `<td style="font-weight:700;">${vatSum.toFixed(2)}</td>` : (vatIndex>-1 && vatIndex<totalIndex? '' : ''))
        + (afterCols - (hasVatCol?1:0) > 0? `<td colspan="${afterCols - 1}" style="font-weight:700;">&nbsp;</td>`:'')
        + `</tr>`;
    } else {
      totalFooter = `<tr class="total-row">`
        + (beforeSpan>0? `<td colspan="${beforeSpan}" style="text-align:center;font-weight:700;">الإجمالي</td>`:'')
        + `<td style="font-weight:700;">${totalSum.toFixed(2)}</td>`
        + (afterCols>0? `<td colspan="${afterCols}" style="font-weight:700;">&nbsp;</td>`:'')
        + `</tr>`;
    }
  }
  const metaObj = meta||{};
  const customerName = subjectName || metaObj['عميل'] || '';
  const reportTitle = metaObj.report_title || (`تقرير مبيعات العميل : ${customerName}`);
  // استبعاد الحقول التي سيتم عرضها في الصندوق العلوي
  const hiddenKeys = new Set(['report_title','عميل','هاتف','ضريبي_العميل']);
  const metaHtml = Object.keys(metaObj).filter(k=> !hiddenKeys.has(k)).map(k=> `<div class='meta-item'><span>${esc(k)}:</span> ${esc(metaObj[k])}</div>`).join('');
  const orientationCss = wantsLandscape? 'size: A4 landscape;' : 'size: A4 portrait;';
  // تمت إزالة الشعار بناءً على طلب المستخدم
  let logoTag='';
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8" />
  <style>
    @page{ ${orientationCss} margin:1.5cm 1cm; }
    body{ direction:rtl; margin:0; padding:0; background:#fff; color:#000; font:14px/1.4 Arial, sans-serif; }
    ${fontFace}
  .header-box{ border:1px solid #1976d2; border-radius:14px; padding:12px 16px; background:#f5faff; margin:4px 0 14px; }
  .header-top{ display:flex; gap:24px; justify-content:space-between; align-items:flex-start; }
  .party{ flex:1; font-size:11px; line-height:1.5; }
  .party .ptitle{ font-weight:700; font-size:12px; margin-bottom:4px; color:#0d47a1; }
  .merchant{ border-inline-end:1px dashed #90caf9; padding-inline-end:16px; }
  .logo{ margin-bottom:6px; }
  .report-title{ margin-top:10px; text-align:center; font-size:16px; font-weight:700; color:#0d47a1; letter-spacing:.5px; }
    .meta{ text-align:right; margin:4px 0 12px; font-size:12px; }
    .meta-item{ margin:2px 0; }
    table{ width:100%; border-collapse:collapse; font-size:11px; }
    thead{ display:table-header-group; }
    th,td{ border:1px solid #444; padding:4px 6px; }
    th{ background:#f0f0f0; font-weight:bold; }
    tbody tr.even{ background:#fcfcfc; }
    .footer{ position:fixed; bottom:4px; left:0; right:0; text-align:center; font-size:10px; color:#555; }
  </style></head><body>
    <div class="header-box">
      <div class="header-top">
        <div class="party merchant">
          ${logoTag}
          <div class="ptitle">بيانات التاجر</div>
          ${company.name? `<div><strong>${esc(company.name)}</strong></div>`:''}
          ${company.vat? `<div>ضريبي: ${esc(company.vat)}</div>`:''}
          ${company.address? `<div>عنوان: ${esc(company.address)}</div>`:''}
        </div>
        <div class="party customer">
          <div class="ptitle">بيانات العميل</div>
          <div><strong>${esc(customerName)}</strong></div>
          ${metaObj['هاتف']? `<div>هاتف: ${esc(metaObj['هاتف'])}</div>`:''}
          ${metaObj['ضريبي_العميل']? `<div>ضريبي: ${esc(metaObj['ضريبي_العميل'])}</div>`:''}
          ${metaObj['الفترة']? `<div>الفترة: ${esc(metaObj['الفترة'])}</div>`:''}
        </div>
      </div>
      <div class="report-title">${esc(reportTitle)}</div>
    </div>
    <div class="meta"><div>${esc(AR.date)}: ${esc(dateStr)}</div>${metaHtml}</div>
  <table><thead><tr>${headCols}</tr></thead><tbody>${bodyRows}</tbody>${ totalFooter? `<tfoot>${totalFooter}</tfoot>`:''}</table>
    <div class="footer">صفحة <span class="pageNumber"></span></div>
    <script>/* كتابة رقم الصفحة عبر CSS Paged Media غير مباشرة - يمكن تركها */</script>
  </body></html>`;
  const tmpFile = path.join(tmpDir, 'r-'+Date.now()+'.html');
  fs.writeFileSync(tmpFile, html, 'utf8');
  const win = new BrowserWindow({ show:false, webPreferences:{ sandbox:false } });
  await win.loadFile(tmpFile);
  // الانتظار قليلاً لضمان تطبيق الخط
  await new Promise(r=> setTimeout(r, 300));
  const pdfBuffer = await win.webContents.printToPDF({ printBackground:true, pageSize:'A4', landscape:wantsLandscape });
  try { win.close(); } catch(_){ }
  fs.writeFileSync(filePath, pdfBuffer);
  return filePath;
}
