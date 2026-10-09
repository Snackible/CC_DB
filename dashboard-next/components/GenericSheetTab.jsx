'use client';
import { useMemo } from 'react';
import { toYMD, fmtCurrency } from '@/lib/format';

export default function GenericSheetTab({ entry, onUpdate }) {
  const { config, data, columns, dateFilter, search, selectValues } = entry;

  const selectOptions = useMemo(() => {
    const out = {};
    (config.selectFilters || []).forEach((sf) => {
      out[sf.field] = [
        ...new Set(data.map((r) => (r[sf.field] ?? '').toString().trim()).filter(Boolean)),
      ].sort();
    });
    return out;
  }, [data, config.selectFilters]);

  const rows = useMemo(() => {
    const q = (search || '').toLowerCase();
    return data.filter((r) => {
      if (q && !Object.values(r).join(' ').toLowerCase().includes(q)) return false;
      for (const sf of config.selectFilters || []) {
        const want = selectValues[sf.field] || '';
        if (want && (r[sf.field] ?? '').toString().trim().toLowerCase() !== want.toLowerCase())
          return false;
      }
      if (config.dateField) {
        const d = toYMD(r[config.dateField]);
        if (dateFilter.from && d < dateFilter.from) return false;
        if (dateFilter.to && d > dateFilter.to) return false;
      }
      return true;
    });
  }, [data, search, selectValues, config, dateFilter]);

  const fmtCell = (row, col) => {
    const value = row[col.key];
    if (col.badge) {
      const key = (value ?? '').toString().trim().toLowerCase();
      const b = col.badge[key] || col.badge.default;
      if (!b) return value ?? '—';
      return (
        <span className="badge" style={{ background: b.bg, color: b.color }}>
          {b.label}
        </span>
      );
    }
    if (col.format === 'currency') return fmtCurrency(value);
    return value === undefined || value === null || value === '' ? '—' : value;
  };

  return (
    <div className="pane active">
      <div className="table-toolbar">
        <input
          type="text"
          placeholder={config.searchPlaceholder || 'Search…'}
          value={search}
          onChange={(e) => onUpdate({ search: e.target.value })}
        />
        {(config.selectFilters || []).map((sf) => (
          <select
            key={sf.field}
            value={selectValues[sf.field] || ''}
            onChange={(e) =>
              onUpdate({ selectValues: { ...selectValues, [sf.field]: e.target.value } })
            }
          >
            <option value="">All {sf.label}</option>
            {selectOptions[sf.field]?.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        ))}
        <span className="row-count">{rows.length} of {data.length}</span>
      </div>
      <div className="tbl-scroll">
        <table>
          <thead>
            <tr>
              {columns?.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((r, i) => (
              <tr key={i}>
                {columns?.map((col) => (
                  <td key={col.key}>{fmtCell(r, col)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
