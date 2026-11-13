/**
 * EVAL SUITE: jalankan agent SEBENAR (Groq) terhadap evals/kes.json dan ukur kualiti.
 *
 *   npm run eval                    # semua kes
 *   npm run eval -- --kes w01,p03   # kes tertentu
 *   npm run eval -- --agent web     # web sahaja
 *
 * Perlu GROQ_API_KEY. Storan = fail sementara, Telegram/Gmail/Kalendar dimatikan, jadi eval
 * tidak menyentuh data sebenar dan tidak menghantar apa-apa.
 * Hasil: evals/keputusan-terkini.json (ringkasan untuk /statistik) + evals/laporan-terkini.md.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "td-eval-"));
process.env.DATA_DIR = DIR;
process.env.STORAN = "fail";
for (const k of [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "QSTASH_TOKEN",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "JSEARCH_API_KEY",
])
  delete process.env[k];

type Keadaan = { jenis: string; [k: string]: unknown };
type Kes = {
  id: string;
  agent: "web" | "peribadi";
  kategori: string;
  soalan: string;
  tool?: string[];
  tiada_tool?: string[];
  padan?: string[];
  tak_padan?: string[];
  bahasa?: "en" | "ms";
  keadaan?: Keadaan[];
  sedia?: {
    peringatan?: { selepas_minit: number; teks: string };
    tugasan?: { tajuk: string };
    arahan?: { hari: number; jenis: "langkau_sumber" | "hanya_sumber" | "langkau_carian" | "nota"; sumber?: string[]; teks: string };
  }[];
};
type Hasil = { id: string; kategori: string; agent: string; lulus: boolean; gagal: string[]; tools: string[]; jawapan: string; ms: number };

const args = process.argv.slice(2);
const nilaiArg = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function denganCubaSemula<T>(fn: () => Promise<T>): Promise<T> {
  for (let cubaan = 0; ; cubaan++) {
    try {
      return await fn();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 429 && cubaan < 5) {
        const tunggu = 15_000 * (cubaan + 1);
        console.log(`    (had kadar Groq, tunggu ${tunggu / 1000}s)`);
        await tidur(tunggu);
        continue;
      }
      throw e;
    }
  }
}

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error("GROQ_API_KEY diperlukan untuk eval.");
    process.exit(1);
  }
  const { jalankanAgent, kesanBahasa, MODEL } = await import("../src/lib/agent/loop");
  const { jalankanAgenPeribadi } = await import("../src/lib/agent/peribadi");
  const data = await import("../src/lib/data");
  const { ciptaPeringatan } = await import("../src/lib/peringatan");
  const { tarikhMY, tambahHari, gabungMY, jamMinitMY } = await import("../src/lib/masa");

  const semua: Kes[] = JSON.parse(fs.readFileSync("evals/kes.json", "utf8")).kes;
  const tapisId = nilaiArg("--kes")?.split(",");
  const tapisAgent = nilaiArg("--agent");
  const kes = semua.filter((k) => (!tapisId || tapisId.includes(k.id)) && (!tapisAgent || k.agent === tapisAgent));
  const jeda = Number(process.env.EVAL_JEDA_MS ?? 3000);

  const KEUTAMAAN_ASAL = [...data.KEUTAMAAN_LALAI.sumber];

  async function semakKeadaan(k: Keadaan, mula: number): Promise<string | null> {
    const peringatan = await data.bacaPeringatan();
    const cari = (teks: unknown) => peringatan.filter((p) => p.teks.toLowerCase().includes(String(teks).toLowerCase()));
    const esok = tambahHari(tarikhMY(), 1);
    switch (k.jenis) {
      case "peringatan_selepas_minit": {
        const p = cari(k.teks)[0];
        if (!p) return `tiada peringatan '${k.teks}'`;
        const sasaran = mula + Number(k.minit) * 60_000;
        const beza = Math.abs(new Date(p.masa).getTime() - sasaran);
        return beza <= 2 * 60_000 ? null : `masa peringatan lari ${Math.round(beza / 60_000)} minit`;
      }
      case "peringatan_pada": {
        const p = cari(k.teks)[0];
        if (!p) return `tiada peringatan '${k.teks}'`;
        const jangka = gabungMY(tambahHari(tarikhMY(), Number(k.hari)), String(k.jam))!;
        return p.masa === jangka.toISOString() ? null : `masa ${p.masa}, dijangka ${jangka.toISOString()}`;
      }
      case "peringatan_ulang": {
        const p = peringatan.find((x) => x.ulang);
        if (!p?.ulang) return "tiada peringatan berulang";
        if (p.ulang.jam.padStart(5, "0") !== k.jam) return `jam ${p.ulang.jam} ≠ ${k.jam}`;
        if (k.harian) return p.ulang.jenis === "harian" ? null : `jenis ${p.ulang.jenis}`;
        const hari = [...(p.ulang.hari ?? [])].sort().join(",");
        return hari === (k.hari as number[]).join(",") ? null : `hari ${hari} ≠ ${(k.hari as number[]).join(",")}`;
      }
      case "peringatan_status": {
        const p = cari(k.teks)[0];
        return p?.status === k.status ? null : `status '${k.teks}' = ${p?.status}, dijangka ${k.status}`;
      }
      case "tugasan_ada": {
        const t = (await data.bacaTugasan()).find((x) => x.tajuk.toLowerCase().includes(String(k.teks)));
        if (!t) return `tiada tugasan '${k.teks}'`;
        return k.deadline && !t.deadline ? "tugasan tiada deadline" : null;
      }
      case "tugasan_siap": {
        const t = (await data.bacaTugasan()).find((x) => x.tajuk.toLowerCase().includes(String(k.teks)));
        return t?.status === "siap" ? null : `status tugasan ${t?.status}`;
      }
      case "sumber_esok_tanpa": {
        const s = await data.sumberBerkuatKuasa(esok);
        return s.sumber.some((x) => x.toLowerCase() === String(k.sumber).toLowerCase()) ? `${k.sumber} masih dicari esok` : null;
      }
      case "sumber_esok_dengan": {
        const s = await data.sumberBerkuatKuasa(esok);
        return s.sumber.some((x) => x.toLowerCase() === String(k.sumber).toLowerCase()) ? null : `${k.sumber} tidak dicari esok (arahan tidak dipadam)`;
      }
      case "sumber_esok_hanya": {
        const s = await data.sumberBerkuatKuasa(esok);
        return s.sumber.length === 1 && s.sumber[0].toLowerCase() === String(k.sumber).toLowerCase() ? null : `sumber esok = ${s.sumber.join(",")}`;
      }
      case "keutamaan_sumber_kekal": {
        const s = (await data.bacaKeutamaan()).sumber;
        return s.join(",") === KEUTAMAAN_ASAL.join(",") ? null : `keutamaan kekal berubah: ${s.join(",")}`;
      }
      case "keutamaan_sumber": {
        const s = (await data.bacaKeutamaan()).sumber.map((x) => x.toLowerCase()).sort();
        const jangka = (k.sumber as string[]).map((x) => x.toLowerCase()).sort();
        return s.join(",") === jangka.join(",") ? null : `sumber = ${s.join(",")}`;
      }
      case "langkau_hari": {
        const s = await data.sumberBerkuatKuasa(tambahHari(tarikhMY(), Number(k.hari)));
        return s.langkau ? null : "carian tidak dilangkau";
      }
      case "keutamaan_jam_briefing": {
        const j = (await data.bacaKeutamaan()).jamBriefing;
        return j === k.jam ? null : `jam briefing ${j}`;
      }
      case "pengetahuan_ada": {
        const p = await data.bacaPengetahuan();
        return p.some((x) => `${x.tajuk} ${x.teks}`.includes(String(k.teks))) ? null : "pengetahuan tidak ditambah";
      }
      default:
        return `jenis semakan tidak dikenali: ${k.jenis}`;
    }
  }

  console.log(`Eval ${kes.length} kes dengan ${MODEL} (jam MY ${jamMinitMY()})\n`);
  const hasil: Hasil[] = [];
  for (const k of kes) {
    for (const f of fs.readdirSync(DIR)) fs.rmSync(path.join(DIR, f), { force: true });
    for (const s of k.sedia ?? []) {
      if (s.peringatan) await ciptaPeringatan(new Date(Date.now() + s.peringatan.selepas_minit * 60_000), s.peringatan.teks);
      if (s.tugasan) await data.tambahTugasan({ tajuk: s.tugasan.tajuk, keutamaan: "biasa" });
      if (s.arahan) await data.tambahArahan({ tarikh: tambahHari(tarikhMY(), s.arahan.hari), jenis: s.arahan.jenis, sumber: s.arahan.sumber, arahan: s.arahan.teks });
    }

    const mula = Date.now();
    let jawapan = "";
    let tools: string[] = [];
    const gagal: string[] = [];
    try {
      if (k.agent === "web") {
        const r = await denganCubaSemula(() => jalankanAgent([{ role: "user", content: k.soalan }]));
        jawapan = r.jawapan;
        tools = r.langkah.map((l) => l.tool);
      } else {
        const r = await denganCubaSemula(() => jalankanAgenPeribadi([{ role: "user", content: k.soalan }]));
        jawapan = r.teks;
        tools = r.tools;
      }
    } catch (e) {
      gagal.push(`ralat: ${e instanceof Error ? e.message.slice(0, 150) : e}`);
    }

    if (!gagal.length) {
      if (k.tool && !k.tool.some((t) => tools.includes(t))) gagal.push(`tool dijangka: ${k.tool.join(" / ")} (dipanggil: ${tools.join(", ") || "tiada"})`);
      for (const t of k.tiada_tool ?? []) if (tools.includes(t)) gagal.push(`tool tidak sepatutnya dipanggil: ${t}`);
      for (const r of k.padan ?? []) if (!new RegExp(r, "i").test(jawapan)) gagal.push(`jawapan tidak mengandungi /${r}/`);
      for (const r of k.tak_padan ?? []) if (new RegExp(r, "i").test(jawapan)) gagal.push(`jawapan mengandungi /${r}/`);
      if (k.bahasa && kesanBahasa(jawapan) !== k.bahasa) gagal.push(`bahasa jawapan bukan ${k.bahasa}`);
      if (!jawapan.trim()) gagal.push("jawapan kosong");
      for (const s of k.keadaan ?? []) {
        const m = await semakKeadaan(s, mula);
        if (m) gagal.push(m);
      }
    }
    const h: Hasil = { id: k.id, kategori: k.kategori, agent: k.agent, lulus: gagal.length === 0, gagal, tools, jawapan, ms: Date.now() - mula };
    hasil.push(h);
    console.log(`${h.lulus ? "✓" : "✗"} ${k.id} [${k.kategori}] ${k.soalan.split("\n")[0].slice(0, 60)}${h.lulus ? "" : `\n    → ${gagal.join("\n    → ")}`}`);
    await tidur(jeda);
  }

  const lulus = hasil.filter((h) => h.lulus).length;
  const purata = Math.round(hasil.reduce((a, h) => a + h.ms, 0) / Math.max(1, hasil.length));
  console.log(`\n${lulus}/${hasil.length} lulus (${Math.round((lulus / Math.max(1, hasil.length)) * 100)}%), purata ${purata} ms/kes`);

  // Simpan keputusan bagi setiap agent berasingan (supaya web & peribadi boleh dijalankan pada hari
  // berbeza dan tidak melepasi had token harian Groq percuma), kemudian gabung untuk /statistik.
  if (!tapisId) {
    const agenDijalankan = tapisAgent ? [tapisAgent] : ["web", "peribadi"];
    for (const ag of agenDijalankan) {
      const dlm = hasil.filter((h) => h.agent === ag);
      if (!dlm.length) continue;
      fs.writeFileSync(
        `evals/keputusan-${ag}.json`,
        JSON.stringify({ dijalankan: new Date().toISOString(), model: MODEL, hasil: dlm.map(({ jawapan, ...h }) => ({ ...h, jawapan: jawapan.slice(0, 400) })) }, null, 2) + "\n",
      );
    }
    tulisRingkasan();
  }
  if (args.includes("--ketat") && lulus < hasil.length) process.exit(1);
}

/** Gabung evals/keputusan-web.json + keputusan-peribadi.json → keputusan-terkini.json & laporan-terkini.md */
function tulisRingkasan() {
  type Fail = { dijalankan: string; model: string; hasil: Hasil[] };
  const fail = ["web", "peribadi"]
    .map((a) => `evals/keputusan-${a}.json`)
    .filter((f) => fs.existsSync(f))
    .map((f) => JSON.parse(fs.readFileSync(f, "utf8")) as Fail);
  const hasil = fail.flatMap((f) => f.hasil);
  if (!hasil.length) return;
  const lulus = hasil.filter((h) => h.lulus).length;
  const kategori = [...new Set(hasil.map((h) => h.kategori))].map((kat) => {
    const dlm = hasil.filter((h) => h.kategori === kat);
    return { kategori: kat, jumlah: dlm.length, lulus: dlm.filter((h) => h.lulus).length };
  });
  const purata = Math.round(hasil.reduce((a, h) => a + h.ms, 0) / hasil.length);
  const ringkasan = {
    dijalankan: fail.map((f) => f.dijalankan).sort().at(-1)!,
    model: fail[0].model,
    jumlah: hasil.length,
    lulus,
    kadarLulus: lulus / hasil.length,
    purataMs: purata,
    ikutKategori: kategori,
  };
  fs.writeFileSync("evals/keputusan-terkini.json", JSON.stringify(ringkasan, null, 2) + "\n");
  const gagal = hasil.filter((h) => !h.lulus);
  const md = [
    "# Laporan eval terkini",
    "",
    ...fail.map((f) => `- ${f.hasil[0]?.agent}: dijalankan ${f.dijalankan}`),
    `- Model: \`${ringkasan.model}\``,
    `- Keputusan: **${lulus}/${hasil.length} lulus (${Math.round(ringkasan.kadarLulus * 100)}%)**, purata ${purata} ms/kes`,
    "",
    "| Kategori | Lulus |",
    "|---|---|",
    ...kategori.map((c) => `| ${c.kategori} | ${c.lulus}/${c.jumlah} |`),
    "",
    "## Kes gagal",
    "",
    ...(gagal.length
      ? gagal.map((h) => `### ${h.id} (${h.kategori})\n- ${h.gagal.join("\n- ")}\n- Tools: ${h.tools.join(", ") || "tiada"}\n\n> ${h.jawapan.replace(/\n/g, "\n> ")}\n`)
      : ["Tiada. Semua kes lulus."]),
  ].join("\n");
  fs.writeFileSync("evals/laporan-terkini.md", md + "\n");
  console.log("Disimpan: evals/keputusan-terkini.json, evals/laporan-terkini.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
