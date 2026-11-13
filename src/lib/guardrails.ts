/**
 * GUARDRAILS ASAS untuk agent web awam.
 *
 * Had kadar disimpan dalam Upstash Redis (INCR atomik), jadi ia tepat walaupun Netlify menjalankan
 * banyak salinan server serentak. Tiga lapisan:
 *  1. Setiap IP sejam      → halang seorang pelawat spam
 *  2. Setiap IP sehari     → halang skrip yang berjalan perlahan sepanjang hari
 *  3. Semua pelawat sehari → lindungi kuota HARIAN Groq percuma supaya agent peribadi Darwish
 *                            (Telegram, carian kerja) masih berfungsi walaupun laman diserang.
 */
import { createHash } from "node:crypto";
import { kira } from "@/lib/store";
import { tarikhMY } from "@/lib/masa";

export const HAD_PANJANG_MESEJ = 3000; // cukup untuk menampal job description
export const HAD_SEJARAH = 10; // bilangan mesej terakhir yang dihantar kepada LLM

const HAD_IP_SEJAM = 20;
const HAD_IP_SEHARI = 60;
const HAD_WEB_SEHARI = () => Number(process.env.HAD_WEB_SEHARI || 120);

export type KeputusanHad = { ok: true } | { ok: false; mesej: string };

// IP tidak disimpan mentah (privasi): hanya cincangan pendek
const cincang = (ip: string) => createHash("sha256").update(`td:${ip}`).digest("hex").slice(0, 16);

export async function semakHadKadar(ip: string): Promise<KeputusanHad> {
  const id = cincang(ip);
  const hari = tarikhMY();
  try {
    const [sejam, sehari, global] = await Promise.all([
      kira(`had-ip-j-${id}`, 3600),
      kira(`had-ip-h-${id}-${hari}`, 86400),
      kira(`had-web-${hari}`, 86400),
    ]);
    if (sejam > HAD_IP_SEJAM || sehari > HAD_IP_SEHARI) {
      return { ok: false, mesej: "Terlalu banyak mesej. Cuba lagi kemudian, atau tinggalkan mesej untuk Darwish." };
    }
    if (global > HAD_WEB_SEHARI()) {
      return { ok: false, mesej: "Agent sudah mencapai had harian percuma. Cuba lagi esok, atau hubungi Darwish melalui LinkedIn." };
    }
    return { ok: true };
  } catch (e) {
    // Storan gagal: jangan halang pelawat sebenar (gagal-terbuka), tetapi rekod ralat
    console.error("[guardrails] Had kadar tidak dapat disemak:", e);
    return { ok: true };
  }
}

/**
 * Bersihkan teks bebas dari pelawat sebelum dimasukkan ke emel / notifikasi:
 * buang pautan, aksara kawalan dan simbol pelik supaya medan seperti "nama" tidak boleh
 * digunakan untuk menghantar spam atau pautan pancingan dari Gmail Darwish.
 */
export function bersihkanTeksPelawat(s: string, had = 80): string {
  return s
    .replace(/https?:\/\/\S+|www\.\S+|\b\S+\.(com|net|org|io|xyz|ru|cn|ly|me|co)\b\S*/gi, "")
    .replace(/[\p{C}<>{}[\]\\|`^~*_#=]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, had);
}

/** Nama yang munasabah: huruf (pelbagai bahasa), ruang, titik, sengkang, apostrof. */
export function namaSah(s: string): boolean {
  return /^[\p{L}][\p{L}\p{M} .'’@-]{0,79}$/u.test(s.trim()) && !/https?:|www\.|\.(com|net|org|io)\b/i.test(s);
}
