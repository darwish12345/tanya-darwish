/**
 * ENDPOINT CHAT: POST /api/chat
 * Terima sejarah perbualan dari browser → semak guardrails → jalankan agent → pulangkan jawapan.
 */
import { z } from "zod";
import Groq from "groq-sdk";
import { jalankanAgent } from "@/lib/agent/loop";
import { HAD_PANJANG_MESEJ, HAD_SEJARAH, semakHadKadar } from "@/lib/guardrails";

const SkemaBadan = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1),
});

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return Response.json({ ralat: "GROQ_API_KEY belum ditetapkan dalam .env.local" }, { status: 500 });
  }

  // Guardrail 1: had kadar ikut IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "tempatan";
  if (!semakHadKadar(ip)) {
    return Response.json({ ralat: "Terlalu banyak mesej. Cuba lagi selepas sejam." }, { status: 429 });
  }

  // Guardrail 2: validasi input
  const semak = SkemaBadan.safeParse(await req.json().catch(() => null));
  if (!semak.success) return Response.json({ ralat: "Permintaan tidak sah." }, { status: 400 });

  const sejarah = semak.data.messages.slice(-HAD_SEJARAH);
  const terakhir = sejarah[sejarah.length - 1];
  if (terakhir.role !== "user") {
    return Response.json({ ralat: "Mesej terakhir mesti daripada pelawat." }, { status: 400 });
  }
  if (terakhir.content.length > HAD_PANJANG_MESEJ) {
    return Response.json({ ralat: `Mesej mesti kurang daripada ${HAD_PANJANG_MESEJ} aksara.` }, { status: 400 });
  }

  try {
    return Response.json(await jalankanAgentDenganCubaSemula(sejarah));
  } catch (e) {
    console.error("[api/chat]", e);
    if (e instanceof Groq.APIError && e.status === 429) {
      return Response.json({ ralat: "Agent sedang sibuk (had percuma Groq). Cuba lagi dalam seminit." }, { status: 429 });
    }
    return Response.json({ ralat: "Maaf, berlaku ralat. Cuba lagi." }, { status: 500 });
  }
}

/** Model kadang-kadang menjana panggilan tool yang rosak (ralat 400). Cuba sekali lagi. */
async function jalankanAgentDenganCubaSemula(sejarah: Parameters<typeof jalankanAgent>[0]) {
  try {
    return await jalankanAgent(sejarah);
  } catch (e) {
    if (e instanceof Groq.APIError && e.status === 400) return await jalankanAgent(sejarah);
    throw e;
  }
}
