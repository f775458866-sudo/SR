// suppliers.js إدارة الموردين
const supTbody = document.getElementById('suppliersTbody');
const supSearchInput = document.getElementById('supSearch');
const btnAddSup = document.getElementById('btnAddSupplier');
const btnExportSup = document.getElementById('btnExportSup');
const supModal = document.getElementById('supplierModal');
const supForm = document.getElementById('supplierForm');
const supSaveBtn = document.getElementById('supSaveBtn');
const supCancelBtn = document.getElementById('supCancelBtn');
const backBtn = document.getElementById('backBtn');
let suppliers = [];
let editingSupId = null;
// استخدام نظام التنقل الموحد
if(backBtn){ backBtn.addEventListener('click', ()=> window.appNav && window.appNav.goBack()); }

function openSupModal(){supModal.style.display='flex';}
function closeSupModal(){supModal.style.display='none';clearSupErrors();}

function clearSupForm(){ supForm.reset(); editingSupId=null; document.getElementById('supplierModalTitle').textContent='إضافة مورد'; }
function clearSupErrors(){ supForm.querySelectorAll('.error-field').forEach(el=>{ el.classList.remove('error-field'); el.style.borderColor=''; }); }

function validateSupplier(){
  clearSupErrors();
  const reqIds = ['supName','supPhone','supVat'];
  let ok = true;
  reqIds.forEach(id=>{ const el=document.getElementById(id); if(!el.value.trim()){ ok=false; el.classList.add('error-field'); el.style.borderColor='#d32f2f'; }});
  return ok;
}

function gatherSupplier(){
  return {
    name: document.getElementById('supName').value.trim(),
    phone: document.getElementById('supPhone').value.trim(),
    vat: document.getElementById('supVat').value.trim(),
    whatsapp: document.getElementById('supWhatsapp').value.trim(),
    email: document.getElementById('supEmail').value.trim(),
    address: document.getElementById('supAddress').value.trim(),
    notes: document.getElementById('supNotes').value.trim(),
    balance: 0
  };
}

async function loadSuppliers(){
  try { const r = await window.api.suppliersList(supSearchInput.value.trim()); if(r.ok){ suppliers = r.rows; } else suppliers=[]; } catch{ suppliers=[]; }
  renderSuppliers();
}

function renderSuppliers(){
  supTbody.innerHTML='';
  suppliers.forEach(s=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${s.name||''}</td><td>${s.phone||''}</td><td>${s.vat||''}</td><td>${s.whatsapp||''}</td><td>${s.balance||0}</td><td><button class="actions-btn" data-id="${s.id}">…</button></td>`;
    supTbody.appendChild(tr);
  });
}

let supPopup=null;
function showSupPopup(anchor,row){
  hideSupPopup();
  supPopup=document.createElement('div');
  supPopup.style.position='absolute';
  supPopup.style.background='#fff';
  supPopup.style.border='2px solid #000';
  supPopup.style.padding='6px 8px';
  supPopup.style.borderRadius='10px';
  supPopup.style.fontSize='13px';
  supPopup.style.display='flex';
  supPopup.style.flexDirection='column';
  supPopup.style.gap='6px';
  supPopup.innerHTML=`<button data-act="edit" style="cursor:pointer;border:2px solid #000;background:#e3f2fd;padding:6px 10px;border-radius:8px;font-weight:700;">تعديل</button><button data-act="delete" style="cursor:pointer;border:2px solid #000;background:#ffebee;color:#b71c1c;padding:6px 10px;border-radius:8px;font-weight:700;">حذف</button>`;
  document.body.appendChild(supPopup);
  const rect=anchor.getBoundingClientRect();
  supPopup.style.top=(rect.bottom+window.scrollY+4)+'px';
  supPopup.style.left=(rect.left+window.scrollX-40)+'px';
  supPopup.addEventListener('click',ev=>{
    const act=ev.target.getAttribute('data-act');
    if(act==='edit'){ beginSupEdit(row); }
    if(act==='delete'){ deleteSup(row); }
  });
  document.addEventListener('click',docHandler,true);
  function docHandler(ev){ if(!supPopup.contains(ev.target) && ev.target!==anchor){ hideSupPopup(); document.removeEventListener('click',docHandler,true);} }
}
function hideSupPopup(){ if(supPopup){ supPopup.remove(); supPopup=null; } }

supTbody.addEventListener('click',(e)=>{
  const btn=e.target.closest('button.actions-btn');
  if(!btn) return; const id=+btn.dataset.id; const row=suppliers.find(s=>s.id===id); if(!row) return; showSupPopup(btn,row);
});

function beginSupEdit(row){ hideSupPopup(); editingSupId=row.id; openSupModal();
  document.getElementById('supName').value=row.name||'';
  document.getElementById('supPhone').value=row.phone||'';
  document.getElementById('supVat').value=row.vat||'';
  document.getElementById('supWhatsapp').value=row.whatsapp||'';
  document.getElementById('supEmail').value=row.email||'';
  document.getElementById('supAddress').value=row.address||'';
  document.getElementById('supNotes').value=row.notes||'';
  document.getElementById('supplierModalTitle').textContent='تعديل مورد';
}

async function deleteSup(row){ hideSupPopup(); if(!confirm(`هل تريد حذف المورد ${row.name}?`)) return; const r=await window.api.supplierDelete(row.id); if(r.ok){ loadSuppliers(); } }

supSaveBtn.addEventListener('click',async ()=>{
  if(!validateSupplier()) return;
  const data=gatherSupplier();
  if(editingSupId){ const r=await window.api.supplierUpdate(editingSupId,data); if(r.ok){ closeSupModal(); clearSupForm(); loadSuppliers(); } }
  else { const r=await window.api.supplierAdd(data); if(r.ok){ closeSupModal(); clearSupForm(); loadSuppliers(); } }
});

supCancelBtn.addEventListener('click',()=>{ closeSupModal(); clearSupForm(); });
btnAddSup.addEventListener('click',()=>{ clearSupForm(); openSupModal(); });

// بحث لحظي
supSearchInput.removeAttribute('disabled');

supSearchInput.addEventListener('input',()=>{ loadSuppliers(); });

// تصدير
btnExportSup.addEventListener('click', async ()=>{
  try { const r = await window.api.exportSuppliersCSV(); if(r.ok){ alert('تم التصدير إلى: '+r.file); } else alert('فشل التصدير'); } catch{ alert('فشل التصدير'); }
});

// إغلاق بالهروب
window.addEventListener('keydown',e=>{ if(e.key==='Escape' && supModal.style.display==='flex'){ closeSupModal(); }});

loadSuppliers();
