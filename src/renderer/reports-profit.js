// reports-profit.js
const periodEl = document.getElementById('period');
const salesTotalEl = document.getElementById('salesTotal');
const purchasesTotalEl = document.getElementById('purchasesTotal');
const expensesTotalEl = document.getElementById('expensesTotal');
const netProfitEl = document.getElementById('netProfit');
const marginPctEl = document.getElementById('marginPct');
const topList = document.getElementById('topList');
const bottomList = document.getElementById('bottomList');
const backBtn = document.getElementById('backBtn');
let chartCtx;

function fmt(n){ return (n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }

async function loadSummary(){
  const period = periodEl.value;
  const r = await window.api.reportProfitSummary(period);
  if(r.ok){
    salesTotalEl.textContent = fmt(r.data.salesTotal);
    purchasesTotalEl.textContent = fmt(r.data.purchasesTotal);
    expensesTotalEl.textContent = fmt(r.data.expensesTotal);
    netProfitEl.textContent = fmt(r.data.netProfit);
    marginPctEl.textContent = (r.data.margin*100).toFixed(1)+'%';
  }
}

async function loadProducts(){
  const period = periodEl.value;
  const r = await window.api.reportProfitProducts(period);
  if(!r.ok) return;
  const { top5, bottom5 } = r.data;
  topList.innerHTML = top5.map(p=> `<li><span>${p.name||'منتج'}</span><span class="badge">${p.qty||0}</span></li>`).join('') || '<li>لا بيانات</li>';
  bottomList.innerHTML = bottom5.map(p=> `<li><span>${p.name||'منتج'}</span><span class="badge">${p.qty||0}</span></li>`).join('') || '<li>لا بيانات</li>';
  renderProductsChart(top5);
}

function renderProductsChart(rows){
  const canvas = document.getElementById('productsChart');
  if(!chartCtx) chartCtx = canvas.getContext('2d');
  chartCtx.clearRect(0,0,canvas.width,canvas.height);
  if(!rows.length){ chartCtx.fillStyle='#666'; chartCtx.font='14px Tahoma'; chartCtx.fillText('لا بيانات', 20, 40); return; }
  const labels = rows.map(r=> (r.name||'').slice(0,10));
  const vals = rows.map(r=> r.qty||0);
  const w = canvas.width = canvas.clientWidth; const h = canvas.height; const pad=30;
  const max = Math.max(...vals,1);
  const slice = (Math.PI*2)/vals.length;
  const total = vals.reduce((a,b)=>a+b,0);
  let startAngle = -Math.PI/2;
  const colors = ['#0d63c7','#2b90d9','#5cb8e6','#89d4f4','#b7e7fb'];
  vals.forEach((v,i)=>{
    const angle = slice; // متساوية للبساطة
    chartCtx.beginPath();
    chartCtx.moveTo(w/2,h/2);
    chartCtx.fillStyle = colors[i%colors.length];
    chartCtx.arc(w/2,h/2, Math.min(w,h)/2 - 10, startAngle, startAngle+angle);
    chartCtx.closePath(); chartCtx.fill();
    // نسبة
    const mid = startAngle + angle/2;
    const rx = w/2 + Math.cos(mid)*(Math.min(w,h)/2 - 40);
    const ry = h/2 + Math.sin(mid)*(Math.min(w,h)/2 - 40);
    const pct = total? ((v/total)*100).toFixed(0)+'%':'';
    chartCtx.fillStyle='#000'; chartCtx.font='11px Tahoma'; chartCtx.fillText(pct, rx-10, ry);
    startAngle += angle;
  });
  // وسيلة إيضاح بسيطة
  labels.forEach((lb,i)=>{
    chartCtx.fillStyle=colors[i%colors.length];
    chartCtx.fillRect(10, 10+i*14, 10,10);
    chartCtx.fillStyle='#000'; chartCtx.font='11px Tahoma'; chartCtx.fillText(lb, 24, 18+i*14);
  });
}

periodEl.addEventListener('change', ()=>{ loadSummary(); loadProducts(); });
backBtn.addEventListener('click', ()=>{ window.location='index.html'; });

document.addEventListener('DOMContentLoaded', ()=>{ loadSummary(); loadProducts(); });
