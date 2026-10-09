'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CancellationPie from './CancellationPie';
import GenericSheetTab from './GenericSheetTab';
import { fetchSheet, APPS_SCRIPT_URL, DELHIVERY_URL } from '@/lib/api';
import { normReason } from '@/lib/reasons';
import { toYMD, formatRemark, fmtCurrency, humanizeKey } from '@/lib/format';

// Any sheet beyond the two hand-written ones (Cancellations, GPay refunds)
// is driven by one of these entries. Add another object to get another tab.
// Must also be handled by the Apps Script backend's doGet ?sheet= param.
const GENERIC_SHEETS = [
  {
    id: 'Delhivery',
    apiSheet: 'delhivery',
    apiUrl: DELHIVERY_URL,
    label: 'Delhivery',
    searchPlaceholder: 'Search…',
    dateField: '',
    selectFilters: [],
    columns: null,
  },
];

export default function Dashboard() {
  const [cancData, setCancData] = useState([]);
  const [refData, setRefData] = useState([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Active filters — only change when "Apply" is clicked in Customise.
  const [cancFilter, setCancFilter] = useState({ from: '', to: '' });
  const [refFilter, setRefFilter] = useState({ from: '', to: '' });
  // Draft inputs on the Customise pane.
  const [draft, setDraft] = useState({
    cancFrom: '', cancTo: '', refFrom: '', refTo: '',
    generic: {},
  });

  const [search0, setSearch0] = useState('');
  const [search1, setSearch1] = useState('');
  const [refTypeFilter, setRefTypeFilter] = useState('all');
  const [refRemarkFilter, setRefRemarkFilter] = useState('');
  const [refTypeLabel, setRefTypeLabel] = useState('All types');
  const [refundDropdownOpen, setRefundDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  // Each registered generic sheet gets its own data/columns/dateFilter/search.
  const [genericState, setGenericState] = useState(() =>
    GENERIC_SHEETS.map((cfg) => ({
      config: cfg,
      data: [],
      columns: cfg.columns && cfg.columns.length ? cfg.columns : null,
      dateFilter: { from: '', to: '' },
      search: '',
      selectValues: {},
    })),
  );

  const refundDropdownRef = useRef(null);

  const loadAll = useCallback(async () => {
    setErrorMsg('');
    setIsLoading(true);
    try {
      // Sequential, not Promise.all — simultaneous JSONP requests to the Apps
      // Script /exec redirect chain are unreliable.
      const cancResp = await fetchSheet('cancellations');
      const refResp = await fetchSheet('gpay');
      setCancData(cancResp.rows || []);
      setRefData(refResp.rows || []);
      setLastUpdated(
        'Updated ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      );
    } catch (err) {
      console.error(err);
      setErrorMsg('Could not load data. Make sure the Apps Script is deployed and APPS_SCRIPT_URL is correct.');
    } finally {
      setIsLoading(false);
    }

    for (let i = 0; i < GENERIC_SHEETS.length; i++) {
      const cfg = GENERIC_SHEETS[i];
      try {
        const resp = await fetchSheet(cfg.apiSheet, cfg.apiUrl);
        const data = resp.rows || [];
        setGenericState((prev) => {
          const next = prev.slice();
          const entry = { ...next[i], data };
          if (!entry.columns && data.length) {
            entry.columns = Object.keys(data[0]).map((key) => ({ key, label: humanizeKey(key) }));
          }
          next[i] = entry;
          return next;
        });
      } catch (err) {
        console.error(`Failed to load sheet "${cfg.id}":`, err);
      }
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Close refund dropdown on outside click.
  useEffect(() => {
    const onDocClick = (e) => {
      if (refundDropdownRef.current && !refundDropdownRef.current.contains(e.target)) {
        setRefundDropdownOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const filteredCanc = useMemo(() => {
    return cancData.filter((r) => {
      const d = toYMD(r.cancelDate);
      if (cancFilter.from && d < cancFilter.from) return false;
      if (cancFilter.to && d > cancFilter.to) return false;
      return true;
    });
  }, [cancData, cancFilter]);

  const filteredRef = useMemo(() => {
    return refData.filter((r) => {
      const d = toYMD(r.dateRefunded);
      if (refFilter.from && d < refFilter.from) return false;
      if (refFilter.to && d > refFilter.to) return false;
      return true;
    });
  }, [refData, refFilter]);

  const kpis = useMemo(() => {
    const codCount = filteredCanc.filter((r) => (r.paymentMode || '').toLowerCase() === 'cod').length;
    const preCount = filteredCanc.length - codCount;
    const refTotal = filteredRef.reduce((s, r) => s + (r.amount || 0), 0);
    const avgRef = filteredRef.length ? refTotal / filteredRef.length : 0;
    return {
      total: filteredCanc.length,
      value: fmtCurrency(refTotal),
      cod: codCount,
      pre: preCount,
      refunds: fmtCurrency(refTotal),
      avg: fmtCurrency(avgRef),
    };
  }, [filteredCanc, filteredRef]);

  const cancTableRows = useMemo(() => {
    const q = search0.toLowerCase();
    return cancData.filter((r) => {
      if (q && !Object.values(r).join(' ').toLowerCase().includes(q)) return false;
      const d = toYMD(r.cancelDate);
      if (cancFilter.from && d < cancFilter.from) return false;
      if (cancFilter.to && d > cancFilter.to) return false;
      return true;
    });
  }, [cancData, cancFilter, search0]);

  const refTableRows = useMemo(() => {
    const q = search1.toLowerCase();
    return refData.filter((r) => {
      if (q && !Object.values(r).join(' ').toLowerCase().includes(q)) return false;
      const refundType = (r.type || '').toString().trim().toLowerCase();
      if (refTypeFilter === 'full' && refundType !== 'full') return false;
      if (refTypeFilter === 'partial' && refundType !== 'partial') return false;
      const remark = (r.ccRemark || '').trim().toLowerCase();
      if (refRemarkFilter && remark !== refRemarkFilter) return false;
      const d = toYMD(r.dateRefunded);
      if (refFilter.from && d < refFilter.from) return false;
      if (refFilter.to && d > refFilter.to) return false;
      return true;
    });
  }, [refData, refFilter, refTypeFilter, refRemarkFilter, search1]);

  const remarkOptions = useMemo(() => {
    return [...new Set(refData.map((r) => (r.ccRemark || '').trim()).filter(Boolean))].sort();
  }, [refData]);

  const applyCustomise = () => {
    setCancFilter({ from: draft.cancFrom, to: draft.cancTo });
    setRefFilter({ from: draft.refFrom, to: draft.refTo });
    setGenericState((prev) =>
      prev.map((entry) => {
        const d = draft.generic[entry.config.id];
        if (!d || !entry.config.dateField) return entry;
        return { ...entry, dateFilter: { from: d.from || '', to: d.to || '' } };
      }),
    );
  };

  const resetCustomise = () => {
    setCancFilter({ from: '', to: '' });
    setRefFilter({ from: '', to: '' });
    setRefTypeFilter('all');
    setRefTypeLabel('All types');
    setDraft({ cancFrom: '', cancTo: '', refFrom: '', refTo: '', generic: {} });
    setGenericState((prev) => prev.map((entry) => ({ ...entry, dateFilter: { from: '', to: '' } })));
  };

  const chooseRefType = (value, label) => {
    setRefTypeFilter(value);
    setRefTypeLabel(label);
    setRefundDropdownOpen(false);
  };

  // Click a badge in the refund table → filter by that type.
  const onRefundBadgeClick = (type) => {
    setRefTypeFilter(type);
    setRefTypeLabel(type === 'full' ? 'Full refund' : type === 'partial' ? 'Partial refund' : 'All types');
  };

  // Click a CC remark in a row → filter by that remark.
  const onRemarkClick = (remark) => {
    setRefRemarkFilter((remark || '').trim().toLowerCase());
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <span className="logo">Snackible</span>
          <span className="header-sub">Customer Care Dashboard</span>
        </div>
        <div className="header-right">
          <span className="last-updated">{lastUpdated}</span>
          <button className="btn-refresh" onClick={loadAll} disabled={isLoading}>↻ Refresh</button>
        </div>
      </header>

      <div className="kpi-strip">
        <Kpi label="Total cancellations" value={isLoading ? '—' : kpis.total} loading={isLoading} />
        <Kpi label="Prepaid value lost" value={isLoading ? '—' : kpis.value} loading={isLoading} />
        <Kpi label="COD orders" value={isLoading ? '—' : kpis.cod} loading={isLoading} />
        <Kpi label="Prepaid orders" value={isLoading ? '—' : kpis.pre} loading={isLoading} />
        <Kpi label="GPay refunds" value={isLoading ? '—' : kpis.refunds} loading={isLoading} />
        <Kpi label="Avg refund" value={isLoading ? '—' : kpis.avg} loading={isLoading} />
      </div>

      <section className="pie-section">
        <div className="pie-title">Cancellation reasons</div>
        <CancellationPie rows={filteredCanc} />
      </section>

      <section className="bottom-section">
        <div className="tabs">
          <button className={`tab ${activeTab === 0 ? 'active' : ''}`} onClick={() => setActiveTab(0)}>Cancellations</button>
          <button className={`tab ${activeTab === 1 ? 'active' : ''}`} onClick={() => setActiveTab(1)}>GPay COD refunds</button>
          <button className={`tab ${activeTab === 2 ? 'active' : ''}`} onClick={() => setActiveTab(2)}>Customise</button>
          {GENERIC_SHEETS.map((cfg, i) => (
            <button
              key={cfg.id}
              className={`tab ${activeTab === 3 + i ? 'active' : ''}`}
              onClick={() => setActiveTab(3 + i)}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        {activeTab === 0 && (
          <div className="pane active">
            <div className="table-toolbar">
              <input
                type="text"
                placeholder="Search order ID, reason, payment…"
                value={search0}
                onChange={(e) => setSearch0(e.target.value)}
              />
              <span className="row-count">{cancTableRows.length} of {cancData.length}</span>
            </div>
            <div className="tbl-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Order date</th>
                    <th>Cancel date</th>
                    <th>Reason</th>
                    <th>Value</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {cancTableRows.slice(0, 300).map((r, i) => (
                    <tr key={`${r.orderId}-${i}`}>
                      <td>{r.orderId}</td>
                      <td>{r.orderDate}</td>
                      <td>{r.cancelDate}</td>
                      <td>{normReason(r.reason)}</td>
                      <td>₹{Number(r.value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                      <td>
                        {(r.paymentMode || '').toLowerCase() === 'cod'
                          ? <span className="badge b-cod">COD</span>
                          : <span className="badge b-pre">Prepaid</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 1 && (
          <div className="pane active">
            <div className="table-toolbar">
              <input
                type="text"
                placeholder="Search name, remark, order ID…"
                value={search1}
                onChange={(e) => setSearch1(e.target.value)}
              />
              <div className="refund-filters">
                <select
                  id="remarkFilter"
                  value={refRemarkFilter || 'all'}
                  onChange={(e) => setRefRemarkFilter(e.target.value === 'all' ? '' : e.target.value)}
                >
                  <option value="all">All remarks</option>
                  {remarkOptions.map((r) => (
                    <option key={r} value={r.toLowerCase()}>{formatRemark(r)}</option>
                  ))}
                </select>
                <div
                  className={`refund-filter ${refundDropdownOpen ? 'open' : ''}`}
                  ref={refundDropdownRef}
                >
                  <button
                    className="refund-filter-btn"
                    type="button"
                    onClick={() => setRefundDropdownOpen((o) => !o)}
                  >
                    <span className="filter-label">{refTypeLabel}</span>
                    <span className="filter-arrow">▼</span>
                  </button>
                  <div className="refund-filter-menu">
                    <button type="button" className="filter-option" onClick={() => chooseRefType('all', 'All types')}>
                      All types
                    </button>
                    <button
                      type="button"
                      className="filter-option option-full"
                      onClick={() => chooseRefType('full', 'Full refund')}
                    >
                      Full refund
                    </button>
                    <button
                      type="button"
                      className="filter-option option-partial"
                      onClick={() => chooseRefType('partial', 'Partial refund')}
                    >
                      Partial refund
                    </button>
                  </div>
                </div>
              </div>
              <span className="row-count">{refTableRows.length} of {refData.length}</span>
            </div>
            <div className="tbl-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Order ID</th>
                    <th>Amount</th>
                    <th>Type</th>
                    <th>CC remark</th>
                    <th>Date refunded</th>
                  </tr>
                </thead>
                <tbody>
                  {refTableRows.slice(0, 300).map((r, i) => {
                    const refundType = (r.type || '').toString().trim().toLowerCase();
                    return (
                      <tr key={`${r.orderId}-${i}`}>
                        <td>{r.name}</td>
                        <td>{r.orderId}</td>
                        <td>₹{Number(r.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                        <td>
                          {refundType === 'full' ? (
                            <span
                              className="badge b-full refund-badge"
                              onClick={() => onRefundBadgeClick('full')}
                            >
                              Full
                            </span>
                          ) : (
                            <span
                              className="badge b-partial refund-badge"
                              onClick={() => onRefundBadgeClick('partial')}
                            >
                              Partial
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className="remark-filter"
                            onClick={() => onRemarkClick(r.ccRemark)}
                          >
                            {formatRemark(r.ccRemark)}
                          </span>
                        </td>
                        <td>{r.dateRefunded || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 2 && (
          <div className="pane active">
            <div className="customise-pane">
              <div className="customise-group">
                <div className="customise-label">Cancellations — filter by cancel date</div>
                <div className="customise-row">
                  <label>From <input type="date" value={draft.cancFrom} onChange={(e) => setDraft((d) => ({ ...d, cancFrom: e.target.value }))} /></label>
                  <label>To <input type="date" value={draft.cancTo} onChange={(e) => setDraft((d) => ({ ...d, cancTo: e.target.value }))} /></label>
                </div>
              </div>
              <div className="customise-group">
                <div className="customise-label">GPay refunds — filter by date refunded</div>
                <div className="customise-row">
                  <label>From <input type="date" value={draft.refFrom} onChange={(e) => setDraft((d) => ({ ...d, refFrom: e.target.value }))} /></label>
                  <label>To <input type="date" value={draft.refTo} onChange={(e) => setDraft((d) => ({ ...d, refTo: e.target.value }))} /></label>
                </div>
              </div>

              {GENERIC_SHEETS.filter((c) => c.dateField).map((cfg) => (
                <div key={cfg.id} className="customise-group">
                  <div className="customise-label">{cfg.label} — filter by date</div>
                  <div className="customise-row">
                    <label>
                      From{' '}
                      <input
                        type="date"
                        value={draft.generic[cfg.id]?.from || ''}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            generic: { ...d.generic, [cfg.id]: { ...(d.generic[cfg.id] || {}), from: e.target.value } },
                          }))
                        }
                      />
                    </label>
                    <label>
                      To{' '}
                      <input
                        type="date"
                        value={draft.generic[cfg.id]?.to || ''}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            generic: { ...d.generic, [cfg.id]: { ...(d.generic[cfg.id] || {}), to: e.target.value } },
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}

              <div className="customise-actions">
                <button className="btn-apply" onClick={applyCustomise}>Apply</button>
                <button className="btn-reset" onClick={resetCustomise}>Reset</button>
              </div>
            </div>
          </div>
        )}

        {GENERIC_SHEETS.map((cfg, i) =>
          activeTab === 3 + i ? (
            <GenericSheetTab
              key={cfg.id}
              entry={genericState[i]}
              onUpdate={(patch) =>
                setGenericState((prev) => {
                  const next = prev.slice();
                  next[i] = { ...next[i], ...patch };
                  return next;
                })
              }
            />
          ) : null,
        )}
      </section>

      {errorMsg && <div className="error-banner">⚠ {errorMsg}</div>}
    </>
  );
}

function Kpi({ label, value, loading }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value${loading ? ' loading' : ''}`}>{value}</div>
    </div>
  );
}
