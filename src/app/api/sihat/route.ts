/**
 * SEMAKAN KESIHATAN: GET /api/sihat
 * Semak setiap bahagian sistem dan berapa lama ia ambil. Tiada rahsia didedahkan.
 */
import { bacaJSON, tulisJSON, jenisStoran } from "@/lib/store";
import { bacaStatus } from "@/lib/data";
import { klien, MODEL } from "@/lib/agent/loop";
import { semakBot, ralatTelegramTerakhir, tokenBot } from "@/lib/telegram";

async function ukur<T>(fn: () => Promise<T>) {
  const mula = Date.now();
  try {
    const nilai = await fn();
    return { ok: true, ms: Date.now() - mula, nilai };
  } catch (e) {
    return { ok: false, ms: Date.now() - mula, ralat: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET() {
  const storan = await ukur(async () => {
    const tanda = new Date().toISOString();
    await tulisJSON("sihat", { tanda });
    const baca = await bacaJSON<{ tanda: string }>("sihat", { tanda: "" });
    if (baca.tanda !== tanda) throw new Error("Data dibaca tidak sama dengan yang ditulis");
    return "baca/tulis ok";
  });

  const groq = await ukur(async () => {
    const res = await klien().chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: "Balas: ok" }],
      max_tokens: 50,
    });
    return res.choices[0].finish_reason;
  });

  const telegram = await semakBot();
  const status = await bacaStatus().catch((e) => ({ ralatBacaStatus: String(e) }) as Record<string, unknown>);
  const tokenAsal = process.env.TELEGRAM_BOT_TOKEN ?? "";

  return Response.json({
    model: MODEL,
    tetapan: {
      GROQ_API_KEY: Boolean(process.env.GROQ_API_KEY),
      TELEGRAM_BOT_TOKEN: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      TELEGRAM_CHAT_ID: Boolean(process.env.TELEGRAM_CHAT_ID),
      AGENT_SECRET: (process.env.AGENT_SECRET?.length ?? 0) >= 16,
    },
    storan: { jenis: jenisStoran(), ...storan, ...(jenisStoran() !== "upstash" ? { amaran: "Sila setup Upstash Redis (UPSTASH_REDIS_REST_URL & UPSTASH_REDIS_REST_TOKEN)" } : {}) },
    groq,
    telegram: {
      ...telegram,
      tokenAdaRuangKosong: tokenAsal !== tokenAsal.trim(),
      tokenAdaAwalanBot: tokenAsal.trim() !== tokenBot(),
      ralatHantarTerakhir: ralatTelegramTerakhir ?? (status as { ralatTelegram?: string }).ralatTelegram ?? null,
      ralatWebhookTerakhir: (status as { ralatWebhook?: unknown }).ralatWebhook ?? null,
    },
  });
}
