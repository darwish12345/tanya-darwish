/**
 * IMPORT CV / PROFIL LINKEDIN (PDF) yang dihantar kepada bot Telegram.
 * PDF → teks (unpdf) → LLM ekstrak bahagian berstruktur → disimpan sebagai resume induk + pengetahuan.
 * LinkedIn: Profil → "More" → "Save to PDF", kemudian hantar fail itu kepada bot.
 */
import { extractText, getDocumentProxy } from "unpdf";
import { tanyaJSON } from "@/lib/agent/llm";
import type { KlienLLM } from "@/lib/agent/loop";
import { tambahPengetahuan } from "@/lib/data";
import { simpanDariCV, type ResumeInduk } from "@/lib/kerjaya/profil";
import { kosongkanCachePengetahuan } from "@/lib/rag/knowledge";

export async function teksDariPDF(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/\s+\n/g, "\n").trim();
}

const SISTEM = `Anda mengekstrak maklumat dari CV atau profil LinkedIn ke JSON berstruktur.
PERATURAN: salin fakta SAHAJA dari dokumen (jangan tambah, jangan teka). Jika sesuatu tiada, pulangkan senarai kosong / rentetan kosong.
Struktur:
{"ringkasan": "", "tajuk": "", "hubungan": {"emel":"","telefon":"","lokasi":""},
 "pautan": {"linkedin":"","github":""},
 "kemahiran": {"Kategori": ["..."]},
 "pengalaman": [{"tajuk":"","organisasi":"","tempoh":"","poin":["pencapaian/tugas dalam ayat penuh"]}],
 "projek": [{"nama":"","pautan":"","tech":[],"poin":[]}],
 "pendidikan": [{"kelayakan":"","institusi":"","tempoh":"","nota":""}],
 "sijil": [{"nama":"","penerbit":"","tarikh":""}]}
Poin pengalaman/projek ditulis dalam English yang profesional tetapi maknanya MESTI sama dengan dokumen.`;

export async function importProfilPDF(
  bytes: Uint8Array,
  sumber: "cv" | "linkedin",
  llm?: KlienLLM,
): Promise<{ ringkasan: string; bahagian: Record<string, number> }> {
  const teks = await teksDariPDF(bytes);
  if (teks.length < 100) throw new Error("PDF ini tiada teks yang boleh dibaca (mungkin imej imbasan).");

  const d = await tanyaJSON<Partial<ResumeInduk>>(SISTEM, `DOKUMEN (${sumber}):\n${teks.slice(0, 14000)}`, { maxTokens: 4000, llm });
  const bersih: Partial<ResumeInduk> = {
    ringkasan: d.ringkasan || undefined,
    tajuk: d.tajuk || undefined,
    hubungan: d.hubungan,
    pautan: Object.fromEntries(Object.entries(d.pautan ?? {}).filter(([, v]) => v)),
    kemahiran: d.kemahiran ?? {},
    pengalaman: (d.pengalaman ?? []).filter((p) => p.tajuk && p.organisasi),
    projek: (d.projek ?? []).filter((p) => p.nama),
    pendidikan: (d.pendidikan ?? []).filter((p) => p.kelayakan || p.institusi),
    sijil: (d.sijil ?? []).filter((s) => s.nama),
  };
  await simpanDariCV(bersih);

  // Jadikan pengetahuan supaya agent web boleh menjawab soalan recruiter (tanpa maklumat hubungan peribadi)
  const label = sumber === "linkedin" ? "LinkedIn" : "CV";
  if (bersih.ringkasan) await tambahPengetahuan({ tajuk: `Ringkasan (${label})`, teks: bersih.ringkasan, sumber });
  for (const p of bersih.pengalaman ?? []) {
    await tambahPengetahuan({ tajuk: `Pengalaman: ${p.tajuk} di ${p.organisasi}`, teks: [p.tempoh, ...p.poin].filter(Boolean).join("\n"), sumber });
  }
  for (const e of bersih.pendidikan ?? []) {
    await tambahPengetahuan({ tajuk: `Pendidikan: ${e.kelayakan}`, teks: [e.institusi, e.tempoh, e.nota].filter(Boolean).join(", "), sumber });
  }
  const kemahiran = Object.entries(bersih.kemahiran ?? {}).map(([k, v]) => `${k}: ${v.join(", ")}`).join("\n");
  if (kemahiran) await tambahPengetahuan({ tajuk: `Kemahiran (${label})`, teks: kemahiran, sumber });
  for (const s of bersih.sijil ?? []) {
    await tambahPengetahuan({ tajuk: `Sijil: ${s.nama}`, teks: [s.penerbit, s.tarikh].filter(Boolean).join(", "), sumber });
  }
  kosongkanCachePengetahuan();

  const bahagian = {
    pengalaman: bersih.pengalaman?.length ?? 0,
    projek: bersih.projek?.length ?? 0,
    pendidikan: bersih.pendidikan?.length ?? 0,
    sijil: bersih.sijil?.length ?? 0,
    kemahiran: Object.values(bersih.kemahiran ?? {}).flat().length,
  };
  return { ringkasan: bersih.ringkasan ?? "", bahagian };
}
