/**
 * GELUNG AGENT: jantung agentic AI.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ 1. Hantar mesej + senarai tools kepada LLM   │
 *   │ 2. LLM minta tool?                           │
 *   │      ya    → kita jalankan tool,             │
 *   │              hantar hasil semula, ulang (1)  │
 *   │      tidak → itu jawapan akhir, tamat        │
 *   └──────────────────────────────────────────────┘
 *
 * Prinsip penting: LLM hanya MEMINTA tool. Kod di bawah yang MELAKSANAKAN.
 */
import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { SYSTEM_PROMPT } from "./prompt";
import { DEFINISI_TOOLS, jalankanTool } from "./tools";
import type { KadProjek } from "@/lib/projects";

export const MAKS_PUSINGAN = 5;
export const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export type MesejSejarah = { role: "user" | "assistant"; content: string };

export type Langkah = { tool: string; input: string };

export type HasilAgent = {
  jawapan: string;
  cadangan: string[];
  kad: KadProjek[];
  langkah: Langkah[]; // tools yang digunakan, untuk dipaparkan & debug
};

/** Bahagian minimum klien LLM yang kita perlukan (supaya mudah diuji dengan mock). */
export type KlienLLM = {
  chat: { completions: { create: Groq["chat"]["completions"]["create"] } };
};

let klienLalai: Groq | null = null;
function klien(): KlienLLM {
  if (!klienLalai) klienLalai = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return klienLalai;
}

/** Asingkan <cadangan>...</cadangan> dari teks jawapan. */
export function asingkanCadangan(teks: string): { jawapan: string; cadangan: string[] } {
  const padanan = teks.match(/<cadangan>([\s\S]*?)<\/cadangan>/i);
  const jawapan = teks.replace(/<cadangan>[\s\S]*?<\/cadangan>/gi, "").trim();
  const cadangan = padanan
    ? padanan[1].split("|").map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 100).slice(0, 3)
    : [];
  return { jawapan, cadangan };
}

export async function jalankanAgent(
  sejarah: MesejSejarah[],
  llm: KlienLLM = klien(),
): Promise<HasilAgent> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...sejarah,
  ];
  const langkah: Langkah[] = [];
  const kad: KadProjek[] = [];

  for (let pusingan = 0; pusingan < MAKS_PUSINGAN; pusingan++) {
    // ── Langkah 1: tanya LLM ───────────────────────────────────────────────
    const res = await llm.chat.completions.create({
      model: MODEL,
      messages,
      tools: DEFINISI_TOOLS,
      tool_choice: "auto",
      temperature: 0.3,
      // Model gpt-oss "berfikir" dahulu dan token fikiran dikira dalam had ini.
      // Had yang terlalu rendah boleh menghasilkan jawapan kosong, jadi beri ruang.
      max_tokens: 2048,
      ...(MODEL.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" as const } : {}),
    });
    const mesej = res.choices[0].message;

    // Simpan balasan LLM dalam sejarah (termasuk permintaan tool, jika ada)
    messages.push({
      role: "assistant",
      content: mesej.content ?? "",
      ...(mesej.tool_calls?.length ? { tool_calls: mesej.tool_calls } : {}),
    });

    // ── Langkah 2: tiada permintaan tool → jawapan akhir ──────────────────
    if (!mesej.tool_calls || mesej.tool_calls.length === 0) {
      const { jawapan, cadangan } = asingkanCadangan(mesej.content ?? "");
      // Pelindung: jangan sekali-kali hantar gelembung kosong kepada pelawat
      if (!jawapan) {
        console.error("[agent] Jawapan kosong, finish_reason:", res.choices[0].finish_reason);
        return {
          jawapan: "Maaf, saya tak dapat menyiapkan jawapan tadi. Boleh cuba tanya sekali lagi?",
          cadangan,
          kad,
          langkah,
        };
      }
      return { jawapan, cadangan, kad, langkah };
    }

    // ── Langkah 3: jalankan setiap tool yang diminta ──────────────────────
    for (const panggilan of mesej.tool_calls) {
      const { name, arguments: argumen } = panggilan.function;
      langkah.push({ tool: name, input: argumen });

      const hasil = await jalankanTool(name, argumen);
      if (hasil.kad) kad.push(...hasil.kad);

      // Hantar hasil tool semula kepada LLM (id mesti sepadan)
      messages.push({
        role: "tool",
        tool_call_id: panggilan.id,
        content: JSON.stringify(hasil.untukLLM),
      });
    }
    // ...dan ulang gelung: LLM akan membaca hasil tool dan memutuskan langkah seterusnya
  }

  // Had pusingan dicapai (jarang berlaku): elak gelung tanpa henti
  return {
    jawapan: "Maaf, saya mengambil masa terlalu lama untuk soalan ini. Boleh cuba tanya dengan cara lain?",
    cadangan: [],
    kad,
    langkah,
  };
}
