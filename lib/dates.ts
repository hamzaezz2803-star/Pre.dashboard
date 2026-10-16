/** Helpers de dates. Toutes les dates sont des chaînes locales "YYYY-MM-DD". */

const pad = (n: number): string => String(n).padStart(2, "0");

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isValidISODate(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(parseISODate(s)) === s;
}

export function currentMonthRange(now: Date = new Date()): { from: string; to: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: toISODate(start), to: toISODate(end) };
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Jours ouvrés (lundi à vendredi) entre deux dates incluses. */
export function listWorkdays(from: string, to: string): string[] {
  const out: string[] = [];
  if (from > to) return out;
  const cursor = parseISODate(from);
  const end = parseISODate(to);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) out.push(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** "2026-10-15" -> "15/10/2026" */
export function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-10-15T08:02:15.000Z" -> "15/10/2026 08:02" */
export function formatDateTimeFr(dt: string | Date): string {
  if (!dt) return "Aucun";
  const d = typeof dt === "string" ? new Date(dt) : dt;
  if (isNaN(d.getTime())) {
    const parts = String(dt).split("T");
    if (parts.length === 2) {
      return `${formatDateFr(parts[0])} ${parts[1].slice(0, 5)}`;
    }
    return String(dt);
  }
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/** Formate l'heure seule au format HH:mm */
export function formatTimeFr(dt: string | Date): string {
  if (!dt) return "Aucun";
  const d = typeof dt === "string" ? new Date(dt) : dt;
  if (isNaN(d.getTime())) return "";
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${hours}:${minutes}`;
}

/** 455 -> "7h35" */
export function formatDuration(totalMinutes: number): string {
  if (!totalMinutes || isNaN(totalMinutes)) return "0h00";
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${h}h${pad(m)}`;
}

export function minutesBetween(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}
