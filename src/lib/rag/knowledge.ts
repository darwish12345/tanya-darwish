/**
 * PANGKALAN PENGETAHUAN (versi 1: carian teks)
 *
 * Inilah "R" dalam RAG (Retrieval-Augmented Generation):
 *   1. Baca semua fail dalam folder content/
 *   2. Pecah (chunk) setiap fail ikut tajuk "##"
 *   3. Bina indeks carian
 *   4. Bila agent tanya, pulangkan ketul yang paling relevan
 *
 * Versi 2 (Minggu 2 dalam pelan): tukar carian teks ini kepada carian vektor
 * (embedding + pgvector di Supabase). Fungsi cariPengetahuan() kekal sama,
 * jadi gelung agent tidak perlu diubah langsung.
 */
import fs from "node:fs";
import path from "node:path";
import MiniSearch from "minisearch";
import { senaraiProjek } from "@/lib/projects";

export type Ketul = {
  id: string;
  sumber: string; // nama fail asal, contoh "profil.md"
  tajuk: string; // tajuk bahagian
  teks: string;
};

const CONTENT_DIR = path.join(process.cwd(), "content");

/** Buang komen HTML dan baris "TODO" supaya agent tak nampak placeholder. */
export function bersihkan(teks: string): string {
  return teks
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter((baris) => !baris.trim().startsWith("TODO"))
    .join("\n")
    .trim();
}

/** Pecah satu fail Markdown kepada ketul ikut tajuk "## ". */
export function pecahMarkdown(sumber: string, kandungan: string): Ketul[] {
  const bersih = bersihkan(kandungan);
  const bahagian = bersih.split(/^## /m).slice(1); // abaikan teks sebelum ## pertama
  return bahagian
    .map((b, i) => {
      const [tajuk, ...badan] = b.split("\n");
      return {
        id: `${sumber}#${i}`,
        sumber,
        tajuk: tajuk.trim(),
        teks: badan.join("\n").trim(),
      };
    })
    .filter((k) => k.teks.length > 0); // bahagian yang kosong (semua TODO) diabaikan
}

function bacaSemuaKetul(): Ketul[] {
  const fail = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md"));
  const ketulMd = fail.flatMap((f) =>
    pecahMarkdown(f, fs.readFileSync(path.join(CONTENT_DIR, f), "utf8")),
  );

  // Setiap projek juga dijadikan satu ketul supaya boleh dicari
  const ketulProjek: Ketul[] = senaraiProjek().map((p) => ({
    id: `projek#${p.id}`,
    sumber: `projek:${p.id}`,
    tajuk: p.nama,
    teks: [
      p.ringkasan,
      `Peranan: ${p.peranan}`,
      `Tempoh: ${p.tempoh}`,
      `Tech: ${p.tech.join(", ")}`,
      p.butiran,
      p.link.repo ? `Repo: ${p.link.repo}` : "",
      p.link.demo ? `Demo: ${p.link.demo}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  }));

  return [...ketulMd, ...ketulProjek];
}

// Indeks dibina sekali dan disimpan dalam memori (cache)
let indeks: MiniSearch<Ketul> | null = null;
let semuaKetul: Ketul[] = [];

function dapatkanIndeks() {
  if (!indeks) {
    semuaKetul = bacaSemuaKetul();
    indeks = new MiniSearch<Ketul>({
      fields: ["tajuk", "teks"],
      storeFields: ["sumber", "tajuk", "teks"],
      searchOptions: { boost: { tajuk: 2 }, fuzzy: 0.2, prefix: true },
    });
    indeks.addAll(semuaKetul);
  }
  return indeks;
}

/** Cari ketul paling relevan untuk satu soalan. */
export function cariPengetahuan(soalan: string, had = 4): Ketul[] {
  const hasil = dapatkanIndeks().search(soalan, { combineWith: "OR" });
  return hasil.slice(0, had).map((h) => ({
    id: String(h.id),
    sumber: h.sumber as string,
    tajuk: h.tajuk as string,
    teks: h.teks as string,
  }));
}

/** Untuk debug: berapa banyak ketul dalam pangkalan pengetahuan. */
export function statistik() {
  dapatkanIndeks();
  return { jumlahKetul: semuaKetul.length };
}
