/**
 * PENJANA PDF MESRA ATS
 * Sistem ATS (Applicant Tracking System) membaca resume sebagai teks. Jadi:
 *   satu lajur, tajuk bahagian standard, fon standard, tiada jadual/gambar/ikon.
 * pdf-lib ialah JavaScript tulen (tiada fail fon luaran), sesuai untuk serverless.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { balutBaris, keAnsi } from "@/lib/teks";
import type { ResumeInduk, Pengalaman, Projek } from "./profil";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const HITAM = rgb(0.1, 0.1, 0.1);
const KELABU = rgb(0.35, 0.35, 0.35);

class Penulis {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    public biasa: PDFFont,
    public tebal: PDFFont,
  ) {
    this.halamanBaru();
  }
  get lebar() {
    return A4[0] - MARGIN * 2;
  }
  halamanBaru() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }
  pastikanRuang(tinggi: number) {
    if (this.y - tinggi < MARGIN) this.halamanBaru();
  }
  teks(teks: string, opsyen: { saiz?: number; tebal?: boolean; warna?: ReturnType<typeof rgb>; inden?: number; jarak?: number } = {}) {
    const saiz = opsyen.saiz ?? 10;
    const font = opsyen.tebal ? this.tebal : this.biasa;
    const inden = opsyen.inden ?? 0;
    const baris = balutBaris(keAnsi(teks), this.lebar - inden, (s) => font.widthOfTextAtSize(s, saiz));
    for (const b of baris) {
      this.pastikanRuang(saiz + 3);
      this.page.drawText(b, { x: MARGIN + inden, y: this.y - saiz, size: saiz, font, color: opsyen.warna ?? HITAM });
      this.y -= saiz + (opsyen.jarak ?? 3);
    }
  }
  poin(teks: string) {
    const saiz = 10;
    this.pastikanRuang(saiz + 3);
    this.page.drawText("-", { x: MARGIN + 4, y: this.y - saiz, size: saiz, font: this.biasa, color: HITAM });
    this.teks(teks, { inden: 14 });
  }
  tajukBahagian(t: string) {
    this.ruang(8);
    this.pastikanRuang(30);
    this.teks(t.toUpperCase(), { saiz: 11, tebal: true, jarak: 2 });
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4[0] - MARGIN, y: this.y },
      thickness: 0.6,
      color: KELABU,
    });
    this.ruang(6);
  }
  ruang(n: number) {
    this.y -= n;
  }
}

async function dokumen() {
  const doc = await PDFDocument.create();
  const biasa = await doc.embedFont(StandardFonts.Helvetica);
  const tebal = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, p: new Penulis(doc, biasa, tebal) };
}

export type ResumeKhas = {
  ringkasan: string;
  kemahiran: string[];
  pengalaman: Pengalaman[];
  projek: Projek[];
};

export async function janaResumePDF(induk: ResumeInduk, khas: ResumeKhas): Promise<Uint8Array> {
  const { doc, p } = await dokumen();
  doc.setTitle(`${induk.nama} - Resume`);
  doc.setAuthor(induk.nama);

  p.teks(induk.nama, { saiz: 18, tebal: true, jarak: 4 });
  p.teks(induk.tajuk, { saiz: 11, warna: KELABU, jarak: 4 });
  const hubungan = [induk.hubungan.emel, induk.hubungan.telefon, induk.hubungan.lokasi, ...Object.values(induk.pautan)]
    .filter(Boolean)
    .join("  |  ");
  if (hubungan) p.teks(hubungan, { saiz: 9, warna: KELABU });

  p.tajukBahagian("Summary");
  p.teks(khas.ringkasan);

  if (khas.kemahiran.length) {
    p.tajukBahagian("Skills");
    p.teks(khas.kemahiran.join(", "));
  }

  if (khas.pengalaman.length) {
    p.tajukBahagian("Experience");
    for (const e of khas.pengalaman) {
      p.teks(`${e.tajuk} - ${e.organisasi}`, { tebal: true, jarak: 2 });
      if (e.tempoh) p.teks(e.tempoh, { saiz: 9, warna: KELABU });
      for (const b of e.poin) p.poin(b);
      p.ruang(4);
    }
  }

  if (khas.projek.length) {
    p.tajukBahagian("Projects");
    for (const pr of khas.projek) {
      p.teks(pr.nama, { tebal: true, jarak: 2 });
      const meta = [pr.tech.join(", "), pr.pautan].filter(Boolean).join("  |  ");
      if (meta) p.teks(meta, { saiz: 9, warna: KELABU });
      for (const b of pr.poin) p.poin(b);
      p.ruang(4);
    }
  }

  if (induk.pendidikan.length) {
    p.tajukBahagian("Education");
    for (const e of induk.pendidikan) {
      p.teks(`${e.kelayakan} - ${e.institusi}`, { tebal: true, jarak: 2 });
      if (e.tempoh || e.nota) p.teks([e.tempoh, e.nota].filter(Boolean).join("  |  "), { saiz: 9, warna: KELABU });
    }
  }

  if (induk.sijil.length) {
    p.tajukBahagian("Certifications");
    for (const s of induk.sijil) p.poin([s.nama, s.penerbit, s.tarikh].filter(Boolean).join(" - "));
  }
  return doc.save();
}

export async function janaCoverLetterPDF(induk: ResumeInduk, kandungan: string, tarikh: string): Promise<Uint8Array> {
  const { doc, p } = await dokumen();
  doc.setTitle(`${induk.nama} - Cover Letter`);
  p.teks(induk.nama, { saiz: 16, tebal: true, jarak: 4 });
  const hubungan = [induk.hubungan.emel, induk.hubungan.telefon, induk.pautan.portfolio].filter(Boolean).join("  |  ");
  if (hubungan) p.teks(hubungan, { saiz: 9, warna: KELABU });
  p.ruang(16);
  p.teks(tarikh, { warna: KELABU });
  p.ruang(10);
  for (const perenggan of kandungan.split(/\n{2,}/)) {
    p.teks(perenggan.trim(), { saiz: 11, jarak: 4 });
    p.ruang(8);
  }
  return doc.save();
}
