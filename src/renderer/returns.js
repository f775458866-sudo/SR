// returns.js
const invoiceInput = document.getElementById('invoiceSearch');
const loadInvoiceBtn = document.getElementById('loadInvoiceBtn');
const invoiceMeta = document.getElementById('invoiceMeta');
const saleItemsReturnTbody = document.querySelector('#saleItemsReturnTable tbody');
const returnsTbody = document.querySelector('#returnsTable tbody');
const returnLog = document.getElementById('returnLog');
const statusBar = document.getElementById('statusBar');
const viewReturnsBtn = document.getElementById('viewReturnsBtn');
const backBtn = document.getElementById('backBtn');

let currentSale = null; let returnStats = [];

(function pushNav(){try{const s=JSON.parse(sessionStorage.getItem('nav_stack')||'[]');const cur='returns.html';if(s[s.length-1]!==cur){s.push(cur);sessionStorage.setItem('nav_stack',JSON.stringify(s));}}catch(_){}})();
if(backBtn){backBtn.addEventListener('click',()=>{try{let s=JSON.parse(sessionStorage.getItem('nav_stack')||'[]');s.pop();sessionStorage.setItem('nav_stack',JSON.stringify(s));const prev=s[s.length-1];window.location.href=prev||'index.html';}catch{window.location.href='index.html';}});}

function setStatus(msg,type){
  const span=document.createElement('div');
  span.textContent=msg; span.className='badge fade-in '+(type==='err'?'tag-red':'tag-green');
  statusBar.appendChild(span);
  setTimeout(()=>{span.remove();},4000);
}

async function refreshReturnsTable(){
  try { const r = await window.api.saleReturnsList(); if(r.ok){
    returnsTbody.innerHTML = r.rows.map(rt=>`<tr><td>${(rt.created_at||'').replace('T',' ').slice(0,16)}</td><td>${rt.invoice_no||''}</td><td>${rt.product_name||''}</td><td>${rt.qty}</td><td>${rt.amount?.toFixed? rt.amount.toFixed(2): rt.amount}</td><td>${rt.reason||''}</td></tr>`).join('');
  } else returnsTbody.innerHTML='<tr><td colspan="6">خطأ</td></tr>'; } catch { returnsTbody.innerHTML='<tr><td colspan="6">فشل</td></tr>'; }
}

async function loadInvoice(){
  const inv = (invoiceInput.value||'').trim(); if(!inv){ setStatus('أدخل رقم الفاتورة','err'); return; }
  invoiceMeta.textContent='...تحميل'; saleItemsReturnTbody.innerHTML='';
  try { const sales = await window.api.salesList(); if(!sales.ok){ invoiceMeta.textContent='تعذر جلب المبيعات'; return; }
    const sale = (sales.rows||[]).find(s=> (s.invoice_no||'')===inv);
    if(!sale){ invoiceMeta.textContent='لم يتم العثور على الفاتورة'; currentSale=null; return; }
    // تحميل التفاصيل بالعناصر
    const rSale = await window.api.saleGet(sale.id);
    if(!rSale.ok || !rSale.sale){ invoiceMeta.textContent='فشل تفاصيل الفاتورة'; return; }
    currentSale = rSale.sale;
    invoiceMeta.innerHTML = `<b>التاريخ:</b> ${(currentSale.created_at||'').replace('T',' ').slice(0,16)} | <b>الصافي:</b> ${(currentSale.total||0).toFixed? currentSale.total.toFixed(2): currentSale.total}`;
    await loadReturnStats();
    buildItemsTable();
  } catch(err){ invoiceMeta.textContent='خطأ داخلي'; currentSale=null; }
}

async function loadReturnStats(){
  if(!currentSale) returnStats=[]; else {
    try { const rs = await window.api.saleReturnStats(currentSale.id); if(rs.ok){ returnStats = rs.rows; } else returnStats=[]; } catch { returnStats=[]; }
  }
}

function getReturnedQty(itemId){
  const row = (returnStats||[]).find(r=> r.item_id===itemId); return row? (row.returned_qty||0):0;
}

function buildItemsTable(){
  if(!currentSale){ saleItemsReturnTbody.innerHTML=''; return; }
  saleItemsReturnTbody.innerHTML = currentSale.items.map(it=>{
    const ret = getReturnedQty(it.id); const remain = (it.qty||0)-ret;
    return `<tr data-item="${it.id}"><td>${it.product_name||''}</td><td>${it.qty}</td><td>${ret}</td><td>${remain}</td><td>${remain>0? `<input type='number' min='1' max='${remain}' style='width:90px;' class='retQty' />`: '—'}</td><td>${remain>0? `<input type='text' class='retReason' placeholder='سبب (اختياري)' style='width:140px;' />`: ''}</td><td>${remain>0? `<button class='btn doReturnBtn'>تنفيذ</button>`: ''}</td></tr>`;
  }).join('');
}

saleItemsReturnTbody.addEventListener('click', async (e)=>{
  const btn = e.target.closest('.doReturnBtn'); if(!btn) return;
  const tr = btn.closest('tr'); const itemId = parseInt(tr.dataset.item);
  const qtyInput = tr.querySelector('.retQty'); const reasonInput = tr.querySelector('.retReason');
  const qty = parseFloat(qtyInput.value||''); if(!qty){ setStatus('أدخل كمية','err'); return; }
  const remain = parseFloat(tr.children[3].textContent)||0; if(qty>remain){ setStatus('يتجاوز المتبقي','err'); return; }
  try {
    const r = await window.api.saleReturnCreate({ sale_id: currentSale.id, item_id: itemId, qty, reason: reasonInput.value||'' });
    if(r.ok){
      returnLog.prepend(Object.assign(document.createElement('div'),{textContent:`✔ تمت عملية مرتجع ${qty} (${r.row.product_name||''})` }));
      setStatus('تم المرتجع','ok');
      await loadReturnStats();
      buildItemsTable();
      refreshReturnsTable();
    } else setStatus(r.msg||'فشل','err');
  } catch(err){ setStatus('خطأ','err'); }
});

loadInvoiceBtn.addEventListener('click', loadInvoice);
invoiceInput.addEventListener('keydown',(e)=>{ if(e.key==='Enter') loadInvoice(); });
viewReturnsBtn.addEventListener('click', refreshReturnsTable);

refreshReturnsTable();
