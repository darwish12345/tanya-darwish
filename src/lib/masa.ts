/**
 * Helper waktu Malaysia (Asia/Kuala_Lumpur, UTC+8, tiada waktu musim panas).
 * Server berjalan dalam UTC, jadi SEMUA paparan dan input masa melalui fail ini.
 */
export const ZON = "Asia/Kuala_Lumpur";
const OFFSET_JAM = 8;

/** "YYYY-MM-DD" untuk tarikh hari ini (atau tarikh `d`) di Malaysia. */
export function tarikhMY(d: Date = new Date()): string {
  return new Date(d.getTime() + OFFSET_JAM * 3600_000).toISOString().slice(0, 10);
}

/** Jam semasa di Malaysia (0–23). */
export function jamMY(d: Date = new Date()): number {
  return new Date(d.getTime() + OFFSET_JAM * 3600_000).getUTCHours();
}

/** Tukar "YYYY-MM-DD HH:mm" (waktu Malaysia) kepada objek Date (UTC). Pulangkan null jika format salah. */
export function dariMasaMY(teks: string): Date | null {
  const m = teks.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, y, bln, h, j, min] = m.map(Number);
  const utc = Date.UTC(y, bln - 1, h, j - OFFSET_JAM, min);
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Paparan mesra, contoh "Sabtu, 14 Nov 2026, 7:00 PG". */
export function paparMY(d: Date): string {
  return new Intl.DateTimeFormat("ms-MY", {
    timeZone: ZON,
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** Tarikh `n` hari dari hari ini (waktu Malaysia), "YYYY-MM-DD". */
export function tambahHari(tarikh: string, n: number): string {
  const d = new Date(`${tarikh}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
