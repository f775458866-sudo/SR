// pos.js (إعادة تصميم حسب المواصفات الجديدة)
// تخطيط ثابت: شريط علوي، رأس فاتورة، جدول عناصر، شريط سفلي

const backBtn = document.getElementById('backBtn');
const closeBtn = document.getElementById('btnClose');
const itemsTbody = document.querySelector('#itemsTable tbody');
const invoiceNoEl = document.getElementById('invoiceNo');
const invoiceDateEl = document.getElementById('invoiceDate');
const customerSelect = document.getElementById('customerSelect');
// حقل بحث العميل أزيل حسب الترتيب الجديد
const customerNameEl = document.getElementById('customerName');
const paidAmountEl = document.getElementById('paidAmount');
const customerVatEl = document.getElementById('customerVatNo');
const beforeVatEl = document.getElementById('tBeforeVat');
const discountInput = document.getElementById('invoiceDiscount');
const vatEl = document.getElementById('tVat');
const netEl = document.getElementById('tNet');
const remainEl = document.getElementById('tRemain');
const btnNew = document.getElementById('btnNew');
const btnSave = document.getElementById('btnSave');
const btnPrint = document.getElementById('btnPrint');
const btnSavePrint = document.getElementById('btnSavePrint');
const btnSearchInv = document.getElementById('btnSearchInv');
const openProductSearchBtn = document.getElementById('openProductSearchBtn');
const productSearchModal = document.getElementById('productSearchModal');
const modalProductSearchInput = document.getElementById('modalProductSearchInput');
const modalProductResults = document.getElementById('modalProductResults');
// ----------- بحث عن منتج (نافذة منبثقة F5) -----------
let productModalOpen = false;
let productModalResults = [];
let productModalSelected = 0;

function openProductModal(){
  productSearchModal.style.display = 'flex';
  productModalOpen = true;
  modalProductSearchInput.value = '';
  modalProductResults.innerHTML = '';
  productModalResults = [];
  productModalSelected = 0;
  setTimeout(()=>{ modalProductSearchInput.focus(); }, 80);
  renderProductModalResults();
}
function closeProductModal(){
  productSearchModal.style.display = 'none';
  productModalOpen = false;
}
function renderProductModalResults(){
  const q = modalProductSearchInput.value.trim().toLowerCase();
  let results = productsCache;
  if(q){
    results = productsCache.filter(p=> (p.name && p.name.toLowerCase().includes(q)) || (p.barcode && p.barcode.toString().includes(q)) );
  }
  productModalResults = results.slice(0,30);
  modalProductResults.innerHTML = productModalResults.length ? productModalResults.map((p,i)=>
    `<div class="modal-prod-row${i===productModalSelected?' selected':''}" data-idx="${i}" style="display:flex;align-items:center;gap:10px;padding:7px 8px;cursor:pointer;border-bottom:1px solid #e3eaf2;background:${i===productModalSelected?'#e3f0ff':'transparent'};color:#111;">
      <span style="flex:2;font-weight:700;">${p.name}</span>
      <span style="flex:1;font-size:13px;">${p.sale_price||0} ر.س</span>
      <span style="flex:1;font-size:13px;">${p.qty||0} متوفر</span>
    </div>`
  ).join('') : '<div style="padding:12px;text-align:center;color:#888;">لا توجد نتائج</div>';
}

openProductSearchBtn && openProductSearchBtn.addEventListener('click', openProductModal);

document.addEventListener('keydown', (e)=>{
  if(e.key==='F5'){
    e.preventDefault();
    if(productModalOpen){ closeProductModal(); return; }
    openProductModal();
  }
  if(productModalOpen){
    if(e.key==='Escape'){ closeProductModal(); }
    if(e.key==='ArrowDown'){ productModalSelected = Math.min(productModalSelected+1, productModalResults.length-1); renderProductModalResults(); e.preventDefault(); }
    if(e.key==='ArrowUp'){ productModalSelected = Math.max(productModalSelected-1, 0); renderProductModalResults(); e.preventDefault(); }
    if(e.key==='Enter' && productModalResults[productModalSelected]){
      selectProductFromModal(productModalResults[productModalSelected]);
    }
  }
});

modalProductSearchInput && modalProductSearchInput.addEventListener('input', ()=>{
  productModalSelected = 0;
  renderProductModalResults();
});

modalProductResults && modalProductResults.addEventListener('click', (e)=>{
  const row = e.target.closest('.modal-prod-row');
  if(row){
    const idx = parseInt(row.dataset.idx);
    if(productModalResults[idx]) selectProductFromModal(productModalResults[idx]);
  }
});

function selectProductFromModal(prod){
  closeProductModal();
  if(!prod) return;
  // إضافة المنتج للفاتورة مباشرة بكمية 1
  let idx = items.findIndex(it=> it.productId===prod.id);
  if(idx!==-1){ items[idx].qty += 1; updateRow(idx); }
  else {
    let emptyIdx = items.findIndex(it=> !it.productId);
    if(emptyIdx===-1){ addEmptyRow(); emptyIdx = items.length-1; }
    const it = items[emptyIdx];
    it.productId = prod.id;
    it.name = prod.name;
    it.priceInc = parseFloat(prod.sale_price)||0;
    it.qty = 1;
    updateRow(emptyIdx);
  }
  renderItems();
}

// إغلاق النافذة عند الضغط خارجها
productSearchModal && productSearchModal.addEventListener('mousedown', (e)=>{
  if(e.target===productSearchModal) closeProductModal();
});
let suggestEl; // عنصر الاقتراحات

let productsCache = [];
let customersCache = [];
let items = []; // { productId, name, qty, priceInc, priceEx, vatAmount, lineTotalInc }
const VAT_RATE = 0.15; // يمكن لاحقاً قراءتها من الإعدادات
let invoiceCounter = 1; // سيُحدّث من قاعدة البيانات
let editingSaleId = null; // معرف الفاتورة عند وضع التعديل
let allowNegativeSale = false; // يحمَّل من الإعدادات

function pushNav(){
  try { const s=JSON.parse(sessionStorage.getItem('nav_stack')||'[]'); const cur=window.location.pathname.split('/').pop(); if(s[s.length-1]!==cur){ s.push(cur); sessionStorage.setItem('nav_stack', JSON.stringify(s)); } } catch(_){ }
}
function popNav(){
  try { let s=JSON.parse(sessionStorage.getItem('nav_stack')||'[]'); s.pop(); sessionStorage.setItem('nav_stack', JSON.stringify(s)); const prev=s[s.length-1]; if(prev) window.location.href=prev; else window.location.href='index.html'; } catch(_){ window.location.href='index.html'; }
}
pushNav();

async function resetInvoice(){
  items = [];
  renderItems();
  paidAmountEl.value = '0';
  updateTotals();
  editingSaleId = null;
  // تحميل إعداد السماح بالبيع بالسالب
  try {
    const r = await window.api.settingsList().catch(()=>null);
    if(r && r.ok){
      const row = r.rows.find(x=> x.key==='allow_negative_sale');
      allowNegativeSale = !!(row && (row.value==='1'||row.value===1||row.value==='true'));
    } else {
      const ls = localStorage.getItem('allow_negative_sale');
      allowNegativeSale = ls==='1' || ls==='true';
    }
  } catch(_){ }
  try { const r = await window.api.invoiceNext(); if(r && r.ok){ invoiceCounter = parseInt(r.invoice)||invoiceCounter; invoiceNoEl.value = r.invoice; } else { invoiceNoEl.value = invoiceCounter.toString().padStart(6,'0'); } } catch{ invoiceNoEl.value = invoiceCounter.toString().padStart(6,'0'); }
  invoiceDateEl.value = new Date().toISOString().slice(0,10);
}

function calcPriceEx(priceInc){ return +(priceInc / 1.15).toFixed(4); }
function calcVatFromInc(priceInc){ return +(priceInc - calcPriceEx(priceInc)).toFixed(4); }

function addEmptyRow(){
  items.push({ productId:null, name:'', qty:1, priceInc:0, priceEx:0, vatAmount:0, lineTotalInc:0 });
  renderItems(true);
}

function renderItems(focusLast){
  itemsTbody.innerHTML='';
  items.forEach((it, idx)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
  <td><button data-del="${idx}" style="cursor:pointer;border:1px solid #c33;background:#fff;color:#c00;font-weight:bold;padding:0 6px;">×</button></td>
  <td><input class="name" data-f="name" data-i="${idx}" value="${it.name||''}" placeholder="اكتب اسم أو باركود"></td>
  <td><input type="number" step="1" min="1" data-f="qty" data-i="${idx}" value="${toEnglishDigits(it.qty)}" ${!it.productId? 'disabled':''}></td>
  <td><input type="text" data-f="priceEx" data-i="${idx}" value="${toEnglishDigits(it.priceEx)}" readonly></td>
  <td><input type="number" step="0.01" min="0" data-f="priceInc" data-i="${idx}" value="${toEnglishDigits(it.priceInc)}" ${!it.productId? 'disabled':''}></td>
  <td><input type="text" data-f="vatAmount" data-i="${idx}" value="${toEnglishDigits(it.vatAmount)}" readonly></td>
  <td><input type="text" data-f="totalInc" data-i="${idx}" value="${toEnglishDigits(it.lineTotalInc)}" readonly></td>`;
    itemsTbody.appendChild(tr);
  });
  if(focusLast){ const lastName = itemsTbody.querySelector('tr:last-child input[data-f="name"]'); if(lastName) lastName.focus(); }
  updateTotals();
}

function updateRow(idx){
  const it = items[idx]; if(!it) return;
  const qty = it.qty>0? it.qty:1;
  const priceInc = it.priceInc>=0? it.priceInc:0; // سعر وحدة شامل
  it.priceEx = +(priceInc / (1+VAT_RATE)).toFixed(4);
  it.vatAmount = +((it.priceInc - it.priceEx) * qty).toFixed(2);
  it.lineTotalInc = +(priceInc * qty).toFixed(2); // قبل أي خصم إجمالي فاتورة
}

function updateTotals(){
  let beforeVat = 0, vatSum=0, grossInc=0;
  items.forEach(it=>{
    const lineBefore = it.priceEx * it.qty;
    const lineVat = (it.priceInc - it.priceEx) * it.qty;
    beforeVat += lineBefore;
    vatSum += lineVat;
    grossInc += it.lineTotalInc;
  });
  const invoiceDiscount = parseFloat(discountInput.value)||0;
  const net = Math.max(grossInc - invoiceDiscount,0);
  beforeVatEl.textContent = beforeVat.toFixed(2);
  vatEl.textContent = vatSum.toFixed(2);
  netEl.textContent = net.toFixed(2);
  const paid = parseFloat(paidAmountEl.value)||0;
  const remain = net - paid;
  discountInput.value = (invoiceDiscount).toFixed(2);
  remainEl.textContent = (remain<0?0:remain).toFixed(2);
}

// تحديث دون فقدان التركيز (عدم إعادة رسم كامل الجدول أثناء الكتابة)
itemsTbody.addEventListener('input', (e)=>{
  const inp = e.target.closest('input[data-f]'); if(!inp) return;
  const idx = parseInt(inp.dataset.i);
  const field = inp.dataset.f;
  if(isNaN(idx)) return;
  let val = toEnglishDigits(inp.value);
  if(field==='qty'){
    let newQty = parseInt(val)||1;
    if(!allowNegativeSale && items[idx].productId){
      const prod = productsCache.find(p=> p.id===items[idx].productId);
      const stockQty = prod && typeof prod.qty==='number'? prod.qty : 0;
      if(newQty > stockQty){
        alert('لا يمكن تجاوز المخزون المتاح: '+stockQty);
        newQty = stockQty>0? stockQty : 1;
        inp.value = toEnglishDigits(newQty);
      }
    }
    items[idx].qty = newQty;
  } else if(field==='priceInc'){
    items[idx].priceInc = parseFloat(val)||0;
  } else {
    return; // الحقول الأخرى لا تحتاج تحديث جزئي حالياً
  }
  updateRow(idx);
  // تحديث الخلايا المشتقة في نفس الصف فقط
  const tr = inp.closest('tr');
  if(tr){
    const priceExInp = tr.querySelector('input[data-f="priceEx"]');
    const vatInp = tr.querySelector('input[data-f="vatAmount"]');
    const totalIncInp = tr.querySelector('input[data-f="totalInc"]');
    const grandInp = tr.querySelector('input[data-f="grand"]');
    const it = items[idx];
    if(priceExInp) priceExInp.value = toEnglishDigits(it.priceEx);
    if(vatInp) vatInp.value = toEnglishDigits(it.vatAmount);
    if(totalIncInp) totalIncInp.value = toEnglishDigits(it.lineTotalInc);
    if(grandInp) grandInp.value = toEnglishDigits(it.lineTotalInc * it.qty);
  }
  updateTotals();
});

itemsTbody.addEventListener('keydown',(e)=>{
  if(e.key==='Enter'){
    const cell = e.target.closest('input[data-f]'); if(!cell) return;
    const idx = parseInt(cell.dataset.i);
    const field = cell.dataset.f;
    const row = items[idx];
  if(field==='qty'){
      const priceIncInp = itemsTbody.querySelector(`input[data-f="priceInc"][data-i="${idx}"]`); if(priceIncInp){ priceIncInp.disabled=false; priceIncInp.focus(); priceIncInp.select(); }
    } else if(field==='priceInc'){
      if(idx===items.length-1){ addEmptyRow(); }
      const next = itemsTbody.querySelector('tr:last-child input[data-f="name"]'); if(next){ next.focus(); }
    }
    e.preventDefault();
    return;
  }
  if(e.key==='Delete'){
    const inp = e.target.closest('input[data-f]');
    if(inp){ const idx=parseInt(inp.dataset.i); if(items.length>1){ items.splice(idx,1); renderItems(); } }
  }
});

itemsTbody.addEventListener('click', (e)=>{
  const delBtn = e.target.closest('button[data-del]');
  if(delBtn){
    const idx = parseInt(delBtn.dataset.del);
    items.splice(idx,1); renderItems();
  }
});

paidAmountEl.addEventListener('input', updateTotals);
discountInput.addEventListener('input', updateTotals);

btnNew.onclick = ()=>{ invoiceCounter++; resetInvoice(); };
btnSave.onclick = ()=>{ /* حفظ بدون طباعة لاحقاً */ alert('تم الحفظ (نموذج تجريبي)'); };
btnPrint.onclick = ()=>{ window.print(); };
// الزر السفلي (حفظ وطباعة) الآن يفتح واجهة الدفع فقط (مع بقاء اختصار F2 كما هو)
btnSavePrint.onclick = ()=>{ openPayModal(); };
btnSearchInv.onclick = ()=>{ alert('بحث فاتورة (لاحقاً)'); };

backBtn && (backBtn.onclick = ()=>{ popNav(); });
closeBtn && (closeBtn.onclick = ()=>{ popNav(); });

async function loadCustomers(){
  const resp = await window.api.customersList('');
  if(resp.ok){ customersCache = resp.rows; fillCustomerSelect(); }
  // تطبيق اختيار عميل إن تم تمريره من شاشة العملاء
  try {
    const sel = sessionStorage.getItem('pos_selected_customer');
    if(sel){
      const c = JSON.parse(sel);
      const found = customersCache.find(x=> x.name===c.name && (c.phone? x.phone===c.phone : true));
      if(found){
        customerSelect.value = found.id;
        customerNameEl.value = found.name;
        lockCustomerFields(true);
      } else {
        // لو العميل غير موجود في القائمة (مثلاً أضيف للتو)، نعيد تحميل بعد ثانية
        setTimeout(()=>loadCustomers(),500);
      }
      sessionStorage.removeItem('pos_selected_customer');
    }
  } catch{}
}
function fillCustomerSelect(){
  customerSelect.innerHTML = '<option value="">- بدون -</option>' + customersCache.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
}
function lockCustomerFields(lock){
  if(lock){
    customerNameEl.setAttribute('readonly','readonly');
    customerVatEl.setAttribute('readonly','readonly');
  } else {
    customerNameEl.removeAttribute('readonly');
    customerVatEl.removeAttribute('readonly');
  }
}
function unlockCustomerIfNone(){
  if(!customerSelect.value){ lockCustomerFields(false); customerNameEl.value=''; customerVatEl.value=''; }
}
customerSelect.addEventListener('change',()=>{
  const id = parseInt(customerSelect.value)||null;
  const c = customersCache.find(x=>x.id===id);
  if(c){ customerNameEl.value = c.name; lockCustomerFields(true); }
  else { lockCustomerFields(false); customerNameEl.value=''; customerVatEl.value=''; }
});
// تم إزالة بحث العميل

async function loadProducts(){
  const resp = await window.api.productsList('');
  if(resp.ok) productsCache = resp.rows; else productsCache=[];
}

// مستقبل: ربط اسم الصنف بقائمة منسدلة واختيار سريع

// تهيئة متسلسلة
(async ()=>{
  await resetInvoice();
  loadCustomers();
  loadProducts();
  addEmptyRow();
  unlockCustomerIfNone();
  if(window.location.hash.startsWith('#edit-')){
    const id = parseInt(window.location.hash.replace('#edit-',''));
    if(id){
      try { const r = await window.api.saleGet(id); if(r.ok && r.sale){ editingSaleId = id; const s=r.sale; invoiceNoEl.value = s.invoice_no || invoiceNoEl.value; if(s.customer_id){ await loadCustomers(); customerSelect.value=s.customer_id; const c=customersCache.find(x=>x.id===s.customer_id); if(c){ customerNameEl.value=c.name; lockCustomerFields(true); } } items=[]; (s.items||[]).forEach(it=>{ items.push({ productId: it.product_id, name: it.product_name, qty: it.qty, priceInc: it.price, priceEx:0, vatAmount:0, lineTotalInc:0 }); updateRow(items.length-1); }); renderItems(); discountInput.value=(s.discount||0).toFixed(2); paidAmountEl.value=(s.paid||0).toFixed(2); updateTotals(); document.title='تعديل فاتورة '+(s.invoice_no||''); } } catch(_){ }
    }
  }
})();

// ---------- الإكمال التلقائي لاسم الصنف ----------
function ensureSuggestEl(){
  if(suggestEl) return suggestEl;
  suggestEl = document.createElement('div');
  suggestEl.className='suggest-box';
  document.body.appendChild(suggestEl);
  return suggestEl;
}

itemsTbody.addEventListener('input', (e)=>{
  const inp = e.target.closest('input.name[data-f="name"]');
  if(!inp) return;
  const raw = inp.value||'';
  const term = toEnglishDigits(raw.trim().toLowerCase());
  if(!term){ hideSuggest(); items[parseInt(inp.dataset.i)].productId=null; return; }
  const matches = productsCache.filter(p=>
    (p.name && p.name.toLowerCase().includes(term)) || (p.barcode && p.barcode.toString().includes(term))
  ).slice(0,50);
  if(matches.length===0){ hideSuggest(); return; }
  const sb = ensureSuggestEl();
  sb.innerHTML = matches.map(m=>`<button type="button" data-barcode="${m.barcode||''}" data-name="${m.name}" data-price="${m.sale_price||0}" data-id="${m.id}"><span style="font-weight:700;">${m.name}</span> <span style="color:#555;font-size:11px;">${m.barcode||''}</span></button>`).join('');
  const rect = inp.getBoundingClientRect();
  sb.style.display='block';
  sb.style.top = (window.scrollY + rect.bottom)+'px';
  sb.style.left = (window.scrollX + rect.left)+'px';
  sb.querySelectorAll('button').forEach(btn=>{
    btn.onclick = ()=> selectProductForRow(inp, btn.dataset.id);
  });
});

function selectProductForRow(inputEl, prodId){
  const idx = parseInt(inputEl.dataset.i);
  const prod = productsCache.find(p=> p.id === parseInt(prodId));
  if(!prod) return;
  if(!allowNegativeSale){
    // حساب الكمية الحالية لنفس المنتج إن وُجد صف آخر
    const existing = items.find((it,i)=> it.productId===prod.id && i!==idx);
    const existingQty = existing? existing.qty : 0;
    const stockQty = typeof prod.qty==='number'? prod.qty : 0;
    if(existingQty >= stockQty){
      alert('المخزون غير كاف (المتوفر: '+stockQty+')');
      return;
    }
  }
  items[idx].name = prod.name;
  items[idx].productId = prod.id;
  items[idx].priceInc = parseFloat(prod.sale_price)||0;
  items[idx].qty = 1;
  const duplicateIndex = items.findIndex((it,i)=> i!==idx && it.productId===prod.id);
  if(duplicateIndex !== -1){
    if(!allowNegativeSale){
      const stockQty = typeof prod.qty==='number'? prod.qty : 0;
      if(items[duplicateIndex].qty + items[idx].qty > stockQty){
        alert('لا يمكن تجاوز المخزون المتاح: '+stockQty);
        items[idx].productId=null; items[idx].name=''; return;
      }
    }
    items[duplicateIndex].qty += items[idx].qty;
    items.splice(idx,1);
    updateRow(duplicateIndex);
  } else {
    updateRow(idx);
  }
  renderItems();
  hideSuggest();
  const qtyInp = itemsTbody.querySelector(`input[data-f="qty"][data-i="${duplicateIndex !== -1 ? duplicateIndex : idx}"]`);
  if(qtyInp) qtyInp.focus();
}

// اختيار سريع بالـ Enter (خاصة للباركود سكنر)
itemsTbody.addEventListener('keydown', (e)=>{
  const inp = e.target.closest('input.name[data-f="name"]');
  if(!inp) return;
  if(e.key==='Enter'){
    e.preventDefault();
    const term = toEnglishDigits(inp.value.trim());
    if(!term) return;
    // تطابق باركود كامل أولاً
    let prod = productsCache.find(p=> p.barcode && p.barcode.toString()===term);
    if(!prod){
      // تطابق اسم كامل (حساسية بسيطة)
      prod = productsCache.find(p=> p.name===inp.value.trim());
    }
    if(!prod){
      // أول نتيجة تحتوي على المصطلح
      prod = productsCache.find(p=> (p.name && p.name.toLowerCase().includes(term.toLowerCase())) || (p.barcode && p.barcode.toString().includes(term)));
    }
    if(prod){ selectProductForRow(inp, prod.id); }
  }
});

document.addEventListener('click',(e)=>{
  if(suggestEl && !suggestEl.contains(e.target) && !e.target.closest('input.name[data-f="name"]')) hideSuggest();
});

function hideSuggest(){ if(suggestEl) suggestEl.style.display='none'; }
function toEnglishDigits(str){
  if(str==null) return '';
  return (''+str).replace(/[\u0660-\u0669]/g, d=> String(d.charCodeAt(0)-0x0660))
                .replace(/[\u06F0-\u06F9]/g, d=> String(d.charCodeAt(0)-0x06F0));
}

// ---------- حفظ فعلي للفاتورة ----------
async function persistSale(printAfter, paidAmount, payMethod){
  if(items.length===0 || !items.some(it=> it.name && it.qty>0 && it.priceInc>0)) { alert('لا توجد بنود صالحة'); return; }
  const mapped = [];
  for(const it of items){ const prod = productsCache.find(p=> p.name===it.name); if(!prod) continue; mapped.push({ product_id: prod.id, qty: it.qty, price: it.priceInc }); }
  if(mapped.length===0){ alert('لا توجد أصناف معرفة للحفظ'); return; }
  let customer_id = null; const selectedId = parseInt(customerSelect.value)||null; if(selectedId){ customer_id = selectedId; } else { const name = customerNameEl.value.trim(); if(name){ const existing = customersCache.find(c=> c.name===name); if(existing) customer_id=existing.id; } }
  const subtotalInc = mapped.reduce((s,it)=> s + (it.price * it.qty), 0);
  const subtotalEx = +(subtotalInc / (1+VAT_RATE)).toFixed(2);
  const vat = +(subtotalInc - subtotalEx).toFixed(2);
  const discountVal = parseFloat(discountInput.value)||0;
  const total = Math.max(subtotalInc - discountVal,0);
  const payload = { customer_id, subtotal: subtotalEx, vat, total, discount: discountVal, items: mapped, invoice_no: invoiceNoEl.value, paid: paidAmount, pay_method: payMethod };
  const shouldExplicitPrint = !!printAfter;
  const willAuto = autoPrintAfterSale && !printAfter; // تجنب طباعة مزدوجة إذا اختار حفظ+طباعة
  if(editingSaleId) {
    const resp = await window.api.saleUpdate(editingSaleId, payload);
    if(resp.ok) {
      alert('تم تحديث الفاتورة');
      if(shouldExplicitPrint || willAuto) await attemptDirectPrint();
    } else alert(resp.msg||'فشل تحديث الفاتورة');
  } else {
    const resp = await window.api.saleCreate(payload);
    if(resp.ok) {
      alert('تم حفظ الفاتورة رقم '+invoiceNoEl.value);
      if(shouldExplicitPrint || willAuto) await attemptDirectPrint();
      invoiceCounter++;
      await resetInvoice();
      addEmptyRow();
      unlockCustomerIfNone();
    } else alert(resp.msg||'فشل حفظ الفاتورة');
  }
}

// تصميم حراري ضريبي مبسط سعودي
async function buildThermalInvoiceHTML(){
  let company={ name:'', vat:'', cr:'', address:'', phone:'' };
  try {
    ['company_name','vat_number','cr_number','company_address','company_phone'].forEach(k=>{
      const v = localStorage.getItem('setting_'+k); if(v) {
        if(k==='company_name') company.name=v; else if(k==='vat_number') company.vat=v; else if(k==='cr_number') company.cr=v; else if(k==='company_address') company.address=v; else if(k==='company_phone') company.phone=v;
      }
    });
    if(!company.name || !company.vat){
      const r = await window.api.companyPublicInfo();
      if(r && r.ok && r.info){
        company.name = company.name||r.info.name||'';
        company.vat = company.vat||r.info.vat||'';
        company.cr = company.cr||r.info.cr||'';
        company.address = company.address||r.info.address||'';
        company.phone = company.phone||r.info.phone||'';
      }
    }
  } catch(_){ }
  const customFooterNote = (localStorage.getItem('setting_invoice_footer_note')||'').trim();
  let rowsHtml='';
  items.filter(it=> it.productId && it.qty>0).forEach((it,i)=>{
    rowsHtml += `<tr><td style="width:5%">${i+1}</td><td style="text-align:right;width:55%">${it.name||''}</td><td style="width:15%">${it.qty}</td><td style="width:25%">${it.lineTotalInc.toFixed(2)}</td></tr>`;
  });
  const totalInc = parseFloat(netEl.textContent)||0;
  const vat = parseFloat(vatEl.textContent)||0;
  const beforeVat = parseFloat(beforeVatEl.textContent)||0;
  const discount = parseFloat(discountInput.value)||0;
  const invoiceNo = invoiceNoEl.value||'';
  const invoiceDate = new Date().toISOString().replace('T',' ').slice(0,16);
  const customerNameVal = (customerNameEl.value||'').trim();
  function utf8Bytes(str){ const out=[]; for(let i=0;i<str.length;i++){ let c=str.charCodeAt(i); if(c<0x80) out.push(c); else if(c<0x800) out.push(0xC0|(c>>6),0x80|(c&63)); else if(c<0x10000) out.push(0xE0|(c>>12),0x80|((c>>6)&63),0x80|(c&63)); else out.push(0xF0|(c>>18),0x80|((c>>12)&63),0x80|((c>>6)&63),0x80|(c&63)); } return out; }
  function tlvEncode(fields){ const bytes=[]; for(const [tag,val] of fields){ const data=utf8Bytes(val||''); bytes.push(tag); bytes.push(data.length); bytes.push(...data); } return bytes; }
  function bytesToBase64(bytes){ let bin=''; for(const b of bytes) bin+=String.fromCharCode(b); return btoa(bin); }
  async function makeZatcaQrSvg(){
    let seller=(company.name||'Shop').trim(); if(seller.length>40) seller=seller.slice(0,40);
    const vatNo=(company.vat||'').trim();
    const iso=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
    const tlv=tlvEncode([[1,seller],[2,vatNo],[3,iso],[4,''+totalInc],[5,''+vat]]);
    const b64=bytesToBase64(tlv);
    try { if(window.api && window.api.generateQrSvg){ const r=await window.api.generateQrSvg(b64); if(r && r.ok) return r.svg; } } catch(_){ }
    return '<div style="font:10px monospace;color:#900">QR</div>';
  }
  const qrSvg = await makeZatcaQrSvg();
  const style=`*{box-sizing:border-box;}body{font-family:Tahoma,Arial;direction:rtl;font-size:12px;margin:0;padding:6px;width:76mm;}h1,h2{margin:2px 0;text-align:center;font-size:13px;}table{width:100%;border-collapse:collapse;margin-top:4px;}th,td{padding:2px 2px;font-size:11px;border-bottom:1px dashed #555;}th{background:#eee;font-weight:700;} .hdr-line{display:flex;justify-content:space-between;font-size:11px;} .totals{margin-top:4px;border-top:1px dashed #000;padding-top:4px;font-size:12px;} .qr{text-align:center;margin-top:6px;} .small{font-size:10px;} .bold{font-weight:700;}`;
  return `<!DOCTYPE html><html lang='ar' dir='rtl'><head><meta charset='utf-8'><style>${style}</style></head><body>
  <h1>${company.name||'متجر'}</h1>
  <div class='small' style='text-align:center'>رقم ضريبي: ${company.vat||'-'}${company.cr? ' | س.ت: '+company.cr:''}</div>
  <div class='hdr-line'><span>رقم: ${invoiceNo}</span><span>${invoiceDate}</span></div>
  ${customerNameVal? `<div class='hdr-line'><span>عميل:</span><span style='max-width:55mm;text-align:right;'>${customerNameVal}</span></div>`:''}
  <h2>فاتورة ضريبية مبسطة</h2>
  <table><thead><tr><th>#</th><th>الصنف</th><th>كمية</th><th>الإجمالي</th></tr></thead><tbody>${rowsHtml||'<tr><td colspan="4">لا أصناف</td></tr>'}</tbody></table>
  <div class='totals'>
    <div class='hdr-line'><span>الإجمالي قبل الضريبة</span><span>${beforeVat.toFixed(2)}</span></div>
    <div class='hdr-line'><span>ضريبة القيمة المضافة</span><span>${vat.toFixed(2)}</span></div>
    ${discount>0? `<div class='hdr-line'><span>خصم</span><span>${discount.toFixed(2)}</span></div>`:''}
    <div class='hdr-line bold'><span>الإجمالي شامل الضريبة</span><span>${totalInc.toFixed(2)}</span></div>
  </div>
  <div class='qr'>${qrSvg}</div>
  ${customFooterNote? `<div class='small' style='text-align:center;margin-top:4px;white-space:pre-line;'>${customFooterNote}</div>`:''}
  <div class='small' style='text-align:center;margin-top:6px;'>تم إنشاء الفاتورة إلكترونياً</div>
  </body></html>`;
}
async function buildInvoiceHTML(){
  const company = {
    name: localStorage.getItem('setting_company_name') || document.getElementById('companyName')?.value || 'فاتورة بيع',
  };
  const header = (localStorage.getItem('setting_print_header')||'').replace(/\n/g,'<br>');
  const footer = (localStorage.getItem('setting_print_footer')||'').replace(/\n/g,'<br>');
  const customFooterNote = (localStorage.getItem('setting_invoice_footer_note')||'').trim();
  let rowsHtml = '';
  items.filter(it=> it.productId && it.qty>0).forEach((it,i)=>{
    rowsHtml += `<tr><td>${i+1}</td><td>${it.name||''}</td><td>${it.qty}</td><td>${it.priceInc.toFixed(2)}</td><td>${it.lineTotalInc.toFixed(2)}</td></tr>`;
  });
  const total = parseFloat(netEl.textContent)||0;
  const vat = parseFloat(vatEl.textContent)||0;
  const beforeVat = parseFloat(beforeVatEl.textContent)||0;
  const discount = parseFloat(discountInput.value)||0;
  // تقدير إذا فاتورة مبسطة أم ضريبية (لا يوجد عميل معرف برقم ضريبي)
  const customerNameVal = customerNameEl.value.trim();
  // لا نملك رقم ضريبي للعميل هنا، نستخدم المنطق المبسط
  const simplified = !customerNameVal || /نقد/.test(customerNameVal) || customerSelect.value==="";
  const invoiceTitle = simplified? 'فاتورة مبسطة' : 'فاتورة ضريبية';
  // ---- QR ZATCA (TLV + SVG) (مبسط) ----
  function utf8Bytes(str){ const out=[]; for(let i=0;i<str.length;i++){ let c=str.charCodeAt(i); if(c<0x80) out.push(c); else if(c<0x800) out.push(0xC0|(c>>6),0x80|(c&63)); else if(c<0x10000) out.push(0xE0|(c>>12),0x80|((c>>6)&63),0x80|(c&63)); else out.push(0xF0|(c>>18),0x80|((c>>12)&63),0x80|((c>>6)&63),0x80|(c&63)); } return out; }
  function tlvEncode(fields){ const bytes=[]; for(const [tag,val] of fields){ const data=utf8Bytes(val||''); bytes.push(tag); bytes.push(data.length); bytes.push(...data); } return bytes; }
  function bytesToBase64(bytes){ let bin=''; for(const b of bytes) bin+=String.fromCharCode(b); return btoa(bin); }
  const QR_VERSIONS_BASE={1:21,2:25,3:29,4:33};
  const CAP_Q={1:13,2:22,3:34,4:48};
  const CAP_M={1:16,2:28,3:44,4:64};
  // إضافة مستوى L لزيادة السعة إذا فشلت Q ثم M
  const CAP_L={1:20,2:32,3:52,4:78};
  const EC_LEN_Q={1:13,2:22,3:36,4:52};
  const EC_LEN_M={1:10,2:16,3:26,4:36};
  const EC_LEN_L={1:7,2:10,3:15,4:20};
  const GF_EXP=new Array(512), GF_LOG=new Array(256); (function(){ let x=1; for(let i=0;i<255;i++){ GF_EXP[i]=x; GF_LOG[x]=i; x<<=1; if(x&0x100) x^=0x11d; } for(let i=255;i<512;i++) GF_EXP[i]=GF_EXP[i-255]; })();
  function gfMul(a,b){ if(a===0||b===0) return 0; return GF_EXP[(GF_LOG[a]+GF_LOG[b])%255]; }
  function gfPow(a,e){ let r=1; for(let i=0;i<e;i++) r=gfMul(r,a); return r; }
  function polyMul(p,q){ const r=new Array(p.length+q.length-1).fill(0); for(let i=0;i<p.length;i++) for(let j=0;j<q.length;j++) r[i+j]^=gfMul(p[i],q[j]); return r; }
  function rsGenPoly(ec){ let poly=[1]; for(let i=0;i<ec;i++) poly=polyMul(poly,[1,gfPow(2,i)]); return poly; }
  function polyMod(msg,gen){ let res=msg.slice(); for(let i=0;i<msg.length-(gen.length-1);i++){ const coef=res[i]; if(coef!==0){ for(let j=1;j<gen.length;j++) res[i+j]^=gfMul(gen[j],coef); } } return res.slice(res.length-(gen.length-1)); }
  function buildQRData(dataBytes){
    const tryLevels=['Q','M','L']; // L أخيراً لاستيعاب بيانات أطول
    for(const lvl of tryLevels){
      for(let v=1; v<=4; v++){
        const capacity = (lvl==='Q'? CAP_Q[v]: (lvl==='M'? CAP_M[v]: CAP_L[v]));
        if(dataBytes.length <= capacity){
          const ecLen = (lvl==='Q'? EC_LEN_Q[v]: (lvl==='M'? EC_LEN_M[v]: EC_LEN_L[v]));
          const dataTarget = capacity;
          let bits=[]; const pushBits=(val,len)=>{ for(let i=len-1;i>=0;i--) bits.push((val>>i)&1); };
          pushBits(0b0100,4); pushBits(dataBytes.length,8); for(const b of dataBytes) pushBits(b,8);
          const maxBits=dataTarget*8; let rem=maxBits-bits.length; if(rem>0){ const t=Math.min(4,rem); for(let i=0;i<t;i++) bits.push(0); }
          while(bits.length%8!==0) bits.push(0);
          const codewords=[]; for(let i=0;i<bits.length;i+=8){ let b=0; for(let j=0;j<8;j++) b=(b<<1)|bits[i+j]; codewords.push(b); }
          const pad=[0xEC,0x11]; let pi=0; while(codewords.length<dataTarget){ codewords.push(pad[pi%2]); pi++; }
          const gen=rsGenPoly(ecLen); const ec=polyMod(codewords.concat(new Array(ecLen).fill(0)), gen);
          return {version:v, codewords: codewords.concat(ec)};
        }
      }
    }
    throw new Error('QR TLV too long');
  }
  function placeQR(v,codewords){ const size=QR_VERSIONS_BASE[v]; const m=Array.from({length:size},()=>new Array(size).fill(null)); const finder=(r,c)=>{ for(let i=0;i<7;i++) for(let j=0;j<7;j++){ const edge=i===0||i===6||j===0||j===6; const core=i>=2&&i<=4&&j>=2&&j<=4; m[r+i][c+j]=(edge||core)?1:0; } }; finder(0,0); finder(0,size-7); finder(size-7,0); for(let i=0;i<size;i++){ if(m[6][i]==null) m[6][i]= i%2===0?1:0; if(m[i][6]==null) m[i][6]= i%2===0?1:0; } m[4*v+9] && (m[4*v+9][8]=1); for(let i=0;i<9;i++){ if(m[i][8]==null) m[i][8]=0; if(m[8][i]==null) m[8][i]=0; } for(let i=size-8;i<size;i++){ if(m[8][i]==null) m[8][i]=0; if(m[i][8]==null) m[i][8]=0; } let dirUp=true; let col=size-1; let bitIdx=0; const total=codewords.length*8; const getBit=ci=>{ const byte=codewords[Math.floor(ci/8)]; return (byte>>(7-(ci%8)))&1; }; while(col>0){ if(col===6) col--; for(let rIter=0;rIter<size;rIter++){ const r=dirUp? size-1-rIter : rIter; for(let cOff=0;cOff<2;cOff++){ const c=col-cOff; if(m[r][c]==null){ const bit= bitIdx<total? getBit(bitIdx):0; bitIdx++; m[r][c]= bit ^ ((r+c)%2===0?1:0); } } } col-=2; dirUp=!dirUp; } // format
  function format(){ let val=0; let vBits=val<<10; const poly=0b10100110111; for(let i=14;i>=10;i--){ if((vBits>>i)&1) vBits ^= (poly<<(i-10)); } let f=(val<<10)|vBits; f^=0b101010000010010; return f; } const f=format(); for(let i=0;i<15;i++){ const bit=(f>>i)&1; if(i<6) m[i][8]=bit; else if(i===6) m[i+1][8]=bit; else if(i<8) m[size-15+i][8]=bit; else m[8][14-i]=bit; if(i<8) m[8][size-1-i]=bit; else if(i<9) m[8][15-i]=bit; else m[14-i][8]=bit; } return m; }
  function matrixToSvg(mat,scale){ const n=mat.length; let svg=`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${n} ${n}' width='${n*scale}' height='${n*scale}'>`+"<rect width='100%' height='100%' fill='#fff'/>"; for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(mat[r][c]) svg+=`<rect x='${c}' y='${r}' width='1' height='1' fill='#000'/>`; return svg+="</svg>"; }
  // استخدام المولد الموحد (qr-lite) بدلاً من النسخة اليدوية لتوسيع السعة
  async function makeZatcaQrSvg(){
    let seller = (localStorage.getItem('setting_company_name')||'Shop').trim(); if(seller.length>40) seller = seller.slice(0,40);
    const vatNo = (localStorage.getItem('setting_vat_number')||'').trim();
    const iso = new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
    const tlv = tlvEncode([[1,seller],[2,vatNo],[3,iso],[4,''+total],[5,''+vat]]);
    const b64 = bytesToBase64(tlv);
    try {
      if(window.api && window.api.generateQrSvg){
        const r = await window.api.generateQrSvg(b64);
        if(r && r.ok) return r.svg;
      }
      if(window.__qrLite){ return window.__qrLite.generateQR(b64,{level:'Q',scale:2}); }
      return '<div style="font:9px monospace;color:#900">QR Fallback</div>';
  } catch(e){ return `<div style="font:9px monospace;color:#900">QR ERR ${(e&&e.message)||''}</div>`; }
  }
  const qrSvg = await makeZatcaQrSvg();
  const width = parseInt(localStorage.getItem('setting_paper_width')||'0') || 80; // مم للطابعة الحرارية
  const isThermal = width <= 90; // معيار بسيط
  const style = isThermal ? `body{font-family:Tahoma,Arial;direction:rtl;font-size:12px;margin:0;padding:6px;width:${width}mm;} table{width:100%;border-collapse:collapse;} td,th{padding:2px 4px;border-bottom:1px dashed #999;text-align:center;font-size:12px;} h1{font-size:14px;margin:4px 0;text-align:center;}`
                          : `body{font-family:Arial;direction:rtl;font-size:13px;margin:10px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ccc;padding:4px 6px;font-size:12px;text-align:center;} h1{text-align:center;}`;
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${style}</style></head><body>
    <div class="header"><h1>${company.name}</h1>${header? `<div class="hdr">${header}</div>`:''}</div>
    <h2 style="text-align:center;margin:4px 0 8px;font-size:14px;">${invoiceTitle}</h2>
    <table><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    <div style="margin-top:6px;font-size:12px;">
      <div>قبل الضريبة: ${beforeVat.toFixed(2)}</div>
      <div>الضريبة: ${vat.toFixed(2)}</div>
      <div>الخصم: ${discount.toFixed(2)}</div>
      <div style="font-weight:bold;">الصافي: ${total.toFixed(2)}</div>
    </div>
  <div style="margin-top:8px;text-align:center;">${qrSvg}</div>
  ${footer? `<div style="margin-top:8px;text-align:center;">${footer}</div>`:''}
  ${customFooterNote? `<div style="margin-top:6px;text-align:center;font-weight:600;white-space:pre-line;">${customFooterNote}</div>`:''}
  <div style="text-align:center;margin-top:8px;">شكراً لزيارتكم</div>
  </body></html>`;
}

async function attemptDirectPrint(){
  try {
    const invoiceNo = invoiceNoEl.value;
    // محاولة كشف الطابعة (إن وُجدت قيمة default_printer في الإعدادات نحاول استرجاعها من التخزين)
    const printerName = localStorage.getItem('setting_default_printer') || null;
    let thermalDetected = false;
    if(printerName){
      try { const det = await window.api.printerDetectType(printerName); if(det && det.ok) thermalDetected = !!det.thermal; } catch(_){ }
    }
    // fallback إلى عرض الورق فقط إذا لم تُكتشف
    if(!thermalDetected){
      const widthSetting = parseInt(localStorage.getItem('setting_paper_width')||'80')||80;
      thermalDetected = widthSetting <= 120;
    }
    if(thermalDetected){
      const html = await buildThermalInvoiceHTML();
      const r = await window.api.directPrintInvoice(html, { mode:'thermal', invoice: invoiceNo });
      if(!r || !r.ok) throw new Error(r && r.msg ? r.msg : 'فشل طباعة حرارية');
    } else {
      const r = await window.api.directPrintInvoice(null, { mode:'a4', invoice: invoiceNo });
      if(!r || !r.ok) throw new Error(r && r.msg ? r.msg : 'فشل طباعة A4');
    }
  } catch(err){
    console.warn('Direct print fallback to window.print()', err.message);
    window.print();
  }
}

btnSave.onclick = async ()=>{ await persistSale(false); };

// ---------- شاشة الدفع المنبثقة وسلوك F2 ----------
let payModalOpen = false;
let payF2Pressed = false;
let payMethod = 'cash';
const payModal = document.getElementById('payModal');
const payBeforeVat = document.getElementById('payBeforeVat');
const payDiscount = document.getElementById('payDiscount');
const payVat = document.getElementById('payVat');
const payNet = document.getElementById('payNet');
const payPaid = document.getElementById('payPaid');
const payRemain = document.getElementById('payRemain');
const payMsg = document.getElementById('payMsg');
const paySaveBtn = document.getElementById('paySaveBtn');
const paySavePrintBtn = document.getElementById('paySavePrintBtn');
const payMethods = document.getElementById('payMethods');
const payCancelBtn = document.getElementById('payCancelBtn');

function openPayModal(){
  payModal.style.display = 'flex';
  payModalOpen = true;
  payF2Pressed = false;
  // تعبئة القيم
  payBeforeVat.textContent = beforeVatEl.textContent;
  payDiscount.textContent = discountInput.value;
  payVat.textContent = vatEl.textContent;
  payNet.textContent = netEl.textContent;
  payPaid.value = '';
  payRemain.value = netEl.textContent;
  payMsg.textContent = '';
  payMethod = 'cash';
  Array.from(payMethods.querySelectorAll('.pay-method')).forEach(btn=> btn.classList.remove('active'));
  const cashBtn = payMethods.querySelector('[data-method="cash"]');
  if(cashBtn) cashBtn.classList.add('active');
  setTimeout(()=>{ payPaid.focus(); }, 100);
}

function closePayModal(){
  payModal.style.display = 'none';
  payModalOpen = false;
  payF2Pressed = false;
}

payMethods && payMethods.addEventListener('click',e=>{
  const btn = e.target.closest('.pay-method');
  if(!btn) return;
  payMethod = btn.dataset.method;
  Array.from(payMethods.querySelectorAll('.pay-method')).forEach(b=> b.classList.remove('active'));
  btn.classList.add('active');
});

payPaid && payPaid.addEventListener('input',()=>{
  const paid = parseFloat(payPaid.value)||0;
  const net = parseFloat(payNet.textContent)||0;
  const remain = Math.max(net - paid,0);
  payRemain.value = remain.toFixed(2);
  payMsg.textContent = '';
});

paySaveBtn && paySaveBtn.addEventListener('click', async ()=>{
  await handlePayModalSave(false);
});
paySavePrintBtn && paySavePrintBtn.addEventListener('click', async ()=>{
  await handlePayModalSave(true);
});
payCancelBtn && payCancelBtn.addEventListener('click', ()=>{ closePayModal(); });

async function handlePayModalSave(printAfter){
  const paid = parseFloat(payPaid.value)||0;
  const net = parseFloat(payNet.textContent)||0;
  if(paid < net){
    payMsg.textContent = 'المبلغ المسدد أقل من المستحق';
    payPaid.focus();
    return;
  }
  closePayModal();
  await persistSale(printAfter, paid, payMethod);
}

document.addEventListener('keydown',(e)=>{
  if(e.key==='F2'){
    e.preventDefault();
    if(!payModalOpen){
      openPayModal();
    }else{
      if(payF2Pressed) return; // منع التكرار
      payF2Pressed = true;
      payPaid.value = payNet.textContent;
      payRemain.value = '0.00';
      setTimeout(async ()=>{
        closePayModal();
        await persistSale(true, parseFloat(payNet.textContent), payMethod);
      }, 120);
    }
  }
  if(payModalOpen && ['1','2','3'].includes(e.key)){
    const map = { '1':'cash','2':'card','3':'credit' };
    const target = map[e.key];
    const btn = payMethods.querySelector(`.pay-method[data-method="${target}"]`);
    if(btn){
      payMethod = target;
      Array.from(payMethods.querySelectorAll('.pay-method')).forEach(b=> b.classList.remove('active'));
      btn.classList.add('active');
    }
  }
  if(payModalOpen && e.key==='Escape') closePayModal();
  if(payModalOpen && e.key==='Enter'){ e.preventDefault(); handlePayModalSave(false); }
  if(payModalOpen && (e.ctrlKey && (e.key==='p' || e.key==='P'))){ e.preventDefault(); handlePayModalSave(true); }
});

// ---------------- بحث المنتج العلوي (باركود أو اسم) ----------------
function addOrMergeProduct(prod){
  if(!prod) return;
  let existingIdx = items.findIndex(it=> it.productId===prod.id);
  if(existingIdx!==-1){
    if(!allowNegativeSale){
      const stockQty = typeof prod.qty==='number'? prod.qty : 0;
      if(items[existingIdx].qty + 1 > stockQty){
        alert('المخزون غير كاف (المتاح: '+stockQty+')');
        return;
      }
    }
    items[existingIdx].qty += 1; updateRow(existingIdx);
  } else {
    let idx = items.findIndex(it=> !it.productId);
    if(idx===-1){ addEmptyRow(); idx = items.length-1; }
    const it = items[idx];
    it.productId = prod.id;
    it.name = prod.name;
    if(!allowNegativeSale){
      const stockQty = typeof prod.qty==='number'? prod.qty : 0;
      if(stockQty < 1){ alert('الصنف نفذ من المخزون'); return; }
    }
    it.priceInc = parseFloat(prod.sale_price)||0;
    it.qty = 1;
    updateRow(idx);
  }
  renderItems();
  const q = itemsTbody.querySelector('tr:last-child input[data-f="qty"]'); if(q){ q.disabled=false; q.focus(); q.select(); }
}

function searchProductByTerm(term){
  if(!term) return null;
  // أرقام عربية إلى إنجليزية
  term = toEnglishDigits(term.trim());
  // أولاً محاولة باركود مطابق
  let prod = productsCache.find(p=> p.barcode && p.barcode.toString()===term);
  if(prod) return prod;
  // محاولة اسم كامل
  prod = productsCache.find(p=> p.name===term);
  if(prod) return prod;
  // يبدأ بالاسم
  const matches = productsCache.filter(p=> p.name && p.name.startsWith(term));
  if(matches.length===1) return matches[0];
  if(matches.length>1) return matches[0]; // مؤقتاً أول نتيجة
  return null;
}

productSearchEl && productSearchEl.addEventListener('keydown',(e)=>{
  if(e.key==='Enter'){
    e.preventDefault();
    const term = productSearchEl.value.trim();
    const prod = searchProductByTerm(term);
    if(prod){ addOrMergeProduct(prod); productSearchEl.value=''; }
    else { productSearchEl.select(); }
  }
});

// اقتراحات أثناء الكتابة (أسماء)
productSearchEl && productSearchEl.addEventListener('input', (e)=>{
  const term = productSearchEl.value.trim();
  if(!term){ hideSuggest(); return; }
  const matches = productsCache.filter(p=> p.name && p.name.startsWith(term)).slice(0,25);
  if(matches.length===0){ hideSuggest(); return; }
  const sb = ensureSuggestEl();
  sb.innerHTML = matches.map(m=>`<button type="button" data-id="${m.id}" data-name="${m.name}" data-price="${m.sale_price||0}" data-barcode="${m.barcode||''}">${m.name}</button>`).join('');
  const rect = productSearchEl.getBoundingClientRect();
  sb.style.display='block';
  sb.style.top = (window.scrollY + rect.bottom)+'px';
  sb.style.left = (window.scrollX + rect.left)+'px';
  sb.querySelectorAll('button').forEach(btn=>{
    btn.onclick = ()=>{
      const id = parseInt(btn.dataset.id);
      const prod = productsCache.find(p=> p.id===id);
      addOrMergeProduct(prod);
      hideSuggest();
      productSearchEl.value='';
    };
  });
});
