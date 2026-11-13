/**
 * TOOLS: apa yang agent BOLEH lakukan.
 *
 * Setiap tool ada dua bahagian:
 *   - definisi: nama, penerangan dan skema input (dihantar kepada LLM supaya ia tahu tool ini wujud)
 *   - jalankan: kod sebenar yang dilaksanakan oleh program kita (LLM tidak boleh menjalankannya sendiri)
 *
 * Untuk menambah tool baru: tambah satu objek dalam senarai TOOLS di bawah.
 */
import { z } from "zod";
import { cariPengetahuan } from "@/lib/rag/knowledge";
import { senaraiProjek, keKad } from "@/lib/projects";
import { buatTool, keDefinisi, jalankanToolDari, type SebarangTool, type HasilTool } from "./rangka";
import { simpanLead } from "@/lib/data";
import { hantarTelegram, telegramDisetup } from "@/lib/telegram";

export type { HasilTool };

// ---------------------------------------------------------------------------
// 1. cari_pengetahuan: RAG
// ---------------------------------------------------------------------------
const cariPengetahuanTool = buatTool({
  nama: "cari_pengetahuan",
  penerangan:
    "Cari maklumat tentang Darwish (profil, pendidikan, pengalaman, kemahiran, projek, sijil, soalan lazim). Wajib digunakan sebelum menjawab apa-apa fakta tentang Darwish.",
  skema: z.object({
    soalan: z.string().min(2).max(200).describe("Kata kunci atau soalan untuk dicari, contoh 'sijil' atau 'pengalaman AI'"),
  }),
  async jalankan({ soalan }) {
    const ketul = cariPengetahuan(soalan);
    if (ketul.length === 0) {
      return { untukLLM: { hasil: [], nota: "Tiada maklumat dijumpai. Jangan meneka." }, tiadaHasil: true };
    }
    return {
      untukLLM: { hasil: ketul.map((k) => ({ sumber: k.sumber, tajuk: k.tajuk, teks: k.teks })) },
    };
  },
});

// ---------------------------------------------------------------------------
// 2. papar_projek: pulangkan data kad projek untuk UI
// ---------------------------------------------------------------------------
const paparProjekTool = buatTool({
  nama: "papar_projek",
  penerangan:
    "Paparkan kad projek Darwish kepada pelawat (dengan link repo/demo). Guna bila pelawat mahu melihat projek, repo GitHub atau hasil kerja. Kosongkan 'tag' untuk semua projek.",
  skema: z.object({
    tag: z.string().max(30).optional().describe("Tapis ikut tag, contoh 'ai' atau 'web'. Kosongkan untuk semua."),
  }),
  async jalankan({ tag }) {
    let projek = senaraiProjek();
    if (tag) {
      const ditapis = projek.filter((p) => p.tag.includes(tag.toLowerCase()));
      if (ditapis.length > 0) projek = ditapis;
    }
    const kad = projek.slice(0, 4).map(keKad);
    return {
      untukLLM: {
        dipaparkan: kad.map((k) => ({ nama: k.nama, ringkasan: k.ringkasan, link: k.link })),
        nota: "Kad sudah dipaparkan di skrin pelawat. Jangan senaraikan semula semua butiran, cukup ringkasan pendek.",
      },
      kad,
    };
  },
});

// ---------------------------------------------------------------------------
// 3. maklum_darwish: hantar notifikasi Telegram kepada Darwish
// ---------------------------------------------------------------------------
const maklumDarwishTool = buatTool({
  nama: "maklum_darwish",
  penerangan:
    "Hantar mesej pelawat kepada Darwish (notifikasi Telegram + disimpan sebagai lead). Guna HANYA selepas pelawat memberi nama dan mesej mereka.",
  skema: z.object({
    nama: z.string().min(1).max(80),
    syarikat: z.string().max(80).optional(),
    jawatan: z.string().max(100).optional().describe("Jawatan yang ditawarkan atau dibincangkan, jika ada"),
    hubungan: z.string().max(120).optional().describe("Emel atau LinkedIn pelawat, jika diberi"),
    jenis: z.enum(["recruiter", "kawan", "lain"]).describe("Siapa pelawat ini, berdasarkan perbualan"),
    mesej: z.string().min(1).max(500),
    ringkasan: z
      .string()
      .max(300)
      .describe("Ringkasan satu ayat: apa yang pelawat tanya atau minati sebelum ini dalam perbualan"),
  }),
  async jalankan(lead) {
    // 1. Simpan dahulu, supaya lead tidak hilang walaupun Telegram gagal
    let disimpan = false;
    try {
      await simpanLead({ ...lead, masa: new Date().toISOString() });
      disimpan = true;
    } catch (e) {
      console.error("[maklum_darwish] Gagal simpan lead:", e);
    }

    // 2. Notifikasi Telegram yang tersusun
    const label = lead.jenis === "recruiter" ? "Recruiter" : lead.jenis === "kawan" ? "Kawan" : "Pelawat";
    const teks = [
      `**Lead baru: ${label}**`,
      `Nama: ${lead.nama}`,
      lead.syarikat ? `Syarikat: ${lead.syarikat}` : "",
      lead.jawatan ? `Jawatan: ${lead.jawatan}` : "",
      lead.hubungan ? `Hubungan: ${lead.hubungan}` : "",
      `Mesej: ${lead.mesej}`,
      lead.ringkasan ? `Konteks: ${lead.ringkasan}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const dihantar = telegramDisetup() ? await hantarTelegram(teks) : false;

    // 3. Jujur dengan pelawat tentang status sebenar
    if (dihantar) return { untukLLM: { status: "dihantar" } };
    if (disimpan) {
      return {
        untukLLM: {
          status: "disimpan",
          nota: "Mesej disimpan dengan selamat dan Darwish akan melihatnya dalam laporan hariannya. Beritahu pelawat begitu (bukan 'dihantar serta-merta').",
        },
      };
    }
    return {
      untukLLM: {
        status: "gagal",
        nota: "Mesej TIDAK sampai kepada Darwish. Beritahu pelawat dengan jujur dan cadangkan mereka cuba lagi nanti atau hubungi Darwish melalui LinkedIn.",
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Senarai semua tools agent web
// ---------------------------------------------------------------------------
export const TOOLS: SebarangTool[] = [cariPengetahuanTool, paparProjekTool, maklumDarwishTool];
export const DEFINISI_TOOLS = keDefinisi(TOOLS);
export const jalankanTool = (nama: string, argumen: string) => jalankanToolDari(TOOLS, nama, argumen);
