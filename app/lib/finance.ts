export function money(amount: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount || 0);
}

export function auDate(date: Date) {
  return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function inputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function startOfFinanceWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day >= 4 ? day - 4 : day + 3;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfFinanceWeek(date: Date) {
  const d = startOfFinanceWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

export function daysRemainingInFinanceWeek(date: Date) {
  const end = endOfFinanceWeek(date);
  return Math.max(1, Math.ceil((end.getTime() - date.getTime()) / 86400000));
}

export function daysPassedInFinanceWeek(date: Date) {
  const start = startOfFinanceWeek(date);
  return Math.max(1, Math.ceil((date.getTime() - start.getTime()) / 86400000));
}

export function nextPaymentFrom(date: Date, frequency: string) {
  const d = new Date(date);
  if (frequency === "WEEKLY") d.setDate(d.getDate() + 7);
  else if (frequency === "FORTNIGHTLY") d.setDate(d.getDate() + 14);
  else if (frequency === "YEARLY") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}
