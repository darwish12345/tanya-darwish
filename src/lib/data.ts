/**
 * DATA AGENT: apa yang agent ingat secara kekal.
 * Semua data disimpan melalui store.ts (Netlify Blobs di produksi).
 */
import { bacaJSON, tulisJSON, tambahKeSenarai } from "@/lib/store";
import { tarikhMY } from "@/lib/masa";

// ── Keutamaan carian kerja (diubah melalui Telegram) ──────────────────────
export type Keutamaan = {
  jawatan: string[];
  lokasi: string;
  sumber: string[]; // contoh: LinkedIn, Indeed, Glassdoor
  catatan: string[]; // keutamaan lain dalam ayat bebas
};

export const KEUTAMAAN_LALAI: Keutamaan = {
  jawatan: ["Junior Software Engineer", "Web / Full-stack Developer", "AI Engineer / AI Developer"],
  lokasi: "Malaysia",
  sumber: ["LinkedIn", "Indeed", "Glassdoor"],
  catatan: [],
};

export const bacaKeutamaan = () => bacaJSON<Keutamaan>("keutamaan", KEUTAMAAN_LALAI);
export const simpanKeutamaan = (k: Keutamaan) => tulisJSON("keutamaan", k);

// ── Arahan sekali untuk tarikh tertentu (contoh: "esok jangan cari di LinkedIn") ─
export type Arahan = { id: string; tarikh: string; arahan: string; dibuat: string };

export const bacaArahan = () => bacaJSON<Arahan[]>("arahan", []);
export async function tambahArahan(tarikh: string, arahan: string): Promise<Arahan> {
  const a: Arahan = { id: idPendek(), tarikh, arahan, dibuat: new Date().toISOString() };
  const semua = (await bacaArahan()).filter((x) => x.tarikh >= tarikhMY()); // buang yang sudah lepas
  semua.push(a);
  await tulisJSON("arahan", semua);
  return a;
}
export async function arahanUntuk(tarikh: string): Promise<Arahan[]> {
  return (await bacaArahan()).filter((a) => a.tarikh === tarikh);
}
export async function padamArahan(id: string): Promise<boolean> {
  const semua = await bacaArahan();
  const baki = semua.filter((a) => a.id !== id);
  await tulisJSON("arahan", baki);
  return baki.length !== semua.length;
}

// ── Peringatan ────────────────────────────────────────────────────────────
export type Peringatan = { id: string; masa: string; teks: string; dihantar: boolean };

export const bacaPeringatan = () => bacaJSON<Peringatan[]>("peringatan", []);
export async function tambahPeringatan(masa: Date, teks: string): Promise<Peringatan> {
  const p: Peringatan = { id: idPendek(), masa: masa.toISOString(), teks, dihantar: false };
  const semua = await bacaPeringatan();
  semua.push(p);
  await tulisJSON("peringatan", semua);
  return p;
}
export async function batalPeringatan(id: string): Promise<boolean> {
  const semua = await bacaPeringatan();
  const baki = semua.filter((p) => p.id !== id);
  await tulisJSON("peringatan", baki);
  return baki.length !== semua.length;
}
/** Peringatan yang sudah tiba masanya tetapi belum dihantar. */
export async function peringatanTiba(kini = new Date()): Promise<Peringatan[]> {
  return (await bacaPeringatan()).filter((p) => !p.dihantar && new Date(p.masa) <= kini);
}
export async function tandaDihantar(ids: string[]): Promise<void> {
  const seminggu = Date.now() - 7 * 86400_000;
  const semua = (await bacaPeringatan())
    .map((p) => (ids.includes(p.id) ? { ...p, dihantar: true } : p))
    .filter((p) => !p.dihantar || new Date(p.masa).getTime() > seminggu); // buang yang lama
  await tulisJSON("peringatan", semua);
}

// ── Leads dari laman web ──────────────────────────────────────────────────
export type Lead = {
  masa: string;
  nama: string;
  syarikat?: string;
  jawatan?: string;
  hubungan?: string;
  jenis?: string; // recruiter / kawan / lain
  mesej: string;
  ringkasan?: string; // apa yang pelawat tanya sebelum ini
};
export const simpanLead = (l: Lead) => tambahKeSenarai("leads", l, 300);
export const bacaLeads = () => bacaJSON<Lead[]>("leads", []);

// ── Log soalan pelawat web (untuk laporan harian) ─────────────────────────
export type LogSoalan = { masa: string; soalan: string; tools: string[]; tiadaJawapan: boolean };
export const logSoalan = (l: LogSoalan) => tambahKeSenarai(`log-${tarikhMY(new Date(l.masa))}`, l, 1000);
export const bacaLogHari = (tarikh: string) => bacaJSON<LogSoalan[]>(`log-${tarikh}`, []);

// ── Sejarah chat Telegram antara Darwish dan agent peribadi ───────────────
export type MesejChat = { role: "user" | "assistant"; content: string };
export const bacaSejarahTelegram = () => bacaJSON<MesejChat[]>("telegram-sejarah", []);
export const simpanSejarahTelegram = (s: MesejChat[]) => tulisJSON("telegram-sejarah", s.slice(-20));

// ── Status sistem (elak hantar laporan dua kali, elak proses update Telegram berulang) ─
export type Status = { laporanTerakhir?: string; updateTelegramTerakhir?: number };
export const bacaStatus = () => bacaJSON<Status>("status", {});
export async function kemasStatus(ubah: Partial<Status>) {
  await tulisJSON("status", { ...(await bacaStatus()), ...ubah });
}

function idPendek(): string {
  return Math.random().toString(36).slice(2, 7);
}
