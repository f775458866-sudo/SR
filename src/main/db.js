const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(process.cwd(), 'asas.db');
let SQL; let db; let ready=false;
// إدارة الحفظ غير المتزامن لتقليل حظر الحلقة الرئيسية عند كل عملية (بدلاً من writeFileSync المتكرر)
let __saveTimer=null; let __saveInProgress=false; let __saveQueued=false; const SAVE_DELAY=600; // يمكن تعديلها (ms)

function persistSync(){ if(!db) return; try { const data = db.export(); fs.writeFileSync(DB_FILE, Buffer.from(data)); } catch(e){ console.warn('persistSync خطأ', e); } }
function schedulePersist(){
  if(!db) return;
  if(__saveTimer){ __saveQueued=true; return; }
  __saveTimer = setTimeout(()=>{
    __saveTimer=null; __saveInProgress=true; const start=Date.now();
    try {
      const data = db.export();
      fs.writeFile(DB_FILE, Buffer.from(data), err=>{
        __saveInProgress=false;
        if(err) console.warn('persist async فشل', err);
        if(__saveQueued){ __saveQueued=false; schedulePersist(); }
        const dur=Date.now()-start; if(dur>300) console.info('[DB] async persist مدة', dur+'ms');
      });
    } catch(e){ __saveInProgress=false; console.warn('persist async استثناء', e); }
  }, SAVE_DELAY);
}
function persist(){ schedulePersist(); }

async function open(){
  if(ready) return db;
  SQL = await initSqlJs({});
  if(fs.existsSync(DB_FILE)){
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  // تشغيل ترقية المخطط للتأكد من وجود الجداول الجديدة (مثل products) في قواعد قديمة
  try { ensureSchema(); persist(); } catch(_){ /* نتجاهل أي خطأ بسيط أثناء الترقية */ }
  } else {
    db = new SQL.Database();
    init();
    persistSync(); // أول إنشاء يجب أن يكون فوري لتثبيت الملف
  }
  buildArchiveViews();
  try { autoArchiveIfDue(); } catch(e){ console.warn('autoArchiveIfDue فشل', e); }
  ready=true; return db;
}


function run(sql, params=[]){
  db.run(sql, params);
  return { changes: db.getRowsModified() };
}
function get(sql, params=[]){
  const stmt = db.prepare(sql, params); const row = stmt.step()? stmt.getAsObject(): null; stmt.free(); return row;
}
function all(sql, params=[]){
  const stmt = db.prepare(sql, params); const rows=[]; while(stmt.step()) rows.push(stmt.getAsObject()); stmt.free(); return rows;
}

// ====== نظام الأرشفة نصف السنوي ======
const ARCHIVE_INTERVAL_MONTHS = 6; // كل 6 أشهر

function buildArchiveViews(){
  try {
    // SALES ALL
    db.run(`DROP VIEW IF EXISTS sales_all`);
    db.run(`CREATE VIEW sales_all AS 
      SELECT id, invoice_no, customer_id, subtotal, vat, total, created_at, discount, pay_method, paid FROM sales
      UNION ALL
      SELECT id, invoice_no, customer_id, subtotal, vat, total, created_at, discount, pay_method, paid FROM archived_sales`);
  } catch(e){ console.warn('فشل إنشاء sales_all', e); }
  try {
    db.run(`DROP VIEW IF EXISTS sale_items_all`);
    db.run(`CREATE VIEW sale_items_all AS 
      SELECT id, sale_id, product_id, qty, price, total FROM sale_items
      UNION ALL
      SELECT id, sale_id, product_id, qty, price, total FROM archived_sale_items`);
  } catch(e){ console.warn('فشل إنشاء sale_items_all', e); }
  try {
    db.run(`DROP VIEW IF EXISTS sale_returns_all`);
    db.run(`CREATE VIEW sale_returns_all AS 
      SELECT id, sale_id, item_id, product_id, qty, amount, reason, created_at FROM sale_returns
      UNION ALL
      SELECT id, sale_id, item_id, product_id, qty, amount, reason, created_at FROM archived_sale_returns`);
  } catch(e){ console.warn('فشل إنشاء sale_returns_all', e); }
  // PURCHASES unified views
  try {
    db.run(`DROP VIEW IF EXISTS purchases_all`);
    db.run(`CREATE VIEW purchases_all AS 
      SELECT id, invoice_no, supplier_id, invoice_date, supplier_invoice_no, subtotal_ex, vat, total, pay_type, created_at FROM purchases
      UNION ALL
      SELECT id, invoice_no, supplier_id, invoice_date, supplier_invoice_no, subtotal_ex, vat, total, pay_type, created_at FROM archived_purchases`);
  } catch(e){ console.warn('فشل إنشاء purchases_all', e); }
  try {
    db.run(`DROP VIEW IF EXISTS purchase_items_all`);
    db.run(`CREATE VIEW purchase_items_all AS 
      SELECT id, purchase_id, product_id, qty, price_ex, price_inc, vat_amount, total_inc FROM purchase_items
      UNION ALL
      SELECT id, purchase_id, product_id, qty, price_ex, price_inc, vat_amount, total_inc FROM archived_purchase_items`);
  } catch(e){ console.warn('فشل إنشاء purchase_items_all', e); }
  try {
    db.run(`DROP VIEW IF EXISTS purchase_returns_all`);
    db.run(`CREATE VIEW purchase_returns_all AS 
      SELECT id, purchase_id, item_id, product_id, qty, amount, reason, created_at FROM purchase_returns
      UNION ALL
      SELECT id, purchase_id, item_id, product_id, qty, amount, reason, created_at FROM archived_purchase_returns`);
  } catch(e){ console.warn('فشل إنشاء purchase_returns_all', e); }
}

function lastArchiveInfo(){
  try { const row = get(`SELECT value FROM settings WHERE key='last_archive_at'`); if(!row) return null; return JSON.parse(row.value); } catch(_){ return null; }
}
function setLastArchiveInfo(obj){
  try {
    const exists = get(`SELECT key FROM settings WHERE key='last_archive_at'`);
    const v = JSON.stringify(obj||{});
    if(exists) run(`UPDATE settings SET value=? WHERE key='last_archive_at'`, [v]); else run(`INSERT INTO settings(key,value) VALUES('last_archive_at',?)`, [v]);
    persist();
  } catch(_){ }
}

function autoArchiveIfDue(){
  const info = lastArchiveInfo();
  const now = new Date();
  if(info && info.date){
    const last = new Date(info.date);
    const diffMonths = (now.getFullYear()-last.getFullYear())*12 + (now.getMonth()-last.getMonth());
    if(diffMonths < ARCHIVE_INTERVAL_MONTHS) return; // لم يحن الوقت
  }
  // نفّذ الأرشفة
  archiveOldSales();
  setLastArchiveInfo({ date: new Date().toISOString() });
}

function archiveOldSales(){
  // نحرك كل ما يسبق بداية الفترة نصف السنوية الحالية
  // تحديد حد البداية: أول يوم في الشهر الحالي ناقص 6 أشهر
  const now = new Date();
  const boundary = new Date(now.getFullYear(), now.getMonth(), 1); // بداية الشهر الحالي
  // كل ما قبل boundary - (ARCHIVE_INTERVAL_MONTHS-1) أشهر يبقى حي، الباقي يؤرشف؟
  // تبسيط: نؤرشف كل ما تاريخ إنشائه < (boundary - 6 أشهر)
  const cut = new Date(boundary); cut.setMonth(cut.getMonth() - ARCHIVE_INTERVAL_MONTHS);
  const cutIso = cut.toISOString();
  // حدد السجلات القديمة
  const oldSales = all(`SELECT * FROM sales WHERE created_at < ? ORDER BY id LIMIT 10000`, [cutIso]);
  const oldPurchases = all(`SELECT * FROM purchases WHERE created_at < ? ORDER BY id LIMIT 10000`, [cutIso]);
  if(!oldSales.length && !oldPurchases.length) return;
  // أرشفة المشتريات القديمة
  oldPurchases.forEach(p=>{
    try {
      run(`INSERT OR IGNORE INTO archived_purchases(id, invoice_no, supplier_id, invoice_date, supplier_invoice_no, subtotal_ex, vat, total, pay_type, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, [p.id, p.invoice_no, p.supplier_id, p.invoice_date, p.supplier_invoice_no, p.subtotal_ex, p.vat, p.total, p.pay_type, p.created_at]);
      const items = all(`SELECT * FROM purchase_items WHERE purchase_id=?`, [p.id]);
      items.forEach(it=>{
        run(`INSERT OR IGNORE INTO archived_purchase_items(id, purchase_id, product_id, qty, price_ex, price_inc, vat_amount, total_inc) VALUES(?,?,?,?,?,?,?,?)`, [it.id, it.purchase_id, it.product_id, it.qty, it.price_ex, it.price_inc, it.vat_amount, it.total_inc]);
      });
      const rets = all(`SELECT * FROM purchase_returns WHERE purchase_id=?`, [p.id]);
      rets.forEach(r=>{
        run(`INSERT OR IGNORE INTO archived_purchase_returns(id, purchase_id, item_id, product_id, qty, amount, reason, created_at) VALUES(?,?,?,?,?,?,?,?)`, [r.id, r.purchase_id, r.item_id, r.product_id, r.qty, r.amount, r.reason, r.created_at]);
      });
      run(`DELETE FROM purchase_items WHERE purchase_id=?`, [p.id]);
      run(`DELETE FROM purchase_returns WHERE purchase_id=?`, [p.id]);
      run(`DELETE FROM purchases WHERE id=?`, [p.id]);
    } catch(e){ console.warn('فشل أرشفة مشتريات', p.id, e); }
  });
  // إدراج في archived_sales مع مراعاة الأعمدة الإضافية (قد تكون NULL في السجلات القديمة فنعوضها)
  oldSales.forEach(s=>{
    try {
      run(`INSERT OR IGNORE INTO archived_sales(id, invoice_no, customer_id, subtotal, vat, total, created_at, discount, pay_method, paid) VALUES(?,?,?,?,?,?,?,?,?,?)`, [s.id, s.invoice_no, s.customer_id, s.subtotal, s.vat, s.total, s.created_at, s.discount||0, s.pay_method||'', s.paid||0]);
      // العناصر
      const items = all(`SELECT * FROM sale_items WHERE sale_id=?`, [s.id]);
      items.forEach(it=>{
        run(`INSERT OR IGNORE INTO archived_sale_items(id, sale_id, product_id, qty, price, total) VALUES(?,?,?,?,?,?)`, [it.id, it.sale_id, it.product_id, it.qty, it.price, it.total]);
      });
      const rets = all(`SELECT * FROM sale_returns WHERE sale_id=?`, [s.id]);
      rets.forEach(r=>{
        run(`INSERT OR IGNORE INTO archived_sale_returns(id, sale_id, item_id, product_id, qty, amount, reason, created_at) VALUES(?,?,?,?,?,?,?,?)`, [r.id, r.sale_id, r.item_id, r.product_id, r.qty, r.amount, r.reason, r.created_at]);
      });
      // الحذف من الجداول الحية
      run(`DELETE FROM sale_items WHERE sale_id=?`, [s.id]);
      run(`DELETE FROM sale_returns WHERE sale_id=?`, [s.id]);
      run(`DELETE FROM sales WHERE id=?`, [s.id]);
    } catch(e){ console.warn('فشل أرشفة فاتورة', s.id, e); }
  });
  buildArchiveViews();
  persist();
}

function ensureSchema(){
  // إنشاء الجداول الأساسية (قد تكون موجودة سابقاً)
  // ملاحظة هامة: تم تعطيل إسقاط جداول الديون للحفاظ على البيانات بين عمليات التشغيل.
  // إذا احتجت لتصفير النظام يدوياً يمكن (مؤقتاً فقط) إعادة تفعيل أوامر DROP أدناه.
  // try { run(`DROP TABLE IF EXISTS debts_customers`); } catch(_){ }
  // try { run(`DROP TABLE IF EXISTS debts`); } catch(_){ }
  // try { run(`DROP TABLE IF EXISTS debt_payments`); } catch(_){ }
  // إنشاء جداول نظام الديون إن لم تكن موجودة
  run(`CREATE TABLE IF NOT EXISTS debts_customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  run(`CREATE TABLE IF NOT EXISTS debts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    phone TEXT,
    amount REAL NOT NULL,
    details TEXT,
    date TEXT DEFAULT (datetime('now')),
    type TEXT DEFAULT 'debt',
    paid_amount REAL DEFAULT 0,
    paid INTEGER DEFAULT 0,
    FOREIGN KEY (customer_id) REFERENCES debts_customers(id)
  )`);
  run(`CREATE TABLE IF NOT EXISTS debt_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debt_id INTEGER,
    amount REAL NOT NULL,
    details TEXT,
    date TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (debt_id) REFERENCES debts(id)
  )`);
  // ترقيات أعمدة إضافية (في حالة وجود جداول أقدم بدون هذه الأعمدة)
  try { run(`ALTER TABLE debts ADD COLUMN phone TEXT`); } catch(_){ }
  try { run(`ALTER TABLE debts ADD COLUMN paid_amount REAL DEFAULT 0`); } catch(_){ }
  try { run(`ALTER TABLE debts ADD COLUMN paid INTEGER DEFAULT 0`); } catch(_){ }
  try { run(`ALTER TABLE debt_payments ADD COLUMN details TEXT`); } catch(_){ }
  // ترقيات أعمدة إضافية مفقودة في بعض الإصدارات الأقدم (لضمان وجود الأعمدة المستخدمة حالياً)
  try { run(`ALTER TABLE debts ADD COLUMN customer_id INTEGER`); } catch(_){ }
  try { run(`ALTER TABLE debts ADD COLUMN type TEXT DEFAULT 'debt'`); } catch(_){ }
  // ============================================================================
  run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, role_id INTEGER, active INTEGER DEFAULT 1, created_at TEXT)`);
  run(`CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, permissions INTEGER, created_at TEXT)`);
  run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  run(`CREATE TABLE IF NOT EXISTS activation (id INTEGER PRIMARY KEY CHECK (id=1), code TEXT, activated_at TEXT)`);
  // جداول مُضافة لاحقاً
  run(`CREATE TABLE IF NOT EXISTS product_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)`);
  run(`CREATE TABLE IF NOT EXISTS product_units (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)`);
  run(`CREATE TABLE IF NOT EXISTS product_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)`);
  run(`CREATE TABLE IF NOT EXISTS stores (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE)`);
  // ترقيات حقول المخازن
  try { run(`ALTER TABLE stores ADD COLUMN location TEXT`); } catch(_){ }
  try { run(`ALTER TABLE stores ADD COLUMN manager TEXT`); } catch(_){ }
  try { run(`ALTER TABLE stores ADD COLUMN notes TEXT`); } catch(_){ }
  try { run(`ALTER TABLE stores ADD COLUMN phone TEXT`); } catch(_){ }
  try { run(`ALTER TABLE stores ADD COLUMN rating REAL DEFAULT 0`); } catch(_){ }
  // مخطط المنتجات الموسّع (للقواعد الجديدة). القواعد القديمة ستُرقّى بواسطة ALTER لاحقاً.
  run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    barcode TEXT UNIQUE,
    model TEXT,
    sku TEXT,
    brand TEXT,
    qty INTEGER DEFAULT 0,
    purchase_price REAL,
    sale_price REAL,
    discount_price REAL,
    discount_start TEXT,
    discount_end TEXT,
    group_id INTEGER,
    unit_id INTEGER,
    category_id INTEGER,
    store_id INTEGER,
    low_stock INTEGER,
    reorder_qty INTEGER,
    max_stock INTEGER,
    average_cost REAL,
    last_cost REAL,
    margin_percent REAL,
    price_level2 REAL,
    price_level3 REAL,
    vat_rate REAL,
    allow_negative INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    weight REAL,
    width REAL,
    height REAL,
    depth REAL,
    color TEXT,
    size TEXT,
    origin_country TEXT,
    image_path TEXT,
    notes TEXT,
    created_at TEXT,
    updated_at TEXT,
    updated_by INTEGER
  )`);
  // ترقيات أعمدة للمنتجات (قد تكون مفقودة في قواعد قديمة)
  const prodNewCols = [
    ['sku','TEXT'],['brand','TEXT'],['reorder_qty','INTEGER'],['max_stock','INTEGER'],['average_cost','REAL'],['last_cost','REAL'],['margin_percent','REAL'],['price_level2','REAL'],['price_level3','REAL'],['vat_rate','REAL'],['allow_negative','INTEGER DEFAULT 0'],['active','INTEGER DEFAULT 1'],['weight','REAL'],['width','REAL'],['height','REAL'],['depth','REAL'],['color','TEXT'],['size','TEXT'],['origin_country','TEXT'],['updated_at','TEXT'],['updated_by','INTEGER']
  ];
  prodNewCols.forEach(c=>{ try { run(`ALTER TABLE products ADD COLUMN ${c[0]} ${c[1]}`); } catch(_){ } });
  run(`CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, address TEXT, created_at TEXT)`);
  // ترقيات أعمدة العملاء الجديدة
  const customerNewCols = [
    ['type','TEXT'], ['vat','TEXT'], ['whatsapp','TEXT'], ['email','TEXT'], ['cr','TEXT'], ['start_date','TEXT'],
    ['city','TEXT'], ['district','TEXT'], ['street','TEXT'], ['zip','TEXT'], ['building','TEXT'],
    ['short_address','TEXT'], ['addr_extra','TEXT'],
    ['loyalty_points','INTEGER DEFAULT 0'], ['notes','TEXT'], ['account_type','TEXT DEFAULT "نقد"'], ['balance','REAL DEFAULT 0']
  ];
  customerNewCols.forEach(c=>{ try { run(`ALTER TABLE customers ADD COLUMN ${c[0]} ${c[1]}`); } catch(_){ } });
  run(`CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_no TEXT, customer_id INTEGER, subtotal REAL, vat REAL, total REAL, created_at TEXT)`);
  run(`CREATE TABLE IF NOT EXISTS sale_items (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER, product_id INTEGER, qty INTEGER, price REAL, total REAL)`);
  // مرتجعات المبيعات (جزئية لكل بند)
  run(`CREATE TABLE IF NOT EXISTS sale_returns (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER, item_id INTEGER, product_id INTEGER, qty INTEGER, amount REAL, reason TEXT, created_at TEXT)`);
  // جداول الأرشيف (نفس البنية لتسهيل UNION)
  run(`CREATE TABLE IF NOT EXISTS archived_sales (id INTEGER PRIMARY KEY, invoice_no TEXT, customer_id INTEGER, subtotal REAL, vat REAL, total REAL, created_at TEXT, discount REAL DEFAULT 0, pay_method TEXT, paid REAL DEFAULT 0)`);
  run(`CREATE TABLE IF NOT EXISTS archived_sale_items (id INTEGER PRIMARY KEY, sale_id INTEGER, product_id INTEGER, qty INTEGER, price REAL, total REAL)`);
  run(`CREATE TABLE IF NOT EXISTS archived_sale_returns (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER, item_id INTEGER, product_id INTEGER, qty INTEGER, amount REAL, reason TEXT, created_at TEXT)`);
  // فهارس مساعدة
  try { run(`CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at)`); } catch(_){ }
  try { run(`CREATE INDEX IF NOT EXISTS idx_arch_sales_created_at ON archived_sales(created_at)`); } catch(_){ }
  try { run(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id)`); } catch(_){ }
  try { run(`CREATE INDEX IF NOT EXISTS idx_arch_sale_items_sale_id ON archived_sale_items(sale_id)`); } catch(_){ }
  run(`CREATE TABLE IF NOT EXISTS stock_movements (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, change INTEGER, reason TEXT, ref_id INTEGER, created_at TEXT)`);
  // سجل العمليات (تحويلات وغيرها)
  run(`CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, type TEXT, product_id INTEGER, from_store INTEGER, to_store INTEGER, qty INTEGER, note TEXT, user_id INTEGER)`);
  // ترقية لإضافة user_id إذا كان الجدول قديماً
  try { run(`ALTER TABLE audit_log ADD COLUMN user_id INTEGER`); } catch(_){ }
  // ترقية: إضافة عمود الخصم للمبيعات إن لم يكن موجوداً
  try { run(`ALTER TABLE sales ADD COLUMN discount REAL DEFAULT 0`); } catch(_) { /* ربما موجود */ }
  // ترقية لإضافة طريقة الدفع والمبلغ المدفوع
  try { run(`ALTER TABLE sales ADD COLUMN pay_method TEXT`); } catch(_){ }
  try { run(`ALTER TABLE sales ADD COLUMN paid REAL DEFAULT 0`); } catch(_){ }
  // المصروفات (لبناء تقرير الأرباح)
  run(`CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, amount REAL, category TEXT, note TEXT, created_at TEXT)`);
  // إيصالات القبض (سند قبض عام)
  run(`CREATE TABLE IF NOT EXISTS receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, amount REAL, method TEXT, source TEXT, note TEXT, customer_name TEXT, phone TEXT, created_at TEXT)`);
  // الموردون
  run(`CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL, vat TEXT NOT NULL, whatsapp TEXT, email TEXT, address TEXT, notes TEXT, balance REAL DEFAULT 0, created_at TEXT)`);
  // المشتريات
  run(`CREATE TABLE IF NOT EXISTS purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_no TEXT, supplier_id INTEGER, invoice_date TEXT, supplier_invoice_no TEXT, subtotal_ex REAL, vat REAL, total REAL, pay_type TEXT, created_at TEXT)`);
  run(`CREATE TABLE IF NOT EXISTS purchase_items (id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_id INTEGER, product_id INTEGER, qty INTEGER, price_ex REAL, price_inc REAL, vat_amount REAL, total_inc REAL)`);
  run(`CREATE TABLE IF NOT EXISTS purchase_returns (id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_id INTEGER, item_id INTEGER, product_id INTEGER, qty INTEGER, amount REAL, reason TEXT, created_at TEXT)`);
  // أرشيف المشتريات
  run(`CREATE TABLE IF NOT EXISTS archived_purchases (id INTEGER PRIMARY KEY, invoice_no TEXT, supplier_id INTEGER, invoice_date TEXT, supplier_invoice_no TEXT, subtotal_ex REAL, vat REAL, total REAL, pay_type TEXT, created_at TEXT)`);
  run(`CREATE TABLE IF NOT EXISTS archived_purchase_items (id INTEGER PRIMARY KEY, purchase_id INTEGER, product_id INTEGER, qty INTEGER, price_ex REAL, price_inc REAL, vat_amount REAL, total_inc REAL)`);
  run(`CREATE TABLE IF NOT EXISTS archived_purchase_returns (id INTEGER PRIMARY KEY, purchase_id INTEGER, item_id INTEGER, product_id INTEGER, qty INTEGER, amount REAL, reason TEXT, created_at TEXT)`);
  try { run(`CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON purchases(created_at)`); } catch(_){ }
  try { run(`CREATE INDEX IF NOT EXISTS idx_arch_purchases_created_at ON archived_purchases(created_at)`); } catch(_){ }
  try { run(`CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id)`); } catch(_){ }
  try { run(`CREATE INDEX IF NOT EXISTS idx_arch_purchase_items_purchase_id ON archived_purchase_items(purchase_id)`); } catch(_){ }
  // تم إزالة مخطط قديم مكرر لجداول الديون (كان يُعيد إنشاء debts و debt_payments بصيغة أقدم) لتفادي تعارض الأعمدة.
  // تأكيد وجود دور admin وحساب manager (قد تُحدث قاعدة قديمة بدون init())
  // مدفوعات جزئية
  run(`CREATE TABLE IF NOT EXISTS debt_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, debt_id INTEGER, amount REAL, note TEXT, date TEXT)`);
  // تأكيد وجود دور admin وحساب manager (قد تُحدث قاعدة قديمة بدون init())
  try {
    const admin = get(`SELECT id FROM roles WHERE name='admin'`); if(!admin){
      const now = new Date().toISOString(); run(`INSERT INTO roles(name, permissions, created_at) VALUES(?,?,?)`, ['admin', 0xFFFFFFFF, now]);
    }
  } catch(_){ }
  try {
    const mgr = get(`SELECT id FROM users WHERE username='manager'`); if(!mgr){
      const now = new Date().toISOString(); const hash = bcrypt.hashSync('1234',10); const adminIdRow = get(`SELECT id FROM roles WHERE name='admin'`); const rid = adminIdRow? adminIdRow.id : 1; run(`INSERT INTO users(username,password_hash,role_id,active,created_at) VALUES(?,?,?,?,?)`, ['manager', hash, rid, 1, now]);
    }
  } catch(_){ }
}

function init(){
  ensureSchema();
  // بيانات افتراضية أول مرة فقط
  const now = new Date().toISOString();
  try {
    run(`INSERT INTO roles(name, permissions, created_at) VALUES(?,?,?)`, ['admin', 0xFFFFFFFF, now]);
  } catch(_) { /* ربما موجود بالفعل */ }
  try {
    const hash = bcrypt.hashSync('1234', 10);
    run(`INSERT INTO users(username,password_hash,role_id,created_at) VALUES(?,?,?,?)`, ['manager', hash, 1, now]);
  } catch(_) { /* المستخدم موجود */ }
}

function authenticate(username, password){
  const row = get(`SELECT u.id,u.username,u.password_hash,r.permissions FROM users u LEFT JOIN roles r ON u.role_id=r.id WHERE u.username=? AND u.active=1`, [username]);
  if(!row) return null; if(!bcrypt.compareSync(password, row.password_hash)) return null; return { id: row.id, username: row.username, permissions: row.permissions };
}

function listUsers(){
  return all(`SELECT u.id,u.username,u.active,r.name AS role FROM users u LEFT JOIN roles r ON u.role_id=r.id ORDER BY u.id`);
}

// ====== Roles & Users Management (Permissions Bitmask) ======
// ملاحظات: نستعمل جدول roles الموجود. يمكن إنشاء دور جديد لكل مجموعة صلاحيات.
// mask مثال (بتات الصلاحيات):
// 1=مبيعات, 2=منتجات, 4=عملاء, 8=موردون, 16=تقارير, 32=إعدادات عامة, 64=مخزون/تحويل/جرد, 128=ديون,
// 256=إدارة المستخدمين والصلاحيات, 512=حذف/تعديل فواتير بعد الحفظ, 1024=مالية/مصروفات وهوامش
function listRoles(){
  return all(`SELECT id,name,permissions FROM roles ORDER BY id`);
}
function addRole(name, permissions){
  if(!name) throw new Error('اسم الدور مطلوب');
  const now = new Date().toISOString();
  run(`INSERT INTO roles(name, permissions, created_at) VALUES(?,?,?)`, [name.trim(), permissions>>>0, now]);
  persist();
  return get(`SELECT * FROM roles WHERE id=(SELECT MAX(id) FROM roles)`);
}
function updateRole(id,{name,permissions}){
  const role = get(`SELECT * FROM roles WHERE id=?`, [id]);
  if(!role) throw new Error('دور غير موجود');
  const newName = name? name.trim(): role.name;
  const newPerm = permissions===undefined? role.permissions : (permissions>>>0);
  run(`UPDATE roles SET name=?, permissions=? WHERE id=?`, [newName, newPerm, id]);
  persist();
  return get(`SELECT * FROM roles WHERE id=?`, [id]);
}
function addUser({username,password,role_id,permissions,active}){
  if(!username) throw new Error('اسم المستخدم مطلوب');
  if(!password) throw new Error('رمز الدخول مطلوب');
  // في حال تم تمرير permissions بدون role_id ننشئ دوراً خاصاً باسم user_<username>
  let rid = role_id;
  if(!rid){
    if(permissions===undefined) permissions = 0; // بدون صلاحيات
    // ابحث عن دور بنفس الاسم أولاً
    const existing = get(`SELECT id FROM roles WHERE name=?`, ['user_'+username]);
    if(existing) rid = existing.id; else {
      const r = addRole('user_'+username, permissions>>>0);
      rid = r.id;
    }
  }
  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(password+'' , 10);
  run(`INSERT INTO users(username,password_hash,role_id,active,created_at) VALUES(?,?,?,?,?)`, [username.trim(), hash, rid, (active===0||active===false)?0:1, now]);
  persist();
  return get(`SELECT id,username,role_id,active FROM users WHERE id=(SELECT MAX(id) FROM users)`);
}
function updateUser(id,{password,role_id,active,permissions}){
  const u = get(`SELECT * FROM users WHERE id=?`, [id]);
  if(!u) throw new Error('مستخدم غير موجود');
  let rid = role_id || u.role_id;
  // إذا تم تمرير permissions صراحةً ننشئ/نحدث دور المستخدم الفردي
  if(permissions!==undefined){
    // ابحث عن دور user_<username>
    let r = get(`SELECT * FROM roles WHERE name=?`, ['user_'+u.username]);
    if(r){ updateRole(r.id,{ permissions: permissions>>>0 }); rid = r.id; }
    else { r = addRole('user_'+u.username, permissions>>>0); rid = r.id; }
  }
  let setParts = []; let vals=[];
  if(password){ setParts.push('password_hash=?'); vals.push(bcrypt.hashSync(password+'',10)); }
  if(rid){ setParts.push('role_id=?'); vals.push(rid); }
  if(active!==undefined){ setParts.push('active=?'); vals.push(active?1:0); }
  if(!setParts.length) return { ok:true }; // لا شيء
  vals.push(id);
  run(`UPDATE users SET ${setParts.join(', ')} WHERE id=?`, vals);
  persist();
  return get(`SELECT id,username,role_id,active FROM users WHERE id=?`, [id]);
}

function deleteUser(id){
  if(!id) throw new Error('معرف مستخدم غير صالح');
  // منع حذف المدير الافتراضي لحماية النظام
  const u = get(`SELECT * FROM users WHERE id=?`, [id]);
  if(!u) throw new Error('المستخدم غير موجود');
  if(u.username==='manager') throw new Error('لا يمكن حذف المستخدم المدير');
  run(`DELETE FROM users WHERE id=?`, [id]);
  persist();
  return true;
}

// =============== CRUD Products ===============
function ensureBarcode(){
  return 'P' + Math.random().toString(36).slice(2,10).toUpperCase();
}

function addProduct(data){
  if(!data || !data.name) throw new Error('اسم المنتج مفقود');
  const now = new Date().toISOString();
  const barcode = data.barcode && data.barcode.trim() ? data.barcode.trim() : ensureBarcode();
  try {
    const existing = get(`SELECT id FROM products WHERE barcode=?`, [barcode]);
    if(existing) throw new Error('الباركود مستخدم سابقاً');
  } catch(_){ }
  // حساب هوامش وتسعير افتراضي
  let purchase = data.purchase_price||0;
  let sale = data.sale_price||0;
  if((!sale || sale===0) && data.margin_percent){ sale = purchase * (1 + (data.margin_percent/100)); }
  const margin = data.margin_percent || (purchase? ((sale - purchase)/purchase)*100 : null);
  const avgCost = data.average_cost || purchase;
  const lastCost = data.last_cost || purchase;
  run(`INSERT INTO products(
    name, barcode, model, sku, brand, qty, purchase_price, sale_price, discount_price, discount_start, discount_end, group_id, unit_id, category_id, store_id, low_stock, reorder_qty, max_stock, average_cost, last_cost, margin_percent, price_level2, price_level3, vat_rate, allow_negative, active, weight, width, height, depth, color, size, origin_country, image_path, notes, created_at, updated_at, updated_by
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    data.name, barcode, data.model||'', data.sku||'', data.brand||'', data.qty||0, purchase, sale, data.discount_price||null, data.discount_start||null, data.discount_end||null, data.group_id||null, data.unit_id||null, data.category_id||null, data.store_id||null, data.low_stock||0, data.reorder_qty||null, data.max_stock||null, avgCost||null, lastCost||null, margin||null, data.price_level2||null, data.price_level3||null, data.vat_rate||null, data.allow_negative?1:0, data.active===0?0:1, data.weight||null, data.width||null, data.height||null, data.depth||null, data.color||null, data.size||null, data.origin_country||null, data.image_path||null, data.notes||'', now, now, data.updated_by||null
  ]);
  persist();
  return get(`SELECT * FROM products WHERE id = (SELECT MAX(id) FROM products)`);
}

function updateProduct(id, data){
  if(!id) throw new Error('معرف المنتج غير صالح');
  if(!data || !data.name) throw new Error('اسم المنتج مفقود');
  const now = new Date().toISOString();
  let purchase = data.purchase_price||0;
  let sale = data.sale_price||0;
  if((!sale || sale===0) && data.margin_percent){ sale = purchase * (1 + (data.margin_percent/100)); }
  const margin = data.margin_percent || (purchase? ((sale - purchase)/purchase)*100 : null);
  const avgCost = data.average_cost || purchase;
  const lastCost = data.last_cost || purchase;
  run(`UPDATE products SET name=?, barcode=?, model=?, sku=?, brand=?, qty=?, purchase_price=?, sale_price=?, discount_price=?, discount_start=?, discount_end=?, group_id=?, unit_id=?, category_id=?, store_id=?, low_stock=?, reorder_qty=?, max_stock=?, average_cost=?, last_cost=?, margin_percent=?, price_level2=?, price_level3=?, vat_rate=?, allow_negative=?, active=?, weight=?, width=?, height=?, depth=?, color=?, size=?, origin_country=?, image_path=?, notes=?, updated_at=?, updated_by=? WHERE id=?`, [
    data.name, data.barcode, data.model||'', data.sku||'', data.brand||'', data.qty||0, purchase, sale, data.discount_price||null, data.discount_start||null, data.discount_end||null, data.group_id||null, data.unit_id||null, data.category_id||null, data.store_id||null, data.low_stock||0, data.reorder_qty||null, data.max_stock||null, avgCost||null, lastCost||null, margin||null, data.price_level2||null, data.price_level3||null, data.vat_rate||null, data.allow_negative?1:0, data.active===0?0:1, data.weight||null, data.width||null, data.height||null, data.depth||null, data.color||null, data.size||null, data.origin_country||null, data.image_path||null, data.notes||'', now, data.updated_by||null, id
  ]);
  persist();
  return get(`SELECT * FROM products WHERE id=?`, [id]);
}

function deleteProduct(id){
  run(`DELETE FROM products WHERE id=?`, [id]);
  persist();
  return true;
}

function listProducts(filter){
  if(filter){
    const f = `%${filter}%`;
    return all(`SELECT * FROM products WHERE name LIKE ? OR barcode LIKE ? OR model LIKE ? ORDER BY id DESC`, [f,f,f]);
  }
  return all(`SELECT * FROM products ORDER BY id DESC`);
}

// =============== Sales Reporting Helpers ===============
function _rangeBounds(period){
  const now = new Date();
  let start, end;
  if(period==='today'){
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    end = new Date(start.getTime() + 86400000);
  } else if(period==='week'){
    const day = now.getDay(); // 0 Sunday
    const diff = (day===0?6:day-1); // جعل الاثنين بداية (تقريب)
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate()-diff);
    end = new Date(start.getTime() + 7*86400000);
  } else if(period==='month'){
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth()+1, 1);
  } else if(period==='year'){
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear()+1, 0, 1);
  } else { // default full range
    start = new Date(0); end = new Date(now.getTime()+86400000);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

function salesSummary(period){
  const { start, end } = _rangeBounds(period);
  const rows = all(`SELECT * FROM sales_all WHERE created_at >= ? AND created_at < ? ORDER BY created_at ASC`, [start,end]);
  let gross=0, discount=0, vat=0, net=0;
  rows.forEach(r=>{ gross += (r.subtotal||0); discount += (r.discount||0); vat += (r.vat||0); net += (r.total||0); });
  // تجميع حسب اليوم/التاريخ للرسم
  const bucket = {};
  rows.forEach(r=>{ const d = (r.created_at||'').slice(0,10); bucket[d] = (bucket[d]||0)+1; });
  const timeline = Object.keys(bucket).sort();
  return { gross, discount, vat, net, timeline: timeline.map(d=>({ date:d, count: bucket[d] })) };
}

function salesDetails(period, search){
  const { start, end } = _rangeBounds(period);
  let rows = all(`SELECT s.*, c.name AS customer_name FROM sales_all s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.created_at >= ? AND s.created_at < ? ORDER BY s.id DESC`, [start,end]);
  if(search){
    const f = search.toLowerCase();
    rows = rows.filter(r=> (r.invoice_no||'').toLowerCase().includes(f) || (r.customer_name||'').toLowerCase().includes(f));
  }
  return rows;
}

// =============== Profit Reporting ===============
function sumExpenses(period){
  const { start, end } = _rangeBounds(period);
  const rows = all(`SELECT amount FROM expenses WHERE created_at >= ? AND created_at < ?`, [start,end]);
  return rows.reduce((a,b)=> a + (b.amount||0), 0);
}

function profitSummary(period){
  const sales = salesSummary(period); // يحتوي net وغيره
  // حساب المشتريات الفعلية من جدول المشتريات
  const { start, end } = _rangeBounds(period);
  const purchRows = all(`SELECT total FROM purchases_all WHERE created_at >= ? AND created_at < ?`, [start,end]);
  const purchasesTotal = purchRows.reduce((a,b)=> a + (b.total||0), 0);
  const expensesTotal = sumExpenses(period);
  const netProfit = sales.net - purchasesTotal - expensesTotal;
  const margin = sales.net>0 ? (netProfit / sales.net) : 0;
  return { salesTotal: sales.net, purchasesTotal, expensesTotal, netProfit, margin };
}

function topBottomProducts(period){
  const { start, end } = _rangeBounds(period);
  // إجمالي الكمية المباعة لكل منتج (يمكن تعديلها للإيراد لاحقاً)
  const rows = all(`SELECT si.product_id, p.name, SUM(si.qty) as qty, SUM(si.total) as revenue
                    FROM sale_items si
                    LEFT JOIN sales s ON s.id = si.sale_id
                    LEFT JOIN products p ON p.id = si.product_id
                    WHERE s.created_at >= ? AND s.created_at < ?
                    GROUP BY si.product_id
                    ORDER BY qty DESC`, [start,end]);
  const top5 = rows.slice(0,5);
  const bottom5 = rows.slice(-5).reverse();
  return { top5, bottom5 };
}


// إنشاء PDF بسيط للتقرير (يتطلب pdfkit محملة في main لاحقاً) — سنوفر فقط البيانات هنا والـ main يتولى PDF إن لزم.
// (اختياري: يمكن تحويله لاحقاً إلى وظيفة كاملة داخل dbLayer)


function financeSummary(period){
  const prof = profitSummary(period);
  const { start, end } = _rangeBounds(period);
  // التدفقات النقدية من المبيعات حسب طريقة الدفع (إن وجدت)
  const cashRows = all(`SELECT total FROM sales WHERE created_at >= ? AND created_at < ? AND pay_method='cash'`, [start,end]);
  const creditRows = all(`SELECT total FROM sales WHERE created_at >= ? AND created_at < ? AND pay_method='credit'`, [start,end]);
  const cashTotal = cashRows.reduce((a,b)=> a + (b.total||0), 0);
  const creditTotal = creditRows.reduce((a,b)=> a + (b.total||0), 0);
  const profitPercent = prof.salesTotal>0 ? (prof.netProfit / prof.salesTotal) : 0;
  return { 
    salesTotal: prof.salesTotal,
    purchasesTotal: prof.purchasesTotal,
    expensesTotal: prof.expensesTotal,
    netProfit: prof.netProfit,
    margin: prof.margin,
    cashTotal, creditTotal,
    profitPercent
  };
}

// =============== Warehouses (Stores extended) ===============
function addStore(data){
  if(!data || !data.name || !data.name.trim()) throw new Error('الاسم مطلوب');
  if(!data.location || !data.location.trim()) throw new Error('الموقع مطلوب');
  run(`INSERT INTO stores(name, location, manager, phone, rating, notes) VALUES(?,?,?,?,?,?)`, [data.name.trim(), data.location.trim(), data.manager||'', data.phone||'', data.rating||0, data.notes||'']);
  persist();
  return get(`SELECT * FROM stores WHERE id = (SELECT MAX(id) FROM stores)`);
}
function updateStore(id, data){
  run(`UPDATE stores SET name=?, location=?, manager=?, phone=?, rating=?, notes=? WHERE id=?`, [data.name, data.location||'', data.manager||'', data.phone||'', data.rating||0, data.notes||'', id]);
  persist();
  return get(`SELECT * FROM stores WHERE id=?`, [id]);
}
function deleteStore(id){
  run(`DELETE FROM stores WHERE id=?`, [id]);
  persist();
  return true;
}
function listStores(filter='') {
  const where = filter ? `WHERE name LIKE ? OR location LIKE ? OR manager LIKE ? OR phone LIKE ?` : '';
  const params = filter ? [`%${filter}%`,`%${filter}%`,`%${filter}%`,`%${filter}%`] : [];
  const stmt = db.prepare(`SELECT s.*, (SELECT COUNT(1) FROM products p WHERE p.store_id = s.id) as products_count FROM stores s ${where} ORDER BY s.id DESC`);
  stmt.bind(params);
  const rows=[]; while(stmt.step()) rows.push(stmt.getAsObject()); stmt.free();
  return rows;
}

function listLowStock(storeId){
  if(storeId){
    return all(`SELECT p.*, s.name AS store_name FROM products p LEFT JOIN stores s ON s.id=p.store_id WHERE p.store_id=? AND p.low_stock IS NOT NULL AND p.low_stock>0 AND p.qty <= p.low_stock ORDER BY p.qty ASC`, [storeId]);
  }
  return all(`SELECT p.*, s.name AS store_name FROM products p LEFT JOIN stores s ON s.id=p.store_id WHERE p.low_stock IS NOT NULL AND p.low_stock>0 AND p.qty <= p.low_stock ORDER BY p.qty ASC`);
}

// ====== Stock Transfer (بين المخازن) ======
function transferStock({ product_id, from_store, to_store, qty, note, user_id }){
  if(!product_id || !from_store || !to_store || !qty) throw new Error('بيانات ناقصة للتحويل');
  if(from_store === to_store) throw new Error('نفس المخزن');
  const prod = get(`SELECT * FROM products WHERE id=?`, [product_id]);
  if(!prod) throw new Error('منتج غير موجود');
  if(prod.store_id !== from_store) throw new Error('المخزن الأصلي لا يطابق المنتج');
  if(qty > prod.qty) throw new Error('كمية غير كافية');
  const now = new Date().toISOString();
  if(qty === prod.qty){
    // نقل كامل
    run(`UPDATE products SET store_id=? WHERE id=?`, [to_store, product_id]);
  } else {
    // تقليل في المصدر ونسخ سجل جديد للوجهة بنفس البيانات مع الكمية المنقولة
    run(`UPDATE products SET qty = qty - ? WHERE id=?`, [qty, product_id]);
    run(`INSERT INTO products(name, barcode, model, qty, purchase_price, sale_price, discount_price, discount_start, discount_end, group_id, unit_id, category_id, store_id, low_stock, image_path, notes, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      prod.name, prod.barcode, prod.model, qty, prod.purchase_price, prod.sale_price, prod.discount_price, prod.discount_start, prod.discount_end, prod.group_id, prod.unit_id, prod.category_id, to_store, prod.low_stock, prod.image_path, prod.notes, now
    ]);
  }
  run(`INSERT INTO audit_log(ts,type,product_id,from_store,to_store,qty,note,user_id) VALUES(?,?,?,?,?,?,?,?)`, [now,'TRANSFER',product_id,from_store,to_store,qty,note||'', user_id||null]);
  persist();
  return { ok:true };
}

function listAuditLog(limit){
  return all(`SELECT a.*, p.name AS product_name, su.username AS user_name, fs.name AS from_store_name, ts.name AS to_store_name
              FROM audit_log a
              LEFT JOIN products p ON p.id=a.product_id
              LEFT JOIN users su ON su.id=a.user_id
              LEFT JOIN stores fs ON fs.id=a.from_store
              LEFT JOIN stores ts ON ts.id=a.to_store
              ORDER BY a.id DESC ${limit? 'LIMIT '+parseInt(limit):''}`);
}

// =============== Customers ===============
function addCustomer(data){
  const now = new Date().toISOString();
  run(`INSERT INTO customers(name, phone, address, type, vat, whatsapp, email, cr, start_date, city, district, street, zip, building, short_address, addr_extra, loyalty_points, notes, account_type, balance, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    data.name, data.phone||'', data.address||'', data.type||'person', data.vat||'', data.whatsapp||'', data.email||'', data.cr||'', data.start_date||'', data.city||'', data.district||'', data.street||'', data.zip||'', data.building||'', data.short_address||'', data.addr_extra||'', data.loyalty_points||0, data.notes||'', data.account_type||'نقد', data.balance||0, now
  ]);
  persist();
  return get(`SELECT * FROM customers WHERE id = (SELECT MAX(id) FROM customers)`);
}
function updateCustomer(id, data){
  run(`UPDATE customers SET name=?, phone=?, address=?, type=?, vat=?, whatsapp=?, email=?, cr=?, start_date=?, city=?, district=?, street=?, zip=?, building=?, short_address=?, addr_extra=?, loyalty_points=?, notes=?, account_type=?, balance=? WHERE id=?`, [
    data.name, data.phone||'', data.address||'', data.type||'person', data.vat||'', data.whatsapp||'', data.email||'', data.cr||'', data.start_date||'', data.city||'', data.district||'', data.street||'', data.zip||'', data.building||'', data.short_address||'', data.addr_extra||'', data.loyalty_points||0, data.notes||'', data.account_type||'نقد', data.balance||0, id
  ]);
  persist();
  return get(`SELECT * FROM customers WHERE id=?`, [id]);
}
function deleteCustomer(id){
  run(`DELETE FROM customers WHERE id=?`, [id]);
  persist();
  return true;
}
function listCustomers(filter){
  if(filter){
    const f = `%${filter}%`;
    return all(`SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? OR vat LIKE ? OR whatsapp LIKE ? ORDER BY id DESC`, [f,f,f,f]);
  }
  return all(`SELECT * FROM customers ORDER BY id DESC`);
}

// عملاء لديهم مبيعات فقط (distinct من جدول المبيعات)
function listSalesCustomers(filter){
  // نأتي بعدد فواتير فعلي لكل عميل (فقط العملاء الذين لديهم >=1)
  let base = `SELECT c.*, COUNT(s.id) AS sales_count
              FROM customers c
              JOIN sales s ON s.customer_id = c.id
              GROUP BY c.id`;
  const having = ' HAVING sales_count > 0';
  const vals=[];
  let whereParts=[];
  if(filter){
    const f=`%${filter}%`;
    whereParts.push('(c.name LIKE ? OR c.phone LIKE ? OR c.vat LIKE ? OR c.whatsapp LIKE ?)');
    vals.push(f,f,f,f);
  }
  if(whereParts.length){
    // نلف الاستعلام الأصلي كـ subquery لسهولة إضافة where قبل التجميع
    base = `SELECT * FROM (SELECT c.*, COUNT(s.id) AS sales_count FROM customers c JOIN sales s ON s.customer_id=c.id GROUP BY c.id) sub WHERE ${whereParts.join(' AND ')}`;
    return all(base + ' ORDER BY sub.id DESC', vals);
  }
  return all(base + having + ' ORDER BY c.id DESC', vals);
}

// =============== Suppliers ===============
function addSupplier(data){
  if(!data || !data.name || !data.phone || !data.vat) throw new Error('بيانات ناقصة');
  const now = new Date().toISOString();
  run(`INSERT INTO suppliers(name, phone, vat, whatsapp, email, address, notes, balance, created_at) VALUES(?,?,?,?,?,?,?,?,?)`, [
    data.name.trim(), data.phone.trim(), data.vat.trim(), (data.whatsapp||'').trim(), (data.email||'').trim(), (data.address||'').trim(), (data.notes||'').trim(), data.balance||0, now
  ]);
  persist();
  return get(`SELECT * FROM suppliers WHERE id = (SELECT MAX(id) FROM suppliers)`);
}
function updateSupplier(id, data){
  if(!id) throw new Error('معرف غير صالح');
  if(!data || !data.name || !data.phone || !data.vat) throw new Error('بيانات ناقصة');
  run(`UPDATE suppliers SET name=?, phone=?, vat=?, whatsapp=?, email=?, address=?, notes=?, balance=? WHERE id=?`, [
    data.name.trim(), data.phone.trim(), data.vat.trim(), (data.whatsapp||'').trim(), (data.email||'').trim(), (data.address||'').trim(), (data.notes||'').trim(), data.balance||0, id
  ]);
  persist();
  return get(`SELECT * FROM suppliers WHERE id=?`, [id]);
}
function deleteSupplier(id){
  run(`DELETE FROM suppliers WHERE id=?`, [id]);
  persist();
  return true;
}
function listSuppliers(filter){
  if(filter){
    const f = `%${filter}%`;
    return all(`SELECT * FROM suppliers WHERE name LIKE ? OR phone LIKE ? OR vat LIKE ? OR whatsapp LIKE ? ORDER BY id DESC`, [f,f,f,f]);
  }
  return all(`SELECT * FROM suppliers ORDER BY id DESC`);
}
function exportSuppliersCSV(targetPath){
  const rows = all(`SELECT id,name,phone,vat,whatsapp,email,address,notes,balance,created_at FROM suppliers ORDER BY id DESC`);
  const header = 'name,phone,vat,whatsapp,email,address,notes,balance,created_at';
  const lines = rows.map(r=> [r.name,r.phone,r.vat,r.whatsapp||'',r.email||'', (r.address||'').replace(/,/g,';'), (r.notes||'').replace(/,/g,';'), r.balance||0, r.created_at||''].join(','));
  const csv = [header, ...lines].join('\n');
  require('fs').writeFileSync(targetPath, csv, 'utf8');
  return { ok:true, count: rows.length };
}

// =============== Purchases ===============
function nextPurchaseNumber(){
  const row = get(`SELECT invoice_no FROM purchases ORDER BY id DESC LIMIT 1`);
  if(!row || !row.invoice_no) return 'P000001';
  const num = parseInt((row.invoice_no||'').replace(/[^0-9]/g,'')) || 0;
  return 'P'+(num+1).toString().padStart(6,'0');
}

function addPurchase(data){
  if(!data || !Array.isArray(data.items) || data.items.length===0) throw new Error('لا توجد بنود');
  const now = new Date().toISOString();
  const invoice_no = data.invoice_no || nextPurchaseNumber();
  const supplier_id = data.supplier_id || null;
  run(`INSERT INTO purchases(invoice_no,supplier_id,invoice_date,supplier_invoice_no,subtotal_ex,vat,total,pay_type,created_at) VALUES(?,?,?,?,?,?,?,?,?)`, [
    invoice_no, supplier_id, data.invoice_date||now.slice(0,10), data.supplier_invoice_no||'', data.subtotal_ex||0, data.vat||0, data.total||0, data.pay_type||'cash', now
  ]);
  const purchase = get(`SELECT * FROM purchases WHERE id = (SELECT MAX(id) FROM purchases)`);
  data.items.forEach(it=>{
    run(`INSERT INTO purchase_items(purchase_id,product_id,qty,price_ex,price_inc,vat_amount,total_inc) VALUES(?,?,?,?,?,?,?)`, [purchase.id, it.product_id, it.qty, it.price_ex, it.price_inc, it.vat_amount, it.total_inc]);
    // تحديث المخزون للمنتج
    run(`UPDATE products SET qty = COALESCE(qty,0) + ? WHERE id=?`, [it.qty, it.product_id]);
    run(`INSERT INTO stock_movements(product_id, change, reason, ref_id, created_at) VALUES(?,?,?,?,?)`, [it.product_id, it.qty, 'PURCHASE', purchase.id, now]);
  });
  // تحديث رصيد المورد إذا آجل
  if(purchase.pay_type === 'credit' && supplier_id){
    try { run(`UPDATE suppliers SET balance = COALESCE(balance,0) + ? WHERE id=?`, [purchase.total||0, supplier_id]); } catch(_){ }
  }
  persist();
  return purchase;
}

function updatePurchase(id, data){
  if(!id) throw new Error('معرف مفقود');
  const old = get(`SELECT * FROM purchases WHERE id=?`, [id]);
  if(!old) throw new Error('الفاتورة غير موجودة');
  if(!data || !Array.isArray(data.items) || data.items.length===0) throw new Error('لا توجد بنود');
  const now = new Date().toISOString();
  // استرجاع المخزون من البنود القديمة
  const oldItems = all(`SELECT * FROM purchase_items WHERE purchase_id=?`, [id]);
  oldItems.forEach(it=>{
    try {
      run(`UPDATE products SET qty = COALESCE(qty,0) - ? WHERE id=?`, [it.qty, it.product_id]); // عكس عملية الشراء السابقة
      run(`INSERT INTO stock_movements(product_id, change, reason, ref_id, created_at) VALUES(?,?,?,?,?)`, [it.product_id, -it.qty, 'PURCHASE_EDIT_REVERT', id, now]);
    } catch(_){ }
  });
  run(`DELETE FROM purchase_items WHERE purchase_id=?`, [id]);
  run(`UPDATE purchases SET supplier_id=?, invoice_date=?, supplier_invoice_no=?, subtotal_ex=?, vat=?, total=?, pay_type=? WHERE id=?`, [data.supplier_id||null, data.invoice_date||now.slice(0,10), data.supplier_invoice_no||'', data.subtotal_ex||0, data.vat||0, data.total||0, data.pay_type||'cash', id]);
  data.items.forEach(it=>{
    run(`INSERT INTO purchase_items(purchase_id,product_id,qty,price_ex,price_inc,vat_amount,total_inc) VALUES(?,?,?,?,?,?,?)`, [id, it.product_id, it.qty, it.price_ex, it.price_inc, it.vat_amount, it.total_inc]);
    run(`UPDATE products SET qty = COALESCE(qty,0) + ? WHERE id=?`, [it.qty, it.product_id]);
    run(`INSERT INTO stock_movements(product_id, change, reason, ref_id, created_at) VALUES(?,?,?,?,?)`, [it.product_id, it.qty, 'PURCHASE_EDIT', id, now]);
  });
  // ضبط رصيد المورد في حال الفاتورة آجل
  try {
    if(old.pay_type==='credit' && old.supplier_id){
      run(`UPDATE suppliers SET balance = COALESCE(balance,0) - ? WHERE id=?`, [old.total||0, old.supplier_id]);
    }
    const updated = get(`SELECT * FROM purchases WHERE id=?`, [id]);
    if(updated.pay_type==='credit' && updated.supplier_id){
      run(`UPDATE suppliers SET balance = COALESCE(balance,0) + ? WHERE id=?`, [updated.total||0, updated.supplier_id]);
    }
  } catch(_){ }
  persist();
  return getPurchaseWithItems(id);
}

function deletePurchase(id){
  if(!id) throw new Error('معرف مفقود');
  const row = get(`SELECT * FROM purchases WHERE id=?`, [id]);
  if(!row) return false;
  const items = all(`SELECT * FROM purchase_items WHERE purchase_id=?`, [id]);
  const now = new Date().toISOString();
  items.forEach(it=>{
    try {
      run(`UPDATE products SET qty = COALESCE(qty,0) - ? WHERE id=?`, [it.qty, it.product_id]);
      run(`INSERT INTO stock_movements(product_id, change, reason, ref_id, created_at) VALUES(?,?,?,?,?)`, [it.product_id, -it.qty, 'PURCHASE_DELETE', id, now]);
    } catch(_){ }
  });
  run(`DELETE FROM purchase_items WHERE purchase_id=?`, [id]);
  run(`DELETE FROM purchases WHERE id=?`, [id]);
  if(row.pay_type==='credit' && row.supplier_id){
    try { run(`UPDATE suppliers SET balance = COALESCE(balance,0) - ? WHERE id=?`, [row.total||0, row.supplier_id]); } catch(_){ }
  }
  persist();
  return true;
}

function listPurchases(filter){
  if(filter){
    const f = `%${filter}%`;
    return all(`SELECT p.*, s.name AS supplier_name FROM purchases_all p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.invoice_no LIKE ? OR s.name LIKE ? ORDER BY p.id DESC`, [f,f]);
  }
  return all(`SELECT p.*, s.name AS supplier_name FROM purchases_all p LEFT JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.id DESC`);
}

function getPurchaseWithItems(id){
  const pur = get(`SELECT * FROM purchases WHERE id=?`, [id]);
  if(!pur) return null;
  pur.items = all(`SELECT pi.*, pr.name AS product_name FROM purchase_items pi LEFT JOIN products pr ON pr.id=pi.product_id WHERE pi.purchase_id=?`, [id]);
  return pur;
}

// =============== Purchase Returns ===============
function purchaseReturnStats(purchase_id){
  if(!purchase_id) return [];
  return all(`SELECT item_id, SUM(qty) AS returned_qty FROM purchase_returns WHERE purchase_id=? GROUP BY item_id`, [purchase_id]);
}
function createPurchaseReturn(data){
  if(!data || !data.purchase_id || !data.item_id || !data.qty) throw new Error('بيانات المرتجع ناقصة');
  const item = get(`SELECT pi.*, p.qty AS stock_qty, pur.pay_type, pur.supplier_id FROM purchase_items pi LEFT JOIN products p ON p.id=pi.product_id LEFT JOIN purchases pur ON pur.id=pi.purchase_id WHERE pi.id=? AND pi.purchase_id=?`, [data.item_id, data.purchase_id]);
  if(!item) throw new Error('البند غير موجود');
  const sumRow = get(`SELECT SUM(qty) AS s FROM purchase_returns WHERE item_id=? AND purchase_id=?`, [data.item_id, data.purchase_id]) || { s:0 };
  const already = sumRow.s || 0;
  const remain = (item.qty||0) - already;
  const rq = parseFloat(data.qty);
  if(rq <= 0) throw new Error('كمية غير صالحة');
  if(rq > remain) throw new Error('يتجاوز المتبقي');
  const now = new Date().toISOString();
  const amount = (item.price_inc||0) * rq; // يشمل الضريبة
  run(`INSERT INTO purchase_returns(purchase_id,item_id,product_id,qty,amount,reason,created_at) VALUES(?,?,?,?,?,?,?)`, [data.purchase_id, data.item_id, item.product_id, rq, amount, data.reason||'', now]);
  // خصم من المخزون
  run(`UPDATE products SET qty = COALESCE(qty,0) - ? WHERE id=?`, [rq, item.product_id]);
  run(`INSERT INTO stock_movements(product_id, change, reason, ref_id, created_at) VALUES(?,?,?,?,?)`, [item.product_id, -rq, 'PURCHASE_RETURN', data.purchase_id, now]);
  // تعديل رصيد المورد إذا آجل (يُنقص الالتزام)
  if(item.pay_type === 'credit' && item.supplier_id){
    try { run(`UPDATE suppliers SET balance = COALESCE(balance,0) - ? WHERE id=?`, [amount, item.supplier_id]); } catch(_){ }
  }
  persist();
  return get(`SELECT r.*, pr.name AS product_name, pu.invoice_no FROM purchase_returns r LEFT JOIN products pr ON pr.id=r.product_id LEFT JOIN purchases pu ON pu.id=r.purchase_id WHERE r.id = (SELECT MAX(id) FROM purchase_returns)`);
}
function listPurchaseReturns(){
  return all(`SELECT r.*, pr.name AS product_name, pu.invoice_no FROM purchase_returns_all r LEFT JOIN products pr ON pr.id=r.product_id LEFT JOIN purchases_all pu ON pu.id=r.purchase_id ORDER BY r.id DESC`);
}

// =============== Sales (POS) ===============
function createSale(data){
  const now = new Date().toISOString();
  const invoiceNo = data.invoice_no || ('INV' + Date.now());
  // قراءة إعداد السماح بالمخزون السالب مرة واحدة
  let allowNeg = false;
  try {
    const rowAllow = get(`SELECT value FROM settings WHERE key='allow_negative_sale'`);
    allowNeg = rowAllow && (rowAllow.value==='1' || rowAllow.value===1 || rowAllow.value==='true');
  } catch(_) { /* تجاهل */ }
  // تحقق كميات قبل إنشاء الفاتورة لمنع جزء يتم ثم يفشل لاحقاً
  if(!allowNeg){
    for(const it of data.items){
      if(!it || !it.product_id || !it.qty) continue;
      try {
        const prod = get(`SELECT qty,name FROM products WHERE id=?`, [it.product_id]);
        const stockQty = prod && typeof prod.qty==='number'? prod.qty : 0;
        if(stockQty < it.qty){
          throw new Error('المخزون غير كاف للصنف: '+ (prod && prod.name? prod.name : it.product_id) + ' (المتاح '+stockQty+' المطلوب '+it.qty+')');
        }
      } catch(err){
        throw err;
      }
    }
  }
  run(`INSERT INTO sales(invoice_no, customer_id, subtotal, vat, total, discount, pay_method, paid, created_at) VALUES(?,?,?,?,?,?,?,?,?)`, [invoiceNo, data.customer_id||null, data.subtotal, data.vat, data.total, data.discount||0, data.pay_method||null, data.paid||0, now]);
  const sale = get(`SELECT * FROM sales WHERE id = (SELECT MAX(id) FROM sales)`);
  data.items.forEach(it=>{
    run(`INSERT INTO sale_items(sale_id, product_id, qty, price, total) VALUES(?,?,?,?,?)`, [sale.id, it.product_id, it.qty, it.price, it.qty * it.price]);
    // حركات المخزون (تحقق ثاني في حال تغير المخزون بين الفحص السابق والتحديث – حالة سباق نادرة)
    if(!allowNeg){
      const prod2 = get(`SELECT qty FROM products WHERE id=?`, [it.product_id]);
      const stockQty2 = prod2 && typeof prod2.qty==='number'? prod2.qty : 0;
      if(stockQty2 < it.qty){
        throw new Error('نفذ المخزون أثناء الحفظ للصنف ID '+it.product_id);
      }
    }
    run(`UPDATE products SET qty = COALESCE(qty,0) - ? WHERE id=?`, [it.qty, it.product_id]);
    run(`INSERT INTO stock_movements(product_id, change, reason, ref_id, created_at) VALUES(?,?,?,?,?)`, [it.product_id, -it.qty, 'SALE', sale.id, now]);
  });
  // محاسبة: إذا كانت الفاتورة آجل (credit) زد رصيد العميل بالقيمة الإجمالية
  try {
    if(sale.customer_id && (sale.pay_method||'')==='credit'){
      run(`UPDATE customers SET balance = COALESCE(balance,0) + ? WHERE id=?`, [sale.total||0, sale.customer_id]);
    }
  } catch(_){ }
  persist();
  return sale;
}

function updateSale(id, data){
  if(!id) throw new Error('معرف غير صالح');
  const old = get(`SELECT * FROM sales WHERE id=?`, [id]);
  if(!old) throw new Error('الفاتورة غير موجودة');
  const oldItems = all(`SELECT * FROM sale_items WHERE sale_id=?`, [id]);
  const now = new Date().toISOString();
  // إعادة المخزون للبنود القديمة
  oldItems.forEach(it=>{
    try {
      run(`UPDATE products SET qty = COALESCE(qty,0) + ? WHERE id=?`, [it.qty, it.product_id]);
      run(`INSERT INTO stock_movements(product_id, change, reason, ref_id, created_at) VALUES(?,?,?,?,?)`, [it.product_id, it.qty, 'SALE_EDIT_REVERT', id, now]);
    } catch(_){ }
  });
  // حذف البنود القديمة
  run(`DELETE FROM sale_items WHERE sale_id=?`, [id]);
  // تحديث رأس الفاتورة
  run(`UPDATE sales SET customer_id=?, subtotal=?, vat=?, total=?, discount=?, pay_method=?, paid=? WHERE id=?`, [data.customer_id||null, data.subtotal, data.vat, data.total, data.discount||0, data.pay_method||null, data.paid||0, id]);
  // إدخال البنود الجديدة وخصم المخزون
  data.items.forEach(it=>{
    run(`INSERT INTO sale_items(sale_id, product_id, qty, price, total) VALUES(?,?,?,?,?)`, [id, it.product_id, it.qty, it.price, it.qty * it.price]);
    run(`UPDATE products SET qty = COALESCE(qty,0) - ? WHERE id=?`, [it.qty, it.product_id]);
    run(`INSERT INTO stock_movements(product_id, change, reason, ref_id, created_at) VALUES(?,?,?,?,?)`, [it.product_id, -it.qty, 'SALE_EDIT', id, now]);
  });
  // محاسبة: ضبط رصيد العميل حسب الفرق إذا كانت الفاتورة آجل
  try {
    const updated = get(`SELECT * FROM sales WHERE id=?`, [id]);
    if(updated.customer_id){
      const wasCredit = (old.pay_method||'')==='credit';
      const nowCredit = (updated.pay_method||'')==='credit';
      if(wasCredit && nowCredit){
        const diff = (updated.total||0) - (old.total||0);
        if(Math.abs(diff) > 1e-9){
          run(`UPDATE customers SET balance = COALESCE(balance,0) + ? WHERE id=?`, [diff, updated.customer_id]);
        }
      } else if(!wasCredit && nowCredit){
        // أصبحت آجل: أضف كامل المبلغ
        run(`UPDATE customers SET balance = COALESCE(balance,0) + ? WHERE id=?`, [updated.total||0, updated.customer_id]);
      } else if(wasCredit && !nowCredit){
        // تحولت إلى نقد: أزل المبلغ السابق
        run(`UPDATE customers SET balance = COALESCE(balance,0) - ? WHERE id=?`, [old.total||0, updated.customer_id]);
      }
    }
  } catch(_){ }
  persist();
  return getSaleWithItems(id);
}

function nextInvoiceNumber(){
  const row = get(`SELECT invoice_no FROM sales ORDER BY id DESC LIMIT 1`);
  if(!row || !row.invoice_no) return '000001';
  const num = parseInt(row.invoice_no.replace(/[^0-9]/g,'')) || 0;
  const next = (num+1).toString().padStart(6,'0');
  return next;
}

function listSales(){
  return all(`SELECT s.*, c.name AS customer_name FROM sales_all s LEFT JOIN customers c ON c.id=s.customer_id ORDER BY s.id DESC`);
}

function getSaleWithItems(id){
  const sale = get(`SELECT * FROM sales WHERE id=?`, [id]);
  if(!sale) return null;
  sale.items = all(`SELECT si.*, p.name AS product_name, p.barcode FROM sale_items si LEFT JOIN products p ON p.id=si.product_id WHERE sale_id=?`, [id]);
  return sale;
}

// =============== Sales Returns ===============
function saleReturnStats(sale_id){
  if(!sale_id) return [];
  return all(`SELECT item_id, SUM(qty) as returned_qty FROM sale_returns WHERE sale_id=? GROUP BY item_id`, [sale_id]);
}
function createSaleReturn(data){
  if(!data || !data.sale_id || !data.item_id || !data.qty) throw new Error('بيانات المرتجع ناقصة');
  const item = get(`SELECT si.*, p.qty AS stock_qty, s.pay_method, s.customer_id FROM sale_items si LEFT JOIN products p ON p.id=si.product_id LEFT JOIN sales s ON s.id=si.sale_id WHERE si.id=? AND si.sale_id=?`, [data.item_id, data.sale_id]);
  if(!item) throw new Error('البند غير موجود');
  const sumRow = get(`SELECT SUM(qty) as s FROM sale_returns WHERE item_id=? AND sale_id=?`, [data.item_id, data.sale_id]) || { s:0 };
  const already = sumRow.s || 0;
  const remain = (item.qty||0) - already;
  const rq = parseFloat(data.qty);
  if(rq <= 0) throw new Error('كمية غير صالحة');
  if(rq > remain) throw new Error('يتجاوز المتبقي');
  const now = new Date().toISOString();
  const amount = (item.price||0) * rq;
  run(`INSERT INTO sale_returns(sale_id,item_id,product_id,qty,amount,reason,created_at) VALUES(?,?,?,?,?,?,?)`, [data.sale_id, data.item_id, item.product_id, rq, amount, data.reason||'', now]);
  // رد الكمية للمخزون
  run(`UPDATE products SET qty = COALESCE(qty,0) + ? WHERE id=?`, [rq, item.product_id]);
  run(`INSERT INTO stock_movements(product_id, change, reason, ref_id, created_at) VALUES(?,?,?,?,?)`, [item.product_id, rq, 'RETURN', data.sale_id, now]);
  // في حالة البيع الآجل: خصم المبلغ من رصيد العميل (تقليل المديونية)
  if(item.pay_method === 'credit' && item.customer_id){
    try { run(`UPDATE customers SET balance = COALESCE(balance,0) - ? WHERE id=?`, [amount, item.customer_id]); } catch(_){ }
  }
  persist();
  return get(`SELECT r.*, p.name AS product_name, s.invoice_no FROM sale_returns r LEFT JOIN products p ON p.id=r.product_id LEFT JOIN sales s ON s.id=r.sale_id WHERE r.id = (SELECT MAX(id) FROM sale_returns)`);
}
function listSaleReturns(){
  return all(`SELECT r.*, p.name AS product_name, s.invoice_no FROM sale_returns r LEFT JOIN products p ON p.id=r.product_id LEFT JOIN sales s ON s.id=r.sale_id ORDER BY r.id DESC`);
}

function getSaleByInvoice(invoice){
  if(!invoice) return null;
  const sale = get(`SELECT * FROM sales WHERE invoice_no=?`, [invoice]);
  if(!sale) return null;
  sale.items = all(`SELECT si.*, p.name AS product_name, p.barcode FROM sale_items si LEFT JOIN products p ON p.id=si.product_id WHERE sale_id=?`, [sale.id]);
  return sale;
}

// مرجع بسيط لإضافة أسماء (إن لم توجد) وإرجاع id
function ensureLookup(table, name){
  if(!name) return null;
  const row = get(`SELECT id FROM ${table} WHERE name=?`, [name]);
  if(row) return row.id;
  run(`INSERT INTO ${table}(name) VALUES(?)`, [name]);
  const n = get(`SELECT id FROM ${table} WHERE name=?`, [name]);
  persist();
  return n? n.id : null;
}

function listLookup(table){
  return all(`SELECT id,name FROM ${table} ORDER BY name`);
}

// Settings helpers
function setSetting(key, value){
  const exists = get(`SELECT key FROM settings WHERE key=?`, [key]);
  if(exists) run(`UPDATE settings SET value=? WHERE key=?`, [JSON.stringify(value), key]);
  else run(`INSERT INTO settings(key,value) VALUES(?,?)`, [key, JSON.stringify(value)]);
  persist();
  return true;
}
function getSetting(key){
  const row = get(`SELECT value FROM settings WHERE key=?`, [key]);
  if(!row) return null; try { return JSON.parse(row.value); } catch{ return row.value; }
}
function listSettings(){
  return all(`SELECT key,value FROM settings`).map(r=>({ key: r.key, value: (()=>{ try{return JSON.parse(r.value);}catch{return r.value;} })() }));
}

// حركات المخزون لمنتج محدد
function listStockMovements(productId, limit){
  if(!productId) return [];
  const lim = parseInt(limit)||100;
  return all(`SELECT * FROM stock_movements WHERE product_id=? ORDER BY id DESC LIMIT ?`, [productId, lim]);
}

// ضبط جرد منتج (تعديل مباشر للكمية مع تسجيل حركة وضبط سجل تدقيق)
function adjustInventory(payload){
  if(!payload || !payload.product_id || payload.new_qty === undefined || payload.new_qty === null) throw new Error('بيانات ناقصة');
  const prod = get(`SELECT * FROM products WHERE id=?`, [payload.product_id]);
  if(!prod) throw new Error('منتج غير موجود');
  const target = parseFloat(payload.new_qty);
  if(isNaN(target)) throw new Error('قيمة غير صالحة');
  if(target < 0 && !(prod.allow_negative)) throw new Error('لا يسمح بالسالب');
  const diff = target - (prod.qty||0);
  if(Math.abs(diff) < 1e-9){
    return prod; // لا تغيير
  }
  const now = new Date().toISOString();
  run(`UPDATE products SET qty=?, updated_at=?, updated_by=? WHERE id=?`, [target, now, payload.user_id||null, prod.id]);
  run(`INSERT INTO stock_movements(product_id, change, reason, ref_id, created_at) VALUES(?,?,?,?,?)`, [prod.id, diff, 'ADJUST', null, now]);
  run(`INSERT INTO audit_log(ts,type,product_id,from_store,to_store,qty,note,user_id) VALUES(?,?,?,?,?,?,?,?)`, [now,'ADJUST',prod.id,null,null,diff,payload.note||'', payload.user_id||null]);
  persist();
  return get(`SELECT * FROM products WHERE id=?`, [prod.id]);
}

// Simple CSV export for sales
function exportSalesCSV(targetPath){
  const rows = all(`SELECT s.id,s.invoice_no,s.subtotal,s.vat,s.total,s.created_at,c.name AS customer FROM sales_all s LEFT JOIN customers c ON c.id=s.customer_id ORDER BY s.id DESC`);
  const header = 'invoice_no,customer,subtotal,vat,total,created_at';
  const lines = rows.map(r=> [r.invoice_no, r.customer||'', r.subtotal, r.vat, r.total, r.created_at].join(','));
  const csv = [header, ...lines].join('\n');
  require('fs').writeFileSync(targetPath, csv, 'utf8');
  return { ok:true, count: rows.length };
}

// =============== Additional Reports ===============
function inventoryValueSummary(){
  const rows = all(`SELECT id,name,qty,purchase_price,sale_price,average_cost FROM products`);
  let totalCost=0,totalPotential=0; rows.forEach(r=>{ const cost = (r.average_cost||r.purchase_price||0)*(r.qty||0); totalCost+=cost; totalPotential += (r.sale_price||0)*(r.qty||0); });
  return { totalCost, totalPotential, potentialProfit: totalPotential-totalCost, products: rows.length };
}
function stockMovementsFiltered(params){
  params = params||{}; let where=[]; let vals=[];
  if(params.product_id){ where.push('m.product_id=?'); vals.push(params.product_id); }
  if(params.reason){ where.push('m.reason=?'); vals.push(params.reason); }
  if(params.from){ where.push('m.created_at >= ?'); vals.push(params.from); }
  if(params.to){ where.push('m.created_at < ?'); vals.push(params.to); }
  let sql = `SELECT m.*, p.name AS product_name, p.barcode FROM stock_movements m LEFT JOIN products p ON p.id=m.product_id`;
  if(where.length) sql += ' WHERE '+where.join(' AND ');
  sql += ' ORDER BY m.id DESC LIMIT '+ (parseInt(params.limit)||300);
  return all(sql, vals);
}
function returnsCombined(params){
  params = params||{}; // تجميع مرتجعات المبيعات والمشتريات
  let whereS=[], valsS=[], whereP=[], valsP=[];
  if(params.from){ whereS.push('created_at >= ?'); valsS.push(params.from); whereP.push('created_at >= ?'); valsP.push(params.from); }
  if(params.to){ whereS.push('created_at < ?'); valsS.push(params.to); whereP.push('created_at < ?'); valsP.push(params.to); }
  const sale = all(`SELECT id, sale_id AS doc_id, product_id, qty, amount, reason, created_at, 'SALE_RETURN' AS type FROM sale_returns_all ${whereS.length?('WHERE '+whereS.join(' AND ')):''}`, valsS);
  const purch = all(`SELECT id, purchase_id AS doc_id, product_id, qty, amount, reason, created_at, 'PURCHASE_RETURN' AS type FROM purchase_returns_all ${whereP.length?('WHERE '+whereP.join(' AND ')):''}`, valsP);
  const rows = sale.concat(purch).sort((a,b)=> (b.created_at||'').localeCompare(a.created_at||''));
  return rows;
}
function debtsAging(){
  const rows = all(`SELECT id, customer_name, amount, paid_amount, date, paid FROM debts`);
  const now = Date.now();
  function bucket(d){ const diffDays = Math.floor((now - new Date(d).getTime())/86400000); if(diffDays<=30) return '0-30'; if(diffDays<=60) return '31-60'; if(diffDays<=90) return '61-90'; return '90+'; }
  const buckets = { '0-30':0,'31-60':0,'61-90':0,'90+':0 }; const details=[];
  rows.forEach(r=>{ if(r.paid) return; const remain = (r.amount||0) - (r.paid_amount||0); if(remain<=0) return; const b=bucket(r.date); buckets[b]+=remain; details.push({ id:r.id, customer_name:r.customer_name, remain, date:r.date, bucket:b }); });
  return { buckets, details };
}
function expensesList(params){
  params=params||{}; let where=[]; let vals=[];
  if(params.from){ where.push('created_at >= ?'); vals.push(params.from); }
  if(params.to){ where.push('created_at < ?'); vals.push(params.to); }
  if(params.category){ where.push('category=?'); vals.push(params.category); }
  const rows = all(`SELECT * FROM expenses ${where.length? ('WHERE '+where.join(' AND ')):''} ORDER BY id DESC LIMIT 500`, vals);
  const total = rows.reduce((a,b)=> a + (b.amount||0), 0);
  return { rows, total };
}
function expenseAdd(data){
  if(!data || !data.amount) throw new Error('مبلغ مفقود');
  const now = new Date().toISOString();
  run(`INSERT INTO expenses(amount, category, note, created_at) VALUES(?,?,?,?)`, [parseFloat(data.amount)||0, data.category||'', data.note||'', now]);
  persist();
  return get(`SELECT * FROM expenses WHERE id=(SELECT MAX(id) FROM expenses)`);
}
// ====== Receipts (سندات قبض) ======
function receiptsList(params){
  params=params||{}; let where=[]; let vals=[];
  if(params.from){ where.push('created_at >= ?'); vals.push(params.from); }
  if(params.to){ where.push('created_at < ?'); vals.push(params.to); }
  if(params.method){ where.push('method=?'); vals.push(params.method); }
  if(params.customer_name){ where.push('(customer_name LIKE ? OR phone LIKE ?)'); vals.push('%'+params.customer_name+'%','%'+params.customer_name+'%'); }
  const rows = all(`SELECT * FROM receipts ${where.length? ('WHERE '+where.join(' AND ')):''} ORDER BY id DESC LIMIT 500`, vals);
  const total = rows.reduce((a,b)=> a + (b.amount||0), 0);
  return { rows, total };
}
function receiptAdd(data){
  if(!data || !data.amount) throw new Error('مبلغ مفقود');
  const now = new Date().toISOString();
  run(`INSERT INTO receipts(amount, method, source, note, customer_name, phone, created_at) VALUES(?,?,?,?,?,?,?)`, [parseFloat(data.amount)||0, data.method||'', data.source||'', data.note||'', data.customer_name||'', data.phone||'', now]);
  // تخفيض رصيد العميل إذا تم تحديد اسم/هاتف مطابق (سداد دين / فاتورة آجل)
  try {
    if(data.customer_name || data.phone){
      let cust=null;
      if(data.customer_name){ cust = get(`SELECT id,balance FROM customers WHERE name=?`, [data.customer_name.trim()]); }
      if(!cust && data.phone){ cust = get(`SELECT id,balance FROM customers WHERE phone=?`, [data.phone.trim()]); }
      if(cust){
        run(`UPDATE customers SET balance = COALESCE(balance,0) - ? WHERE id=?`, [parseFloat(data.amount)||0, cust.id]);
      }
    }
  } catch(_){ }
  persist();
  return get(`SELECT * FROM receipts WHERE id=(SELECT MAX(id) FROM receipts)`);
}
function receiptUpdate(id, data){
  if(!id) throw new Error('معرف غير صالح');
  const r = get(`SELECT * FROM receipts WHERE id=?`, [id]);
  if(!r) throw new Error('سند غير موجود');
  const amount = data.amount !== undefined? parseFloat(data.amount)||0 : r.amount;
  const method = data.method !== undefined? data.method : r.method;
  const source = data.source !== undefined? data.source : r.source;
  const note = data.note !== undefined? data.note : r.note;
  const customer_name = data.customer_name !== undefined? data.customer_name : r.customer_name;
  const phone = data.phone !== undefined? data.phone : r.phone;
  run(`UPDATE receipts SET amount=?, method=?, source=?, note=?, customer_name=?, phone=? WHERE id=?`, [amount, method, source, note, customer_name, phone, id]);
  persist();
  return get(`SELECT * FROM receipts WHERE id=?`, [id]);
}
function receiptDelete(id){
  run(`DELETE FROM receipts WHERE id=?`, [id]);
  persist();
  return true;
}
function vatReport(params){
  params=params||{}; const { start, end } = _rangeBounds(params.period||'month');
  const salesVatRows = all(`SELECT vat FROM sales_all WHERE created_at >= ? AND created_at < ?`, [start,end]);
  const salesVat = salesVatRows.reduce((a,b)=> a + (b.vat||0), 0);
  const purchaseVatRows = all(`SELECT SUM(vat_amount) as v FROM purchase_items_all pi LEFT JOIN purchases_all p ON p.id=pi.purchase_id WHERE p.created_at >= ? AND p.created_at < ?`, [start,end]);
  const purchaseVat = (purchaseVatRows[0] && purchaseVatRows[0].v) || 0;
  return { period: params.period||'month', salesVat, purchaseVat, netVat: salesVat - purchaseVat };
}
function productMarginsReport(params){
  params=params||{}; const { start, end } = _rangeBounds(params.period||'month');
  const rows = all(`SELECT si.product_id, p.name, p.purchase_price, p.average_cost, SUM(si.qty) as qty, SUM(si.total) as revenue
                    FROM sale_items_all si
                    LEFT JOIN sales_all s ON s.id=si.sale_id
                    LEFT JOIN products p ON p.id=si.product_id
                    WHERE s.created_at >= ? AND s.created_at < ?
                    GROUP BY si.product_id
                    ORDER BY revenue DESC`, [start,end]);
  rows.forEach(r=>{ const costBase = (r.average_cost||r.purchase_price||0); r.cost_total = costBase * (r.qty||0); r.gross_profit = (r.revenue||0) - r.cost_total; r.margin_percent = (r.revenue? (r.gross_profit / r.revenue)*100 : 0); });
  return rows;
}

// تقارير/كشف حساب عميل (أضيف دعم فلاتر التاريخ)
// params: { customer_id, start, end }
function customerReport(params){
  if(params==null) throw new Error('معطيات ناقصة');
  // السماح بتمرير رقم مباشر (توافق قديم)
  if(typeof params === 'number'){ params = { customer_id: params }; }
  const { customer_id, start, end } = params;
  if(!customer_id) throw new Error('مطلوب معرف العميل');
  const c = get(`SELECT * FROM customers WHERE id=?`, [customer_id]);
  if(!c) throw new Error('عميل غير موجود');
  let where = 'customer_id=?';
  const vals = [customer_id];
  // فلاتر التاريخ على created_at (ISO)
  let startIso=null, endIsoExclusive=null;
  if(start){
    startIso = start.length<=10? (start+"T00:00:00") : start;
    where += ' AND created_at >= ?';
    vals.push(startIso);
  }
  if(end){
    // اجعل النهاية حصرية بإضافة يوم
    if(end.length<=10){
      const dt = new Date(end+'T00:00:00'); dt.setDate(dt.getDate()+1); endIsoExclusive = dt.toISOString();
    } else {
      const dt = new Date(end); dt.setSeconds(dt.getSeconds()+1); endIsoExclusive = dt.toISOString();
    }
    where += ' AND created_at < ?';
    vals.push(endIsoExclusive);
  }
  // إضافة pay_method و paid لدعم تحديد نوع العملية (كاش / آجل) في الواجهة
  const salesRows = all(`SELECT id, invoice_no, total, vat, subtotal, discount, pay_method, paid, created_at FROM sales_all WHERE ${where} ORDER BY id DESC`, vals);
  let totalAmount=0, totalVat=0, totalSubtotal=0, totalDiscount=0;
  salesRows.forEach(s=>{ totalAmount += (s.total||0); totalVat += (s.vat||0); totalSubtotal += (s.subtotal||0); totalDiscount += (s.discount||0); });
  return {
    customer: { id:c.id, name:c.name, phone:c.phone, vat:c.vat, balance:c.balance||0, loyalty_points:c.loyalty_points||0 },
    salesCount: salesRows.length,
    totalSales: totalAmount,
    totalVat,
    totalSubtotal,
    totalDiscount,
    lastSaleDate: salesRows[0]? salesRows[0].created_at : null,
    recentSales: salesRows.slice(0,200),
    filters: { start: start||null, end: end||null }
  };
}

function customerStatement(params){
  params = params || {};
  let c = null;
  if(params.customer_id){ c = get(`SELECT * FROM customers WHERE id=?`, [params.customer_id]); }
  if(!c && params.customer_name){ c = get(`SELECT * FROM customers WHERE name=?`, [params.customer_name]); }
  if(!c && params.phone){ c = get(`SELECT * FROM customers WHERE phone=?`, [params.phone]); }
  if(!c) throw new Error('لم يتم العثور على العميل');
  const name = c.name || '';
  const phone = c.phone || '';
  let debtWhere = '(customer_name=? OR phone=?)';
  const debtVals = [name, phone];
  let payWhere = '(d.customer_name=? OR d.phone=?)';
  const payVals = [name, phone];
  const { start, end } = params;
  if(start){ debtWhere += ' AND date >= ?'; debtVals.push(start); payWhere += ' AND p.date >= ?'; payVals.push(start); }
  if(end){ debtWhere += ' AND date <= ?'; debtVals.push(end); payWhere += ' AND p.date <= ?'; payVals.push(end); }
  const debts = all(`SELECT * FROM debts WHERE ${debtWhere} ORDER BY date DESC`, debtVals);
  const pays = all(`SELECT p.* FROM debt_payments p LEFT JOIN debts d ON d.id=p.debt_id WHERE ${payWhere} ORDER BY p.date DESC`, payVals);
  let debtOriginal=0, paidAmount=0, remaining=0;
  debts.forEach(d=>{
    debtOriginal += (d.amount||0);
    const paid = d.paid_amount || (d.paid? d.amount: 0) || 0;
    paidAmount += paid;
    remaining += Math.max(0, (d.amount||0) - paid);
  });
  pays.forEach(p=>{ /* already included in paidAmount via debts */ });
  return {
    customer: { id:c.id, name, phone, balance:c.balance||0 },
    debts, payments: pays,
    totals: { debtOriginal, paidAmount, remaining },
    filters: { start: start||null, end: end||null }
  };
}

// ====== Export (consolidated) ======
// دوال مساعدة إضافية للتصدير الكامل (بدون فلاتر / حدود)
function listSaleItemsAll(){ return all(`SELECT * FROM sale_items ORDER BY id DESC`); }
function listPurchaseItemsAll(){ try { return all(`SELECT * FROM purchase_items ORDER BY id DESC`); } catch(_){ return []; } }
function listStockMovementsAll(){ return all(`SELECT * FROM stock_movements ORDER BY id DESC`); }
function listSaleReturnsAll(){ return all(`SELECT * FROM sale_returns ORDER BY id DESC`); }
function listPurchaseReturnsAll(){ return all(`SELECT * FROM purchase_returns ORDER BY id DESC`); }
function listAuditLogAll(){ return all(`SELECT * FROM audit_log ORDER BY id DESC`); }
function listDebtCustomers(){ return all(`SELECT * FROM debts_customers ORDER BY id DESC`); }
function listDebtPayments(){ return all(`SELECT * FROM debt_payments ORDER BY id DESC`); }
function listExpensesAll(){ return all(`SELECT * FROM expenses ORDER BY id DESC`); }
function listReceiptsAll(){ return all(`SELECT * FROM receipts ORDER BY id DESC`); }
function listRolesAll(){ return all(`SELECT * FROM roles ORDER BY id DESC`); }
function listUsersAll(){ return all(`SELECT id,username,role_id,active,created_at FROM users ORDER BY id DESC`); }

module.exports = {
  open, authenticate, listUsers, persist, ensureSchema,
  listRoles, addRole, updateRole, addUser, updateUser,
  deleteUser,
  addProduct, updateProduct, deleteProduct, listProducts, listStockMovements,
  addCustomer, updateCustomer, deleteCustomer, listCustomers,
  createSale, listSales, getSaleWithItems,
  updateSale,
  nextInvoiceNumber,
  saleReturnStats, createSaleReturn, listSaleReturns,
  getSaleByInvoice,
  ensureLookup, listLookup,
  setSetting, getSetting, listSettings,
  exportSalesCSV,
  addStore, updateStore, deleteStore, listStores, listLowStock
  , transferStock, listAuditLog
  , addSupplier, updateSupplier, deleteSupplier, listSuppliers, exportSuppliersCSV
  , addPurchase, listPurchases, getPurchaseWithItems, nextPurchaseNumber
  , updatePurchase, deletePurchase
  , purchaseReturnStats, createPurchaseReturn, listPurchaseReturns
  , financeSummary
  , adjustInventory
  , inventoryValueSummary, stockMovementsFiltered, returnsCombined, debtsAging, expensesList, expenseAdd, vatReport, productMarginsReport
  , customerReport, customerStatement
  , listSalesCustomers
  , receiptsList, receiptAdd, receiptUpdate, receiptDelete
  , listSaleItemsAll, listPurchaseItemsAll, listStockMovementsAll, listSaleReturnsAll, listPurchaseReturnsAll, listAuditLogAll
  , listDebtCustomers, listDebtPayments, listExpensesAll, listReceiptsAll, listRolesAll, listUsersAll
};
