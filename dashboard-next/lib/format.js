export function toYMD(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return d.toISOString().slice(0, 10);
}

export function formatRemark(text) {
  if (!text) return '';
  let formatted = text.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  formatted = formatted.replace(/\bRto\b/g, 'RTO');
  return formatted;
}

export function fmtCurrency(n) {
  return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
}

export function humanizeKey(key) {
  const acronyms = { id: 'ID', cc: 'CC', url: 'URL', sku: 'SKU' };
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((w) => acronyms[w.toLowerCase()] || w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
