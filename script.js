const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyEo76blPXUgGCH_kZ_qbPB5GPN0PBhMcp-_D9TG4R9zn_ICY9TtAExkI62R5a7Qwggyw/exec';

const COLORS = [
  '#2a78d6','#008300','#e87ba4','#eda100',
  '#1baf7a','#eb6834','#4a3aa7','#e34948',
  '#06b6d4','#8b5cf6'
];

let cancData = [];
let refData  = [];
let pieInst  = null;
let cancFilter = { from: '', to: '' };
let refFilter  = { from: '', to: '' };
let refTypeFilter = 'all';
let refRemarkFilter = '';
const registeredSheets = []; // sheets added via registerSheetTab()

function toYMD(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return d.toISOString().slice(0, 10);
}

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

// Apps Script Web Apps 404 when hit with fetch()/XHR (even same-origin) but
// work fine via a real navigation or a <script> tag load — so this loads
// data via JSONP instead of fetch(). Requires doGet to support a `callback`
// query param and wrap its JSON response as `callback(...)`.
//
// Google's /exec redirect chain is also just flaky in practice — response
// times swing from ~3s to 15s+, and it occasionally fails outright with no
// underlying config problem, but a retry almost always succeeds. So this
// wraps the single-attempt loader with a few retries before giving up.
let jsonpCounter = 0;

async function fetchSheet(sheet, baseUrl) {
  const attempts = 3;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchSheetOnce(sheet, baseUrl);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw lastErr;
}

function fetchSheetOnce(sheet, baseUrl) {
  return new Promise((resolve, reject) => {
    const url = baseUrl || APPS_SCRIPT_URL;
    const callbackName = `__jsonp_cb_${jsonpCounter++}_${Date.now()}`;
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
      clearTimeout(timer);
    };

    window[callbackName] = (data) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Failed to load sheet "${sheet}"`));
    };

    // Apps Script's /exec redirect chain can be genuinely slow (cold starts),
    // not just failing — 15s was cutting off requests that would've
    // succeeded a few seconds later, so this gives it more room.
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timed out loading sheet "${sheet}"`));
    }, 30000);

    script.src = `${url}?sheet=${encodeURIComponent(sheet)}&callback=${callbackName}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}

function getFilteredCanc() {
  return cancData.filter(r => {
    const d = toYMD(r.cancelDate);
    if (cancFilter.from && d < cancFilter.from) return false;
    if (cancFilter.to   && d > cancFilter.to)   return false;
    return true;
  });
}

function getFilteredRef() {
  return refData.filter(r => {
    const d = toYMD(r.dateRefunded);
    if (refFilter.from && d < refFilter.from) return false;
    if (refFilter.to   && d > refFilter.to)   return false;
    return true;
  });
}

function applyCustomise() {
  cancFilter.from = document.getElementById('cancFrom').value;
  cancFilter.to   = document.getElementById('cancTo').value;
  refFilter.from  = document.getElementById('refFrom').value;
  refFilter.to    = document.getElementById('refTo').value;
  const fc = getFilteredCanc();
  const fr = getFilteredRef();
  updateKPIs(fc, fr);
  buildPie(fc);
  renderCancTable();
  renderRefTable();

  registeredSheets.forEach(entry => {
    if (entry.config.dateField) {
      const f = document.getElementById(`from_${entry.config.id}`);
      const t = document.getElementById(`to_${entry.config.id}`);
      entry.dateFilter.from = f ? f.value : '';
      entry.dateFilter.to   = t ? t.value : '';
    }
    renderGenericTable(entry.config.id);
  });
}

function resetCustomise() {
    cancFilter = { from: '', to: '' };
    refFilter  = { from: '', to: '' };
    refTypeFilter = 'all';

    document.getElementById('refundFilter')
        .querySelector('.filter-label').textContent = 'All types';

    ['cancFrom','cancTo','refFrom','refTo']
        .forEach(id => document.getElementById(id).value = '');

    updateKPIs();
    buildPie(cancData);
    renderCancTable();
    renderRefTable();

    registeredSheets.forEach(entry => {
      entry.dateFilter = { from: '', to: '' };
      if (entry.config.dateField) {
        const f = document.getElementById(`from_${entry.config.id}`);
        const t = document.getElementById(`to_${entry.config.id}`);
        if (f) f.value = '';
        if (t) t.value = '';
      }
      renderGenericTable(entry.config.id);
    });
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
  const rows = cancData.filter(r => {
    if (q && !Object.values(r).join(' ').toLowerCase().includes(q)) return false;
    const d = toYMD(r.cancelDate);
    if (cancFilter.from && d < cancFilter.from) return false;
    if (cancFilter.to   && d > cancFilter.to)   return false;
    return true;
  });
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

function formatRemark(text) {
    if (!text) return '';

    let formatted = text
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());

    formatted = formatted.replace(/\bRto\b/g, 'RTO');

    return formatted;
}

function renderRefTable() {
    const q = document.getElementById('search1').value.toLowerCase();

    const rows = refData.filter(r => {

        // Search filter
        if (q && !Object.values(r).join(' ').toLowerCase().includes(q)) {
            return false;
        }

        // Refund type filter
        const refundType = (r.type || '').toString().trim().toLowerCase();

        if (refTypeFilter === 'full' && refundType !== 'full') {
            return false;
        }

        if (refTypeFilter === 'partial' && refundType !== 'partial') {
            return false;
        }

        // CC remark filter
        const remark = (r.ccRemark || '').trim().toLowerCase();

        if (
            refRemarkFilter &&
            remark !== refRemarkFilter
        ) {
            return false;
        }

        // Date filter
        const d = toYMD(r.dateRefunded);

        if (refFilter.from && d < refFilter.from) {
            return false;
        }

        if (refFilter.to && d > refFilter.to) {
            return false;
        }

        return true;
    });

    document.getElementById('count1').textContent =
        `${rows.length} of ${refData.length}`;

    document.getElementById('refBody').innerHTML = rows.slice(0, 300).map(r => {

        const refundType = (r.type || '').toString().trim().toLowerCase();

        const badge = refundType === 'full'
            ? `<span class="badge b-full refund-badge"
                     data-refund-type="full">
                    Full
               </span>`
            : `<span class="badge b-partial refund-badge"
                     data-refund-type="partial">
                    Partial
               </span>`;

        return `
            <tr>
                <td>${r.name}</td>

                <td>${r.orderId}</td>

                <td>
                    ₹${r.amount.toLocaleString('en-IN', {
                        maximumFractionDigits: 0
                    })}
                </td>

                <td>${badge}</td>

                <td>
                    <span
                        class="remark-filter"
                        data-remark="${r.ccRemark || ''}">
                        ${formatRemark(r.ccRemark)}
                    </span>
                </td>

                <td>${r.dateRefunded || '—'}</td>
            </tr>
        `;

    }).join('');
}

document.addEventListener('click', function(event) {

    // Clicked a refund badge
    const badge = event.target.closest('.refund-badge');

    if (badge) {
        refTypeFilter = badge.dataset.refundType;
        renderRefTable();
        return;
    }

    // Clicked a CC remark
    const remark = event.target.closest('.remark-filter');

    if (remark) {
        refRemarkFilter = remark.dataset.remark
            .trim()
            .toLowerCase();

        renderRefTable();
    }

});

document.addEventListener('click', function(event) {

    const badge = event.target.closest('.refund-badge');

    if (!badge) return;

    refTypeFilter = badge.dataset.refundType;

    renderRefTable();
});

const refundFilter = document.getElementById('refundFilter');
const refundFilterBtn = refundFilter.querySelector('.refund-filter-btn');
const refundFilterLabel = refundFilter.querySelector('.filter-label');

refundFilterBtn.addEventListener('click', function() {
    refundFilter.classList.toggle('open');
});

refundFilter.querySelectorAll('.filter-option').forEach(option => {

    option.addEventListener('click', function() {

        refTypeFilter = this.dataset.value;

        refundFilterLabel.textContent = this.textContent.trim();

        refundFilter.classList.remove('open');

        renderRefTable();
    });

});

document.addEventListener('click', function(event) {

    if (!refundFilter.contains(event.target)) {
        refundFilter.classList.remove('open');
    }

});
document.addEventListener('click', function (event) {

    const badge = event.target.closest('.refund-badge');

    if (!badge) return;

    const type = badge.dataset.refundType;

    if (type === 'full') {
        refundFilterLabel.textContent = 'Full refund';
    } 
    else if (type === 'partial') {
        refundFilterLabel.textContent = 'Partial refund';
    }

    refTypeFilter = type;

    renderRefTable();
});

function populateRemarkFilter() {
    const select = document.getElementById('remarkFilter');

    const remarks = [...new Set(
        refData
            .map(r => (r.ccRemark || '').trim())
            .filter(Boolean)
    )].sort();

    select.innerHTML = '<option value="all">All remarks</option>';

    remarks.forEach(remark => {
        const option = document.createElement('option');
        option.value = remark;
        option.textContent = formatRemark(remark);
        select.appendChild(option);
    });
}

function updateKPIs(fc, fr) {
  fc = fc !== undefined ? fc : cancData;
  fr = fr !== undefined ? fr : refData;
  const totalVal  = fr.reduce((s, r) => s + r.amount, 0);
  const codCount  = fc.filter(r => r.paymentMode.toLowerCase() === 'cod').length;
  const preCount  = fc.length - codCount;
  const refTotal  = fr.reduce((s, r) => s + r.amount, 0);
  const avgRef    = fr.length ? refTotal / fr.length : 0;
  const fmt = n => '₹' + Math.round(n).toLocaleString('en-IN');

  document.getElementById('kTotal').textContent   = fc.length;
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

// ────────────────────────────────────────────────────────────────
// GENERIC SHEET TAB FRAMEWORK
//
// Cancellations / GPay COD refunds above are hand-written and left
// untouched. Any sheet added after them can instead call
// registerSheetTab({...}) once, and its tab, table, search box,
// optional dropdown filters and optional date-range filter (in the
// Customise pane) are all generated automatically. Example:
//
// registerSheetTab({
//   id: 'razorpay',                 // unique, used to build element ids
//   apiSheet: 'razorpay',           // sheet= param sent to the Apps Script
//   apiUrl: '',                     // optional: a different Apps Script Web App
//                                    // URL, if this sheet lives in a separate
//                                    // deployment. Leave unset to reuse
//                                    // APPS_SCRIPT_URL above.
//   label: 'Razorpay refunds',      // tab button text
//   searchPlaceholder: 'Search order ID, remark…',
//   dateField: 'dateRefunded',      // optional: adds a Customise date-range filter
//   selectFilters: [                // optional: one dropdown per field
//     { field: 'status', label: 'status' }
//   ],
//   columns: [                      // OPTIONAL — omit to auto-detect columns
//     { key: 'orderId', label: 'Order ID' },       // from the keys of the first
//     { key: 'amount',  label: 'Amount', format: 'currency' }, // row the API returns
//     { key: 'status',  label: 'Status', badge: {
//         success: { label: 'Success', bg: '#dcfce7', color: '#166534' },
//         failed:  { label: 'Failed',  bg: '#fee2e2', color: '#991b1b' }
//       } },
//     { key: 'dateRefunded', label: 'Date' }
//   ]
// });
//
// If `columns` is omitted, headers are auto-generated from field names
// (e.g. "orderId" → "Order ID"), and cells render as plain text — no
// currency formatting or badge colors. Add an explicit columns list any
// time you want those.
//
// Note: the sheet name passed as apiSheet must also be handled by the
// Apps Script backend's doGet (the ?sheet= param), same as 'cancellations'
// and 'gpay' are today — this framework only covers the front end.
// ────────────────────────────────────────────────────────────────

function registerSheetTab(config) {
  const entry = {
    config,
    data: [],
    dateFilter: { from: '', to: '' },
    columns: (config.columns && config.columns.length) ? config.columns : null
  };
  registeredSheets.push(entry);
  buildSheetTabDOM(config);
  return entry;
}

// Turns an API field name like "orderId" or "cc_remark" into "Order ID" / "Cc Remark".
function humanizeKey(key) {
  const acronyms = { id: 'ID', cc: 'CC', url: 'URL', sku: 'SKU' };
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map(w => acronyms[w.toLowerCase()] || (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

// Used when a sheet is registered without a `columns` list — builds one from
// the keys of the first row returned by the API.
function deriveColumns(data) {
  if (!data.length) return [];
  return Object.keys(data[0]).map(key => ({ key, label: humanizeKey(key) }));
}

function renderTableHead(id, columns) {
  const headRow = document.getElementById(`head_${id}`);
  if (!headRow) return;
  headRow.innerHTML = columns.map(col => `<th>${col.label}</th>`).join('');
}

function buildSheetTabDOM(config) {
  const tabsEl    = document.querySelector('.tabs');
  const sectionEl = document.querySelector('.bottom-section');
  const idx       = document.querySelectorAll('.tab').length;

  const tabBtn = document.createElement('button');
  tabBtn.className = 'tab';
  tabBtn.textContent = config.label;
  tabBtn.onclick = () => switchTab(idx, tabBtn);
  tabsEl.appendChild(tabBtn);

  const pane = document.createElement('div');
  pane.className = 'pane';
  pane.id = `pane_${config.id}`;

  const toolbar = document.createElement('div');
  toolbar.className = 'table-toolbar';

  const search = document.createElement('input');
  search.type = 'text';
  search.id = `search_${config.id}`;
  search.placeholder = config.searchPlaceholder || 'Search…';
  search.oninput = () => renderGenericTable(config.id);
  toolbar.appendChild(search);

  (config.selectFilters || []).forEach(sf => {
    const sel = document.createElement('select');
    sel.id = `select_${config.id}_${sf.field}`;
    sel.innerHTML = `<option value="">All ${sf.label}</option>`;
    sel.onchange = () => renderGenericTable(config.id);
    toolbar.appendChild(sel);
  });

  const count = document.createElement('span');
  count.className = 'row-count';
  count.id = `count_${config.id}`;
  toolbar.appendChild(count);

  pane.appendChild(toolbar);

  const scroll = document.createElement('div');
  scroll.className = 'tbl-scroll';
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.id = `head_${config.id}`;
  if (config.columns && config.columns.length) {
    config.columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col.label;
      headRow.appendChild(th);
    });
  }
  thead.appendChild(headRow);
  const tbody = document.createElement('tbody');
  tbody.id = `body_${config.id}`;
  table.appendChild(thead);
  table.appendChild(tbody);
  scroll.appendChild(table);
  pane.appendChild(scroll);

  sectionEl.appendChild(pane);

  if (config.dateField) {
    const customisePane = document.querySelector('.customise-pane');
    const group = document.createElement('div');
    group.className = 'customise-group';
    group.innerHTML = `
      <div class="customise-label">${config.label} — filter by date</div>
      <div class="customise-row">
        <label>From <input type="date" id="from_${config.id}" /></label>
        <label>To <input type="date" id="to_${config.id}" /></label>
      </div>`;
    customisePane.insertBefore(group, customisePane.querySelector('.customise-actions'));
  }
}

function fmtCell(row, col) {
  const value = row[col.key];
  if (col.badge) {
    const key = (value ?? '').toString().trim().toLowerCase();
    const b = col.badge[key] || col.badge.default;
    if (!b) return value ?? '—';
    return `<span class="badge" style="background:${b.bg};color:${b.color}">${b.label}</span>`;
  }
  if (col.format === 'currency') {
    return '₹' + Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
  return (value === undefined || value === null || value === '') ? '—' : value;
}

function populateGenericSelectFilters(entry) {
  const { config, data } = entry;
  (config.selectFilters || []).forEach(sf => {
    const sel = document.getElementById(`select_${config.id}_${sf.field}`);
    if (!sel) return;
    const current = sel.value;
    const values = [...new Set(
      data.map(r => (r[sf.field] ?? '').toString().trim()).filter(Boolean)
    )].sort();
    sel.innerHTML = `<option value="">All ${sf.label}</option>` +
      values.map(v => `<option value="${v}">${v}</option>`).join('');
    if (values.includes(current)) sel.value = current;
  });
}

function renderGenericTable(id) {
  const entry = registeredSheets.find(e => e.config.id === id);
  if (!entry) return;
  const { config, data, dateFilter, columns } = entry;
  if (!columns) return; // header/columns not derived yet — nothing to render

  const searchEl = document.getElementById(`search_${id}`);
  const q = searchEl ? searchEl.value.toLowerCase() : '';

  const rows = data.filter(r => {
    if (q && !Object.values(r).join(' ').toLowerCase().includes(q)) return false;

    for (const sf of (config.selectFilters || [])) {
      const sel = document.getElementById(`select_${id}_${sf.field}`);
      const want = sel ? sel.value : '';
      if (want && (r[sf.field] ?? '').toString().trim().toLowerCase() !== want.toLowerCase()) return false;
    }

    if (config.dateField) {
      const d = toYMD(r[config.dateField]);
      if (dateFilter.from && d < dateFilter.from) return false;
      if (dateFilter.to   && d > dateFilter.to)   return false;
    }

    return true;
  });

  const countEl = document.getElementById(`count_${id}`);
  if (countEl) countEl.textContent = `${rows.length} of ${data.length}`;

  const bodyEl = document.getElementById(`body_${id}`);
  if (bodyEl) {
    bodyEl.innerHTML = rows.slice(0, 300).map(r =>
      `<tr>${columns.map(col => `<td>${fmtCell(r, col)}</td>`).join('')}</tr>`
    ).join('');
  }
}

async function loadGenericSheets() {
  // Sequential, not Promise.all — simultaneous JSONP requests to the Apps
  // Script /exec redirect chain are unreliable (see loadAll).
  for (const entry of registeredSheets) {
    try {
      const resp = await fetchSheet(entry.config.apiSheet, entry.config.apiUrl);
      entry.data = resp.rows || [];
      if (!entry.columns) {
        entry.columns = deriveColumns(entry.data);
        renderTableHead(entry.config.id, entry.columns);
      }
      populateGenericSelectFilters(entry);
      renderGenericTable(entry.config.id);
    } catch (err) {
      console.error(`Failed to load sheet "${entry.config.id}":`, err);
    }
  }
}



const NEW_SHEET_LINK = 'https://script.google.com/macros/s/AKfycbxSuMjhYk1GxoCtkvrttG_VBoaSTHne61kHiO49jYCiz4c43zSdJGsVO8SFEpyL1FPl/exec'; // paste the Apps Script Web App URL here if this
                            

registerSheetTab({
  id: 'Delhivery',                       // TODO: unique short id
  apiSheet: 'delhivery',
  apiUrl: NEW_SHEET_LINK || undefined,
  label: 'Delhivery',                   // TODO: tab button text
  searchPlaceholder: 'Search…',
  dateField: '',                        // TODO: field name for Customise date filter, or delete this line
  selectFilters: []                     // TODO: e.g. [{ field: 'status', label: 'status' }]
});

async function loadAll() {
  document.getElementById('errorBanner').style.display = 'none';
  document.querySelectorAll('.kpi-value').forEach(el => el.classList.add('loading'));

  try {
    // Everything below is loaded one request at a time, including generic
    // sheets — simultaneous JSONP requests to Google's /exec redirect chain
    // are unreliable even across different Apps Script projects, so nothing
    // here should start until the previous request has fully settled.
    const cancResp = await fetchSheet('cancellations');
    const refResp  = await fetchSheet('gpay');
    cancData = cancResp.rows || [];
    refData  = refResp.rows  || [];
    populateRemarkFilter();
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

  await loadGenericSheets();
}

loadAll();
