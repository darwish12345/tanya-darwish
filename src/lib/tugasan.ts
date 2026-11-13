/**
 * MODUL TUGASAN: perkara yang perlu DISIAPKAN (berbeza dengan peringatan yang hanya mengingatkan).
 * Agent bertindak PROAKTIF: amaran 24 jam sebelum deadline dan bila deadline terlepas.
 */
import { bacaTugasan, kemasTugasan, type Tugasan } from "@/lib/data";
import { hantarMesej, type Papan } from "@/lib/telegram";
import { paparPendekMY } from "@/lib/masa";

export function butangTugasan(id: string): Papan {
  return [[{ teks: "✅ Tanda siap", data: `t:siap:${id}` }]];
}

export function barisTugasan(t: Tugasan, kini: Date = new Date()): string {
  const bendera = t.keutamaan === "tinggi" ? "🔴 " : "";
  if (!t.deadline) return `${bendera}${t.tajuk}`;
  const lewat = new Date(t.deadline) < kini ? " ⚠️ LEWAT" : "";
  return `${bendera}${t.tajuk} (deadline ${paparPendekMY(new Date(t.deadline))})${lewat}`;
}

/** Susun: lewat dahulu, kemudian deadline terdekat, kemudian keutamaan tinggi, kemudian tanpa deadline. */
export function susunTugasan(senarai: Tugasan[]): Tugasan[] {
  return [...senarai].sort((a, b) => {
    const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    if (da !== db) return da - db;
    return (a.keutamaan === "tinggi" ? 0 : 1) - (b.keutamaan === "tinggi" ? 0 : 1);
  });
}

export async function tugasanBelum(): Promise<Tugasan[]> {
  return susunTugasan((await bacaTugasan()).filter((t) => t.status === "belum"));
}

/** Dipanggil oleh cron: hantar amaran deadline (sekali sahaja bagi setiap jenis amaran). */
export async function semakAmaranTugasan(kini: Date = new Date()): Promise<number> {
  let dihantar = 0;
  for (const t of await tugasanBelum()) {
    if (!t.deadline) continue;
    const baki = new Date(t.deadline).getTime() - kini.getTime();
    if (baki < 0 && !t.amaran?.lewat) {
      if ((await hantarMesej(`⚠️ **Deadline terlepas:** ${t.tajuk}\nDah siap? Tekan butang di bawah, atau beritahu saya deadline baru.`, { papan: butangTugasan(t.id) })) !== null) {
        await kemasTugasan(t.id, { amaran: { ...t.amaran, lewat: true, sehari: true } });
        dihantar++;
      }
    } else if (baki > 0 && baki <= 24 * 3600_000 && !t.amaran?.sehari) {
      if ((await hantarMesej(`📌 **Deadline dalam 24 jam:** ${t.tajuk}\n(${paparPendekMY(new Date(t.deadline))})`, { papan: butangTugasan(t.id) })) !== null) {
        await kemasTugasan(t.id, { amaran: { ...t.amaran, sehari: true } });
        dihantar++;
      }
    }
  }
  return dihantar;
}
