/**
 * MESEJ SUARA → TEKS dengan Groq Whisper (percuma).
 * Darwish boleh hantar voice note kepada bot (contoh semasa memandu atau di gym).
 */
import Groq, { toFile } from "groq-sdk";

export const MODEL_SUARA = process.env.GROQ_MODEL_SUARA || "whisper-large-v3-turbo";

export async function transkripsi(bytes: Uint8Array, namaFail = "suara.ogg"): Promise<string> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const hasil = await groq.audio.transcriptions.create({
    file: await toFile(Buffer.from(bytes), namaFail),
    model: MODEL_SUARA,
    language: process.env.BAHASA_SUARA || "ms",
    response_format: "json",
  });
  return (hasil.text ?? "").trim();
}
