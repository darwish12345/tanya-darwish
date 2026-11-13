/**
 * Ujian agent peribadi Telegram, peringatan, laporan & lead (tanpa internet).
 * Jalankan:  npm run test:peribadi
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Storan sementara (fail), terasing dari data sebenar
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "td-"));
delete process.env.TELEGRAM_BOT_TOKEN;

async function main() {
  const { dariMasaMY, tarikhMY, tambahHari, jamMY } = await import("../src/lib/masa");
  const { jalankanAgenPeribadi } = await import("../src/lib/agent/peribadi");
  const data = await import("../src/lib/data");
  const { binaLaporan } = await import("../src/lib/laporan");
  const { jalankanTool } = await import("../src/lib/agent/tools");
  const { keHtmlTelegram } = await import("../src/lib/telegram");

  // 1. Waktu Malaysia
  assert.equal(dariMasaMY("2026-11-14 07:00")?.toISOString(), "2026-11-13T23:00:00.000Z");
  assert.equal(dariMasaMY("esok pagi"), null);
  assert.equal(tarikhMY(new Date("2026-11-13T17:30:00Z")), "2026-11-14"); // 1:30 pagi di Malaysia
  assert.equal(jamMY(new Date("2026-11-13T13:00:00Z")), 21);
  console.log("✓ penukaran waktu Malaysia (UTC+8)");

  // 2. Agent peribadi: "esok pukul 7 pagi ingatkan saya" → tool tetapkan_peringatan
  const kini = new Date();
  const esok = tambahHari(tarikhMY(kini), 1);
  const promptDiterima: string[] = [];
  const balasan = [
    {
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "t1", type: "function", function: { name: "tetapkan_peringatan", arguments: JSON.stringify({ masa: `${esok} 07:00`, teks: "Siap sedia untuk interview" }) } },
        { id: "t2", type: "function", function: { name: "catat_arahan", arguments: JSON.stringify({ tarikh: esok, arahan: "Jangan cari kerja di LinkedIn" }) } },
      ],
    },
    { role: "assistant", content: `Baik! Peringatan ditetapkan **esok 7:00 pagi**. LinkedIn dilangkau esok. Indeed dan Glassdoor masih perlu dicari?` },
  ];
  let i = 0;
  const llm = {
    chat: {
      completions: {
        create: async (p: { messages: { role: string; content: string }[] }) => {
          promptDiterima.push(p.messages[0].content);
          return { choices: [{ message: balasan[i++] }] };
        },
      },
    },
  } as never;
  const jawapan = await jalankanAgenPeribadi(
    [{ role: "user", content: "Esok pukul 7 pagi ingatkan saya siap sedia interview. Esok tak perlu cari di LinkedIn." }],
    llm,
    kini,
  );
  assert.match(jawapan, /Indeed/);
  assert.match(promptDiterima[0], new RegExp(`Esok: ${esok}`), "prompt mengandungi tarikh esok sebenar");

  const peringatan = await data.bacaPeringatan();
  assert.equal(peringatan.length, 1);
  assert.equal(peringatan[0].masa, dariMasaMY(`${esok} 07:00`)!.toISOString());
  const arahan = await data.arahanUntuk(esok);
  assert.equal(arahan[0]?.arahan, "Jangan cari kerja di LinkedIn");
  console.log("✓ agent peribadi: peringatan 7 pagi + arahan LinkedIn disimpan");

  // 3. Peringatan tiba pada masanya sahaja
  assert.equal((await data.peringatanTiba(kini)).length, 0, "belum tiba");
  const selepas = new Date(dariMasaMY(`${esok} 07:01`)!);
  const tiba = await data.peringatanTiba(selepas);
  assert.equal(tiba.length, 1, "sudah tiba pada 7:01");
  await data.tandaDihantar(tiba.map((p) => p.id));
  assert.equal((await data.peringatanTiba(selepas)).length, 0, "tidak dihantar dua kali");
  console.log("✓ peringatan dihantar tepat pada masa, sekali sahaja");

  // 4. Lead pintar: disimpan walaupun Telegram belum disetup, dan status jujur
  const lead = await jalankanTool(
    "maklum_darwish",
    JSON.stringify({ nama: "Aina", syarikat: "ABC Tech", jawatan: "Junior Dev", jenis: "recruiter", mesej: "Nak tawar interview", ringkasan: "Tanya tentang projek AI" }),
  );
  assert.equal((lead.untukLLM as { status: string }).status, "disimpan");
  assert.equal((await data.bacaLeads()).length, 1);
  console.log("✓ lead disimpan; status 'disimpan' (bukan 'dihantar') bila Telegram belum aktif");

  // 5. Laporan harian
  const hariIni = tarikhMY();
  await data.logSoalan({ masa: new Date().toISOString(), soalan: "Apa sijil Darwish?", tools: ["cari_pengetahuan"], tiadaJawapan: false });
  await data.logSoalan({ masa: new Date().toISOString(), soalan: "Apa sijil Darwish?", tools: ["cari_pengetahuan"], tiadaJawapan: false });
  await data.logSoalan({ masa: new Date().toISOString(), soalan: "Darwish tahu Java?", tools: ["cari_pengetahuan"], tiadaJawapan: true });
  const laporan = await binaLaporan(hariIni);
  assert.match(laporan, /Soalan dari pelawat web: \*\*3\*\*/);
  assert.match(laporan, /apa sijil darwish\? \(2x\)/);
  assert.match(laporan, /tak dapat jawab \(1\)/);
  assert.match(laporan, /Aina \(ABC Tech\)/);
  console.log("✓ laporan harian: kiraan, soalan popular, soalan gagal, leads");

  // 6. Format Telegram selamat
  assert.equal(keHtmlTelegram("**Hai** <b> & co"), "<b>Hai</b> &lt;b&gt; &amp; co");
  console.log("✓ teks Telegram di-escape dengan selamat");

  console.log("\nSemua ujian agent peribadi lulus.");
  console.log("\nContoh laporan:\n" + laporan);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
