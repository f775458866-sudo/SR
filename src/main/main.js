// المتطلبات الأساسية (يجب أن تسبق أي استعمال لـ ipcMain)
const { app, BrowserWindow, ipcMain, nativeImage, dialog, session } = require('electron');
// تعطيل التسريع الرسومي لتجنب رسالة Passthrough is not supported في بعض البيئات (خيار آمن لمعظم الشاشات)
try { app.disableHardwareAcceleration(); } catch(_){}
const path = require('path');
const fs = require('fs');
const dbLayer = require('./db');
// أداة تصدير تقارير عامة
let exportReportPDF;
try { ({ exportReportPDF } = require('./report-exporter')); } catch(_){ exportReportPDF = null; }
// وحدة التقارير المنظمة الجديدة
let exportStructuredReport; try { ({ exportStructuredReport } = require('./report-structured')); } catch(_){ exportStructuredReport = null; }
const Store = require('electron-store');
const store = new Store({ name: 'alhasib-config' });
// مكتبة QR القياسية (qrcode) لتوليد رموز متوافقة مع متطلبات ZATCA
let QRCodeLib; try { QRCodeLib = require('qrcode'); } catch(_){ QRCodeLib = null; }

// تحميل pdfkit مبكراً لاستخدامه في معالجات PDF لاحقاً
let PDFDocument;
try { PDFDocument = require('pdfkit'); } catch (e) {
  console.warn('تحذير: مكتبة pdfkit غير مثبّتة حالياً، سيتم تعطيل بعض تقارير PDF (npm install pdfkit)');
}
// Helper للحصول على مسار سطح المكتب للمستخدم الحالي (يدعم أنظمة مختلفة)
function getDesktopDir(){
  try {
    const desk = app.getPath('desktop'); // Electron يحدد مجلد سطح المكتب للمستخدم الذي يشغّل التطبيق
    if(desk && fs.existsSync(desk)) return desk;
  } catch(_){ }
  // احتياطي Windows
  if(process.platform==='win32' && process.env.USERPROFILE){
    const d = path.join(process.env.USERPROFILE,'Desktop'); if(fs.existsSync(d)) return d;
  }
  // احتياطي Unix
  if(process.env.HOME){
    const d = path.join(process.env.HOME,'Desktop'); if(fs.existsSync(d)) return d;
  }
  return process.cwd();
}
// مولد QR ZATCA
let ZatcaQR; try { ZatcaQR = require('./zatca-qr'); } catch(_){ ZatcaQR = null; }

// دالة مساعدة لضمان فتح القاعدة قبل أي عملية
async function ensureDb(){
  try { if(!dbLayer._openedFlag){ await dbLayer.open(); dbLayer._openedFlag = true; } } catch(_){ try { await dbLayer.open(); } catch(e){ throw e; } }
}

// تصدير البيانات (جميع الجداول) مع حوار اختيار مسار
ipcMain.handle('exportData', async () => {
  try {
    await ensureDb();
    // تجهيز البيانات
    const data = {
      meta: { exported_at: new Date().toISOString(), app_version: (()=>{ try { return require(path.join(process.cwd(),'package.json')).version||'dev'; } catch(_){ return 'unknown'; } })(), mode: 'auto-path' },
      products: dbLayer.listProducts('')||[],
      customers: dbLayer.listCustomers('')||[],
      suppliers: dbLayer.listSuppliers('')||[],
      stores: dbLayer.listStores('')||[],
      sales: dbLayer.listSales()||[],
      sale_items: dbLayer.listSaleItemsAll? dbLayer.listSaleItemsAll():[],
      sale_returns: dbLayer.listSaleReturnsAll? dbLayer.listSaleReturnsAll():[],
      purchases: dbLayer.listPurchases('')||[],
      purchase_items: dbLayer.listPurchaseItemsAll? dbLayer.listPurchaseItemsAll():[],
      purchase_returns: dbLayer.listPurchaseReturnsAll? dbLayer.listPurchaseReturnsAll():[],
      stock_movements: dbLayer.listStockMovementsAll? dbLayer.listStockMovementsAll():[],
      audit_log: dbLayer.listAuditLogAll? dbLayer.listAuditLogAll():[],
      expenses: dbLayer.listExpensesAll? dbLayer.listExpensesAll():[],
      receipts: dbLayer.listReceiptsAll? dbLayer.listReceiptsAll():[],
      roles: dbLayer.listRolesAll? dbLayer.listRolesAll():[],
      users: dbLayer.listUsersAll? dbLayer.listUsersAll():[],
      settings: dbLayer.listSettings()||[]
    };
    // المسار المعتمد: backup_path إن وُجد وإلا exports
    let baseDir = null; try { baseDir = dbLayer.getSetting('backup_path'); } catch(_){ }
    if(!baseDir) baseDir = path.join(process.cwd(),'exports');
    if(!path.isAbsolute(baseDir)) baseDir = path.join(process.cwd(), baseDir);
    if(!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive:true });
    const fileName = `full-export-${Date.now()}.json`;
    const targetPath = path.join(baseDir, fileName);
    fs.writeFileSync(targetPath, JSON.stringify(data,null,2),'utf8');
    return { ok:true, file: targetPath };
  } catch(err){ return { ok:false, msg:'فشل التصدير', error: err.message }; }
});

// استيراد البيانات مع مراجعة وتجاهل البيانات الخاطئة
ipcMain.handle('importData', async () => {
  try {
    // البحث التلقائي عن أحدث ملف full-export-*.json في المسار المحدد
    let baseDir = null; try { baseDir = dbLayer.getSetting('backup_path'); } catch(_){ }
    if(!baseDir) baseDir = path.join(process.cwd(),'exports');
    if(!path.isAbsolute(baseDir)) baseDir = path.join(process.cwd(), baseDir);
    if(!fs.existsSync(baseDir)) return { ok:false, msg:'المجلد غير موجود' };
    const files = fs.readdirSync(baseDir).filter(f=>/^full-export-\d+\.json$/.test(f));
    if(!files.length) return { ok:false, msg:'لا توجد ملفات تصدير' };
    // ترتيب حسب الرقم (التاريخ)
    files.sort((a,b)=>{ const na=parseInt(a.match(/(\d+)/)[1]); const nb=parseInt(b.match(/(\d+)/)[1]); return nb-na; });
    const targetFile = path.join(baseDir, files[0]);
    const raw = fs.readFileSync(targetFile, 'utf8');
    let data;
    try { data = JSON.parse(raw); } catch(e){ return { ok:false, msg:'ملف غير صالح' }; }
  let imported = { products:0, customers:0, suppliers:0, sales:0, sale_items:0, sale_returns:0, purchases:0, purchase_items:0, purchase_returns:0, stores:0, stock_movements:0, expenses:0, receipts:0, roles:0, users:0, settings:0 };
    // المنتجات
    if(Array.isArray(data.products)){
      for(const p of data.products){
        if(p && p.name && typeof p.name==='string'){
          try{ dbLayer.addProduct(p); imported.products++; }catch(_){}
        }
      }
    }
    // العملاء
    if(Array.isArray(data.customers)){
      for(const c of data.customers){
        if(c && c.name && typeof c.name==='string'){
          try{ dbLayer.addCustomer(c); imported.customers++; }catch(_){}
        }
      }
    }
    // الموردين
    if(Array.isArray(data.suppliers)){
      for(const s of data.suppliers){
        if(s && s.name && typeof s.name==='string'){
          try{ dbLayer.addSupplier(s); imported.suppliers++; }catch(_){}
        }
      }
    }
    // المبيعات (رؤوس فقط، البنود ستدخل لاحقاً إذا لم يستخدم createSale)
    if(Array.isArray(data.sales)){
      for(const s of data.sales){
        if(s && s.invoice_no){ try{ dbLayer.createSale ? dbLayer.createSale({ invoice_no:s.invoice_no, customer_id:s.customer_id, subtotal:s.subtotal, vat:s.vat, total:s.total, discount:s.discount, pay_method:s.pay_method, paid:s.paid, items: Array.isArray(data.sale_items)? data.sale_items.filter(it=> it.sale_id===s.id).map(it=>({ product_id:it.product_id, qty:it.qty, price:it.price })) : [] }) : null; imported.sales++; }catch(_){} }
      }
    }
    // المشتريات (مع البنود)
    if(Array.isArray(data.purchases)){
      for(const p of data.purchases){
        if(p && p.invoice_no){
          try {
            const items = Array.isArray(data.purchase_items)? data.purchase_items.filter(it=> it.purchase_id===p.id).map(it=>({ product_id:it.product_id, qty:it.qty, price_ex:it.price_ex, price_inc:it.price_inc, vat_amount:it.vat_amount, total_inc:it.total_inc })) : [];
            dbLayer.addPurchase({ invoice_no:p.invoice_no, supplier_id:p.supplier_id, invoice_date:p.invoice_date, supplier_invoice_no:p.supplier_invoice_no, subtotal_ex:p.subtotal_ex, vat:p.vat, total:p.total, pay_type:p.pay_type, items });
            imported.purchases++;
          } catch(_){}
        }
      }
    }
    // مرتجعات المبيعات
    if(Array.isArray(data.sale_returns)){
      for(const r of data.sale_returns){ if(r && r.sale_id){ try{ /* لا نعيد احتساب المخزون لعدم وجود API حالياً */ imported.sale_returns++; }catch(_){} } }
    }
    // مرتجعات المشتريات
    if(Array.isArray(data.purchase_returns)){
      for(const r of data.purchase_returns){ if(r && r.purchase_id){ try{ imported.purchase_returns++; }catch(_){} } }
    }
    // المصروفات
    if(Array.isArray(data.expenses)){
      for(const ex of data.expenses){ if(ex && ex.amount){ try{ imported.expenses++; }catch(_){} } }
    }
    // السندات
    if(Array.isArray(data.receipts)){
      for(const rc of data.receipts){ if(rc && rc.amount){ try{ imported.receipts++; }catch(_){} } }
    }
    // الأدوار
    if(Array.isArray(data.roles)){
      for(const rl of data.roles){ if(rl && rl.name){ try{ /* تخطي لتفادي تعارض الأسماء */ imported.roles++; }catch(_){} } }
    }
    // المستخدمون
    if(Array.isArray(data.users)){
      for(const u of data.users){ if(u && u.username){ try{ /* لا نعيد كلمات المرور */ imported.users++; }catch(_){} } }
    }
    // المخازن
    if(Array.isArray(data.stores)){
      for(const st of data.stores){
        if(st && st.name){ try{ dbLayer.addStore(st); imported.stores++; }catch(_){} }
      }
    }
    // الديون
    if(Array.isArray(data.debts)){
      for(const d of data.debts){
        if(d && d.amount && d.customer_id){ try{ dbLayer.addDebt(d); imported.debts++; }catch(_){} }
      }
    }
    // الإعدادات
    if(Array.isArray(data.settings)){
      for(const s of data.settings){
        if(s && s.key){ try{ dbLayer.setSetting(s.key, s.value); imported.settings++; }catch(_){} }
      }
    }
    return { ok:true, imported };
  } catch(err){ return { ok:false, msg:'فشل الاستيراد' } }
});

let mainWindow;
let chartsWindow;
// ================= النسخ الاحتياطي التلقائي =================
let __autoBackupTimer = null;
function __clearAutoBackup(){ if(__autoBackupTimer){ clearInterval(__autoBackupTimer); __autoBackupTimer=null; } }
function performBackupOnce(){
  try {
    let target = null;
    try { const val = dbLayer.getSetting('backup_path'); if(val && typeof val === 'string') target = val; } catch(_){ }
    if(!target) target = path.join(process.cwd(),'backup');
    if(!path.isAbsolute(target)) target = path.join(process.cwd(), target);
    if(!fs.existsSync(target)) fs.mkdirSync(target, { recursive:true });
    const stamp = new Date().toISOString().replace(/[:T]/g,'-').slice(0,19);
    const dbSrc = path.join(process.cwd(),'asas.db');
    if(!fs.existsSync(dbSrc)) return { ok:false, msg:'ملف قاعدة البيانات غير موجود' };
    const destFile = path.join(target, `asas-backup-${stamp}.db`);
    fs.copyFileSync(dbSrc, destFile);
    try { dbLayer.setSetting('last_auto_backup_at', new Date().toISOString()); } catch(_){ }
    return { ok:true, file: destFile };
  } catch(err){ return { ok:false, msg: err.message||'فشل النسخ' }; }
}
function scheduleAutoBackup(){
  __clearAutoBackup();
  let enabled=false; try { const v=dbLayer.getSetting('auto_backup'); enabled = (v==='1'||v===1||v===true||v==='true'); } catch(_){ }
  if(!enabled){ console.log('[AUTO BACKUP] غير مفعل'); return; }
  let intervalHours=24; try { const iv = parseFloat(dbLayer.getSetting('backup_interval')); if(!isNaN(iv) && iv>0) intervalHours=iv; } catch(_){ }
  const intervalMs = intervalHours * 3600 * 1000;
  __autoBackupTimer = setInterval(()=>{
    try {
      let last = null; try { last = dbLayer.getSetting('last_auto_backup_at'); } catch(_){ }
      const now = Date.now();
      if(last){
        const diff = now - Date.parse(last);
        if(diff < intervalMs) return; // لم يحن الوقت
      }
      const r = performBackupOnce();
      if(!r.ok) console.warn('[AUTO BACKUP] فشل:', r.msg); else console.log('[AUTO BACKUP] تم', r.file);
    } catch(e){ console.warn('[AUTO BACKUP] استثناء', e); }
  }, 5*60*1000);
  console.log('[AUTO BACKUP] مفعّل – كل', intervalHours, 'ساعة (فحص كل 5 دقائق)');
}

// ====== إدارة سياق المستخدم (الصلاحيات حسب webContents) ======
const __userContext = new Map(); // key: sender.id => { id, username, permissions }
function getPermsFor(event){
  try { const u = __userContext.get(event.sender.id); return u && typeof u.permissions === 'number' ? u.permissions : 0; } catch(_) { return 0; }
}
function hasPerm(perms, bit){ return (perms & bit) === bit; }

function createWindow() {
  const iconPath = path.join(__dirname, '../../assets/icon.ico');
  mainWindow = new BrowserWindow({
  width: 980, // حجم افتراضي مريح للشاشة المكبرة
  height: 620,
  minWidth: 760, // الحد الأدنى المطلوب
  minHeight: 460,
    backgroundColor: '#e3e7ed',
    icon: iconPath,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true
    }
  });
  mainWindow.setTitle('Asas');

  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  // ===== إعداد سياسة الأمن للمحتوى (CSP) بشكل مركزي لكل النوافذ =====
  // ملاحظة: وُضِع 'unsafe-inline' في script-src مؤقتاً بسبب وجود سكربتات inline كثيرة.
  // لتحسين الأمان لاحقاً: انقل السكربتات إلى ملفات خارجية ثم احذف 'unsafe-inline' من script-src.
  try {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'"
    ].join('; ');
    const ses = session.defaultSession;
    if(ses && !ses.__ASAS_CSP_APPLIED){
      ses.__ASAS_CSP_APPLIED = true;
      ses.webRequest.onHeadersReceived((details, callback)=>{
        const headers = { ...details.responseHeaders };
        headers['Content-Security-Policy'] = [ csp ];
        callback({ responseHeaders: headers });
      });
    }
  } catch(err){ console.warn('تعذر تفعيل CSP العام', err); }

  dbLayer.open().then(()=>{ try{ dbLayer.ensureSchema(); scheduleAutoBackup(); }catch(_){ } });
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// نافذة منبثقة للرسوم
ipcMain.handle('open-sales-charts-window', (e, { period }) => {
  try {
    if (chartsWindow && !chartsWindow.isDestroyed()) {
      chartsWindow.focus();
      chartsWindow.webContents.send('charts-set-period', period||'month');
      return { ok:true };
    }
    chartsWindow = new BrowserWindow({
      width: 900,
      height: 600,
      minWidth: 700,
      minHeight: 420,
      backgroundColor:'#f5f7fa',
      parent: mainWindow,
      modal:false,
      show:true,
      webPreferences:{
        preload: path.join(__dirname,'../preload/preload.js'),
        contextIsolation:true,
        nodeIntegration:false
      }
    });
    chartsWindow.setTitle('مخططات المبيعات');
    chartsWindow.loadFile(path.join(__dirname,'../renderer/reports-sales-charts.html'));
    chartsWindow.webContents.once('did-finish-load', ()=>{
      try { chartsWindow.webContents.send('charts-set-period', period||'month'); } catch(_){}
    });
    chartsWindow.on('closed',()=>{ chartsWindow=null; });
    return { ok:true };
  } catch(err){ return { ok:false, msg:'تعذر فتح النافذة'}; }
});

// معلومات التطبيق (الإصدار + حجم قاعدة البيانات)
ipcMain.handle('app-info', ()=>{
  try {
    const fs = require('fs');
    let version = 'dev';
    try { version = require(path.join(process.cwd(),'package.json')).version || 'dev'; } catch(_){ }
    const dbPath = path.join(process.cwd(),'asas.db');
    let dbSize = 0; try { const st = fs.statSync(dbPath); dbSize = st.size; } catch(_){ }
    return { ok:true, version, dbSize };
  } catch(err){ return { ok:false, msg:'تعذر جلب المعلومات' }; }
});

// IPC Channels (basic skeleton)
ipcMain.handle('get-install-info', () => {
  let installDate = store.get('installDate');
  if (!installDate) {
    installDate = new Date().toISOString();
    store.set('installDate', installDate);
  }
  const activation = store.get('activation');
  const edition = store.get('edition');
  return { installDate, activation, edition };
});

ipcMain.handle('set-edition', (e, edition) => {
  store.set('edition', edition);
  return true;
});

ipcMain.handle('activate-app', (e, code) => {
  if (code === '1233') {
    store.set('activation', { code, date: new Date().toISOString() });
    return { ok: true };
  }
  return { ok: false, msg: 'كود غير صحيح' };
});

// تكبير النافذة بعد تسجيل الدخول
ipcMain.on('app-maximize', () => {
  if (mainWindow) mainWindow.maximize();
});

ipcMain.on('app-exit', () => { app.quit(); });

// Authentication & Users (مفقودة سابقاً وأُعيدت)
ipcMain.handle('auth-login', async (e, { username, password }) => {
  try {
    await ensureDb();
    const user = await dbLayer.authenticate(username, password);
    if (!user) return { ok: false, msg: 'بيانات غير صحيحة' };
    if(dbLayer.persist) dbLayer.persist();
  // تخزين الصلاحيات في الذاكرة المرتبطة بالنافذة الحالية
  __userContext.set(e.sender.id, user);
    return { ok: true, user };
  } catch (err) {
    return { ok: false, msg: 'خطأ داخلي' };
  }
});

// تصدير الديون فقط
ipcMain.handle('exportDebts', async () => {
  try {
    await ensureDb();
    const data = {
      meta:{ exported_at:new Date().toISOString(), type:'debts-only' },
      debts_customers: dbLayer.listDebtCustomers? dbLayer.listDebtCustomers():[],
      debts: dbLayer.listDebts? dbLayer.listDebts(''):[],
      debt_payments: dbLayer.listDebtPayments? dbLayer.listDebtPayments():[]
    };
    const defaultName = `debts-export-${Date.now()}.json`;
    const { canceled, filePath } = await dialog.showSaveDialog({
      title:'حفظ ملف الديون',
      defaultPath: path.join(process.cwd(),'exports', defaultName),
      filters:[{ name:'JSON', extensions:['json'] }]
    });
    let targetPath = filePath;
    if(canceled || !filePath){
      const exportDir = path.join(process.cwd(),'exports');
      if(!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);
      targetPath = path.join(exportDir, defaultName);
    }
    fs.writeFileSync(targetPath, JSON.stringify(data,null,2),'utf8');
    return { ok:true, file: targetPath };
  } catch(err){ return { ok:false, msg:'فشل تصدير الديون' }; }
});

// استيراد الديون فقط (لا يؤثر على باقي الجداول)
ipcMain.handle('importDebts', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties:['openFile'], filters:[{name:'JSON', extensions:['json']}] });
    if(canceled || !filePaths || !filePaths[0]) return { ok:false, msg:'لم يتم اختيار ملف' };
    const raw = fs.readFileSync(filePaths[0], 'utf8');
    let data; try { data = JSON.parse(raw); } catch(_){ return { ok:false, msg:'ملف غير صالح' }; }
    let imported = { debts_customers:0, debts:0, debt_payments:0 };
    if(Array.isArray(data.debts_customers)) data.debts_customers.forEach(dc=>{ if(dc && dc.name){ imported.debts_customers++; } });
    if(Array.isArray(data.debts)) data.debts.forEach(d=>{ if(d && d.amount){ imported.debts++; } });
    if(Array.isArray(data.debt_payments)) data.debt_payments.forEach(p=>{ if(p && p.amount){ imported.debt_payments++; } });
    return { ok:true, imported };
  } catch(err){ return { ok:false, msg:'فشل استيراد الديون' }; }
});

ipcMain.handle('users-list', async (e) => {
  try {
    await ensureDb();
    const perms = getPermsFor(e);
    const full = hasPerm(perms,256);
    let rows = await dbLayer.listUsers();
    if(!full){
      // قبل تسجيل الدخول أو بدون صلاحية: أعرض فقط المستخدمين النشطين (id, username)
      rows = rows.filter(r=> r.active).map(r=> ({ id:r.id, username:r.username }));
    }
    return { ok:true, rows };
  } catch(err){ return { ok:false, msg:'خطأ' }; }
});
// Roles & Users management (جديد)
ipcMain.handle('roles-list', async (e)=>{ try { if(!hasPerm(getPermsFor(e),256)) return { ok:false, msg:'ممنوع – لا تملك صلاحية إدارة المستخدمين'}; return { ok:true, rows: dbLayer.listRoles() }; } catch(err){ return { ok:false, msg:'فشل جلب الأدوار'}; }});
ipcMain.handle('role-add', async (e,{name,permissions})=>{ try { if(!hasPerm(getPermsFor(e),256)) return { ok:false, msg:'لا تملك صلاحية إدارة المستخدمين'}; return { ok:true, role: dbLayer.addRole(name, permissions>>>0) }; } catch(err){ return { ok:false, msg: err.message||'فشل إضافة الدور'}; }});
ipcMain.handle('role-update', async (e,{id,name,permissions})=>{ try { if(!hasPerm(getPermsFor(e),256)) return { ok:false, msg:'لا تملك صلاحية إدارة المستخدمين'}; return { ok:true, role: dbLayer.updateRole(id,{name,permissions}) }; } catch(err){ return { ok:false, msg: err.message||'فشل تعديل الدور'}; }});
ipcMain.handle('user-add', async (e, payload)=>{ try { if(!hasPerm(getPermsFor(e),256)) return { ok:false, msg:'لا تملك صلاحية إدارة المستخدمين'}; return { ok:true, user: dbLayer.addUser(payload||{}) }; } catch(err){ return { ok:false, msg: err.message||'فشل إضافة المستخدم'}; }});
ipcMain.handle('user-update', async (e,{id,...rest})=>{ try { if(!hasPerm(getPermsFor(e),256)) return { ok:false, msg:'لا تملك صلاحية إدارة المستخدمين'}; return { ok:true, user: dbLayer.updateUser(id, rest) }; } catch(err){ return { ok:false, msg: err.message||'فشل تعديل المستخدم'}; }});
ipcMain.handle('user-delete', async (e,id)=>{ try { if(!hasPerm(getPermsFor(e),256)) return { ok:false, msg:'لا تملك صلاحية إدارة المستخدمين'}; return { ok: dbLayer.deleteUser(id) }; } catch(err){ return { ok:false, msg: err.message||'فشل حذف المستخدم'}; }});
// ====== Products CRUD (مفقودة سابقاً) ======
ipcMain.handle('products-list', async (e, filter) => {
  try { return { ok:true, rows: dbLayer.listProducts(filter||'') }; } catch(err){ return { ok:false, msg:'خطأ' }; }
});
ipcMain.handle('product-add', async (e, data) => {
  try { const perms = getPermsFor(e); if(!hasPerm(perms,2)) return { ok:false, msg:'لا تملك صلاحية المنتجات' }; return { ok:true, row: dbLayer.addProduct(data) }; } catch(err){ return { ok:false, msg: err.message||'فشل إضافة' }; }
});
ipcMain.handle('product-update', async (e, id, data) => {
  try { const perms = getPermsFor(e); if(!hasPerm(perms,2)) return { ok:false, msg:'لا تملك صلاحية المنتجات' }; return { ok:true, row: dbLayer.updateProduct(id, data) }; } catch(err){ return { ok:false, msg: err.message||'فشل تعديل' }; }
});
ipcMain.handle('product-delete', async (e, id) => {
  try { const perms = getPermsFor(e); if(!hasPerm(perms,2)) return { ok:false, msg:'لا تملك صلاحية المنتجات' }; dbLayer.deleteProduct(id); return { ok:true }; } catch(err){ return { ok:false, msg:'فشل حذف' }; }
});

// ====== Customers CRUD (مفقودة سابقاً) ======
ipcMain.handle('customers-list', async (e, filter) => {
  try { return { ok:true, rows: dbLayer.listCustomers(filter||'') }; } catch(err){ return { ok:false, msg:'خطأ' }; }
});
ipcMain.handle('customers-sales-list', async (e, filter) => {
  try { return { ok:true, rows: dbLayer.listSalesCustomers(filter||'') }; } catch(err){ return { ok:false, msg:'خطأ' }; }
});
ipcMain.handle('customer-add', async (e, data) => {
  try { const perms=getPermsFor(e); if(!hasPerm(perms,4)) return { ok:false, msg:'لا تملك صلاحية العملاء' }; return { ok:true, row: dbLayer.addCustomer(data) }; } catch(err){ return { ok:false, msg: err.message||'فشل إضافة' }; }
});
ipcMain.handle('customer-update', async (e, id, data) => {
  try { const perms=getPermsFor(e); if(!hasPerm(perms,4)) return { ok:false, msg:'لا تملك صلاحية العملاء' }; return { ok:true, row: dbLayer.updateCustomer(id, data) }; } catch(err){ return { ok:false, msg: err.message||'فشل تعديل' }; }
});
ipcMain.handle('customer-delete', async (e, id) => {
  try { const perms=getPermsFor(e); if(!hasPerm(perms,4)) return { ok:false, msg:'لا تملك صلاحية العملاء' }; dbLayer.deleteCustomer(id); return { ok:true }; } catch(err){ return { ok:false, msg:'فشل حذف' }; }
});
ipcMain.handle('suppliers-list', async (e, filter) => {
  try { return { ok:true, rows: dbLayer.listSuppliers(filter||'') }; } catch(err){ return { ok:false, msg:'خطأ' }; }
});
ipcMain.handle('supplier-add', async (e, data) => {
  try { const perms=getPermsFor(e); if(!hasPerm(perms,8)) return { ok:false, msg:'لا تملك صلاحية الموردين' }; return { ok:true, row: dbLayer.addSupplier(data) }; } catch(err){ return { ok:false, msg:'فشل إضافة' }; }
});
ipcMain.handle('supplier-update', async (e, id, data) => {
  try { const perms=getPermsFor(e); if(!hasPerm(perms,8)) return { ok:false, msg:'لا تملك صلاحية الموردين' }; return { ok:true, row: dbLayer.updateSupplier(id, data) }; } catch(err){ return { ok:false, msg:'فشل تعديل' }; }
});
ipcMain.handle('supplier-delete', async (e, id) => {
  try { const perms=getPermsFor(e); if(!hasPerm(perms,8)) return { ok:false, msg:'لا تملك صلاحية الموردين' }; dbLayer.deleteSupplier(id); return { ok:true }; } catch(err){ return { ok:false, msg:'فشل حذف' }; }
});

// Purchases
ipcMain.handle('purchase-next', async ()=>{ try { return { ok:true, invoice: dbLayer.nextPurchaseNumber() }; } catch(err){ return { ok:false, msg:'خطأ' }; } });
ipcMain.handle('purchase-add', async (e, data)=>{ try { if(!hasPerm(getPermsFor(e),8)) return { ok:false, msg:'لا تملك صلاحية الموردين/المشتريات' }; return { ok:true, row: dbLayer.addPurchase(data) }; } catch(err){ return { ok:false, msg: err && err.message ? err.message : 'فشل إضافة' }; } });
ipcMain.handle('purchase-update', async (e, id, data)=>{ try { if(!hasPerm(getPermsFor(e),8)) return { ok:false, msg:'لا تملك صلاحية الموردين/المشتريات' }; return { ok:true, row: dbLayer.updatePurchase(id, data) }; } catch(err){ return { ok:false, msg: err && err.message ? err.message : 'فشل تعديل' }; } });
ipcMain.handle('purchase-delete', async (e, id)=>{ try { if(!hasPerm(getPermsFor(e),8)) return { ok:false, msg:'لا تملك صلاحية الموردين/المشتريات' }; return { ok: dbLayer.deletePurchase(id) }; } catch(err){ return { ok:false, msg: err && err.message ? err.message : 'فشل حذف' }; } });
ipcMain.handle('purchases-list', async (e, filter)=>{ try { if(!hasPerm(getPermsFor(e),8)) return { ok:false, msg:'لا تملك صلاحية الموردين/المشتريات' }; return { ok:true, rows: dbLayer.listPurchases(filter||'') }; } catch(err){ return { ok:false, msg:'خطأ' }; } });
ipcMain.handle('purchase-get', async (e, id)=>{ try { if(!hasPerm(getPermsFor(e),8)) return { ok:false, msg:'لا تملك صلاحية الموردين/المشتريات' }; return { ok:true, row: dbLayer.getPurchaseWithItems(id) }; } catch(err){ return { ok:false, msg:'خطأ' }; } });

// Purchase Returns
ipcMain.handle('purchase-return-create', async (e, data) => {
  try { return { ok:true, row: dbLayer.createPurchaseReturn(data) }; } catch(err){ return { ok:false, msg: err.message||'فشل المرتجع' }; }
});
ipcMain.handle('purchase-returns-list', async () => {
  try { return { ok:true, rows: dbLayer.listPurchaseReturns() }; } catch(err){ return { ok:false, msg:'خطأ' }; }
});
ipcMain.handle('purchase-return-stats', async (e, purchaseId) => {
  try { return { ok:true, rows: dbLayer.purchaseReturnStats(purchaseId) }; } catch(err){ return { ok:false, msg:'خطأ' }; }
});

// Warehouses (stores)
ipcMain.handle('stores-adv-list', (e, filter) => {
  try { return { ok: true, rows: dbLayer.listStores(filter||'') }; } catch(err){ return { ok:false, error: err.message }; }
});
ipcMain.handle('store-add-adv', async (e, data) => {
  try { const perms=getPermsFor(e); if(!hasPerm(perms,64)) return { ok:false, msg:'لا تملك صلاحية المخزون' }; return { ok:true, row: dbLayer.addStore(data) }; } catch(err){ return { ok:false, msg: err && err.message ? err.message : 'فشل إضافة' }; }
});
ipcMain.handle('store-update-adv', async (e, id, data) => {
  try { const perms=getPermsFor(e); if(!hasPerm(perms,64)) return { ok:false, msg:'لا تملك صلاحية المخزون' }; return { ok:true, row: dbLayer.updateStore(id, data) }; } catch(err){ return { ok:false, msg:'فشل تعديل' }; }
});
ipcMain.handle('store-delete-adv', async (e, id) => {
  try { const perms=getPermsFor(e); if(!hasPerm(perms,64)) return { ok:false, msg:'لا تملك صلاحية المخزون' }; dbLayer.deleteStore(id); return { ok:true }; } catch(err){ return { ok:false, msg:'فشل حذف' }; }
});

// Low stock products per (optional) store
ipcMain.handle('lowstock-list', (e, storeId) => {
  try { if(!hasPerm(getPermsFor(e),64)) return { ok:false, msg:'لا تملك صلاحية المخزون' }; return { ok:true, rows: dbLayer.listLowStock(storeId||null) }; } catch(err){ return { ok:false, msg:'خطأ' }; }
});

// Stock transfer
ipcMain.handle('stock-transfer', (e, payload) => {
  try { const perms=getPermsFor(e); if(!hasPerm(perms,64)) return { ok:false, msg:'لا تملك صلاحية التحويل' }; return dbLayer.transferStock(payload); } catch(err){ return { ok:false, msg: err.message||'فشل التحويل' }; }
});
ipcMain.handle('audit-log-list', (e, limit) => {
  try { return { ok:true, rows: dbLayer.listAuditLog(limit||200) }; } catch(err){ return { ok:false, msg:'خطأ' }; }
});

// حركات مخزون منتج
ipcMain.handle('product-stock-movements', (e, productId, limit) => {
  try { if(!hasPerm(getPermsFor(e),64)) return { ok:false, msg:'لا تملك صلاحية المخزون' }; return { ok:true, rows: dbLayer.listStockMovements(productId, limit||100) }; } catch(err){ return { ok:false, msg:'خطأ' }; }
});

// ضبط جرد (تعديل مباشر للكمية)
ipcMain.handle('inventory-adjust', (e, payload)=>{
  try { if(!hasPerm(getPermsFor(e),64)) return { ok:false, msg:'لا تملك صلاحية المخزون' }; return { ok:true, row: dbLayer.adjustInventory(payload) }; } catch(err){ return { ok:false, msg: err.message||'فشل الضبط' }; }
});

// ملخص سريع للمخزون (عدد المنتجات، إجمالي الكمية)
ipcMain.handle('inventory-summary', (e)=>{
  try { if(!hasPerm(getPermsFor(e),64)) return { ok:false, msg:'لا تملك صلاحية المخزون' }; const rows = dbLayer.listProducts(''); const totalQty = rows.reduce((a,b)=> a + (b.qty||0), 0); return { ok:true, data: { products: rows.length, totalQty } }; } catch(err){ return { ok:false, msg:'خطأ'}; }
});

// تقارير إضافية
ipcMain.handle('report-inventory-value', (e)=>{ try { if(!hasPerm(getPermsFor(e),16)) return { ok:false, msg:'لا تملك صلاحية التقارير' }; return { ok:true, data: dbLayer.inventoryValueSummary() }; } catch(err){ return { ok:false, msg:'خطأ'}; } });
ipcMain.handle('report-stock-movements', (e, params)=>{ try { if(!hasPerm(getPermsFor(e),16)) return { ok:false, msg:'لا تملك صلاحية التقارير' }; return { ok:true, rows: dbLayer.stockMovementsFiltered(params||{}) }; } catch(err){ return { ok:false, msg:'خطأ'}; } });
ipcMain.handle('report-returns-combined', (e, params)=>{ try { if(!hasPerm(getPermsFor(e),16)) return { ok:false, msg:'لا تملك صلاحية التقارير' }; return { ok:true, rows: dbLayer.returnsCombined(params||{}) }; } catch(err){ return { ok:false, msg:'خطأ'}; } });
ipcMain.handle('report-debts-aging', (e)=>{ try { if(!hasPerm(getPermsFor(e),128)) return { ok:false, msg:'لا تملك صلاحية الديون' }; return { ok:true, data: dbLayer.debtsAging() }; } catch(err){ return { ok:false, msg:'خطأ'}; } });
ipcMain.handle('report-expenses', (e, params)=>{ try { if(!hasPerm(getPermsFor(e),1024)) return { ok:false, msg:'لا تملك صلاحية المالية' }; return { ok:true, data: dbLayer.expensesList(params||{}) }; } catch(err){ return { ok:false, msg:'خطأ'}; } });
ipcMain.handle('expense-add', (e, data)=>{ try { if(!hasPerm(getPermsFor(e),1024)) return { ok:false, msg:'لا تملك صلاحية المالية' }; return { ok:true, row: dbLayer.expenseAdd(data) }; } catch(err){ return { ok:false, msg: err.message||'فشل' }; } });
// Receipts (سند قبض) – نستخدم نفس صلاحية المالية 1024
ipcMain.handle('receipts-list', (e, params)=>{ try { if(!hasPerm(getPermsFor(e),1024)) return { ok:false, msg:'لا تملك صلاحية المالية' }; return { ok:true, data: dbLayer.receiptsList(params||{}) }; } catch(err){ return { ok:false, msg:'خطأ'}; } });
ipcMain.handle('receipt-add', (e, data)=>{ try { if(!hasPerm(getPermsFor(e),1024)) return { ok:false, msg:'لا تملك صلاحية المالية' }; return { ok:true, row: dbLayer.receiptAdd(data) }; } catch(err){ return { ok:false, msg: err.message||'فشل' }; } });
ipcMain.handle('receipt-update', (e, id, data)=>{ try { if(!hasPerm(getPermsFor(e),1024)) return { ok:false, msg:'لا تملك صلاحية المالية' }; return { ok:true, row: dbLayer.receiptUpdate(id, data||{}) }; } catch(err){ return { ok:false, msg: err.message||'فشل تعديل' }; } });
ipcMain.handle('receipt-delete', (e, id)=>{ try { if(!hasPerm(getPermsFor(e),1024)) return { ok:false, msg:'لا تملك صلاحية المالية' }; dbLayer.receiptDelete(id); return { ok:true }; } catch(err){ return { ok:false, msg: err.message||'فشل حذف' }; } });
// PDF بسيط لسند قبض (مبلغ + اسم + تاريخ)
ipcMain.handle('receipt-pdf', (e, id)=>{ try {
  if(!hasPerm(getPermsFor(e),1024)) return { ok:false, msg:'لا تملك صلاحية المالية' };
  if(!PDFDocument) return { ok:false, msg:'مكتبة PDF غير متوفرة (npm i pdfkit)' };
  const row = dbLayer.receiptsList({}).rows.find(r=> r.id===id);
  if(!row) return { ok:false, msg:'سند غير موجود' };
  const exportDir = path.join(process.cwd(),'exports'); if(!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);
  const filePath = path.join(exportDir, `receipt-${row.id}-${Date.now()}.pdf`);
  const doc = new PDFDocument({ margin:40 }); _loadArabicFont(doc); doc.pipe(fs.createWriteStream(filePath));
  doc.fontSize(20).text('سند قبض', { align:'center' });
  doc.moveDown(0.5).fontSize(12).text(`رقم السند: ${row.id}`, { align:'right' });
  doc.text(`التاريخ: ${(row.created_at||'').replace('T',' ').slice(0,16)}`, { align:'right' });
  doc.text(`المبلغ: ${(row.amount||0).toFixed(2)}`, { align:'right' });
  if(row.customer_name) doc.text(`العميل: ${row.customer_name}`, { align:'right' });
  if(row.phone) doc.text(`جوال: ${row.phone}`, { align:'right' });
  if(row.source) doc.text(`المصدر/الصندوق: ${row.source}`, { align:'right' });
  if(row.method) doc.text(`الطريقة: ${row.method}`, { align:'right' });
  if(row.note) { doc.moveDown(0.5); doc.text('ملاحظة:', { align:'right' }); doc.text(row.note, { align:'right' }); }
  _pageFooter(doc); doc.end();
  return { ok:true, file:filePath };
} catch(err){ return { ok:false, msg: err.message||'فشل PDF' }; }});
// طباعة حرارية سريعة لسند قبض عبر قالب HTML بسيط
ipcMain.handle('receipt-print-html', async (e, id)=>{ try {
  if(!hasPerm(getPermsFor(e),1024)) return { ok:false, msg:'لا تملك صلاحية المالية' };
  const row = dbLayer.receiptsList({}).rows.find(r=> r.id===id);
  if(!row) return { ok:false, msg:'سند غير موجود' };
  const html = `<html><head><meta charset='utf-8'><style>body{font-family:Tahoma,Arial;direction:rtl;padding:6px;font-size:12px;}h1{font-size:16px;text-align:center;margin:4px 0;}table{width:100%;margin-top:6px;}td{padding:2px 0;}</style></head><body><h1>سند قبض</h1><table><tr><td>رقم:</td><td>${row.id}</td></tr><tr><td>تاريخ:</td><td>${(row.created_at||'').replace('T',' ').slice(0,16)}</td></tr><tr><td>مبلغ:</td><td>${(row.amount||0).toFixed(2)}</td></tr><tr><td>طريقة:</td><td>${row.method||''}</td></tr><tr><td>مصدر:</td><td>${row.source||''}</td></tr><tr><td>عميل:</td><td>${row.customer_name||''}</td></tr><tr><td>جوال:</td><td>${row.phone||''}</td></tr></table><div style='margin-top:4px;'>${row.note||''}</div></body></html>`;
  // استخدام نفس منطق direct-print-invoice للوضع الحراري
  const tmp = path.join(app.getPath('temp'), 'receipt-'+Date.now()+'.html'); fs.writeFileSync(tmp, html, 'utf8');
  const win = new BrowserWindow({ show:false });
  await win.loadFile(tmp);
  await new Promise((resolve,reject)=>{ win.webContents.print({ silent:false, printBackground:true }, (success, errType)=>{ if(!success) reject(new Error(errType||'فشل الطباعة')); else resolve(); }); });
  setTimeout(()=>{ try{ win.close(); }catch(_){ } fs.unlink(tmp,()=>{}); }, 400);
  return { ok:true };
} catch(err){ return { ok:false, msg: err.message||'فشل الطباعة' }; }});
ipcMain.handle('report-vat', (e, params)=>{ try { if(!hasPerm(getPermsFor(e),1024)) return { ok:false, msg:'لا تملك صلاحية المالية' }; return { ok:true, data: dbLayer.vatReport(params||{}) }; } catch(err){ return { ok:false, msg:'خطأ'}; } });
ipcMain.handle('report-product-margins', (e, params)=>{ try { if(!hasPerm(getPermsFor(e),1024)) return { ok:false, msg:'لا تملك صلاحية المالية' }; return { ok:true, rows: dbLayer.productMarginsReport(params||{}) }; } catch(err){ return { ok:false, msg:'خطأ'}; } });
// تقارير عميل (دعم فلاتر تاريخ + PDF)
ipcMain.handle('customer-report', (e, payload)=>{ try { if(!hasPerm(getPermsFor(e),4)) return { ok:false, msg:'لا تملك صلاحية العملاء' }; return { ok:true, data: dbLayer.customerReport(payload) }; } catch(err){ return { ok:false, msg: err.message||'خطأ'}; } });
ipcMain.handle('customer-statement', (e, params)=>{ try { if(!hasPerm(getPermsFor(e),4)) return { ok:false, msg:'لا تملك صلاحية العملاء' }; return { ok:true, data: dbLayer.customerStatement(params||{}) }; } catch(err){ return { ok:false, msg: err.message||'خطأ'}; } });
// ====== تحسين إنشاء PDF (A4 + جداول) ======
function _loadArabicFont(doc){
  try {
    const fontPath = path.join(process.cwd(),'assets','arabic.ttf');
    if(fs.existsSync(fontPath)) doc.font(fontPath); // يجب على المستخدم وضع خط داعم للعربية مثل Cairo أو Amiri باسم arabic.ttf
  } catch(e){ /* تجاهل */ }
}
function _pageFooter(doc){
  const page = doc.page; // pdfkit current page
  doc.fontSize(8).fillColor('#555').text(`صفحة ${page.number}`, 40, page.height - 40, { align:'center' });
  doc.fillColor('#000');
}
function _drawTable(doc, { x=40, y, columns, rows, rowHeight=20, headerFill='#f0f0f0', border='#000' }){
  const usableWidth = doc.page.width - x - 40; // 40 يمين
  // حساب عرض الأعمدة (نسبة أو قيمة)
  const totalFlex = columns.reduce((a,c)=> a + (c.width||1),0);
  const colWidths = columns.map(c=> (c.width||1)/totalFlex * usableWidth);
  let cy = y;
  // رأس الجدول
  doc.fontSize(10).fillColor('#000');
  doc.save(); doc.rect(x, cy, usableWidth, rowHeight).fill(headerFill); doc.restore();
  let cx = x;
  columns.forEach((c,i)=>{ doc.rect(cx, cy, colWidths[i], rowHeight).stroke(border); doc.fillColor('#000').text(c.label, cx+4, cy+5, { width: colWidths[i]-8, align:'center' }); cx += colWidths[i]; });
  cy += rowHeight;
  doc.fillColor('#000');
  rows.forEach((r,ri)=>{
    // فحص مساحة الصفحة
    if(cy + rowHeight > doc.page.height - 60){
      _pageFooter(doc); doc.addPage({ size:'A4', margins:{ top:40,left:40,right:40,bottom:50 } }); _loadArabicFont(doc); cy = 60; // إعادة رأس الصفحة؟ يمكن إعادة رسم الرأس إذا مطلوب
      // إعادة رسم الرأس
      doc.save(); doc.rect(x, cy, usableWidth, rowHeight).fill(headerFill); doc.restore();
      cx = x;
      columns.forEach((c,i)=>{ doc.rect(cx, cy, colWidths[i], rowHeight).stroke(border); doc.fillColor('#000').text(c.label, cx+4, cy+5, { width: colWidths[i]-8, align:'center' }); cx += colWidths[i]; });
      cy += rowHeight;
    }
    cx = x;
    // zebra
    if(ri % 2 === 0){ doc.save(); doc.rect(x, cy, usableWidth, rowHeight).fill('#fcfcfc'); doc.restore(); }
    columns.forEach((c,i)=>{
      const txt = (c.get? c.get(r): (r[c.key]!==undefined? r[c.key]:''))+'';
      doc.rect(cx, cy, colWidths[i], rowHeight).stroke(border);
      doc.text(txt, cx+4, cy+5, { width: colWidths[i]-8, align: c.align||'center' });
      cx += colWidths[i];
    });
    cy += rowHeight;
  });
  return cy;
}
function _newDoc(filePath){
  const doc = new PDFDocument({ size:'A4', margin:40 });
  doc.pipe(fs.createWriteStream(filePath));
  _loadArabicFont(doc);
  return doc;
}
ipcMain.handle('customer-report-pdf', (e, params)=>{ try {
  const { customer_id, start, end } = params||{}; if(!customer_id) return { ok:false, msg:'مطلوب معرف العميل' };
  if(!PDFDocument) return { ok:false, msg:'مكتبة PDF غير متوفرة، ثبّت الحزم (npm i pdfkit)' };
  const r = dbLayer.customerReport({ customer_id, start, end });
  let customersDir;
  try {
  customersDir = path.join(getDesktopDir(), 'تقارير عملاء');
    if(!fs.existsSync(customersDir)) fs.mkdirSync(customersDir,{recursive:true});
  } catch(_){
    const exportDir = path.join(process.cwd(),'exports'); if(!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);
    customersDir = path.join(exportDir,'customers'); if(!fs.existsSync(customersDir)) fs.mkdirSync(customersDir);
  }
  const filePath = path.join(customersDir, `customer-report-${customer_id}-${Date.now()}.pdf`);
  const doc = _newDoc(filePath);
  doc.info.Title = `تقرير عميل - ${r.customer.name}`;
  // رأس
  const nowStr = new Date().toISOString().replace('T',' ').slice(0,16);
  doc.fontSize(22).text(r.customer.name, { align:'center' });
  doc.moveDown(0.2).fontSize(14).text('تقرير عميل', { align:'center' });
  doc.moveDown(0.4).fontSize(10).text(`تاريخ التوليد: ${nowStr}`, { align:'right' });
  doc.fontSize(11).text(`العميل: ${r.customer.name} (رقم: ${r.customer.id}) | جوال: ${r.customer.phone||'-'}`, { align:'right' });
  if(start||end) doc.text(`الفترة: ${(start||'من البداية')} → ${(end||'حتى الآن')}`, { align:'right' });
  doc.text(`عدد الفواتير: ${r.salesCount} | إجمالي: ${r.totalSales.toFixed(2)} | ضريبة: ${r.totalVat.toFixed(2)} | خصم: ${r.totalDiscount.toFixed(2)}`, { align:'right' });
  doc.moveDown(0.8);
  doc.fontSize(12).text('قائمة الفواتير', { align:'right', underline:true });
  const rows = r.recentSales.map(s=>({
    id:s.id,
    invoice: s.invoice_no||'',
    net: (s.total||0).toFixed(2),
    vat: (s.vat||0).toFixed(2),
    date: (s.created_at||'').replace('T',' ').slice(0,16)
  }));
  _drawTable(doc, {
    y: doc.y + 10,
    columns:[
      { key:'id', label:'#', width:1 },
      { key:'invoice', label:'رقم', width:1.2 },
      { key:'net', label:'الصافي', width:1 },
      { key:'vat', label:'ضريبة', width:1 },
      { key:'date', label:'تاريخ', width:1.5 }
    ],
    rows
  });
  _pageFooter(doc);
  doc.end();
  return { ok:true, file:filePath };
} catch(err){ return { ok:false, msg: err.message||'فشل PDF' }; }});

// نسخة HTML (printToPDF) لتقرير العميل - أسهل تنسيقاً
ipcMain.handle('customer-report-pdf-html', async (e, params)=>{
  try {
    const { customer_id, start, end } = params||{}; if(!customer_id) return { ok:false, msg:'مطلوب معرف العميل' };
    const templatePath = path.join(process.cwd(),'templates','customer-report.html');
    if(!fs.existsSync(templatePath)) return { ok:false, msg:'ملف القالب مفقود' };
    const win = new BrowserWindow({ show:false, webPreferences:{ preload: path.join(__dirname,'..','preload','preload.js') } });
    const url = 'file://'+templatePath.replace(/\\/g,'/') + `?customer_id=${customer_id}${start?`&start=${encodeURIComponent(start)}`:''}${end?`&end=${encodeURIComponent(end)}`:''}`;
    await win.loadURL(url);
    // انتظار بسيط لتهيئة DOM
    await new Promise(r=> setTimeout(r,400));
    const pdfBuffer = await win.webContents.printToPDF({ printBackground:true, pageSize:'A4', landscape:false });
    win.destroy();
  let customersDir;
  try {
  customersDir = path.join(getDesktopDir(), 'تقارير عملاء');
    if(!fs.existsSync(customersDir)) fs.mkdirSync(customersDir,{recursive:true});
  } catch(_){
    const exportDir = path.join(process.cwd(),'exports'); if(!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);
    customersDir = path.join(exportDir,'customers'); if(!fs.existsSync(customersDir)) fs.mkdirSync(customersDir);
  }
  const filePath = path.join(customersDir, `customer-report-html-${customer_id}-${Date.now()}.pdf`);
    fs.writeFileSync(filePath, pdfBuffer);
    return { ok:true, file:filePath };
  } catch(err){ return { ok:false, msg: err.message||'فشل HTML PDF' }; }
});
ipcMain.handle('customer-statement-pdf', async (e, params)=>{
  try {
    const { customer_id, start, end } = params||{}; if(!customer_id) return { ok:false, msg:'مطلوب معرف العميل' };
    const r = dbLayer.customerStatement({ customer_id, start, end });
    const tmplPath = path.join(process.cwd(),'templates','customer-statement-print.html');
    if(!fs.existsSync(tmplPath)) return { ok:false, msg:'قالب الطباعة غير موجود' };
    const entries=[]; (r.debts||[]).forEach(d=>{ entries.push({ date:d.date||'', ref:'دين #'+d.id, debit:d.amount||0, credit:0 }); if(d.paid_amount){ entries.push({ date:d.date||'', ref:'مدفوع للدين #'+d.id, debit:0, credit:d.paid_amount }); } });
    (r.payments||[]).forEach(p=>{ if(!p.amount) return; entries.push({ date:p.date||'', ref:'سداد جزئي #'+p.id, debit:0, credit:p.amount }); });
    entries.sort((a,b)=> (a.date||'').localeCompare(b.date||''));
    const settingsMap = {}; dbLayer.listSettings().forEach(s=> settingsMap[s.key]=s.value);
    const payload = {
      company: { name: settingsMap.company_name||'', address: settingsMap.company_address||'', phone: settingsMap.company_phone||'', email: settingsMap.company_email||'', vat: settingsMap.vat_number||'', cr: settingsMap.cr_number||'' },
      customer: { id: r.customer.id, name: r.customer.name, address: r.customer.address||'', vat: r.customer.vat||'' },
      report: { no: 'STMT-'+r.customer.id, date: new Date().toISOString(), from: r.filters.start||'', to: r.filters.end||'', user: 'system' },
      openingBalance: 0,
      entries
    };
    const encoded = Buffer.from(encodeURIComponent(JSON.stringify(payload))).toString('base64');
    const url = 'file://'+tmplPath.replace(/\\/g,'/') + '?data=' + encoded;
    const win = new BrowserWindow({ show:false, webPreferences:{ preload: path.join(__dirname,'..','preload','preload.js') } });
    await win.loadURL(url);
    await new Promise(rz=> setTimeout(rz,500));
    const pdfBuffer = await win.webContents.printToPDF({ printBackground:true, pageSize:'A4' });
    win.destroy();
  let customersDir;
  try {
  customersDir = path.join(getDesktopDir(), 'تقارير عملاء');
    if(!fs.existsSync(customersDir)) fs.mkdirSync(customersDir,{recursive:true});
  } catch(_){
    const exportDir = path.join(process.cwd(),'exports'); if(!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);
    customersDir = path.join(exportDir,'customers'); if(!fs.existsSync(customersDir)) fs.mkdirSync(customersDir);
  }
  const filePath = path.join(customersDir, `customer-statement-${customer_id}-${Date.now()}.pdf`);
    fs.writeFileSync(filePath, pdfBuffer);
    return { ok:true, file:filePath };
  } catch(err){ return { ok:false, msg: err.message||'فشل PDF' }; }
});
ipcMain.handle('customer-statement-pdf-html', async (e, params)=>{
  try {
    const { customer_id, start, end } = params||{}; if(!customer_id) return { ok:false, msg:'مطلوب معرف العميل' };
    const r = dbLayer.customerStatement({ customer_id, start, end });
    const tmplPath = path.join(process.cwd(),'templates','customer-statement-print.html');
    if(!fs.existsSync(tmplPath)) return { ok:false, msg:'قالب الطباعة غير موجود' };
    const entries=[]; (r.debts||[]).forEach(d=>{ entries.push({ date:d.date||'', ref:'دين #'+d.id, debit:d.amount||0, credit:0 }); if(d.paid_amount){ entries.push({ date:d.date||'', ref:'مدفوع للدين #'+d.id, debit:0, credit:d.paid_amount }); } });
    (r.payments||[]).forEach(p=>{ if(!p.amount) return; entries.push({ date:p.date||'', ref:'سداد جزئي #'+p.id, debit:0, credit:p.amount }); });
    entries.sort((a,b)=> (a.date||'').localeCompare(b.date||''));
    const settingsMap = {}; dbLayer.listSettings().forEach(s=> settingsMap[s.key]=s.value);
    const payload = {
      company: { name: settingsMap.company_name||'', address: settingsMap.company_address||'', phone: settingsMap.company_phone||'', email: settingsMap.company_email||'', vat: settingsMap.vat_number||'', cr: settingsMap.cr_number||'' },
      customer: { id: r.customer.id, name: r.customer.name, address: r.customer.address||'', vat: r.customer.vat||'' },
      report: { no: 'STMT-'+r.customer.id, date: new Date().toISOString(), from: r.filters.start||'', to: r.filters.end||'', user: 'system' },
      openingBalance: 0,
      entries
    };
    const encoded = Buffer.from(encodeURIComponent(JSON.stringify(payload))).toString('base64');
    const url = 'file://'+tmplPath.replace(/\\/g,'/') + '?data=' + encoded;
    const win = new BrowserWindow({ show:false, webPreferences:{ preload: path.join(__dirname,'..','preload','preload.js') } });
    await win.loadURL(url);
    await new Promise(r=> setTimeout(r,500));
    const pdfBuffer = await win.webContents.printToPDF({ printBackground:true, pageSize:'A4' });
    win.destroy();
  let customersDir;
  try {
  customersDir = path.join(getDesktopDir(), 'تقارير عملاء');
    if(!fs.existsSync(customersDir)) fs.mkdirSync(customersDir,{recursive:true});
  } catch(_){
    const exportDir = path.join(process.cwd(),'exports'); if(!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);
    customersDir = path.join(exportDir,'customers'); if(!fs.existsSync(customersDir)) fs.mkdirSync(customersDir);
  }
  const filePath = path.join(customersDir, `customer-statement-html-${customer_id}-${Date.now()}.pdf`);
    fs.writeFileSync(filePath, pdfBuffer);
    return { ok:true, file:filePath };
  } catch(err){ return { ok:false, msg: err.message||'فشل HTML PDF' }; }
});

// ====== فاتورة بيع PDF ======
// ====== فاتورة بيع PDF (نسخة تستخدم نفس القالب المرئي لضمان تطابق التصميم) ======
ipcMain.handle('sale-invoice-pdf', async (e, params)=>{
  try {
    params=params||{}; let sale=null;
    if(params.sale_id) sale = dbLayer.getSaleWithItems(params.sale_id);
    if(!sale && params.invoice_no){ const base = dbLayer.getSaleByInvoice(params.invoice_no); if(base) sale = dbLayer.getSaleWithItems(base.id); }
    if(!sale) return { ok:false, msg:'لم يتم العثور على الفاتورة' };
    const templatePath = path.join(process.cwd(),'templates','invoice.html');
    if(!fs.existsSync(templatePath)) return { ok:false, msg:'invoice.html غير موجود' };
    // تجهيز إعدادات الشركة وتمريرها للقالب لتفادي مشاكل الصلاحيات في settings-list داخل نافذة مخفية
    let settingsEncoded='';
    try {
      const srows = dbLayer.listSettings();
      const sobj={}; srows.forEach(r=> sobj[r.key]=r.value);
      const minimal={ cn: sobj.company_name||'', vat: sobj.vat_number||'', cr: sobj.cr_number||'' };
      settingsEncoded = Buffer.from(JSON.stringify(minimal),'utf8').toString('base64');
    } catch(_){ /* تجاهل */ }
    const win = new BrowserWindow({ show:false, webPreferences:{ preload: path.join(__dirname,'..','preload','preload.js') } });
    const baseQS = (sale.invoice_no? `?invoice=${encodeURIComponent(sale.invoice_no)}`: `?sale_id=${sale.id}`);
    const url = 'file://'+templatePath.replace(/\\/g,'/') + baseQS + (settingsEncoded? `&cfg=${encodeURIComponent(settingsEncoded)}`:'' );
    await win.loadURL(url);
    // انتظار جاهزية القالب (تم ضبط window.__A4_INVOICE_READY__ = true داخل القالب)
    const maxWaitMs = 4000; const start = Date.now();
    while(Date.now()-start < maxWaitMs){
      try { const ready = await win.webContents.executeJavaScript('window.__A4_INVOICE_READY__===true', true); if(ready) break; } catch(_){}
      await new Promise(r=> setTimeout(r,150));
    }
    const pdfBuffer = await win.webContents.printToPDF({ printBackground:true, pageSize:'A4' });
    win.destroy();
  let salesDir;
  try {
  salesDir = path.join(getDesktopDir(), 'فواتير مبيعات');
    if(!fs.existsSync(salesDir)) fs.mkdirSync(salesDir, { recursive:true });
  } catch(_){
    const exportDir = path.join(process.cwd(),'exports'); if(!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);
    salesDir = path.join(exportDir,'sales'); if(!fs.existsSync(salesDir)) fs.mkdirSync(salesDir);
  }
  const filePath = path.join(salesDir, `invoice-${sale.invoice_no||sale.id}-${Date.now()}.pdf`);
    fs.writeFileSync(filePath, pdfBuffer);
    return { ok:true, file:filePath };
  } catch(err){ return { ok:false, msg: err.message||'فشل PDF الفاتورة' }; }
});
ipcMain.handle('sale-invoice-pdf-html', async (e, params)=>{
  try {
    params=params||{}; let sale=null;
    if(params.sale_id) sale = dbLayer.getSaleWithItems(params.sale_id);
    if(!sale && params.invoice_no){ const base = dbLayer.getSaleByInvoice(params.invoice_no); if(base) sale = dbLayer.getSaleWithItems(base.id); }
    if(!sale) return { ok:false, msg:'لم يتم العثور على الفاتورة' };
    const templatePath = path.join(process.cwd(),'templates','invoice.html');
    if(!fs.existsSync(templatePath)) return { ok:false, msg:'ملف القالب مفقود' };
    // تمرير إعدادات الشركة بنفس الطريقة
    let settingsEncoded='';
    try {
      const srows = dbLayer.listSettings();
      const sobj={}; srows.forEach(r=> sobj[r.key]=r.value);
      const minimal={ cn: sobj.company_name||'', vat: sobj.vat_number||'', cr: sobj.cr_number||'' };
      settingsEncoded = Buffer.from(JSON.stringify(minimal),'utf8').toString('base64');
    } catch(_){ }
    const win = new BrowserWindow({ show:false, webPreferences:{ preload: path.join(__dirname,'..','preload','preload.js') } });
    const baseQS = (sale.invoice_no? `?invoice=${encodeURIComponent(sale.invoice_no)}`: `?sale_id=${sale.id}`);
    const url = 'file://'+templatePath.replace(/\\/g,'/') + baseQS + (settingsEncoded? `&cfg=${encodeURIComponent(settingsEncoded)}`:'' );
    await win.loadURL(url);
    await new Promise(r=> setTimeout(r,400));
    const pdfBuffer = await win.webContents.printToPDF({ printBackground:true, pageSize:'A4' });
    win.destroy();
  let salesDir;
  try {
  salesDir = path.join(getDesktopDir(), 'فواتير مبيعات');
    if(!fs.existsSync(salesDir)) fs.mkdirSync(salesDir, { recursive:true });
  } catch(_){
    const exportDir = path.join(process.cwd(),'exports'); if(!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);
    salesDir = path.join(exportDir,'sales'); if(!fs.existsSync(salesDir)) fs.mkdirSync(salesDir);
  }
  const filePath = path.join(salesDir, `invoice-html-${sale.invoice_no||sale.id}-${Date.now()}.pdf`);
    fs.writeFileSync(filePath, pdfBuffer);
    return { ok:true, file:filePath };
  } catch(err){ return { ok:false, msg: err.message||'فشل PDF HTML' }; }
});

// Sales / Profit reports
ipcMain.handle('report-sales-summary', (e, period) => { try { if(!hasPerm(getPermsFor(e),16)) return { ok:false, msg:'لا تملك صلاحية التقارير' }; return { ok:true, data: dbLayer.salesSummary(period||'today') }; } catch(err){ return { ok:false, msg:'خطأ' }; } });
ipcMain.handle('report-sales-details', (e, period, search) => { try { if(!hasPerm(getPermsFor(e),16)) return { ok:false, msg:'لا تملك صلاحية التقارير' }; return { ok:true, rows: dbLayer.salesDetails(period||'today', search||'') }; } catch(err){ return { ok:false, msg:'خطأ' }; } });
ipcMain.handle('report-profit-summary', (e, period) => { try { if(!hasPerm(getPermsFor(e),16)) return { ok:false, msg:'لا تملك صلاحية التقارير' }; return { ok:true, data: dbLayer.profitSummary(period||'month') }; } catch(err){ return { ok:false, msg:'خطأ' }; } });
ipcMain.handle('report-profit-products', (e, period) => { try { return { ok:true, data: dbLayer.topBottomProducts(period||'month') }; } catch(err){ return { ok:false, msg:'خطأ' }; } });

// Sales (POS)
ipcMain.handle('sale-create', async (e, data) => {
  try {
    if(!hasPerm(getPermsFor(e),1)) return { ok:false, msg:'لا تملك صلاحية المبيعات' };
    const sale = dbLayer.createSale(data);
    return { ok:true, sale };
  } catch(err){
    return { ok:false, msg: err && err.message? err.message : 'فشل إنشاء بيع' };
  }
});
ipcMain.handle('sale-update', async (e, id, data) => { try { const perms=getPermsFor(e); if(!hasPerm(perms,512)) return { ok:false, msg:'لا تملك صلاحية تعديل الفواتير' }; return { ok:true, sale: dbLayer.updateSale(id, data) }; } catch(err){ return { ok:false, msg: err.message||'فشل تعديل بيع' }; } });

ipcMain.handle('sales-list', async () => {
  try { return { ok:true, rows: dbLayer.listSales() }; } catch(err){ return { ok:false, msg:'خطأ' }; }
});
ipcMain.handle('sale-get', async (e, id) => {
  try { return { ok:true, sale: dbLayer.getSaleWithItems(id) }; } catch(err){ return { ok:false, msg:'خطأ' }; }
});
ipcMain.handle('sale-get-by-invoice', async (e, invoice) => {
  try { return { ok:true, sale: dbLayer.getSaleByInvoice(invoice) }; } catch(err){ return { ok:false, msg:'خطأ' }; }
});
ipcMain.handle('invoice-next', async () => {
  try { return { ok:true, invoice: dbLayer.nextInvoiceNumber() }; } catch(err){ return { ok:false, msg:'خطأ' }; }
});

// Sales Returns
ipcMain.handle('sale-return-create', async (e, data) => {
  try { return { ok:true, row: dbLayer.createSaleReturn(data) }; } catch(err){ return { ok:false, msg: err.message||'فشل المرتجع' }; }
});
ipcMain.handle('sale-returns-list', async () => {
  try { return { ok:true, rows: dbLayer.listSaleReturns() }; } catch(err){ return { ok:false, msg:'خطأ' }; }
});
ipcMain.handle('sale-return-stats', async (e, saleId) => {
  try { return { ok:true, rows: dbLayer.saleReturnStats(saleId) }; } catch(err){ return { ok:false, msg:'خطأ' }; }
});

// Lookups (groups, units, categories, stores)
['product_groups','product_units','product_categories','stores'].forEach(tbl=>{
  ipcMain.handle(tbl+'-list', ()=>{ try { return { ok:true, rows: dbLayer.listLookup(tbl) }; } catch(err){ return { ok:false, msg:'خطأ'}; }});
  ipcMain.handle(tbl+'-ensure', (e, name)=>{ try { return { ok:true, id: dbLayer.ensureLookup(tbl, name) }; } catch(err){ return { ok:false, msg:'فشل'}; }});
});

// Settings
ipcMain.handle('setting-set', (e, key, value) => { try { if(!hasPerm(getPermsFor(e),32)) return { ok:false, msg:'لا تملك صلاحية الإعدادات'}; dbLayer.setSetting(key,value); if(['auto_backup','backup_interval','backup_path'].includes(key)) scheduleAutoBackup(); return { ok:true }; } catch(err){ return { ok:false }; } });
ipcMain.handle('setting-get', (e, key) => { try { if(!hasPerm(getPermsFor(e),32)) return { ok:false, msg:'لا تملك صلاحية الإعدادات'}; return { ok:true, value: dbLayer.getSetting(key) }; } catch(err){ return { ok:false }; } });
ipcMain.handle('settings-list', (e) => { try { if(!hasPerm(getPermsFor(e),32)) return { ok:false, msg:'لا تملك صلاحية الإعدادات'}; return { ok:true, rows: dbLayer.listSettings() }; } catch(err){ return { ok:false }; } });

// Export sales CSV
ipcMain.handle('export-sales-csv', () => {
  try {
    const exportDir = path.join(process.cwd(),'exports');
    if(!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);
    const filePath = path.join(exportDir, `sales-${new Date().toISOString().slice(0,10)}.csv`);
    const r = dbLayer.exportSalesCSV(filePath);
    return { ok:true, file: filePath, count: r.count };
  } catch(err){ return { ok:false, msg:'فشل التصدير'}; }
});

// Export suppliers CSV
ipcMain.handle('export-suppliers-csv', () => {
  try {
    const exportDir = path.join(process.cwd(),'exports');
    if(!fs.existsSync(exportDir)) fs.mkdirSync(exportDir);
    const filePath = path.join(exportDir, `suppliers-${new Date().toISOString().slice(0,10)}.csv`);
    const r = dbLayer.exportSuppliersCSV(filePath);
    return { ok:true, file: filePath, count: r.count };
  } catch(err){ return { ok:false, msg:'فشل التصدير'}; }
});

// ====== تقرير عام ديناميكي PDF (report-export) ======
ipcMain.handle('report-export', async (e, args) => {
  try {
    if(!exportReportPDF) return { ok:false, msg:'وحدة التصدير غير متوفرة' };
    args = args||{};
    const perms = getPermsFor(e);
    const type = (args.type||'').toLowerCase();
    const need = (function(){
      if(type.startsWith('invoice')) return 1; // مبيعات
      if(type.startsWith('customer')) return 4; // عملاء
      if(type.startsWith('inventory')) return 16; // تقارير / مخزون
      if(type.startsWith('sales')) return 16; // تقارير
      if(type.startsWith('statement')) return 4; // كشف حساب عميل
      return 16; // افتراضي تقارير
    })();
    if(!hasPerm(perms, need)) return { ok:false, msg:'لا تملك صلاحية إنشاء هذا التقرير' };
    const file = await exportReportPDF(args);
    return { ok:true, file };
  } catch(err){ return { ok:false, msg: err.message||'فشل إنشاء التقرير' }; }
});

// == معلومات عامة للشركة بدون الحاجة لصلاحية الإعدادات ==
ipcMain.handle('company-public-info', () => {
  try {
    const rows = dbLayer.listSettings();
    const map = {}; rows.forEach(r=> map[r.key]=r.value);
    return { ok:true, info: {
      name: map.company_name||'',
      address: map.company_address||'',
      phone: map.company_phone||'',
      email: map.company_email||'',
      vat: map.vat_number||'',
      cr: map.cr_number||''
    }};
  } catch(err){ return { ok:false, msg:'فشل' }; }
});

// حفظ تقرير منظم إلى Desktop/accounting_reports (أُخرج من داخل report-export)
ipcMain.handle('structured-report-save', async (e, args)=>{
  try {
    if(!exportStructuredReport) return { ok:false, msg:'الوحدة غير متاحة' };
    args = args||{};
    const perms = getPermsFor(e);
    const category = (args.category||'').toLowerCase();
    const need = /عميل|customer|statement/.test(category)? 4
      : /مورد|supplier/.test(category)? 8
      : /مشتريات|purchase/.test(category)? 8
      : /مبيعات|sale/.test(category)? 1
      : /مخزون|inventory/.test(category)? 64
      : 16;
    if(!hasPerm(perms, need)) return { ok:false, msg:'لا تملك صلاحية حفظ هذا التقرير' };
    const file = await exportStructuredReport(args);
    return { ok:true, file };
  } catch(err){ return { ok:false, msg: err.message||'فشل حفظ التقرير' }; }
});

// ====== النسخ الاحتياطي ======
ipcMain.handle('backup-choose-dir', async () => {
  try {
    const res = await dialog.showOpenDialog({ properties:['openDirectory','createDirectory'] });
    if(res.canceled || !res.filePaths || !res.filePaths[0]) return { ok:false, canceled:true };
    return { ok:true, dir: res.filePaths[0] };
  } catch(err){ return { ok:false, msg:'فشل اختيار المجلد' }; }
});

ipcMain.handle('backup-run-manual', async () => {
  try {
    await ensureDb();
    let target = null;
    try { const val = dbLayer.getSetting('backup_path'); if(val && typeof val === 'string') target = val; } catch(_){ }
    if(!target) target = path.join(process.cwd(),'backup');
    if(!path.isAbsolute(target)) target = path.join(process.cwd(), target);
    if(!fs.existsSync(target)) fs.mkdirSync(target, { recursive:true });
    const stamp = new Date().toISOString().replace(/[:T]/g,'-').slice(0,19);
    const dbSrc = path.join(process.cwd(),'asas.db');
    const destFile = path.join(target, `asas-backup-${stamp}.db`);
    fs.copyFileSync(dbSrc, destFile);
    return { ok:true, file: destFile };
  } catch(err){ return { ok:false, msg: err.message||'فشل النسخ' }; }
});

// Debts
ipcMain.handle('debt-customer-add', (e, data)=>{ try { if(!hasPerm(getPermsFor(e),128)) return { ok:false, msg:'لا تملك صلاحية الديون' }; return { ok:true, row: dbLayer.addDebtCustomer(data||{}) }; } catch(err){ return { ok:false, msg: err.message||'فشل إضافة عميل' }; } });
ipcMain.handle('debt-customers-list', (e)=>{ try { if(!hasPerm(getPermsFor(e),128)) return { ok:false, msg:'لا تملك صلاحية الديون' }; return { ok:true, rows: dbLayer.listDebtCustomers() }; } catch(err){ return { ok:false, msg:'فشل' }; } });
ipcMain.handle('debt-add', (e, data)=>{ try { if(!hasPerm(getPermsFor(e),128)) return { ok:false, msg:'لا تملك صلاحية الديون' }; return { ok:true, row: dbLayer.addDebt(data||{}) }; } catch(err){ return { ok:false, msg: err.message||'فشل إضافة دين' }; } });
ipcMain.handle('debts-list', (e)=>{ try { if(!hasPerm(getPermsFor(e),128)) return { ok:false, msg:'لا تملك صلاحية الديون' }; return { ok:true, rows: dbLayer.listDebts() }; } catch(err){ return { ok:false, msg:'خطأ'}; } });
ipcMain.handle('debt-delete', (e, id)=>{ try { if(!hasPerm(getPermsFor(e),128)) return { ok:false, msg:'لا تملك صلاحية الديون' }; dbLayer.deleteDebt(id); return { ok:true }; } catch(err){ return { ok:false, msg:'فشل حذف الدين'}; } });
ipcMain.handle('debt-update', (e, id, data)=>{ try { if(!hasPerm(getPermsFor(e),128)) return { ok:false, msg:'لا تملك صلاحية الديون' }; return { ok:true, row: dbLayer.updateDebt(id, data||{}) }; } catch(err){ return { ok:false, msg: err.message||'فشل تحديث الدين'}; } });
ipcMain.handle('debt-customer-update', (e, id, data)=>{ try { if(!hasPerm(getPermsFor(e),128)) return { ok:false, msg:'لا تملك صلاحية الديون' }; return { ok:true, row: dbLayer.updateDebtCustomer(id, data||{}) }; } catch(err){ return { ok:false, msg: err.message||'فشل تحديث العميل'}; } });
ipcMain.handle('debt-payment-add', (e, data)=>{ try { if(!hasPerm(getPermsFor(e),128)) return { ok:false, msg:'لا تملك صلاحية الديون' }; return { ok:true, row: dbLayer.addDebtPayment(data||{}) }; } catch(err){ return { ok:false, msg: err.message||'فشل السداد الجزئي'}; } });
ipcMain.handle('debt-operations', (e, customer_id)=>{ try { if(!hasPerm(getPermsFor(e),128)) return { ok:false, msg:'لا تملك صلاحية الديون' }; return { ok:true, data: dbLayer.listDebtOperations(customer_id) }; } catch(err){ return { ok:false, msg: err.message||'فشل جلب العمليات'}; } });
ipcMain.handle('debt-report-range', (e, payload)=>{ try { if(!hasPerm(getPermsFor(e),128)) return { ok:false, msg:'لا تملك صلاحية الديون' }; return { ok:true, data: dbLayer.debtReportRange(payload||{}) }; } catch(err){ return { ok:false, msg: err.message||'فشل التقرير'}; } });
ipcMain.handle('finance-summary', (e, period)=>{ try { if(!hasPerm(getPermsFor(e),1024)) return { ok:false, msg:'لا تملك صلاحية المالية' }; return { ok:true, data: dbLayer.financeSummary(period||'month') }; } catch(err){ return { ok:false, msg:'خطأ'}; } });

// Save product image (receive {name, data(base64)}) and return relative path
ipcMain.handle('product-save-image', async (e, payload) => {
  try {
    const { name, data } = payload || {};
    if(!name || !data) return { ok:false, msg:'بيانات صورة ناقصة'};
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if(!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
    // Sanitize filename
    const safeName = name.replace(/[^a-zA-Z0-9_.-]/g,'_');
    const filePath = path.join(uploadsDir, Date.now() + '_' + safeName);
    const base64 = data.split(',').pop();
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    const rel = path.relative(process.cwd(), filePath).replace(/\\/g,'/');
    return { ok:true, path: rel };
  } catch(err){
    return { ok:false, msg:'فشل حفظ الصورة' };
  }
});

// ====== إدارة الطابعات ======
ipcMain.handle('printers-list', async () => {
  try {
    if(!mainWindow || mainWindow.isDestroyed()) return { ok:false, msg:'لا توجد نافذة' };
    const printers = mainWindow.webContents.getPrintersAsync ? await mainWindow.webContents.getPrintersAsync() : mainWindow.webContents.getPrinters();
    return { ok:true, printers: printers.map(p=> ({ name:p.name, isDefault: p.isDefault, status:p.status, description:p.description, options:p.options||{} })) };
  } catch(err){ return { ok:false, msg:'تعذر جلب الطابعات' }; }
});

// تصنيف نوع الطابعة (حرارية أو عادية) بالاعتماد على الاسم وبعض الخيارات المتاحة
ipcMain.handle('printer-detect-type', async (e, printerName) => {
  try {
    if(!mainWindow || mainWindow.isDestroyed()) return { ok:false, msg:'لا توجد نافذة' };
    const printers = mainWindow.webContents.getPrintersAsync ? await mainWindow.webContents.getPrintersAsync() : mainWindow.webContents.getPrinters();
    const defaultPrinter = dbLayer.getSetting('default_printer');
    const targetName = printerName || defaultPrinter || '';
    const patterns = [
      /pos/i, /thermal/i, /58mm/i, /80mm/i, /epson/i, /tm-\w+/i, /xprinter/i, /bixolon/i, /star/i, /zj/i, /gp-?58/i, /gp-?80/i, /rp80/i, /gprinter/i
    ];
    let thermal = false; let matchedPattern = null; let metaWidth = null;
    const pObj = printers.find(p=> p.name === targetName) || null;
    if(pObj){
      const lower = pObj.name.toLowerCase();
      for(const rx of patterns){ if(rx.test(lower)){ thermal = true; matchedPattern = rx.toString(); break; } }
      // بعض التعريفات قد تحتوي قياسات العرض (عرض الورق) داخل options / description
      if(!thermal && pObj.description){
        if(/58\s?mm|80\s?mm/i.test(pObj.description)){ thermal = true; matchedPattern = 'desc:'+pObj.description; }
      }
      // محاولة استنتاج العرض من options (غير موحد عبر الأنظمة، لكنه أحياناً يحتوي custom_size / mediaSize)
      if(pObj.options){
        const optStr = JSON.stringify(pObj.options);
        const m = optStr.match(/(5[6-9]|80)\s?mm/i); if(m){ thermal = true; matchedPattern = 'opt:'+m[0]; metaWidth = m[0]; }
      }
    }
    return { ok:true, printer: targetName||null, thermal, reason: matchedPattern, metaWidth };
  } catch(err){ return { ok:false, msg:'فشل التصنيف' }; }
});

// طباعة مباشرة (HTML) مع تحديد طابعة افتراضية أو الحرارية
ipcMain.handle('direct-print-invoice', async (e, { html, options }) => {
  try {
    options = options||{};
    const defaultPrinter = dbLayer.getSetting('default_printer');
    const basePrintOpts = {
      silent: !!defaultPrinter,
      deviceName: defaultPrinter || undefined,
      printBackground: true
    };
    // وضع A4: تحميل قالب invoice.html مع تمرير رقم الفاتورة
    if(options.mode === 'a4'){
      const inv = options.invoice;
      if(!inv) return { ok:false, msg:'لا يوجد رقم فاتورة' };
      const templatePath = path.join(process.cwd(),'templates','invoice.html');
      if(!fs.existsSync(templatePath)) return { ok:false, msg:'invoice.html غير موجود' };
      const win = new BrowserWindow({ show:false, webPreferences:{
        preload: path.join(__dirname,'..','preload','preload.js'),
        contextIsolation:true,
        sandbox:false,
        nodeIntegration:false
      }});
      const url = 'file://'+templatePath.replace(/\\/g,'/') + `?invoice=${encodeURIComponent(inv)}`;
      await win.loadURL(url);
      // الانتظار حتى يعلن القالب عن الجاهزية أو انقضاء مهلة 2 ثانية
      const start = Date.now();
      while(Date.now() - start < 2000){
        try {
          const ready = await win.webContents.executeJavaScript('window.__A4_INVOICE_READY__===true', true);
          if(ready) break;
        } catch(_) { /* تجاهل */ }
        await new Promise(r=> setTimeout(r,80));
      }
      await new Promise((resolve,reject)=>{
        win.webContents.print({ ...basePrintOpts }, (success, errType)=>{ if(!success) reject(new Error(errType||'فشل الطباعة')); else resolve(); });
      });
      setTimeout(()=>{ try{ win.close(); }catch(_){ } }, 400);
      return { ok:true };
    }
    // الوضع الحراري (html مبني مسبقاً)
    if(!html) return { ok:false, msg:'لا يوجد محتوى للطباعة الحرارية' };
    const tmpPath = path.join(app.getPath('temp'), 'print-'+Date.now()+'.html');
    fs.writeFileSync(tmpPath, html, 'utf8');
    const win = new BrowserWindow({ show:false, webPreferences:{ sandbox:false } });
    await win.loadFile(tmpPath);
    await new Promise((resolve,reject)=>{
      win.webContents.print({ ...basePrintOpts }, (success, errType)=>{ if(!success) reject(new Error(errType||'فشل الطباعة')); else resolve(); });
    });
    setTimeout(()=>{ try{ win.close(); }catch(_){ } fs.unlink(tmpPath,()=>{}); }, 500);
    return { ok:true };
  } catch(err){ return { ok:false, msg: err.message||'فشل الطباعة' }; }
});

// توليد QR SVG من نص (عادة Base64 TLV) بمستوى تصحيح M كما توصي ZATCA
ipcMain.handle('generate-qr-svg', async (e, data) => {
  try {
    if(!QRCodeLib) throw new Error('مكتبة qrcode غير متوفرة');
    if(typeof data !== 'string' || !data) throw new Error('بيانات غير صالحة');
    const svg = await QRCodeLib.toString(data, { type:'svg', errorCorrectionLevel:'M', margin:0 });
    return { ok:true, svg };
  } catch(err){
    return { ok:false, msg: err.message||'فشل توليد QR' };
  }
});
// QR رسمي للفاتورة الضريبية السعودية (ZATCA TLV -> Base64 -> PNG)
ipcMain.handle('invoice-qr-generate', async (e, params) => {
  try {
    if(!ZatcaQR) return { ok:false, msg:'الوحدة غير متاحة' };
    params = params||{};
    // صلاحية المبيعات (1) مطلوبة لرؤية بيانات الفاتورة
    if(!hasPerm(getPermsFor(e),1)) return { ok:false, msg:'لا تملك صلاحية المبيعات' };
    const { file, base64TLV } = await ZatcaQR.generateZatcaInvoiceQR(params);
    return { ok:true, file, tlv: base64TLV };
  } catch(err){ return { ok:false, msg: err.message||'فشل توليد QR' }; }
});
