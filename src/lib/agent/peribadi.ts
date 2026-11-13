/**
 * AGENT PERIBADI TELEGRAM: pembantu peribadi & kerjaya Darwish.
 *
 * Darwish chat dengan bot → /api/telegram → agent ini (gelung yang SAMA dengan agent web).
 * PENGHALA (router): hanya kumpulan tools yang berkaitan dengan mesej dihantar kepada LLM.
 * Ini menjimatkan token (had percuma Groq) dan mengurangkan peluang model memilih tool yang salah.
 *
 * Prinsip penting:
 *  - Masa dikira oleh KOD: LLM beri "selepas_minit" atau "YYYY-MM-DD HH:mm", bukan mengira sendiri.
 *  - Arahan BERTARIKH (esok sahaja) disimpan berasingan daripada keutamaan KEKAL.
 *  - Tindakan berisiko (hantar emel) hanya melalui butang kelulusan, tidak pernah terus dari LLM.
 */
import { z } from "zod";
import { buatTool, type SebarangTool } from "./rangka";
import { jalankanGelung, type KlienLLM, type MesejSejarah } from "./loop";
import { dariMasaMY, paparMY, tarikhMY, tambahHari, selepasMinit, jamMinitMY, NAMA_HARI, hariMingguMY, paparPendekMY } from "@/lib/masa";
import {
  bacaKeutamaan,
  simpanKeutamaan,
  tambahArahan,
  bacaArahan,
  padamArahan,
  kemasPeringatan,
  cariPeringatanAktif,
  tambahTugasan,
  kemasTugasan,
  padamTugasan,
  cariTugasanBelum,
  cariArahanAkanDatang,
  bacaLeads,
  tambahPengetahuan,
  bacaPengetahuan,
  padamPengetahuan,
  type Ulangan,
} from "@/lib/data";
import { ciptaPeringatan, senaraiAktif, barisPeringatan, tundaPeringatan, terangkanUlangan } from "@/lib/peringatan";
import { tugasanBelum, barisTugasan, butangTugasan } from "@/lib/tugasan";
import { binaLaporan } from "@/lib/laporan";
import { binaBriefing } from "@/lib/briefing";
import { jadualkan, qstashDisetup } from "@/lib/qstash";
import { kalendarDisetup, senaraiAcara, ciptaAcara } from "@/lib/kalendar";
import { segerakGitHub, sembunyikanRepo } from "@/lib/github";
import { kosongkanCachePengetahuan } from "@/lib/rag/knowledge";
import { jsearchDisetup } from "@/lib/kerjaya/jsearch";
import { mulaCarian } from "@/lib/kerjaya/pemburu";
import { sediakanPermohonan } from "@/lib/kerjaya/permohonan";
import { bacaIndeks, cariRekod, kemasStatusKerja, bacaRekod, simpanRekod, LABEL_STATUS, type StatusKerja } from "@/lib/kerjaya/rekod";
import type { Papan } from "@/lib/telegram";
import { cariPadanan } from "@/lib/teks";

// ─────────────────────────────────────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────────────────────────────────────
/** Bahagian TETAP prompt (tidak berubah → boleh dicache oleh Groq, jimat had token percuma). */
const PROMPT_PERIBADI = `Anda pembantu peribadi Darwish di Telegram. Anggap diri anda rakan kerja yang bijak dan prihatin, bukan robot yang menunggu arahan tepat. Darwish berbual dengan anda macam berbual dengan kawan: ayatnya santai, pendek, kadang-kadang tak lengkap. Tugas anda ialah FAHAM MAKSUDNYA.

TENTANG DARWISH
Pelajar tahun akhir Ijazah Sains Komputer (Kejuruteraan Perisian) di UMT, tamat Februari 2027. Sedang menjalani latihan industri di TCS Quality and Productivity (Ogos 2026 - Januari 2027). Sedang mencari kerja FRESH GRAD / entry-level (bukan internship) bermula Februari 2027.

CARA BERFIKIR SEBELUM MEMBALAS
1. Fahami apa yang Darwish mahu. Gunakan sejarah perbualan ("yang tu", "dua-dua", "tak jadi") dan KEADAAN SEMASA di bawah untuk tahu item mana yang dimaksudkan.
2. Jika maksudnya jelas → terus buat dengan tools, kemudian sahkan ringkas apa yang SEBENARNYA berlaku.
3. Jika kabur DAN salah teka boleh menyusahkan (padam sesuatu, ubah tetapan kekal, masa tidak jelas, lebih daripada satu item sepadan) → tanya SATU soalan ringkas dengan pilihan konkrit. Contoh: "Nak batal yang mana: **minum air 3:00 ptg** atau **minum air 9:00 mlm**?"
4. Jika perkara kecil yang jelas jawapannya, jangan tanya, buat sahaja.
5. Jika tool gagal atau tiada padanan, jangan terus menyerah: semak KEADAAN SEMASA, cuba kata kunci lain sekali, kemudian terangkan dengan bahasa mudah dan tanya.
6. Bila berguna, cadangkan satu langkah seterusnya dalam satu ayat (contoh selepas carian kerja: "Nak saya sediakan resume untuk yang paling tinggi skor?").

LARANGAN
- JANGAN sekali-kali minta Darwish beri ID, dan jangan tunjuk ID kepada Darwish. Rujuk item dengan nama dan masanya. Tools menerima kata kunci biasa (contoh rujukan "linkedin", "air", "slide").
- Jangan kata sesuatu sudah dibuat jika tool tidak dipanggil atau memulangkan ralat.
- Anda TIDAK boleh menghantar emel. Permohonan hanya dihantar bila Darwish tekan butang "Hantar".
- Jangan reka maklumat. Jika ciri belum disetup, beritahu dengan jujur.

PERATURAN MASA
- "X minit/jam lagi" → medan selepas_minit (5 minit = 5, 2 jam = 120). JANGAN kira masa sendiri.
- Masa tertentu → medan masa "YYYY-MM-DD HH:mm" (24 jam). "7 malam" = 19:00, "6.09 petang" = 18:09.
- "Setiap hari", "setiap Isnin & Khamis" → medan ulang.
- Masa tanpa tarikh yang sudah lepas hari ini (contoh "pukul 8 pagi" ketika sekarang 10 pagi) → anggap esok dan sebut dalam pengesahan.

PERINGATAN vs TUGASAN
Peringatan = diingatkan pada masa tertentu. Tugasan = perlu disiapkan (mungkin ada deadline).

ARAHAN BERTARIKH vs KEUTAMAAN KEKAL
- Sebut hari tertentu (hari ini, esok, lusa, Isnin) → catat_arahan untuk tarikh itu SAHAJA.
- Jawapan susulan tentang hari yang sama ("indeed je") → catat_arahan untuk tarikh yang SAMA.
- kemas_kini_keutamaan HANYA bila jelas kekal ("mulai sekarang", "seterusnya", "selalu"). Jika kabur, tanya: "Untuk esok sahaja atau seterusnya?"
- "Batal / buang arahan LinkedIn tu" → padam_arahan dengan rujukan "linkedin".

GAYA BALASAN
Bahasa Melayu santai dan mesra (English jika Darwish guna English). Ringkas: biasanya 1-4 ayat, maksimum 100 patah perkataan. Guna **tebal** untuk masa dan perkara penting. Senarai pendek boleh, jadual jangan.`;

/** Bahagian BERUBAH: masa sekarang + keadaan semasa supaya agent tahu apa yang wujud tanpa perlu bertanya. */
async function binaKonteks(kini: Date): Promise<string> {
  const hariIni = tarikhMY(kini);
  const esok = tambahHari(hariIni, 1);
  const labelTarikh = (t: string) => (t === hariIni ? "hari ini" : t === esok ? "esok" : t);
  const [k, arahan, peringatan, tugasan, indeks] = await Promise.all([
    bacaKeutamaan(),
    bacaArahan().then((a) => a.filter((x) => x.tarikh >= hariIni).sort((x, y) => x.tarikh.localeCompare(y.tarikh))),
    senaraiAktif(),
    tugasanBelum(),
    bacaIndeks().catch(() => []),
  ]);
  const menunggu = indeks.filter((i) => i.status === "draf" || i.status === "perlu_manual").length;
  const baru = indeks.filter((i) => i.status === "baru").length;
  const baris = [
    `SEKARANG (waktu Malaysia): ${paparMY(kini)} (jam ${jamMinitMY(kini)}, ${NAMA_HARI[hariMingguMY(kini)]})`,
    `Hari ini: ${hariIni}. Esok: ${esok}. Lusa: ${tambahHari(hariIni, 2)}.`,
    "",
    "KEADAAN SEMASA (data sebenar; guna untuk faham rujukan Darwish):",
    `- Keutamaan kekal: jawatan [${k.jawatan.join(", ")}]; lokasi ${k.lokasi}; sumber [${k.sumber.join(", ")}]; briefing ${k.jamBriefing}, carian kerja ${k.jamCarianKerja}, laporan ${k.jamLaporan}`,
    `- Arahan bertarikh akan datang: ${arahan.length ? "" : "tiada"}`,
    ...arahan.slice(0, 8).map((a) => `  • ${labelTarikh(a.tarikh)}: ${a.arahan}`),
    `- Peringatan aktif (${peringatan.length}): ${peringatan.length ? "" : "tiada"}`,
    ...peringatan.slice(0, 10).map((p) => `  • ${barisPeringatan(p)}`),
    `- Tugasan belum siap (${tugasan.length}): ${tugasan.length ? "" : "tiada"}`,
    ...tugasan.slice(0, 8).map((t) => `  • ${barisTugasan(t, kini)}`),
    `- Kerjaya: ${baru} kerja baru belum disemak, ${menunggu} permohonan menunggu tindakan Darwish.`,
  ];
  return baris.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tools: peringatan & tugasan (TERAS, sentiasa dihantar)
// ─────────────────────────────────────────────────────────────────────────────
const skemaUlang = z
  .object({
    jenis: z.enum(["harian", "mingguan"]),
    hari: z.array(z.number().int().min(1).max(7)).optional().describe("Untuk mingguan: 1=Isnin ... 7=Ahad"),
    jam: z.string().regex(/^\d{1,2}:\d{2}$/).describe("HH:mm"),
  })
  .optional();

function kiraMasa(selepas_minit?: number, masa?: string): Date | { ralat: string } {
  if (selepas_minit != null) return selepasMinit(selepas_minit);
  if (masa) return dariMasaMY(masa) ?? { ralat: 'Format masa salah. Guna "YYYY-MM-DD HH:mm".' };
  return { ralat: "Beri selepas_minit atau masa." };
}

function senaraiPilihan<T extends { id: string }>(calon: T[], papar: (x: T) => string) {
  return {
    ralat: "Lebih daripada satu padanan. Tanya Darwish yang mana (sebut nama & masa, bukan ID), kemudian panggil semula dengan kata kunci yang lebih khusus.",
    pilihan: calon.slice(0, 6).map(papar),
  };
}

const TERAS: SebarangTool[] = [
  buatTool({
    nama: "tetapkan_peringatan",
    penerangan: "Tetapkan peringatan ke Telegram Darwish. Guna selepas_minit untuk masa relatif ('5 minit lagi'), masa untuk masa tertentu, dan ulang untuk peringatan berulang.",
    skema: z.object({
      teks: z.string().min(1).max(300).describe("Isi peringatan, contoh 'Minum air'"),
      selepas_minit: z.number().int().min(1).max(60 * 24 * 60).optional(),
      masa: z.string().optional().describe('Waktu Malaysia "YYYY-MM-DD HH:mm"'),
      ulang: skemaUlang,
    }),
    async jalankan({ teks, selepas_minit, masa, ulang }) {
      let d: Date | { ralat: string };
      if (ulang && selepas_minit == null && !masa) {
        const { masaSeterusnya } = await import("@/lib/peringatan");
        d = masaSeterusnya(ulang as Ulangan, new Date()) ?? { ralat: "Tidak dapat kira kejadian pertama." };
      } else d = kiraMasa(selepas_minit, masa);
      if ("ralat" in d) return { untukLLM: d };
      if (d.getTime() < Date.now() - 60_000) return { untukLLM: { ralat: "Masa itu sudah lepas. Tanya masa lain." } };
      const p = await ciptaPeringatan(d, teks, ulang as Ulangan | undefined);
      return {
        untukLLM: {
          status: "ditetapkan",
          id: p.id,
          masa: paparMY(d),
          ulang: ulang ? terangkanUlangan(ulang as Ulangan) : undefined,
          penghantaran: qstashDisetup() ? "tepat pada minit" : "dalam masa 15 minit (sandaran cron)",
        },
      };
    },
  }),
  buatTool({
    nama: "senarai_peringatan",
    penerangan: "Senaraikan peringatan aktif (butang Batal dilampirkan secara automatik).",
    skema: z.object({}),
    async jalankan() {
      const akan = await senaraiAktif();
      const papan: Papan = akan.slice(0, 8).map((p) => [{ teks: `🗑 Batal: ${p.teks}`.slice(0, 40), data: `p:batal:${p.id}` }]);
      return { untukLLM: { peringatan: akan.map(barisPeringatan), nota: "Butang Batal sudah dilampirkan di bawah mesej." }, papan };
    },
  }),
  buatTool({
    nama: "batal_peringatan",
    penerangan: "Batalkan peringatan. rujukan = id ATAU kata kunci isi peringatan (contoh 'air').",
    skema: z.object({ rujukan: z.string().min(1).max(100) }),
    async jalankan({ rujukan }) {
      const calon = await cariPeringatanAktif(rujukan);
      if (!calon.length) return { untukLLM: { ralat: "Tiada peringatan aktif yang sepadan." } };
      if (calon.length > 1 && !calon.every((c) => c.teks === calon[0].teks)) return { untukLLM: senaraiPilihan(calon, barisPeringatan) };
      for (const c of calon) await kemasPeringatan(c.id, { status: "dibatal" });
      return { untukLLM: { status: "dibatalkan", item: calon.map(barisPeringatan) } };
    },
  }),
  buatTool({
    nama: "ubah_peringatan",
    penerangan: "Tukar masa peringatan sedia ada. rujukan = id atau kata kunci.",
    skema: z.object({
      rujukan: z.string().min(1).max(100),
      selepas_minit: z.number().int().min(1).optional(),
      masa: z.string().optional(),
    }),
    async jalankan({ rujukan, selepas_minit, masa }) {
      const calon = await cariPeringatanAktif(rujukan);
      if (!calon.length) return { untukLLM: { ralat: "Tiada peringatan aktif yang sepadan." } };
      if (calon.length > 1) return { untukLLM: senaraiPilihan(calon, barisPeringatan) };
      const d = kiraMasa(selepas_minit, masa);
      if ("ralat" in d) return { untukLLM: d };
      const minit = Math.max(1, Math.round((d.getTime() - Date.now()) / 60_000));
      const p = await tundaPeringatan(calon[0].id, minit);
      return { untukLLM: { status: "diubah", item: p ? barisPeringatan(p) : null } };
    },
  }),
  buatTool({
    nama: "tambah_tugasan",
    penerangan: "Tambah tugasan yang perlu disiapkan (boleh ada deadline). Agent akan beri amaran 24 jam sebelum deadline.",
    skema: z.object({
      tajuk: z.string().min(1).max(200),
      deadline: z.string().optional().describe('"YYYY-MM-DD HH:mm" waktu Malaysia (jika hanya tarikh, guna 17:00)'),
      keutamaan: z.enum(["tinggi", "biasa"]).optional(),
    }),
    async jalankan({ tajuk, deadline, keutamaan }) {
      let iso: string | undefined;
      if (deadline) {
        const d = dariMasaMY(deadline.length === 10 ? `${deadline} 17:00` : deadline);
        if (!d) return { untukLLM: { ralat: 'Format deadline salah. Guna "YYYY-MM-DD HH:mm".' } };
        iso = d.toISOString();
      }
      const t = await tambahTugasan({ tajuk, deadline: iso, keutamaan: keutamaan ?? "biasa" });
      return { untukLLM: { status: "ditambah", item: barisTugasan(t) } };
    },
  }),
  buatTool({
    nama: "senarai_tugasan",
    penerangan: "Senaraikan tugasan belum siap (lewat & deadline terdekat dahulu). Butang 'Tanda siap' dilampirkan.",
    skema: z.object({}),
    async jalankan() {
      const belum = await tugasanBelum();
      const papan: Papan = belum.slice(0, 8).flatMap((t) => butangTugasan(t.id).map((b) => b.map((x) => ({ ...x, teks: `✅ ${t.tajuk}`.slice(0, 40) }))));
      return { untukLLM: { tugasan: belum.map((t) => barisTugasan(t)), nota: "Butang Tanda siap sudah dilampirkan." }, papan };
    },
  }),
  buatTool({
    nama: "kemas_kini_tugasan",
    penerangan: "Tanda tugasan siap, ubah deadline atau padam. rujukan = id atau kata kunci tajuk.",
    skema: z.object({
      rujukan: z.string().min(1).max(100),
      tindakan: z.enum(["siap", "ubah_deadline", "padam"]),
      deadline: z.string().optional().describe('"YYYY-MM-DD HH:mm"'),
    }),
    async jalankan({ rujukan, tindakan, deadline }) {
      const calon = await cariTugasanBelum(rujukan);
      if (!calon.length) return { untukLLM: { ralat: "Tiada tugasan belum siap yang sepadan." } };
      if (calon.length > 1) return { untukLLM: senaraiPilihan(calon, (t) => barisTugasan(t)) };
      const t = calon[0];
      if (tindakan === "siap") await kemasTugasan(t.id, { status: "siap", siapPada: new Date().toISOString() });
      else if (tindakan === "padam") await padamTugasan(t.id);
      else {
        const d = deadline ? dariMasaMY(deadline.length === 10 ? `${deadline} 17:00` : deadline) : null;
        if (!d) return { untukLLM: { ralat: "Deadline baru diperlukan." } };
        await kemasTugasan(t.id, { deadline: d.toISOString(), amaran: {} });
      }
      return { untukLLM: { status: tindakan, tugasan: t.tajuk } };
    },
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Tools: keutamaan & arahan bertarikh
// ─────────────────────────────────────────────────────────────────────────────
const KEUTAMAAN: SebarangTool[] = [
  buatTool({
    nama: "lihat_keutamaan",
    penerangan: "Lihat keutamaan kekal (jawatan, lokasi, sumber, jam briefing/carian/laporan) dan arahan bertarikh yang akan datang.",
    skema: z.object({}),
    async jalankan() {
      const arahan = (await bacaArahan()).filter((a) => a.tarikh >= tarikhMY());
      return { untukLLM: { keutamaan: await bacaKeutamaan(), arahanAkanDatang: arahan } };
    },
  }),
  buatTool({
    nama: "kemas_kini_keutamaan",
    penerangan: "Ubah keutamaan KEKAL. Hanya bila Darwish jelas mahu perubahan kekal. Hanya medan yang diberi diubah.",
    skema: z.object({
      jawatan: z.array(z.string().max(80)).max(6).optional(),
      lokasi: z.string().max(100).optional(),
      sumber: z.array(z.string().max(30)).max(8).optional().describe("Contoh ['LinkedIn','Indeed','Glassdoor']"),
      tambah_catatan: z.string().max(200).optional(),
      jam_briefing: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
      jam_carian_kerja: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
      jam_laporan: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
    }),
    async jalankan(u) {
      const k = await bacaKeutamaan();
      const baru = {
        ...k,
        ...(u.jawatan ? { jawatan: u.jawatan } : {}),
        ...(u.lokasi ? { lokasi: u.lokasi } : {}),
        ...(u.sumber ? { sumber: u.sumber } : {}),
        ...(u.jam_briefing ? { jamBriefing: u.jam_briefing.padStart(5, "0") } : {}),
        ...(u.jam_carian_kerja ? { jamCarianKerja: u.jam_carian_kerja.padStart(5, "0") } : {}),
        ...(u.jam_laporan ? { jamLaporan: u.jam_laporan.padStart(5, "0") } : {}),
        catatan: u.tambah_catatan ? [...k.catatan, u.tambah_catatan].slice(-20) : k.catatan,
      };
      await simpanKeutamaan(baru);
      return { untukLLM: { status: "dikemas kini (kekal)", keutamaan: baru } };
    },
  }),
  buatTool({
    nama: "catat_arahan",
    penerangan:
      "Arahan untuk SATU tarikh sahaja. jenis: langkau_sumber (jangan cari di sumber tertentu), hanya_sumber (cari di sumber tertentu sahaja), langkau_carian (tiada carian kerja hari itu), nota (lain-lain).",
    skema: z.object({
      tarikh: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD"),
      jenis: z.enum(["langkau_sumber", "hanya_sumber", "langkau_carian", "nota"]),
      sumber: z.array(z.string().max(30)).max(8).optional(),
      arahan: z.string().min(1).max(200).describe("Penerangan ringkas dalam ayat"),
    }),
    async jalankan({ tarikh, jenis, sumber, arahan }) {
      if (tarikh < tarikhMY()) return { untukLLM: { ralat: "Tarikh itu sudah lepas." } };
      // Arahan sumber baru untuk tarikh yang sama menggantikan arahan sumber lama (elak bercanggah)
      if (jenis === "hanya_sumber" || jenis === "langkau_sumber") {
        for (const a of await bacaArahan()) if (a.tarikh === tarikh && (a.jenis === "hanya_sumber" || a.jenis === "langkau_sumber")) await padamArahan(a.id);
      }
      const a = await tambahArahan({ tarikh, jenis, sumber, arahan });
      return { untukLLM: { status: "dicatat untuk tarikh itu sahaja", arahan: a.arahan, tarikh, jenis, sumber } };
    },
  }),
  buatTool({
    nama: "padam_arahan",
    penerangan:
      "Padam/batal arahan bertarikh. rujukan = kata kunci (contoh 'linkedin', 'cuti'), tarikh 'YYYY-MM-DD', atau 'semua'. Jika ada beberapa padanan berbeza, tool memulangkan pilihan untuk ditanya kepada Darwish.",
    skema: z.object({ rujukan: z.string().min(1).max(100) }),
    async jalankan({ rujukan }) {
      const calon = await cariArahanAkanDatang(rujukan, tarikhMY());
      if (!calon.length) return { untukLLM: { ralat: "Tiada arahan akan datang yang sepadan.", arahanSedia: (await bacaArahan()).filter((a) => a.tarikh >= tarikhMY()).map((a) => `${a.tarikh}: ${a.arahan}`) } };
      const huraian = (a: (typeof calon)[number]) => `${a.tarikh}: ${a.arahan}`;
      if (calon.length > 1 && !/^(semua|all)$/i.test(rujukan.trim()) && new Set(calon.map((a) => a.tarikh)).size > 1) return { untukLLM: senaraiPilihan(calon, huraian) };
      for (const a of calon) await padamArahan(a.id);
      return { untukLLM: { status: "dipadam", item: calon.map(huraian) } };
    },
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Tools: kerja & permohonan
// ─────────────────────────────────────────────────────────────────────────────
async function rekodTunggal(rujukan: string) {
  const calon = await cariRekod(rujukan);
  if (!calon.length) return { ralat: "Tiada kerja yang sepadan dalam rekod." } as const;
  if (calon.length > 1 && calon[0].id !== rujukan) {
    return { ralat: "Lebih daripada satu padanan.", pilihan: calon.slice(0, 5).map((c) => ({ id: c.id, item: `${c.tajuk} - ${c.syarikat}` })) } as const;
  }
  return { id: calon[0].id } as const;
}

const KERJA: SebarangTool[] = [
  buatTool({
    nama: "cari_kerja_sekarang",
    penerangan: "Jalankan carian kerja sekarang (ikut keutamaan & arahan hari ini). Hasil dihantar ke Telegram dalam 1-2 minit.",
    skema: z.object({}),
    async jalankan() {
      if (!jsearchDisetup()) return { untukLLM: { status: "belum disetup", nota: "JSEARCH_API_KEY belum ditetapkan di Netlify." } };
      if (qstashDisetup()) {
        await jadualkan("cari-kerja", { paksa: true });
        return { untukLLM: { status: "dimulakan", nota: "Keputusan akan dihantar dalam 1-2 minit." } };
      }
      return { untukLLM: { status: await mulaCarian() } };
    },
  }),
  buatTool({
    nama: "senarai_kerja",
    penerangan: "Senaraikan kerja dalam rekod (penjejak permohonan), boleh tapis ikut status.",
    skema: z.object({
      status: z.enum(["baru", "disimpan", "draf", "dihantar", "perlu_manual", "dimohon_manual", "interview", "ditolak", "tawaran", "semua"]).optional(),
    }),
    async jalankan({ status }) {
      let indeks = (await bacaIndeks()).reverse();
      if (status && status !== "semua") indeks = indeks.filter((i) => i.status === status);
      else indeks = indeks.filter((i) => i.status !== "diabaikan");
      return {
        untukLLM: {
          kerja: indeks.slice(0, 12).map((i) => ({ id: i.id, item: `${i.tajuk} - ${i.syarikat}`, skor: i.skor, status: LABEL_STATUS[i.status] })),
        },
      };
    },
  }),
  buatTool({
    nama: "sediakan_permohonan",
    penerangan: "Jana resume khas + cover letter untuk satu kerja dan hantar ke Telegram untuk semakan (TIDAK menghantar emel).",
    skema: z.object({ rujukan: z.string().min(1).max(120).describe("id kerja atau nama syarikat/jawatan") }),
    async jalankan({ rujukan }) {
      const r = await rekodTunggal(rujukan);
      if ("ralat" in r) return { untukLLM: r };
      if (qstashDisetup()) {
        await jadualkan("sediakan-permohonan", { id: r.id });
        return { untukLLM: { status: "sedang disediakan", nota: "PDF akan dihantar dalam ~1 minit." } };
      }
      return { untukLLM: { status: await sediakanPermohonan(r.id) } };
    },
  }),
  buatTool({
    nama: "kemas_kini_permohonan",
    penerangan: "Kemas kini status permohonan (contoh dapat interview, ditolak, tawaran, dah mohon manual).",
    skema: z.object({
      rujukan: z.string().min(1).max(120),
      status: z.enum(["disimpan", "dimohon_manual", "interview", "ditolak", "tawaran", "diabaikan"]),
    }),
    async jalankan({ rujukan, status }) {
      const r = await rekodTunggal(rujukan);
      if ("ralat" in r) return { untukLLM: r };
      const rekod = await kemasStatusKerja(r.id, status as StatusKerja);
      return { untukLLM: { status: "dikemas kini", kerja: `${rekod?.tajuk} - ${rekod?.syarikat}`, statusBaru: LABEL_STATUS[status as StatusKerja] } };
    },
  }),
  buatTool({
    nama: "tetapkan_emel_hr",
    penerangan: "Tetapkan emel HR untuk satu kerja (bila iklan tiada emel). Selepas itu permohonan boleh dihantar melalui butang.",
    skema: z.object({ rujukan: z.string().min(1).max(120), emel: z.string().email() }),
    async jalankan({ rujukan, emel }) {
      const r = await rekodTunggal(rujukan);
      if ("ralat" in r) return { untukLLM: r };
      const rekod = await bacaRekod(r.id);
      if (!rekod) return { untukLLM: { ralat: "Rekod tidak dijumpai." } };
      rekod.emelHR = emel;
      await simpanRekod(rekod);
      const papan: Papan = rekod.draf ? [[{ teks: `📧 Hantar ke ${emel}`.slice(0, 60), data: `m:hantar:${rekod.id}` }]] : [[{ teks: "📝 Sediakan permohonan", data: `k:mohon:${rekod.id}` }]];
      return { untukLLM: { status: "emel HR ditetapkan", nota: "Butang dilampirkan untuk langkah seterusnya." }, papan };
    },
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Tools: jadual (Google Calendar)
// ─────────────────────────────────────────────────────────────────────────────
const JADUAL: SebarangTool[] = [
  buatTool({
    nama: "lihat_jadual",
    penerangan: "Lihat acara dalam Google Calendar Darwish (interview, meeting) untuk beberapa hari akan datang.",
    skema: z.object({ hari: z.number().int().min(1).max(30).optional() }),
    async jalankan({ hari = 7 }) {
      if (!kalendarDisetup()) return { untukLLM: { status: "Google Calendar belum disetup" } };
      const acara = await senaraiAcara(new Date(), new Date(Date.now() + hari * 86400_000));
      return { untukLLM: { acara: acara.map((a) => `${paparPendekMY(new Date(a.mula))}: ${a.tajuk}`) } };
    },
  }),
  buatTool({
    nama: "tambah_jadual",
    penerangan: "Tambah acara (contoh interview) ke Google Calendar Darwish, dengan peringatan sehari & sejam sebelum.",
    skema: z.object({
      tajuk: z.string().min(1).max(150),
      masa: z.string().describe('"YYYY-MM-DD HH:mm" waktu Malaysia'),
      minit: z.number().int().min(15).max(480).optional(),
    }),
    async jalankan({ tajuk, masa, minit = 60 }) {
      const mula = dariMasaMY(masa);
      if (!mula) return { untukLLM: { ralat: 'Format masa salah. Guna "YYYY-MM-DD HH:mm".' } };
      let dalamKalendar = false;
      if (kalendarDisetup()) {
        await ciptaAcara({ tajuk, mula, minit, penerangan: "Ditambah melalui agent Telegram Tanya Darwish" });
        dalamKalendar = true;
      }
      for (const [sebelum, label] of [[24 * 60, "esok"], [60, "dalam 1 jam"]] as const) {
        const m = new Date(mula.getTime() - sebelum * 60_000);
        if (m.getTime() > Date.now()) await ciptaPeringatan(m, `${tajuk} ${label} (${paparPendekMY(mula)})`);
      }
      return { untukLLM: { status: "ditambah", masa: paparMY(mula), dalamGoogleCalendar: dalamKalendar, peringatan: "sehari & sejam sebelum" } };
    },
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Tools: pengetahuan & portfolio
// ─────────────────────────────────────────────────────────────────────────────
const PENGETAHUAN: SebarangTool[] = [
  buatTool({
    nama: "tambah_pengetahuan",
    penerangan:
      "Tambah maklumat baru tentang Darwish ke pangkalan pengetahuan portfolio (contoh sijil baru, projek, pencapaian). Agent web akan terus boleh menjawab tentangnya.",
    skema: z.object({ tajuk: z.string().min(2).max(120), teks: z.string().min(2).max(1500) }),
    async jalankan({ tajuk, teks }) {
      const p = await tambahPengetahuan({ tajuk, teks, sumber: "telegram" });
      kosongkanCachePengetahuan();
      return { untukLLM: { status: "ditambah ke portfolio", tajuk: p.tajuk } };
    },
  }),
  buatTool({
    nama: "senarai_pengetahuan",
    penerangan: "Senaraikan pengetahuan tambahan yang pernah ditambah (melalui Telegram atau import CV).",
    skema: z.object({}),
    async jalankan() {
      return { untukLLM: { pengetahuan: (await bacaPengetahuan()).slice(-20).map((p) => `${p.tajuk} (dari ${p.sumber})`) } };
    },
  }),
  buatTool({
    nama: "padam_pengetahuan",
    penerangan: "Padam pengetahuan tambahan. rujukan = kata kunci tajuk (contoh 'oracle').",
    skema: z.object({ rujukan: z.string().min(1).max(100) }),
    async jalankan({ rujukan }) {
      const calon = cariPadanan(await bacaPengetahuan(), rujukan, (p) => `${p.tajuk} ${p.teks}`);
      if (!calon.length) return { untukLLM: { ralat: "Tiada pengetahuan yang sepadan." } };
      if (calon.length > 1) return { untukLLM: senaraiPilihan(calon, (p) => p.tajuk) };
      await padamPengetahuan(calon[0].id);
      kosongkanCachePengetahuan();
      return { untukLLM: { status: "dipadam", tajuk: calon[0].tajuk } };
    },
  }),
  buatTool({
    nama: "segerak_github",
    penerangan: "Segerakkan repo GitHub awam Darwish ke portfolio sekarang.",
    skema: z.object({}),
    async jalankan() {
      const h = await segerakGitHub();
      kosongkanCachePengetahuan();
      return { untukLLM: h.ralat ? { ralat: h.ralat } : { status: "disegerakkan", bilanganRepo: h.bilangan } };
    },
  }),
  buatTool({
    nama: "sembunyikan_repo",
    penerangan: "Sembunyikan (atau papar semula) repo GitHub tertentu dari portfolio.",
    skema: z.object({ nama_repo: z.string().min(1).max(100), sembunyi: z.boolean() }),
    async jalankan({ nama_repo, sembunyi }) {
      const ok = await sembunyikanRepo(nama_repo, sembunyi);
      kosongkanCachePengetahuan();
      return { untukLLM: { status: ok ? (sembunyi ? "disembunyikan" : "dipaparkan") : "repo tidak dijumpai" } };
    },
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Tools: ringkasan
// ─────────────────────────────────────────────────────────────────────────────
const RINGKASAN: SebarangTool[] = [
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
    penerangan: "Laporan aktiviti hari ini: soalan pelawat web, soalan gagal, leads, tugasan, kerja, jadual esok.",
    skema: z.object({}),
    async jalankan() {
      return { untukLLM: { laporan: await binaLaporan() } };
    },
  }),
  buatTool({
    nama: "briefing_sekarang",
    penerangan: "Briefing untuk hari ini: peringatan, tugasan, jadual, kerja terbaik & follow-up.",
    skema: z.object({}),
    async jalankan() {
      return { untukLLM: { briefing: await binaBriefing() } };
    },
  }),
];

// ─────────────────────────────────────────────────────────────────────────────
// Penghala (router)
// ─────────────────────────────────────────────────────────────────────────────
const KUMPULAN: { nama: string; tools: SebarangTool[]; kataKunci: RegExp }[] = [
  { nama: "keutamaan", tools: KEUTAMAAN, kataKunci: /keutamaan|lokasi|sumber|linkedin|indeed|glassdoor|jobstreet|setting|tetapan|tak perlu cari|jangan cari|arahan|kekal|seterusnya|sahaja|hanya|briefing pukul|jam briefing|jam laporan/i },
  { nama: "kerja", tools: KERJA, kataKunci: /kerja|job|jawatan|iklan|mohon|permohonan|resume|\bcv\b|cover|apply|\bhr\b|tawaran|ditolak|offer|syarikat|interview|temuduga/i },
  { nama: "jadual", tools: JADUAL, kataKunci: /jadual|kalendar|calendar|meeting|mesyuarat|interview|temuduga|temu duga|appointment|acara|event/i },
  { nama: "pengetahuan", tools: PENGETAHUAN, kataKunci: /pengetahuan|github|repo|portfolio|tambah (info|maklumat)|profil|sijil baru|projek baru|pencapaian|sembunyi|segerak/i },
  { nama: "ringkasan", tools: RINGKASAN, kataKunci: /lead|ringkasan|briefing|laporan|summary|status|apa (yang )?(perlu|patut)|hari ini/i },
];

/** Semua kumpulan tools (dahulu ada penghala kata kunci; kini SEMUA tools sentiasa dihantar supaya
 *  agent tidak "tak faham" bila Darwish guna perkataan yang tidak dijangka. Definisi tools kekal
 *  sama setiap permintaan, jadi ia dicache oleh Groq). */
export const SEMUA_TOOLS_PERIBADI: SebarangTool[] = [...TERAS, ...KUMPULAN.flatMap((k) => k.tools)];

/** Jalankan agent peribadi untuk satu mesej Darwish. */
export async function jalankanAgenPeribadi(
  sejarah: MesejSejarah[],
  llm?: KlienLLM,
  kini: Date = new Date(),
): Promise<{ teks: string; papan: Papan; tools: string[] }> {
  const hasil = await jalankanGelung({
    systemPrompt: PROMPT_PERIBADI,
    konteks: await binaKonteks(kini),
    tools: SEMUA_TOOLS_PERIBADI,
    // 12 mesej terakhir cukup untuk konteks; lebih panjang membazir had token Groq percuma
    sejarah: sejarah.slice(-12),
    llm,
    usahaFikir: "medium", // fikir lebih sedikit: faham maksud, putuskan bila perlu bertanya
    maksPusingan: 6,
  });
  const namaTools = hasil.langkah.map((l) => l.tool);
  if (hasil.hadDicapai) return { teks: "Maaf, saya tersangkut dengan arahan tu. Boleh terangkan sekali lagi dengan cara lain?", papan: hasil.papan, tools: namaTools };
  return { teks: hasil.teks.trim() || "Maaf, saya tak dapat menyiapkan jawapan. Cuba sekali lagi?", papan: hasil.papan, tools: namaTools };
}
