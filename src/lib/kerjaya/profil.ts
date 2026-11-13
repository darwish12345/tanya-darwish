/**
 * PROFIL & RESUME INDUK
 * Sumber fakta tentang Darwish (agent TIDAK boleh mereka fakta di luar ini):
 *   1. content/resume.json (fakta awam dalam repo)
 *   2. "resume-induk" dalam Redis (diisi bila Darwish hantar CV/LinkedIn PDF kepada bot)
 *   3. Maklumat hubungan dari env Netlify (tidak disimpan dalam repo awam)
 */
import fs from "node:fs";
import path from "node:path";
import { bacaJSON, tulisJSON } from "@/lib/store";
import { bacaPengetahuan } from "@/lib/data";

export type Pengalaman = { tajuk: string; organisasi: string; tempoh: string; poin: string[] };
export type Projek = { nama: string; pautan?: string; tech: string[]; poin: string[] };
export type Pendidikan = { kelayakan: string; institusi: string; tempoh: string; nota?: string };
export type Sijil = { nama: string; penerbit?: string; tarikh?: string };

export type ResumeInduk = {
  nama: string;
  tajuk: string;
  hubungan: { emel?: string; telefon?: string; lokasi?: string };
  pautan: Record<string, string>;
  ringkasan: string;
  kemahiran: Record<string, string[]>;
  pengalaman: Pengalaman[];
  projek: Projek[];
  pendidikan: Pendidikan[];
  sijil: Sijil[];
};

const adaTodo = (s?: string) => !s || s.trim().toUpperCase().startsWith("TODO");

/** Buang semua nilai TODO supaya tidak muncul dalam resume atau jawapan agent. */
export function bersihkanResume(r: ResumeInduk): ResumeInduk {
  return {
    ...r,
    pautan: Object.fromEntries(Object.entries(r.pautan ?? {}).filter(([, v]) => !adaTodo(v))),
    kemahiran: Object.fromEntries(
      Object.entries(r.kemahiran ?? {}).map(([k, v]) => [k, v.filter((s) => !adaTodo(s))]).filter(([, v]) => v.length),
    ),
    pengalaman: (r.pengalaman ?? [])
      .map((p) => ({ ...p, tempoh: adaTodo(p.tempoh) ? "" : p.tempoh, poin: p.poin.filter((x) => !adaTodo(x)) }))
      .filter((p) => !adaTodo(p.tajuk)),
    projek: (r.projek ?? []).map((p) => ({ ...p, poin: p.poin.filter((x) => !adaTodo(x)) })).filter((p) => !adaTodo(p.nama)),
    pendidikan: (r.pendidikan ?? [])
      .filter((p) => !adaTodo(p.kelayakan) && !adaTodo(p.institusi))
      .map((p) => ({ ...p, tempoh: adaTodo(p.tempoh) ? "" : p.tempoh })),
    sijil: (r.sijil ?? []).filter((s) => !adaTodo(s.nama)),
  };
}

function bacaFailResume(): ResumeInduk {
  const fail = path.join(process.cwd(), "content", "resume.json");
  const d = JSON.parse(fs.readFileSync(fail, "utf8")) as Record<string, unknown>;
  for (const k of Object.keys(d)) if (k.startsWith("_")) delete d[k]; // nota untuk manusia
  return { hubungan: {}, ...d } as ResumeInduk;
}

/** Resume induk lengkap: fail repo + data CV yang diimport + hubungan dari env. */
export async function bacaResumeInduk(): Promise<ResumeInduk> {
  const asas = bacaFailResume();
  const dariCV = await bacaJSON<Partial<ResumeInduk>>("resume-induk", {});
  // content/resume.json ialah sumber utama (disemak Darwish). Data CV yang diimport melalui Telegram
  // hanya MENGISI bahagian yang masih kosong / TODO dalam fail.
  const asasBersih = bersihkanResume(asas);
  const gabung: ResumeInduk = { ...asas };
  for (const k of ["ringkasan", "tajuk", "pengalaman", "pendidikan", "sijil"] as const) {
    const dlmFail = asasBersih[k];
    const kosong = Array.isArray(dlmFail) ? dlmFail.length === 0 : !dlmFail;
    const v = dariCV[k];
    if (kosong && (Array.isArray(v) ? v.length : v)) (gabung as Record<string, unknown>)[k] = v;
  }
  if (dariCV.kemahiran && Object.keys(dariCV.kemahiran).length) {
    gabung.kemahiran = { ...dariCV.kemahiran, ...asas.kemahiran };
  }
  // Projek dari CV hanya dimasukkan jika ada pautan GitHub (projek tanpa bukti kod tidak dipaparkan)
  if (dariCV.projek?.length) {
    const nama = new Set(asas.projek.map((p) => p.nama.toLowerCase()));
    const bertaut = dariCV.projek.filter((p) => /github\.com\//i.test(p.pautan ?? "") && !nama.has(p.nama.toLowerCase()));
    gabung.projek = [...asas.projek, ...bertaut];
  }
  gabung.hubungan = {
    emel: process.env.RESUME_EMEL?.trim() || process.env.GMAIL_USER?.trim() || dariCV.hubungan?.emel,
    telefon: process.env.RESUME_TELEFON?.trim() || dariCV.hubungan?.telefon,
    lokasi: process.env.RESUME_LOKASI?.trim() || dariCV.hubungan?.lokasi,
  };
  gabung.pautan = { ...asas.pautan, ...(dariCV.pautan ?? {}) };
  return bersihkanResume(gabung);
}

export async function simpanDariCV(data: Partial<ResumeInduk>): Promise<void> {
  const lama = await bacaJSON<Partial<ResumeInduk>>("resume-induk", {});
  await tulisJSON("resume-induk", { ...lama, ...data });
}

/** Semua kemahiran (huruf kecil) — untuk memastikan resume khas tidak menambah kemahiran rekaan. */
export function semuaKemahiran(r: ResumeInduk): string[] {
  return Object.values(r.kemahiran).flat();
}

/** Ringkasan profil dalam teks, untuk penilai padanan kerja. */
export async function profilRingkas(): Promise<string> {
  const r = await bacaResumeInduk();
  const tambahan = (await bacaPengetahuan()).slice(-15).map((p) => `- ${p.tajuk}: ${p.teks.slice(0, 300)}`);
  return [
    `Nama: ${r.nama}. ${r.tajuk}.`,
    `Ringkasan: ${r.ringkasan}`,
    `Kemahiran: ${Object.entries(r.kemahiran).map(([k, v]) => `${k}: ${v.join(", ")}`).join("; ")}`,
    `Pengalaman: ${r.pengalaman.map((p) => `${p.tajuk} di ${p.organisasi} ${p.tempoh}`.trim()).join("; ") || "-"}`,
    `Projek: ${r.projek.map((p) => `${p.nama} (${p.tech.join(", ")})`).join("; ")}`,
    `Pendidikan: ${r.pendidikan.map((p) => `${p.kelayakan}, ${p.institusi}`).join("; ") || "belum dinyatakan"}`,
    `Sijil: ${r.sijil.map((s) => s.nama).join("; ")}`,
    tambahan.length ? `Maklumat tambahan:\n${tambahan.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
