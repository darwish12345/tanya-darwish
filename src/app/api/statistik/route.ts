/**
 * STATISTIK AWAM: GET /api/statistik
 * Angka penggunaan agent untuk 30 hari terakhir. TIADA data peribadi: tiada teks soalan, tiada nama,
 * tiada emel. Dicache di CDN Netlify selama 10 minit supaya tidak membebankan storan / fungsi.
 */
import { connection } from "next/server";
import { bacaLogHari, bacaLeads } from "@/lib/data";
import { bacaIndeks } from "@/lib/kerjaya/rekod";
import { tarikhMY, tambahHari } from "@/lib/masa";
import { statistik as statistikPengetahuan } from "@/lib/rag/knowledge";
import keputusanEval from "../../../../evals/keputusan-terkini.json";

const HARI = 30;

export async function GET() {
  await connection(); // sentiasa dijalankan semasa permintaan (bukan semasa build)
  const hariIni = tarikhMY();
  const tarikh = Array.from({ length: HARI }, (_, i) => tambahHari(hariIni, i - (HARI - 1)));
  const log = await Promise.all(tarikh.map((t) => bacaLogHari(t).catch(() => [])));

  const harian = tarikh.map((t, i) => ({ tarikh: t, soalan: log[i].length }));
  const semua = log.flat();
  const tools: Record<string, number> = {};
  for (const l of semua) for (const t of new Set(l.tools)) tools[t] = (tools[t] ?? 0) + 1;
  const gagal = semua.filter((l) => l.tiadaJawapan).length;

  const sebulanLalu = Date.now() - HARI * 86400_000;
  const leads = (await bacaLeads().catch(() => [])).filter((l) => new Date(l.masa).getTime() > sebulanLalu);
  const kerja = await bacaIndeks().catch(() => []);

  const badan = {
    dikemaskini: new Date().toISOString(),
    tempohHari: HARI,
    jumlahSoalan: semua.length,
    kadarTiadaJawapan: semua.length ? gagal / semua.length : 0,
    harian,
    tools: Object.entries(tools)
      .map(([nama, bilangan]) => ({ nama, bilangan }))
      .sort((a, b) => b.bilangan - a.bilangan),
    leads: leads.length,
    kerjaya: {
      iklanDinilai: kerja.length,
      dimohon: kerja.filter((k) => ["dihantar", "dimohon_manual", "interview", "tawaran", "ditolak"].includes(k.status)).length,
    },
    pengetahuan: await statistikPengetahuan().catch(() => ({ jumlahKetul: 0 })),
    eval: keputusanEval,
  };
  return Response.json(badan, {
    headers: { "Cache-Control": "public, max-age=60", "Netlify-CDN-Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
  });
}
