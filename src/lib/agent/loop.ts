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
 * Gelung ini dikongsi oleh agent web (Tanya Darwish) dan agent peribadi Telegram.
 */
import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { SYSTEM_PROMPT } from "./prompt";
import { TOOLS } from "./tools";
import { keDefinisi, jalankanToolDari, type SebarangTool } from "./rangka";
import type { KadProjek } from "@/lib/projects";

export const MAKS_PUSINGAN = 5;
export const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export type MesejSejarah = { role: "user" | "assistant"; content: string };
export type Langkah = { tool: string; input: string };

/** Bahagian minimum klien LLM yang kita perlukan (supaya mudah diuji dengan mock). */
export type KlienLLM = {
  chat: { completions: { create: Groq["chat"]["completions"]["create"] } };
};

let klienLalai: Groq | null = null;
export function klien(): KlienLLM {
  if (!klienLalai) klienLalai = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return klienLalai;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gelung generik
// ─────────────────────────────────────────────────────────────────────────────
export type HasilGelung = {
  teks: string;
  kad: KadProjek[];
  langkah: Langkah[];
  tiadaHasil: boolean; // ada carian yang tidak jumpa apa-apa
  hadDicapai: boolean;
};

export async function jalankanGelung(opsyen: {
  systemPrompt: string;
  tools: SebarangTool[];
  sejarah: MesejSejarah[];
  llm?: KlienLLM;
}): Promise<HasilGelung> {
  const { systemPrompt, tools, sejarah, llm = klien() } = opsyen;
  const definisi = keDefinisi(tools);
  const messages: ChatCompletionMessageParam[] = [{ role: "system", content: systemPrompt }, ...sejarah];
  const langkah: Langkah[] = [];
  const kad: KadProjek[] = [];
  let tiadaHasil = false;

  for (let pusingan = 0; pusingan < MAKS_PUSINGAN; pusingan++) {
    // ── Langkah 1: tanya LLM ───────────────────────────────────────────────
    const res = await llm.chat.completions.create({
      model: MODEL,
      messages,
      tools: definisi,
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
      if (!mesej.content?.trim()) {
        console.error("[agent] Jawapan kosong, finish_reason:", res.choices[0].finish_reason);
      }
      return { teks: mesej.content ?? "", kad, langkah, tiadaHasil, hadDicapai: false };
    }

    // ── Langkah 3: jalankan setiap tool yang diminta ──────────────────────
    for (const panggilan of mesej.tool_calls) {
      const { name, arguments: argumen } = panggilan.function;
      langkah.push({ tool: name, input: argumen });

      const hasil = await jalankanToolDari(tools, name, argumen);
      if (hasil.kad) kad.push(...hasil.kad);
      if (hasil.tiadaHasil) tiadaHasil = true;

      // Hantar hasil tool semula kepada LLM (id mesti sepadan)
      messages.push({ role: "tool", tool_call_id: panggilan.id, content: JSON.stringify(hasil.untukLLM) });
    }
    // ...dan ulang gelung: LLM akan membaca hasil tool dan memutuskan langkah seterusnya
  }

  // Had pusingan dicapai (jarang berlaku): elak gelung tanpa henti
  return { teks: "", kad, langkah, tiadaHasil, hadDicapai: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent web: Tanya Darwish
// ─────────────────────────────────────────────────────────────────────────────
export type HasilAgent = {
  jawapan: string;
  cadangan: string[];
  kad: KadProjek[];
  langkah: Langkah[]; // tools yang digunakan, untuk dipaparkan & debug
  tiadaJawapan: boolean; // untuk laporan harian: agent tidak jumpa maklumat
};

/** Asingkan <cadangan>...</cadangan> dari teks jawapan. */
export function asingkanCadangan(teks: string): { jawapan: string; cadangan: string[] } {
  const padanan = teks.match(/<cadangan>([\s\S]*?)<\/cadangan>/i);
  const jawapan = teks.replace(/<cadangan>[\s\S]*?<\/cadangan>/gi, "").trim();
  const cadangan = padanan
    ? padanan[1].split("|").map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 100).slice(0, 3)
    : [];
  return { jawapan, cadangan };
}

const PENANDA_EN = new Set("what does do is are the how show me his him he have has can could who tell about which where when you your i my projects project skills experience education contact please".split(" "));
const PENANDA_BM = new Set("apa saya dia ada tak nak boleh yang dan ini itu tentang untuk dengan bila siapa mana kenapa bagaimana berapa ceritakan tunjukkan projek kemahiran sijil pengalaman hubungi mahu ingin".split(" "));

/** Kesan bahasa mesej terakhir pelawat secara ringkas (kiraan perkataan penanda). */
export function kesanBahasa(teks: string): "en" | "ms" {
  const perkataan = teks.toLowerCase().split(/[^a-z']+/).filter(Boolean);
  const en = perkataan.filter((p) => PENANDA_EN.has(p)).length;
  const ms = perkataan.filter((p) => PENANDA_BM.has(p)).length;
  return en > ms ? "en" : "ms";
}

const RE_TIDAK_PASTI = /tidak pasti|tak pasti|tidak menemukan|tidak dijumpai|tiada maklumat|not sure|couldn't find|could not find|no information/i;

export async function jalankanAgent(sejarah: MesejSejarah[], llm?: KlienLLM): Promise<HasilAgent> {
  // Model cenderung ikut bahasa hasil carian (BM), jadi bahasa balasan ditetapkan oleh kod
  const terakhir = [...sejarah].reverse().find((m) => m.role === "user")?.content ?? "";
  const arahanBahasa =
    kesanBahasa(terakhir) === "en"
      ? "The visitor's latest message is in ENGLISH. Write your entire reply and the <cadangan> questions in English, even though the knowledge base is in Malay."
      : "Mesej terakhir pelawat dalam Bahasa Melayu. Balas dalam Bahasa Melayu.";

  const hasil = await jalankanGelung({
    systemPrompt: `${SYSTEM_PROMPT}\n\n${arahanBahasa}`,
    tools: TOOLS,
    sejarah,
    llm,
  });

  if (hasil.hadDicapai) {
    return {
      jawapan: "Maaf, saya mengambil masa terlalu lama untuk soalan ini. Boleh cuba tanya dengan cara lain?",
      cadangan: [],
      kad: hasil.kad,
      langkah: hasil.langkah,
      tiadaJawapan: true,
    };
  }

  const { jawapan, cadangan } = asingkanCadangan(hasil.teks);
  // Pelindung: jangan sekali-kali hantar gelembung kosong kepada pelawat
  const akhir = jawapan || "Maaf, saya tak dapat menyiapkan jawapan tadi. Boleh cuba tanya sekali lagi?";
  return {
    jawapan: akhir,
    cadangan,
    kad: hasil.kad,
    langkah: hasil.langkah,
    tiadaJawapan: !jawapan || hasil.tiadaHasil || RE_TIDAK_PASTI.test(jawapan),
  };
}
