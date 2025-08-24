// sales.js (سجل المبيعات)
const tbody = document.getElementById('salesTbody');
const searchInput = document.getElementById('salesSearch');
const modal = document.getElementById('saleViewModal');
const closeModalBtn = document.getElementById('closeSaleModal');
const saleSummarySection = document.getElementById('saleSummarySection');
const saleItemsTbody = document.querySelector('#saleItemsTable tbody');
const backBtn = document.getElementById('backBtn');
let salesCache = [];
let currentPage = 1; let pageSize = 50;
const pgPrev = document.getElementById('pgPrev');
const pgNext = document.getElementById('pgNext');
const pgInfo = document.getElementById('pgInfo');
const pgSize = document.getElementById('pgSize');
const pgTotal = document.getElementById('pgTotal');

searchInput.removeAttribute('disabled');
// الاعتماد على navigation.js
if(backBtn){ backBtn.addEventListener('click', ()=> window.appNav && window.appNav.goBack()); }

async function loadSales(){
  try { const r = await window.api.salesList(); if(r.ok){ salesCache = r.rows; } else salesCache=[]; } catch{ salesCache=[]; }
  renderTable();
}

function renderTable(){
  const term = (searchInput.value||'').trim().toLowerCase();
  const filtered = salesCache.filter(s=>{
    if(!term) return true;
    return (s.invoice_no||'').toLowerCase().includes(term) || (s.customer_name||'').toLowerCase().includes(term);
  });
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if(currentPage > pages) currentPage = pages;
  const start = (currentPage-1)*pageSize;
  const pageRows = filtered.slice(start, start+pageSize);
  tbody.innerHTML='';
  pageRows.forEach(s=>{
    const tr=document.createElement('tr');
  const customerLabel = (!s.customer_id || s.customer_id===0) ? 'نقدًا' : (s.customer_name || 'نقدًا');
  tr.innerHTML = `<td>${s.invoice_no||''}</td><td>${(s.created_at||'').replace('T',' ').slice(0,16)}</td><td>${customerLabel}</td><td>${(s.subtotal||0).toFixed? s.subtotal.toFixed(2): s.subtotal}</td><td>${(s.vat||0).toFixed? s.vat.toFixed(2): s.vat}</td><td>${(s.total||0).toFixed? s.total.toFixed(2): s.total}</td><td>${s.pay_method||'-'}</td><td class="actions-cell"><button data-act="view" data-id="${s.id}" class="btn">عرض</button><button data-act="edit" data-id="${s.id}" class="btn" style="background:#fff5e0;">تعديل</button><button data-act="pdf" data-id="${s.id}" class="btn">PDF</button><button data-act="print" data-id="${s.id}" class="btn">طباعة</button></td>`;
    tbody.appendChild(tr);
  });
  // تحديث شريط الصفحات
  pgInfo && (pgInfo.textContent = `${currentPage} / ${pages}`);
  pgPrev && (pgPrev.disabled = currentPage<=1);
  pgNext && (pgNext.disabled = currentPage>=pages);
  pgTotal && (pgTotal.textContent = `الإجمالي: ${total}`);
}

tbody.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-act]'); if(!btn) return;
  const id = parseInt(btn.dataset.id);
  if(btn.dataset.act==='view'){ openModal(id); }
  if(btn.dataset.act==='edit'){
    // فتح صفحة نقطة البيع مع هاش يحمل رقم الفاتورة للتحضير لاحقاً لتحميلها (إن لم يكن منطق التعديل مكتملاً سيُعامل كنسخة جديدة)
    window.location.href = 'pos.html#edit-'+id;
    return;
  }
  if(btn.dataset.act==='print'){ window.print(); }
  if(btn.dataset.act==='pdf'){
    try {
      const sale = salesCache.find(x=>x.id===id);
      if(!sale){ alert('غير موجود'); return; }
      // السلوك الأصلي: استخدام التوليد الداخلي لتصميم الفاتورة القياسي
      const r = await window.api.saleInvoicePdfHtml({ sale_id: id });
      if(r.ok) alert('تم إنشاء PDF: '+r.file); else alert(r.msg||'فشل PDF');
    } catch(err){ alert('فشل PDF'); }
  }
});

function openModal(id){
  const s = salesCache.find(x=> x.id===id); if(!s) return;
  saleSummarySection.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;font-size:13px;">
    <div><b>رقم الفاتورة:</b> ${s.invoice_no||''}</div>
    <div><b>التاريخ:</b> ${(s.created_at||'').replace('T',' ').slice(0,16)}</div>
    <div><b>العميل:</b> ${s.customer_name||'-'}</div>
    <div><b>قبل الضريبة:</b> ${(s.subtotal||0).toFixed? s.subtotal.toFixed(2): s.subtotal}</div>
    <div><b>الضريبة:</b> ${(s.vat||0).toFixed? s.vat.toFixed(2): s.vat}</div>
    <div><b>الصافي:</b> ${(s.total||0).toFixed? s.total.toFixed(2): s.total}</div>
    <div><b>طريقة الدفع:</b> ${s.pay_method||'-'}</div>
  </div>`;
  // جلب العناصر بالتكامل لاحقاً (لدينا channel sale-get)
  loadSaleItems(id);
  modal.style.display='flex';
  try {
    const editBtn = document.getElementById('editSaleBtn');
    if(editBtn){
      editBtn.onclick = ()=>{ window.location.href = 'pos.html#edit-'+id; };
    }
  } catch(_){ }
}

async function loadSaleItems(id){
  saleItemsTbody.innerHTML='<tr><td colspan="4">...تحميل</td></tr>';
  try { const r = await window.api.saleGet(id); if(r.ok && r.sale){
    const sale = r.sale; // sale.items
    if(sale.items && sale.items.length){
      saleItemsTbody.innerHTML = sale.items.map(it=>`<tr><td>${it.product_name||''}</td><td>${it.qty}</td><td>${it.price}</td><td>${(it.price * it.qty).toFixed(2)}</td></tr>`).join('');
    } else saleItemsTbody.innerHTML='<tr><td colspan="4">لا توجد بنود</td></tr>';
  } else saleItemsTbody.innerHTML='<tr><td colspan="4">تعذر التحميل</td></tr>'; } catch{ saleItemsTbody.innerHTML='<tr><td colspan="4">خطأ</td></tr>'; }
}

closeModalBtn.addEventListener('click',()=>{ modal.style.display='none'; });
modal.addEventListener('mousedown',(e)=>{ if(e.target===modal) modal.style.display='none'; });

searchInput.addEventListener('input', renderTable);
pgPrev && pgPrev.addEventListener('click', ()=>{ if(currentPage>1){ currentPage--; renderTable(); window.scrollTo({top:0,behavior:'smooth'}); } });
pgNext && pgNext.addEventListener('click', ()=>{ currentPage++; renderTable(); window.scrollTo({top:0,behavior:'smooth'}); });
pgSize && pgSize.addEventListener('change', ()=>{ pageSize = parseInt(pgSize.value)||50; currentPage=1; renderTable(); });

// تمت إزالة أزرار (تصدير، بحث متقدم) والكود المرتبط بها بناءً على طلب المستخدم.

loadSales();
