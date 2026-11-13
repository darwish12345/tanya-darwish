/**
 * PENILAI PADANAN JAWATAN
 * Bandingkan iklan kerja dengan profil Darwish dan beri skor 0–100 berserta sebab.
 * Iklan dinilai BERKELOMPOK dalam satu panggilan LLM (jimat kuota dan masa).
 */
import { tanyaJSON } from "@/lib/agent/llm";
import type { KlienLLM } from "@/lib/agent/loop";
import { profilRingkas } from "./profil";
import type { IklanKerja } from "./jsearch";

export type Penilaian = { id: string; skor: number; sebab: string; padan: string[]; kurang: string[] };

const SISTEM = `Anda penilai padanan kerja yang jujur dan tegas. Bandingkan setiap iklan dengan profil calon.
Peraturan:
- Skor 0-100: 80+ sangat sesuai, 60-79 sesuai, 40-59 boleh dicuba, <40 kurang sesuai.
- Calon ialah pelatih / graduan baru: jawatan yang menuntut 3+ tahun pengalaman dapat skor rendah.
- "padan": kemahiran/keperluan iklan yang BENAR-BENAR ada dalam profil (jangan reka).
- "kurang": keperluan penting iklan yang tiada dalam profil.
- "sebab": satu ayat ringkas dalam Bahasa Melayu.`;

export async function nilaiBerkelompok(iklan: IklanKerja[], llm?: KlienLLM): Promise<Penilaian[]> {
  if (!iklan.length) return [];
  const profil = await profilRingkas();
  const senarai = iklan
    .map((k) => `### id=${k.id}\nTajuk: ${k.tajuk}\nSyarikat: ${k.syarikat}\nLokasi: ${k.lokasi}\n${k.penerangan.slice(0, 1200)}`)
    .join("\n\n");
  const d = await tanyaJSON<{ penilaian?: Penilaian[] }>(
    SISTEM,
    `PROFIL CALON:\n${profil}\n\nIKLAN:\n${senarai}\n\nPulangkan {"penilaian":[{"id","skor","sebab","padan":[],"kurang":[]}]} untuk SETIAP id.`,
    { maxTokens: 3000, llm },
  );
  const ikutId = new Map((d.penilaian ?? []).map((p) => [p.id, p]));
  return iklan.map((k) => {
    const p = ikutId.get(k.id);
    return {
      id: k.id,
      skor: Math.max(0, Math.min(100, Math.round(Number(p?.skor ?? 0)))),
      sebab: String(p?.sebab ?? "Tidak dapat dinilai"),
      padan: (p?.padan ?? []).slice(0, 6).map(String),
      kurang: (p?.kurang ?? []).slice(0, 6).map(String),
    };
  });
}

/** Untuk recruiter di laman web: nilai satu job description yang ditampal. */
export async function nilaiJobDescription(
  jd: string,
  llm?: KlienLLM,
): Promise<{ skor: number; ringkasan: string; padan: string[]; kurang: string[] }> {
  const profil = await profilRingkas();
  const d = await tanyaJSON<{ skor?: number; ringkasan?: string; padan?: string[]; kurang?: string[] }>(
    SISTEM,
    `PROFIL CALON:\n${profil}\n\nJOB DESCRIPTION:\n${jd.slice(0, 5000)}\n\nPulangkan {"skor","ringkasan","padan":[],"kurang":[]}. "ringkasan" 2 ayat, dalam bahasa yang sama dengan job description.`,
    { maxTokens: 1500, llm },
  );
  return {
    skor: Math.max(0, Math.min(100, Math.round(Number(d.skor ?? 0)))),
    ringkasan: String(d.ringkasan ?? ""),
    padan: (d.padan ?? []).slice(0, 8).map(String),
    kurang: (d.kurang ?? []).slice(0, 8).map(String),
  };
}
