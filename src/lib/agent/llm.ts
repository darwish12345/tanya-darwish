/**
 * Panggilan LLM "sekali jalan" yang memulangkan JSON berstruktur (tanpa tools).
 * Digunakan untuk tugas seperti menilai padanan kerja, menjana resume dan membaca CV.
 */
import { klien, MODEL, MODEL_SANDARAN, kuotaHarianHabis, type KlienLLM } from "./loop";

export async function tanyaJSON<T>(
  sistem: string,
  pengguna: string,
  opsyen: { maxTokens?: number; llm?: KlienLLM } = {},
): Promise<T> {
  const llm = opsyen.llm ?? klien();
  let ralatTerakhir: unknown = null;
  let model = MODEL;
  for (let cubaan = 0; cubaan < 3; cubaan++) {
    try {
      const res = await llm.chat.completions.create({
        model,
        messages: [
          { role: "system", content: `${sistem}\n\nBalas dengan JSON SAHAJA (satu objek), tanpa teks lain.` },
          { role: "user", content: pengguna },
        ],
        temperature: 0.2,
        max_tokens: opsyen.maxTokens ?? 2048,
        response_format: { type: "json_object" },
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" as const } : {}),
      });
      const teks = res.choices[0].message.content ?? "";
      const mula = teks.indexOf("{");
      const akhir = teks.lastIndexOf("}");
      if (mula < 0 || akhir < mula) throw new Error("Tiada JSON dalam jawapan");
      return JSON.parse(teks.slice(mula, akhir + 1)) as T;
    } catch (e) {
      ralatTerakhir = e;
      if (model !== MODEL_SANDARAN && kuotaHarianHabis(e)) model = MODEL_SANDARAN;
    }
  }
  throw ralatTerakhir instanceof Error ? ralatTerakhir : new Error(String(ralatTerakhir));
}
