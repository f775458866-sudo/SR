// تفعيل تحديد العميل النشط عند النقر على صف عميل في شاشة إدارة العملاء
document.addEventListener('click', function(e) {
  const row = e.target.closest('.salesCustomerRow');
  if (row && row.dataset.customerId) {
    // حفظ المعرف والاسم في window
    window.currentCustomerId = Number(row.dataset.customerId);
    window.currentCustomerName = row.dataset.customerName || '';
    // إزالة التحديد من جميع الصفوف
    document.querySelectorAll('.salesCustomerRow.selected').forEach(r => r.classList.remove('selected'));
    // تلوين الصف المحدد
    row.classList.add('selected');
  }
});
// ربط خيار إدارة عملاء المبيعات في القائمة المنسدلة
document.addEventListener('click', function(e) {
  const salesCustomersMenuBtn = e.target.closest('#mainMenuSalesCustomers');
  if (salesCustomersMenuBtn) {
    showSalesCustomersManager();
    return;
  }
});
// ===== إدارة عملاء المبيعات =====
function showSalesCustomersManager(filter = '') {
  const box = document.getElementById('salesCustomersBox');
  if (!box) return;
  // جلب العملاء الذين لديهم مبيعات رسمية فقط
  let salesCustomers = [];
  if (window.customers && Array.isArray(window.customers) && window.salesCache && Array.isArray(window.salesCache)) {
    const customerIds = new Set(window.salesCache.map(s => s.customer_id));
    salesCustomers = window.customers.filter(c => customerIds.has(c.id));
    if (filter) {
      const f = filter.trim().toLowerCase();
      salesCustomers = salesCustomers.filter(c => (c.name && c.name.toLowerCase().includes(f)) || (c.phone && c.phone.includes(f)));
    }
  }
  let html = `<input type='text' id='salesCustomersSearch' placeholder='بحث بالاسم أو الجوال' style='margin-bottom:10px;padding:6px 10px;border-radius:8px;border:1px solid #aaa;width:220px;'>`;
  html += `<button id='exportSalesCustomersBtn' style='margin-right:10px;'>تصدير</button>`;
  html += `<table style='width:100%;border-collapse:collapse;margin-top:10px;'>`;
  html += `<thead><tr style='background:#eee;'><th>الاسم</th><th>الجوال</th><th>عدد الفواتير</th><th>إجمالي المبيعات</th><th>تقرير</th><th>تعديل</th></tr></thead><tbody>`;
  salesCustomers.forEach(c => {
    const sales = getSalesByCustomer(c.id);
    const total = sales.reduce((sum, s) => sum + (s.total || 0), 0);
    const selected = (window.currentCustomerId === c.id) ? 'selected' : '';
    html += `<tr class='salesCustomerRow ${selected}' data-customer-id='${c.id}' data-customer-name='${c.name}'>`;
    html += `<td>${c.name}</td><td>${c.phone || ''}</td><td>${sales.length}</td><td>${total}</td>`;
    html += `<td><button class='showCustomerReportBtn' data-customer-id='${c.id}'>تقرير</button></td>`;
    html += `<td><button class='editCustomerBtn' data-customer-id='${c.id}'>تعديل</button></td></tr>`;
  });
// تحديث ربط عناصر القائمة المنسدلة لتقرير وكشف حساب عميل لاستخدام العميل النشط
document.addEventListener('click', function(e) {
  // زر تقرير عميل من القائمة
  const reportMenuBtn = e.target.closest('#mainMenuCustomerReport');
  if (reportMenuBtn) {
    const customerId = window.currentCustomerId;
    const titleBox = document.getElementById('customerReportTitle');
    const box = document.getElementById('customerReportBox');
    if (!customerId) {
      if (box) box.innerHTML = '<div style="color:#b71c1c;font-weight:700;">يرجى اختيار عميل أولاً</div>';
      if (titleBox) titleBox.textContent = '';
      return;
    }
    let customerName = window.currentCustomerName || '';
    if (titleBox) titleBox.textContent = customerName ? `تقرير عميل: ${customerName}` : '';
    showCustomerReport(customerId);
    return;
  }
  // زر كشف حساب عميل من القائمة
  const statementMenuBtn = e.target.closest('#mainMenuCustomerStatement');
  if (statementMenuBtn) {
    const customerId = window.currentCustomerId;
    const box = document.getElementById('accountStatementBox');
    if (!customerId) {
      if (box) box.innerHTML = '<div style="color:#b71c1c;font-weight:700;">يرجى اختيار عميل أولاً</div>';
      return;
    }
    showAccountStatement(customerId);
    return;
  }
});
// تنسيق الصف المحدد
const style = document.createElement('style');
style.textContent = `.salesCustomerRow.selected { background: #d0e7ff !important; }`;
document.head.appendChild(style);
  html += `</tbody></table>`;
  box.innerHTML = html;
  // البحث
  const searchInput = document.getElementById('salesCustomersSearch');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      showSalesCustomersManager(this.value);
    });
  }
  // التصدير
  const exportBtn = document.getElementById('exportSalesCustomersBtn');
  if (exportBtn) {
    exportBtn.onclick = function() {
      let csv = 'الاسم,الجوال,عدد الفواتير,إجمالي المبيعات\n';
      salesCustomers.forEach(c => {
        const sales = getSalesByCustomer(c.id);
        const total = sales.reduce((sum, s) => sum + (s.total || 0), 0);
        csv += `${c.name},${c.phone || ''},${sales.length},${total}\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sales_customers.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
  }
  // التعديل (زر وهمي فقط، يجب ربطه لاحقًا بوظيفة التعديل الفعلية)
  document.querySelectorAll('.editCustomerBtn').forEach(btn => {
    btn.onclick = function() {
      const id = Number(this.dataset.customerId);
      // هنا يمكن ربط وظيفة التعديل الفعلية
      alert('تعديل العميل رقم: ' + id);
    };
  });
}
// ربط عناصر القائمة المنسدلة لتقرير عميل وكشف حساب عميل
document.addEventListener('click', function(e) {
  // زر تقرير عميل من القائمة
  const reportMenuBtn = e.target.closest('#mainMenuCustomerReport');
  if (reportMenuBtn) {
    const customerId = window.selectedCustomerId;
    const titleBox = document.getElementById('customerReportTitle');
    const box = document.getElementById('customerReportBox');
    if (!customerId) {
      if (box) box.innerHTML = '<div style="color:#b71c1c;font-weight:700;">يرجى اختيار عميل أولاً</div>';
      if (titleBox) titleBox.textContent = '';
      return;
    }
    let customerName = '';
    if (window.customers && Array.isArray(window.customers)) {
      const cust = window.customers.find(c => c.id === customerId);
      if (cust) customerName = cust.name;
    }
    if (titleBox) titleBox.textContent = customerName ? `تقرير عميل: ${customerName}` : '';
    showCustomerReport(customerId);
    return;
  }
  // زر كشف حساب عميل من القائمة
  const statementMenuBtn = e.target.closest('#mainMenuCustomerStatement');
  if (statementMenuBtn) {
    const customerId = window.selectedCustomerId;
    const box = document.getElementById('accountStatementBox');
    if (!customerId) {
      if (box) box.innerHTML = '<div style="color:#b71c1c;font-weight:700;">يرجى اختيار عميل أولاً</div>';
      return;
    }
    showAccountStatement(customerId);
    return;
  }
});
// ربط زر "عرض تقرير" لكل عميل
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.showCustomerReportBtn');
  if (!btn) return;
  const customerId = btn.dataset.customerId ? Number(btn.dataset.customerId) : null;
  if (!customerId) {
    document.getElementById('customerReportBox').innerHTML = '';
    document.getElementById('accountStatementBox').innerHTML = '';
    document.getElementById('customerReportTitle').textContent = '';
    return;
  }
  // جلب اسم العميل من window.customers
  let customerName = '';
  if (window.customers && Array.isArray(window.customers)) {
    const cust = window.customers.find(c => c.id === customerId);
    if (cust) customerName = cust.name;
  }
  document.getElementById('customerReportTitle').textContent = customerName ? `تقرير العميل: ${customerName}` : '';
  showCustomerReport(customerId);
  showAccountStatement(customerId);
});
// ===== تفعيل عرض تقرير عميل باستخدام getSalesByCustomer =====
function showCustomerReport(customerId) {
  const sales = getSalesByCustomer(customerId);
  const box = document.getElementById('customerReportBox');
  if (!box) return;
  if (!sales.length) {
    box.innerHTML = '<div style="color:#b71c1c;font-weight:700;">لا توجد فواتير لهذا العميل.</div>';
    return;
  }
  let html = `<table style='width:100%;border-collapse:collapse;'>`;
  html += `<thead><tr style='background:#eee;'><th>رقم الفاتورة</th><th>التاريخ</th><th>المبلغ الكلي</th><th>المدفوع</th><th>الحالة</th></tr></thead><tbody>`;
  sales.forEach(sale => {
    const status = (sale.total - (sale.paid || 0)) <= 0 ? 'مكتمل' : 'متبقي';
    html += `<tr><td>${sale.invoice_no || sale.id}</td><td>${sale.date || sale.created_at || '-'}</td><td>${sale.total || 0}</td><td>${sale.paid || 0}</td><td>${status}</td></tr>`;
  });
  html += `</tbody></table>`;
  box.innerHTML = html;
}

// ===== تفعيل عرض كشف حساب عميل باستخدام getAccountStatement =====
function showAccountStatement(customerId) {
  const statement = getAccountStatement(customerId);
  const box = document.getElementById('accountStatementBox');
  if (!box) return;
  let html = `<div style='font-weight:700;margin-bottom:8px;'>الإجمالي: ${statement.total} | المدفوع: ${statement.paid} | الرصيد المستحق: ${statement.balance}</div>`;
  html += `<table style='width:100%;border-collapse:collapse;'>`;
  html += `<thead><tr style='background:#eee;'><th>رقم الفاتورة</th><th>التاريخ</th><th>المبلغ الكلي</th><th>المدفوع</th><th>الحالة</th></tr></thead><tbody>`;
  statement.transactions.sort((a,b)=> new Date(a.date||a.created_at)-new Date(b.date||b.created_at)).forEach(sale => {
    const status = (sale.total - (sale.paid || 0)) <= 0 ? 'مكتمل' : 'متبقي';
    html += `<tr><td>${sale.invoice_no || sale.id}</td><td>${sale.date || sale.created_at || '-'}</td><td>${sale.total || 0}</td><td>${sale.paid || 0}</td><td>${status}</td></tr>`;
  });
  html += `</tbody></table>`;
  box.innerHTML = html;
}
// دالة لجلب فواتير عميل معين من salesCache
function getSalesByCustomer(customerId) {
  if (!window.salesCache || !Array.isArray(window.salesCache)) return [];
  return window.salesCache.filter(sale => sale.customer_id === customerId);
}

// دالة لجلب كشف حساب عميل معين
function getAccountStatement(customerId) {
  const sales = getSalesByCustomer(customerId);
  const total = sales.reduce((sum, s) => sum + (s.total || 0), 0);
  const paid = sales.reduce((sum, s) => sum + (s.paid || 0), 0);
  const balance = total - paid;
  return {
    transactions: sales,
    total,
    paid,
    balance
  };
}
// Debug load marker
console.log('renderer.js loaded (cache-bust v3)');
// إضافة تخزين مستقل في IndexedDB (installDate + activation) لضمان عدم فقدان حالة التفعيل حتى لو حُذفت إعدادات الخلفية.

// ===== IndexedDB Key/Value صغير =====
function idbOpen(){
  return new Promise((res,rej)=>{
    const req = indexedDB.open('asas_meta',1);
    req.onupgradeneeded = ()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = ()=> res(req.result);
    req.onerror = ()=> rej(req.error);
  });
}
async function idbGet(key){ try { const db=await idbOpen(); return await new Promise(r=>{ const tx=db.transaction('kv'); const st=tx.objectStore('kv'); const q=st.get(key); q.onsuccess=()=> r(q.result===undefined? null : q.result); q.onerror=()=> r(null); }); } catch(_){ return null; } }
async function idbSet(key,value){ try { const db=await idbOpen(); return await new Promise((r,rej)=>{ const tx=db.transaction('kv','readwrite'); tx.oncomplete=()=>r(true); tx.onerror=()=>r(false); tx.objectStore('kv').put(value,key); }); } catch(_){ return false; } }

async function getMeta(key){
  if(key==='installDate' || key==='activation'){
    const v = await idbGet(key);
    if(v) return v;
  }
  // رجوع للباك إذا غير موجود
  if(key==='edition'){
    try { const info = await window.api.getInstallInfo(); return info.edition || null; } catch(_){ return null; }
  }
  if(key==='installDate'){
    try { const info = await window.api.getInstallInfo(); return info.installDate || null; } catch(_){ return null; }
  }
  if(key==='activation'){
    try { const info = await window.api.getInstallInfo(); return info.activation || null; } catch(_){ return null; }
  }
  return null;
}
async function setMeta(key,value){
  if(key==='edition') return window.api.setEdition(value);
  if(key==='installDate' || key==='activation') return idbSet(key,value);
}

// UI rendering roots
const app = document.getElementById('app');

// تعطيل التفعيل (تشغيل دائم) مع الإبقاء على الأكواد للاستخدام لاحقاً
const ACTIVATION_DISABLED = true; // غيّرها إلى false لإعادة التفعيل مستقبلاً

function renderEditionSelection(){
  app.innerHTML = `<div class="card rtl">
    <div class="title">اختيار الإصدار</div>
    <div class="grid">
      <button class="btn btn-primary" id="sa">الإصدار السعودي (ضريبة 15%)</button>
      <button class="btn" id="ye">الإصدار اليمني (بدون ضريبة + سعر صرف)</button>
    </div>
  </div>`;
  document.getElementById('sa').onclick = ()=>saveEdition('sa');
  document.getElementById('ye').onclick = ()=>saveEdition('ye');
}

async function saveEdition(code){
  await setMeta('edition', code);
  renderLogin();
}

async function ensureDefaultUser(){ return true; }
let windowMaxed = false; // ضمان عدم تكرار التكبير

function renderLogin(){
  console.log('Asas Login UI v2 loaded');
  document.body.classList.remove('dashboard-mode');
  // تثبيت نمط شاشة الدخول لمنع تبديل الألوان عند تغيير حجم النافذة
  document.body.classList.add('login-fixed');
  app.innerHTML = `<div class="login-wrapper"><div class="login-shell rtl login-v2 login-container">
      <div class="form-side fill-half no-panel centered-form login-form-column">
        <button class="exit-btn corner" id="exitBtn" title="خروج">خروج</button>
        <div class="login-title-block enhanced login-title-stack">
          <div class="login-top-icon" aria-hidden="true">
            <svg viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="gradOuter" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#0d4d92"/>
                  <stop offset="100%" stop-color="#1d7bc9"/>
                </linearGradient>
                <linearGradient id="gradInner" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
                  <stop offset="100%" stop-color="#d5e8ff" stop-opacity="0.2"/>
                </linearGradient>
              </defs>
              <circle cx="64" cy="64" r="60" fill="url(#gradOuter)" opacity="0.18" stroke="#0d4d92" stroke-width="4" />
              <circle cx="64" cy="64" r="44" fill="url(#gradInner)" stroke="#0d4d92" stroke-width="2" />
              <!-- رمز مركب: درع + قفل مفتاح -->
              <path d="M64 92c-14-6-24-18-24-34V42l24-10 24 10v16c0 16-10 28-24 34Z" fill="#0d4d92" fill-opacity="0.15" stroke="#0d4d92" stroke-width="3" stroke-linejoin="round"/>
              <path d="M52 60v-6c0-8 5-14 12-14s12 6 12 14v6" stroke="#0d4d92" stroke-width="4" stroke-linecap="round" fill="none"/>
              <circle cx="64" cy="72" r="7" fill="#ffb347" stroke="#0d4d92" stroke-width="3" />
              <rect x="61.3" y="72" width="5.4" height="11" rx="2" fill="#0d4d92" />
            </svg>
          </div>
          <h2 class="form-title big-login-title lowered-title">تسجيل الدخول للنظام</h2>
        </div>
        <div class="login-form-card">
          <form id="loginForm" class="pushed-form tidy-login-form" autocomplete="off">
            <div class="login-fields">
              <label class="field field-centered compact-field narrow-field">
                <span class="field-label big-lbl">اختر المستخدم</span>
                <select class="input big-input prominent-input uniform-input" id="usernameSelect">
                  <option value="" disabled selected>- اختر الموظف -</option>
                </select>
              </label>
              <label class="field field-centered compact-field narrow-field">
                <span class="field-label big-lbl">الرقم السري</span>
                <div class="pwd-wrapper"><input class="input big-input prominent-input uniform-input" id="password" type="password" placeholder="••••••" /><button type="button" class="toggle-pwd" id="togglePwd" tabindex="-1">إظهار</button></div>
              </label>
              <div class="login-inline-row">
                <label class="remember-row remember-centered in-card"><input type="checkbox" id="rememberUser" /> <span>حفظ بيانات الدخول</span></label>
              </div>
              <div class="login-actions">
                <button id="loginBtn" type="submit" class="btn btn-primary main-btn wide-btn bigger-btn login-btn-spaced">دخول</button>
              </div>
              <div id="loginError" class="form-error" role="alert"></div>
            </div>
          </form>
        </div>
        <div class="login-footer fixed-bottom">© 2025 Asas – جميع الحقوق محفوظة</div>
      </div>
      <div class="visual-side swapped-right">
        <div class="visual-overlay"></div>
        <img src="../../assets/visual-scene.svg" alt="Asas Visual" class="visual-bg" />
      </div>
    </div></div>`;
  // ربط زر الدخول (مع حماية في حال لم يُنشأ لأي سبب)
  const loginBtn = document.getElementById('loginBtn');
  if(loginBtn) loginBtn.onclick = handleLogin;
  document.getElementById('exitBtn').onclick = ()=>window.api.exitApp();
  populateUsernames();
  // استرجاع اسم محفوظ إن وجد
  const saved = localStorage.getItem('asas_last_user');
  if(saved){
    const sel = document.getElementById('usernameSelect');
    // قد يكون الخيار لم يُضاف بعد (populateUsernames async)
    setTimeout(()=>{ if([...sel.options].some(o=>o.value===saved)) sel.value = saved; },200);
    document.getElementById('rememberUser').checked = true;
  }
  document.getElementById('loginForm').addEventListener('submit',(e)=>{e.preventDefault(); handleLogin();});
  const toggle = document.getElementById('togglePwd');
  const pwd = document.getElementById('password');
  toggle.onclick = ()=>{
    if(pwd.type === 'password'){ pwd.type='text'; toggle.textContent='إخفاء'; }
    else { pwd.type='password'; toggle.textContent='إظهار'; }
  };
}

async function handleLogin(){
  if(window.__loginBusy) return; // منع نقرات متكررة
  const usernameEl = document.getElementById('usernameSelect');
  const username = usernameEl.value.trim();
  const password = document.getElementById('password').value;
  const errBox = document.getElementById('loginError');
  if(errBox) errBox.textContent='';
  if(!username){ if(errBox){ errBox.textContent='يرجى اختيار المستخدم'; } return; }
  window.__loginBusy = true;
  const loginBtn = document.getElementById('loginBtn');
  if(loginBtn){ loginBtn.disabled = true; loginBtn.style.opacity='.6'; }
  const resp = await window.api.authLogin(username, password);
  if(resp.ok){
    const user = resp.user;
  // إزالة تثبيت نمط شاشة الدخول عند الدخول للوحة التحكم
  document.body.classList.remove('login-fixed');
  try { sessionStorage.setItem('asas_user', JSON.stringify(user)); } catch(_){ }
    const remember = document.getElementById('rememberUser');
    if(remember && remember.checked){ localStorage.setItem('asas_last_user', username); } else { localStorage.removeItem('asas_last_user'); }
    // تفريغ الواجهة فوراً لمنع أي وميض أو إعادة ظهور لواجهة الدخول
    app.innerHTML = '';
    // بدء الانتقال فوراً إلى لوحة التحكم
    requestAnimationFrame(()=>{
      checkActivationThenEnter(user).finally(()=>{ window.__loginBusy=false; });
    });
  } else {
    if(errBox){ errBox.textContent= 'بيانات الدخول غير صحيحة'; }
    if(loginBtn){ loginBtn.disabled = false; loginBtn.style.opacity='1'; }
    window.__loginBusy = false;
  }
}

async function populateUsernames(){
  const sel = document.getElementById('usernameSelect');
  if(!sel) return;
  // إضافة عنصر اختياري ثابت في الأعلى
  sel.innerHTML='<option value="" disabled selected>- اختر الموظف -</option>';
  const resp = await window.api.listUsers();
  if(resp.ok){
    // ترتيب تصاعدي حسب المعرّف لضمان ثبات القائمة (أحدث الموظفين في الأسفل)
    const rows = [...resp.rows].sort((a,b)=> a.id - b.id);
    rows.forEach(u=>{
      const opt=document.createElement('option');
      opt.value=u.username;
      // إظهار الكود (نستخدم المعرّف كرمز داخلي) + اسم المستخدم
      const roleLabel = (u.username==='manager')? 'المدير' : 'الموظف';
      opt.textContent = `${u.id} | ${roleLabel} - ${u.username}`;
      opt.dataset.userId = u.id;
      sel.appendChild(opt);
    });
  }
}

async function checkActivationThenEnter(user){
  // قراءة من IndexedDB أولاً
  let installDate = await getMeta('installDate');
  if(!installDate){
    installDate = new Date().toISOString();
    await setMeta('installDate', installDate);
  }
  let activation = await getMeta('activation');
  // تزامن مع الباك فقط كمرجع (لا نعتمد عليه) – عدم منع التشغيل لو فشل
  try { const info = await window.api.getInstallInfo(); if(info && info.activation && !activation){ activation = info.activation; await setMeta('activation', activation); } if(!info.installDate && installDate) {/* يمكن إرسال */} } catch(_){ }
  const activated = ACTIVATION_DISABLED ? true : !!activation;
  const instDateObj = new Date(installDate);
  const diffDays = Math.floor((Date.now() - instDateObj.getTime()) / 86400000);
  if(ACTIVATION_DISABLED){
    // تشغيل دائم دون ظهور صندوق تجريبي
    renderDashboard(user, null, installDate);
    return;
  }
  if(!activated){
    if(diffDays >= 30){
      renderActivationScreen(true, 0);
      setTimeout(()=>{ try{ window.api.exitApp(); }catch(_){ window.close(); } }, 100);
      return;
    } else {
      renderDashboard(user, 30 - diffDays, installDate);
      return;
    }
  }
  renderDashboard(user, null, installDate);
}

function renderActivationScreen(expired, remainingDays){
  document.body.classList.add('login-fixed');
  const warn = !expired && remainingDays!=null ? `<div class="small" style="color:#a35a00;font-weight:700;">متبق ${remainingDays} يوم${remainingDays===1?'':'اً'} من الفترة التجريبية – يمكنك التفعيل الآن.</div>`: '';
  // جلب البصمة من النظام
  window.api.getInstallInfo().then(info => {
    const fingerprint = info.fingerprint || 'UNKNOWN';
    app.innerHTML = `<div class="card rtl" style="max-width:640px;">
      <div class="title" style="margin-bottom:12px;">${expired? 'انتهت الفترة التجريبية' : 'التفعيل والترخيص'}</div>
      ${warn}
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div class="small" style="font-weight:700;line-height:1.6;">${expired? 'انتهت الفترة التجريبية، يرجى التواصل للحصول على كود التفعيل' : 'لديك نسخة تجريبية لمدة 30 يوماً – أدخل كود التفعيل قبل انتهاء المدة لتتحول لمرخّصة بدون فقدان البيانات.'}</div>
        <div class="small" style="background:#eef2f6;padding:12px 14px;border-radius:16px;box-shadow:inset 2px 2px 4px #c2c6cc,inset -2px -2px 4px #ffffff;font-weight:700;">
          أرقام التواصل:<br>
          <span style="display:inline-block;direction:ltr;font-family:monospace;">00966540519141</span><br>
          <span style="display:inline-block;direction:ltr;font-family:monospace;">00966533459244</span><br>
          <span style="display:inline-block;direction:ltr;font-family:monospace;">00967775458866</span><br>
          <span style="display:inline-block;direction:ltr;font-family:monospace;">Fa1995hd@hotmail.com</span>
        </div>
        <div class="small" style="margin:8px 0 0 0;">
          <b>بصمة الجهاز:</b>
          <span id="fpVal" style="user-select:all;direction:ltr;font-family:monospace;background:#fff3cd;padding:4px 8px;border-radius:8px;">${fingerprint}</span>
          <button class="btn" id="copyFp" style="margin-right:8px;font-size:13px;padding:2px 10px;">نسخ</button>
          <button class="btn" id="removeAct" style="display:none;margin-right:8px;font-size:13px;padding:2px 10px;background:#c00;color:#fff;">مسح الترخيص</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <input class="input" id="activationCode" placeholder="أدخل كود التفعيل (تجريبي: 1233)" />
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <button class="btn btn-primary" id="activateBtn" style="flex:1;min-width:140px;">تفعيل الآن</button>
            ${!expired? '<button class="btn" id="continueTrial" style="flex:1;min-width:140px;">متابعة مؤقتاً</button>' : ''}
          </div>
        </div>
        <div id="actMsg" class="small" style="min-height:22px;font-weight:700;"></div>
        <div class="small" style="opacity:.7;text-align:center;">© 2025 Asas</div>
      </div>
    </div>`;
    document.getElementById('activateBtn').onclick = doActivate;
    const cont = document.getElementById('continueTrial');
    if(cont) cont.onclick = ()=>{ renderLogin(); };
    setTimeout(()=> document.getElementById('activationCode').focus(), 50);
    document.getElementById('copyFp').onclick = ()=>{
      navigator.clipboard.writeText(fingerprint);
      document.getElementById('copyFp').textContent = 'تم النسخ';
      setTimeout(()=>{ document.getElementById('copyFp').textContent = 'نسخ'; }, 1200);
    };
    // زر مسح الترخيص (مخفي)
    let fpClicks = 0;
    document.getElementById('fpVal').onclick = ()=>{
      fpClicks++;
      if(fpClicks >= 7){
        document.getElementById('removeAct').style.display = '';
      }
      setTimeout(()=>{ fpClicks=0; }, 2000);
    };
    document.getElementById('removeAct').onclick = async ()=>{
      if(confirm('هل تريد فعلاً مسح كود التفعيل من هذا الجهاز؟')){
        await window.api.invoke('admin-remove-activation');
        alert('تم مسح كود التفعيل. أعد تشغيل البرنامج.');
        location.reload();
      }
    };
  });
}

async function doActivate(){
  const codeEl = document.getElementById('activationCode');
  if(!codeEl) return;
  const code = codeEl.value.trim();
  const msg = document.getElementById('actMsg');
  if(!code){ msg.innerHTML='<span class="error">أدخل الكود</span>'; return; }
  // قبول الكود التجريبي محلياً (1233)
  if(code==='1233'){
    await setMeta('activation', { code, at:new Date().toISOString() });
    try { await window.api.activateApp(code); } catch(_){ }
    msg.innerHTML='<span class="success">تم التفعيل بنجاح (محلي)</span>';
    setTimeout(()=> renderLogin(), 800);
    return;
  }
  // محاولة عبر الباك (قد يضيف أكواد مستقبلية)
  try {
    const resp = await window.api.activateApp(code);
    if(resp && resp.ok){
      await setMeta('activation', { code, at:new Date().toISOString() });
      msg.innerHTML='<span class="success">تم التفعيل بنجاح</span>';
      setTimeout(()=> renderLogin(), 800);
    } else {
      msg.innerHTML='<span class="error">كود غير صحيح</span>';
    }
  } catch(err){
    msg.innerHTML='<span class="error">فشل الاتصال</span>';
  }
}

function renderDashboard(user, trialRemaining, installDate){
  document.body.classList.add('dashboard-mode');
  const isoDate = installDate ? new Date(installDate).toISOString().slice(0,10) : new Date().toISOString().slice(0,10);
  const warn = (trialRemaining && trialRemaining <=5) ? `<span class="trial-warn">تنبيه: متبق ${trialRemaining} يوم${trialRemaining===1?'':'اً'}</span>` : '';
  let trialBox = trialRemaining && !ACTIVATION_DISABLED
    ? `<div class="trial-box" id="trialBox" style="cursor:pointer;" title="انقر للتفعيل"><span class="t-label">تجريبي</span><span class="t-rem">${trialRemaining} يوم</span><span class="t-date">${isoDate}</span>${warn}</div>`
    : `<div class="trial-box licensed" id="trialBox"><span class="t-label">مرخّص</span><span class="t-date">${isoDate}</span></div>`;
  // إخفاء الصندوق تماماً إذا كان التفعيل معطلاً (تشغيل دائم)
  if(ACTIVATION_DISABLED) trialBox = '';
  if(!windowMaxed){
    try { window.api.maximize(); } catch(_) {}
    windowMaxed = true;
  }
  app.innerHTML = `<div class="dashboard-shell rtl" id="dashRoot">
    <div class="top-bar sticky-bar" id="topBar">
      <div class="bar-left">
        <button class="top-btn back" id="btn-back" title="رجوع">⟵ رجوع</button>
        <button class="top-btn danger" id="btn-logout" title="تسجيل الخروج">خروج</button>
  <button class="top-btn" id="btn-close-app" title="إغلاق التطبيق">إغلاق</button>
        <button class="top-btn" id="btn-shortcuts" title="الاختصارات">الاختصارات</button>
        <button class="top-btn" id="btn-help" title="المساعدة">المساعدة</button>
      </div>
      <div class="bar-mid"><h1 class="dash-title">لوحة التحكم</h1></div>
  <div class="bar-right">${trialBox||''}</div>
    </div>
  <nav class="main-menu" aria-label="القائمة الرئيسية">${buildMainMenuHTML()}<div class="user-inline" id="userInline">اسم المستخدم: <strong>${user?.username || ''}</strong></div></nav>
    <div id="view" class="view-area"></div>
    <div class="brand-footer">Asas – © 2025 Asas - جميع الحقوق محفوظة</div>
  </div>`;
  document.getElementById('btn-logout').onclick = ()=>{ sessionStorage.removeItem('asas_user'); renderLogin(); };
  const tb = document.getElementById('trialBox');
  if(trialRemaining && tb){ tb.addEventListener('click', ()=> renderActivationScreen(false, trialRemaining)); }
  document.getElementById('btn-shortcuts').onclick = ()=>showShortcuts();
  document.getElementById('btn-help').onclick = ()=>showHelp();
  document.getElementById('btn-close-app').onclick = ()=>{ try { window.api.exitApp(); } catch(_){ window.close(); } };
  document.getElementById('btn-back').onclick = ()=>{
    // استخدام الرجوع في المتصفح إن وُجد تاريخ سابق
    if(window.history.length > 1){
      window.history.back();
    } else {
      // احتياطي: العودة لواجهة الرئيسية داخل نفس الجلسة إن لم يوجد سجل
      const view = document.getElementById('view');
      if(view && view.dataset.mode !== 'home') showHome(user, trialRemaining);
    }
  };
  bindMainMenuHandlers(user);
  setupGlobalShortcuts(user);
  showHome(user, trialRemaining);
}

function buildMainMenuHTML(){
  // عناصر القائمة الرئيسية (مع أسماء معرفات لتسهيل الربط)
  // ترتيب جديد مبسّط مع حذف الإعدادات و"إنفاقي" والتركيز على الوحدات التشغيلية الأساسية
  const items = [
    { id:'m-inventory', label:'المخزون', subs:['المخازن','منخفض المخزون','تحويل مخزني','سجل النقل','جرد','جرد سريع','تسوية كمية','تتبع حركة','تحليل مخزون'], perm:64 },
    { id:'m-rep-extra', label:'التقارير', subs:['قيمة المخزون','حركة مخزون متقدم','مرتجعات مجمعة','المصروفات','إضافة مصروف','ضريبة','هوامش المنتجات'], perm:16 }
  ];
  let perms=0; try { perms = userPermissions(); } catch(_){ }
  return items.filter(it=> {
    if(!it.perm) return true;
    return (perms & it.perm)===it.perm;
  }).map(it=>`<div class="menu-item" tabindex="0" data-id="${it.id}">${it.label}<div class="submenu">${it.subs.map(s=>`<button class="submenu-btn" data-action="${it.id}:${s}">${s}</button>`).join('')}</div></div>`).join('');
}

// دالة ترجع قيمة صلاحيات المستخدم (بتات) من الجلسة أو 0
function userPermissions(){
  try {
    const saved = sessionStorage.getItem('asas_user');
    if(!saved) return 0;
    const u = JSON.parse(saved);
    return u && typeof u.permissions === 'number' ? u.permissions : 0;
  } catch(_){ return 0; }
}

// ربط أحداث القائمة الرئيسية بعد بناءها
function bindMainMenuHandlers(user){
  const menu = document.querySelectorAll('.main-menu .menu-item');
  menu.forEach(mi=>{
    mi.addEventListener('click', (e)=>{
      // فتح/إغلاق الفرعي
      if(e.target.classList.contains('menu-item')){
        mi.classList.toggle('open');
      }
    });
  });
  document.querySelectorAll('.submenu-btn').forEach(btn=>{
    btn.onclick = (ev)=>{
      const act = btn.dataset.action;
      const mi = btn.closest('.menu-item');
      if(mi) mi.classList.remove('open');
      // التقارير الإضافية
      if(act.startsWith('m-rep-extra:')){
        switch(act){
          case 'm-rep-extra:قيمة المخزون': window.location.href='report-stock-value.html'; return;
          case 'm-rep-extra:حركة مخزون متقدم': window.location.href='report-inventory-advanced.html'; return;
          case 'm-rep-extra:مرتجعات مجمعة': window.location.href='report-returns-aggregate.html'; return;
          case 'm-rep-extra:المصروفات': window.location.href='report-expenses.html'; return;
          case 'm-rep-extra:إضافة مصروف': window.location.href='report-expenses.html#add'; return;
          case 'm-rep-extra:ضريبة': window.location.href='report-vat.html'; return;
          case 'm-rep-extra:هوامش المنتجات': window.location.href='report-product-margins.html'; return;
        }
      }
      // المخزون
      if(act.startsWith('m-inventory:')){
        switch(act){
          case 'm-inventory:المخازن': window.location.href='warehouses.html'; return;
          case 'm-inventory:منخفض المخزون': window.location.href='low-stock.html'; return;
          case 'm-inventory:تحويل مخزني': window.location.href='warehouses.html#transfer'; return;
          case 'm-inventory:سجل النقل': window.location.href='transfer-log.html'; return;
          case 'm-inventory:جرد': alert('واجهة الجرد ستتم إضافتها لاحقاً'); return;
          case 'm-inventory:جرد سريع': window.location.href='inventory-count.html'; return;
          case 'm-inventory:تسوية كمية': window.location.href='inventory-adjust.html'; return;
          case 'm-inventory:تتبع حركة': window.location.href='inventory-track.html'; return;
          case 'm-inventory:تحليل مخزون': window.location.href='inventory-analysis.html'; return;
        }
      }
      // قوائم محذوفة (لا شيء)
      if(act.startsWith('m-customers') || act.startsWith('m-suppliers') || act.startsWith('m-payments')) return;
      if(act === 'm-cust-short:عميل سريع'){ quickAddCustomer(); return; }
      // افتراضي
      showPlaceholder(act);
    };
  });
}

function showPlaceholder(action){
  const view = document.getElementById('view');
  view.innerHTML = `<div class=\"section\"><div class=\"title mini\">${action}</div><p>واجهة قادمة لاحقاً...</p></div>`;
}

// ===== اختصارات العملاء (نماذج منبثقة خفيفة) =====
function ensureOverlay(){
  let ov=document.getElementById('quickOverlay');
  if(!ov){
    ov=document.createElement('div');
  };
  setTimeout(()=>ov.querySelector('#qDebtName').focus(),30);
}

function quickPayDebt(){

// ===== مورد سريع =====
function quickAddSupplier(){
  const ov=ensureOverlay();
  ov.innerHTML=`<div style="background:#fff;border:2px solid #000;border-radius:24px;padding:20px 24px;min-width:360px;max-width:440px;display:flex;flex-direction:column;gap:14px;">
    <h3 style="margin:0;font-size:18px;font-weight:800;">مورد سريع</h3>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;">الاسم<input id="qSupName" style="padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;" /></label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;">الجوال<input id="qSupPhone" style="padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;" /></label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;">الرقم الضريبي<input id="qSupVat" style="padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;" /></label>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button id="qSupCancel" style="padding:8px 14px;border:2px solid #000;background:#eee;border-radius:12px;font-weight:700;cursor:pointer;">إلغاء</button>
      <button id="qSupSave" style="padding:8px 14px;border:2px solid #000;background:#c8f7c5;border-radius:12px;font-weight:700;cursor:pointer;">حفظ</button>
    </div>
  </div>`;
  ov.querySelector('#qSupCancel').onclick=closeQuick;
  ov.querySelector('#qSupSave').onclick=async ()=>{
    const name=ov.querySelector('#qSupName').value.trim();
    if(!name){ alert('أدخل الاسم'); return; }
    const phone=ov.querySelector('#qSupPhone').value.trim();
    const vat=ov.querySelector('#qSupVat').value.trim();
    const r= await window.api.supplierAdd({ name, phone, vat, whatsapp:'', email:'', address:'', notes:'', balance:0 });
    if(r.ok){ closeQuick(); alert('تم الحفظ'); }
    else alert(r.msg||'فشل');
  };
  setTimeout(()=>ov.querySelector('#qSupName').focus(),30);
}
  const ov=ensureOverlay();
  ov.innerHTML=`<div style="background:#fff;border:2px solid #000;border-radius:24px;padding:20px 24px;min-width:380px;max-width:480px;display:flex;flex-direction:column;gap:14px;">
    <h3 style="margin:0;font-size:18px;font-weight:800;">سداد دين</h3>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;">بحث عميل<input id="qPaySearch" style="padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;" placeholder="اسم أو جوال" /></label>
    <div id="qPayList" style="max-height:140px;overflow:auto;border:2px solid #000;border-radius:14px;padding:6px;display:flex;flex-direction:column;gap:6px;background:#fafafa;"></div>
    <div id="qPayForm" style="display:none;flex-direction:column;gap:10px;">
      <div style="font-size:13px;font-weight:700;" id="qPaySelected"></div>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;">المبلغ<input id="qPayAmount" type="number" style="padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;" /></label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;">ملاحظات<input id="qPayNote" style="padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;" /></label>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="qPayCancel" style="padding:8px 14px;border:2px solid #000;background:#eee;border-radius:12px;font-weight:700;cursor:pointer;">إلغاء</button>
        <button id="qPaySave" style="padding:8px 14px;border:2px solid #000;background:#d2e9ff;border-radius:12px;font-weight:700;cursor:pointer;">سداد</button>
      </div>
    </div>
  </div>`;
  const listBox=ov.querySelector('#qPayList');
  const formBox=ov.querySelector('#qPayForm');
  const selSpan=ov.querySelector('#qPaySelected');
  ov.querySelector('#qPayCancel').onclick=closeQuick;
  ov.querySelector('#qPaySearch').addEventListener('input', async ()=>{
    const v=ov.querySelector('#qPaySearch').value.trim();
    const r= await window.api.debtsList(v);
    listBox.innerHTML='';
    if(r.ok){
      r.rows.filter(d=>!d.paid).slice(0,200).forEach(d=>{
        const remain=(d.amount||0)-(d.paid_amount||0);
        const btn=document.createElement('button');
        btn.type='button';
        btn.style.cssText='text-align:right;padding:6px 8px;border:2px solid #000;background:#fff;border-radius:10px;cursor:pointer;font-size:12px;font-weight:700;';
        btn.textContent=`${d.customer_name} | متبق: ${remain.toFixed(2)}`;
        btn.onclick=()=>{ selSpan.textContent=`${d.customer_name} (متبق ${remain.toFixed(2)})`; formBox.style.display='flex'; formBox.dataset.debtId=d.id; };
        listBox.appendChild(btn);
      });
    }
  });
  ov.querySelector('#qPaySave').onclick=async ()=>{
    const debtId=+formBox.dataset.debtId; if(!debtId){ alert('اختر دين'); return; }
    const amount=parseFloat(ov.querySelector('#qPayAmount').value)||0; if(amount<=0){ alert('مبلغ غير صحيح'); return; }
    const note=ov.querySelector('#qPayNote').value.trim();
    const r= await window.api.debtPartial({ debt_id:debtId, amount, note });
    if(r.ok){ closeQuick(); alert('تم السداد الجزئي'); }
    else alert(r.msg||'فشل');
  };
  setTimeout(()=>ov.querySelector('#qPaySearch').focus(),30);
}

// فتح نموذج إضافة عميل (من القائمة) يعيد استخدام منطق quickAddCustomer لكن بحقوق أكثر حقول
function openCustomerAddModal(){
  const ov=ensureOverlay();
  ov.innerHTML=`<div style="background:#fff;border:2px solid #000;border-radius:26px;padding:24px 26px;min-width:540px;max-width:740px;max-height:90vh;overflow:auto;display:flex;flex-direction:column;gap:18px;">\n<h3 style='margin:0;font-size:20px;font-weight:800;'>إضافة عميل جديد</h3>\n<form id='fullCustForm' style='display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px 14px;font-size:12px;font-weight:700;'>\n<label>الاسم<input name='name' required style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;'></label>\n<label>الجوال<input name='phone' style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;'></label>\n<label>الواتساب<input name='whatsapp' style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;'></label>\n<label>البريد<input name='email' type='email' style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;'></label>\n<label>الرقم الضريبي<input name='vat' style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;'></label>\n<label>السجل التجاري<input name='cr' style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;'></label>\n<label>المدينة<input name='city' style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;'></label>\n<label>الحي<input name='district' style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;'></label>\n<label>الشارع<input name='street' style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;'></label>\n<label>الرمز البريدي<input name='zip' style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;'></label>\n<label>المبنى<input name='building' style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;'></label>\n<label>العنوان المختصر<input name='short_address' style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;'></label>\n<label>الرقم الإضافي<input name='addr_extra' style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;'></label>\n<label style='grid-column:1/-1;'>ملاحظات<textarea name='notes' style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;min-height:70px;'></textarea></label>\n</form>\n<div style='display:flex;gap:12px;justify-content:flex-end;'>\n<button id='custAddCancel' style='padding:10px 18px;border:2px solid #000;background:#eee;border-radius:14px;font-weight:700;cursor:pointer;'>إلغاء</button>\n<button id='custAddSave' style='padding:10px 18px;border:2px solid #000;background:#c8f7c5;border-radius:14px;font-weight:700;cursor:pointer;'>حفظ</button>\n</div>\n</div>`;
  ov.querySelector('#custAddCancel').onclick=closeQuick;
  ov.querySelector('#custAddSave').onclick=async ()=>{
    const f=ov.querySelector('#fullCustForm');
    if(!f.reportValidity()) return;
    const data={};
    new FormData(f).forEach((v,k)=>{ data[k]=v.toString().trim(); });
    const payload={
      name:data.name, phone:data.phone, whatsapp:data.whatsapp, email:data.email, vat:data.vat, cr:data.cr,
      start_date:'', city:data.city, district:data.district, street:data.street, zip:data.zip, building:data.building,
      short_address:data.short_address, addr_extra:data.addr_extra, loyalty_points:0, notes:data.notes, address:'', type:'person', account_type:'نقد', balance:0
    };
    const r= await window.api.customerAdd(payload);
    if(r.ok){ closeQuick(); alert('تم إضافة العميل'); }
    else alert(r.msg||'فشل');
  };
  setTimeout(()=>ov.querySelector("input[name='name']").focus(),40);
}

// ===== تقرير وكشف حساب عميل =====
function openCustomerReportPrompt(){
  const ov=ensureOverlay();
  ov.innerHTML=`<div style="background:#fff;border:2px solid #000;border-radius:22px;padding:20px 24px;min-width:460px;display:flex;flex-direction:column;gap:14px;">
    <h3 style='margin:0;font-size:18px;font-weight:800;'>تقرير عميل</h3>
  <label style='display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;'>بحث (رقم / اسم / جوال)<input id='repCustVal' autocomplete='off' style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;'></label>
  <div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;font-size:11px;font-weight:700;'>
    <label>من تاريخ<input type='date' id='repStart' style='padding:6px 8px;border:2px solid #000;border-radius:10px;font-size:12px;'></label>
    <label>إلى تاريخ<input type='date' id='repEnd' style='padding:6px 8px;border:2px solid #000;border-radius:10px;font-size:12px;'></label>
  </div>
  <div id='repSuggest' style='display:none;max-height:160px;overflow:auto;border:2px solid #000;border-radius:12px;padding:6px;background:#fafafa;display:flex;flex-direction:column;gap:4px;'></div>
    <div style='display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;'>
      <button id='repPdf' title='تصدير PDF' style='padding:8px 12px;border:2px solid #000;background:#ffe7c2;border-radius:12px;font-weight:700;cursor:pointer;'>PDF</button>
      <button id='repCancel' style='padding:8px 14px;border:2px solid #000;background:#eee;border-radius:12px;font-weight:700;cursor:pointer;'>إلغاء</button>
      <button id='repLoad' style='padding:8px 14px;border:2px solid #000;background:#d4f1ff;border-radius:12px;font-weight:700;cursor:pointer;'>عرض</button>
    </div>
    <div id='repResult' style='max-height:360px;overflow:auto;font-size:12px;line-height:1.4;'></div>
  </div>`;
  ov.querySelector('#repCancel').onclick=closeQuick;
  const repInput=ov.querySelector('#repCustVal');
  const repSug=ov.querySelector('#repSuggest');
  repInput.addEventListener('input', async ()=>{
    const v=repInput.value.trim();
    if(!v){ repSug.style.display='none'; repSug.innerHTML=''; return; }
    // نستخدم فقط العملاء الذين لديهم مبيعات رسمية
    const list= await window.api.customersSalesList(v);
    if(list.ok){
      repSug.innerHTML='';
      list.rows.slice(0,30).forEach(c=>{
        const b=document.createElement('button');
        b.type='button'; b.style.cssText='text-align:right;padding:4px 8px;border:2px solid #000;background:#fff;border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;';
        b.textContent=`${c.id} | ${c.name} | ${c.phone||''}`;
        b.onclick=()=>{ repInput.value=c.id; repSug.style.display='none'; repSug.innerHTML=''; loadReport(); };
        repSug.appendChild(b);
      });
      repSug.style.display= repSug.innerHTML? 'flex':'none';
    }
  });
  async function resolveCustomerId(raw){
    // نعتمد فقط على جدول العملاء الرسمي (customersList)
    if(/^[0-9]+$/.test(raw)){
      // تأكد أن الرقم موجود فعلاً ضمن العملاء
  const chk = await window.api.customersSalesList(raw);
      if(chk.ok && chk.rows.some(c=>c.id===parseInt(raw))) return parseInt(raw);
      return null;
    }
  const listByName = await window.api.customersSalesList(raw);
    if(listByName.ok && listByName.rows.length){
      // مطابقة صارمة للاسم أولاً ثم الهاتف
      const exactName = listByName.rows.find(c=>c.name===raw);
      if(exactName) return exactName.id;
      const byPhone = listByName.rows.find(c=>c.phone && c.phone===raw);
      if(byPhone) return byPhone.id;
      // وإلا أخذ أول نتيجة (سلوك افتراضي سابق مشابه)
      return listByName.rows[0].id;
    }
    return null;
  }
  async function loadReport(){
    const val=repInput.value.trim(); if(!val){ alert('أدخل قيمة'); return; }
    const start = ov.querySelector('#repStart').value || null;
    const end = ov.querySelector('#repEnd').value || null;
    const cid = await resolveCustomerId(val);
    if(!cid){ alert('لم يتم العثور على العميل'); return; }
    const r = await window.api.customerReport({ customer_id: cid, start, end });
    const box=ov.querySelector('#repResult');
    if(!r.ok){ box.innerHTML='<span style="color:#b71c1c;font-weight:700;">فشل: '+(r.msg||'خطأ')+'</span>'; return; }
    const d=r.data;
    box.innerHTML=`<div style='font-weight:700;margin-bottom:6px;'>${d.customer.name} (رصيد: ${d.customer.balance})</div>
    <div>عدد فواتير: ${d.salesCount} | إجمالي: ${d.totalSales.toFixed(2)} | ضريبة: ${d.totalVat.toFixed(2)} | خصم: ${d.totalDiscount.toFixed(2)}</div>
    <div>${d.filters.start||'-'} → ${d.filters.end||'-'} | آخر فاتورة: ${d.lastSaleDate? d.lastSaleDate.replace('T',' ').slice(0,16):'-'}</div>
    <table style='margin-top:8px;border-collapse:collapse;width:100%;'>
      <thead><tr style='background:#eee;'><th style='border:1px solid #999;padding:3px;'>#</th><th style='border:1px solid #999;padding:3px;'>رقم</th><th style='border:1px solid #999;padding:3px;'>الصافي</th><th style='border:1px solid #999;padding:3px;'>ضريبة</th><th style='border:1px solid #999;padding:3px;'>تاريخ</th></tr></thead>
      <tbody>${d.recentSales.map(s=>`<tr><td style='border:1px solid #aaa;padding:3px;'>${s.id}</td><td style='border:1px solid #aaa;padding:3px;'>${s.invoice_no||''}</td><td style='border:1px solid #aaa;padding:3px;'>${(s.total||0).toFixed(2)}</td><td style='border:1px solid #aaa;padding:3px;'>${(s.vat||0).toFixed(2)}</td><td style='border:1px solid #aaa;padding:3px;'>${(s.created_at||'').replace('T',' ').slice(0,16)}</td></tr>`).join('')}</tbody>
    </table>`;
  }
  async function exportPdf(){
    const val=repInput.value.trim(); if(!val){ alert('أدخل قيمة'); return; }
    const start = ov.querySelector('#repStart').value || null;
    const end = ov.querySelector('#repEnd').value || null;
    const cid = await resolveCustomerId(val);
    if(!cid){ alert('لم يتم العثور على العميل'); return; }
    const rep = await window.api.customerReport({ customer_id: cid, start, end });
    if(!rep.ok){ alert(rep.msg||'فشل جلب البيانات'); return; }
    const d = rep.data;
    // ترتيب الأيقونات (11 عنصرًا)
    const items = [
      { mod:'pos', label:'نقطة بيع', icon:emojiIcon('pos'), wide:true },
      { mod:'purchases', label:'المشتريات', icon:emojiIcon('purchases') },
      { mod:'sales', label:'المبيعات', icon:emojiIcon('sales') },
      { mod:'customers', label:'العملاء', icon:emojiIcon('customers') },
      { mod:'stores', label:'المخازن', icon:emojiIcon('stores') },
      { mod:'products', label:'المنتجات', icon:emojiIcon('products') },
      { mod:'suppliers', label:'الموردين', icon:emojiIcon('suppliers') },
      { mod:'returnSales', label:'مرتجع مبيعات', icon:emojiIcon('returnSales') },
      { mod:'returnPurchase', label:'مرجع مشتريات', icon:emojiIcon('returnPurchase') },
      { mod:'salesReports', label:'تقارير المبيعات', icon:emojiIcon('salesReports') },
      { mod:'settings', label:'الإعدادات', icon:emojiIcon('settings') }
    ];
    // تطبيق فلترة الصلاحيات إن وُجدت خريطة modulePerms (مستخدمة سابقاً في buildIconGrid القديم)
    const modulePerms = { pos:1, sales:1, returnSales:1, products:2, customers:4, suppliers:8, purchases:8, returnPurchase:8, salesReports:16, settings:32, stores:64 };
    const perms = userPermissions();
    const filtered = items.filter(it=>{ const bit = modulePerms[it.mod]; return !bit || (perms & bit)===bit; });
    // بناء الشبكة: 6 أعمدة (POS يمتد عمودين) => الصف الأول: POS (2) + 4 = 6 وحدات (شكل 5 بطاقات مرئية)؛ الصف الثاني: 6 أيقونات عادية
    ensureIconGridStyles();
    return filtered.map(it=>{
      const cls = 'app-icon'+(it.wide? ' wide-pos':'');
      return `<div class="${cls}" data-mod="${it.mod}" role="button" tabindex="0" aria-label="${it.label}"><div class="app-emoji">${it.icon}</div><div class="app-label">${it.label}</div></div>`;
    }).join('');
  }

  // حقن أنماط الشبكة مرة واحدة
  function ensureIconGridStyles(){
    if(document.getElementById('iconGridStyles')) return;
    const st = document.createElement('style'); st.id='iconGridStyles';
    st.textContent = `
      .app-icons-grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:18px; align-items:stretch; }
      .app-icon { background:#fff; border:2px solid #0d4d92; border-radius:20px; padding:18px 14px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; font-weight:700; min-height:110px; box-shadow:2px 2px 4px rgba(0,0,0,.08), -2px -2px 4px rgba(255,255,255,.6); transition:.25s; }
      .app-icon:hover { transform:translateY(-4px); box-shadow:3px 6px 14px rgba(0,0,0,.15); }
    .app-icon .app-emoji { font-size:38px; line-height:1; margin-bottom:8px; width:90px; height:90px; display:flex; align-items:center; justify-content:center; }
    .app-icon.wide-pos { grid-column: span 2; min-height:150px; background:linear-gradient(135deg,#0d4d92,#1d7bc9); color:#fff; border-color:#0d4d92; padding:28px 20px 34px; position:relative; overflow:hidden; }
    .app-icon.wide-pos:after { content:''; position:absolute; inset:0; background:radial-gradient(circle at 75% 25%,rgba(255,255,255,0.35),rgba(255,255,255,0)); opacity:.35; }
    .app-icon.wide-pos .app-label { color:#fff; font-size:17px; letter-spacing:.6px; }
    .app-icon.wide-pos .app-emoji { font-size:60px; width:130px; height:130px; }
      @media (max-width:880px){ .app-icons-grid { grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); } .app-icon.wide-pos { grid-column:span 2; } }
    `;
    document.head.appendChild(st);
  }
  ov.querySelector('#repLoad').onclick=loadReport;
  ov.querySelector('#repPdf').onclick=exportPdf;
  setTimeout(()=>repInput.focus(),30);
}

function openCustomerStatementPrompt(){
  const ov=ensureOverlay();
  ov.innerHTML=`<div style="background:#fff;border:2px solid #000;border-radius:22px;padding:20px 24px;min-width:420px;display:flex;flex-direction:column;gap:14px;">
    <h3 style='margin:0;font-size:18px;font-weight:800;'>كشف حساب عميل</h3>
  <label style='display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;'>رقم / اسم / جوال<input id='stCustVal' autocomplete='off' style='padding:8px 10px;border:2px solid #000;border-radius:12px;font-size:13px;'></label>
  <div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;font-size:11px;font-weight:700;'>
    <label>من تاريخ<input type='date' id='stStart' style='padding:6px 8px;border:2px solid #000;border-radius:10px;font-size:12px;'></label>
    <label>إلى تاريخ<input type='date' id='stEnd' style='padding:6px 8px;border:2px solid #000;border-radius:10px;font-size:12px;'></label>
  </div>
  <div id='stSuggest' style='display:none;max-height:160px;overflow:auto;border:2px solid #000;border-radius:12px;padding:6px;background:#fafafa;display:flex;flex-direction:column;gap:4px;'></div>
    <div style='display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;'>
      <button id='stPdf' title='تصدير PDF' style='padding:8px 12px;border:2px solid #000;background:#ffe7c2;border-radius:12px;font-weight:700;cursor:pointer;'>PDF</button>
      <button id='stCancel' style='padding:8px 14px;border:2px solid #000;background:#eee;border-radius:12px;font-weight:700;cursor:pointer;'>إلغاء</button>
      <button id='stLoad' style='padding:8px 14px;border:2px solid #000;background:#e6ffe0;border-radius:12px;font-weight:700;cursor:pointer;'>عرض</button>
    </div>
    <div id='stResult' style='max-height:380px;overflow:auto;font-size:12px;line-height:1.4;'></div>
  </div>`;
  ov.querySelector('#stCancel').onclick=closeQuick;
  const stInput=ov.querySelector('#stCustVal');
  const stSug=ov.querySelector('#stSuggest');
  stInput.addEventListener('input', async ()=>{
    const v=stInput.value.trim();
    if(!v){ stSug.style.display='none'; stSug.innerHTML=''; return; }
  const list= await window.api.customersSalesList(v);
    if(list.ok){
      stSug.innerHTML='';
      list.rows.slice(0,30).forEach(c=>{
        const b=document.createElement('button');
        b.type='button'; b.style.cssText='text-align:right;padding:4px 8px;border:2px solid #000;background:#fff;border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;';
        b.textContent=`${c.id} | ${c.name} | ${c.phone||''}`;
        b.onclick=()=>{ stInput.value=c.id; stSug.style.display='none'; stSug.innerHTML=''; loadStatement(); };
        stSug.appendChild(b);
      });
      stSug.style.display= stSug.innerHTML? 'flex':'none';
    }
  });
  async function resolveCustomerQuery(val){
    // البحث عن عميل رسمي فقط
    let targetId = null;
    if(/^[0-9]+$/.test(val)){
      const lst = await window.api.customersSalesList(val);
      if(lst.ok && lst.rows.some(c=>c.id===parseInt(val))) targetId=parseInt(val);
    } else {
      const lst = await window.api.customersSalesList(val);
      if(lst.ok && lst.rows.length){
        const exactName = lst.rows.find(c=>c.name===val);
        if(exactName) targetId=exactName.id; else {
          const byPhone = lst.rows.find(c=>c.phone && c.phone===val);
          if(byPhone) targetId=byPhone.id; else targetId=lst.rows[0].id;
        }
      }
    }
    if(targetId==null) return { ok:false, msg:'عميل غير موجود' };
    // الآن اجلب كشف الحساب بالمعرّف الرسمي فقط
    return await window.api.customerStatement({ customer_id: targetId });
  }
  async function loadStatement(){
    const val=stInput.value.trim(); if(!val){ alert('أدخل قيمة'); return; }
    const start = ov.querySelector('#stStart').value || null;
    const end = ov.querySelector('#stEnd').value || null;
    const base = await resolveCustomerQuery(val);
    const box=ov.querySelector('#stResult');
    if(!base.ok){ box.innerHTML='<span style="color:#b71c1c;font-weight:700;">فشل: '+(base.msg||'خطأ')+'</span>'; return; }
    // أعد طلب مع الفلاتر لاسترجاع الديون ضمن النطاق
    const r = await window.api.customerStatement({ customer_id: base.data.customer.id, start, end });
    if(!r.ok){ box.innerHTML='<span style="color:#b71c1c;font-weight:700;">فشل: '+(r.msg||'خطأ')+'</span>'; return; }
    const d=r.data;
    box.innerHTML=`<div style='font-weight:700;margin-bottom:6px;'>${d.customer.name} | الرصيد: ${d.customer.balance}</div>
    <div>إجمالي الديون: ${d.totals.debtOriginal.toFixed(2)} | المسدد: ${d.totals.paidAmount.toFixed(2)} | المتبقي: ${d.totals.remaining.toFixed(2)}</div>
    <div style='margin:4px 0 6px;font-size:11px;color:#333;'>${d.filters.start||'-'} → ${d.filters.end||'-'} | عدد الديون: ${d.debts.length} | عدد السدادات: ${d.payments.length}</div>
    <h4 style='margin:8px 0 4px;font-size:13px;'>الديون</h4>
    <table style='border-collapse:collapse;width:100%;'><thead><tr style='background:#eee;'><th style='border:1px solid #999;padding:3px;'>#</th><th style='border:1px solid #999;padding:3px;'>تاريخ</th><th style='border:1px solid #999;padding:3px;'>المبلغ</th><th style='border:1px solid #999;padding:3px;'>مدفوع</th><th style='border:1px solid #999;padding:3px;'>متبق</th></tr></thead><tbody>${d.debts.map(x=>{const remain=(x.amount||0)-(x.paid_amount||0);return `<tr><td style='border:1px solid #aaa;padding:3px;'>${x.id}</td><td style='border:1px solid #aaa;padding:3px;'>${x.date}</td><td style='border:1px solid #aaa;padding:3px;'>${(x.amount||0).toFixed(2)}</td><td style='border:1px solid #aaa;padding:3px;'>${(x.paid_amount||0).toFixed(2)}</td><td style='border:1px solid #aaa;padding:3px;'>${remain.toFixed(2)}</td></tr>`;}).join('')}</tbody></table>
    <h4 style='margin:10px 0 4px;font-size:13px;'>سداد جزئي</h4>
    <table style='border-collapse:collapse;width:100%;'><thead><tr style='background:#eee;'><th style='border:1px solid #999;padding:3px;'>#</th><th style='border:1px solid #999;padding:3px;'>تاريخ</th><th style='border:1px solid #999;padding:3px;'>المبلغ</th><th style='border:1px solid #999;padding:3px;'>ملاحظة</th></tr></thead><tbody>${d.payments.map(p=>`<tr><td style='border:1px solid #aaa;padding:3px;'>${p.id}</td><td style='border:1px solid #aaa;padding:3px;'>${p.date}</td><td style='border:1px solid #aaa;padding:3px;'>${(p.amount||0).toFixed(2)}</td><td style='border:1px solid #aaa;padding:3px;'>${p.note||''}</td></tr>`).join('')}</tbody></table>`;
  }
  async function exportPdf(){
    const val=stInput.value.trim(); if(!val){ alert('أدخل قيمة'); return; }
    const start = ov.querySelector('#stStart').value || null;
    const end = ov.querySelector('#stEnd').value || null;
    const base = await resolveCustomerQuery(val);
    if(!base.ok){ alert(base.msg||'لم يتم العثور'); return; }
    const stm = await window.api.customerStatement({ customer_id: base.data.customer.id, start, end });
    if(!stm.ok){ alert(stm.msg||'فشل جلب الكشف'); return; }
    const d = stm.data;
    const columns = [
      { key:'type', header:'نوع', width:1 },
      { key:'id', header:'#', width:0.8 },
      { key:'date', header:'تاريخ', width:1.3 },
      { key:'amount', header:'مبلغ', width:1 },
      { key:'paid', header:'مدفوع', width:1 },
      { key:'remain', header:'متبق', width:1 },
      { key:'note', header:'ملاحظة', width:2 }
    ];
    const debtRows = (d.debts||[]).map(dt=>({ type:'دين', id:dt.id, date:dt.date, amount:(dt.amount||0).toFixed(2), paid:(dt.paid_amount||0).toFixed(2), remain:(((dt.amount||0)-(dt.paid_amount||0))||0).toFixed(2), note: dt.details||'' }));
    const payRows = (d.payments||[]).map(p=>({ type:'سداد', id:p.id, date:p.date, amount:'-'+(p.amount||0).toFixed(2), paid:(p.amount||0).toFixed(2), remain:'', note:p.note||'' }));
    const rows = [...debtRows, ...payRows];
    const save = await window.api.structuredReportSave({
      category:'العملاء', reportType:'كشف_حساب_عميل', subjectName: d.customer.name || ('ID'+d.customer.id),
      columns, rows, format:'pdf',
      meta:{ 'إجمالي الديون': d.totals.debtOriginal.toFixed(2), 'المسدّد': d.totals.paidAmount.toFixed(2), 'المتبقي': d.totals.remaining.toFixed(2), 'الفترة': (d.filters.start||'من البداية')+' → '+(d.filters.end||'حتى الآن') }
    });
    if(save.ok) alert('تم حفظ الكشف في:\n'+save.file); else alert(save.msg||'فشل الحفظ');
  }
  ov.querySelector('#stLoad').onclick=loadStatement;
  ov.querySelector('#stPdf').onclick=exportPdf;
  setTimeout(()=>stInput.focus(),30);
}

function showShortcuts(){
  const view = document.getElementById('view');
  if(!view) return;
  view.dataset.mode='shortcuts';
  view.innerHTML = `<div class="section"><div class="title mini">الاختصارات</div>
    <ul class="mini-list">
      <li><b>Ctrl + Shift + W</b> المخازن (الأرصدة)</li>
      <li><b>Ctrl + Shift + L</b> شاشة منخفض المخزون</li>
      <li><b>Ctrl + Shift + T</b> فتح تحويل مخزني</li>
      <li><b>Ctrl + Shift + G</b> سجل النقل</li>
      <li><b>Ctrl + Shift + P</b> المنتجات (قائمة المنتجات)</li>
  <li><b>Ctrl + Shift + C</b> عميل سريع</li>
  <li><b>Ctrl + Shift + A</b> مورد سريع</li>
  <li><b>Ctrl + Shift + U</b> ملخص الموردين</li>
  <li><b>Ctrl + Shift + E</b> إضافة مصروف (سند صرف)</li>
  <li><b>Ctrl + Shift + Q</b> إضافة قبض (سند قبض)</li>
  <li><b>Ctrl + Shift + M</b> ملخص المدفوعات</li>
  <li style="margin-top:8px;font-weight:700;list-style:none;">المبيعات:</li>
  <li><b>Ctrl + Shift + V</b> سجل المبيعات</li>
  <li><b>Ctrl + Shift + I</b> فاتورة جديدة (نقطة البيع)</li>
  <li><b>Ctrl + Shift + O</b> ملخص المبيعات</li>
  <li><b>Ctrl + Shift + R</b> مرتجع مبيعات</li>
  <li><b>Ctrl + Shift + B</b> تقارير المبيعات</li>
      <li><b>F2</b> تركيز على مربع بحث (حسب الصفحة)</li>
      <li><b>F3</b> توليد/تحديث باركود (في نموذج المنتج عند الوضع التلقائي)</li>
      <li><b>Ctrl + L</b> تسجيل خروج</li>
      <li><b>Ctrl + F</b> بحث عام (قريباً)</li>
      <li><b>Esc</b> رجوع إلى الرئيسية</li>
    </ul>
    <p class="small">قائمة مبدئية – أي اختصار جديد سيُضاف هنا.</p>
  </div>`;
}

function showHelp(){
  const view = document.getElementById('view');
  if(!view) return;
  view.dataset.mode='help';
  view.innerHTML = `<div class=\"section\"><div class=\"title mini\">المساعدة</div>
    <p>نظام أساس – للدعم الفني والتواصل:</p>
    <div style=\"background:#eef5fb;border:2px solid #0d4d92;border-radius:18px;padding:14px 18px;line-height:1.7;font-weight:700;max-width:420px;\">
      <div>واتساب الدعم: <span style=\"direction:ltr;display:inline-block;font-family:monospace;\">00967775458866</span></div>
      <div>البريد: <span style=\"direction:ltr;display:inline-block;font-family:monospace;\">fa1995hf@hotmail.com</span></div>
    </div>
    <p class=\"small\" style=\"margin-top:12px;\">سيتم إضافة دليل استخدام لاحقاً.</p>
  </div>`;
}

async function showHome(user, trialRemaining){
  const view = document.getElementById('view');
  view.dataset.mode = 'home';
  view.innerHTML = `<div class="icon-grid-wrapper"><div class="app-icons-grid" id="iconsGrid">${buildIconGrid()}</div></div>`;
  // ربط الأيقونات بالصفحات الجديدة
  const modToPage = {
    products: 'products.html',
    pos: 'pos.html',
    customers: 'customers.html',
  suppliers: 'suppliers.html',
    stores: 'warehouses.html',
    sales: 'sales.html',
    purchases: 'purchases.html',
  settings: 'settings.html',
  returnSales: 'sales.html#return-sale'
  , returnPurchase: 'purchases.html#return'
  , salesReports: 'reports-sales.html'
  };
  view.querySelectorAll('.app-icon').forEach(ic=>{
    ic.addEventListener('click', ()=>{
      const mod = ic.dataset.mod;
      if (modToPage[mod]) {
        window.location.href = modToPage[mod];
      } else {
        view.dataset.mode='module';
        showPlaceholder(mod);
      }
    });
    ic.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); ic.click(); }});
  });
}

function buildIconGrid(){
  // خريطة بتات الصلاحيات لكل وحدة
  const modulePerms = {
    pos:1,
    sales:1,
    returnSales:1,
    products:2,
    customers:4,
    suppliers:8,
    purchases:8,
    returnPurchase:8,
    salesReports:16,
    settings:32,
    stores:64
  };
  const perms = userPermissions();
  const allItems = [
    { mod:'pos', label:'نقطة بيع', icon:emojiIcon('pos') },
    { mod:'purchases', label:'المشتريات', icon:emojiIcon('purchases') },
    { mod:'sales', label:'المبيعات', icon:emojiIcon('sales') },
    { mod:'customers', label:'العملاء', icon:emojiIcon('customers') },
    { mod:'stores', label:'المخازن', icon:emojiIcon('stores') },
    { mod:'products', label:'المنتجات', icon:emojiIcon('products') },
    { mod:'suppliers', label:'الموردين', icon:emojiIcon('suppliers') },
    { mod:'returnSales', label:'مرتجع مبيعات', icon:emojiIcon('returnSales') },
    { mod:'returnPurchase', label:'مرجع مشتريات', icon:emojiIcon('returnPurchase') },
    { mod:'salesReports', label:'تقارير المبيعات', icon:emojiIcon('salesReports') },
    { mod:'settings', label:'الإعدادات', icon:emojiIcon('settings') }
  ];
  return allItems
    .filter(it=>{
      const bit = modulePerms[it.mod];
      if(!bit) return true; // إن لم يحدد (مستقبلاً)
      return (perms & bit)===bit;
    })
    .map(it=>`<div class="app-icon" data-mod="${it.mod}" role="button" tabindex="0" aria-label="${it.label}"><div class="app-emoji">${it.icon}</div><div class="app-label">${it.label}</div></div>`)
    .join('');
}

// buildStatTiles أزيلت لصالح buildIconGrid الأبسط

// التحقق من الصلاحية (بت واحد أو أكثر) قبل تنفيذ حدث
function ensurePermission(bit){
  const perms = userPermissions();
  return (perms & bit) === bit;
}

function emojiIcon(key){
  const map = { pos:'🛒', purchases:'📦', sales:'📈', customers:'👥', stores:'🗃', products:'🗂', settings:'⚙', returnSales:'🧾', returnPurchase:'📝', salesReports:'📊', finance:'💰', suppliers:'🚚' };
  const emoji = map[key] || '📌';
  return `<span class="tile-emoji" aria-hidden="true">${emoji}</span>`;
}

async function showSettings(user){
  const edition = await getMeta('edition');
  const view = document.getElementById('view');
  view.innerHTML = `<div class="section">
    <div class="title" style="font-size:20px;">الإعدادات</div>
    <div class="grid" style="max-width:420px;">
      <label>الإصدار الحالي: <strong>${edition === 'sa'? 'سعودي' : 'يمني'}</strong></label>
      <button class="btn" id="switchEdition">تغيير الإصدار</button>
    </div>
  </div>`;
  document.getElementById('switchEdition').onclick = async ()=>{
    await setMeta('edition', edition === 'sa'? 'ye':'sa');
    alert('تم التغيير، أعد تسجيل الدخول لتحديث الضبط.');
  };
}

async function init(){
  await ensureDefaultUser();
  ensureNavBase();
  let edition = await getMeta('edition');
  if(!edition){
    renderEditionSelection();
  } else {
    // إن وُجد مستخدم محفوظ في الجلسة نعيده مباشرة للوحة التحكم
    const savedUserJSON = sessionStorage.getItem('asas_user');
    if(savedUserJSON){
      try {
        const u = JSON.parse(savedUserJSON);
        checkActivationThenEnter(u);
        return;
      } catch(_){ /* fallback to login */ }
    }
    renderLogin();
  }
}

init();

function ensureNavBase(){
  try {
    let stack = JSON.parse(sessionStorage.getItem('nav_stack')||'[]');
    if(!Array.isArray(stack)) stack=[];
    // تأكد أن الصفحة الرئيسية index.html هي الأساس مرة واحدة فقط
    if(stack.length===0 || stack[0] !== 'index.html'){
      stack = ['index.html'];
      sessionStorage.setItem('nav_stack', JSON.stringify(stack));
    }
  } catch(_){ /* ignore */ }
}

// تفعيل الاختصارات العامة
function setupGlobalShortcuts(user){
  if(window.__shortcutsBound) return;
  window.__shortcutsBound = true;
  window.addEventListener('keydown', (e)=>{
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    const editable = e.target && (e.target.isContentEditable || ['input','textarea','select'].includes(tag));
    if(editable && !(e.ctrlKey && e.shiftKey)){
      if(!(e.ctrlKey && (e.key.toLowerCase()==='l' || e.key.toLowerCase()==='f')) && !['f2','f3'].includes(e.key.toLowerCase())) return;
    }
    if(e.ctrlKey && e.shiftKey){
      switch(e.key.toLowerCase()){
  case 'w': if(ensurePermission(64)){ e.preventDefault(); window.location.href='warehouses.html'; } break;
  case 'l': if(ensurePermission(64)){ e.preventDefault(); window.location.href='low-stock.html'; } break;
  case 't': if(ensurePermission(64)){ e.preventDefault(); window.location.href='warehouses.html#transfer'; } break;
  case 'g': if(ensurePermission(64)){ e.preventDefault(); window.location.href='transfer-log.html'; } break;
  case 'p': if(ensurePermission(2)){ e.preventDefault(); window.location.href='products.html'; } break;
  case 'c': if(ensurePermission(4)){ e.preventDefault(); quickAddCustomer(); } break;
  case 'a': if(ensurePermission(8)){ e.preventDefault(); quickAddSupplier(); } break; // مورد سريع
  case 'u': if(ensurePermission(8)){ e.preventDefault(); window.location.href='suppliers-overview.html'; } break; // ملخص الموردين
  case 'e': if(ensurePermission(1024)){ e.preventDefault(); window.location.href='report-expenses.html#add'; } break; // سند صرف
  case 'q': if(ensurePermission(1024)){ e.preventDefault(); window.location.href='payments-overview.html#add-receipt'; } break; // سند قبض
  case 'm': if(ensurePermission(1024)){ e.preventDefault(); window.location.href='payments-overview.html'; } break; // ملخص المدفوعات
  case 'v': if(ensurePermission(1)){ e.preventDefault(); window.location.href='sales.html'; } break; // سجل المبيعات
  case 'i': if(ensurePermission(1)){ e.preventDefault(); window.location.href='pos.html'; } break; // فاتورة/نقطة بيع
  case 'o': if(ensurePermission(1)){ e.preventDefault(); window.location.href='sales-overview.html'; } break; // ملخص المبيعات
  case 'r': if(ensurePermission(1)){ e.preventDefault(); window.location.href='sales.html#return-sale'; } break; // مرتجع مبيعات
  case 'b': if(ensurePermission(16)){ e.preventDefault(); window.location.href='reports-sales.html'; } break; // تقارير المبيعات
      }
    } else if(!e.ctrlKey && !e.altKey){
      // وظائف F2 / F3 العامة
      if(e.key === 'F2'){
        const activeSearch = document.querySelector('#searchBox, input[type="search"]');
        if(activeSearch){ e.preventDefault(); activeSearch.focus(); activeSearch.select && activeSearch.select(); }
      } else if(e.key === 'F3'){
        // في نموذج المنتج: توليد باركود جديد إن كان الوضع تلقائي
        const bc = document.getElementById('f_barcode');
        const autoMode = document.querySelector('input[name="barcode_mode"][value="auto"]');
        if(bc && autoMode && autoMode.checked){ e.preventDefault(); bc.value = 'P'+Math.random().toString(36).slice(2,10).toUpperCase(); }
      }
    }
    if(e.ctrlKey && !e.shiftKey){
      switch(e.key.toLowerCase()){
        case 'l': e.preventDefault(); sessionStorage.removeItem('asas_user'); renderLogin(); break;
        case 'f': e.preventDefault(); alert('ميزة البحث العام قادمة قريباً'); break;
      }
    } else if(e.key === 'Escape'){
      const view = document.getElementById('view');
      if(view && view.dataset.mode !== 'home') showHome(user);
    }
  });
}
