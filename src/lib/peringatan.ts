/**
 * ENJIN PERINGATAN
 * - Masa dikira oleh KOD (bukan LLM): LLM hanya beri "selepas 5 minit" atau "2026-11-14 07:00".
 * - Dijadualkan TEPAT dengan QStash; cron hanya sandaran jika QStash gagal / tidak disetup.
 * - Peringatan berulang: selepas dihantar, kejadian seterusnya dijadualkan secara automatik.
 */
import {
  tambahPeringatan,
  kemasPeringatan,
  bacaPeringatan,
  type Peringatan,
  type Ulangan,
} from "@/lib/data";
import { jadualkan } from "@/lib/qstash";
import { hantarMesej, type Papan } from "@/lib/telegram";
import { gabungMY, hariMingguMY, tarikhMY, tambahHari, paparPendekMY, NAMA_HARI } from "@/lib/masa";

/** Kejadian seterusnya bagi peringatan berulang, selepas masa `dari`. */
export function masaSeterusnya(ulang: Ulangan, dari: Date): Date | null {
  const hariIni = tarikhMY(dari);
  for (let n = 0; n <= 8; n++) {
    const tarikh = tambahHari(hariIni, n);
    const d = gabungMY(tarikh, ulang.jam);
    if (!d || d.getTime() <= dari.getTime()) continue;
    if (ulang.jenis === "harian") return d;
    const hari = hariMingguMY(d);
    if (ulang.hari?.includes(hari)) return d;
  }
  return null;
}

export function terangkanUlangan(u?: Ulangan): string {
  if (!u) return "";
  if (u.jenis === "harian") return `setiap hari ${u.jam}`;
  return `setiap ${(u.hari ?? []).map((h) => NAMA_HARI[h]).join(", ")} ${u.jam}`;
}

/** Jadualkan penghantaran tepat melalui QStash (jika tersedia). */
async function jadualkanPenghantaran(p: Peringatan): Promise<void> {
  const qstashId = await jadualkan("hantar-peringatan", { id: p.id }, { padaMasa: new Date(p.masa) });
  if (qstashId) await kemasPeringatan(p.id, { qstashId });
}

export async function ciptaPeringatan(masa: Date, teks: string, ulang?: Ulangan): Promise<Peringatan> {
  const p = await tambahPeringatan(masa, teks, ulang);
  await jadualkanPenghantaran(p);
  return p;
}

export function butangPeringatan(id: string): Papan {
  return [
    [
      { teks: "⏰ Tunda 10 min", data: `p:tunda:${id}` },
      { teks: "✅ Selesai", data: `p:siap:${id}` },
    ],
  ];
}

/**
 * Hantar satu peringatan jika sudah tiba masanya dan masih aktif.
 * Selamat dipanggil berulang kali (QStash + cron): hanya dihantar SEKALI (idempotent).
 */
export async function hantarPeringatan(id: string, kini: Date = new Date()): Promise<"dihantar" | "dilangkau" | "gagal"> {
  const p = (await bacaPeringatan()).find((x) => x.id === id);
  if (!p || p.status !== "aktif") return "dilangkau";
  if (new Date(p.masa).getTime() > kini.getTime() + 60_000) return "dilangkau"; // terlalu awal (masa telah diubah)

  const ulangTeks = p.ulang ? `\n_(${terangkanUlangan(p.ulang)})_` : "";
  const ok = await hantarMesej(`⏰ **Peringatan:** ${p.teks}${ulangTeks}`, { papan: butangPeringatan(p.id) });
  if (ok === null) return "gagal";

  await kemasPeringatan(p.id, { status: "dihantar" });
  if (p.ulang) {
    const seterusnya = masaSeterusnya(p.ulang, new Date(Math.max(kini.getTime(), new Date(p.masa).getTime())));
    if (seterusnya) await ciptaPeringatan(seterusnya, p.teks, p.ulang);
  }
  return "dihantar";
}

/** Tunda peringatan `minit` minit dari sekarang. */
export async function tundaPeringatan(id: string, minit: number): Promise<Peringatan | null> {
  const masa = new Date(Date.now() + minit * 60_000);
  const p = await kemasPeringatan(id, { masa: masa.toISOString(), status: "aktif" });
  if (p) await jadualkanPenghantaran(p);
  return p;
}

export async function senaraiAktif(): Promise<Peringatan[]> {
  return (await bacaPeringatan()).filter((p) => p.status === "aktif").sort((a, b) => a.masa.localeCompare(b.masa));
}

export function barisPeringatan(p: Peringatan): string {
  const ulang = p.ulang ? ` (${terangkanUlangan(p.ulang)})` : "";
  return `${paparPendekMY(new Date(p.masa))}: ${p.teks}${ulang}`;
}
