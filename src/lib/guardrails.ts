/**
 * GUARDRAILS ASAS
 *
 * Nota: had kadar ini disimpan dalam memori server. Ia cukup untuk mula,
 * tetapi di Vercel setiap instance ada memori sendiri. Untuk produksi
 * (Minggu 5 dalam pelan), tukar kepada Upstash Redis.
 */
export const HAD_PANJANG_MESEJ = 3000; // cukup untuk menampal job description
export const HAD_SEJARAH = 10; // bilangan mesej terakhir yang dihantar kepada LLM
const HAD_SEJAM = 20; // mesej sejam bagi setiap IP

const rekod = new Map<string, number[]>();

export function semakHadKadar(ip: string): boolean {
  const kini = Date.now();
  const sejamLalu = kini - 60 * 60 * 1000;
  const masa = (rekod.get(ip) ?? []).filter((t) => t > sejamLalu);
  if (masa.length >= HAD_SEJAM) {
    rekod.set(ip, masa);
    return false;
  }
  masa.push(kini);
  rekod.set(ip, masa);
  return true;
}
