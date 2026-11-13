/**
 * PEMBURU KERJA HARIAN
 *
 * Aliran (setiap kerja < 10 saat supaya selamat dalam had masa serverless):
 *   1. mulaCarian()       → semak arahan hari ini (contoh "langkau LinkedIn"), jadualkan carian setiap jawatan
 *   2. cariSatuJawatan()  → JSearch → tapis sumber → buang yang pernah dilihat → simpan sebagai calon
 *   3. nilaiDanHantar()   → nilai calon berkelompok (LLM) → simpan rekod → hantar digest ke Telegram
 * Dengan QStash, langkah 2 & 3 berjalan sebagai kerja latar berasingan. Tanpa QStash, berjalan berturutan.
 */
import { bacaJSON, tulisJSON } from "@/lib/store";
import { bacaKeutamaan, sumberBerkuatKuasa } from "@/lib/data";
import { jadualkan, qstashDisetup } from "@/lib/qstash";
import { hantarMesej, type Papan } from "@/lib/telegram";
import { tarikhMY } from "@/lib/masa";
import type { KlienLLM } from "@/lib/agent/loop";
import { cariJSearch, jsearchDisetup, tapisIkutSumber, type IklanKerja } from "./jsearch";
import { nilaiBerkelompok } from "./padanan";
import { simpanRekod, sudahDilihat, type RekodKerja } from "./rekod";

const MAKS_DINILAI = 10;
const MAKS_DIGEST = 5;
const SKOR_MINIMUM = 40;

const kunciCalon = (tarikh: string) => `kerja-calon-${tarikh}`;

export async function mulaCarian(kini: Date = new Date(), llm?: KlienLLM): Promise<string> {
  if (!jsearchDisetup()) {
    await hantarMesej("🔎 Carian kerja belum aktif: `JSEARCH_API_KEY` belum ditetapkan di Netlify.");
    return "belum disetup";
  }
  const tarikh = tarikhMY(kini);
  const { langkau, sumber, sebab } = await sumberBerkuatKuasa(tarikh);
  if (langkau) {
    await hantarMesej(`🔎 Carian kerja hari ini dilangkau, ikut arahan anda: _${sebab.join("; ")}_`);
    return "dilangkau";
  }
  const k = await bacaKeutamaan();
  await tulisJSON(kunciCalon(tarikh), { sumber, sebab, calon: [] });

  if (qstashDisetup()) {
    for (const jawatan of k.jawatan.slice(0, 3)) await jadualkan("cari-kerja-jawatan", { jawatan, tarikh });
    await jadualkan("nilai-kerja", { tarikh }, { kelewatanSaat: 90 });
    return "dijadualkan";
  }
  for (const jawatan of k.jawatan.slice(0, 3)) await cariSatuJawatan(jawatan, tarikh);
  await nilaiDanHantar(tarikh, llm);
  return "selesai";
}

export async function cariSatuJawatan(jawatan: string, tarikh: string): Promise<number> {
  const keadaan = await bacaJSON<{ sumber: string[]; sebab: string[]; calon: IklanKerja[] }>(kunciCalon(tarikh), {
    sumber: [],
    sebab: [],
    calon: [],
  });
  const k = await bacaKeutamaan();
  const dilihat = await sudahDilihat();
  let iklan: IklanKerja[] = [];
  try {
    iklan = await cariJSearch(`${jawatan} in ${k.lokasi}`, { tempoh: "3days" });
  } catch (e) {
    console.error("[pemburu] JSearch gagal:", e);
    return 0;
  }
  const baru = tapisIkutSumber(iklan, keadaan.sumber).filter((x) => !dilihat.has(x.id));
  // Baca semula sebelum tulis (carian jawatan lain mungkin baru menulis)
  const terkini = await bacaJSON<typeof keadaan>(kunciCalon(tarikh), keadaan);
  const sedia = new Set(terkini.calon.map((c) => c.id));
  terkini.calon.push(...baru.filter((b) => !sedia.has(b.id)));
  await tulisJSON(kunciCalon(tarikh), terkini);
  return baru.length;
}

export function papanKerja(r: RekodKerja): Papan {
  const baris: Papan = [
    [
      { teks: "📝 Sediakan permohonan", data: `k:mohon:${r.id}` },
      { teks: "⭐ Simpan", data: `k:simpan:${r.id}` },
      { teks: "✖️ Abai", data: `k:abai:${r.id}` },
    ],
  ];
  if (r.pautan) baris.push([{ teks: `🔗 Buka iklan${r.penerbit ? ` (${r.penerbit})` : ""}`, url: r.pautan }]);
  return baris;
}

export function teksKerja(r: RekodKerja): string {
  const baris = [
    `**${r.tajuk}**`,
    `${r.syarikat}${r.lokasi ? ` · ${r.lokasi}` : ""}`,
    `Padanan: **${r.skor ?? "?"}%**${r.penerbit ? ` · ${r.penerbit}` : ""}`,
  ];
  if (r.sebab) baris.push(r.sebab);
  if (r.padan?.length) baris.push(`✅ ${r.padan.join(", ")}`);
  if (r.kurang?.length) baris.push(`⚠️ Kurang: ${r.kurang.join(", ")}`);
  return baris.join("\n");
}

export async function nilaiDanHantar(tarikh: string, llm?: KlienLLM): Promise<number> {
  const keadaan = await bacaJSON<{ sumber: string[]; sebab: string[]; calon: IklanKerja[] }>(kunciCalon(tarikh), {
    sumber: [],
    sebab: [],
    calon: [],
  });
  const calon = keadaan.calon.slice(0, MAKS_DINILAI);
  let nota = keadaan.sebab.length ? `\n_(Ikut arahan: ${keadaan.sebab.join("; ")})_` : "";
  if (!calon.length) {
    await hantarMesej(`🔎 Tiada iklan kerja baru yang sepadan hari ini.${nota}`);
    return 0;
  }

  let penilaian: Awaited<ReturnType<typeof nilaiBerkelompok>> = [];
  try {
    penilaian = await nilaiBerkelompok(calon, llm);
  } catch (e) {
    console.error("[pemburu] Penilaian gagal:", e);
  }
  const ikutId = new Map(penilaian.map((p) => [p.id, p]));
  const rekod: RekodKerja[] = calon.map((k) => {
    const p = ikutId.get(k.id);
    return {
      ...k,
      ...(p ? { skor: p.skor, sebab: p.sebab, padan: p.padan, kurang: p.kurang } : {}),
      status: "baru",
      dijumpai: new Date().toISOString(),
      emelHR: k.emel ?? null,
    };
  });
  for (const r of rekod) await simpanRekod(r);
  await tulisJSON(kunciCalon(tarikh), { ...keadaan, calon: [] });

  // Jika penilaian AI gagal (contoh had Groq), tetap tunjuk iklan terbaru tanpa skor
  const terbaik = penilaian.length
    ? rekod
        .filter((r) => (r.skor ?? 0) >= SKOR_MINIMUM)
        .sort((a, b) => (b.skor ?? 0) - (a.skor ?? 0))
        .slice(0, MAKS_DIGEST)
    : rekod.slice(0, MAKS_DIGEST);
  if (!penilaian.length) nota += "\n_(Penilaian AI tidak tersedia buat masa ini; iklan dipaparkan tanpa skor.)_";
  await hantarMesej(
    `🔎 **Carian kerja ${tarikh}:** ${rekod.length} iklan baru dinilai, ${terbaik.length} paling sepadan di bawah.${nota}`,
  );
  for (const r of terbaik) await hantarMesej(teksKerja(r), { papan: papanKerja(r) });
  return terbaik.length;
}
