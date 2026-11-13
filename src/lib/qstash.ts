/**
 * BARISAN KERJA (job queue) dengan Upstash QStash.
 *
 * Daripada menyemak setiap 5 minit (polling), kita minta QStash memanggil
 * /api/kerja/<nama> TEPAT pada masa yang ditetapkan. QStash juga mencuba semula
 * secara automatik jika server kita gagal.
 *
 * Tanpa QSTASH_TOKEN (laptop/ujian), jadualkan() memulangkan null dan cron menjadi sandaran.
 */
import { laman } from "@/lib/laman";

export function qstashDisetup(): boolean {
  return Boolean(process.env.QSTASH_TOKEN?.trim());
}

export type OpsyenJadual = { padaMasa?: Date; kelewatanSaat?: number; percubaan?: number };

/** Jadualkan kerja latar. Pulangkan messageId, atau null jika QStash tidak disetup / gagal. */
export async function jadualkan(
  nama: string,
  data: Record<string, unknown> = {},
  opsyen: OpsyenJadual = {},
): Promise<string | null> {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) return null;

  const asas = (process.env.QSTASH_URL || "https://qstash.upstash.io").replace(/\/$/, "");
  const destinasi = `${laman()}/api/kerja/${nama}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    // Dihantar semula kepada endpoint kita sebagai "X-Kunci" (bukti permintaan datang dari kita)
    "Upstash-Forward-X-Kunci": process.env.AGENT_SECRET?.trim() ?? "",
    "Upstash-Retries": String(opsyen.percubaan ?? 3),
  };
  if (opsyen.padaMasa) headers["Upstash-Not-Before"] = String(Math.floor(opsyen.padaMasa.getTime() / 1000));
  else if (opsyen.kelewatanSaat) headers["Upstash-Delay"] = `${Math.max(0, Math.round(opsyen.kelewatanSaat))}s`;

  try {
    const res = await fetch(`${asas}/v2/publish/${destinasi}`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      console.error("[qstash] Gagal jadualkan", nama, res.status, await res.text());
      return null;
    }
    const d = (await res.json()) as { messageId?: string };
    return d.messageId ?? null;
  } catch (e) {
    console.error("[qstash] Rangkaian gagal:", e);
    return null;
  }
}
