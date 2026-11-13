/**
 * PELAKSANA KERJA LATAR + PENJADUAL BERKALA
 *
 * - KERJA_LATAR: semua kerja yang boleh dijalankan oleh /api/kerja/<nama> (dipanggil QStash).
 * - jadualBerkala(): dipanggil cron (cron-job.org) setiap 15 minit — memutuskan apa yang perlu
 *   berjalan sekarang (briefing, carian kerja, laporan, emel, GitHub) dan sandaran peringatan.
 */
import { hantarMesej, muatTurunFail } from "@/lib/telegram";
import { jadualkan, qstashDisetup } from "@/lib/qstash";
import { bacaKeutamaan, bacaStatus, kemasStatus, peringatanTiba } from "@/lib/data";
import { jamMinitMY, tarikhMY } from "@/lib/masa";
import { hantarPeringatan } from "@/lib/peringatan";
import { semakAmaranTugasan } from "@/lib/tugasan";
import { binaBriefing } from "@/lib/briefing";
import { binaLaporan } from "@/lib/laporan";
import { emelDisetup } from "@/lib/emel";
import { semakEmelMasuk } from "@/lib/emel-masuk";
import { segerakGitHub } from "@/lib/github";
import { importProfilPDF } from "@/lib/import";
import { kosongkanCachePengetahuan } from "@/lib/rag/knowledge";
import { jsearchDisetup } from "@/lib/kerjaya/jsearch";
import { mulaCarian, cariSatuJawatan, nilaiDanHantar } from "@/lib/kerjaya/pemburu";
import { sediakanPermohonan, hantarPermohonan } from "@/lib/kerjaya/permohonan";

type Data = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "");

export const KERJA_LATAR: Record<string, (d: Data) => Promise<unknown>> = {
  "hantar-peringatan": (d) => hantarPeringatan(s(d.id)),
  "cari-kerja": () => mulaCarian(),
  "cari-kerja-jawatan": (d) => cariSatuJawatan(s(d.jawatan), s(d.tarikh)),
  "nilai-kerja": (d) => nilaiDanHantar(s(d.tarikh)),
  "sediakan-permohonan": async (d) => {
    try {
      return await sediakanPermohonan(s(d.id));
    } catch (e) {
      await hantarMesej(`Maaf, gagal menyediakan permohonan: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  },
  "hantar-permohonan": async (d) => {
    const hasil = await hantarPermohonan(s(d.id));
    await hantarMesej(hasil);
    return hasil;
  },
  "import-pdf": async (d) => {
    const bytes = await muatTurunFail(s(d.fileId));
    if (!bytes) return hantarMesej("Maaf, gagal memuat turun fail itu dari Telegram.");
    try {
      const sumber = /linkedin|profile/i.test(s(d.namaFail)) ? "linkedin" : "cv";
      const h = await importProfilPDF(bytes, sumber);
      const b = h.bahagian;
      return hantarMesej(
        `✅ **${sumber === "linkedin" ? "Profil LinkedIn" : "CV"} diimport.**\nPengalaman: ${b.pengalaman} · Projek: ${b.projek} · Pendidikan: ${b.pendidikan} · Sijil: ${b.sijil} · Kemahiran: ${b.kemahiran}\n\nPortfolio web dan penjana resume kini guna maklumat ini. Taip "senarai pengetahuan" untuk semak, atau padam yang tidak tepat.`,
      );
    } catch (e) {
      return hantarMesej(`Maaf, gagal membaca PDF: ${e instanceof Error ? e.message : e}`);
    }
  },
  briefing: async () => hantarMesej(await binaBriefing()),
  laporan: async () => hantarMesej(await binaLaporan()),
  "semak-emel": () => semakEmelMasuk(),
  "segerak-github": async () => {
    const h = await segerakGitHub();
    kosongkanCachePengetahuan();
    return h;
  },
};

export async function jalankanKerja(nama: string, data: Data = {}): Promise<unknown> {
  const kerja = KERJA_LATAR[nama];
  if (!kerja) throw new Error(`Kerja '${nama}' tidak wujud`);
  try {
    return await kerja(data);
  } catch (e) {
    const mesej = e instanceof Error ? e.message : String(e);
    console.error(`[kerja ${nama}]`, e);
    await kemasStatus({ ralatKerja: { masa: new Date().toISOString(), nama, mesej: mesej.slice(0, 300) } }).catch(() => {});
    throw e;
  }
}

/** Jalankan melalui QStash jika ada (tidak menyekat), jika tidak terus sekarang. */
// Kerja yang tidak boleh diulang secara automatik (emel tidak boleh "ditarik balik", PDF tidak patut dihantar dua kali)
const TANPA_CUBA_SEMULA = new Set(["hantar-permohonan", "sediakan-permohonan", "import-pdf"]);

export async function lancar(nama: string, data: Data = {}): Promise<string> {
  const opsyen = TANPA_CUBA_SEMULA.has(nama) ? { percubaan: 0 } : {};
  if (qstashDisetup() && (await jadualkan(nama, data, opsyen))) return "dijadualkan";
  await jalankanKerja(nama, data);
  return "dijalankan";
}

/** Adakah sekarang dalam tetingkap [jam, jam + tempohJam) dan belum dibuat hari ini? */
function dalamTetingkap(kini: Date, jam: string, tempohJam: number, terakhir?: string): boolean {
  if (terakhir === tarikhMY(kini)) return false;
  const [h, m] = jam.split(":").map(Number);
  const [hk, mk] = jamMinitMY(kini).split(":").map(Number);
  const minitKini = hk * 60 + mk;
  const minitJadual = h * 60 + m;
  return minitKini >= minitJadual && minitKini < minitJadual + tempohJam * 60;
}

export async function jadualBerkala(kini: Date = new Date()): Promise<Record<string, unknown>> {
  const hasil: Record<string, unknown> = {};
  const hariIni = tarikhMY(kini);

  // 1. Sandaran peringatan (jika QStash tiada / gagal)
  const tiba = await peringatanTiba(kini);
  let dihantar = 0;
  for (const p of tiba) if ((await hantarPeringatan(p.id, kini)) === "dihantar") dihantar++;
  hasil.peringatan = { tiba: tiba.length, dihantar };

  // 2. Amaran deadline tugasan
  hasil.amaranTugasan = await semakAmaranTugasan(kini);

  const k = await bacaKeutamaan();
  const status = await bacaStatus();

  // 3. Briefing pagi (tetingkap 3 jam)
  if (dalamTetingkap(kini, k.jamBriefing, 3, status.briefingTerakhir)) {
    await kemasStatus({ briefingTerakhir: hariIni });
    hasil.briefing = await lancar("briefing");
  }
  // 4. Carian kerja harian (tetingkap 6 jam)
  if (jsearchDisetup() && dalamTetingkap(kini, k.jamCarianKerja, 6, status.carianKerjaTerakhir)) {
    await kemasStatus({ carianKerjaTerakhir: hariIni });
    hasil.carianKerja = await lancar("cari-kerja");
  }
  // 5. Laporan malam (tetingkap 3 jam)
  if (dalamTetingkap(kini, k.jamLaporan, 3, status.laporanTerakhir)) {
    await kemasStatus({ laporanTerakhir: hariIni });
    hasil.laporan = await lancar("laporan");
  }
  // 6. Semak inbox setiap ~30 minit
  if (emelDisetup()) {
    const terakhir = await bacaStatusEmel();
    if (!terakhir || kini.getTime() - terakhir >= 25 * 60_000) {
      await simpanStatusEmel(kini.getTime());
      hasil.emel = await lancar("semak-emel");
    }
  }
  // 7. Segerak GitHub seminggu sekali
  if (!status.githubTerakhir || kini.getTime() - new Date(status.githubTerakhir).getTime() > 7 * 86400_000) {
    await kemasStatus({ githubTerakhir: kini.toISOString() });
    hasil.github = await lancar("segerak-github");
  }
  return hasil;
}

// Status semakan emel disimpan berasingan (cap masa, bukan tarikh)
import { bacaJSON, tulisJSON } from "@/lib/store";
const bacaStatusEmel = () => bacaJSON<number>("emel-semak-terakhir", 0);
const simpanStatusEmel = (t: number) => tulisJSON("emel-semak-terakhir", t);
