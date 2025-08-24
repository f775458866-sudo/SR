// purchases.js (فاتورة شراء) – بناء على متطلبات الواجهة
const purInvoiceNoEl = document.getElementById('purInvoiceNo');
const purSupplierSelect = document.getElementById('purSupplierSelect');
const purSupplierNameEl = document.getElementById('purSupplierName');
const purDateEl = document.getElementById('purDate');
const purPayTypeEl = document.getElementById('purPayType');
const purItemsTbody = document.querySelector('#purItemsTable tbody');
const purBeforeVatEl = document.getElementById('purBeforeVat');
const purVatEl = document.getElementById('purVat');
const purNetEl = document.getElementById('purNet');
const purSaveBtn = document.getElementById('purSaveBtn');
const purSavePrintBtn = document.getElementById('purSavePrintBtn');
const btnNewPurchase = document.getElementById('btnNewPurchase');
const backBtn = document.getElementById('backBtn');
// تقارير المشتريات
const purchasesReportsPanel = document.getElementById('purchasesReportsPanel');
const btnPurchasesReports = document.getElementById('btnPurchasesReports');
const closePurchasesReports = document.getElementById('closePurchasesReports');
const repFrom = document.getElementById('repFrom');
const repTo = document.getElementById('repTo');
const repSearch = document.getElementById('repSearch');
const repFilterBtn = document.getElementById('repFilterBtn');
const repPurchasesTbody = document.getElementById('repPurchasesTbody');
const repStats = document.getElementById('repStats');
// عناصر المرتجع
const retPanel = document.getElementById('purchaseReturnPanel');
const btnShowReturn = document.getElementById('btnShowReturn');
const closeReturnPanelBtn = document.getElementById('closeReturnPanel');
const retInvoiceSearch = document.getElementById('retPurInvoiceSearch');
const retLoadInvoiceBtn = document.getElementById('retLoadInvoiceBtn');
const retInvoiceMeta = document.getElementById('retInvoiceMeta');
const retItemsTbody = document.getElementById('retItemsTbody');
const retItemDetails = document.getElementById('retItemDetails');
const retQtyInput = document.getElementById('retQtyInput');
const retReasonInput = document.getElementById('retReasonInput');
const retDoReturnBtn = document.getElementById('retDoReturnBtn');
const retLog = document.getElementById('retLog');
const retStatusBar = document.getElementById('retStatusBar');
const retHistoryTbody = document.getElementById('retHistoryTbody');

// ====== إعدادات تتبع (Debug Checkpoint) لتعقب أي قفل تلقائي للحقول ======
window.__PUR_DEBUG = true; // يمكن إطفاؤه من الكونسول: window.__PUR_DEBUG=false
window.purLockEvents = []; // تخزين الأحداث

function initPurchaseDebug(){
  if(!window.__PUR_DEBUG) return;
  try {
    // مراقبة أي تغيّر في خصائص readonly / disabled
    const target = document.getElementById('purItemsTable') || document.body;
    const mo = new MutationObserver(muts=>{
      muts.forEach(m=>{
        if(m.type==='attributes' && (m.attributeName==='readonly' || m.attributeName==='disabled') && m.target && m.target.tagName==='INPUT'){
          const inp = m.target;
          const rec = {
            time: new Date().toISOString(),
            attr: m.attributeName,
            field: inp.dataset.f,
            row: inp.dataset.i,
            value: inp.value,
            stack: (new Error()).stack
          };
          window.purLockEvents.push(rec);
          console.warn('%c[Purchases DEBUG] تغيير سمة '+m.attributeName,'background:#222;color:#ffb300;padding:2px 6px;border-radius:6px;',rec);
        }
      });
    });
    mo.observe(target,{subtree:true, attributes:true, attributeFilter:['readonly','disabled']});
    window.__PUR_MO = mo;
  } catch(err){ console.warn('Purchase debug observer failed', err); }

  // تغليف renderItems لطباعة معلومات كل استدعاء
  if(!window.__origRenderItems && typeof renderItems==='function'){
    window.__origRenderItems = renderItems;
    renderItems = function(debugFlag){
      if(window.__PUR_DEBUG){
        console.debug('[Purchases DEBUG] renderItems()', {editingPurchaseId, rows:pItems.length, sample: pItems[0]});
      }
      return window.__origRenderItems(debugFlag);
    };
  }

  // اعتراض setter للخاصية readOnly على مستوى prototype
  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'readOnly');
    if(desc && !window.__PUR_RO_PATCH){
      Object.defineProperty(HTMLInputElement.prototype,'readOnly',{
        configurable:true,
        get(){ return desc.get.call(this); },
        set(v){
          if(window.__PUR_DEBUG && v){
            const rec = {time:new Date().toISOString(), field:this.dataset && this.dataset.f, row:this.dataset && this.dataset.i, value:this.value, via:'setter', stack:(new Error()).stack};
            window.purLockEvents.push(rec);
            console.warn('%c[Purchases DEBUG] setter readOnly=TRUE','background:#300;color:#ff8080;padding:2px 6px;border-radius:6px;',rec);
          }
          return desc.set.call(this, v);
        }
      });
      window.__PUR_RO_PATCH = true;
    }
  } catch(err){ console.warn('Patch readOnly setter failed', err); }
  // اعتراض setter للخاصية disabled
  try {
    const d2 = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'disabled');
    if(d2 && !window.__PUR_DI_PATCH){
      Object.defineProperty(HTMLInputElement.prototype,'disabled',{
        configurable:true,
        get(){ return d2.get.call(this); },
        set(v){
          if(window.__PUR_DEBUG && v){
            const rec = {time:new Date().toISOString(), field:this.dataset && this.dataset.f, row:this.dataset && this.dataset.i, value:this.value, via:'setter-disabled', stack:(new Error()).stack};
            window.purLockEvents.push(rec);
            console.warn('%c[Purchases DEBUG] setter disabled=TRUE','background:#511;color:#ffaaaa;padding:2px 6px;border-radius:6px;',rec);
          }
          return d2.set.call(this, v);
        }
      });
      window.__PUR_DI_PATCH = true;
    }
  } catch(err){ console.warn('Patch disabled setter failed', err); }

  // اعتراض setAttribute/removeAttribute لأي readonly أو disabled
  try {
    if(!window.__PUR_ATTR_PATCH){
      const oSet = Element.prototype.setAttribute; const oRem = Element.prototype.removeAttribute;
      Element.prototype.setAttribute = function(name,value){
        if(window.__PUR_DEBUG && (name==='readonly' || name==='disabled') && this.tagName==='INPUT'){
          const rec = {time:new Date().toISOString(), mode:'setAttribute', attr:name, field:this.dataset && this.dataset.f, row:this.dataset && this.dataset.i, value:(this.value), stack:(new Error()).stack};
          window.purLockEvents.push(rec);
          console.warn('%c[Purchases DEBUG] setAttribute '+name,'background:#024;color:#8ff;padding:2px 6px;border-radius:6px;',rec);
        }
        return oSet.call(this,name,value);
      };
      Element.prototype.removeAttribute = function(name){
        if(window.__PUR_DEBUG && (name==='readonly' || name==='disabled') && this.tagName==='INPUT'){
          const rec = {time:new Date().toISOString(), mode:'removeAttribute', attr:name, field:this.dataset && this.dataset.f, row:this.dataset && this.dataset.i, value:(this.value), stack:(new Error()).stack};
          window.purLockEvents.push(rec);
          console.warn('%c[Purchases DEBUG] removeAttribute '+name,'background:#240;color:#cfc;padding:2px 6px;border-radius:6px;',rec);
        }
        return oRem.call(this,name);
      };
      window.__PUR_ATTR_PATCH = true;
    }
  } catch(err){ console.warn('Patch attribute methods failed', err); }

  // فحص دوري لحالة الحقول القابلة للتحرير وإصلاح أي قفل غير مقصود
  function auditPurchaseInputs(){
    if(!window.__PUR_DEBUG) return;
    const rows = Array.from(document.querySelectorAll('#purItemsTable tbody tr'));
    rows.forEach(tr=>{
      ['name','qty','price_ex'].forEach(f=>{
        const inp = tr.querySelector(`input[data-f="${f}"]`); if(!inp) return;
        const locked = inp.hasAttribute('readonly') || inp.disabled;
        if(locked){
          // إذا كان القفل بسبب عدم اختيار المورد (data-gated) فلا نفكّه
          if(!purSupplierSelect.value && inp.dataset.gated==='1') return;
          const cs = getComputedStyle(inp);
          const rec = {time:new Date().toISOString(), mode:'audit-scan', field:f, row:inp.dataset.i, value:inp.value, readonly:inp.hasAttribute('readonly'), disabled:inp.disabled, pointerEvents:cs.pointerEvents, opacity:cs.opacity, stack:(new Error()).stack};
          window.purLockEvents.push(rec);
          console.warn('%c[Purchases DEBUG] حقل مقفول أثناء الفحص – سيتم فتحه','background:#850;color:#fff;padding:2px 6px;border-radius:6px;',rec);
          try { inp.removeAttribute('readonly'); inp.disabled=false; } catch{}
        }
      });
    });
  }
  if(!window.__PUR_AUDIT_INT){ window.__PUR_AUDIT_INT = setInterval(auditPurchaseInputs, 2000); }

  // دالة يدوية للفك
  window.forceUnlockPurchases = function(){
    document.querySelectorAll('#purItemsTable input').forEach(inp=>{ inp.removeAttribute('readonly'); inp.disabled=false; });
    console.info('[Purchases DEBUG] forceUnlockPurchases تم تنفيذه');
  };
  console.info('%c[Purchases DEBUG] تفعيل التتبع. لإطفاء: window.__PUR_DEBUG=false ولعرض السجل: window.purLockEvents','background:#004d40;color:#fff;padding:3px 8px;border-radius:6px;');
}

window.togglePurDebug = function(){ window.__PUR_DEBUG = !window.__PUR_DEBUG; console.log('Purchases debug now', window.__PUR_DEBUG); };

// ===== مراقبة تأخر حلقة الأحداث (Event Loop Lag) لتشخيص التجمّد المؤقت =====
;(function(){
  if(window.__PUR_LOOP_MONITOR) return; // منع التكرار
  window.__PUR_LOOP_MONITOR = true;
  let last = performance.now();
  const lags=[];
  function tick(){
    const now = performance.now();
    const diff = now - last; last = now;
    // الفاصل المستهدف ~500ms (نستخدم setTimeout 500)؛ أي تجاوز كبير يدل على عمل متزامن ثقيل
    if(diff > 850){
      // ملاحظة: في بعض البيئات قد تكون Error().stack غير متاحة => يؤدي استدعاء split إلى خطأ
      let _stack = '';
      try {
        const s = (new Error()).stack;
        if(typeof s === 'string') _stack = s.split('\n').slice(0,4).join('\n');
      } catch(_) { /* نتجاهل أي خطأ في الحصول على الستاك */ }
      const rec = { t: new Date().toISOString(), lag: Math.round(diff), stack: _stack };
      lags.push(rec);
      if(window.__PUR_DEBUG) console.warn('%c[Purchases DEBUG] Event loop lag '+rec.lag+'ms','background:#900;color:#fff;padding:2px 6px;border-radius:6px;', rec);
      if(lags.length>50) lags.shift();
      window.purLoopLags = lags;
    }
    setTimeout(tick, 500);
  }
  setTimeout(tick, 500);
})();

// ===== دالة تركيز تلقائي على أول حقل اسم منتج =====
function focusFirstItemName(){
  try {
    const el = document.querySelector('#purItemsTable tbody tr:first-child input[data-f="name"]');
    if(el){ el.focus(); el.select(); }
  } catch(_){ }
}

// ===== كشف عناصر متراكبة قد تحجب الإدخال (أحياناً عنصر شفاف) =====
;(function(){
  if(window.__PUR_OVER_MON) return; window.__PUR_OVER_MON=true;
  function scanOverlaps(){
    if(!window.__PUR_DEBUG) return;
    const nameInp = document.querySelector('#purItemsTable tbody tr:first-child input[data-f="name"]');
    if(!nameInp) return;
    const rect = nameInp.getBoundingClientRect();
    const centerX = rect.left + rect.width/2;
    const centerY = rect.top + rect.height/2;
    const el = document.elementFromPoint(centerX, centerY);
    if(el && el !== nameInp && !nameInp.contains(el)){
      // تحقق إن كان يغطي فعلاً
      const covering = (function(){
        const r2 = el.getBoundingClientRect();
        return !(r2.right < rect.left || r2.left > rect.right || r2.bottom < rect.top || r2.top > rect.bottom);
      })();
      if(covering){
        const info = {time:new Date().toISOString(), blocker: el.tagName, id: el.id, class: el.className, styles: getComputedStyle(el).cssText?.slice(0,200)};
        window.purLockEvents.push({ mode:'overlay-block', ...info });
        console.warn('%c[Purchases DEBUG] عنصر يغطي حقل الإدخال','background:#c50;color:#fff;padding:2px 6px;border-radius:6px;', info, el);
      }
    }
  }
  setInterval(scanOverlaps, 2500);
})();

let suppliersCache = [];
let productsCache = [];
let pItems = []; // { product_id, name, qty, price_ex, price_inc, vat_amount, total_inc }
let supplierGateWarned = false; // تحذير بوابة المورد مرة واحدة حتى يختار المستخدم مورد
const VAT_RATE = 0.15;
let purchaseCounter = 1;
let suggestEl = null;
// حالة المرتجع
let currentPurchase = null; let purchaseReturnStatsCache = []; let selectedReturnItem = null;

function ensureSuggestEl(){ if(suggestEl) return suggestEl; suggestEl=document.createElement('div'); suggestEl.className='suggest-box'; document.body.appendChild(suggestEl); return suggestEl; }
function hideSuggest(){ if(suggestEl) suggestEl.style.display='none'; }

function addEmptyRow(){
  pItems.push({ product_id:null, name:'', qty:'', price_ex:'', price_inc:0, vat_amount:0, total_inc:0, _editing:true });
  renderItems(true);
}

function renderItems(focusLast){
  purItemsTbody.innerHTML='';
  const supplierChosen = !!purSupplierSelect.value;
  pItems.forEach((it,idx)=>{
    const tr=document.createElement('tr');
    const gateAttr = supplierChosen ? '' : ' disabled data-gated="1" style="background:#eee;"';
    tr.innerHTML=`<td style="display:flex;gap:4px;justify-content:center;align-items:center;">
        <button class="del-btn" data-del="${idx}" title="حذف" style="flex:1;">×</button>
        <button class="edit-btn" data-edit="${idx}" title="تعديل" style="flex:1;border:2px solid #000;background:#fff;padding:2px 6px;border-radius:6px;font-weight:700;cursor:pointer;">✎</button>
      </td>
  <td><input class="name" data-i="${idx}" data-f="name" placeholder="${supplierChosen?'اسم / باركود':'اختر المورد أولاً'}" value="${it.name||''}"${gateAttr}></td>
  <td><input type="number" min="1" step="1" data-i="${idx}" data-f="qty" placeholder="كمية" value="${it.qty}"${gateAttr}></td>
  <td><input type="number" min="0" step="0.01" data-i="${idx}" data-f="price_ex" placeholder="سعر" value="${it.price_ex}"${gateAttr}></td>
      <td><input type="text" data-i="${idx}" data-f="vat" value="${it.vat_amount}" readonly></td>
      <td><input type="text" data-i="${idx}" data-f="total_inc" value="${it.total_inc}" readonly></td>`;
    purItemsTbody.appendChild(tr);
  });
  if(focusLast){ const last = purItemsTbody.querySelector('tr:last-child input[data-f="name"]'); if(last) last.focus(); }
  updateTotals();
}

function updateRow(idx){
  const it = pItems[idx]; if(!it) return;
  const qty = parseFloat(it.qty); const price_ex = parseFloat(it.price_ex);
  if(!(qty>0) || !(price_ex>=0)) { it.vat_amount=0; it.price_inc=0; it.total_inc=0; return; }
  const vat_unit = +(price_ex * VAT_RATE).toFixed(4);
  const price_inc_unit = +(price_ex + vat_unit).toFixed(4);
  it.vat_amount = +(vat_unit * qty).toFixed(2);
  it.price_inc = price_inc_unit;
  it.total_inc = +((price_ex + vat_unit) * qty).toFixed(2);
}

function updateTotals(){
  let before=0, vat=0, net=0;
  pItems.forEach(it=>{ const q=parseFloat(it.qty); const px=parseFloat(it.price_ex); if(q>0 && px>=0){ before += (px*q); vat += it.vat_amount||0; net += it.total_inc||0; } });
  purBeforeVatEl.textContent = before.toFixed(2);
  purVatEl.textContent = vat.toFixed(2);
  purNetEl.textContent = net.toFixed(2);
}

// دوال الإكمال التلقائي للصف
function rowComplete(r){ return r && r.product_id && parseFloat(r.qty)>0 && parseFloat(r.price_ex)>=0; }
function maybeAutoAdd(idx){ if(idx === pItems.length-1 && rowComplete(pItems[idx])) addEmptyRow(); }

purItemsTbody.addEventListener('input', (e)=>{
  const inp = e.target.closest('input[data-f]'); if(!inp) return;
  if(!purSupplierSelect.value){ if(!supplierGateWarned){ notify('اختر المورد أولاً','warn'); supplierGateWarned=true; purSupplierSelect.focus(); } return; }
  const idx = parseInt(inp.dataset.i); const f = inp.dataset.f; if(isNaN(idx)) return;
  if(f==='qty'){ pItems[idx].qty = inp.value; }
  else if(f==='price_ex'){ pItems[idx].price_ex = inp.value; }
  else if(f==='name'){
    const raw = inp.value||'';
    const term = toEnglishDigits(raw.trim().toLowerCase());
    if(!term){ hideSuggest(); pItems[idx].product_id=null; return; }
    const matches = productsCache.filter(p=> (p.name && p.name.toLowerCase().includes(term)) || (p.barcode && p.barcode.toString().includes(term))).slice(0,50);
    if(matches.length===0){ hideSuggest(); return; }
    const sb = ensureSuggestEl();
    sb.innerHTML = matches.map(m=>`<button type="button" data-id="${m.id}" data-name="${m.name}" data-price="${m.purchase_price||m.sale_price||0}" data-barcode="${m.barcode||''}"><span style='font-weight:700;'>${m.name}</span> <span style='color:#555;font-size:11px;'>${m.barcode||''}</span></button>`).join('');
    const rect = inp.getBoundingClientRect();
    sb.style.display='block'; sb.style.top=(window.scrollY+rect.bottom)+'px'; sb.style.left=(window.scrollX+rect.left)+'px';
    sb.querySelectorAll('button').forEach(b=> b.onclick=()=> selectPurchaseProduct(idx, b.dataset.id));
    return;
  }
  updateRow(idx);
  const tr = inp.closest('tr'); if(tr){
    const vatInp = tr.querySelector('input[data-f="vat"]');
    const totInp = tr.querySelector('input[data-f="total_inc"]');
    const it = pItems[idx];
    if(vatInp) vatInp.value = it.vat_amount;
    if(totInp) totInp.value = it.total_inc;
  }
  updateTotals();
  if(rowComplete(pItems[idx])) maybeAutoAdd(idx);
});

purItemsTbody.addEventListener('click',(e)=>{
  const del = e.target.closest('button[data-del]');
  if(del){ const idx=parseInt(del.dataset.del); pItems.splice(idx,1); if(pItems.length===0) addEmptyRow(); else renderItems(); return; }
  const edit = e.target.closest('button[data-edit]');
  if(edit){
    const idx = parseInt(edit.dataset.edit);
    const row = pItems[idx]; if(!row) return;
    // قلب حالة التحرير
    row._editing = !row._editing;
    if(!row._editing){ // عند الخروج من التحرير نحدّث السطر
      updateRow(idx);
    }
    renderItems();
  }
});

document.addEventListener('click',(e)=>{ if(suggestEl && !suggestEl.contains(e.target) && !e.target.closest('input[data-f="name"]')) hideSuggest(); });

function selectPurchaseProduct(idx, id){
  const prod = productsCache.find(p=> p.id===parseInt(id)); if(!prod) return;
  const row = pItems[idx];
  row.product_id = prod.id; row.name = prod.name;
  if(row.price_ex==='' || row.price_ex==null) row.price_ex = parseFloat(prod.purchase_price||prod.sale_price||0)||0;
  if(row.qty==='' || row.qty==null) row.qty = 1;
  updateRow(idx); renderItems(); hideSuggest(); maybeAutoAdd(idx);
  const qtyInp=purItemsTbody.querySelector(`input[data-f="qty"][data-i="${idx}"]`); if(qtyInp){ qtyInp.focus(); qtyInp.select(); }
}

purItemsTbody.addEventListener('keydown', (e)=>{
  const inp = e.target.closest('input[data-f="name"]');
  if(!inp) return;
  if(e.key==='Enter'){
    e.preventDefault();
    const term = toEnglishDigits(inp.value.trim()); if(!term) return;
    // أولوية: باركود مطابق ثم اسم كامل ثم يحتوي على الترم
    let prod = productsCache.find(p=> p.barcode && p.barcode.toString()===term);
    if(!prod) prod = productsCache.find(p=> p.name===inp.value.trim());
    if(!prod) prod = productsCache.find(p=> (p.name && p.name.toLowerCase().includes(term.toLowerCase())) || (p.barcode && p.barcode.toString().includes(term)) );
    if(prod){ selectPurchaseProduct(parseInt(inp.dataset.i), prod.id); }
  }
});

function toEnglishDigits(str){ if(str==null) return ''; return (''+str).replace(/[\u0660-\u0669]/g,d=> String(d.charCodeAt(0)-0x0660)).replace(/[\u06F0-\u06F9]/g,d=> String(d.charCodeAt(0)-0x06F0)); }

function validate(){
  let ok=true; purSupplierSelect.classList.remove('error-field');
  if(!purSupplierSelect.value){ ok=false; purSupplierSelect.classList.add('error-field'); }
  if(pItems.length===0 || !pItems.some(it=> it.product_id && it.qty>0)){ ok=false; }
  return ok;
}

// ====== مركز إشعارات خفيف بدل alert (غير حاجز) ======
let notifyHost = null;
function ensureNotifyHost(){
  if(!notifyHost){
    notifyHost = document.createElement('div');
    notifyHost.id='purNotifyHost';
    notifyHost.style.cssText='position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:5000;display:flex;flex-direction:column;gap:8px;max-width:60vw;';
    document.body.appendChild(notifyHost);
  }
  return notifyHost;
}
function notify(msg,type){
  const host = ensureNotifyHost();
  const b=document.createElement('div');
  b.textContent=msg;
  b.style.cssText='font-family:Tahoma,Arial,sans-serif;padding:10px 16px;font-size:13px;font-weight:700;border:2px solid #000;border-radius:16px;box-shadow:0 6px 16px -6px rgba(0,0,0,0.35);background:#fff;opacity:0;transform:translateY(-8px);transition:.35s;max-width:100%;direction:rtl;';
  if(type==='err') b.style.background='#ffe5e5'; else if(type==='ok') b.style.background='#e4f8e9'; else if(type==='warn') b.style.background='#fff7d9';
  host.appendChild(b);
  requestAnimationFrame(()=>{ b.style.opacity='1'; b.style.transform='translateY(0)'; });
  setTimeout(()=>{ b.style.opacity='0'; b.style.transform='translateY(-10px)'; setTimeout(()=>b.remove(),400); }, 3500);
}
window.purNotify = notify;

async function loadSuppliers(){ const r = await window.api.suppliersList(''); if(r.ok){ suppliersCache = r.rows; }
  purSupplierSelect.innerHTML = '<option value="">- اختر -</option>' + suppliersCache.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
}
async function loadProducts(){ const r = await window.api.productsList(''); if(r.ok) productsCache=r.rows; }
async function nextPurchaseNo(){ const r = await window.api.purchaseNext(); if(r.ok) purInvoiceNoEl.value = r.invoice; else purInvoiceNoEl.value = 'P'+purchaseCounter.toString().padStart(6,'0'); }

function resetForm(){
  // إنهاء أي وضع تعديل
  editingPurchaseId = null;
  // إعادة الحقول
  pItems=[]; addEmptyRow();
  purDateEl.value = new Date().toISOString().slice(0,10);
  purSupplierSelect.value=''; purSupplierNameEl.value='';
  purPayTypeEl.value='cash';
  nextPurchaseNo();
  updateTotals();
  // ضبط الأزرار
  const updBtn = document.getElementById('purUpdateBtn');
  if(updBtn) updBtn.style.display='none';
  if(purSaveBtn) purSaveBtn.style.display='inline-block';
  if(purSavePrintBtn) purSavePrintBtn.style.display='inline-block';
  // تركيز تلقائي لاحق (بعد إعادة الرسم)
  setTimeout(focusFirstItemName, 30);
}

purSupplierSelect.addEventListener('change',()=>{ const id=parseInt(purSupplierSelect.value)||null; const s = suppliersCache.find(x=> x.id===id); purSupplierNameEl.value = s? s.name:''; supplierGateWarned=false; renderItems(); if(purSupplierSelect.value) focusFirstItemName(); });

async function savePurchase(print){
  if(!validate()){ alert('تحقق من البيانات'); return; }
  const __t0 = performance.now();
  // تحديث الحسابات لكل بند قبل التجميع
  pItems.forEach((_,i)=> updateRow(i));
  const subtotal_ex = pItems.reduce((a,b)=> a + (b.price_ex * b.qty), 0);
  const vat = pItems.reduce((a,b)=> a + b.vat_amount, 0);
  const total = pItems.reduce((a,b)=> a + b.total_inc, 0);
  const pay_type = purPayTypeEl.value === 'credit' ? 'credit' : 'cash';
  const payload = {
    invoice_no: purInvoiceNoEl.value,
    supplier_id: parseInt(purSupplierSelect.value)||null,
    invoice_date: purDateEl.value,
  supplier_invoice_no: '',
    subtotal_ex, vat, total, pay_type,
    items: pItems.filter(it=> it.product_id).map(it=>({ product_id: it.product_id, qty: it.qty, price_ex: it.price_ex, price_inc: it.price_inc, vat_amount: it.vat_amount, total_inc: it.total_inc }))
  };
  const r = await window.api.purchaseAdd(payload);
  const __t1 = performance.now();
  if(r.ok){
    const duration = (__t1-__t0).toFixed(0);
    if(pay_type==='credit') notify('تم الحفظ (آجل) خلال '+duration+'ms','ok');
    else notify('تم الحفظ بنجاح خلال '+duration+'ms','ok');
    if(print) window.print();
    resetForm(); // تفريغ الحقول بعد الحفظ
  }
  else { notify(r.msg||'فشل الحفظ','err'); }
}

purSaveBtn.addEventListener('click',()=> savePurchase(false));
purSavePrintBtn.addEventListener('click',()=> savePurchase(true));
btnNewPurchase.addEventListener('click',()=> { resetForm(); });
backBtn && backBtn.addEventListener('click',()=>{ window.appNav && window.appNav.goBack(); });

(async ()=>{ await loadSuppliers(); await loadProducts(); await nextPurchaseNo(); resetForm(); initPurchaseDebug(); })();
// فتح لوحة المرتجع تلقائياً عند #return
if(location.hash==='#return' && btnShowReturn && retPanel){ retPanel.style.display='flex'; retRefreshHistory(); }

// ================== موديول مرتجع المشتريات ==================
function retStatus(msg,type){
  if(!retStatusBar) return; const b=document.createElement('div'); b.textContent=msg; b.style.cssText='padding:4px 10px;border:2px solid #000;border-radius:14px;font-size:11px;font-weight:700;'+(type==='err'?'background:#ffe1e1;':'background:#d8f7dd;'); retStatusBar.appendChild(b); setTimeout(()=>b.remove(),4000);
}
async function retRefreshHistory(){
  try { const r = await window.api.purchaseReturnsList(); if(r.ok){ retHistoryTbody.innerHTML = r.rows.map(rt=>`<tr><td style="border:2px solid #000;padding:4px 6px;font-size:11px;">${(rt.created_at||'').replace('T',' ').slice(0,16)}</td><td style="border:2px solid #000;padding:4px 6px;font-size:11px;">${rt.invoice_no||''}</td><td style="border:2px solid #000;padding:4px 6px;font-size:11px;">${rt.product_name||''}</td><td style="border:2px solid #000;padding:4px 6px;font-size:11px;">${rt.qty}</td><td style="border:2px solid #000;padding:4px 6px;font-size:11px;">${rt.amount?.toFixed? rt.amount.toFixed(2): rt.amount}</td><td style="border:2px solid #000;padding:4px 6px;font-size:11px;">${rt.reason||''}</td></tr>`).join(''); } else retHistoryTbody.innerHTML='<tr><td colspan="6" style="border:2px solid #000;padding:6px;font-size:11px;">خطأ</td></tr>'; } catch { retHistoryTbody.innerHTML='<tr><td colspan="6" style="border:2px solid #000;padding:6px;font-size:11px;">فشل</td></tr>'; }
}
async function retLoadInvoice(){
  const inv = (retInvoiceSearch.value||'').trim(); if(!inv){ retStatus('أدخل رقم الفاتورة','err'); return; }
  retInvoiceMeta.textContent='...تحميل'; retItemsTbody.innerHTML=''; selectedReturnItem=null; disableReturnInputs();
  try { const list = await window.api.purchasesList(''); if(!list.ok){ retInvoiceMeta.textContent='تعذر جلب الفواتير'; return; }
    const pur = (list.rows||[]).find(p=> (p.invoice_no||'')===inv); if(!pur){ retInvoiceMeta.textContent='لم يتم العثور على الفاتورة'; currentPurchase=null; return; }
    const full = await window.api.purchaseGet(pur.id); if(!full.ok || !full.row){ retInvoiceMeta.textContent='تفاصيل مفقودة'; return; }
    currentPurchase = full.row; retInvoiceMeta.innerHTML = `<b>التاريخ:</b> ${(currentPurchase.created_at||'').slice(0,10)} | <b>الصافي:</b> ${(currentPurchase.total||0).toFixed? currentPurchase.total.toFixed(2): currentPurchase.total}`;
    await retLoadStats(); retBuildItems();
  } catch(err){ retInvoiceMeta.textContent='خطأ'; currentPurchase=null; }
}
async function retLoadStats(){
  if(!currentPurchase){ purchaseReturnStatsCache=[]; return; }
  try { const r = await window.api.purchaseReturnStats(currentPurchase.id); if(r.ok) purchaseReturnStatsCache = r.rows; else purchaseReturnStatsCache=[]; } catch { purchaseReturnStatsCache=[]; }
}
function retGetReturnedQty(itemId){ const row = (purchaseReturnStatsCache||[]).find(r=> r.item_id===itemId); return row? (row.returned_qty||0):0; }
function retBuildItems(){
  if(!currentPurchase){ retItemsTbody.innerHTML=''; return; }
  retItemsTbody.innerHTML = currentPurchase.items.map(it=>{ const ret = retGetReturnedQty(it.id); const remain = (it.qty||0)-ret; return `<tr data-item="${it.id}" style="cursor:pointer;">`+
    `<td style=\"border:2px solid #000;padding:4px 6px;font-size:11.5px;\">${it.product_name||''}</td>`+
    `<td style=\"border:2px solid #000;padding:4px 6px;font-size:11.5px;\">${it.qty}</td>`+
    `<td style=\"border:2px solid #000;padding:4px 6px;font-size:11.5px;\">${ret}</td>`+
    `<td style=\"border:2px solid #000;padding:4px 6px;font-size:11.5px;\">${remain}</td>`+
    `<td style=\"border:2px solid #000;padding:4px 6px;font-size:11.5px;\">${(it.price_inc||0).toFixed? it.price_inc.toFixed(2): it.price_inc}</td>`+
  `</tr>`; }).join('');
}
function enableReturnInputs(){ retQtyInput.disabled=false; retReasonInput.disabled=false; retDoReturnBtn.disabled=false; }
function disableReturnInputs(){ retQtyInput.disabled=true; retReasonInput.disabled=true; retDoReturnBtn.disabled=true; retQtyInput.value=''; retReasonInput.value=''; }
retItemsTbody && retItemsTbody.addEventListener('click',(e)=>{
  const tr = e.target.closest('tr[data-item]'); if(!tr) return; const id=parseInt(tr.dataset.item); if(!currentPurchase) return; const it = currentPurchase.items.find(x=> x.id===id); if(!it) return; selectedReturnItem=it; const ret = retGetReturnedQty(it.id); const remain=(it.qty||0)-ret; retItemDetails.innerHTML = `<div><b>المنتج:</b> ${it.product_name||''}</div><div><b>الكمية المشتراة:</b> ${it.qty}</div><div><b>مرتجع سابق:</b> ${ret}</div><div><b>المتبقي:</b> ${remain}</div><div><b>سعر شامل للوحدة:</b> ${(it.price_inc||0).toFixed? it.price_inc.toFixed(2): it.price_inc}</div>`; if(remain>0){ enableReturnInputs(); retQtyInput.max=remain; retQtyInput.focus(); } else { disableReturnInputs(); }
});
retDoReturnBtn && retDoReturnBtn.addEventListener('click', async ()=>{
  if(!currentPurchase || !selectedReturnItem){ retStatus('اختر بنداً','err'); return; }
  const qty = parseFloat(retQtyInput.value||''); if(!qty){ retStatus('أدخل كمية','err'); return; }
  const retPrev = retGetReturnedQty(selectedReturnItem.id); const remain = (selectedReturnItem.qty||0)-retPrev; if(qty>remain){ retStatus('يتجاوز المتبقي','err'); return; }
  try { const r = await window.api.purchaseReturnCreate({ purchase_id: currentPurchase.id, item_id: selectedReturnItem.id, qty, reason: retReasonInput.value||'' });
    if(r.ok){ retLog.prepend(Object.assign(document.createElement('div'),{textContent:`✔ مرتجع ${qty} (${selectedReturnItem.product_name||''})`})); retStatus('تم','ok'); await retLoadStats(); retBuildItems(); // تحديث التفاصيل
      const retPrev2 = retGetReturnedQty(selectedReturnItem.id); const remain2 = (selectedReturnItem.qty||0)-retPrev2; retItemDetails.innerHTML += `<div style='margin-top:4px;color:#0a6;'>تم التحديث: متبقي ${remain2}</div>`; if(remain2<=0) disableReturnInputs(); retRefreshHistory(); }
    else retStatus(r.msg||'فشل','err');
  } catch(err){ retStatus('خطأ','err'); }
});
retLoadInvoiceBtn && retLoadInvoiceBtn.addEventListener('click', retLoadInvoice);
retInvoiceSearch && retInvoiceSearch.addEventListener('keydown',(e)=>{ if(e.key==='Enter') retLoadInvoice(); });
btnShowReturn && btnShowReturn.addEventListener('click',()=>{ retPanel.style.display='flex'; retRefreshHistory(); });
closeReturnPanelBtn && closeReturnPanelBtn.addEventListener('click',()=>{ window.location.href='index.html'; });
retPanel && retPanel.addEventListener('mousedown',(e)=>{ if(e.target===retPanel) retPanel.style.display='none'; });

// ================== لوحة تقارير المشتريات ==================
let allPurchasesCache = [];
async function loadAllPurchases(){
  try { const r = await window.api.purchasesList(''); if(r.ok){ allPurchasesCache = r.rows||[]; } else allPurchasesCache=[]; }
  catch{ allPurchasesCache=[]; }
}
function filterPurchases(){
  const from = (repFrom.value||'').trim();
  const to = (repTo.value||'').trim();
  const txt = (repSearch.value||'').trim().toLowerCase();
  let rows = allPurchasesCache.slice();
  if(from){ rows = rows.filter(r=> (r.created_at||'').slice(0,10) >= from); }
  if(to){ rows = rows.filter(r=> (r.created_at||'').slice(0,10) <= to); }
  if(txt){ rows = rows.filter(r=> (r.invoice_no||'').toLowerCase().includes(txt) || (r.supplier_name||'').toLowerCase().includes(txt)); }
  rows.sort((a,b)=> (b.created_at||'').localeCompare(a.created_at||''));
  const total = rows.reduce((s,r)=> s + (r.total||0), 0);
  const vat = rows.reduce((s,r)=> s + (r.vat||0), 0);
  repStats.textContent = `عدد: ${rows.length} | إجمالي: ${total.toFixed(2)} | ضريبة: ${vat.toFixed(2)}`;
  repPurchasesTbody.innerHTML = rows.map(r=>`<tr data-id='${r.id}'>
    <td style='border:2px solid #000;padding:4px 6px;font-size:11.5px;font-weight:700;'>${r.id}</td>
    <td style='border:2px solid #000;padding:4px 6px;font-size:11.5px;'>${r.invoice_no||''}</td>
    <td style='border:2px solid #000;padding:4px 6px;font-size:11.5px;'>${r.supplier_name||''}</td>
    <td style='border:2px solid #000;padding:4px 6px;font-size:11.5px;'>${(r.total||0).toFixed(2)}</td>
    <td style='border:2px solid #000;padding:4px 6px;font-size:11.5px;'>${(r.vat||0).toFixed(2)}</td>
    <td style='border:2px solid #000;padding:4px 6px;font-size:11.5px;'>${r.pay_method||''}</td>
    <td style='border:2px solid #000;padding:4px 6px;font-size:11.5px;'>${(r.created_at||'').replace('T',' ').slice(0,16)}</td>
    <td style='border:2px solid #000;padding:2px 4px;font-size:11px;text-align:center;'>
       <button data-act='edit' style='background:#ffe08a;border:1px solid #000;border-radius:6px;padding:2px 6px;font-weight:700;cursor:pointer;'>تعديل</button>
       <button data-act='del' style='background:#ff5c5c;color:#fff;border:1px solid #000;border-radius:6px;padding:2px 6px;font-weight:700;cursor:pointer;'>حذف</button>
    </td>
  </tr>`).join('') || `<tr><td colspan='8' style='border:2px solid #000;padding:6px;font-size:12px;text-align:center;'>لا توجد نتائج</td></tr>`;
}
async function openPurchasesReports(){
  purchasesReportsPanel.style.display='flex';
  if(!allPurchasesCache.length) await loadAllPurchases();
  filterPurchases();
}
function closePurchasesReportsPanel(){ purchasesReportsPanel.style.display='none'; }

btnPurchasesReports && btnPurchasesReports.addEventListener('click', openPurchasesReports);
closePurchasesReports && closePurchasesReports.addEventListener('click', closePurchasesReportsPanel);
repFilterBtn && repFilterBtn.addEventListener('click', filterPurchases);
repSearch && repSearch.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); filterPurchases(); }});
purchasesReportsPanel && purchasesReportsPanel.addEventListener('mousedown',(e)=>{ if(e.target===purchasesReportsPanel) closePurchasesReportsPanel(); });

// تعامل مع أزرار تعديل/حذف الفاتورة داخل التقارير
repPurchasesTbody && repPurchasesTbody.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-act]'); if(!btn) return;
  const tr = btn.closest('tr[data-id]'); if(!tr) return; const id = parseInt(tr.dataset.id);
  if(btn.dataset.act==='del'){
    if(!confirm('هل تريد حذف الفاتورة؟')) return; // يمكن لاحقاً استبدال confirm بمودال مخصص
    try { const r = await window.api.purchaseDelete(id); if(r && r.ok){
        allPurchasesCache = allPurchasesCache.filter(p=> p.id!==id);
        filterPurchases();
        notify('تم حذف الفاتورة','ok');
      } else notify(r.msg||'فشل حذف الفاتورة','err'); } catch(err){ console.error(err); notify('خطأ في الحذف','err'); }
  } else if(btn.dataset.act==='edit'){
    // تحميل الفاتورة وتهيئة النموذج للتحرير
    try { const r = await window.api.purchaseGet(id); if(!r || !r.ok || !r.row){ notify('تعذر تحميل الفاتورة','err'); return; }
      prepareEditPurchase(r.row);
      closePurchasesReportsPanel();
      notify('تم تحميل الفاتورة للتحرير','ok');
    } catch(err){ console.error(err); notify('خطأ في تحميل الفاتورة','err'); }
  }
});

let editingPurchaseId = null;
function prepareEditPurchase(pur){
  editingPurchaseId = pur.id;
  // تهيئة الحقول
  purInvoiceNoEl.value = pur.invoice_no || '';
  purSupplierSelect.value = pur.supplier_id || '';
  const s = suppliersCache.find(x=> x.id===pur.supplier_id); purSupplierNameEl.value = s? s.name:'';
  purDateEl.value = (pur.invoice_date||'').slice(0,10) || new Date().toISOString().slice(0,10);
  purPayTypeEl.value = pur.pay_type || 'cash';
  // العناصر
  pItems = (pur.items||[]).map(it=>({
    product_id: it.product_id,
    name: it.product_name || '',
    qty: it.qty,
    price_ex: it.price_ex,
    price_inc: it.price_inc,
    vat_amount: it.vat_amount,
  total_inc: it.total_inc,
  _editing: true // اجعل السطر قابلاً للتحرير مباشرةً
  }));
  renderItems();
  setTimeout(focusFirstItemName, 20);
  const updBtn = document.getElementById('purUpdateBtn');
  if(updBtn){ updBtn.style.display='inline-block'; }
  purSaveBtn.style.display='none';
  purSavePrintBtn.style.display='none';
}

async function commitPurchaseEdit(){
  if(!editingPurchaseId){ notify('لا توجد فاتورة في وضع التعديل','warn'); return; }
  if(!pItems.some(it=> it.product_id && it.qty>0)) { notify('لا توجد بنود صالحة','warn'); return; }
  // حساب المجاميع
  pItems.forEach((_,i)=> updateRow(i));
  const subtotal_ex = pItems.reduce((a,b)=> a + (b.price_ex * b.qty), 0);
  const vat = pItems.reduce((a,b)=> a + b.vat_amount, 0);
  const total = pItems.reduce((a,b)=> a + b.total_inc, 0);
  const payload = {
    supplier_id: parseInt(purSupplierSelect.value)||null,
    invoice_date: purDateEl.value,
    supplier_invoice_no: '',
  subtotal_ex: +subtotal_ex.toFixed(2),
  vat: +vat.toFixed(2),
  total: +total.toFixed(2),
  pay_type: purPayTypeEl.value,
    items: pItems.filter(it=> it.product_id).map(it=>({ product_id: it.product_id, qty: it.qty, price_ex: it.price_ex, price_inc: it.price_inc, vat_amount: it.vat_amount, total_inc: it.total_inc }))
  };
  try { const r = await window.api.purchaseUpdate(editingPurchaseId, payload); if(r && r.ok){
      notify('تم حفظ التعديلات','ok');
      // تحديث الكاش
      const idx = allPurchasesCache.findIndex(p=> p.id===editingPurchaseId);
      if(idx>-1){ allPurchasesCache[idx] = { ...allPurchasesCache[idx], ...payload, id: editingPurchaseId, total, vat }; }
  // إعادة ضبط النموذج لوضع فاتورة جديدة
  resetForm();
    } else notify(r.msg||'فشل الحفظ','err'); } catch(err){ console.error(err); notify('خطأ في التعديل','err'); }
}

const purUpdateBtn = document.getElementById('purUpdateBtn');
purUpdateBtn && purUpdateBtn.addEventListener('click', commitPurchaseEdit);
