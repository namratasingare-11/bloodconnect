export function formatShortDate(isoDate?: string | null): string {
  if (!isoDate) return '—';
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(isoDate?: string | null): string {
  if (!isoDate) return '—';
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function daysUntil(isoDate: string): number {
  const target = new Date(isoDate).getTime();
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24)));
}

export function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case 'Available':
    case 'Eligible':
    case 'Fulfilled':
    case 'Completed':
    case 'Verified':
    case 'Scheduled':
    case 'Checked In':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Low':
    case 'Pending':
    case 'Under Review':
    case 'Reserved':
    case 'Partially Fulfilled':
    case 'Pending Verification':
    case 'Temporarily Deferred':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Critical':
    case 'Emergency':
    case 'Rejected':
    case 'Expired':
    case 'Cancelled':
    case 'Permanently Deferred':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}
