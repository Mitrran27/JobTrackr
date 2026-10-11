export const STATUSES = [
  { key: 'SAVED', label: 'Saved', hint: 'Interesting, not applied yet', color: '#64748b' },
  { key: 'WAITING', label: 'Waiting', hint: 'Applied, waiting for a reply', color: '#d97706' },
  { key: 'IN_PROGRESS', label: 'In progress', hint: 'Recruiter or HR in conversation', color: '#0891b2' },
  { key: 'INTERVIEW', label: 'Interviews', hint: 'Interviews to attend', color: '#7c3aed' },
  { key: 'OFFER', label: 'Offers', hint: 'Offer received', color: '#059669' },
  { key: 'CLOSED', label: 'Closed', hint: 'Rejected, withdrawn or filled', color: '#dc2626' },
];

export const statusMeta = (k) => STATUSES.find((s) => s.key === k) || STATUSES[0];

export const fmtDate = (v, withTime = false) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  return d.toLocaleString('en-GB', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
};

export const fmtMoney = (v, currency = 'MYR') => {
  if (v == null || v === '' || isNaN(Number(v))) return '-';
  try {
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(v));
  } catch {
    return `${currency} ${Math.round(Number(v)).toLocaleString()}`;
  }
};

const pad = (n) => String(n).padStart(2, '0');
/** ISO -> value for <input type="datetime-local"> (local time) */
export const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const toDateInput = (iso) => (toLocalInput(iso) || '').slice(0, 10);
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

export const scoreColor = (s) => (s >= 70 ? '#059669' : s >= 45 ? '#d97706' : '#dc2626');
