/**
 * Pembersih output LLM sebelum dihantar kepada pengguna.
 * Model kadang-kadang menghasilkan beribu aksara halimunan (zero-width) atau teks berulang.
 */
const HALIMUNAN = /[\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF]/g;

export function bersihkanOutput(teks: string): string {
  let t = teks.replace(HALIMUNAN, "");
  t = t.replace(/(.)\1{15,}/g, "$1$1$1"); // aksara sama berulang >15 kali
  t = t.replace(/(\S{2,20}?)\1{6,}/g, "$1"); // corak pendek berulang
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  // ** yang tidak berpasangan menyebabkan format rosak
  if ((t.match(/\*\*/g)?.length ?? 0) % 2 === 1) t = t.replace(/\*\*(?![\s\S]*\*\*)/, "");
  return t;
}

/** Pecah teks kepada baris dengan lebar maksimum (untuk PDF). */
export function balutBaris(teks: string, lebarMaks: number, ukur: (s: string) => number): string[] {
  const hasil: string[] = [];
  for (const perenggan of teks.split("\n")) {
    const perkataan = perenggan.split(/\s+/).filter(Boolean);
    let baris = "";
    for (const p of perkataan) {
      const cuba = baris ? `${baris} ${p}` : p;
      if (ukur(cuba) <= lebarMaks) baris = cuba;
      else {
        if (baris) hasil.push(baris);
        baris = p;
      }
    }
    hasil.push(baris);
  }
  return hasil;
}

/** Normalkan teks untuk fon PDF standard (WinAnsi): petik pintar, sengkang, simbol khas. */
export function keAnsi(teks: string): string {
  return teks
    .replace(HALIMUNAN, "")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•●▪]/g, "-")
    .replace(/ /g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ]/g, "");
}

/** Cari alamat emel dalam teks (contoh: iklan kerja). */
export function cariEmel(teks: string): string | null {
  const m = teks.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0] : null;
}

// ── Padanan kata kunci untuk rujukan semula jadi ("peringatan minum air tu" → "Minum air") ──
const KATA_ABAI = new Set(
  "yang tu itu ni ini saya aku je sahaja la lah tolong please the a an my to for of and dan untuk pada di ke kat dengan peringatan reminder tugasan task arahan instruction pengetahuan batal batalkan cancel padam delete buang remove hapus tadi semalam".split(" "),
);
const kataPenting = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !KATA_ABAI.has(w));

/**
 * Cari item yang sepadan dengan rujukan bebas. Keutamaan: id tepat → semua kata penting ada →
 * mana-mana kata penting ada. Pulangkan senarai kosong jika tiada langsung.
 */
export function cariPadanan<T extends { id: string }>(senarai: T[], rujukan: string, teksDari: (x: T) => string): T[] {
  const r = rujukan.trim();
  const ikutId = senarai.filter((x) => x.id === r);
  if (ikutId.length) return ikutId;
  const kata = kataPenting(r);
  if (!kata.length) return [];
  const teks = senarai.map((x) => ({ x, t: ` ${kataPenting(teksDari(x)).join(" ")} ` }));
  const semua = teks.filter(({ t }) => kata.every((k) => t.includes(` ${k}`)));
  if (semua.length) return semua.map(({ x }) => x);
  return teks.filter(({ t }) => kata.some((k) => t.includes(` ${k}`))).map(({ x }) => x);
}
