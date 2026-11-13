/**
 * Ujian aliran kerjaya: carian JSearch → skor padanan → digest Telegram → draf resume/cover letter → kelulusan.
 * Tanpa internet: pelayan JSearch & Telegram palsu, LLM palsu.
 * Jalankan:  npm run test:kerjaya
 */
import assert from "node:assert/strict";
import { storanSementara, pelayanPalsu, llmPalsu, jawab, ok, jumlahLulus } from "./bantu-ujian";

storanSementara();

const IKLAN_JSEARCH = [
  {
    job_id: "abc-1",
    job_title: "Junior Software Engineer",
    employer_name: "ABC Tech",
    job_publisher: "LinkedIn",
    job_apply_link: "https://linkedin.example/abc",
    apply_options: [
      { publisher: "LinkedIn", apply_link: "https://linkedin.example/abc" },
      { publisher: "Indeed", apply_link: "https://indeed.example/abc" },
    ],
    job_description: "We need a junior developer with TypeScript, React and Next.js. Send CV to hr@abctech.example",
    job_city: "Kuala Lumpur",
    job_country: "MY",
  },
  {
    job_id: "def-2",
    job_title: "Senior Java Architect",
    employer_name: "DEF Bank",
    job_publisher: "LinkedIn",
    job_apply_link: "https://linkedin.example/def",
    job_description: "10+ years Java, Spring, Kafka.",
    job_city: "Cyberjaya",
  },
  {
    job_id: "ghi-3",
    job_title: "AI Engineer (Graduate)",
    employer_name: "GHI AI",
    job_publisher: "Indeed",
    job_apply_link: "https://indeed.example/ghi",
    job_description: "Graduate AI engineer: LLM, RAG, Python or TypeScript.",
    job_city: "Penang",
  },
];

async function main() {
  const pertanyaanJSearch: string[] = [];
  // Kalendar Google palsu: sahkan tandatangan JWT (RS256) dengan kunci awam sebenar
  const { generateKeyPairSync, createVerify } = await import("node:crypto");
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const acaraDicipta: { summary: string; start: { dateTime: string } }[] = [];
  let sibuk: { start: string; end: string }[] = [];
  const tg = await pelayanPalsu({
    "/search": (url) => {
      pertanyaanJSearch.push(url.searchParams.get("query") ?? "");
      return { status: "OK", data: IKLAN_JSEARCH };
    },
    "/token": (_u, badan) => {
      const jwt = new URLSearchParams(badan).get("assertion") ?? "";
      const [k, t, ttd] = jwt.split(".");
      const sah = createVerify("RSA-SHA256").update(`${k}.${t}`).verify(publicKey, ttd, "base64url");
      const tuntutan = JSON.parse(Buffer.from(t, "base64url").toString());
      if (!sah || tuntutan.iss !== "agent@ujian.iam.gserviceaccount.com") return { _status: 400, error_description: "JWT tidak sah" };
      return { access_token: "token-palsu", expires_in: 3600 };
    },
    "/calendar/v3/freeBusy": () => ({ calendars: { "darwish@example.com": { busy: sibuk } } }),
    "/calendar/v3/calendars": (_u, badan) => {
      const a = JSON.parse(badan);
      acaraDicipta.push(a);
      return { id: `acara${acaraDicipta.length}`, ...a };
    },
  });
  process.env.TELEGRAM_API_BASE = tg.asas;
  process.env.TELEGRAM_BOT_TOKEN = "123:ujian";
  process.env.TELEGRAM_CHAT_ID = "777";
  process.env.JSEARCH_API_KEY = "kunci-palsu";
  process.env.JSEARCH_BASE = tg.asas;

  const { normalkan, tapisIkutSumber, cariJSearch, idKerja } = await import("../src/lib/kerjaya/jsearch");
  const { cariSatuJawatan, nilaiDanHantar } = await import("../src/lib/kerjaya/pemburu");
  const { sahkanDraf, binaResumeKhas, sediakanPermohonan, hantarPermohonan } = await import("../src/lib/kerjaya/permohonan");
  const { bacaResumeInduk } = await import("../src/lib/kerjaya/profil");
  const { janaResumePDF, janaCoverLetterPDF } = await import("../src/lib/kerjaya/pdf");
  const { bacaRekod, cariRekod } = await import("../src/lib/kerjaya/rekod");
  const { nilaiJobDescription } = await import("../src/lib/kerjaya/padanan");
  const data = await import("../src/lib/data");
  const { tarikhMY } = await import("../src/lib/masa");
  const { teksDariPDF } = await import("../src/lib/import");

  console.log("Carian & penapis sumber");
  const iklan = IKLAN_JSEARCH.map(normalkan);
  assert.equal(iklan[0].emel, "hr@abctech.example", "emel HR dikesan dari penerangan");
  assert.equal(iklan[0].lokasi, "Kuala Lumpur, MY");
  assert.equal(iklan[0].id.length, 10);
  ok("normalkan iklan JSearch + kesan emel HR");

  const hanyaIndeed = tapisIkutSumber(iklan, ["Indeed"]);
  assert.deepEqual(hanyaIndeed.map((x) => x.id), [idKerja("abc-1"), idKerja("ghi-3")]);
  assert.equal(hanyaIndeed[0].penerbit, "Indeed");
  assert.equal(hanyaIndeed[0].pautan, "https://indeed.example/abc", "pautan ditukar kepada versi Indeed");
  assert.equal(tapisIkutSumber(iklan, []).length, 3);
  ok("REGRESI: penapis sumber (cth. Indeed sahaja) guna pautan sumber itu");

  const terus = await cariJSearch("Junior Software Engineer in Malaysia");
  assert.equal(terus.length, 3);
  ok("klien JSearch (pelayan palsu)");

  console.log("Pemburu kerja → digest Telegram");
  const tarikh = tarikhMY();
  await data.tambahArahan({ tarikh, jenis: "langkau_sumber", sumber: ["LinkedIn"], arahan: "Jangan cari di LinkedIn hari ini" });
  const { sumber, sebab } = await data.sumberBerkuatKuasa(tarikh);
  const { tulisJSON } = await import("../src/lib/store");
  await tulisJSON(`kerja-calon-${tarikh}`, { sumber, sebab, calon: [] });
  assert.equal(await cariSatuJawatan("Junior Software Engineer", tarikh), 2, "DEF (LinkedIn sahaja) ditapis keluar");
  assert.equal(await cariSatuJawatan("AI Engineer", tarikh), 2, "carian kedua: calon sama tidak digandakan");
  assert.match(pertanyaanJSearch[1], /Junior Software Engineer in Malaysia/);

  const { llm: llmNilai } = llmPalsu([
    jawab(
      JSON.stringify({
        penilaian: [
          { id: idKerja("abc-1"), skor: 86, sebab: "Padan dengan TypeScript & Next.js", padan: ["TypeScript", "Next.js"], kurang: [] },
          { id: idKerja("ghi-3"), skor: 72, sebab: "Pengalaman RAG relevan", padan: ["RAG"], kurang: ["Python"] },
        ],
      }),
    ),
  ]);
  const sebelumHantar = tg.panggilan.length;
  assert.equal(await nilaiDanHantar(tarikh, llmNilai), 2);
  const digest = tg.panggilan.slice(sebelumHantar).filter((x) => x.kaedah === "sendMessage");
  assert.equal(digest.length, 3, "1 ringkasan + 2 kad kerja");
  assert.match(String(digest[0].badan?.text), /Jangan cari di LinkedIn/, "arahan hari ini dinyatakan");
  assert.match(String(digest[1].badan?.text), /86%/);
  const butang = (digest[1].badan as { reply_markup: { inline_keyboard: { callback_data?: string; url?: string }[][] } }).reply_markup.inline_keyboard;
  assert.equal(butang[0][0].callback_data, `k:mohon:${idKerja("abc-1")}`);
  assert.equal(butang[1][0].url, "https://indeed.example/abc");
  assert.ok(butang.flat().every((b) => !b.callback_data || Buffer.byteLength(b.callback_data) <= 64), "callback_data ≤ 64 bait");
  const rekod = await bacaRekod(idKerja("abc-1"));
  assert.equal(rekod?.status, "baru");
  assert.equal(rekod?.emelHR, "hr@abctech.example");
  assert.equal((await cariRekod("ABC")).length, 1);
  ok("pemburu: tapis, nilai, simpan rekod, hantar kad dengan butang");

  // Penilaian AI gagal → iklan tetap dipaparkan tanpa skor
  await tulisJSON(`kerja-calon-${tarikh}`, { sumber: [], sebab: [], calon: [normalkan({ ...IKLAN_JSEARCH[1], job_id: "zzz" })] });
  const gagal = llmPalsu([() => {
    throw new Error("429 rate limit");
  }]);
  assert.equal(await nilaiDanHantar(tarikh, gagal.llm), 1);
  assert.match(String(tg.panggilan.filter((x) => x.kaedah === "sendMessage").at(-2)?.badan?.text), /tanpa skor/);
  ok("penilaian AI gagal → iklan tetap dihantar tanpa skor");

  console.log("Resume & cover letter (anti-reka)");
  const induk = await bacaResumeInduk();
  assert.ok(!JSON.stringify(induk).includes("TODO"), "nilai TODO dibuang dari resume induk");
  assert.ok(induk.kemahiran && Object.keys(induk.kemahiran).length > 0);
  const draf = sahkanDraf(
    {
      ringkasan: "Junior engineer.",
      kemahiran: ["typescript", "Kubernetes", "Next.js"], // Kubernetes TIDAK ada dalam resume induk
      projek: [0, 7, -1, 0], // indeks 7 & -1 tidak wujud; 0 berganda
      poinProjek: { "0": [0, 2, 99] },
      coverLetter: "Dear Hiring Manager, ...",
      subjek: "Application: Junior Software Engineer",
    },
    induk,
  );
  assert.deepEqual(draf.kemahiran, ["TypeScript", "Next.js"], "kemahiran rekaan dibuang, ejaan dibetulkan");
  assert.deepEqual(draf.projek, [0]);
  assert.deepEqual(draf.poinProjek["0"], [0, 2]);
  const khas = binaResumeKhas(induk, draf);
  assert.equal(khas.projek[0].poin.length, 2);
  assert.ok(khas.projek[0].poin.every((p) => induk.projek[0].poin.includes(p)), "setiap poin wujud dalam resume induk");
  ok("REGRESI anti-reka: hanya kemahiran/poin dari resume induk digunakan");

  const pdf = await janaResumePDF(induk, khas);
  const surat = await janaCoverLetterPDF(induk, "Dear Hiring Manager,\n\nI am applying — with “smart quotes” & émojis 🚀.\n\nRegards", "13 November 2026");
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), "%PDF-");
  assert.equal(Buffer.from(surat.slice(0, 5)).toString(), "%PDF-");
  const teksPdf = await teksDariPDF(pdf);
  assert.match(teksPdf, /Darwish/);
  assert.match(teksPdf, /TypeScript/);
  assert.ok(!/TODO/.test(teksPdf));
  ok("PDF resume ATS & cover letter dijana (teks boleh dibaca semula oleh ATS)");

  console.log("Kelulusan manusia");
  const { llm: llmDraf } = llmPalsu([
    jawab(JSON.stringify({ ringkasan: "Junior engineer", kemahiran: ["TypeScript"], projek: [0], poinProjek: { "0": [0, 1] }, coverLetter: "Dear ABC Tech team,\n\nI would like to apply.", subjek: "Application" })),
  ]);
  const sebelumDraf = tg.panggilan.length;
  await sediakanPermohonan(idKerja("abc-1"), llmDraf);
  const baru = tg.panggilan.slice(sebelumDraf);
  assert.equal(baru.filter((x) => x.kaedah === "sendDocument").length, 2, "resume + cover letter dihantar ke Telegram");
  const kelulusan = baru.filter((x) => x.kaedah === "sendMessage").at(-1)!;
  // Gmail belum disetup → tiada butang Hantar emel, hanya mohon manual
  const papan = JSON.stringify(kelulusan.badan);
  assert.ok(!papan.includes("m:hantar"), "tiada butang Hantar tanpa Gmail");
  assert.ok(papan.includes(`m:manual:${idKerja("abc-1")}`));
  assert.equal((await bacaRekod(idKerja("abc-1")))?.status, "perlu_manual");
  assert.match(await hantarPermohonan(idKerja("abc-1")), /Gmail belum disetup/);
  assert.notEqual((await bacaRekod(idKerja("abc-1")))?.status, "dihantar", "tiada emel dihantar tanpa Gmail + butang");
  ok("draf dihantar untuk semakan; emel TIDAK dihantar tanpa kelulusan & Gmail");

  {
    // Gmail disetup tetapi SMTP gagal → status tidak bertukar "dihantar", kunci dilepaskan untuk cuba semula
    process.env.GMAIL_USER = "ujian@example.com";
    process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1"; // tiada pelayan → ditolak serta-merta
    assert.match(await hantarPermohonan(idKerja("abc-1")), /Gagal menghantar emel/);
    assert.notEqual((await bacaRekod(idKerja("abc-1")))?.status, "dihantar");
    assert.match(await hantarPermohonan(idKerja("abc-1")), /Gagal menghantar emel/, "kunci dilepaskan selepas gagal");
    // Tekan dua kali dengan pantas → permintaan kedua disekat oleh kunci
    await tulisJSON(`hantar-kunci-${idKerja("abc-1")}`, Date.now());
    assert.match(await hantarPermohonan(idKerja("abc-1")), /sedang dihantar/);
    for (const k of ["GMAIL_USER", "GMAIL_APP_PASSWORD", "SMTP_HOST", "SMTP_PORT"]) delete process.env[k];
  }
  ok("hantar emel: gagal SMTP tidak menanda 'dihantar'; tekan berganda disekat");

  console.log("Penilai padanan (web)");
  const { llm: llmJD } = llmPalsu([jawab(JSON.stringify({ skor: 140, ringkasan: "Sesuai.", padan: ["Next.js"], kurang: ["Docker"] }))]);
  const jd = await nilaiJobDescription("Junior web developer with Next.js and Docker", llmJD);
  assert.equal(jd.skor, 100, "skor dihadkan 0-100");
  ok("penilai padanan job description");

  console.log("Tempah interview (Google Calendar palsu)");
  {
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "agent@ujian.iam.gserviceaccount.com";
    // Netlify menyimpan baris baru sebagai "\n" teks: uji penukaran itu juga
    process.env.GOOGLE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n");
    process.env.GOOGLE_CALENDAR_ID = "darwish@example.com";
    process.env.GOOGLE_TOKEN_URL = `${tg.asas}/token`;
    process.env.GOOGLE_API_BASE = tg.asas;
    const { jalankanTool } = await import("../src/lib/agent/tools");
    const { gabungMY, tambahHari, tarikhMY: hari, hariMingguMY } = await import("../src/lib/masa");

    // Cari hari bekerja pertama sekurang-kurangnya 2 hari lagi
    let t = tambahHari(hari(), 2);
    while (hariMingguMY(gabungMY(t, "12:00")!) > 5) t = tambahHari(t, 1);
    sibuk = [{ start: gabungMY(t, "10:00")!.toISOString(), end: gabungMY(t, "11:00")!.toISOString() }];

    const semak = await jalankanTool("semak_slot_interview", "{}");
    const slot = (semak.untukLLM as { slot: { id: string }[] }).slot.map((s) => s.id);
    assert.ok(slot.length > 0, "ada slot kosong");
    assert.ok(!slot.includes(gabungMY(t, "10:00")!.toISOString()) && !slot.includes(gabungMY(t, "10:30")!.toISOString()), "masa sibuk tidak ditawarkan");

    // Cubaan menempah 3 pagi hari Ahad → ditolak walaupun kalendar kosong
    let ahad = tambahHari(hari(), 2);
    while (hariMingguMY(gabungMY(ahad, "12:00")!) !== 7) ahad = tambahHari(ahad, 1);
    const jahat = await jalankanTool("tempah_interview", JSON.stringify({ slot: gabungMY(ahad, "03:00")!.toISOString(), nama: "Ujian", emel: "x@example.com" }));
    assert.ok((jahat.untukLLM as { ralat?: string }).ralat, "slot luar waktu interview ditolak");
    assert.equal(acaraDicipta.length, 0);

    const pilihan = gabungMY(t, "11:00")!.toISOString();
    const tempah = await jalankanTool("tempah_interview", JSON.stringify({ slot: pilihan, nama: "Sarah", emel: "sarah@abctech.example", syarikat: "ABC Tech", tujuan: "Interview Junior Developer" }));
    assert.equal((tempah.untukLLM as { status?: string }).status, "ditempah");
    assert.equal(acaraDicipta.length, 1);
    assert.equal(acaraDicipta[0].start.dateTime, pilihan);
    assert.match(acaraDicipta[0].summary, /Sarah \(ABC Tech\)/);
    const ingat = (await data.bacaPeringatan()).filter((p) => p.teks.includes("Sarah"));
    assert.equal(ingat.length, 2, "peringatan 24 jam & 1 jam sebelum");
    assert.ok(tg.panggilan.some((x) => x.kaedah === "sendMessage" && String(x.badan?.text).includes("Interview baru ditempah")));
    assert.ok((await data.bacaLeads()).some((l) => l.nama === "Sarah"), "tempahan direkod sebagai lead");
  }
  ok("tempah interview: JWT RS256, slot sibuk ditapis, slot luar waktu ditolak, acara + peringatan + notifikasi");

  tg.tutup();
  console.log(`\n${jumlahLulus()} ujian kerjaya lulus.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
