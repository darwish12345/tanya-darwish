/**
 * Chat dengan agent terus dari terminal (tanpa UI) — cara terbaik untuk faham apa yang berlaku.
 * Jalankan:  npm run chat
 * Setiap tool yang dipanggil akan dicetak, supaya anda nampak gelung agent bekerja.
 */
import "./load-env";
import readline from "node:readline/promises";
import { jalankanAgent, MODEL, type MesejSejarah } from "../src/lib/agent/loop";

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error("GROQ_API_KEY belum ditetapkan. Salin .env.example ke .env.local dan isi kunci anda.");
    process.exit(1);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const sejarah: MesejSejarah[] = [];
  console.log(`Tanya Darwish (model: ${MODEL}). Taip "keluar" untuk berhenti.\n`);

  while (true) {
    const soalan = (await rl.question("Anda: ")).trim();
    if (!soalan || soalan === "keluar") break;
    sejarah.push({ role: "user", content: soalan });

    const hasil = await jalankanAgent(sejarah);
    for (const l of hasil.langkah) console.log(`  [tool] ${l.tool}(${l.input})`);
    if (hasil.kad.length) console.log(`  [kad] ${hasil.kad.map((k) => k.nama).join(", ")}`);
    console.log(`\nAgent: ${hasil.jawapan}`);
    if (hasil.cadangan.length) console.log(`  Cadangan: ${hasil.cadangan.join(" | ")}`);
    console.log();

    sejarah.push({ role: "assistant", content: hasil.jawapan });
  }
  rl.close();
}

main();
