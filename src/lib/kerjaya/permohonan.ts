/**
 * PENJANA PERMOHONAN (resume khas + cover letter) dengan KELULUSAN MANUSIA.
 *
 * Anti-rekaan: LLM hanya MEMILIH kemahiran/pengalaman/projek/poin yang SUDAH ADA dalam resume induk
 * (melalui indeks), kemudian kod mengesahkan pilihan itu. Teks bebas hanya untuk ringkasan & cover letter,
 * dengan arahan tegas supaya hanya guna fakta dalam profil.
 *
 * Emel TIDAK dihantar secara automatik: Darwish mesti tekan butang "Hantar" di Telegram.
 */
import { bacaJSON, tulisJSON } from "@/lib/store";
import { tanyaJSON } from "@/lib/agent/llm";
import type { KlienLLM } from "@/lib/agent/loop";
import { hantarMesej, hantarDokumen, type Papan } from "@/lib/telegram";
import { emelDisetup, hantarEmel } from "@/lib/emel";
import { ciptaPeringatan } from "@/lib/peringatan";
import { gabungMY, tarikhMY, tambahHari } from "@/lib/masa";
import { bacaResumeInduk, semuaKemahiran, type ResumeInduk } from "./profil";
import { janaResumePDF, janaCoverLetterPDF, type ResumeKhas } from "./pdf";
import { bacaRekod, simpanRekod, kemasStatusKerja, type DrafPermohonan, type RekodKerja } from "./rekod";

const SISTEM = `Anda pakar resume yang JUJUR. Tugas: sesuaikan resume calon untuk satu iklan kerja.
PERATURAN KERAS:
- Anda TIDAK boleh menambah kemahiran, pengalaman, projek, sijil atau angka yang tiada dalam RESUME INDUK.
- "kemahiran": pilih dari senarai kemahiran induk SAHAJA (tulis sama seperti dalam induk), susun ikut kerelevanan.
- "pengalaman"/"projek": pilih INDEKS item yang relevan. "poinPengalaman"/"poinProjek": untuk setiap indeks item, senarai indeks poin yang paling relevan (susun ikut kepentingan).
- "ringkasan": 2-3 ayat dalam English, hanya guna fakta induk, tonjolkan yang relevan dengan iklan.
- "coverLetter": English, 3-4 perenggan pendek (dipisahkan baris kosong), sopan dan spesifik kepada syarikat & jawatan, hanya guna fakta induk. Mulakan "Dear Hiring Manager," dan akhiri dengan nama calon.
- "subjek": subjek emel permohonan, contoh "Application for Junior Software Engineer - Muhammad Darwish".`;

function senaraiInduk(induk: ResumeInduk): string {
  const pengalaman = induk.pengalaman
    .map((e, i) => `[${i}] ${e.tajuk} - ${e.organisasi}\n${e.poin.map((p, j) => `   (${j}) ${p}`).join("\n")}`)
    .join("\n");
  const projek = induk.projek
    .map((p, i) => `[${i}] ${p.nama} (${p.tech.join(", ")})\n${p.poin.map((b, j) => `   (${j}) ${b}`).join("\n")}`)
    .join("\n");
  return [
    `Nama: ${induk.nama}`,
    `Tajuk: ${induk.tajuk}`,
    `Ringkasan induk: ${induk.ringkasan}`,
    `Kemahiran induk: ${semuaKemahiran(induk).join(", ")}`,
    `PENGALAMAN:\n${pengalaman || "(tiada)"}`,
    `PROJEK:\n${projek || "(tiada)"}`,
    `Pendidikan: ${induk.pendidikan.map((e) => `${e.kelayakan}, ${e.institusi}`).join("; ") || "-"}`,
    `Sijil: ${induk.sijil.map((s) => s.nama).join("; ") || "-"}`,
  ].join("\n");
}

/** Sahkan pilihan LLM terhadap resume induk (buang apa-apa yang tidak wujud). */
export function sahkanDraf(mentah: Partial<DrafPermohonan>, induk: ResumeInduk): DrafPermohonan {
  const kemahiranInduk = semuaKemahiran(induk);
  const ikutHuruf = new Map(kemahiranInduk.map((k) => [k.toLowerCase(), k]));
  const kemahiran = (mentah.kemahiran ?? [])
    .map((k) => ikutHuruf.get(String(k).toLowerCase()))
    .filter((k): k is string => Boolean(k));
  const indeksSah = (senarai: unknown, had: number) =>
    [...new Set((Array.isArray(senarai) ? senarai : []).map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < had);
  const pengalaman = indeksSah(mentah.pengalaman, induk.pengalaman.length);
  const projek = indeksSah(mentah.projek, induk.projek.length);
  const poinPengalaman = Object.fromEntries(
    pengalaman.map((i) => [String(i), indeksSah(mentah.poinPengalaman?.[String(i)], induk.pengalaman[i].poin.length)]),
  );
  const poinProjek = Object.fromEntries(
    projek.map((i) => [String(i), indeksSah(mentah.poinProjek?.[String(i)], induk.projek[i].poin.length)]),
  );
  return {
    ringkasan: String(mentah.ringkasan || induk.ringkasan).slice(0, 700),
    // Jika LLM tidak memilih apa-apa yang sah, guna semua (lebih baik daripada resume kosong)
    kemahiran: kemahiran.length ? kemahiran : kemahiranInduk,
    pengalaman: pengalaman.length ? pengalaman : induk.pengalaman.map((_, i) => i),
    poinPengalaman,
    projek: projek.length ? projek : induk.projek.map((_, i) => i),
    poinProjek,
    coverLetter: String(mentah.coverLetter ?? "").slice(0, 3500),
    subjek: String(mentah.subjek || `Application - ${induk.nama}`).slice(0, 150),
    dicipta: new Date().toISOString(),
  };
}

export function binaResumeKhas(induk: ResumeInduk, d: DrafPermohonan): ResumeKhas {
  const pilihPoin = (poin: string[], indeks?: number[]) => (indeks?.length ? indeks.map((i) => poin[i]) : poin);
  return {
    ringkasan: d.ringkasan,
    kemahiran: d.kemahiran,
    pengalaman: d.pengalaman.map((i) => ({ ...induk.pengalaman[i], poin: pilihPoin(induk.pengalaman[i].poin, d.poinPengalaman[String(i)]) })),
    projek: d.projek.map((i) => ({ ...induk.projek[i], poin: pilihPoin(induk.projek[i].poin, d.poinProjek[String(i)]) })),
  };
}

export async function janaDraf(r: RekodKerja, induk: ResumeInduk, llm?: KlienLLM): Promise<DrafPermohonan> {
  const mentah = await tanyaJSON<Partial<DrafPermohonan>>(
    SISTEM,
    `RESUME INDUK:\n${senaraiInduk(induk)}\n\nIKLAN:\nJawatan: ${r.tajuk}\nSyarikat: ${r.syarikat}\nLokasi: ${r.lokasi}\n${r.penerangan.slice(0, 3500)}\n\nPulangkan {"ringkasan","kemahiran":[],"pengalaman":[],"poinPengalaman":{},"projek":[],"poinProjek":{},"coverLetter","subjek"}`,
    { maxTokens: 3000, llm },
  );
  return sahkanDraf(mentah, induk);
}

const namaFail = (jenis: string, induk: ResumeInduk, r: RekodKerja) =>
  `${jenis}_${induk.nama.split(" ").slice(0, 2).join("_")}_${r.syarikat.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 30)}.pdf`;

export async function janaPDF(r: RekodKerja, induk: ResumeInduk) {
  const resume = await janaResumePDF(induk, binaResumeKhas(induk, r.draf!));
  const cover = await janaCoverLetterPDF(induk, r.draf!.coverLetter, new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }));
  return { resume, cover };
}

function papanKelulusan(r: RekodKerja): Papan {
  const baris: Papan = [];
  if (r.emelHR && emelDisetup()) {
    baris.push([{ teks: `📧 Hantar ke ${r.emelHR}`.slice(0, 60), data: `m:hantar:${r.id}` }]);
    baris.push([{ teks: "✖️ Batal", data: `m:batal:${r.id}` }]);
  } else {
    if (r.pautan) baris.push([{ teks: "🔗 Buka iklan & mohon", url: r.pautan }]);
    baris.push([{ teks: "✅ Saya dah mohon", data: `m:manual:${r.id}` }]);
  }
  return baris;
}

/** Jana draf, hantar PDF ke Telegram, dan minta kelulusan. */
export async function sediakanPermohonan(id: string, llm?: KlienLLM): Promise<string> {
  const r = await bacaRekod(id);
  if (!r) return "Rekod kerja tidak dijumpai.";
  const induk = await bacaResumeInduk();
  r.draf = await janaDraf(r, induk, llm);
  const { resume, cover } = await janaPDF(r, induk);

  await hantarDokumen(namaFail("Resume", induk, r), resume, { kapsyen: `Resume khas: **${r.tajuk}** (${r.syarikat})` });
  await hantarDokumen(namaFail("CoverLetter", induk, r), cover, { kapsyen: "Cover letter" });

  let arahan: string;
  if (r.emelHR && emelDisetup()) {
    arahan = `Semak kedua-dua fail. Tekan **Hantar** untuk emel kepada **${r.emelHR}** dari Gmail anda.`;
    r.status = "draf";
  } else if (r.emelHR) {
    arahan = `Emel HR dijumpai (**${r.emelHR}**) tetapi Gmail belum disetup. Mohon secara manual buat masa ini.`;
    r.status = "perlu_manual";
  } else {
    arahan = `Tiada emel HR dalam iklan. Mohon melalui pautan iklan (muat naik PDF ini), kemudian tekan **Saya dah mohon**.\nAtau beritahu saya: _"emel HR untuk ${r.id} ialah hr@syarikat.com"_.`;
    r.status = "perlu_manual";
  }
  await simpanRekod(r);
  await hantarMesej(`${arahan}\n\n💡 Semak resume: pastikan setiap kemahiran boleh anda terangkan semasa interview.`, { papan: papanKelulusan(r) });
  return "Draf dihantar ke Telegram untuk semakan.";
}

/** Dipanggil HANYA bila Darwish tekan butang "Hantar". */
export async function hantarPermohonan(id: string): Promise<string> {
  const r = await bacaRekod(id);
  if (!r?.draf) return "Draf tidak dijumpai. Sediakan permohonan dahulu.";
  if (r.status === "dihantar") return "Permohonan ini sudah dihantar sebelum ini.";
  if (!r.emelHR) return "Tiada emel HR untuk permohonan ini.";
  if (!emelDisetup()) return "Gmail belum disetup.";

  // Kunci ringkas: elak emel berganda jika butang ditekan dua kali dengan pantas
  const kunci = `hantar-kunci-${id}`;
  const dikunci = await bacaJSON<number>(kunci, 0);
  if (Date.now() - dikunci < 5 * 60_000) return "Permohonan ini sedang dihantar. Tunggu sebentar.";
  await tulisJSON(kunci, Date.now());

  const induk = await bacaResumeInduk();
  const { resume, cover } = await janaPDF(r, induk);
  const hasil = await hantarEmel({
    kepada: r.emelHR,
    subjek: r.draf.subjek,
    teks: r.draf.coverLetter,
    lampiran: [
      { namaFail: namaFail("Resume", induk, r), kandungan: resume },
      { namaFail: namaFail("CoverLetter", induk, r), kandungan: cover },
    ],
  });
  if (!hasil.ok) {
    await tulisJSON(kunci, 0); // benarkan cuba semula
    return `Gagal menghantar emel: ${hasil.ralat}`;
  }

  await kemasStatusKerja(id, "dihantar", { dihantarPada: new Date().toISOString() });
  // Follow-up automatik selepas 7 hari, jam 10 pagi
  const masaFollowUp = gabungMY(tambahHari(tarikhMY(), 7), "10:00");
  if (masaFollowUp) await ciptaPeringatan(masaFollowUp, `Follow-up permohonan ${r.tajuk} di ${r.syarikat} (${r.emelHR})`);
  return `✅ Permohonan dihantar kepada ${r.emelHR}. Saya akan ingatkan anda untuk follow-up dalam 7 hari.`;
}
