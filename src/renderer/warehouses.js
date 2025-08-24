// إعادة بناء الملف ليتوافق مع التصميم والحقول الجديدة
const tbody = document.querySelector('#storesTable tbody');
const searchInput = document.getElementById('searchInput');
const btnAdd = document.getElementById('btnAdd');
const modal = document.getElementById('storeModal');
const modalTitle = document.getElementById('modalTitle');
const saveBtn = document.getElementById('saveStore');
const cancelBtn = document.getElementById('cancelStore');
const backBtn = document.getElementById('backBtn');
const transferBtn = document.getElementById('btnTransfer');
const storeMsg = document.getElementById('storeMsg');
// عناصر نموذج التحويل
const transferModal = document.getElementById('transferModal');
const trFrom = document.getElementById('trFrom');
const trTo = document.getElementById('trTo');
const trProduct = document.getElementById('trProduct');
const trQty = document.getElementById('trQty');
const trNote = document.getElementById('trNote');
const trMsg = document.getElementById('trMsg');
const trSave = document.getElementById('trSave');
const trCancel = document.getElementById('trCancel');

let stores = [];
let editingId = null;

// واجهات API (توافق أسماء قديمة وجديدة)
async function apiList(filter){ return (window.api.listStores? window.api.listStores(filter): window.api.storesAdvList(filter)); }
async function apiAdd(data){ return (window.api.addStore? window.api.addStore(data): window.api.storeAddAdv(data)); }
async function apiUpdate(id,data){ return (window.api.updateStore? window.api.updateStore(id,data): window.api.storeUpdateAdv(id,data)); }
async function apiDelete(id){ return (window.api.deleteStore? window.api.deleteStore(id): window.api.storeDeleteAdv(id)); }

function renderTable(){
  tbody.innerHTML='';
  if(!stores.length){
    const tr=document.createElement('tr');
    const td=document.createElement('td'); td.colSpan=6; td.textContent='لا توجد مخازن';
    tr.appendChild(td); tbody.appendChild(tr); return;
  }
  stores.forEach(s=>{
    const tr = document.createElement('tr');
    const ratingDisplay = (s.rating===null || s.rating===undefined || s.rating===0)? '': (Number(s.rating).toFixed(1).replace(/\.0$/,''));
    tr.innerHTML = `<td>${escapeHtml(s.name||'')}</td><td>${escapeHtml(s.location||'')}</td><td>${escapeHtml(s.manager||'')}</td><td>${escapeHtml(s.phone||'')}</td><td>${ratingDisplay}</td><td><button class="btn-inline" data-act="edit" data-id="${s.id}">تعديل</button><button class="btn-inline" data-act="del" data-id="${s.id}">حذف</button></td>`;
    tbody.appendChild(tr);
  });
}

function escapeHtml(str){ return str.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

async function loadStores(){
  const filter = searchInput.value.trim();
  let res;
  try {
    // نستخدم مباشرة listStores إن توفرت (ترجع rows)
    res = await (window.api.listStores ? window.api.listStores(filter) : window.api.storesAdvList(filter));
  } catch(err){
    showLoadError('فشل تحميل المخازن');
    return;
  }
  if(!res || !res.ok){ showLoadError('فشل تحميل المخازن'); return; }
  let data = res.rows || res.data || [];
  // فلترة إضافية (مطبقة محلياً) عند وجود نص بحث
  if(filter){
    const fLower = filter.toLowerCase();
    data = data.filter(s=>{
      const ratingStr = (s.rating!=null? String(s.rating): '').toLowerCase();
      return (
        (s.name||'').toLowerCase().includes(fLower) ||
        (s.location||'').toLowerCase().includes(fLower) ||
        (s.manager||'').toLowerCase().includes(fLower) ||
        (s.phone||'').toLowerCase().includes(fLower) ||
        ratingStr.includes(fLower)
      );
    });
  }
  stores = data;
  renderTable();
}

function showLoadError(msg){
  tbody.innerHTML = `<tr><td colspan="6" style="color:#b50000;font-weight:700;">${msg}</td></tr>`;
}

function clearForm(){
  editingId=null; modalTitle.textContent='إضافة مخزن';
  ['storeName','storeLocation','storeManager','storePhone','storeRating','storeNotes'].forEach(id=>{ const el=document.getElementById(id); if(el) el && (el.value=''); });
  clearErrors(); if(storeMsg){ storeMsg.textContent=''; storeMsg.style.color='#b50000'; }
  // عند الإضافة نظهر فقط الحقول الأساسية
  document.querySelector('.adv-fields')?.classList.remove('open');
  document.querySelector('.adv-fields')?.setAttribute('style','display:none;');
}
function openModal(){ modal.style.display='flex'; }
function closeModal(){ modal.style.display='none'; }
function markError(el){ el.classList.add('error'); }
function clearErrors(){ ['storeName','storeLocation','storeManager','storePhone'].forEach(id=>{ const el=document.getElementById(id); if(el) el.classList.remove('error'); }); }

function validate(){
  clearErrors(); let ok=true;
  // فقط الاسم والموقع إلزاميان حسب الطلب الحالي
  ['storeName','storeLocation'].forEach(id=>{ const el=document.getElementById(id); if(!el.value.trim()){ markError(el); if(ok) el.focus(); ok=false; }});
  const ratingEl = document.getElementById('storeRating');
  if(ratingEl && ratingEl.value.trim()){ let v=parseFloat(ratingEl.value); if(isNaN(v)||v<0) v=0; if(v>5) v=5; ratingEl.value=v; }
  return ok;
}

function gather(){
  return {
    name: document.getElementById('storeName').value.trim(),
    location: document.getElementById('storeLocation').value.trim(),
    // الحقول الإضافية اختيارية
    manager: (document.getElementById('storeManager')?.value||'').trim(),
    phone: (document.getElementById('storePhone')?.value||'').trim(),
    rating: (function(){ const el=document.getElementById('storeRating'); if(!el||!el.value.trim()) return 0; let v=parseFloat(el.value); if(isNaN(v)||v<0) v=0; if(v>5) v=5; return v; })(),
    notes: (document.getElementById('storeNotes')?.value||'').trim()
  };
}

function beginEdit(store){
  editingId=store.id; modalTitle.textContent='تعديل مخزن';
  document.getElementById('storeName').value=store.name||'';
  document.getElementById('storeLocation').value=store.location||'';
  if(document.querySelector('.adv-fields')){
    document.querySelector('.adv-fields').style.display='block';
  }
  document.getElementById('storeManager').value=store.manager||'';
  document.getElementById('storePhone').value=store.phone||'';
  document.getElementById('storeRating').value=(store.rating!=null? store.rating: '');
  document.getElementById('storeNotes').value=store.notes||'';
  openModal();
}

tbody.addEventListener('click', e => {
  const btn = e.target.closest('button.btn-inline');
  if(!btn) return;
  const id = +btn.dataset.id;
  const store = stores.find(s=> s.id===id);
  if(!store) return;
  const act = btn.dataset.act;
  if(act==='edit') beginEdit(store);
  else if(act==='del'){
    if(confirm('تأكيد حذف المخزن؟')){
      apiDelete(store.id).then(r=>{ if(r.ok) loadStores(); });
    }
  }
});

saveBtn.addEventListener('click', async ()=>{
  if(!validate()){
    if(storeMsg){ storeMsg.style.color='#b50000'; storeMsg.textContent='يرجى تعبئة الحقول المطلوبة'; }
    return;
  }
  const data = gather();
  if(storeMsg){ storeMsg.style.color='#444'; storeMsg.textContent='جاري الحفظ...'; }
  let r;
  try {
    if(editingId){ r = await apiUpdate(editingId, data); }
    else { r = await apiAdd(data); }
  } catch(err){ r = { ok:false, msg:'تعذر الاتصال' }; }
  if(r && r.ok){
    if(storeMsg){ storeMsg.style.color='#0a7d00'; storeMsg.textContent='تم الحفظ الفعّال'; }
    // تحديث الصفوف محلياً دون إعادة تحميل كامل
    if(editingId){
      const idx = stores.findIndex(s=> s.id===editingId);
      if(idx>-1) stores[idx] = Object.assign({}, stores[idx], r.row);
    } else {
      stores.unshift(r.row);
    }
    renderTable();
    setTimeout(()=>{ closeModal(); clearForm(); }, 700);
  } else {
    if(storeMsg){ storeMsg.style.color='#b50000'; storeMsg.textContent='فشل الحفظ: ' + (r && r.msg ? r.msg : 'غير معروف'); }
  }
});

cancelBtn.addEventListener('click', ()=>{ closeModal(); clearForm(); });
btnAdd.addEventListener('click', ()=>{ clearForm(); openModal(); });
searchInput.addEventListener('input', ()=>{ loadStores(); });
backBtn.addEventListener('click', ()=>{ window.location='index.html'; });
window.addEventListener('keydown', e=>{ if(e.key==='Escape' && modal.style.display==='flex'){ closeModal(); }});

// ====== نقل المخزون ======
transferBtn && transferBtn.addEventListener('click', ()=>{ openTransferModal(); });
trCancel && trCancel.addEventListener('click', ()=>{ closeTransferModal(); });
trFrom && trFrom.addEventListener('change', ()=>{ populateToStores(); loadProductsForStore(); });

function openTransferModal(){
  trMsg.textContent='';
  trQty.value=''; trNote.value=''; trProduct.innerHTML='';
  loadStoresForTransfer().then(()=>{ populateToStores(); loadProductsForStore(); });
  transferModal.style.display='flex';
}
function closeTransferModal(){ transferModal.style.display='none'; }

async function loadStoresForTransfer(){
  try {
    const r = await (window.api.listStores? window.api.listStores('') : window.api.storesAdvList(''));
    const rows = r.rows || r.data || [];
    trFrom.innerHTML = '<option value="">- اختر -</option>' + rows.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  } catch{}
}
function populateToStores(){
  const fromId = trFrom.value;
  try {
    const opts = Array.from(trFrom.options).filter(o=> o.value && o.value!==fromId);
    trTo.innerHTML = '<option value="">- اختر -</option>' + opts.map(o=>`<option value="${o.value}">${escapeHtml(o.textContent)}</option>`).join('');
  } catch{}
}
async function loadProductsForStore(){
  trProduct.innerHTML = '<option value="">--</option>';
  const fromId = parseInt(trFrom.value)||null; if(!fromId) return;
  try {
    const resp = await window.api.productsList('');
    if(resp.ok){
      const prods = resp.rows.filter(p=> p.store_id === fromId);
      trProduct.innerHTML = '<option value="">- اختر المنتج -</option>' + prods.map(p=>`<option value="${p.id}" data-qty="${p.qty||0}">${escapeHtml(p.name)} (م.${p.qty||0})</option>`).join('');
    }
  } catch{}
}

trSave && trSave.addEventListener('click', async ()=>{
  trMsg.style.color='#b50000';
  const from_store = parseInt(trFrom.value)||0;
  const to_store = parseInt(trTo.value)||0;
  const product_id = parseInt(trProduct.value)||0;
  const qty = parseInt(trQty.value)||0;
  const note = trNote.value.trim();
  if(!from_store || !to_store || !product_id || qty<=0){ trMsg.textContent='بيانات غير مكتملة'; return; }
  if(from_store === to_store){ trMsg.textContent='اختر مخزنين مختلفين'; return; }
  const opt = trProduct.querySelector(`option[value="${product_id}"]`);
  const avail = opt? parseInt(opt.getAttribute('data-qty'))||0 : 0;
  if(qty > avail){ trMsg.textContent='الكمية أكبر من المتوفرة'; return; }
  const userJSON = sessionStorage.getItem('asas_user');
  let user_id=null; try { user_id = JSON.parse(userJSON||'{}').id; } catch(_){ }
  trMsg.textContent='جاري التنفيذ...';
  const payload = { product_id, from_store, to_store, qty, note, user_id };
  try {
    const r = await window.api.stockTransfer(payload);
    if(r && r.ok){
      trMsg.style.color='#0a7d00';
      trMsg.textContent='تم التحويل';
      setTimeout(()=>{ closeTransferModal(); loadStores(); }, 600);
    } else {
      trMsg.textContent = (r && r.msg) ? r.msg : 'فشل التحويل';
    }
  } catch(err){ trMsg.textContent='خطأ أثناء التحويل'; }
});

// تحميل أولي حالما تجهز الصفحة
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', ()=> loadStores());
} else { loadStores(); }
