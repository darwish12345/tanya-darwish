/**
 * CRON: GET /api/cron?kunci=AGENT_SECRET
 * Dipanggil setiap 5 minit oleh cron-job.org (percuma).
 *   - Hantar peringatan yang sudah tiba masanya
 *   - Hantar laporan harian sekali sehari selepas 21:00 waktu Malaysia
 * (Fasa 2: carian kerja harian pada 08:00 akan ditambah di sini.)
 */
import { rahsiaSah } from "@/lib/rahsia";
import { peringatanTiba, tandaDihantar, bacaStatus, kemasStatus } from "@/lib/data";
import { hantarTelegram } from "@/lib/telegram";
import { binaLaporan } from "@/lib/laporan";
import { jamMY, tarikhMY } from "@/lib/masa";

const JAM_LAPORAN = 21;

export async function GET(req: Request) {
  if (!rahsiaSah(new URL(req.url).searchParams.get("kunci"))) {
    return Response.json({ ralat: "Tidak dibenarkan" }, { status: 401 });
  }

  const kini = new Date();
  const hasil: Record<string, unknown> = { masa: kini.toISOString() };

  // 1. Peringatan
  const tiba = await peringatanTiba(kini);
  const berjaya: string[] = [];
  for (const p of tiba) {
    if (await hantarTelegram(`⏰ **Peringatan:** ${p.teks}`)) berjaya.push(p.id);
  }
  if (berjaya.length) await tandaDihantar(berjaya); // yang gagal akan dicuba semula 5 minit kemudian
  hasil.peringatan = { tiba: tiba.length, dihantar: berjaya.length };

  // 2. Laporan harian
  const hariIni = tarikhMY(kini);
  const status = await bacaStatus();
  if (jamMY(kini) >= JAM_LAPORAN && status.laporanTerakhir !== hariIni) {
    const ok = await hantarTelegram(await binaLaporan(hariIni));
    if (ok) await kemasStatus({ laporanTerakhir: hariIni });
    hasil.laporan = ok ? "dihantar" : "gagal (akan dicuba semula)";
  }

  return Response.json(hasil);
}
