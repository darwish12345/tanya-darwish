/**
 * PEMBURU KERJA
 *
 * Aliran (setiap kerja < 10 saat supaya selamat dalam had masa serverless):
 *   1. mulaCarian()       → semak arahan hari ini (contoh "langkau LinkedIn"), cipta satu "larian", jadualkan carian setiap jawatan
 *   2. cariSatuJawatan()  → JSearch → tapis sumber & fresh grad → simpan calon (senarai atomik) + statistik penapis
 *   3. nilaiDanHantar()   → nilai calon berkelompok (LLM) → simpan rekod → hantar digest ke Telegram
 * Dengan QStash, langkah 2 & 3 berjalan sebagai kerja latar berasingan. Tanpa QStash, berjalan berturutan.
 *
 * Carian harian automatik: hanya iklan BARU (belum pernah dihantar). Carian manual ("cari kerja sekarang"):
 * iklan yang pernah dilihat juga dipaparkan semula, supaya Darwish sentiasa dapat senarai.
 * Iklan tidak terhad kepada hari ini: sehingga sebulan lepas, dengan tarikh siar dipaparkan.
 */
import { bacaJSON, tulisJSON, tambahKeSenarai, bacaSenarai } from "@/lib/store";
import { bacaKeutamaan, sumberBerkuatKuasa } from "@/lib/data";
import { jadualkan, qstashDisetup } from "@/lib/qstash";
import { hantarMesej, type Papan } from "@/lib/telegram";
import { tarikhMY } from "@/lib/masa";
import type { KlienLLM } from "@/lib/agent/loop";
import { cariJSearch, jsearchDisetup, tapisIkutSumber, sesuaiFreshGrad, type IklanKerja } from "./jsearch";
import { nilaiBerkelompok } from "./padanan";
import { simpanRekod, bacaRekod, bacaIndeks, type RekodKerja } from "./rekod";

const MAKS_DINILAI = 6; // kecil supaya penilaian siap dalam had masa fungsi Netlify (~10 s)
const MAKS_DIGEST = 5;
const SKOR_MINIMUM = 40;
const TEMPOH_IKLAN = "month" as const; // tidak terhad kepada iklan hari ini

type Larian = { id: string; tarikh: string; manual: boolean; sumber: string[]; sebab: string[] };
type Statistik = { jawatan: string; mentah: number; bukanSumber: number; bukanFresh: number; pernahDilihat: number; diterima: number; ralat?: string };

const kunciLarian = (id: string) => `kerja-larian-${id}`;
const kunciCalon = (id: string) => `kerja-calon-${id}`;
const kunciStat = (id: string) => `kerja-stat-${id}`;

export async function mulaCarian(kini: Date = new Date(), llm?: KlienLLM, opsyen: { manual?: boolean } = {}): Promise<string> {
  if (!jsearchDisetup()) {
    await hantarMesej("🔎 Carian kerja belum aktif: `JSEARCH_API_KEY` belum ditetapkan di Netlify.");
    return "belum disetup";
  }
  const tarikh = tarikhMY(kini);
  const { langkau, sumber, sebab } = await sumberBerkuatKuasa(tarikh);
  if (langkau && !opsyen.manual) {
    await hantarMesej(`🔎 Carian kerja hari ini dilangkau, ikut arahan anda: _${sebab.join("; ")}_`);
    return "dilangkau";
  }
  const k = await bacaKeutamaan();
  const larian: Larian = { id: `${tarikh}-${kini.getTime().toString(36)}`, tarikh, manual: Boolean(opsyen.manual), sumber, sebab };
  await tulisJSON(kunciLarian(larian.id), larian);

  const jawatan = k.jawatan.slice(0, 4);
  if (qstashDisetup()) {
    for (const j of jawatan) await jadualkan("cari-kerja-jawatan", { jawatan: j, larian: larian.id });
    await jadualkan("nilai-kerja", { larian: larian.id }, { kelewatanSaat: 60 });
    return "dijadualkan";
  }
  for (const j of jawatan) await cariSatuJawatan(j, larian.id);
  await nilaiDanHantar(larian.id, llm);
  return "selesai";
}

export async function cariSatuJawatan(jawatan: string, idLarian: string): Promise<number> {
  const larian = await bacaJSON<Larian | null>(kunciLarian(idLarian), null);
  if (!larian) return 0;
  const k = await bacaKeutamaan();
  const stat: Statistik = { jawatan, mentah: 0, bukanSumber: 0, bukanFresh: 0, pernahDilihat: 0, diterima: 0 };
  try {
    const iklan = await cariJSearch(`${jawatan} in ${k.lokasi}`, { tempoh: TEMPOH_IKLAN });
    stat.mentah = iklan.length;
    const ikutSumber = tapisIkutSumber(iklan, larian.sumber);
    stat.bukanSumber = iklan.length - ikutSumber.length;
    const fresh = ikutSumber.filter(sesuaiFreshGrad);
    stat.bukanFresh = ikutSumber.length - fresh.length;
    // Carian automatik: buang yang pernah dihantar. Carian manual: kekalkan kecuali yang diabaikan/dihantar.
    const indeks = await bacaIndeks();
    const status = new Map(indeks.map((x) => [x.id, x.status]));
    const layak = fresh.filter((x) => {
      const s = status.get(x.id);
      if (!s) return true;
      if (larian.manual) return !["diabaikan", "dihantar", "dimohon_manual", "ditolak"].includes(s);
      return false;
    });
    stat.pernahDilihat = fresh.length - layak.length;
    stat.diterima = layak.length;
    // Senarai atomik (RPUSH): carian jawatan lain yang berjalan serentak tidak menindih calon ini
    for (const x of layak) await tambahKeSenarai(kunciCalon(idLarian), x, 200);
  } catch (e) {
    stat.ralat = (e instanceof Error ? e.message : String(e)).slice(0, 160);
    console.error("[pemburu] JSearch gagal:", e);
  }
  await tambahKeSenarai(kunciStat(idLarian), stat, 20);
  return stat.diterima;
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

/** "hari ini", "semalam", "5 hari lalu" */
export function umurIklan(iso?: string, kini: Date = new Date()): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const hari = Math.floor((kini.getTime() - t.getTime()) / 86400_000);
  if (hari <= 0) return "hari ini";
  if (hari === 1) return "semalam";
  return `${hari} hari lalu`;
}

export function teksKerja(r: RekodKerja): string {
  const umur = umurIklan(r.tarikhSiar);
  const baris = [
    `**${r.tajuk}**`,
    `${r.syarikat}${r.lokasi ? ` · ${r.lokasi}` : ""}`,
    `Padanan: **${r.skor ?? "?"}%**${r.penerbit ? ` · ${r.penerbit}` : ""}${umur ? ` · 📅 ${umur}` : ""}`,
  ];
  if (r.sebab) baris.push(r.sebab);
  if (r.padan?.length) baris.push(`✅ ${r.padan.join(", ")}`);
  if (r.kurang?.length) baris.push(`⚠️ Kurang: ${r.kurang.join(", ")}`);
  return baris.join("\n");
}

/** Terangkan kenapa tiada hasil, dengan angka sebenar (bukan sekadar "tiada iklan"). */
function teksSebabKosong(stat: Statistik[], larian: Larian): string {
  const jumlah = (f: keyof Statistik) => stat.reduce((a, s) => a + (typeof s[f] === "number" ? (s[f] as number) : 0), 0);
  const ralat = stat.filter((s) => s.ralat);
  const baris = ["🔎 **Tiada kerja yang sesuai untuk dipaparkan.**"];
  if (ralat.length) baris.push(`⚠️ Carian gagal untuk ${ralat.length}/${stat.length} jawatan: _${ralat[0].ralat}_`);
  if (stat.length) {
    baris.push(
      `Dijumpai ${jumlah("mentah")} iklan (sebulan lepas): ${jumlah("bukanSumber")} bukan dari ${larian.sumber.join("/")}, ${jumlah("bukanFresh")} bukan untuk fresh grad (internship/senior/3+ tahun), ${jumlah("pernahDilihat")} sudah ditunjukkan sebelum ini.`,
    );
  } else {
    baris.push("Carian belum selesai atau tidak berjalan. Cuba lagi sebentar.");
  }
  if (jumlah("bukanSumber") > 0) baris.push('💡 Boleh tambah sumber lain, contoh: _"mulai sekarang cari juga di JobStreet"_.');
  return baris.join("\n");
}

export async function nilaiDanHantar(idLarian: string, llm?: KlienLLM): Promise<number> {
  const larian = await bacaJSON<Larian | null>(kunciLarian(idLarian), null);
  if (!larian) return 0;
  const semua = await bacaSenarai<IklanKerja>(kunciCalon(idLarian));
  const stat = await bacaSenarai<Statistik>(kunciStat(idLarian));
  // Buang pendua (iklan sama muncul dalam carian beberapa jawatan); yang paling baru dahulu
  const unik = [...new Map(semua.map((x) => [x.id, x])).values()].sort((a, b) => (b.tarikhSiar ?? "").localeCompare(a.tarikhSiar ?? ""));
  let nota = larian.sebab.length ? `\n_(Ikut arahan: ${larian.sebab.join("; ")})_` : "";
  if (!unik.length) {
    await hantarMesej(teksSebabKosong(stat, larian) + nota);
    return 0;
  }

  // Iklan yang sudah dinilai sebelum ini guna skor lama (jimat kuota AI); yang baru dinilai sekarang
  const sedia = new Map<string, RekodKerja>();
  for (const x of unik) {
    const r = await bacaRekod(x.id);
    if (r?.skor != null) sedia.set(x.id, r);
  }
  const perluNilai = unik.filter((x) => !sedia.has(x.id)).slice(0, MAKS_DINILAI);
  let penilaian: Awaited<ReturnType<typeof nilaiBerkelompok>> = [];
  let nilaiGagal = false;
  if (perluNilai.length) {
    try {
      penilaian = await nilaiBerkelompok(perluNilai, llm);
    } catch (e) {
      nilaiGagal = true;
      console.error("[pemburu] Penilaian gagal:", e);
    }
  }
  const ikutId = new Map(penilaian.map((p) => [p.id, p]));
  const rekod: RekodKerja[] = [];
  for (const k of perluNilai) {
    const p = ikutId.get(k.id);
    const r: RekodKerja = {
      ...k,
      ...(p ? { skor: p.skor, sebab: p.sebab, padan: p.padan, kurang: p.kurang } : {}),
      status: "baru",
      dijumpai: new Date().toISOString(),
      emelHR: k.emel ?? null,
    };
    await simpanRekod(r);
    rekod.push(r);
  }
  rekod.push(...sedia.values());

  const adaSkor = rekod.filter((r) => r.skor != null);
  const terbaik = adaSkor.length
    ? adaSkor
        .filter((r) => (r.skor ?? 0) >= SKOR_MINIMUM)
        .sort((a, b) => (b.skor ?? 0) - (a.skor ?? 0))
        .slice(0, MAKS_DIGEST)
    : rekod.slice(0, MAKS_DIGEST); // penilaian AI gagal: tetap tunjuk iklan tanpa skor
  if (nilaiGagal) nota += "\n_(Penilaian AI tidak tersedia buat masa ini; sebahagian iklan tanpa skor.)_";
  if (!terbaik.length) {
    await hantarMesej(`🔎 ${rekod.length} iklan dinilai tetapi tiada yang mencapai skor ${SKOR_MINIMUM}%.${nota}\nTaip _"senarai kerja"_ untuk lihat semua.`);
    return 0;
  }
  const jenis = larian.manual ? "Carian kerja" : `Carian kerja harian ${larian.tarikh}`;
  await hantarMesej(`🔎 **${jenis}:** ${unik.length} iklan sesuai dijumpai (sebulan lepas), ${terbaik.length} paling sepadan di bawah.${nota}`);
  for (const r of terbaik) await hantarMesej(teksKerja(r), { papan: papanKerja(r) });
  return terbaik.length;
}
