/**
 * DATA AGENT: apa yang agent ingat secara kekal (memori jangka panjang).
 * Semua data disimpan melalui store.ts (Upstash Redis di produksi).
 *
 * Prinsip: data disimpan BERSTRUKTUR (bukan ayat perbualan), supaya kod boleh
 * bertindak ke atasnya dengan tepat (contoh: carian kerja mematuhi arahan bertarikh).
 */
import { bacaJSON, tulisJSON, tambahKeSenarai, bacaSenarai } from "@/lib/store";
import { tarikhMY } from "@/lib/masa";
import { cariPadanan } from "@/lib/teks";

export function idPendek(): string {
  return Math.random().toString(36).slice(2, 7);
}

// ── Keutamaan KEKAL (diubah melalui Telegram) ─────────────────────────────
export type Keutamaan = {
  jawatan: string[];
  lokasi: string;
  sumber: string[]; // sumber carian kerja yang aktif, contoh: LinkedIn, Indeed, Glassdoor
  catatan: string[]; // keutamaan lain dalam ayat bebas
  jamBriefing: string; // "HH:mm" waktu Malaysia
  jamCarianKerja: string;
  jamLaporan: string;
  waktuInterview: { hari: number[]; mula: string; tamat: string }; // untuk tempahan melalui web
  versi?: number; // untuk migrasi tetapan lama
};

export const KEUTAMAAN_LALAI: Keutamaan = {
  // Jawatan fresh grad / entry-level (maksimum 4 supaya kuota JSearch percuma cukup sebulan)
  jawatan: ["Junior Software Engineer", "Junior Web Developer", "Junior AI Engineer", "Junior Software Tester QA"],
  lokasi: "Malaysia",
  sumber: ["LinkedIn", "Indeed", "Glassdoor"],
  catatan: [],
  jamBriefing: "07:30",
  jamCarianKerja: "08:00",
  jamLaporan: "21:00",
  waktuInterview: { hari: [1, 2, 3, 4, 5], mula: "10:00", tamat: "17:00" },
  versi: 2,
};

export async function bacaKeutamaan(): Promise<Keutamaan> {
  // Gabung dengan nilai lalai supaya medan baru wujud walaupun data lama disimpan sebelum medan itu ditambah
  const tersimpan = await bacaJSON<Partial<Keutamaan> | null>("keutamaan", null);
  if (!tersimpan) return { ...KEUTAMAAN_LALAI };
  const k = { ...KEUTAMAAN_LALAI, ...tersimpan };
  // Migrasi v2 (Nov 2026): Darwish kini mencari kerja FRESH GRAD (bukan internship), dan
  // tetapan sumber "Indeed sahaja" yang tersimpan akibat pepijat lama dikembalikan kepada lalai.
  if ((tersimpan.versi ?? 1) < 2) {
    k.jawatan = KEUTAMAAN_LALAI.jawatan;
    if (k.sumber.length === 1 && k.sumber[0].toLowerCase() === "indeed") k.sumber = KEUTAMAAN_LALAI.sumber;
    k.versi = 2;
    await simpanKeutamaan(k);
  }
  return k;
}
export const simpanKeutamaan = (k: Keutamaan) => tulisJSON("keutamaan", k);

// ── Arahan BERTARIKH (sekali sahaja, contoh "esok jangan cari di LinkedIn") ─
export type JenisArahan = "langkau_sumber" | "hanya_sumber" | "langkau_carian" | "nota";
export type Arahan = {
  id: string;
  tarikh: string; // YYYY-MM-DD
  jenis: JenisArahan;
  sumber?: string[];
  arahan: string; // penerangan dalam ayat
  dibuat: string;
};

export async function bacaArahan(): Promise<Arahan[]> {
  const semua = await bacaJSON<Arahan[]>("arahan", []);
  return semua.map((a) => ({ ...a, jenis: a.jenis ?? "nota" })); // data lama tiada medan jenis
}
export async function tambahArahan(a: Omit<Arahan, "id" | "dibuat">): Promise<Arahan> {
  const baru: Arahan = { ...a, id: idPendek(), dibuat: new Date().toISOString() };
  const semua = (await bacaArahan()).filter((x) => x.tarikh >= tarikhMY()); // buang yang sudah lepas
  semua.push(baru);
  await tulisJSON("arahan", semua);
  return baru;
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

/** Sumber carian kerja yang berkuat kuasa pada tarikh tertentu (keutamaan kekal + arahan hari itu). */
export async function sumberBerkuatKuasa(tarikh: string): Promise<{ langkau: boolean; sumber: string[]; sebab: string[] }> {
  const k = await bacaKeutamaan();
  const arahan = await arahanUntuk(tarikh);
  let sumber = [...k.sumber];
  const sebab: string[] = [];
  for (const a of arahan) {
    if (a.jenis === "langkau_carian") return { langkau: true, sumber: [], sebab: [a.arahan] };
    if (a.jenis === "hanya_sumber" && a.sumber?.length) {
      sumber = a.sumber;
      sebab.push(a.arahan);
    }
    if (a.jenis === "langkau_sumber" && a.sumber?.length) {
      const buang = a.sumber.map((s) => s.toLowerCase());
      sumber = sumber.filter((s) => !buang.includes(s.toLowerCase()));
      sebab.push(a.arahan);
    }
  }
  return { langkau: false, sumber, sebab };
}

// ── Peringatan (sekali atau berulang) ─────────────────────────────────────
export type Ulangan = { jenis: "harian" | "mingguan"; hari?: number[]; jam: string }; // hari: 1=Isnin..7=Ahad
export type StatusPeringatan = "aktif" | "dihantar" | "selesai" | "dibatal";
export type Peringatan = {
  id: string;
  masa: string; // ISO (UTC)
  teks: string;
  status: StatusPeringatan;
  ulang?: Ulangan;
  qstashId?: string | null;
};

type PeringatanLama = Partial<Peringatan> & { dihantar?: boolean };

export async function bacaPeringatan(): Promise<Peringatan[]> {
  const semua = await bacaJSON<PeringatanLama[]>("peringatan", []);
  return semua.map((p) => ({
    id: p.id!,
    masa: p.masa!,
    teks: p.teks ?? "",
    status: p.status ?? (p.dihantar ? "dihantar" : "aktif"),
    ulang: p.ulang,
    qstashId: p.qstashId,
  }));
}
async function simpanSemuaPeringatan(semua: Peringatan[]) {
  const seminggu = Date.now() - 7 * 86400_000;
  // Buang rekod lama yang sudah tidak aktif
  await tulisJSON(
    "peringatan",
    semua.filter((p) => p.status === "aktif" || new Date(p.masa).getTime() > seminggu),
  );
}
export async function tambahPeringatan(masa: Date, teks: string, ulang?: Ulangan): Promise<Peringatan> {
  const p: Peringatan = { id: idPendek(), masa: masa.toISOString(), teks, status: "aktif", ulang };
  const semua = await bacaPeringatan();
  semua.push(p);
  await simpanSemuaPeringatan(semua);
  return p;
}
export async function kemasPeringatan(id: string, ubah: Partial<Peringatan>): Promise<Peringatan | null> {
  const semua = await bacaPeringatan();
  const i = semua.findIndex((p) => p.id === id);
  if (i < 0) return null;
  semua[i] = { ...semua[i], ...ubah };
  await simpanSemuaPeringatan(semua);
  return semua[i];
}
/** Cari peringatan AKTIF ikut id atau padanan teks (contoh "air" → "Minum air"). */
export async function cariPeringatanAktif(rujukan: string): Promise<Peringatan[]> {
  const aktif = (await bacaPeringatan()).filter((p) => p.status === "aktif");
  return cariPadanan(aktif, rujukan, (p) => p.teks);
}
/** Peringatan yang sudah tiba masanya tetapi belum dihantar (sandaran cron). */
export async function peringatanTiba(kini = new Date()): Promise<Peringatan[]> {
  return (await bacaPeringatan()).filter((p) => p.status === "aktif" && new Date(p.masa) <= kini);
}

// ── Tugasan (sesuatu yang perlu DISIAPKAN, mungkin ada deadline) ──────────
export type Tugasan = {
  id: string;
  tajuk: string;
  deadline?: string; // ISO
  keutamaan: "tinggi" | "biasa";
  status: "belum" | "siap";
  dibuat: string;
  siapPada?: string;
  amaran?: { sehari?: boolean; lewat?: boolean };
};
export const bacaTugasan = () => bacaJSON<Tugasan[]>("tugasan", []);
async function simpanSemuaTugasan(semua: Tugasan[]) {
  const sebulan = Date.now() - 30 * 86400_000;
  await tulisJSON(
    "tugasan",
    semua.filter((t) => t.status === "belum" || new Date(t.siapPada ?? t.dibuat).getTime() > sebulan),
  );
}
export async function tambahTugasan(t: Pick<Tugasan, "tajuk" | "deadline" | "keutamaan">): Promise<Tugasan> {
  const baru: Tugasan = { ...t, id: idPendek(), status: "belum", dibuat: new Date().toISOString() };
  const semua = await bacaTugasan();
  semua.push(baru);
  await simpanSemuaTugasan(semua);
  return baru;
}
export async function kemasTugasan(id: string, ubah: Partial<Tugasan>): Promise<Tugasan | null> {
  const semua = await bacaTugasan();
  const i = semua.findIndex((t) => t.id === id);
  if (i < 0) return null;
  semua[i] = { ...semua[i], ...ubah };
  await simpanSemuaTugasan(semua);
  return semua[i];
}
export async function padamTugasan(id: string): Promise<boolean> {
  const semua = await bacaTugasan();
  const baki = semua.filter((t) => t.id !== id);
  await simpanSemuaTugasan(baki);
  return baki.length !== semua.length;
}
export async function cariTugasanBelum(rujukan: string): Promise<Tugasan[]> {
  const belum = (await bacaTugasan()).filter((t) => t.status === "belum");
  return cariPadanan(belum, rujukan, (t) => t.tajuk);
}

/** Cari arahan bertarikh yang akan datang ikut kata kunci, sumber atau tarikh ("linkedin", "esok", "2026-11-15"). */
export async function cariArahanAkanDatang(rujukan: string, hariIni: string): Promise<Arahan[]> {
  const akan = (await bacaArahan()).filter((a) => a.tarikh >= hariIni);
  if (/^(semua|all)$/i.test(rujukan.trim())) return akan;
  const tarikh = rujukan.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (tarikh) return akan.filter((a) => a.tarikh === tarikh);
  return cariPadanan(akan, rujukan, (a) => `${a.arahan} ${(a.sumber ?? []).join(" ")} ${a.jenis.replace(/_/g, " ")}`);
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
  ringkasan?: string;
};
export const simpanLead = (l: Lead) => tambahKeSenarai("leads", l, 300);
export const bacaLeads = () => bacaSenarai<Lead>("leads");

// ── Log soalan pelawat web (untuk laporan & statistik) ────────────────────
export type LogSoalan = { masa: string; soalan: string; tools: string[]; tiadaJawapan: boolean };
export const logSoalan = (l: LogSoalan) => tambahKeSenarai(`log-${tarikhMY(new Date(l.masa))}`, l, 1000);
export const bacaLogHari = (tarikh: string) => bacaSenarai<LogSoalan>(`log-${tarikh}`);

// ── Sejarah chat Telegram antara Darwish dan agent peribadi ───────────────
export type MesejChat = { role: "user" | "assistant"; content: string };
export const bacaSejarahTelegram = () => bacaJSON<MesejChat[]>("telegram-sejarah", []);
export const simpanSejarahTelegram = (s: MesejChat[]) => tulisJSON("telegram-sejarah", s.slice(-20));

// ── Pengetahuan tambahan (ditambah melalui Telegram / import dokumen) ─────
export type Pengetahuan = { id: string; tajuk: string; teks: string; sumber: string; masa: string };
export const bacaPengetahuan = () => bacaJSON<Pengetahuan[]>("pengetahuan", []);
export async function tambahPengetahuan(p: Omit<Pengetahuan, "id" | "masa">): Promise<Pengetahuan> {
  const baru = { ...p, id: idPendek(), masa: new Date().toISOString() };
  const semua = await bacaPengetahuan();
  semua.push(baru);
  await tulisJSON("pengetahuan", semua.slice(-200));
  return baru;
}
export async function padamPengetahuan(id: string): Promise<boolean> {
  const semua = await bacaPengetahuan();
  const baki = semua.filter((p) => p.id !== id);
  await tulisJSON("pengetahuan", baki);
  return baki.length !== semua.length;
}

// ── Status sistem ─────────────────────────────────────────────────────────
export type Status = {
  laporanTerakhir?: string;
  briefingTerakhir?: string;
  carianKerjaTerakhir?: string;
  githubTerakhir?: string;
  emelUidTerakhir?: number;
  updateTelegramTerakhir?: number;
  ralatTelegram?: string | null;
  ralatWebhook?: { masa: string; mesej: string };
  ralatKerja?: { masa: string; nama: string; mesej: string };
};
export const bacaStatus = () => bacaJSON<Status>("status", {});
export async function kemasStatus(ubah: Partial<Status>) {
  await tulisJSON("status", { ...(await bacaStatus()), ...ubah });
}
