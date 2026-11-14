/**
 * Panggilan LLM "sekali jalan" yang memulangkan JSON berstruktur (tanpa tools).
 * Digunakan untuk tugas seperti menilai padanan kerja, menjana resume dan membaca CV.
 */
import { klien, MODEL, MODEL_SANDARAN, kuotaHabis, type KlienLLM } from "./loop";

export async function tanyaJSON<T>(
  sistem: string,
  pengguna: string,
  opsyen: { maxTokens?: number; llm?: KlienLLM; bajetMs?: number } = {},
): Promise<T> {
  const llm = opsyen.llm ?? klien();
  let ralatTerakhir: unknown = null;
  let model = MODEL;
  // Bajet masa keseluruhan (fungsi Netlify ~10 s): lebih baik gagal dan dicuba semula oleh QStash
  const tamat = Date.now() + (opsyen.bajetMs ?? 8500);
  for (let cubaan = 0; cubaan < 3; cubaan++) {
    const baki = tamat - Date.now();
    if (baki < 1500) break;
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
      }, { timeout: baki, maxRetries: 0 });
      const teks = res.choices[0].message.content ?? "";
      const mula = teks.indexOf("{");
      const akhir = teks.lastIndexOf("}");
      if (mula < 0 || akhir < mula) throw new Error("Tiada JSON dalam jawapan");
      return JSON.parse(teks.slice(mula, akhir + 1)) as T;
    } catch (e) {
      ralatTerakhir = e;
      if (model !== MODEL_SANDARAN && kuotaHabis(e)) model = MODEL_SANDARAN;
    }
  }
  throw ralatTerakhir instanceof Error ? ralatTerakhir : new Error(String(ralatTerakhir ?? "Bajet masa LLM habis"));
}
