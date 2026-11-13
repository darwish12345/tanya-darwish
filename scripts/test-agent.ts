/**
 * Ujian gelung agent TANPA internet, menggunakan LLM palsu (mock).
 * Jalankan:  npm run test:agent
 *
 * LLM palsu ini berkelakuan seperti LLM sebenar:
 *   pusingan 1 → minta tool cari_pengetahuan
 *   pusingan 2 → minta tool papar_projek
 *   pusingan 3 → beri jawapan akhir dengan <cadangan>
 * Ini membuktikan gelung, tools dan carian berfungsi.
 */
import assert from "node:assert/strict";
import { jalankanAgent, asingkanCadangan, kesanBahasa, type KlienLLM } from "../src/lib/agent/loop";
import { cariPengetahuan, pecahMarkdown, statistik } from "../src/lib/rag/knowledge";
import { jalankanTool, DEFINISI_TOOLS } from "../src/lib/agent/tools";

type MesejDiterima = { role: string; content?: string; tool_call_id?: string };

function buatLLMPalsu(balasan: unknown[]) {
  const panggilan: MesejDiterima[][] = [];
  const llm = {
    chat: {
      completions: {
        create: async (params: { messages: MesejDiterima[] }) => {
          panggilan.push(structuredClone(params.messages));
          const mesej = balasan[panggilan.length - 1];
          return { choices: [{ message: mesej }] };
        },
      },
    },
  } as unknown as KlienLLM;
  return { llm, panggilan };
}

async function main() {
  // 1. Pangkalan pengetahuan
  console.log("Statistik:", await statistik());
  const sijil = await cariPengetahuan("sijil Oracle");
  assert.ok(sijil.length > 0, "carian sijil sepatutnya jumpa hasil");
  assert.match(sijil[0].teks, /Oracle/);
  console.log("✓ carian 'sijil Oracle' →", sijil[0].sumber, "/", sijil[0].tajuk);

  const english = await cariPengetahuan("certifications Darwish");
  assert.ok(english.some((k) => k.teks.includes("Oracle")), "soalan English mesti jumpa sijil");
  console.log("✓ carian English 'certifications' jumpa sijil (sinonim BM)");

  const ketul = pecahMarkdown("t.md", "# T\n## A\nisi\nTODO: rahsia\n## B\nTODO: kosong\n");
  assert.equal(ketul.length, 1, "bahagian yang semua TODO diabaikan");
  assert.ok(!ketul[0].teks.includes("rahsia"), "baris TODO dibuang");
  console.log("✓ baris TODO tidak dimasukkan ke pengetahuan");

  // 2. Tools
  assert.equal(DEFINISI_TOOLS.length, 6);
  const salah = await jalankanTool("cari_pengetahuan", '{"soalan": 5}');
  assert.ok((salah.untukLLM as { ralat?: string }).ralat, "input salah ditolak");
  const tiada = await jalankanTool("padam_semua", "{}");
  assert.ok((tiada.untukLLM as { ralat?: string }).ralat, "tool tidak wujud ditolak");
  console.log("✓ validasi tool berfungsi");

  // 3. Asingkan cadangan
  const c = asingkanCadangan("Hai!\n<cadangan>Satu? | Dua?</cadangan>");
  assert.equal(c.jawapan, "Hai!");
  assert.deepEqual(c.cadangan, ["Satu?", "Dua?"]);
  console.log("✓ soalan susulan diasingkan dari jawapan");

  // 4. Gelung agent penuh dengan LLM palsu
  const { llm, panggilan } = buatLLMPalsu([
    {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "c1", type: "function", function: { name: "cari_pengetahuan", arguments: '{"soalan":"projek AI"}' } }],
    },
    {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "c2", type: "function", function: { name: "papar_projek", arguments: '{"tag":"ai"}' } }],
    },
    {
      role: "assistant",
      content: "Darwish membina **Tanya Darwish**, agent portfolio.\n<cadangan>Apa tech stack? | Boleh hubungi Darwish?</cadangan>",
    },
  ]);
  const hasil = await jalankanAgent([{ role: "user", content: "Apa projek AI Darwish?" }], llm);

  assert.equal(panggilan.length, 3, "LLM dipanggil 3 kali (2 tool + jawapan akhir)");
  assert.deepEqual(hasil.langkah.map((l) => l.tool), ["cari_pengetahuan", "papar_projek"]);
  assert.equal(hasil.kad[0]?.id, "tanya-darwish", "kad projek dipulangkan untuk UI");
  assert.equal(hasil.cadangan.length, 2);
  // Pusingan ke-2 mesti menerima hasil tool pertama dengan id yang sepadan
  const mesejTool = panggilan[1].find((m) => m.role === "tool");
  assert.equal(mesejTool?.tool_call_id, "c1");
  assert.match(mesejTool?.content ?? "", /Tanya Darwish/);
  console.log("✓ gelung agent: tool → tool → jawapan akhir");
  // 5. Pengesanan bahasa
  assert.equal(kesanBahasa("What certifications does Darwish have?"), "en");
  assert.equal(kesanBahasa("Show me Darwish's projects."), "en");
  assert.equal(kesanBahasa("Apa sijil Darwish?"), "ms");
  assert.equal(kesanBahasa("Saya nak berhubung dengan Darwish."), "ms");
  assert.equal(kesanBahasa("Tunjukkan projek dan repo GitHub Darwish."), "ms");
  console.log("✓ pengesanan bahasa BM / English");

  // 6. Jawapan kosong tidak boleh sampai kepada pelawat
  const kosong = buatLLMPalsu([{ role: "assistant", content: "" }]);
  const hasilKosong = await jalankanAgent([{ role: "user", content: "hai" }], kosong.llm);
  assert.ok(hasilKosong.jawapan.length > 0, "jawapan kosong digantikan dengan mesej sandaran");
  console.log("✓ jawapan kosong digantikan dengan mesej sandaran");

  console.log("\nJawapan:", hasil.jawapan);
  console.log("Langkah:", hasil.langkah.map((l) => l.tool).join(" → "));
  console.log("\nSemua ujian lulus.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
