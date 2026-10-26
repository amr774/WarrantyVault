export function dateOnly(value: Date | string) {
  return new Date(new Date(value).toISOString().slice(0, 10) + 'T00:00:00.000Z');
}
export function addMonthsClamped(value: Date | string, months: number) {
  const start = dateOnly(value);
  const day = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() + months);
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day, last));
  return start;
}
export function warranty(expiresAt: Date, purchaseDate: Date, threshold = 30, now = new Date()) {
  const daysRemaining = Math.round(
    (dateOnly(expiresAt).getTime() - dateOnly(now).getTime()) / 86400000,
  );
  const duration = Math.max(
    1,
    (dateOnly(expiresAt).getTime() - dateOnly(purchaseDate).getTime()) / 86400000,
  );
  return {
    daysRemaining,
    status: daysRemaining < 0 ? 'EXPIRED' : daysRemaining <= threshold ? 'EXPIRING_SOON' : 'ACTIVE',
    progress: Math.max(0, Math.min(100, (1 - daysRemaining / duration) * 100)),
  };
}
