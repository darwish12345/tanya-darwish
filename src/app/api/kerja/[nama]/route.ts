/**
 * KERJA LATAR: POST /api/kerja/<nama>
 * Dipanggil oleh Upstash QStash pada masa yang dijadualkan (contoh peringatan tepat pada minit).
 * Dilindungi dengan header X-Kunci (= AGENT_SECRET, dihantar semula oleh QStash).
 * Jika kerja gagal, kita pulangkan 500 supaya QStash mencuba semula secara automatik.
 */
import { rahsiaSah } from "@/lib/rahsia";
import { jalankanKerja, KERJA_LATAR } from "@/lib/kerja";

export async function POST(req: Request, ctx: { params: Promise<{ nama: string }> }) {
  if (!rahsiaSah(req.headers.get("x-kunci"))) return new Response("Tidak dibenarkan", { status: 401 });
  const { nama } = await ctx.params;
  if (!KERJA_LATAR[nama]) return Response.json({ ralat: `Kerja '${nama}' tidak wujud` }, { status: 404 });
  const data = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const hasil = await jalankanKerja(nama, data);
    return Response.json({ ok: true, hasil: typeof hasil === "object" ? hasil : String(hasil ?? "") });
  } catch (e) {
    return Response.json({ ok: false, ralat: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
