// ربط أزرار النسخ الاحتياطي والتصدير والاستيراد
document.addEventListener('DOMContentLoaded', function() {
  // اختيار مجلد النسخ الاحتياطي
  const chooseBtn = document.getElementById('chooseBackupFolder');
  if(chooseBtn) {
    chooseBtn.addEventListener('click', async ()=>{
      const res = await window.api.backupChooseDir();
      if(res && res.dir) {
        document.getElementById('backupPath').value = res.dir;
        window.api.settingSet('backup_path', res.dir);
        alert('تم اختيار المجلد بنجاح');
      }
    });
  }
  // تصدير البيانات
  const exportBtn = document.getElementById('exportDataBtn');
  if(exportBtn) {
    exportBtn.addEventListener('click', async ()=>{
      const res = await window.api.exportData();
      if(res && res.ok) alert('تم تصدير البيانات بنجاح');
      else alert('فشل التصدير');
    });
  }
  // استيراد البيانات
  const importBtn = document.getElementById('importDataBtn');
  if(importBtn) {
    importBtn.addEventListener('click', async ()=>{
      const res = await window.api.importData();
      if(res && res.ok) alert('تم استيراد البيانات بنجاح');
      else alert('فشل الاستيراد أو بعض البيانات غير صالحة');
    });
  }
});
// settings.js (إصدار موسع مع تبويبات وحقول متعددة)

// إدارة تاريخ التصفح (سجل بسيط داخلي)
function pushNav(){
  try { const s=JSON.parse(sessionStorage.getItem('nav_stack')||'[]'); const cur=location.pathname.split('/').pop(); if(s[s.length-1]!==cur){ s.push(cur); sessionStorage.setItem('nav_stack', JSON.stringify(s)); } } catch(_){ }
}
function popNav(){
  try { let s=JSON.parse(sessionStorage.getItem('nav_stack')||'[]'); s.pop(); sessionStorage.setItem('nav_stack', JSON.stringify(s)); const prev=s[s.length-1]; location.href = prev? prev : 'index.html'; } catch(_){ location.href='index.html'; }
}
pushNav();

// تبويبات
const tabsList = document.getElementById('tabsList');
const panels = Array.from(document.querySelectorAll('.panel'));
function activateTab(name){
  tabsList.querySelectorAll('button').forEach(b=> b.classList.toggle('active', b.dataset.tab===name));
  panels.forEach(p=> p.classList.toggle('active', p.id==='panel-'+name));
  localStorage.setItem('settings_active_tab', name);
}
tabsList?.addEventListener('click', e=>{
  const btn = e.target.closest('button[data-tab]'); if(!btn) return; activateTab(btn.dataset.tab);
});

document.getElementById('backBtn')?.addEventListener('click', ()=> popNav());

// خريطة الحقول
const fieldMap = {
  app_lang:'appLang', date_format:'dateFormat',
  company_name:'companyName', company_phone:'companyPhone', company_address:'companyAddress', company_email:'companyEmail', company_description:'companyDescription',
  vat_number:'vatNumber', vat_rate:'vatRate', cr_number:'crNumber',
  stamp_image:'stampImageData',
  default_customer:'defaultCustomer', min_discount:'minDiscount', max_discount:'maxDiscount', invoice_format:'invoiceFormat', auto_print_after_sale:'autoPrintAfterSale', allow_negative_sale:'allowNegativeSale', invoice_footer_note:'invoiceFooterNote',
  backup_path:'backupPath', backup_keep:'backupKeep', backup_interval:'backupInterval', auto_backup:'autoBackup',
  // تم حذف حقول التنبيهات والمظهر
  // تمت إزالة الحقول (print_header / print_footer / paper_width / print_logo) والاكتفاء بالطابعة الافتراضية
  default_printer:'defaultPrinterSelect'
  , auto_logout_min:'autoLogoutMin', require_password_delete:'requirePasswordForDelete'
};

const defaults = {
  app_lang:'ar', date_format:'YYYY-MM-DD', vat_rate:'15', currency_code:'SAR', exchange_rate:'1',
  min_discount:'0', max_discount:'50', invoice_format:'INV-{YYYY}-{####}', backup_path:'backup/', backup_keep:'5', backup_interval:'24', auto_logout_min:'30', allow_negative_sale:'0'
};

function setFieldValue(key,val){
  const id = fieldMap[key]; if(!id) return; const el=document.getElementById(id); if(!el) return;
  if(el.type==='checkbox') el.checked = (val==='1'||val===1||val===true||val==='true'); else el.value = val ?? '';
}
function getFieldValue(key){
  const id = fieldMap[key]; const el=document.getElementById(id); if(!el) return '';
  if(el.type==='checkbox') return el.checked? '1':'0';
  return (el.value||'').trim();
}

async function loadSettings(){
  let map={};
  try {
    const r = await window.api.settingsList();
    if(r && r.ok){ r.rows.forEach(s=> map[s.key]= s.value); }
  } catch(_){ }
  // تعبئة
  Object.keys(fieldMap).forEach(k=> setFieldValue(k, map[k] ?? defaults[k] ?? ''));
  // معلومات النظام
  try { const info= await window.api.appInfo(); if(info && info.ok){ const vEl=document.getElementById('appVersion'); const dEl=document.getElementById('dbSize'); if(vEl) vEl.textContent=info.version; if(dEl) dEl.textContent=formatBytes(info.dbSize); } } catch(_){ }
  applyTheme();
}

function formatBytes(b){ if(!b) return '0 KB'; const u=['B','KB','MB','GB']; let i=0; while(b>=1024 && i<u.length-1){ b/=1024; i++; } return b.toFixed(i?2:0)+' '+u[i]; }

const sectionGroups = {
  company:['company_name','company_phone','company_address','company_email','company_description','vat_number','cr_number','vat_rate','stamp_image'],
  sales:['default_customer','min_discount','max_discount','invoice_format','auto_print_after_sale','allow_negative_sale','invoice_footer_note'],
  backup:['backup_path','backup_keep','backup_interval','auto_backup'],
  // حُذفت notifications و appearance
  // مجموعة الطباعة تشمل الآن الطابعة الافتراضية
  // قسم الطباعة الآن يحتوي فقط على الطابعة الافتراضية
  printing:['default_printer'],
  security:['auto_logout_min','require_password_delete'],
  system:['app_lang','date_format'],
  employees:[]
};

function collectSection(sec){
  const keys = sectionGroups[sec]||[]; const data={}; keys.forEach(k=> data[k]=getFieldValue(k)); return data;
}

async function saveSection(sec){
  if(sec==='employees'){ return; }
  const data = collectSection(sec);
  try { await window.api.settingSetMulti(data); alert('تم حفظ قسم: '+sec); } catch(_){ alert('فشل الحفظ'); }
  // تخزين سريع في localStorage لاستخدامه في الطباعة الحرارية (بدون إعادة استعلام)
  if(sec==='sales'){
    try { if(data.invoice_footer_note!==undefined) localStorage.setItem('setting_invoice_footer_note', data.invoice_footer_note||''); } catch(_){ }
  }
}

async function saveAll(){
  const merged={}; Object.keys(sectionGroups).forEach(sec=>{ if(sec!=='account') Object.assign(merged, collectSection(sec)); });
  try { await window.api.settingSetMulti(merged); alert('تم حفظ جميع الإعدادات'); } catch(_){ alert('فشل حفظ الكل'); }
}

// applyTheme أزيل مع إزالة قسم المظهر

document.addEventListener('click', e=>{
  const saveBtn = e.target.closest('button[data-save]');
  if(saveBtn){ saveSection(saveBtn.getAttribute('data-save')); }
  // قسم المظهر محذوف
});

// التقاط صورة الختم وتحويلها Base64
const stampPicker = document.getElementById('stampImagePicker');
if(stampPicker){
  stampPicker.addEventListener('change', ev=>{
    const file = ev.target.files && ev.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      const base64 = reader.result;
      const hidden = document.getElementById('stampImageData');
      if(hidden) hidden.value = base64;
      const prev = document.getElementById('stampPreview');
      if(prev) prev.innerHTML = '<img src="'+base64+'" alt="stamp" />';
    };
    reader.readAsDataURL(file);
  });
}


document.getElementById('saveAll')?.addEventListener('click', saveAll);
document.getElementById('reloadSettings')?.addEventListener('click', loadSettings);
document.getElementById('resetSettings')?.addEventListener('click', async ()=>{
  if(!confirm('إعادة ضبط الإعدادات؟')) return;
  const data={}; Object.keys(fieldMap).forEach(k=> data[k]= defaults[k] ?? '');
  try { await window.api.settingSetMulti(data); await loadSettings(); alert('تمت إعادة الضبط'); } catch(_){ alert('فشل إعادة الضبط'); }
});

// تفعيل التبويب السابق
const lastTab = localStorage.getItem('settings_active_tab'); if(lastTab) activateTab(lastTab);

loadSettings();

// حراسة تبويب الموظفين حسب صلاحية 256
function currentUserPerms(){ try { const u = JSON.parse(sessionStorage.getItem('asas_user')||'null'); return u && u.permissions? (u.permissions>>>0):0; } catch(_){ return 0; } }
function has(bit){ return (currentUserPerms() & bit)===bit; }
// إخفاء تبويب الموظفين إذا لا صلاحية
document.addEventListener('DOMContentLoaded', ()=>{
  if(!has(256)){
    const btn = document.querySelector('.tab-employees-guard'); if(btn) btn.style.display='none';
    const panel = document.getElementById('panel-employees'); if(panel) panel.innerHTML='<div class="info-box">لا تملك صلاحية عرض إدارة المستخدمين</div>';
  }
});

// ----- الطابعات -----
async function loadPrinters(){
  try {
    const sel = document.getElementById('defaultPrinterSelect'); if(!sel) return;
    sel.innerHTML = '<option value="">تحميل...</option>';
    const r = await window.api.listPrinters();
    if(!r || !r.ok){ sel.innerHTML='<option value="">تعذر التحميل</option>'; return; }
    const current = getFieldValue('default_printer');
    sel.innerHTML = '<option value="">(استخدام حوار النظام)</option>' + r.printers.map(p=> `<option value="${p.name.replace(/"/g,'&quot;')}">${p.name}${p.isDefault?' •':''}</option>`).join('');
    if(current){ sel.value = current; }
    sel.addEventListener('change', ()=>{
      // يخزن مؤقتاً في الحقل (لن يُحفظ نهائياً إلا عند الضغط حفظ تبويب الطباعة)
    });
  } catch(_){ }
}

document.getElementById('refreshPrintersBtn')?.addEventListener('click', loadPrinters);
// تحميل بعد الإعدادات لضمان قراءة القيمة الحالية
setTimeout(loadPrinters, 600);

// ===== إدارة الموظفين والصلاحيات =====
let __empEditingId = null;
async function loadEmployees(){
  try {
    const tbody = document.querySelector('#empTable tbody'); if(!tbody) return;
    const r = await window.api.listUsers(); if(!r.ok){ tbody.innerHTML='<tr><td colspan="6">فشل التحميل</td></tr>'; return; }
    // نحتاج أيضاً الأدوار لمعرفة صلاحيات الدور إن أمكن (مستقبلًا)
    const roles = await window.api.rolesList().catch(()=>({ok:false, rows:[]}));
    const roleMap = {}; if(roles.ok) roles.rows.forEach(x=> roleMap[x.id]=x);
    tbody.innerHTML = r.rows.map(u=>{
      const rObj = Object.values(roleMap).find(rr=> rr.name===u.role) || null;
      const perms = rObj? (rObj.permissions>>>0) : 0;
  return `<tr data-id="${u.id}" data-username="${u.username}" data-perms="${perms}" data-role="${u.role||''}"><td>${u.id}</td><td>${u.username}</td><td>${u.role||''}</td><td>${u.active? 'نعم':'لا'}</td><td>${perms}</td><td><button type='button' class='mini-btn load-emp'>تحميل</button> <button type='button' class='mini-btn outline del-emp'>حذف</button></td></tr>`;
    }).join('');
  } catch(err){ console.warn('emp load err', err); }
}
function resetEmpForm(){
  __empEditingId=null;
  const u=document.getElementById('empUsername'); if(u) u.value='';
  const p=document.getElementById('empPassword'); if(p) p.value='';
  const a=document.getElementById('empActive'); if(a) a.value='1';
  document.querySelectorAll('#panel-employees input.perm').forEach(cb=> cb.checked=false);
}
async function saveEmp(){
  if(!has(256)) { alert('ممنوع: لا تملك صلاحية إدارة المستخدمين'); return; }
  const username = document.getElementById('empUsername')?.value.trim();
  const password = document.getElementById('empPassword')?.value;
  const active = document.getElementById('empActive')?.value==='1';
  let permMask=0; document.querySelectorAll('#panel-employees input.perm:checked').forEach(cb=>{ const bit=parseInt(cb.dataset.bit); if(bit) permMask|=bit; });
  if(!username){ alert('اسم المستخدم مطلوب'); return; }
  try {
    if(__empEditingId){
      const data = { active, permissions: permMask };
      if(password) data.password = password;
      const r = await window.api.userUpdate(__empEditingId, data);
      if(!r.ok) return alert(r.msg||'فشل تحديث');
      alert('تم التحديث');
    } else {
      if(!password) return alert('أدخل الرقم السري');
      const r = await window.api.userAdd({ username, password, permissions: permMask, active });
      if(!r.ok) return alert(r.msg||'فشل الإضافة');
      alert('تمت الإضافة');
    }
    await loadEmployees();
    resetEmpForm();
  } catch(err){ alert('خطأ: '+ (err.message||'')); }
}
document.addEventListener('click', e=>{
  if(e.target && e.target.id==='btnAddEmp'){ saveEmp(); }
  if(e.target && e.target.id==='btnResetEmpForm'){ resetEmpForm(); }
  if(e.target && e.target.classList && e.target.classList.contains('load-emp')){
    const tr = e.target.closest('tr[data-id]'); if(!tr) return;
    __empEditingId = parseInt(tr.dataset.id);
    document.getElementById('empUsername').value = tr.children[1].textContent;
    document.getElementById('empPassword').value='';
    document.getElementById('empActive').value = tr.children[3].textContent==='نعم'?'1':'0';
    const perms = parseInt(tr.dataset.perms)||0;
    document.querySelectorAll('#panel-employees input.perm').forEach(cb=>{ const bit=parseInt(cb.dataset.bit); cb.checked = (perms & bit)===bit; });
  }
  if(e.target && e.target.classList && e.target.classList.contains('del-emp')){
    (async ()=>{
      const tr = e.target.closest('tr[data-id]'); if(!tr) return;
      const id = parseInt(tr.dataset.id); const uname = tr.dataset.username;
      if(uname==='manager'){ alert('لا يمكن حذف المدير'); return; }
      if(!confirm('حذف المستخدم '+uname+'؟')) return;
      const r = await window.api.userDelete(id);
      if(!r.ok){ alert(r.msg||'فشل الحذف'); return; }
      alert('تم الحذف');
      if(__empEditingId===id) resetEmpForm();
      loadEmployees();
    })();
  }
});
// تحميل الموظفين عند فتح تبويبهم لأول مرة
const tabsEl = document.getElementById('tabsList');
tabsEl?.addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-tab]'); if(!btn) return;
  if(btn.dataset.tab==='employees') setTimeout(loadEmployees, 50);
});

