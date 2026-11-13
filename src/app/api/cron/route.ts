/**
 * CRON: GET /api/cron?kunci=AGENT_SECRET
 * Dipanggil setiap 15 minit oleh cron-job.org (percuma).
 * Semua logik dalam jadualBerkala(): briefing pagi, carian kerja, laporan malam,
 * semakan inbox, segerak GitHub, amaran deadline dan sandaran peringatan.
 */
import { rahsiaSah } from "@/lib/rahsia";
import { jadualBerkala } from "@/lib/kerja";

export async function GET(req: Request) {
  if (!rahsiaSah(new URL(req.url).searchParams.get("kunci"))) {
    return Response.json({ ralat: "Tidak dibenarkan" }, { status: 401 });
  }
  try {
    return Response.json({ masa: new Date().toISOString(), ...(await jadualBerkala()) });
  } catch (e) {
    console.error("[api/cron]", e);
    return Response.json({ ralat: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
