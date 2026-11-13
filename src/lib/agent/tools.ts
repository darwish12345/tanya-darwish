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
import type { ChatCompletionTool } from "groq-sdk/resources/chat/completions";
import { cariPengetahuan } from "@/lib/rag/knowledge";
import { senaraiProjek, keKad, type KadProjek } from "@/lib/projects";

export type HasilTool = {
  untukLLM: unknown; // apa yang LLM akan baca
  kad?: KadProjek[]; // apa yang UI akan paparkan (pilihan)
};

type Tool<S extends z.ZodTypeAny> = {
  nama: string;
  penerangan: string;
  skema: S;
  jalankan: (input: z.infer<S>) => Promise<HasilTool>;
};

function buatTool<S extends z.ZodTypeAny>(t: Tool<S>) {
  return t;
}

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
      return { untukLLM: { hasil: [], nota: "Tiada maklumat dijumpai. Jangan meneka." } };
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
    "Hantar mesej pelawat kepada Darwish melalui Telegram. Guna HANYA selepas pelawat memberi nama dan mesej mereka.",
  skema: z.object({
    nama: z.string().min(1).max(80),
    syarikat: z.string().max(80).optional(),
    hubungan: z.string().max(120).optional().describe("Emel atau LinkedIn pelawat, jika diberi"),
    mesej: z.string().min(1).max(500),
  }),
  async jalankan({ nama, syarikat, hubungan, mesej }) {
    const teks = [
      "Mesej baru dari Tanya Darwish",
      `Nama: ${nama}`,
      syarikat ? `Syarikat: ${syarikat}` : "",
      hubungan ? `Hubungan: ${hubungan}` : "",
      `Mesej: ${mesej}`,
    ]
      .filter(Boolean)
      .join("\n");

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      console.log("[maklum_darwish] Telegram belum disetup. Mesej:\n" + teks);
      return { untukLLM: { status: "diterima", nota: "Mesej direkod. Darwish akan menghubungi pelawat." } };
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: teks }),
    });
    return res.ok
      ? { untukLLM: { status: "dihantar" } }
      : { untukLLM: { status: "gagal", nota: "Minta pelawat cuba lagi sebentar lagi." } };
  },
});

// ---------------------------------------------------------------------------
// Senarai semua tools
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TOOLS: Tool<any>[] = [cariPengetahuanTool, paparProjekTool, maklumDarwishTool];

/** Tukar tools kita kepada format yang difahami oleh API (JSON Schema). */
export const DEFINISI_TOOLS: ChatCompletionTool[] = TOOLS.map((t) => {
  // Buang medan "$schema" yang tidak diperlukan oleh API
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema, ...parameters } = z.toJSONSchema(t.skema) as Record<string, unknown>;
  return {
    type: "function",
    function: { name: t.nama, description: t.penerangan, parameters },
  };
});

/** Jalankan satu tool mengikut nama, dengan validasi input. */
export async function jalankanTool(nama: string, argumenJson: string): Promise<HasilTool> {
  const tool = TOOLS.find((t) => t.nama === nama);
  if (!tool) return { untukLLM: { ralat: `Tool '${nama}' tidak wujud.` } };

  let argumen: unknown;
  try {
    argumen = argumenJson ? JSON.parse(argumenJson) : {};
  } catch {
    return { untukLLM: { ralat: "Argumen bukan JSON yang sah." } };
  }

  const semak = tool.skema.safeParse(argumen);
  if (!semak.success) {
    return { untukLLM: { ralat: "Input tidak sah", butiran: semak.error.issues.map((i: z.core.$ZodIssue) => i.message) } };
  }

  try {
    return await tool.jalankan(semak.data);
  } catch (e) {
    console.error(`[tool ${nama}]`, e);
    return { untukLLM: { ralat: "Tool gagal dijalankan." } };
  }
}
