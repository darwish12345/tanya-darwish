/**
 * AGENT PERIBADI TELEGRAM: pembantu peribadi Darwish.
 *
 * Darwish chat dengan bot Telegram → /api/telegram → agent ini.
 * Agent ini guna gelung yang SAMA dengan agent web, tetapi dengan prompt dan tools berbeza.
 * Semua masa dalam waktu Malaysia.
 */
import { z } from "zod";
import { buatTool, type SebarangTool } from "./rangka";
import { jalankanGelung, type KlienLLM, type MesejSejarah } from "./loop";
import { dariMasaMY, paparMY, tarikhMY, tambahHari } from "@/lib/masa";
import {
  bacaKeutamaan,
  simpanKeutamaan,
  tambahArahan,
  bacaArahan,
  padamArahan,
  tambahPeringatan,
  bacaPeringatan,
  batalPeringatan,
  bacaLeads,
} from "@/lib/data";
import { binaLaporan } from "@/lib/laporan";

function promptPeribadi(kini: Date): string {
  const hariIni = tarikhMY(kini);
  return `Anda ialah pembantu peribadi AI untuk Darwish (pelatih Software Engineering yang sedang mencari kerja). Anda berbual dengan Darwish sendiri melalui Telegram.

MASA SEKARANG (waktu Malaysia): ${paparMY(kini)}
Hari ini: ${hariIni}. Esok: ${tambahHari(hariIni, 1)}. Lusa: ${tambahHari(hariIni, 2)}.

TUGAS ANDA:
- Urus peringatan (tetapkan, senarai, batal). Semua masa dalam waktu Malaysia, format "YYYY-MM-DD HH:mm" (24 jam). Tukar "esok pukul 7 pagi" kepada tarikh dan masa sebenar menggunakan maklumat di atas. "7 malam" = 19:00.
- Urus keutamaan carian kerja (jawatan, lokasi, sumber seperti LinkedIn/Indeed/Glassdoor).
- Catat arahan sekali untuk tarikh tertentu, contohnya "esok jangan cari kerja di LinkedIn".
- Tunjuk lead (mesej pelawat dari laman portfolio) dan ringkasan aktiviti hari ini.

PERATURAN:
1. Guna tools untuk setiap tindakan. Jangan kata sesuatu sudah dibuat jika tool tidak dipanggil atau tool memulangkan ralat.
2. Selepas bertindak, sahkan dengan ringkas apa yang dibuat, termasuk tarikh dan masa penuh.
3. Jika arahan kabur (contoh masa tidak jelas pagi atau petang), tanya satu soalan ringkas dahulu.
4. Bila Darwish mematikan satu sumber carian untuk sesuatu hari, catat arahan itu, kemudian tanya secara ringkas tentang sumber lain yang masih aktif (contoh: "Indeed dan Glassdoor masih perlu dicari?").
5. Ciri carian kerja automatik, resume/cover letter dan tempahan interview sedang dibina (fasa seterusnya). Jika diminta, beritahu dengan jujur ciri itu belum aktif, tetapi catat keutamaan atau arahan berkaitan supaya digunakan nanti.
6. Balas dalam Bahasa Melayu santai dan ringkas (maksimum 80 patah perkataan) melainkan Darwish guna English. Guna **tebal** untuk perkara penting.`;
}

const TOOLS_PERIBADI: SebarangTool[] = [
  buatTool({
    nama: "tetapkan_peringatan",
    penerangan: "Tetapkan peringatan yang akan dihantar ke Telegram Darwish pada masa tertentu (waktu Malaysia).",
    skema: z.object({
      masa: z.string().describe('Waktu Malaysia, format "YYYY-MM-DD HH:mm" (24 jam), contoh "2026-11-14 07:00"'),
      teks: z.string().min(1).max(300).describe("Isi peringatan, contoh 'Siap sedia untuk interview'"),
    }),
    async jalankan({ masa, teks }) {
      const d = dariMasaMY(masa);
      if (!d) return { untukLLM: { ralat: 'Format masa salah. Guna "YYYY-MM-DD HH:mm".' } };
      if (d.getTime() < Date.now() - 60_000) return { untukLLM: { ralat: "Masa itu sudah lepas." } };
      const p = await tambahPeringatan(d, teks);
      return { untukLLM: { status: "ditetapkan", id: p.id, masa: paparMY(d), teks } };
    },
  }),
  buatTool({
    nama: "senarai_peringatan",
    penerangan: "Senaraikan peringatan yang akan datang.",
    skema: z.object({}),
    async jalankan() {
      const akan = (await bacaPeringatan())
        .filter((p) => !p.dihantar)
        .sort((a, b) => a.masa.localeCompare(b.masa))
        .map((p) => ({ id: p.id, masa: paparMY(new Date(p.masa)), teks: p.teks }));
      return { untukLLM: { peringatan: akan } };
    },
  }),
  buatTool({
    nama: "batal_peringatan",
    penerangan: "Batalkan satu peringatan mengikut id (dapatkan id dari senarai_peringatan).",
    skema: z.object({ id: z.string() }),
    async jalankan({ id }) {
      return { untukLLM: { status: (await batalPeringatan(id)) ? "dibatalkan" : "id tidak dijumpai" } };
    },
  }),
  buatTool({
    nama: "lihat_keutamaan",
    penerangan: "Lihat keutamaan carian kerja semasa dan arahan khas yang akan datang.",
    skema: z.object({}),
    async jalankan() {
      const arahan = (await bacaArahan()).filter((a) => a.tarikh >= tarikhMY());
      return { untukLLM: { keutamaan: await bacaKeutamaan(), arahanAkanDatang: arahan } };
    },
  }),
  buatTool({
    nama: "kemas_kini_keutamaan",
    penerangan:
      "Ubah keutamaan carian kerja KEKAL (jawatan, lokasi, sumber, catatan). Hanya medan yang diberi akan diubah. Untuk arahan satu hari sahaja, guna catat_arahan.",
    skema: z.object({
      jawatan: z.array(z.string().max(80)).max(10).optional(),
      lokasi: z.string().max(100).optional(),
      sumber: z.array(z.string().max(30)).max(10).optional().describe("Contoh ['LinkedIn','Indeed','Glassdoor']"),
      tambah_catatan: z.string().max(200).optional().describe("Keutamaan lain, contoh 'gaji minimum RM3500'"),
    }),
    async jalankan({ jawatan, lokasi, sumber, tambah_catatan }) {
      const k = await bacaKeutamaan();
      const baru = {
        ...k,
        ...(jawatan ? { jawatan } : {}),
        ...(lokasi ? { lokasi } : {}),
        ...(sumber ? { sumber } : {}),
        catatan: tambah_catatan ? [...k.catatan, tambah_catatan].slice(-20) : k.catatan,
      };
      await simpanKeutamaan(baru);
      return { untukLLM: { status: "dikemas kini", keutamaan: baru } };
    },
  }),
  buatTool({
    nama: "catat_arahan",
    penerangan:
      "Catat arahan sekali untuk tarikh tertentu (contoh 'jangan cari kerja di LinkedIn'). Agent carian kerja akan mematuhinya pada tarikh itu.",
    skema: z.object({
      tarikh: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD"),
      arahan: z.string().min(1).max(200),
    }),
    async jalankan({ tarikh, arahan }) {
      if (tarikh < tarikhMY()) return { untukLLM: { ralat: "Tarikh itu sudah lepas." } };
      const a = await tambahArahan(tarikh, arahan);
      return { untukLLM: { status: "dicatat", id: a.id, tarikh, arahan } };
    },
  }),
  buatTool({
    nama: "padam_arahan",
    penerangan: "Padam satu arahan khas mengikut id (dapatkan id dari lihat_keutamaan).",
    skema: z.object({ id: z.string() }),
    async jalankan({ id }) {
      return { untukLLM: { status: (await padamArahan(id)) ? "dipadam" : "id tidak dijumpai" } };
    },
  }),
  buatTool({
    nama: "lihat_leads",
    penerangan: "Lihat mesej terkini dari pelawat laman portfolio (recruiter/kawan).",
    skema: z.object({ had: z.number().int().min(1).max(10).optional() }),
    async jalankan({ had = 5 }) {
      const leads = (await bacaLeads()).slice(-had).reverse().map((l) => ({ ...l, masa: paparMY(new Date(l.masa)) }));
      return { untukLLM: { leads } };
    },
  }),
  buatTool({
    nama: "ringkasan_hari_ini",
    penerangan: "Ringkasan aktiviti hari ini: soalan pelawat web, soalan yang agent gagal jawab, leads, peringatan esok.",
    skema: z.object({}),
    async jalankan() {
      return { untukLLM: { laporan: await binaLaporan() } };
    },
  }),
];

/** Jalankan agent peribadi untuk satu mesej Darwish. */
export async function jalankanAgenPeribadi(
  sejarah: MesejSejarah[],
  llm?: KlienLLM,
  kini: Date = new Date(),
): Promise<string> {
  const hasil = await jalankanGelung({ systemPrompt: promptPeribadi(kini), tools: TOOLS_PERIBADI, sejarah, llm });
  if (hasil.hadDicapai) return "Maaf, arahan itu terlalu rumit untuk saya siapkan. Boleh pecahkan kepada langkah lebih kecil?";
  return hasil.teks.trim() || "Maaf, saya tak dapat menyiapkan jawapan. Cuba sekali lagi?";
}

export { TOOLS_PERIBADI };
