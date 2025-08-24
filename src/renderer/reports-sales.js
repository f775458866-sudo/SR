// reports-sales.js
const periodEl = document.getElementById('period');
const searchEl = document.getElementById('searchBox');
const tbody = document.querySelector('#salesTable tbody');
const vGross = document.getElementById('vGross');
const vDiscount = document.getElementById('vDiscount');
const vVAT = document.getElementById('vVAT');
const vNet = document.getElementById('vNet');
const vCount = document.getElementById('vCount');
const vAvg = document.getElementById('vAvg');
const vCash = document.getElementById('vCash');
const vCredit = document.getElementById('vCredit');
const rowsCount = document.getElementById('rowsCount');
const emptyMsg = document.getElementById('emptyMsg');
const backBtn = document.getElementById('backBtn');
let chartCtx, payCtx;

function fmt(n){ return (n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }

async function loadSummary(){
  const period = periodEl.value;
  const r = await window.api.reportSalesSummary(period);
  if(r.ok){
    vGross.textContent = fmt(r.data.gross);
    vDiscount.textContent = fmt(r.data.discount);
    vVAT.textContent = fmt(r.data.vat);
    vNet.textContent = fmt(r.data.net);
    // إحصائيات إضافية من التفاصيل (سيتم حسابها في loadDetails لتشارك المصدر)
    // هنا فقط الرسم
  renderTimelineChart(r.data.timeline||[]);
  }
}

async function loadDetails(){
  const period = periodEl.value;
  const search = searchEl.value.trim();
  const r = await window.api.reportSalesDetails(period, search);
  if(!r.ok){ tbody.innerHTML=''; emptyMsg.style.display='block'; return; }
  const rows = r.rows||[];
  rowsCount.textContent = rows.length? rows.length + ' سجل':'';
  tbody.innerHTML = '';
  if(!rows.length){ emptyMsg.style.display='block'; return; } else emptyMsg.style.display='none';
  let cashTotal=0, creditTotal=0;
  rows.forEach(s => {
    if(s.pay_method==='cash') cashTotal += (s.total||0); else if(s.pay_method==='credit') creditTotal += (s.total||0);
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${(s.created_at||'').slice(0,10)}</td><td>${s.invoice_no||''}</td><td>${s.customer_name||''}</td><td>${fmt(s.subtotal)}</td><td>${fmt(s.discount)}</td><td>${fmt(s.vat)}</td><td>${fmt(s.total)}</td><td>${s.pay_method||''}</td><td>${fmt(s.paid)}</td>`;
    tbody.appendChild(tr);
  });
  vCount.textContent = rows.length;
  vAvg.textContent = rows.length? fmt(rows.reduce((a,b)=>a+(b.total||0),0)/rows.length):'0';
  vCash.textContent = fmt(cashTotal);
  vCredit.textContent = fmt(creditTotal);
  renderPayChart();
}
function renderTimelineChart(timeline){
  const canvas = document.getElementById('timelineChart');
  if(!chartCtx) chartCtx = canvas.getContext('2d');
  // تقليل الارتفاع أكثر: 25% من ارتفاع النافذة بحد أدنى 80 وأقصى 160 لإبقاء البطاقات مرئية
  const targetH = Math.max(80, Math.min(window.innerHeight * 0.25, 160));
  canvas.height = targetH;
  chartCtx.clearRect(0,0,canvas.width,canvas.height);
  const labels = timeline.map(x=>x.date);
  const vals = timeline.map(x=>x.count);
  if(!labels.length){ chartCtx.fillStyle='#666'; chartCtx.font='14px Tahoma'; chartCtx.fillText('لا بيانات للرسم', 20, 40); return; }
  const w = canvas.width = canvas.clientWidth; const h = canvas.height; const pad=28;
  const max = Math.max(...vals,1);
  const bw = (w - pad*2) / vals.length * 0.6;
  vals.forEach((v,i)=>{
    const x = pad + (i+0.2)*( (w-pad*2)/vals.length );
    const barH = (h - pad*2) * (v / max);
    const y = h - pad - barH;
    chartCtx.fillStyle='#0d63c7';
    chartCtx.fillRect(x, y, bw, barH);
    chartCtx.fillStyle='#000'; chartCtx.font='11px Tahoma'; chartCtx.fillText(v, x+ (bw/4), y-4);
  chartCtx.save();
  chartCtx.translate(x+ bw/2, h-6);
  chartCtx.rotate(-0.85);
  chartCtx.fillText(labels[i].slice(5), -12,4);
  chartCtx.restore();
  });
  // مؤشرات
  let peakVal = 0, peakDay='-';
  vals.forEach((v,i)=>{ if(v>peakVal){ peakVal=v; peakDay=labels[i]; } });
  const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
  const indPeakDay = document.getElementById('indPeakDay');
  if(indPeakDay){
    document.getElementById('indPeakDay').textContent = peakDay;
    document.getElementById('indPeakVal').textContent = peakVal;
    document.getElementById('indAvgDay').textContent = fmt(avg);
    document.getElementById('indDays').textContent = vals.length;
  }
}

function renderPayChart(){
  const canvas = document.getElementById('payChart');
  if(!canvas) return; if(!payCtx) payCtx = canvas.getContext('2d');
  // اجعل مخطط طرق الدفع أيضاً أصغر وديناميكي ضمن نفس الحدود (80-160)
  const dynH = Math.max(80, Math.min(window.innerHeight * 0.22, 150));
  if(canvas.height !== dynH) canvas.height = dynH; // تحديث عند الحاجة فقط
  payCtx.clearRect(0,0,canvas.width,canvas.height);
  const cash = parseFloat((vCash.textContent||'0').replace(/,/g,''))||0;
  const credit = parseFloat((vCredit.textContent||'0').replace(/,/g,''))||0;
  const total = cash + credit;
  if(total<=0){ payCtx.fillStyle='#666'; payCtx.font='14px Tahoma'; payCtx.fillText('لا بيانات طرق الدفع', 20, 40); return; }
  const cx = canvas.width/2; const cy = canvas.height/2; const r = Math.min(cx,cy)-10; const ir = r*0.55;
  let start = -Math.PI/2;
  const segs = [ {label:'cash', value:cash, color:'#16a34a'}, {label:'credit', value:credit, color:'#dc2626'} ];
  segs.forEach(seg=>{
    if(seg.value<=0) return;
    const angle = (seg.value/total)*Math.PI*2;
    payCtx.beginPath(); payCtx.moveTo(cx,cy); payCtx.fillStyle=seg.color; payCtx.arc(cx,cy,r,start,start+angle); payCtx.closePath(); payCtx.fill();
    seg.mid = start + angle/2; start += angle;
  });
  // ثقب داخلي
  payCtx.globalCompositeOperation='destination-out';
  payCtx.beginPath(); payCtx.arc(cx,cy,ir,0,Math.PI*2); payCtx.fill();
  payCtx.globalCompositeOperation='source-over';
  payCtx.fillStyle='#000'; payCtx.font='12px Tahoma';
  segs.forEach(seg=>{ if(seg.value<=0) return; const ang=seg.mid; const tx=cx+Math.cos(ang)*(ir+(r-ir)/2-5); const ty=cy+Math.sin(ang)*(ir+(r-ir)/2-5); const pct=((seg.value/total)*100).toFixed(1)+'%'; payCtx.fillText(pct, tx-14, ty+4); });
  const creditPct = total>0? (credit/total*100).toFixed(1)+'%' : '0%';
  const cPctEl = document.getElementById('indCreditPct'); if(cPctEl) cPctEl.textContent = creditPct;
}

periodEl.addEventListener('change', ()=>{ loadSummary(); loadDetails(); });
searchEl.addEventListener('input', ()=>{ loadDetails(); });
backBtn.addEventListener('click', ()=>{ window.location='index.html'; });

document.addEventListener('DOMContentLoaded', ()=>{ loadSummary(); loadDetails(); });
// إعادة ضبط حجم الرسم عند تغيير حجم النافذة (debounce مبسط)
let __rt;
window.addEventListener('resize', ()=>{ if(__rt) clearTimeout(__rt); __rt = setTimeout(()=>{ loadSummary(); }, 200); });

// فتح نافذة منبثقة للرسوم
const btnToggleCharts = document.getElementById('btnToggleCharts');
if(btnToggleCharts){
  btnToggleCharts.addEventListener('click', ()=>{
    window.api.openSalesChartsWindow(periodEl.value).then(r=>{
      if(!r || !r.ok){
        // فشل فتح النافذة، نرجع للخطة البديلة: إظهار داخل الصفحة
        const area = document.getElementById('chartArea');
        if(area && area.style.display==='none'){
          area.style.display='block';
          loadSummary();
        }
      }
    }).catch(()=>{
      const area = document.getElementById('chartArea');
      if(area && area.style.display==='none'){
        area.style.display='block';
        loadSummary();
      }
    });
  });
}

// تصدير CSV / Excel بسيط
function exportCSV(){
  const rows = Array.from(tbody.querySelectorAll('tr')).map(tr=> Array.from(tr.children).map(td=> '"'+td.textContent.replace(/"/g,'""')+'"').join(','));
  const header = ['التاريخ','رقم الفاتورة','العميل','الإجمالي','الخصم','الضريبة','الصافي'].map(h=>'"'+h+'"').join(',');
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='sales-report.csv'; a.click(); URL.revokeObjectURL(url);
}
function exportXLS(){
  // Excel بدائي عبر HTML table
  const html = '<table>' + document.getElementById('salesTable').innerHTML + '</table>';
  const blob = new Blob(['\ufeff'+html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='sales-report.xls'; a.click(); URL.revokeObjectURL(url);
}

document.getElementById('btnExportCSV').addEventListener('click', exportCSV);
document.getElementById('btnExportXLS').addEventListener('click', exportXLS);
