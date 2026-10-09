// Pie-chart categorical palette, derived from the dashboard's Flat Color
// Set 6 brand palette (hot pink, cyan, deep purple, magenta) plus tints
// so adjacent slices stay distinguishable when there are many reasons.
export const COLORS = [
  '#f02e7a', '#6ec9d8', '#4d1d4a', '#8e2566',
  '#f799bc', '#a8dde7', '#7a3f75', '#c063a0',
  '#2a1a2e', '#45a4b4',
];

export function normReason(r) {
  if (!r) return 'Miscellaneous';
  const s = r.trim().toLowerCase();
  if (s.includes('cx request') || s === 'cancellation') return 'CX requested cancellation';
  if (s === 'rto' || s.includes('rto')) return 'RTO';
  if (s === 'nsz') return 'NSZ';
  if (s.includes('delayed')) return 'Delayed delivery';
  if (s.includes('missing') || s.includes('incomplete') || s.includes('missing snacks')) return 'Missing snacks';
  if (
    s.includes('damaged') ||
    s.includes('bad condition') ||
    s.includes('bad quality') ||
    s.includes('package received in bad')
  )
    return 'Damaged order';
  return 'Miscellaneous';
}
