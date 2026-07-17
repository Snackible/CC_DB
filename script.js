const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyEo76blPXUgGCH_kZ_qbPB5GPN0PBhMcp-_D9TG4R9zn_ICY9TtAExkI62R5a7Qwggyw/exec';

const COLORS = [
  '#2a78d6','#008300','#e87ba4','#eda100',
  '#1baf7a','#eb6834','#4a3aa7','#e34948',
  '#06b6d4','#8b5cf6'
];

let cancData = [];
let refData  = [];
let pieInst  = null;

function normReason(r) {
  if (!r) return 'Miscellaneous';
  const s = r.trim().toLowerCase();
  if (s.includes('cx request') || s === 'cancellation')                    return 'CX requested cancellation';
  if (s === 'rto' || s.includes('rto'))                                     return 'RTO';
  if (s === 'nsz')                                                           return 'NSZ';
  if (s.includes('delayed'))                                                 return 'Delayed delivery';
  if (s.includes('missing') || s.includes('incomplete') || s.includes('missing snacks')) return 'Missing snacks';
  if (s.includes('damaged') || s.includes('bad condition') || s.includes('bad quality') || s.includes('package received in bad')) return 'Damaged order';
  return 'Miscellaneous';
}

async function fetchSheet(sheet) {
  const res = await fetch(`${APPS_SCRIPT_URL}?sheet=${sheet}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function buildPie(rows) {
  const counts = {};
  rows.forEach(r => {
    const key = normReason(r.reason);
    counts[key] = (counts[key] || 0) + 1;
  });
  const sorted  = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const labels  = sorted.map(x => x[0]);
  const data    = sorted.map(x => x[1]);
  const total   = data.reduce((a, b) => a + b, 0);
  const bgColors = labels.map((_, i) => COLORS[i % COLORS.length]);

  document.getElementById('pieLegend').innerHTML = labels.map((l, i) =>
    `<span class="legend-item">
      <span class="legend-dot" style="background:${bgColors[i]}"></span>
      ${l} <strong>${data[i]}</strong>
     </span>`
  ).join('');

  if (pieInst) pieInst.destroy();
  pieInst = new Chart(document.getElementById('pieChart'), {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: bgColors,
        borderWidth: 3,
        borderColor: '#ffffff',
        hoverOffset: 14
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx =>
              ` ${ctx.label}: ${ctx.parsed} orders (${Math.round(ctx.parsed / total * 100)}%)`
          }
        }
      }
    }
  });
}

function renderCancTable() {
  const q    = document.getElementById('search0').value.toLowerCase();
  const rows = cancData.filter(r =>
    !q || Object.values(r).join(' ').toLowerCase().includes(q)
  );
  document.getElementById('count0').textContent = `${rows.length} of ${cancData.length}`;
  document.getElementById('cancBody').innerHTML = rows.slice(0, 300).map(r => {
    const badge = r.paymentMode.toLowerCase() === 'cod'
      ? `<span class="badge b-cod">COD</span>`
      : `<span class="badge b-pre">Prepaid</span>`;
    return `<tr>
      <td>${r.orderId}</td>
      <td>${r.orderDate}</td>
      <td>${r.cancelDate}</td>
      <td>${normReason(r.reason)}</td>
      <td>₹${r.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
}

function renderRefTable() {
  const q    = document.getElementById('search1').value.toLowerCase();
  const rows = refData.filter(r =>
    !q || Object.values(r).join(' ').toLowerCase().includes(q)
  );
  document.getElementById('count1').textContent = `${rows.length} of ${refData.length}`;
  document.getElementById('refBody').innerHTML = rows.slice(0, 300).map(r => {
    const badge = r.type.toLowerCase() === 'full'
      ? `<span class="badge b-full">Full</span>`
      : `<span class="badge b-partial">Partial</span>`;
    return `<tr>
      <td>${r.name}</td>
      <td>${r.orderId}</td>
      <td>₹${r.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
      <td>${badge}</td>
      <td>${r.ccRemark}</td>
      <td>${r.dateRefunded || '—'}</td>
    </tr>`;
  }).join('');
}

function updateKPIs() {
  const totalVal  = cancData.filter(r => r.paymentMode.toLowerCase() === 'prepaid').reduce((s, r) => s + r.value, 0);
  const codCount  = cancData.filter(r => r.paymentMode.toLowerCase() === 'cod').length;
  const preCount  = cancData.length - codCount;
  const refTotal  = refData.reduce((s, r)  => s + r.amount, 0);
  const avgRef    = refData.length ? refTotal / refData.length : 0;
  const fmt = n => '₹' + Math.round(n).toLocaleString('en-IN');

  document.getElementById('kTotal').textContent   = cancData.length;
  document.getElementById('kValue').textContent   = fmt(totalVal);
  document.getElementById('kCod').textContent     = codCount;
  document.getElementById('kPre').textContent     = preCount;
  document.getElementById('kRefunds').textContent = fmt(refTotal);
  document.getElementById('kAvg').textContent     = fmt(avgRef);
  document.querySelectorAll('.kpi-value').forEach(el => el.classList.remove('loading'));
}

function switchTab(i, btn) {
  document.querySelectorAll('.tab').forEach((t, j) => t.classList.toggle('active', i === j));
  document.querySelectorAll('.pane').forEach((p, j) => p.classList.toggle('active', i === j));
}

async function loadAll() {
  document.getElementById('errorBanner').style.display = 'none';
  document.querySelectorAll('.kpi-value').forEach(el => el.classList.add('loading'));
  try {
    const [cancResp, refResp] = await Promise.all([
      fetchSheet('cancellations'),
      fetchSheet('gpay')
    ]);
    cancData = cancResp.rows || [];
    refData  = refResp.rows  || [];
    updateKPIs();
    buildPie(cancData);
    renderCancTable();
    renderRefTable();
    document.getElementById('lastUpdated').textContent =
      'Updated ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    console.error(err);
    document.getElementById('errorBanner').style.display = 'block';
    document.querySelectorAll('.kpi-value').forEach(el => el.classList.remove('loading'));
  }
}

loadAll();
