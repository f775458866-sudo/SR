// products.js (متقدم)
// إدارة المنتجات: عرض، بحث، إضافة، تعديل، حذف مع lookups

const tableBody = document.querySelector('#productsTable tbody');
const addProductBtn = document.getElementById('addProductBtn');
const saveProductTopBtn = document.getElementById('saveProductTopBtn');
const cancelTopBtn = document.getElementById('cancelTopBtn');
const cancelBottomBtn = document.getElementById('cancelBottomBtn');
const closeFormBtn = document.getElementById('closeFormBtn');
const formModeBadge = document.getElementById('formModeBadge');
const imagePreviewBox = document.getElementById('imagePreview');
const saveMsg = document.getElementById('saveMsg');
const panel = document.getElementById('productFormPanel');
const form = document.getElementById('productForm');
const cancelProductBtn = document.getElementById('cancelProductBtn'); // قد يكون غير موجود (أزرار سفلية حُذفت)
const backBtn = document.getElementById('backBtn');
const searchBox = document.getElementById('searchBox');
const regenBarcodeBtn = document.getElementById('regenBarcodeBtn');
// جلب المستخدم الحالي من الجلسة لاستخدامه في updated_by
let currentUserId = null; try { const u = JSON.parse(sessionStorage.getItem('asas_user')||'null'); if(u && u.id) currentUserId = u.id; } catch(_){ }
// تمت إزالة حقول عرض الضريبة من الواجهة
const barcodeModeRadios = () => Array.from(document.querySelectorAll('input[name="barcode_mode"]'));
let currentBarcodeMode = 'auto';

let editingId = null; // id في قاعدة البيانات
let cacheProducts = [];
let lookupsCache = { groups: {}, units: {}, categories: {}, stores: {} };

function genBarcode(){
  return 'P' + Math.random().toString(36).slice(2,10).toUpperCase();
}

async function loadLookups(){
  const [groups, units, categories, stores] = await Promise.all([
    window.api.groupsList(), window.api.unitsList(), window.api.categoriesList(), window.api.storesList()
  ]);
  const mapFill = (resp, elId, cacheKey) => {
    const el = document.getElementById(elId);
    if(resp.ok){
      el.innerHTML = '<option value="">-</option>' + resp.rows.map(r=>`<option value="${r.id}">${r.name}</option>`).join('');
      resp.rows.forEach(r=>{ lookupsCache[cacheKey][r.id] = r.name; });
    }
  };
  mapFill(groups, 'f_group', 'groups');
  mapFill(units, 'f_unit', 'units');
  mapFill(categories, 'f_category', 'categories');
  mapFill(stores, 'f_store', 'stores');
}

async function fetchProducts(filter){
  const resp = await window.api.productsList(filter||'');
  if(resp.ok){ cacheProducts = resp.rows; renderTable(); }
}

function renderTable(){
  tableBody.innerHTML = '';
  cacheProducts.forEach(p=>{
    const tr = document.createElement('tr');
    if(p.low_stock && p.qty <= p.low_stock) tr.style.background = '#ffe5e5';
    tr.innerHTML = `
      <td>${p.name||''}</td>
      <td>${p.barcode||''}</td>
  <td>${p.sku||''}</td>
      <td>${p.purchase_price||0}</td>
      <td>${p.sale_price||0}</td>
  <td>${p.margin_percent? Number(p.margin_percent).toFixed(2):''}</td>
      <td>${lookupsCache.groups[p.group_id]||''}</td>
      <td>${lookupsCache.units[p.unit_id]||''}</td>
      <td>${lookupsCache.categories[p.category_id]||''}</td>
      <td>${p.qty||0}</td>
      <td>${p.image_path? '<span>✔</span>':''}</td>
  <td>${p.active===0? '❌':'✅'}</td>
  <td><button class="btn btn-secondary" data-act="mov" data-id="${p.id}" style="padding:4px 10px;font-size:11px;">سجل</button></td>
      <td>
        <button class="btn btn-secondary" data-act="edit" data-id="${p.id}">تعديل</button>
        <button class="btn btn-danger" data-act="del" data-id="${p.id}">حذف</button>
      </td>`;
    tableBody.appendChild(tr);
  });
}

tableBody.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-act]');
  if(!btn) return;
  const id = parseInt(btn.dataset.id);
  const act = btn.dataset.act;
  const product = cacheProducts.find(p=>p.id===id);
  if(act==='edit'){
    openForm(product);
  } else if(act==='del'){
    if(confirm('حذف المنتج؟')){
      const resp = await window.api.productDelete(id);
      if(resp.ok) fetchProducts(searchBox.value.trim());
    }
  } else if(act==='mov'){
    openStockMovements(id, product);
  }
});

addProductBtn && (addProductBtn.onclick = ()=>{ openForm(); });
// اختصار F5 لفتح نموذج المنتج (يمنع التحديث الافتراضي للنافذة في المتصفح لكن هنا داخل Electron)
window.addEventListener('keydown',(e)=>{
  if(e.key==='F5'){
    e.preventDefault();
    if(panel && panel.style.display!=='block') openForm();
  }
});
if(cancelProductBtn){
  cancelProductBtn.onclick = ()=>{ panel.style.display='none'; form.reset(); toggleTopActions(false); };
}
cancelTopBtn.onclick = ()=>{ resetAndHideForm(); };
cancelBottomBtn && (cancelBottomBtn.onclick = ()=>{ resetAndHideForm(); });
closeFormBtn && (closeFormBtn.onclick = ()=>{ resetAndHideForm(); });
// تفويض عام احتياطي في حال لم يُسجَّل المستمع المباشر (مثلاً بعد إعادة بناء DOM جزئياً)
document.addEventListener('click',(e)=>{
  const el = e.target;
  if(el && (el.id === 'closeFormBtn' || el.closest('#closeFormBtn'))){
    e.preventDefault();
    resetAndHideForm();
  }
});

// إغلاق عند النقر خارج البطاقة (على الخلفية المعتمة)
panel && panel.addEventListener('click',(e)=>{
  if(e.target === panel){ // النقر مباشرة على الخلفية
    resetAndHideForm();
  }
});

// إغلاق بالزر ESC
window.addEventListener('keydown',(e)=>{
  if(e.key === 'Escape' && panel && panel.style.display === 'block'){
    resetAndHideForm();
  }
});
backBtn && (backBtn.onclick = ()=>{ if(panel && panel.style.display==='block'){ form.reset(); panel.style.display='none'; toggleTopActions(false); return; } window.appNav && window.appNav.goBack && window.appNav.goBack(); });

searchBox.addEventListener('input', ()=>{
  fetchProducts(searchBox.value.trim());
});

function toggleTopActions(show){
  if(!saveProductTopBtn) return;
  saveProductTopBtn.style.display = show? 'inline-block':'none';
  cancelTopBtn.style.display = show? 'inline-block':'none';
  if(formModeBadge){ formModeBadge.style.display='inline-block'; }
}

function resetAndHideForm(){
  form.reset();
  panel.style.display='none';
  panel.classList.remove('modal-mode');
  toggleTopActions(false);
  if(imagePreviewBox) imagePreviewBox.innerHTML='';
}

function flashSaveMsg(){
  if(!saveMsg) return;
  saveMsg.style.display='inline';
  setTimeout(()=>{ saveMsg.style.display='none'; }, 1800);
}

function showStatus(msg, kind){
  if(!saveMsg) return;
  saveMsg.textContent = msg;
  saveMsg.style.display='inline';
  if(kind==='error'){
    saveMsg.style.color = '#b50000';
  } else {
    saveMsg.style.color = '#0a7d00';
  }
}

function openForm(prod){
  form.reset();
  loadLookups();
  panel.style.display='block';
  panel.classList.add('modal-mode');
  // تأكيد ربط زر الإغلاق في كل فتح
  const dynamicClose = document.getElementById('closeFormBtn');
  if(dynamicClose && !dynamicClose.__bound){
    dynamicClose.addEventListener('click',(e)=>{ e.preventDefault(); console.log('closeFormBtn clicked'); resetAndHideForm(); });
    dynamicClose.__bound = true;
  }
  toggleTopActions(true);
  showStatus('', 'ok'); if(saveMsg) saveMsg.style.display='none';
  if(prod){
    editingId = prod.id;
    document.getElementById('f_name').value = prod.name||'';
    document.getElementById('f_barcode').value = prod.barcode||'';
    document.getElementById('f_model').value = prod.model||'';
  document.getElementById('f_sku').value = prod.sku||'';
  document.getElementById('f_brand').value = prod.brand||'';
    document.getElementById('f_qty').value = prod.qty||0;
    document.getElementById('f_purchase').value = prod.purchase_price||0;
    document.getElementById('f_sale').value = prod.sale_price||0;
    document.getElementById('f_discount_price').value = prod.discount_price||'';
    document.getElementById('f_discount_start').value = prod.discount_start? (prod.discount_start.split('T')[0]) : '';
    document.getElementById('f_discount_end').value = prod.discount_end? (prod.discount_end.split('T')[0]) : '';
    document.getElementById('f_group').value = prod.group_id||'';
    document.getElementById('f_unit').value = prod.unit_id||'';
    document.getElementById('f_category').value = prod.category_id||'';
    document.getElementById('f_store').value = prod.store_id||'';
    document.getElementById('f_low_stock').value = prod.low_stock||0;
  document.getElementById('f_reorder_qty').value = prod.reorder_qty||'';
  document.getElementById('f_max_stock').value = prod.max_stock||'';
  document.getElementById('f_average_cost').value = prod.average_cost||'';
  document.getElementById('f_last_cost').value = prod.last_cost||'';
  document.getElementById('f_margin_percent').value = prod.margin_percent||'';
  document.getElementById('f_price_level2').value = prod.price_level2||'';
  document.getElementById('f_price_level3').value = prod.price_level3||'';
  document.getElementById('f_vat_rate').value = prod.vat_rate||'';
  document.getElementById('f_allow_negative').value = (prod.allow_negative?1:0);
  document.getElementById('f_active').value = (prod.active===0?0:1);
    document.getElementById('f_notes').value = prod.notes||'';
    if(formModeBadge){ formModeBadge.textContent='تعديل'; formModeBadge.style.background='#ffa600'; }
  } else {
    editingId = null;
    document.getElementById('f_barcode').value = genBarcode();
    if(formModeBadge){ formModeBadge.textContent='جديد'; formModeBadge.style.background='#0d4d92'; }
  }
  currentBarcodeMode = 'auto';
  document.getElementById('f_barcode').readOnly = true;
  // (إزالة حساب العرض الضريبي المرئي)
}

function clearErrors(){ document.querySelectorAll('.err[data-err]').forEach(el=> el.textContent=''); }
function setErr(field, msg){ const el = document.querySelector(`.err[data-err="${field}"]`); if(el) el.textContent = msg||''; }

function validateRequiredSequential(data){
  clearErrors();
  const fieldNames = { name:'اسم المنتج', purchase_price:'سعر الشراء', qty:'الكمية', group_id:'المجموعة', unit_id:'الوحدة', category_id:'الصنف', store_id:'المخزن' };
  if(!data.name){ setErr('name','مطلوب'); showStatus('فشل الحفظ: '+fieldNames.name+' مطلوب','error'); markInvalid('f_name'); return false; }
  if(data.purchase_price === '' || isNaN(data.purchase_price)){ setErr('purchase','مطلوب'); showStatus('فشل الحفظ: '+fieldNames.purchase_price+' مطلوب','error'); markInvalid('f_purchase'); return false; }
  if(data.qty <= 0){ setErr('qty','مطلوب'); showStatus('فشل الحفظ: '+fieldNames.qty+' مطلوب','error'); markInvalid('f_qty'); return false; }
  if(!data.group_id){ setErr('group','مطلوب'); showStatus('فشل الحفظ: '+fieldNames.group_id+' مطلوب','error'); return false; }
  if(!data.unit_id){ setErr('unit','مطلوب'); showStatus('فشل الحفظ: '+fieldNames.unit_id+' مطلوب','error'); return false; }
  if(!data.category_id){ setErr('category','مطلوب'); showStatus('فشل الحفظ: '+fieldNames.category_id+' مطلوب','error'); return false; }
  if(!data.store_id){ setErr('store','مطلوب'); showStatus('فشل الحفظ: '+fieldNames.store_id+' مطلوب','error'); return false; }
  // تحقق إضافي (لا يُظهر رسائل فشل رئيسية بل تبقى محلية)
  if(currentBarcodeMode==='manual' && !data.barcode){ setErr('barcode','مطلوب'); markInvalid('f_barcode'); }
  return true;
}

async function handleImage(){
  const fileInput = document.getElementById('f_image');
  const file = fileInput.files && fileInput.files[0];
  if(!file) return null;
  // basic type check
  if(!/image\//.test(file.type)){ setErr('image','ملف غير صالح'); return null; }
  return new Promise((resolve)=>{
    const reader = new FileReader();
    reader.onload = async () => {
      const res = await window.api.productSaveImage({ name: file.name, data: reader.result });
      if(res.ok) resolve(res.path); else { setErr('image', res.msg||'فشل رفع'); resolve(null); }
      // معاينة الصورة بعد الحفظ (اختياري: نعرض Base64 محلياً بدلاً من المسار)
      if(imagePreviewBox){
        imagePreviewBox.innerHTML = `<img src="${reader.result}" alt="preview">`;
      }
    };
    reader.readAsDataURL(file);
  });
}

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const data = {
    name: document.getElementById('f_name').value.trim(),
    barcode: document.getElementById('f_barcode').value.trim(),
    model: document.getElementById('f_model').value.trim(),
    qty: parseInt(document.getElementById('f_qty').value)||0,
    purchase_price: parseFloat(document.getElementById('f_purchase').value)||0,
    sale_price: parseFloat(document.getElementById('f_sale').value)||0,
    discount_price: document.getElementById('f_discount_price').value? parseFloat(document.getElementById('f_discount_price').value): null,
    discount_start: document.getElementById('f_discount_start').value || null,
    discount_end: document.getElementById('f_discount_end').value || null,
    group_id: parseInt(document.getElementById('f_group').value)||null,
    unit_id: parseInt(document.getElementById('f_unit').value)||null,
    category_id: parseInt(document.getElementById('f_category').value)||null,
    store_id: parseInt(document.getElementById('f_store').value)||null,
    low_stock: parseInt(document.getElementById('f_low_stock').value)||0,
    image_path: null,
    notes: document.getElementById('f_notes').value.trim()
  , sku: document.getElementById('f_sku').value.trim()
  , brand: document.getElementById('f_brand').value.trim()
  , reorder_qty: parseInt(document.getElementById('f_reorder_qty').value)||null
  , max_stock: parseInt(document.getElementById('f_max_stock').value)||null
  , average_cost: parseFloat(document.getElementById('f_average_cost').value)||null
  , last_cost: parseFloat(document.getElementById('f_last_cost').value)||null
  , margin_percent: document.getElementById('f_margin_percent').value? parseFloat(document.getElementById('f_margin_percent').value): null
  , price_level2: document.getElementById('f_price_level2').value? parseFloat(document.getElementById('f_price_level2').value): null
  , price_level3: document.getElementById('f_price_level3').value? parseFloat(document.getElementById('f_price_level3').value): null
  , vat_rate: document.getElementById('f_vat_rate').value? parseFloat(document.getElementById('f_vat_rate').value): null
  , allow_negative: document.getElementById('f_allow_negative').value === '1'
  , active: parseInt(document.getElementById('f_active').value)
    , updated_by: currentUserId
  };
  // حساب تلقائي للهامش عند عدم إدخاله ولكن سعر الشراء والبيع موجودان
  if(!data.margin_percent && data.purchase_price>0 && data.sale_price>0){
    data.margin_percent = ((data.sale_price - data.purchase_price)/data.purchase_price)*100;
  }
  if(currentBarcodeMode==='auto' && !editingId){ // regenerate to ensure uniqueness attempt
    data.barcode = genBarcode();
    document.getElementById('f_barcode').value = data.barcode;
  }
  if(!validateRequiredSequential(data)) return;
  const imgPath = await handleImage();
  if(imgPath) data.image_path = imgPath;
  let resp;
  if(editingId){ resp = await window.api.productUpdate(editingId, data); }
  else { resp = await window.api.productAdd(data); }
  if(resp && resp.ok){
    // إبقاء النافذة مفتوحة لإدخال منتج جديد سريعاً
    const justEdited = !!editingId;
    form.reset();
    editingId = null; // ننتقل دائماً لوضع إضافة جديد
    // إعادة توليد باركود إذا كان الوضع تلقائي
    if(currentBarcodeMode==='auto'){
      const bc = genBarcode();
      const bcField = document.getElementById('f_barcode');
      if(bcField){ bcField.value = bc; bcField.readOnly = true; }
    }
    // تحديث شارة الوضع
    if(formModeBadge){ formModeBadge.textContent='جديد'; formModeBadge.style.background='#0d4d92'; }
    // تنظيف المعاينة
    if(imagePreviewBox) imagePreviewBox.innerHTML='';
    // إبقاء أزرار الحفظ/الإلغاء معروضة
    toggleTopActions(true);
    panel.style.display='block';
    panel.classList.add('modal-mode');
    showStatus(justEdited? 'تم تحديث المنتج – يمكنك إضافة منتج جديد' : 'تم الحفظ – أضف منتجاً آخر','success');
  fetchProducts(searchBox.value.trim());
    // تركيز على اسم المنتج للمدخل التالي
    const nameField = document.getElementById('f_name');
    if(nameField){ nameField.focus(); }
  } else {
    if(resp && resp.msg){
      const base = resp.msg.match(/الباركود مستخدم|اسم المنتج مفقود|معرف المنتج غير صالح/) ? resp.msg : (resp.msg.includes('SQLITE') ? 'خطأ في قاعدة البيانات' : resp.msg);
      showStatus('فشل الحفظ: ' + base,'error');
    } else {
      showStatus('فشل الحفظ: تعذر الاتصال بقاعدة البيانات','error');
    }
  }
});

barcodeModeRadios().forEach(r=> r.addEventListener('change', ()=>{
  currentBarcodeMode = barcodeModeRadios().find(x=>x.checked).value;
  const field = document.getElementById('f_barcode');
  if(currentBarcodeMode==='manual'){
    field.readOnly = false; field.placeholder='أدخل الباركود'; field.focus();
  } else {
    field.readOnly = true; field.value = genBarcode(); field.placeholder='سيتم توليده';
  }
}));
regenBarcodeBtn.addEventListener('click', ()=>{
  if(currentBarcodeMode==='auto') document.getElementById('f_barcode').value = genBarcode();
});

// أزلنا دوال حساب وعرض الضريبة لأنها لم تعد مطلوبة بصرياً

function markInvalid(id){ const el=document.getElementById(id); if(el) el.classList.add('invalid'); }
function clearInvalid(){ form.querySelectorAll('.invalid').forEach(el=> el.classList.remove('invalid')); }
function clearErrors(){ document.querySelectorAll('.err[data-err]').forEach(el=> el.textContent=''); clearInvalid(); }

// Mini lookup modal logic (new UI)
const miniPanel = document.getElementById('miniLookupPanel');
const miniTitle = document.getElementById('miniLookupTitle');
const miniInput = document.getElementById('miniLookupInput');
const miniSave = document.getElementById('miniLookupSave');
const miniCancel = document.getElementById('miniLookupCancel');
let currentLookupType = null;

function openMini(type){
  currentLookupType = type;
  miniTitle.textContent = 'إضافة ' + (type==='group'?'مجموعة': type==='unit'?'وحدة': type==='category'?'صنف': 'مخزن');
  miniInput.value='';
  miniPanel.style.display='flex';
  miniInput.focus();
}
function closeMini(){ miniPanel.style.display='none'; currentLookupType=null; }
miniCancel.addEventListener('click', closeMini);
miniSave.addEventListener('click', async ()=>{
  const val = miniInput.value.trim();
  if(!val){ setErr('mini','أدخل اسم'); return; }
  let ensureFn, listFn, selectEl;
  if(currentLookupType==='group'){ ensureFn=window.api.groupEnsure; listFn=window.api.groupsList; selectEl=document.getElementById('f_group'); }
  else if(currentLookupType==='unit'){ ensureFn=window.api.unitEnsure; listFn=window.api.unitsList; selectEl=document.getElementById('f_unit'); }
  else if(currentLookupType==='category'){ ensureFn=window.api.categoryEnsure; listFn=window.api.categoriesList; selectEl=document.getElementById('f_category'); }
  else if(currentLookupType==='store'){ ensureFn=window.api.storeEnsure; listFn=window.api.storesList; selectEl=document.getElementById('f_store'); }
  try {
    const r = await ensureFn(val);
    if(r.ok){
      const list = await listFn();
      if(list.ok){
        selectEl.innerHTML='<option value="">-</option>' + list.rows.map(r=>`<option value="${r.id}">${r.name}</option>`).join('');
        selectEl.value = r.id;
        if(currentLookupType==='group') lookupsCache.groups[r.id]=val;
        if(currentLookupType==='unit') lookupsCache.units[r.id]=val;
        if(currentLookupType==='category') lookupsCache.categories[r.id]=val;
        if(currentLookupType==='store') lookupsCache.stores[r.id]=val;
      }
      closeMini();
      renderTable();
    }
  } catch{}
});

// Replace old prompt mini-add with modal
document.querySelectorAll('.mini-add').forEach(btn=>{
  btn.addEventListener('click', ()=> {
    if(btn.dataset.add==='store'){ // منع إضافة مخزن من هنا
      showStatus('لا يمكن إضافة مخزن من شاشة المنتج','error');
      return;
    }
    openMini(btn.dataset.add);
  });
});


// إضافة قيم جديدة للـ lookups
// (old prompt logic removed in favor of modal)

// بدء التحميل
// أزيل منطق قائمة المنتجات الحديثة

saveProductTopBtn?.addEventListener('click', ()=>{ form.requestSubmit(); });
// تحديث المعاينة مباشرة عند اختيار ملف بدون انتظار حفظ
document.getElementById('f_image')?.addEventListener('change', (e)=>{
  const file = e.target.files && e.target.files[0];
  if(!file || !/image\//.test(file.type)){ if(imagePreviewBox) imagePreviewBox.innerHTML=''; return; }
  const reader=new FileReader();
  reader.onload=()=>{ if(imagePreviewBox) imagePreviewBox.innerHTML=`<img src="${reader.result}" alt="preview">`; };
  reader.readAsDataURL(file);
});

// تزامن حي بين الهامش وسعر البيع
const purchaseEl = document.getElementById('f_purchase');
const saleEl = document.getElementById('f_sale');
const marginEl = document.getElementById('f_margin_percent');
function recalcSaleFromMargin(){
  const p = parseFloat(purchaseEl.value)||0; const m = parseFloat(marginEl.value)||0; if(p>0 && m>=0){ saleEl.value = (p * (1 + m/100)).toFixed(2); }
}
function recalcMarginFromSale(){
  const p = parseFloat(purchaseEl.value)||0; const s = parseFloat(saleEl.value)||0; if(p>0 && s>=0){ marginEl.value = (((s - p)/p)*100).toFixed(2); }
}
marginEl?.addEventListener('input', ()=>{ recalcSaleFromMargin(); });
saleEl?.addEventListener('input', ()=>{ recalcMarginFromSale(); });
purchaseEl?.addEventListener('input', ()=>{ if(marginEl.value){ recalcSaleFromMargin(); } else if(saleEl.value){ recalcMarginFromSale(); } });

// ===== حركات المخزون =====
const stockMovModal = document.getElementById('stockMovModal');
const stockMovTbody = document.getElementById('stockMovTbody');
const stockMovMeta = document.getElementById('stockMovMeta');
const stockMovReload = document.getElementById('stockMovReload');
const closeStockMov = document.getElementById('closeStockMov');
let currentMovProductId = null;
async function loadStockMovements(){
  if(!currentMovProductId) return;
  stockMovTbody.innerHTML = '<tr><td colspan="5" style="padding:8px;">تحميل...</td></tr>';
  const r = await window.api.productStockMovements(currentMovProductId, 120);
  if(r.ok){
    if(!r.rows.length){ stockMovTbody.innerHTML='<tr><td colspan="5" style="padding:8px;">لا يوجد</td></tr>'; }
    else {
      stockMovTbody.innerHTML = r.rows.map(m=>`<tr><td style='border:2px solid #000;padding:4px;'>${m.id}</td><td style='border:2px solid #000;padding:4px;'>${m.change}</td><td style='border:2px solid #000;padding:4px;'>${m.reason||''}</td><td style='border:2px solid #000;padding:4px;'>${m.ref_id||''}</td><td style='border:2px solid #000;padding:4px;'>${(m.created_at||'').replace('T',' ').slice(0,16)}</td></tr>`).join('');
    }
  } else {
    stockMovTbody.innerHTML = '<tr><td colspan="5" style="padding:8px;color:#b00;">فشل التحميل</td></tr>';
  }
}
function openStockMovements(id, product){
  currentMovProductId = id;
  stockMovMeta.textContent = (product?.name||'') + ' (#'+id+')';
  stockMovModal.style.display='flex';
  loadStockMovements();
}
function closeStockModal(){ stockMovModal.style.display='none'; currentMovProductId=null; }
closeStockMov?.addEventListener('click', closeStockModal);
stockMovModal?.addEventListener('click', e=>{ if(e.target===stockMovModal) closeStockModal(); });
stockMovReload?.addEventListener('click', loadStockMovements);

loadLookups();
fetchProducts('');
async function loadStoresForProducts(){
  try {
    const res = await window.api.storesAdvList('');
    if(res.ok){
      const select = document.getElementById('productStore');
      if(select){
        select.innerHTML = '<option value="">اختر المخزن</option>' + res.rows.map(r=>`<option value="${r.id}">${r.name}</option>`).join('');
      }
    }
  } catch{}
}
// call after DOMContentLoaded or existing init
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', loadStoresForProducts);
}else{ loadStoresForProducts(); }

// تفعيل التركيز السريع بالاختصارات الخاصة بالمنتجات
(function setupProductShortcuts(){
  // عند فتح الصفحة إذا لم يكن هناك تركيز، يمكن F2 أن يركز البحث
  if(document.activeElement === document.body && searchBox){ searchBox.focus(); }
})();
