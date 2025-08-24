// customers.js إدارة متقدمة للعملاء
// تحميل – بحث لحظي – إضافة – تعديل – حذف

const tbody = document.getElementById('customersTbody');
const searchInput = document.querySelector('.search-wrap input');
const btnAdd = document.getElementById('btnAddCustomer');
const btnCustomerStatement = document.getElementById('btnCustomerStatement');
let stmtPanel = document.getElementById('customerStatementPanel');
let stmtSearch = document.getElementById('custStmtSearch');
let stmtSuggestBox = document.getElementById('custStmtSuggest');
let stmtStart = document.getElementById('custStmtStart');
let stmtEnd = document.getElementById('custStmtEnd');
let stmtLoadBtn = document.getElementById('custStmtLoad');
let stmtCloseBtn = document.getElementById('custStmtClose');
// تغيير const إلى let للسماح بإعادة التعيين عند الإنشاء الديناميكي
let stmtBody = document.getElementById('custStmtBody');
let stmtSummary = document.getElementById('custStmtSummary');
let stmtCustomerLabel = document.getElementById('custStmtCustomerLabel');
let stmtHeaderBox = document.getElementById('custStmtHeader');
let stmtSearchOverlay = document.getElementById('custStmtSearchOverlay');
let stmtSearchInputSmall = document.getElementById('custStmtSearchInput');
let stmtSearchSugSmall = document.getElementById('custStmtSearchSuggest');
let stmtSearchCloseSmall = document.getElementById('custStmtSearchClose');
const modal = document.getElementById('customerModal');
const form = document.getElementById('customerForm');
const saveBtn = document.getElementById('custSaveBtn');
const cancelBtn = document.getElementById('custCancelBtn');
const typeButtons = document.querySelectorAll('.type-switch button');
const backBtn = document.getElementById('backBtn');
let customers = [];
let editingId = null; // null = إضافة جديد
let currentType = 'person';

// تشغيل البحث
searchInput.removeAttribute('disabled');
// الاعتماد على navigation.js
if(backBtn){ backBtn.addEventListener('click', ()=> window.appNav && window.appNav.goBack()); }

function openModal(){modal.style.display='flex';}
function closeModal(){modal.style.display='none';clearErrors();}

function setType(t){
  currentType=t;typeButtons.forEach(b=>b.classList.toggle('active',b.dataset.type===t));
  document.querySelectorAll('.name-field').forEach(f=>f.classList.add('hidden'));
  if(t==='person') document.querySelector('[data-role="person"]').classList.remove('hidden');
  if(t==='est') document.querySelector('[data-role="est"]').classList.remove('hidden');
  if(t==='company') document.querySelector('[data-role="company"]').classList.remove('hidden');
  const showNat = (t==='est' || t==='company');
  document.querySelectorAll('.est-only').forEach(el=>{ showNat? el.classList.remove('hidden'): el.classList.add('hidden'); });
  document.querySelectorAll('.addr-field').forEach(el=>{ showNat? el.classList.remove('hidden'): el.classList.add('hidden'); });
}
typeButtons.forEach(btn=>btn.addEventListener('click',()=>setType(btn.dataset.type)));


// جلب العملاء (تصحيح: استلام { ok, rows } بدل وضع الكائن الكامل في المصفوفة)
async function loadCustomers(){
  try {
    const filter = searchInput.value.trim();
    const res = await window.api.customersList(filter);
    if(res && typeof res === 'object' && 'ok' in res){
      if(res.ok && Array.isArray(res.rows)){
        customers = res.rows;
      } else {
        console.warn('استجابة العملاء غير صالحة أو فاشلة:', res);
        customers = [];
      }
    } else if(Array.isArray(res)) { // احتياط لو أعيدت مباشرة كمصفوفة
      customers = res;
    } else {
      console.error('بنية غير متوقعة لاستجابة customersList:', res);
      customers = [];
    }
    renderTable();
  } catch(err){
    console.error('خطأ في جلب العملاء:', err);
    customers = [];
    renderTable();
  }
}

function renderTable(){
  const t0 = performance.now();
  tbody.innerHTML='';
  if(!Array.isArray(customers) || customers.length===0) return;
  const total = customers.length;
  const BATCH = 500; // حجم دفعة
  let index = 0;
  function appendBatch(){
    const startBatch = performance.now();
    let html='';
    for(let i=0;i<BATCH && index<total;i++,index++){
      const c = customers[index];
      html += `<tr><td>${c.name||''}</td><td>${c.phone||''}</td><td>${c.vat||''}</td><td>${c.account_type||'نقد'}</td><td><button class="actions-btn" data-id="${c.id}">…</button></td></tr>`;
    }
    tbody.insertAdjacentHTML('beforeend', html);
    const dur = performance.now()-startBatch;
    if(dur>40) console.warn('[CUST-PERF] batch render slow ms=', dur.toFixed(1), 'index', index,'/',total);
    if(index < total){
      // إعطاء المتصفح فرصة للرسم
      requestAnimationFrame(()=> setTimeout(appendBatch, 0));
    } else {
      console.log('[CUST-PERF] full table render ms=', (performance.now()-t0).toFixed(1),'rows=', total);
    }
  }
  appendBatch();
}

// قائمة سياق مصغرة للزر … عند الضغط: تعديل / حذف
tbody.addEventListener('click',(e)=>{
  const btn=e.target.closest('button.actions-btn');
  if(!btn) return;
  const id=+btn.dataset.id; const cust=customers.find(c=>c.id===id); if(!cust) return;
  showActionsPopup(btn,cust);
});

let popupEl=null;
function showActionsPopup(anchor,cust){
  hidePopup();
  popupEl=document.createElement('div');
  popupEl.style.position='absolute';
  popupEl.style.background='rgba(255,255,255,0.95)';
  popupEl.style.border='1px solid #1976d2';
  popupEl.style.padding='6px 8px';
  popupEl.style.borderRadius='10px';
  popupEl.style.fontSize='13px';
  popupEl.style.display='flex';
  popupEl.style.flexDirection='column';
  popupEl.style.gap='6px';
  popupEl.innerHTML=`<button data-act="edit" style="cursor:pointer;border:0;background:#e3f2fd;padding:6px 10px;border-radius:8px;font-weight:700;">تعديل</button><button data-act="statement" style="cursor:pointer;border:0;background:#f1ffe3;color:#1b5e20;padding:6px 10px;border-radius:8px;font-weight:700;">كشف</button><button data-act="delete" style="cursor:pointer;border:0;background:#ffebee;color:#b71c1c;padding:6px 10px;border-radius:8px;font-weight:700;">حذف</button>`;
  document.body.appendChild(popupEl);
  const rect=anchor.getBoundingClientRect();
  popupEl.style.top=(rect.bottom+window.scrollY+4)+'px';
  popupEl.style.left=(rect.left+window.scrollX-40)+'px';
  popupEl.addEventListener('click',ev=>{
    const act=ev.target.getAttribute('data-act');
  if(act==='edit'){ beginEdit(cust); }
  else if(act==='statement'){ openStatementForCustomer(cust); }
  else if(act==='delete'){ confirmDelete(cust); }
  });
  document.addEventListener('click',docHandler,true);
  function docHandler(ev){ if(!popupEl.contains(ev.target) && ev.target!==anchor){ hidePopup(); document.removeEventListener('click',docHandler,true);} }
}
function hidePopup(){ if(popupEl){ popupEl.remove(); popupEl=null; } }

function beginEdit(cust){ hidePopup(); editingId=cust.id; openModal(); setType(cust.type||'person');
  form.querySelector('#custPersonName').value = cust.type==='person'? (cust.name||'') : '';
  form.querySelector('#custEstName').value = cust.type==='est'? (cust.name||'') : '';
  form.querySelector('#custCompName').value = cust.type==='company'? (cust.name||'') : '';
  form.querySelector('#custMobile').value = cust.phone||'';
  form.querySelector('#custWhatsapp').value = cust.whatsapp||'';
  form.querySelector('#custEmail').value = cust.email||'';
  form.querySelector('#custVat').value = cust.vat||'';
  form.querySelector('#custCR').value = cust.cr||'';
  form.querySelector('#custStartDate').value = cust.start_date||'';
  form.querySelector('#addrCity').value = cust.city||'';
  form.querySelector('#addrDistrict').value = cust.district||'';
  form.querySelector('#addrStreet').value = cust.street||'';
  form.querySelector('#addrZip').value = cust.zip||'';
  form.querySelector('#addrBuilding').value = cust.building||'';
  form.querySelector('#addrShort').value = cust.short_address||'';
  form.querySelector('#addrExtra').value = cust.addr_extra||'';
  form.querySelector('#custPoints').value = cust.loyalty_points||0;
  form.querySelector('#custNotes').value = cust.notes||'';
  document.getElementById('customerModalTitle').textContent='تعديل عميل';
}

function confirmDelete(cust){ hidePopup(); if(!confirm(`هل تريد حذف العميل ${cust.name}?`)) return; window.api.customerDelete(cust.id).then(r=>{ if(r.ok){ loadCustomers(); } }); }

function clearForm(){ form.reset(); editingId=null; document.getElementById('customerModalTitle').textContent='إضافة عميل'; form.querySelector('#custPoints').value='0'; }
function clearErrors(){ form.querySelectorAll('.error-field').forEach(el=>{ el.classList.remove('error-field'); el.style.boxShadow=''; el.style.borderColor=''; }); }

function validate(){ clearErrors();
  const req=[]; if(currentType==='person'){ req.push(['#custPersonName','اسم العميل']); req.push(['#custVat','الرقم الضريبي']); }
  else if(currentType==='est' || currentType==='company'){
    const nameSel = currentType==='est'? '#custEstName':'#custCompName';
    req.push([nameSel, currentType==='est'? 'اسم المؤسسة':'اسم الشركة']);
    ['#custWhatsapp','#custVat','#custCR','#custStartDate','#addrShort','#addrExtra','#addrStreet','#addrDistrict','#addrBuilding','#addrZip','#addrCity'].forEach(sel=> req.push([sel,'مطلوب']));
  }
  let ok=true; req.forEach(([sel,label])=>{ const el=form.querySelector(sel); if(!el.value.trim()){ ok=false; el.classList.add('error-field'); el.style.borderColor='#d32f2f'; el.style.boxShadow='0 0 0 2px rgba(211,47,47,.35)'; }}); return ok; }

function gatherData(){
  let name=''; if(currentType==='person') name=form.querySelector('#custPersonName').value.trim();
  if(currentType==='est') name=form.querySelector('#custEstName').value.trim();
  if(currentType==='company') name=form.querySelector('#custCompName').value.trim();
  return {
    name,
    type: currentType,
    phone: form.querySelector('#custMobile').value.trim(),
    whatsapp: form.querySelector('#custWhatsapp').value.trim(),
    email: form.querySelector('#custEmail').value.trim(),
    vat: form.querySelector('#custVat').value.trim(),
    cr: form.querySelector('#custCR').value.trim(),
    start_date: form.querySelector('#custStartDate').value.trim(),
    city: form.querySelector('#addrCity').value.trim(),
    district: form.querySelector('#addrDistrict').value.trim(),
    street: form.querySelector('#addrStreet').value.trim(),
    zip: form.querySelector('#addrZip').value.trim(),
    building: form.querySelector('#addrBuilding').value.trim(),
    short_address: form.querySelector('#addrShort').value.trim(),
    addr_extra: form.querySelector('#addrExtra').value.trim(),
    loyalty_points: parseInt(form.querySelector('#custPoints').value)||0,
    notes: form.querySelector('#custNotes').value.trim(),
    address: '', // عنوان مركب يمكن بناؤه لاحقاً
    account_type: 'نقد',
    balance: 0
  };
}

saveBtn.addEventListener('click',async ()=>{
  if(!validate()) return;
  const data=gatherData();
  try {
    if(editingId){ 
      const r=await window.api.customerUpdate(editingId,data); 
      if(r.ok){ 
        closeModal(); 
        clearForm(); 
        loadCustomers(); 
      } 
    } else { 
      const r=await window.api.customerAdd(data); 
      if(r.ok){ 
        closeModal(); 
        clearForm(); 
        loadCustomers(); 
      } 
    }
  } catch(err) {
    console.error('خطأ في حفظ العميل:', err);
    alert('حدث خطأ أثناء حفظ العميل: ' + err.message);
  }
});

cancelBtn.addEventListener('click',()=>{ closeModal(); clearForm(); });
btnAdd.addEventListener('click',()=>{ clearForm(); setType('person'); openModal(); });

// بحث لحظي
searchInput.addEventListener('input', debounce(()=>{ loadCustomers(); }, 250));

// إغلاق بالهروب
window.addEventListener('keydown',e=>{ if(e.key==='Escape' && modal.style.display==='flex'){ closeModal(); }});

loadCustomers();
// تهيئة مسبقة للأداء (تحميل عناصر وخدمات قبل أول فتح كشف حساب)
setTimeout(()=>{
  const t0 = performance.now();
  try { ensureStatementElements(); } catch(e){ console.warn('stmt prewarm fail', e); }
  const dt = performance.now()-t0;
  console.log('[CUST-STMT] prewarm DOM ms=', dt.toFixed(1));
}, 700);
setTimeout(async ()=>{
  try { const t1 = performance.now(); await window.api.customerReport({ customer_id:-9999, start:null, end:null }); console.log('[CUST-STMT] prewarm dummy report ms=', (performance.now()-t1).toFixed(1)); } catch(_){}
}, 1300);

// ===== كشف حساب عميل (لوحة) =====
let __stmtFirstBuilt=false;
function openStatementPanel(){
  const t0 = performance.now();
  ensureStatementElements();
  if(stmtPanel){ stmtPanel.style.display='flex'; void stmtPanel.offsetHeight; }
  if(!__stmtFirstBuilt){
    __stmtFirstBuilt=true;
    const dt = performance.now()-t0;
    console.log('[CUST-STMT] initial open ms=', dt.toFixed(1));
    if(dt>150) console.warn('[CUST-STMT] تأخر الفتح الأول >150ms: قلل DOM أو طبق lazy للجدول');
  }
  // إصلاح عدم ظهور/تجمّد حقل البحث في الفتحات اللاحقة
  reinitStatementSearchField();
}

function reinitStatementSearchField(){
  try {
    stmtSearch = document.getElementById('custStmtSearch');
    if(!stmtSearch){ console.warn('[CUST-STMT] search input not found for reinit'); return; }
    // إزالة أي مستمع سابق مكرر (سنستخدم علامة)
    // تشخيص العناصر التي قد تحجب الأحداث فوق الحقل
    const blockers = [];
    const rect = stmtSearch.getBoundingClientRect();
    const elAtPoint = document.elementFromPoint(rect.left+5, rect.top+5);
    if(elAtPoint && elAtPoint!==stmtSearch && !stmtSearch.contains(elAtPoint)){
      blockers.push(elAtPoint);
    }
    if(blockers.length){
      console.warn('[CUST-STMT] blockers فوق حقل البحث:', blockers.map(b=> b.className||b.id||b.tagName));
      blockers.forEach(b=>{ b.style.pointerEvents='none'; b.style.opacity='0.15'; });
    }
    if(!stmtSearch.__reinit){
      // ضمان أن الطبقة فوق لا تحجب (z-index)
      stmtSearch.style.position='relative';
      stmtSearch.style.zIndex='2';
      // إصلاح احتمال overlay شفاف يغطي المدخل
      if(stmtPanel){
        stmtPanel.querySelectorAll('.stmt-loader').forEach(b=> b.remove());
      }
      // إعادة بناء قائمة الاقتراح إن لزم
      stmtSuggestBox = document.getElementById('custStmtSuggest');
      if(stmtSuggestBox){ stmtSuggestBox.style.display='none'; }
      // إجبار إعادة الطلاء
      stmtSearch.style.willChange='transform';
      requestAnimationFrame(()=>{ stmtSearch.style.transform='translateZ(0)'; });
      // ضبط تركيز بعد رسمين لضمان جاهزية
      setTimeout(()=>{ try { stmtSearch.focus(); stmtSearch.select(); } catch(_){} }, 40);
      stmtSearch.__reinit=true;
    } else {
      // في الفتحات التالية فقط ضمان التركيز
      setTimeout(()=>{ try { stmtSearch.focus(); } catch(_){} }, 40);
    }
    // زر سريع لإعادة تنشيط الحقل في حال توقف (للاختبار)
    if(!document.getElementById('stmtSearchFixBtn')){
      const fixBtn=document.createElement('button');
      fixBtn.id='stmtSearchFixBtn';
      fixBtn.textContent='🔄 تنشيط حقل العميل';
      fixBtn.style.cssText='position:absolute;top:4px;left:4px;background:#ffc107;color:#000;font-size:11px;padding:4px 8px;border-radius:8px;border:1px solid #000;cursor:pointer;z-index:5;';
      fixBtn.onclick=()=>{ stmtSearch.blur(); setTimeout(()=>{ stmtSearch.value=''; stmtSearchSuggestCleanup(); stmtSearch.focus(); },10); };
      if(stmtPanel) stmtPanel.appendChild(fixBtn);
    }
  } catch(err){ console.warn('[CUST-STMT] reinit error', err); }
}

function stmtSearchSuggestCleanup(){ try { if(stmtSuggestBox){ stmtSuggestBox.innerHTML=''; stmtSuggestBox.style.display='none'; } } catch(_){}}
function closeStatementPanel(){ if(stmtPanel) stmtPanel.style.display='none'; }

btnCustomerStatement && btnCustomerStatement.addEventListener('click', ()=>{ openStatementPanel(); openSmallSearch(); });
stmtCloseBtn && stmtCloseBtn.addEventListener('click', closeStatementPanel);
if(stmtPanel){ stmtPanel.addEventListener('mousedown', e=>{ if(e.target===stmtPanel) closeStatementPanel(); }); }

let stmtSelectedCustomer = null; // كائن العميل المختار
// كاش بيانات عمليات العميل المدمجة
let stmtOpsCache = [];

// ===== دوال جلب من قاعدة البيانات (عبر preload IPC) =====
async function fetchCustomerCore(id){
  // لا يوجد customerGet مستقل لذلك نستخدم customersList ونرشّح
  try {
    const res = await window.api.customersList('');
    if(res && res.ok && Array.isArray(res.rows)) return res.rows.find(c=> c.id===id) || null;
    if(Array.isArray(res)) return res.find(c=> c.id===id) || null;
  } catch(_){}
  return null;
}
async function fetchCustomerSales(customer_id, start, end){
  try {
    const rep = await window.api.customerReport({ customer_id, start: start||null, end: end||null });
    if(rep.ok) return rep.data.recentSales || [];
  } catch(_){ }
  return [];
}
async function fetchCustomerDebtsAndPayments(cust){
  // لا توجد دوال منفصلة في preload، نعيد حالياً مصفوفات فارغة (يمكن ربطها لاحقاً بـ customerStatement)
  try {
    const st = await window.api.customerStatement? await window.api.customerStatement({ customer_id: cust.id }): null;
    if(st && st.ok){
      const d = st.data || st; // حسب طبقة الاسترجاع
      return { debts: d.debts||[], payments: d.payments||[] };
    }
  } catch(_){ }
  return { debts: [], payments: [] };
}
async function fetchCustomerReturns(customer_id, start, end){
  // مرتجعات المبيعات غير متاحة مباشرة حسب العميل في الواجهة الحالية؛ نفلتر sale_returns لاحقاً لو توفرت في كاش عام
  const out=[]; try {
    if(window.saleReturnsCache && Array.isArray(window.saleReturnsCache)){
      window.saleReturnsCache.forEach(r=>{ if(r.customer_id===customer_id) out.push(r); });
    }
  } catch(_){ }
  return out;
}

async function buildUnifiedStatementOps(customer_id, start, end){
  const cust = await fetchCustomerCore(customer_id); if(!cust) return [];
  const sales = await fetchCustomerSales(customer_id, start, end);
  const { debts, payments } = await fetchCustomerDebtsAndPayments(cust);
  const returns = await fetchCustomerReturns(customer_id, start, end);
  const ops=[];
  sales.forEach(s=> ops.push({ type:'SALE', id:s.id, invoice:s.invoice_no||'', date:s.created_at||s.date||'', net: +(s.total||0), vat:+(s.vat||0), discount:+(s.discount||0), paid:+(s.paid||0), remain: (s.total||0)-(s.paid||0) }));
  debts.forEach(d=> ops.push({ type:'DEBT', id:d.id, invoice:'دين', date:d.date||'', net:+(d.amount||0), vat:0, discount:0, paid:+(d.paid_amount||0), remain: (d.amount||0)-(d.paid_amount||0) }));
  payments.forEach(p=> ops.push({ type:'PAYMENT', id:p.id, invoice:'سداد', date:p.date||'', net:-Math.abs(p.amount||0), vat:0, discount:0, paid:p.amount||0, remain:0 }));
  returns.forEach(r=> ops.push({ type:'RETURN', id:r.id, invoice:'مرتجع', date:r.created_at||'', net:-Math.abs(r.amount||0), vat:0, discount:0, paid:0, remain:0 }));
  // فلترة التاريخ إن لم تُطبق داخلياً
  if(start){ ops.splice(0, ops.length, ...ops.filter(o=> (o.date||'').slice(0,10) >= start)); }
  if(end){ ops.splice(0, ops.length, ...ops.filter(o=> (o.date||'').slice(0,10) <= end)); }
  ops.sort((a,b)=> (a.date||'').localeCompare(b.date||''));
  let running=0;
  ops.forEach(o=>{ running += (o.remain!==0? o.remain : o.net); o.running = running; });
  return ops;
}

async function searchCustomersForStatement(q){
  try {
    const res = await window.api.customersList(q||'');
    if(res && res.ok && Array.isArray(res.rows)) return res.rows;
    if(Array.isArray(res)) return res; // احتياط
    return [];
  } catch { return []; }
}

function pickStatementCustomer(c){
  stmtSelectedCustomer = c;
  if(stmtCustomerLabel) stmtCustomerLabel.textContent = c.name + ' (ID ' + c.id + ')';
  if(stmtSearch) stmtSearch.value = c.id; // وضع رقم المعرف لتمييز ثابت
  if(stmtSuggestBox){ stmtSuggestBox.style.display='none'; stmtSuggestBox.innerHTML=''; }
  buildStatementHeader();
}

function buildStatementHeader(){
  if(!stmtHeaderBox) return;
  if(!stmtSelectedCustomer){ stmtHeaderBox.style.display='none'; stmtHeaderBox.innerHTML=''; return; }
  // بيانات المنشأة من window.companyProfile إن وُجدت (توقع هيكل { name, vat, cr })
  let compName='', compVat='', compCr='';
  try { const p = window.companyProfile || window.company || {}; compName = p.name||''; compVat = p.vat||p.vat_no||''; compCr = p.cr||p.cr_no||''; } catch(_){ }
  const cust = stmtSelectedCustomer;
  // الفترة (من - إلى)
  const start = stmtStart?.value || ''; const end = stmtEnd?.value || '';
  const period = (start||end)? `${start||'من البداية'} → ${end||'حتى الآن'}` : 'كل الفترات';
  stmtHeaderBox.innerHTML = `<div style="display:flex;flex-direction:column;gap:4px;">
    <div style="display:flex;flex-wrap:wrap;gap:18px;">
      <div><span style='opacity:.7;'>المنشأة:</span> ${compName||'-'}</div>
      <div><span style='opacity:.7;'>ضريبي:</span> ${compVat||'-'}</div>
      <div><span style='opacity:.7;'>سجل تجاري:</span> ${compCr||'-'}</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:18px;">
      <div><span style='opacity:.7;'>العميل:</span> ${cust.name||'-'}</div>
      <div><span style='opacity:.7;'>ضريبي العميل:</span> ${cust.vat||'-'}</div>
      <div><span style='opacity:.7;'>الفترة:</span> ${period}</div>
    </div>
  </div>`;
  stmtHeaderBox.style.display='block';
}

stmtSearch && stmtSearch.addEventListener('input', async ()=>{
  const _t0 = performance.now();
  const v = stmtSearch.value.trim();
  if(!v){ stmtSuggestBox.style.display='none'; stmtSuggestBox.innerHTML=''; stmtSelectedCustomer=null; if(stmtCustomerLabel) stmtCustomerLabel.textContent=''; return; }
  const list = await searchCustomersForStatement(v);
  const _t1 = performance.now();
  if(window.__custPerfMonEnable){ console.log(`[CUST-PERF] mainSearch q='${v}' results=${list.length} time=${(_t1-_t0).toFixed(1)}ms`); window.__lastCustomerSearchTime = _t1-_t0; }
  stmtSuggestBox.innerHTML='';
  list.slice(0,30).forEach(c=>{
    const b=document.createElement('button');
    b.type='button';
    b.style.cssText='text-align:right;padding:6px 8px;border:1px solid #0d47a1;background:#fff;border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;';
    b.textContent = `${c.id} | ${c.name}`;
    b.onclick=()=>{ pickStatementCustomer(c); loadStatement(); };
    stmtSuggestBox.appendChild(b);
  });
  stmtSuggestBox.style.display = stmtSuggestBox.innerHTML? 'flex':'none';
});

function formatDate(d){ if(!d) return '-'; return (d||'').replace('T',' ').slice(0,16); }
function classifySale(r){
  const m = (r.pay_method||'').toLowerCase();
  if(m==='cash' || m==='نقد' || m==='cash ') return 'كاش';
  if(m==='credit' || m==='آجل' || m==='credit ') return 'آجل';
  // fallback: حسب الفرق بين الإجمالي والمدفوع
  const total = +(r.total||0);
  const paid = +(r.paid||0);
  if(paid >= total - 0.01) return 'كاش';
  return 'آجل';
}

// استبدال الدالة القديمة ensureStatementElements بدالة موسعة تنشئ العناصر الناقصة
function ensureStatementElements(){
  // إن لم توجد اللوحة كاملة ننشئها
  let panel = stmtPanel || document.getElementById('customerStatementPanel');
  if(!panel){
    panel = document.createElement('div');
    panel.id = 'customerStatementPanel';
    panel.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:9999;justify-content:center;align-items:flex-start;padding:40px 30px;overflow:auto;direction:rtl;';
    document.body.appendChild(panel);
    stmtPanel = panel;
  }
  // وعاء المحتوى الداخلي (إن لم يوجد)
  let content = panel.querySelector('.cust-stmt-content');
  if(!content){
    content = document.createElement('div');
    content.className='cust-stmt-content';
    content.style.cssText='background:#fff;padding:18px 20px;border-radius:14px;min-width:820px;max-width:95%;box-shadow:0 6px 18px rgba(0,0,0,.2);display:flex;flex-direction:column;gap:10px;';
    panel.appendChild(content);
  }
  // شريط التحكم (بحث + تواريخ + أزرار)
  if(!panel.querySelector('#custStmtControls')){
    const bar=document.createElement('div');
    bar.id='custStmtControls';
    bar.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;background:#f5faff;padding:10px 12px;border:1px solid #1976d2;border-radius:12px;';
    bar.innerHTML = `
      <div style='display:flex;flex-direction:column;gap:4px;'>
        <label style='font-size:11px;font-weight:600;'>العميل</label>
        <input id="custStmtSearch" type="text" placeholder="رقم / اسم العميل" style="padding:6px 8px;border:1px solid #1976d2;border-radius:8px;min-width:180px;font-size:12px;" />
        <div id="custStmtSuggest" style="display:none;flex-direction:column;gap:4px;max-height:180px;overflow:auto;margin-top:4px;"></div>
      </div>
      <div style='display:flex;flex-direction:column;gap:4px;'>
        <label style='font-size:11px;font-weight:600;'>من تاريخ</label>
        <input id="custStmtStart" type="date" style="padding:6px 8px;border:1px solid #1976d2;border-radius:8px;font-size:12px;" />
      </div>
      <div style='display:flex;flex-direction:column;gap:4px;'>
        <label style='font-size:11px;font-weight:600;'>إلى تاريخ</label>
        <input id="custStmtEnd" type="date" style="padding:6px 8px;border:1px solid #1976d2;border-radius:8px;font-size:12px;" />
      </div>
      <div style='display:flex;gap:6px;margin-inline-start:auto;'>
        <button id="custStmtLoad" type="button" style="background:#1976d2;color:#fff;border:0;padding:8px 14px;border-radius:10px;font-weight:700;cursor:pointer;">تحميل</button>
  <button id="custStmtSave" type="button" style="background:#2e7d32;color:#fff;border:0;padding:8px 14px;border-radius:10px;font-weight:700;cursor:pointer;">حفظ PDF</button>
  <button id="custStmtPrint" type="button" style="background:#616161;color:#fff;border:0;padding:8px 14px;border-radius:10px;font-weight:700;cursor:pointer;">طباعة</button>
        <button id="custStmtClose" type="button" style="background:#b71c1c;color:#fff;border:0;padding:8px 14px;border-radius:10px;font-weight:700;cursor:pointer;">إغلاق</button>
      </div>`;
    content.appendChild(bar);
  }
  // رأس + أدوات اختيار (إن لم تكن لديك عناصر تحكم أصلية يمكنك لاحقاً تعديلها)
  if(!panel.querySelector('#custStmtHeader')){
    const hdr = document.createElement('div');
    hdr.id='custStmtHeader';
    hdr.style.cssText='border:1px solid #1976d2;padding:8px 10px;border-radius:10px;font-size:12px;line-height:1.5;background:#f5faff;';
    content.appendChild(hdr);
  }
  // الجدول (thead) إذا مفقود
  if(!panel.querySelector('table.cust-stmt-table')){
    const tblWrap = document.createElement('div');
    tblWrap.style.cssText='max-height:400px;overflow:auto;border:1px solid rgba(0,0,0,0.12);border-radius:10px;';
    const tbl = document.createElement('table');
    tbl.className='cust-stmt-table';
    tbl.style.cssText='width:100%;border-collapse:collapse;font-size:12px;min-width:760px;';
    tbl.innerHTML = `<thead style="background:#0d47a1;color:#fff;position:sticky;top:0;">
      <tr>
        <th style="padding:6px 8px;border:1px solid rgba(255,255,255,0.25);">#</th>
        <th style="padding:6px 8px;border:1px solid rgba(255,255,255,0.25);">رقم الفاتورة</th>
        <th style="padding:6px 8px;border:1px solid rgba(255,255,255,0.25);">التاريخ</th>
        <th style="padding:6px 8px;border:1px solid rgba(255,255,255,0.25);">الإجمالي (شامل الضريبة)</th>
        <th style="padding:6px 8px;border:1px solid rgba(255,255,255,0.25);">الضريبة</th>
        <th style="padding:6px 8px;border:1px solid rgba(255,255,255,0.25);">نوع العملية</th>
      </tr>
    </thead>
    <tbody id="custStmtBody"></tbody>`;
    tblWrap.appendChild(tbl);
    content.appendChild(tblWrap);
  }
  // عنصر الملخص
  if(!panel.querySelector('#custStmtSummary')){
    const summaryDiv = document.createElement('div');
    summaryDiv.id='custStmtSummary';
    summaryDiv.style.cssText='padding:8px 10px;background:#fafafa;border:1px solid #ddd;border-radius:10px;font-weight:600;font-size:12px;';
    summaryDiv.textContent='—';
    content.appendChild(summaryDiv);
  }
  // ملصق العميل (يوضع أعلى المحتوى إن لم يوجد)
  if(!panel.querySelector('#custStmtCustomerLabel')){
    const lbl = document.createElement('div');
    lbl.id='custStmtCustomerLabel';
    lbl.style.cssText='font-weight:700;font-size:13px;color:#0d47a1;';
    content.insertBefore(lbl, content.firstChild);
  }
  // أعد الربط (المتغيران let)
  stmtBody = panel.querySelector('#custStmtBody');
  stmtSummary = panel.querySelector('#custStmtSummary');
  stmtSearch = panel.querySelector('#custStmtSearch');
  stmtSuggestBox = panel.querySelector('#custStmtSuggest');
  stmtStart = panel.querySelector('#custStmtStart');
  stmtEnd = panel.querySelector('#custStmtEnd');
  stmtLoadBtn = panel.querySelector('#custStmtLoad');
  const stmtSaveBtn = panel.querySelector('#custStmtSave');
  const stmtPrintBtn = panel.querySelector('#custStmtPrint');
  stmtCloseBtn = panel.querySelector('#custStmtClose');
  stmtCustomerLabel = panel.querySelector('#custStmtCustomerLabel');
  stmtHeaderBox = panel.querySelector('#custStmtHeader');
  // التحقق النهائي
  if(!stmtBody || !stmtSummary){
    console.warn('تعذر إنشاء عناصر كشف الحساب.');
    return false;
  }
  // ربط أحداث الأزرار بعد الإنشاء
  if(stmtLoadBtn && !stmtLoadBtn.__bind){ stmtLoadBtn.addEventListener('click', loadStatement); stmtLoadBtn.__bind=true; }
  if(stmtCloseBtn && !stmtCloseBtn.__bind){ stmtCloseBtn.addEventListener('click', closeStatementPanel); stmtCloseBtn.__bind=true; }
  if(stmtSaveBtn && !stmtSaveBtn.__bind){
  stmtSaveBtn.addEventListener('click', saveCustomerStatementReport);
    stmtSaveBtn.__bind=true;
  }
  if(stmtPrintBtn && !stmtPrintBtn.__bind){
    stmtPrintBtn.addEventListener('click', ()=>{ window.print && window.print(); });
    stmtPrintBtn.__bind=true;
  }
  if(stmtSearch && !stmtSearch.__bind){
    stmtSearch.addEventListener('input', async ()=>{
      const v = stmtSearch.value.trim();
      if(!v){ stmtSuggestBox.style.display='none'; stmtSuggestBox.innerHTML=''; return; }
      const list = await searchCustomersForStatement(v);
      stmtSuggestBox.innerHTML='';
      list.slice(0,20).forEach(c=>{
        const b=document.createElement('button');
        b.type='button';
        b.style.cssText='text-align:right;padding:5px 8px;border:1px solid #1976d2;background:#fff;border-radius:8px;cursor:pointer;font-size:11px;font-weight:600;';
        b.textContent = `${c.id} | ${c.name}`;
        b.onclick=()=>{ pickStatementCustomer(c); stmtSuggestBox.style.display='none'; loadStatement(); };
        stmtSuggestBox.appendChild(b);
      });
      stmtSuggestBox.style.display = stmtSuggestBox.innerHTML? 'flex':'none';
      stmtSuggestBox.style.flexDirection='column';
    });
    stmtSearch.__bind=true;
  }
  return true;
}

// استدعاء مبكر لضمان البناء (اختياري)
ensureStatementElements();

async function loadStatement(){
  ensureStatementElements(); // ضمان جاهزية العناصر قبل الملء
  if(!stmtSelectedCustomer){
    const raw = stmtSearch?.value?.trim() || '';
    if(/^[0-9]+$/.test(raw)){
      const id=parseInt(raw);
      const found = customers.find(c=>c.id===id) || (await searchCustomersForStatement(raw)).find(c=>c.id===id);
      if(found) pickStatementCustomer(found);
    }
  }
  if(!stmtSelectedCustomer){ if(stmtSummary) stmtSummary.textContent='اختر عميل أولاً'; return; }
  const start = stmtStart?.value || null;
  const end = stmtEnd?.value || null;
  buildStatementHeader();
  let report=null;
  try { report = await window.api.customerReport({ customer_id: stmtSelectedCustomer.id, start, end }); } catch(_){ }
  if(report && report.ok){
    const d=report.data;
    let rows = d.recentSales||[];
    if(rows.length && rows[0] && (rows[0].pay_method===undefined || rows[0].paid===undefined)){
      if(window.salesCache && Array.isArray(window.salesCache)){
        rows = rows.map(r=>{
          const full = window.salesCache.find(s=> s.id===r.id) || r;
          return { ...r, pay_method: full.pay_method, paid: full.paid };
        });
      }
    }
    if(stmtBody){
      // استخدام البناء المجزأ
      renderStatementRowsChunked(rows, stmtBody);
    }
    if(stmtSummary){
      const totalSum = rows.reduce((s,r)=> s + (r.total||0), 0);
      stmtSummary.textContent = `فواتير: ${rows.length} | إجمالي شامل الضريبة: ${totalSum.toFixed(2)} | إجمالي الضريبة: ${(d.totalVat||0).toFixed(2)}`;
    }
    buildStatementHeader();
  } else {
    const all = (window.salesCache||[]).filter(s=> s.customer_id===stmtSelectedCustomer.id && (!start || s.created_at>=start) && (!end || s.created_at<= (end+'T23:59:59')));
    if(stmtBody){
      renderStatementRowsChunked(all, stmtBody);
    }
    if(stmtSummary){
      const tot = all.reduce((s,r)=>s+(r.total||0),0);
      const totVat = all.reduce((s,r)=>s+(r.vat||0),0);
      stmtSummary.textContent = `فواتير: ${all.length} | إجمالي شامل الضريبة: ${tot.toFixed(2)} | إجمالي الضريبة: ${totVat.toFixed(2)}`;
    }
    buildStatementHeader();
  }
}

function appendUnifiedOps(){
  // في التصميم الجديد قد لا نحتاج عرض كل العمليات المدمجة؛ يمكن تفعيلها لاحقاً
  return;
}

// ===== حفظ تقرير كشف الحساب =====
async function saveCustomerStatementReport(){
  if(!stmtSelectedCustomer){ alert('اختر عميل أولاً'); return; }
  const start = stmtStart?.value || null; const end = stmtEnd?.value || null;
  const statusBox = ensureStmtStatusBox();
  setStmtStatus('... جاري تجهيز التقرير');
  // أعمدة
  const cols = [
    { key:'invoice_no', header:'رقم الفاتورة' },
    { key:'date', header:'التاريخ' },
    { key:'total', header:'الإجمالي شامل الضريبة' },
    { key:'vat', header:'الضريبة' },
    { key:'type', header:'نوع العملية' }
  ];
  // جلب بيانات محدثة لضمان الدقة
  let report=null; try { report = await window.api.customerReport({ customer_id: stmtSelectedCustomer.id, start, end }); } catch(err){ console.warn('report fail',err); }
  let rows=[];
  if(report && report.ok){
    rows = (report.data.recentSales||[]).map(r=>({
      invoice_no: r.invoice_no||r.id,
      date: (r.created_at||'').slice(0,16).replace('T',' '),
      total: (r.total||0).toFixed(2),
      vat: (r.vat||0).toFixed(2),
      type: classifySale(r)
    }));
  }
  const periodTxt = (start||end)? `${start||'من البداية'} -> ${end||'حتى الآن'}` : 'كل الفترات';
  try {
    const resp = await window.api.structuredReportSave({
      category:'customers',
      reportType:'customer_statement',
      subjectName: stmtSelectedCustomer.name,
      columns: cols,
      rows,
      meta: {
        عميل: stmtSelectedCustomer.name,
        الفترة: periodTxt,
        هاتف: stmtSelectedCustomer.phone||'',
        ضريبي_العميل: stmtSelectedCustomer.vat||'',
        report_title: `تقرير مبيعات العميل : ${stmtSelectedCustomer.name}`
      },
      format:'pdf'
    });
    if(!resp || !resp.ok){
      setStmtStatus('فشل الحفظ: '+(resp&&resp.msg||'مجهول'), true);
      alert('فشل الحفظ: '+(resp&&resp.msg||''));
    } else {
      setStmtStatus('تم الحفظ: '+resp.file, false);
      alert('تم الحفظ في الملف:\n'+resp.file+'\n(العميل: '+stmtSelectedCustomer.name+')');
    }
  } catch(err){
    setStmtStatus('خطأ أثناء الحفظ: '+err.message, true);
    alert('خطأ أثناء الحفظ: '+err.message);
  }
}

function ensureStmtStatusBox(){
  if(!stmtPanel) return null;
  let box = stmtPanel.querySelector('#custStmtStatus');
  if(!box){
    box = document.createElement('div');
    box.id='custStmtStatus';
    box.style.cssText='margin-top:4px;font-size:11px;font-weight:600;padding:4px 8px;border-radius:8px;display:inline-block;';
    if(stmtSummary && stmtSummary.parentNode){ stmtSummary.parentNode.insertBefore(box, stmtSummary.nextSibling); }
    else stmtPanel.appendChild(box);
  }
  return box;
}
function setStmtStatus(msg, error){
  const box = ensureStmtStatusBox(); if(!box) return;
  box.textContent = msg;
  box.style.background = error? '#ffebee':'#e3f2fd';
  box.style.color = error? '#b71c1c':'#0d47a1';
}

// إضافة الدالة المفقودة (كانت تُستدعى داخل showActionsPopup)
function openStatementForCustomer(cust){
  if(!cust) return;
  openStatementPanel();
  pickStatementCustomer(cust);
  loadStatement();
}

// ===== نافذة البحث الصغيرة =====
function openSmallSearch(){ if(!stmtSearchOverlay) return; stmtSearchOverlay.style.display='flex'; stmtSearchInputSmall && (stmtSearchInputSmall.value=''); stmtSearchSugSmall && (stmtSearchSugSmall.innerHTML=''); setTimeout(()=> stmtSearchInputSmall && stmtSearchInputSmall.focus(), 20); }
function closeSmallSearch(){ if(stmtSearchOverlay) stmtSearchOverlay.style.display='none'; }
stmtSearchCloseSmall && stmtSearchCloseSmall.addEventListener('click', closeSmallSearch);
if(stmtSearchOverlay){ stmtSearchOverlay.addEventListener('mousedown',e=>{ if(e.target===stmtSearchOverlay) closeSmallSearch(); }); }

stmtSearchInputSmall && stmtSearchInputSmall.addEventListener('input', async ()=>{
  const v = stmtSearchInputSmall.value.trim();
  stmtSearchSugSmall.innerHTML='';
  if(!v){ return; }
  const _t0 = performance.now();
  const list = await searchCustomersForStatement(v);
  const _t1 = performance.now();
  if(window.__custPerfMonEnable){ console.log(`[CUST-PERF] smallSearch q='${v}' results=${list.length} time=${(_t1-_t0).toFixed(1)}ms`); window.__lastCustomerSearchTime = _t1-_t0; }
  list.slice(0,50).forEach(c=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.style.cssText='text-align:right;padding:6px 10px;border:1px solid #000;background:#fff;border-radius:10px;cursor:pointer;font-size:12px;font-weight:700;display:flex;flex-direction:column;align-items:flex-start;';
    btn.innerHTML = `<span>${c.id} | ${c.name}</span><span style='font-size:10px;font-weight:600;opacity:.7;'>${c.phone||''} • ${c.vat||''}</span>`;
    btn.onclick=()=>{ pickStatementCustomer(c); closeSmallSearch(); loadStatement(); };
    stmtSearchSugSmall.appendChild(btn);
  });
});

// ============ تحسينات/مرافق أداء جديدة ============
// دالة إرجاع (debounce) عامة
function debounce(fn, wait=200){
  let t; return function(...args){
    clearTimeout(t);
    t = setTimeout(()=> fn.apply(this,args), wait);
  };
}

// حجم دفعات كشف الحساب (يمكن تغييره من الكونسول)
if(typeof window.__custStmtChunkSize === 'undefined'){
  window.__custStmtChunkSize = 400;
}

// دالة بناء مجزأ لصفوف كشف الحساب لتقليل الـ Long Task
function renderStatementRowsChunked(rows, tbodyEl){
  if(!tbodyEl){ return; }
  const BATCH = Math.max(50, window.__custStmtChunkSize|0);
  tbodyEl.innerHTML = '';
  let i = 0;
  const total = rows.length;
  const t0 = performance.now();
  function next(){
    const frag = document.createDocumentFragment();
    const start = performance.now();
    for(let c=0; c<BATCH && i<total; c++, i++){
      const r = rows[i];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:6px 8px;border:1px solid rgba(0,0,0,0.15);">${i+1}</td>
        <td style="padding:6px 8px;border:1px solid rgba(0,0,0,0.15);">${r.invoice_no||r.id}</td>
        <td style="padding:6px 8px;border:1px solid rgba(0,0,0,0.15);">${formatDate(r.created_at||r.date)}</td>
        <td style="padding:6px 8px;border:1px solid rgba(0,0,0,0.15);">${(+r.total||0).toFixed(2)}</td>
        <td style="padding:6px 8px;border:1px solid rgba(0,0,0,0.15);">${(+r.vat||0).toFixed(2)}</td>
        <td style="padding:6px 8px;border:1px solid rgba(0,0,0,0.15);font-weight:600;">${classifySale(r)}</td>`;
      frag.appendChild(tr);
    }
    tbodyEl.appendChild(frag);
    if(i<total){
      // منح المتصفح فرصة للرسم
      requestAnimationFrame(next);
    }else{
      const dt = (performance.now()-t0).toFixed(1);
      if(window.__custPerfMonEnable) console.log('[CUST-STMT] chunked rows render ms=', dt,'rows=', total,'batch=', BATCH);
    }
  }
  requestAnimationFrame(next);
}

// ===== مراقبة الأداء (تأخر حلقة الأحداث + زمن البحث) =====
(function setupCustomerPerfMonitor(){
  // تفعيل يدوي: ضع window.__custPerfMonEnable = true في الكونسول أو هنا
  if(typeof window.__custPerfMonEnable === 'undefined') window.__custPerfMonEnable = true; // يمكن تغييرها لاحقاً
  if(!window.__custPerfMonEnable) return;
  if(window.__custPerfMonStarted) return; window.__custPerfMonStarted = true;

  const overlay = document.createElement('div');
  overlay.id = 'cust-perf-overlay';
  overlay.style.cssText = 'position:fixed;bottom:6px;left:6px;z-index:99999;background:rgba(0,0,0,0.65);color:#fff;font:11px Tahoma,Arial;padding:6px 8px;border-radius:10px;line-height:1.4;direction:ltr;min-width:170px;pointer-events:none;backdrop-filter:blur(4px);';
  overlay.innerHTML = 'loop: — ms\nlag(avg): —\nlag(max): —\nsearch: — ms';
  document.body.appendChild(overlay);

  let lastTick = performance.now();
  let lagSamples = []; let maxLag = 0; let avgLag = 0;
  function loopMonitor(){
    const now = performance.now();
    const diff = now - lastTick; // مفروض ~500ms
    const expected = 500; // الفاصل
    const lag = diff - expected; // التأخر
    if(lag > -50){ // تجاهل القيم الصغيرة السالبة (ضبط التوقيت)
      lagSamples.push(lag);
      if(lag > maxLag) maxLag = lag;
      if(lagSamples.length > 20) lagSamples.shift();
      avgLag = lagSamples.reduce((a,b)=>a+b,0)/lagSamples.length;
    }
    lastTick = now;
    setTimeout(loopMonitor, expected);
  }
  setTimeout(loopMonitor, 500);

  function repaint(){
    if(!document.body.contains(overlay)){ return; }
    const lastSearch = (window.__lastCustomerSearchTime||0).toFixed(1);
    overlay.textContent = `loop:${(Date.now()%100000).toString().slice(-4)}\nlag(avg): ${avgLag.toFixed(1)}ms\nlag(max): ${maxLag.toFixed(1)}ms\nsearch: ${lastSearch}ms`;
    requestAnimationFrame(repaint);
  }
  requestAnimationFrame(repaint);

  // قياس فترة تجمّد المحتوى (long tasks) عبر PerformanceObserver إن توفر
  try {
  // تعريف مصفوفة وعداد المهام الطويلة (كان يحدث ReferenceError لعدم التعريف)
  let longTasksLog = window.__custLongTasksLog || [];
  let longTasksCount = window.__custLongTasksCount || 0;
  // تخزين مرجعي في window لإعادة الاستخدام بين مرات إنشاء المراقب (إن حصل)
  window.__custLongTasksLog = longTasksLog;
  window.__custLongTasksCount = longTasksCount;
    if('PerformanceObserver' in window){
      const po = new PerformanceObserver((list)=>{
        list.getEntries().forEach(en=>{
          if(en.duration > 120){
            longTasksCount++;
            longTasksLog.push({ dur: en.duration, name: en.name||en.entryType, ts: performance.now() });
            if(longTasksLog.length>5) longTasksLog.shift();
            console.warn('[CUST-PERF] long task', en.duration.toFixed(1)+'ms', en.name||en.entryType);
          }
        });
      });
      po.observe({ entryTypes:['longtask'] });
      // حقن عرض مصغر لسجل آخر المهام (اختياري)
      setInterval(()=>{
        if(!window.__custPerfMonEnable) return;
        const box = document.getElementById('cust-perf-overlay');
        if(box){
          const last = longTasksLog.map(l=> l.dur.toFixed(0)).join(',');
          const txt = box.textContent.split('\n');
          // نضيف سطر (longs: ...)
          const filtered = txt.filter(l=> !l.startsWith('longs:'));
          filtered.push('longs:'+ (last||'-') +' (#'+longTasksCount+')');
          box.textContent = filtered.join('\n');
        }
      }, 2500);
    }
  } catch(_){ }

  console.log('%c[CUST-PERF] مراقبة الأداء للبحث عن العملاء مفعّلة','background:#1976d2;color:#fff;padding:2px 4px;border-radius:4px;');
})();
