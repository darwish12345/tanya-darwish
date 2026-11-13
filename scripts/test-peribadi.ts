/**
 * Ujian agent peribadi Telegram + ujian regresi untuk setiap pepijat yang pernah dijumpai.
 * Tanpa internet: storan fail sementara, pelayan Telegram palsu, LLM palsu.
 * Jalankan:  npm run test:peribadi
 */
import assert from "node:assert/strict";
import { storanSementara, pelayanPalsu, llmPalsu, panggilTool, jawab, ralatGroq, ok, jumlahLulus } from "./bantu-ujian";

storanSementara();

async function main() {
  const tg = await pelayanPalsu();
  process.env.TELEGRAM_API_BASE = tg.asas;
  process.env.TELEGRAM_BOT_TOKEN = "123:ujian";
  process.env.TELEGRAM_CHAT_ID = "777";
  process.env.AGENT_SECRET = "rahsia-ujian-panjang";

  const masa = await import("../src/lib/masa");
  const { dariMasaMY, tarikhMY, tambahHari, jamMY, selepasMinit, gabungMY, hariMingguMY } = masa;
  const { jalankanAgenPeribadi, SEMUA_TOOLS_PERIBADI } = await import("../src/lib/agent/peribadi");
  const data = await import("../src/lib/data");
  const { binaLaporan } = await import("../src/lib/laporan");
  const { binaBriefing } = await import("../src/lib/briefing");
  const { jalankanTool } = await import("../src/lib/agent/tools");
  const { keHtmlTelegram } = await import("../src/lib/telegram");
  const { bersihkanOutput } = await import("../src/lib/teks");
  const { masaSeterusnya, hantarPeringatan, ciptaPeringatan } = await import("../src/lib/peringatan");
  const { semakAmaranTugasan } = await import("../src/lib/tugasan");
  const { jadualBerkala } = await import("../src/lib/kerja");
  const webhook = await import("../src/app/api/telegram/route");

  console.log("Masa & teks");
  assert.equal(dariMasaMY("2026-11-14 07:00")?.toISOString(), "2026-11-13T23:00:00.000Z");
  assert.equal(dariMasaMY("esok pagi"), null);
  assert.equal(tarikhMY(new Date("2026-11-13T17:30:00Z")), "2026-11-14");
  assert.equal(jamMY(new Date("2026-11-13T13:00:00Z")), 21);
  assert.equal(hariMingguMY(new Date("2026-11-16T02:00:00Z")), 1, "16 Nov 2026 ialah Isnin");
  assert.equal(gabungMY("2026-11-16", "18:00")?.toISOString(), "2026-11-16T10:00:00.000Z");
  ok("penukaran waktu Malaysia (UTC+8)");

  const kotor = "Baik" + "​".repeat(3000) + "!" + "a".repeat(40) + " **tebal";
  const bersih = bersihkanOutput(kotor);
  assert.ok(!/[​]/.test(bersih) && bersih.length < 30, `output dibersihkan: ${bersih}`);
  assert.ok(!bersih.includes("**"), "** tidak berpasangan dibuang");
  ok("REGRESI: aksara halimunan & teks berulang dibuang dari output");

  console.log("Peringatan");
  // REGRESI: "5 minit lagi" dahulu dikira salah oleh LLM → kini selepas_minit dikira dalam kod
  {
    const { llm } = llmPalsu([panggilTool("a", "tetapkan_peringatan", { teks: "Minum air", selepas_minit: 5 }), jawab("Baik, 5 minit lagi.")]);
    const sebelum = Date.now();
    await jalankanAgenPeribadi([{ role: "user", content: "5 minit lagi ingatkan saya minum air" }], llm);
    const p = (await data.bacaPeringatan()).find((x) => x.teks === "Minum air")!;
    const beza = new Date(p.masa).getTime() - sebelum;
    assert.ok(beza >= 4.9 * 60_000 && beza <= 5.1 * 60_000, `masa peringatan tepat 5 minit (beza ${beza}ms)`);
    assert.ok(Math.abs(selepasMinit(5).getTime() - (Date.now() + 300_000)) < 1000);
  }
  ok("REGRESI: '5 minit lagi' → tepat 5 minit dari sekarang");

  // REGRESI: model reka nama tool 'batalkan_peringatan' → 400 tool_use_failed → agent pulih sendiri
  {
    const { llm, diterima } = llmPalsu([
      () => ralatGroq(400, "tool call validation failed: attempted to call tool 'batalkan_peringatan' which was not in request.tools"),
      panggilTool("b", "batal_peringatan", { rujukan: "air" }),
      jawab("Peringatan minum air dibatalkan."),
    ]);
    const hasil = await jalankanAgenPeribadi([{ role: "user", content: "batalkan peringatan minum air" }], llm);
    assert.match(hasil.teks, /dibatalkan/);
    const p = (await data.bacaPeringatan()).find((x) => x.teks === "Minum air")!;
    assert.equal(p.status, "dibatal", "peringatan dibatalkan melalui kata kunci 'air'");
    const sistemPulih = diterima[1].messages.find((m) => m.role === "system" && String(m.content).includes("batalkan_peringatan"));
    assert.ok(sistemPulih && String(sistemPulih.content).includes("batal_peringatan"), "model diberitahu nama tool sebenar");
  }
  ok("REGRESI: nama tool salah dipulihkan; batal ikut kata kunci 'air'");

  // Peringatan berulang
  const ulang = { jenis: "mingguan" as const, hari: [1, 4, 6], jam: "18:00" };
  const jumaat = new Date("2026-11-13T04:00:00Z"); // Jumaat 12 tgh MY
  assert.equal(masaSeterusnya(ulang, jumaat)?.toISOString(), "2026-11-14T10:00:00.000Z", "Sabtu 6 petang");
  assert.equal(masaSeterusnya(ulang, new Date("2026-11-14T10:00:00Z"))?.toISOString(), "2026-11-16T10:00:00.000Z", "kemudian Isnin");
  assert.equal(masaSeterusnya({ jenis: "harian", jam: "07:00" }, jumaat)?.toISOString(), "2026-11-13T23:00:00.000Z");
  ok("peringatan berulang: kejadian seterusnya betul (mingguan & harian)");

  // Idempotent: QStash + cron boleh panggil serentak → hanya SATU mesej
  {
    const lalu = new Date(Date.now() - 60_000);
    const p = await ciptaPeringatan(lalu, "Kelas boxing", { jenis: "harian", jam: "18:00" });
    const sebelum = tg.panggilan.filter((x) => x.kaedah === "sendMessage").length;
    assert.equal(await hantarPeringatan(p.id), "dihantar");
    assert.equal(await hantarPeringatan(p.id), "dilangkau");
    const hantar = tg.panggilan.filter((x) => x.kaedah === "sendMessage");
    assert.equal(hantar.length - sebelum, 1, "dihantar sekali sahaja");
    const terakhir = hantar.at(-1)!.badan as { reply_markup?: { inline_keyboard: { callback_data: string }[][] } };
    assert.ok(terakhir.reply_markup?.inline_keyboard[0].some((b) => b.callback_data === `p:tunda:${p.id}`), "butang Tunda dilampirkan");
    const seterusnya = (await data.bacaPeringatan()).filter((x) => x.teks === "Kelas boxing" && x.status === "aktif");
    assert.equal(seterusnya.length, 1, "kejadian seterusnya dijadualkan");
    assert.ok(new Date(seterusnya[0].masa).getTime() > Date.now());
  }
  ok("peringatan idempotent + butang + jadual kejadian seterusnya");

  console.log("Arahan bertarikh vs kekal");
  // REGRESI: "esok tak perlu cari di LinkedIn" dahulu menjadi tetapan KEKAL
  const kini = new Date();
  const esok = tambahHari(tarikhMY(kini), 1);
  const lusa = tambahHari(tarikhMY(kini), 2);
  {
    const { llm, diterima } = llmPalsu([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "t1", type: "function", function: { name: "tetapkan_peringatan", arguments: JSON.stringify({ masa: `${esok} 07:00`, teks: "Siap sedia interview" }) } },
          {
            id: "t2",
            type: "function",
            function: { name: "catat_arahan", arguments: JSON.stringify({ tarikh: esok, jenis: "langkau_sumber", sumber: ["LinkedIn"], arahan: "Jangan cari kerja di LinkedIn" }) },
          },
        ],
      },
      jawab("Baik! Esok 7 pagi. LinkedIn dilangkau esok sahaja. Indeed dan Glassdoor masih dicari?"),
    ]);
    const hasil = await jalankanAgenPeribadi(
      [{ role: "user", content: "Esok pukul 7 pagi ingatkan saya siap sedia interview. Esok tak perlu cari di LinkedIn." }],
      llm,
      kini,
    );
    assert.match(hasil.teks, /Indeed/);
    assert.match(String(diterima[0].messages[1].content), new RegExp(esok), "konteks mengandungi tarikh esok sebenar");
    assert.equal(diterima[0].tools!.length, SEMUA_TOOLS_PERIBADI.length, "semua tools sentiasa dihantar");
    // System prompt tetap (boleh dicache) diletak dahulu; konteks berubah selepasnya
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(String(diterima[0].messages[0].content)), "prompt tetap tiada tarikh");
  }
  const p7 = (await data.bacaPeringatan()).find((x) => x.teks === "Siap sedia interview")!;
  assert.equal(p7.masa, dariMasaMY(`${esok} 07:00`)!.toISOString());
  assert.deepEqual((await data.sumberBerkuatKuasa(esok)).sumber, ["Indeed", "Glassdoor"]);
  assert.deepEqual((await data.sumberBerkuatKuasa(lusa)).sumber, ["LinkedIn", "Indeed", "Glassdoor"], "lusa kembali normal");
  assert.deepEqual((await data.bacaKeutamaan()).sumber, ["LinkedIn", "Indeed", "Glassdoor"], "keutamaan kekal TIDAK berubah");
  ok("REGRESI: arahan 'esok sahaja' tidak mengubah tetapan kekal");

  await data.tambahArahan({ tarikh: lusa, jenis: "langkau_carian", arahan: "Cuti, tiada carian" });
  assert.equal((await data.sumberBerkuatKuasa(lusa)).langkau, true);
  ok("arahan langkau carian untuk satu hari");

  // REGRESI: "batal arahan linkedin tu" dahulu menyebabkan agent minta ID arahan
  {
    const { llm, diterima } = llmPalsu([panggilTool("d", "padam_arahan", { rujukan: "linkedin" }), jawab("Siap, arahan LinkedIn esok dibuang.")]);
    await jalankanAgenPeribadi([{ role: "user", content: "batalkan arahan tak perlu linkedin tu" }], llm);
    assert.deepEqual((await data.sumberBerkuatKuasa(esok)).sumber, ["LinkedIn", "Indeed", "Glassdoor"], "arahan LinkedIn dipadam");
    const konteks = String(diterima[0].messages[1].content);
    assert.match(konteks, /esok: Jangan cari kerja di LinkedIn/, "agent nampak arahan sedia ada dalam konteks");
    const hasilTool = diterima[1].messages.find((m) => m.role === "tool");
    assert.ok(!/"id"/.test(String(hasilTool?.content)), "tiada ID dalam hasil tool");
    assert.match(String(diterima[0].messages[0].content), /JANGAN sekali-kali minta Darwish beri ID/, "prompt melarang minta ID");
  }
  ok("REGRESI: padam arahan dengan kata kunci ('linkedin'), tanpa ID");

  {
    const { cariPadanan } = await import("../src/lib/teks");
    const item = [
      { id: "a1", t: "Minum air" },
      { id: "a2", t: "Kelas boxing" },
      { id: "a3", t: "Minum ubat" },
    ];
    const cari = (r: string) => cariPadanan(item, r, (x) => x.t).map((x) => x.id);
    assert.deepEqual(cari("peringatan minum air tu"), ["a1"]);
    assert.deepEqual(cari("boxing"), ["a2"]);
    assert.deepEqual(cari("minum"), ["a1", "a3"], "kabur → beberapa pilihan");
    assert.deepEqual(cari("a3"), ["a3"]);
    assert.deepEqual(cari("berenang"), []);
  }
  ok("padanan rujukan bahasa biasa ('peringatan minum air tu' → Minum air)");

  console.log("Tugasan & penjadual");
  {
    const t = await data.tambahTugasan({ tajuk: "Siapkan laporan LI", deadline: new Date(Date.now() + 20 * 3600_000).toISOString(), keutamaan: "tinggi" });
    assert.equal(await semakAmaranTugasan(), 1, "amaran 24 jam dihantar");
    assert.equal(await semakAmaranTugasan(), 0, "amaran tidak berulang");
    const tekan = await webhook.POST(
      new Request("http://x/api/telegram", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": process.env.AGENT_SECRET!, "content-type": "application/json" },
        body: JSON.stringify({ update_id: 5001, callback_query: { id: "cb1", data: `t:siap:${t.id}`, message: { message_id: 9, text: "Tugasan", chat: { id: 777 } } } }),
      }),
    );
    assert.equal(tekan.status, 200);
    assert.equal((await data.bacaTugasan()).find((x) => x.id === t.id)?.status, "siap", "butang Siap berfungsi");
    assert.ok(tg.panggilan.some((x) => x.kaedah === "answerCallbackQuery"), "butang dijawab");
  }
  ok("amaran deadline tugasan + butang Siap melalui webhook");

  {
    // Webhook: orang lain tidak boleh guna bot; rahsia salah ditolak
    const salah = await webhook.POST(new Request("http://x", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "salah" }, body: "{}" }));
    assert.equal(salah.status, 401);
    const sebelum = tg.panggilan.length;
    await webhook.POST(
      new Request("http://x", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": process.env.AGENT_SECRET! },
        body: JSON.stringify({ update_id: 5002, message: { message_id: 1, text: "padam semua", chat: { id: 999 } } }),
      }),
    );
    const balas = tg.panggilan.slice(sebelum).find((x) => x.kaedah === "sendMessage")!;
    assert.equal(String((balas.badan as { chat_id: string }).chat_id), "999");
    assert.match(String((balas.badan as { text: string }).text), /bot peribadi Darwish/);
    // Update berulang diabaikan
    const n = tg.panggilan.length;
    await webhook.POST(
      new Request("http://x", {
        method: "POST",
        headers: { "x-telegram-bot-api-secret-token": process.env.AGENT_SECRET! },
        body: JSON.stringify({ update_id: 5002, message: { message_id: 1, text: "padam semua", chat: { id: 999 } } }),
      }),
    );
    assert.equal(tg.panggilan.length, n, "update_id sama tidak diproses dua kali");
  }
  ok("webhook: rahsia disemak, pemilik sahaja, tiada proses berganda");

  {
    // Penjadual: briefing 07:30 hanya sekali dalam tetingkap
    await data.kemasStatus({ githubTerakhir: new Date().toISOString() }); // elak panggilan rangkaian
    const hariA = "2030-01-07";
    const pagi = gabungMY(hariA, "08:00")!;
    const r1 = await jadualBerkala(pagi);
    assert.ok("briefing" in r1, "briefing berjalan 08:00");
    const r2 = await jadualBerkala(new Date(pagi.getTime() + 15 * 60_000));
    assert.ok(!("briefing" in r2), "briefing tidak berulang");
    const lewat = await jadualBerkala(gabungMY("2030-01-08", "11:00")!);
    assert.ok(!("briefing" in lewat), "luar tetingkap 3 jam");
    const malam = await jadualBerkala(gabungMY("2030-01-08", "21:05")!);
    assert.ok("laporan" in malam, "laporan malam berjalan");
    assert.ok(!("carianKerja" in malam), "carian kerja tidak berjalan tanpa JSEARCH_API_KEY");
  }
  ok("penjadual berkala: tetingkap briefing/laporan, sekali sehari");

  console.log("Lead, laporan & briefing");
  {
    process.env.TELEGRAM_BOT_TOKEN = "";
    const lead = await jalankanTool(
      "maklum_darwish",
      JSON.stringify({ nama: "Aina", syarikat: "ABC Tech", jawatan: "Junior Dev", jenis: "recruiter", mesej: "Nak tawar interview", ringkasan: "Tanya tentang projek AI" }),
    );
    assert.equal((lead.untukLLM as { status: string }).status, "disimpan");
    process.env.TELEGRAM_BOT_TOKEN = "123:ujian";
    const lead2 = await jalankanTool("maklum_darwish", JSON.stringify({ nama: "Ben", jenis: "kawan", mesej: "Hai", ringkasan: "Kawan lama" }));
    assert.equal((lead2.untukLLM as { status: string }).status, "dihantar");
    assert.equal((await data.bacaLeads()).length, 2);
  }
  ok("lead: status jujur ('disimpan' tanpa Telegram, 'dihantar' dengan Telegram)");

  const hariIni = tarikhMY();
  await data.logSoalan({ masa: new Date().toISOString(), soalan: "Apa sijil Darwish?", tools: ["cari_pengetahuan"], tiadaJawapan: false });
  await data.logSoalan({ masa: new Date().toISOString(), soalan: "Apa sijil Darwish?", tools: ["cari_pengetahuan"], tiadaJawapan: false });
  await data.logSoalan({ masa: new Date().toISOString(), soalan: "Darwish tahu Java?", tools: ["cari_pengetahuan"], tiadaJawapan: true });
  const laporan = await binaLaporan(hariIni);
  assert.match(laporan, /\*\*3\*\*/);
  assert.match(laporan, /apa sijil darwish\? \(2x\)/i);
  assert.match(laporan, /Aina \(ABC Tech\)/);
  ok("laporan harian: kiraan, soalan popular, leads");

  // (ujian penjadual di atas guna tahun 2030, jadi semua peringatan lama sudah "dihantar")
  await ciptaPeringatan(gabungMY("2031-03-03", "09:00")!, "Interview ABC Tech");
  const briefing = await binaBriefing(gabungMY("2031-03-03", "06:00")!);
  assert.match(briefing, /Selamat pagi/i);
  assert.match(briefing, /Peringatan hari ini[\s\S]*Interview ABC Tech/);
  ok("briefing pagi mengandungi peringatan & tugasan");

  assert.equal(keHtmlTelegram("**Hai** <b> & co"), "<b>Hai</b> &lt;b&gt; &amp; co");
  ok("teks Telegram di-escape dengan selamat");

  console.log("Keselamatan");
  {
    const { semakHadKadar, bersihkanTeksPelawat, namaSah } = await import("../src/lib/guardrails");
    let disekat = 0;
    for (let i = 0; i < 25; i++) if (!(await semakHadKadar("1.2.3.4")).ok) disekat++;
    assert.equal(disekat, 5, "IP yang sama disekat selepas 20 mesej sejam");
    assert.ok((await semakHadKadar("5.6.7.8")).ok, "IP lain tidak terjejas");
    process.env.HAD_WEB_SEHARI = "26"; // 26 mesej sudah dikira di atas
    const r = await semakHadKadar("9.9.9.9");
    assert.ok(!r.ok && /had harian/.test(r.mesej), "had harian keseluruhan melindungi kuota Groq");
    delete process.env.HAD_WEB_SEHARI;

    assert.ok(namaSah("Nur Aisyah binti Ahmad") && namaSah("Sarah O'Connor") && namaSah("李明"));
    assert.ok(!namaSah("Free money http://x.co") && !namaSah("visit www.spam.com") && !namaSah("<script>"));
    assert.equal(bersihkanTeksPelawat("Hai <b>klik</b> https://phish.ly/x sekarang!!"), "Hai b klik /b sekarang!!");

    // Notifikasi lead dihadkan 20 sehari; selepas itu lead tetap DISIMPAN tetapi tidak ping Telegram
    const sebelum = tg.panggilan.length;
    let disimpanSahaja = 0;
    for (let i = 0; i < 22; i++) {
      const h = await jalankanTool("maklum_darwish", JSON.stringify({ nama: `Spam ${i}`, jenis: "lain", mesej: "x", ringkasan: "x" }));
      if ((h.untukLLM as { status: string }).status === "disimpan") disimpanSahaja++;
    }
    assert.ok(disimpanSahaja >= 2, "selepas had, lead hanya disimpan");
    assert.ok(tg.panggilan.slice(sebelum).filter((x) => x.kaedah === "sendMessage").length <= 20);
  }
  ok("had kadar (IP & harian), nama/teks pelawat dibersihkan, had notifikasi lead");

  tg.tutup();
  console.log(`\n${jumlahLulus()} ujian agent peribadi lulus.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
