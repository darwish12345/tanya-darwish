/**
 * BRIEFING PAGI (dihantar automatik pada jam briefing, lalai 07:30 waktu Malaysia).
 * Disusun terus dari data (tanpa LLM) supaya nombor & senarai sentiasa tepat.
 */
import { tarikhMY, paparMY, paparPendekMY, gabungMY, tambahHari } from "@/lib/masa";
import { arahanUntuk, bacaKeutamaan } from "@/lib/data";
import { senaraiAktif } from "@/lib/peringatan";
import { tugasanBelum, barisTugasan } from "@/lib/tugasan";
import { kalendarDisetup, senaraiAcara } from "@/lib/kalendar";
import { bacaIndeks } from "@/lib/kerjaya/rekod";

export async function binaBriefing(kini: Date = new Date()): Promise<string> {
  const hariIni = tarikhMY(kini);
  const mulaEsok = gabungMY(tambahHari(hariIni, 1), "00:00")!;
  const baris: string[] = [`☀️ **Selamat pagi, Darwish!**`, paparMY(kini).split(",").slice(0, 2).join(","), ""];

  // Jadual
  if (kalendarDisetup()) {
    try {
      const acara = await senaraiAcara(kini, mulaEsok);
      baris.push(`📅 **Jadual hari ini:** ${acara.length ? "" : "tiada"}`);
      for (const a of acara) baris.push(`• ${paparPendekMY(new Date(a.mula))}: ${a.tajuk}`);
    } catch (e) {
      console.error("[briefing] kalendar:", e);
    }
  }

  // Peringatan hari ini
  const peringatan = (await senaraiAktif()).filter((p) => new Date(p.masa) < mulaEsok);
  if (peringatan.length) {
    baris.push(`⏰ **Peringatan hari ini:**`);
    for (const p of peringatan.slice(0, 6)) baris.push(`• ${paparPendekMY(new Date(p.masa))}: ${p.teks}`);
  }

  // Tugasan
  const tugasan = await tugasanBelum();
  const lewat = tugasan.filter((t) => t.deadline && new Date(t.deadline) < kini);
  const dekat = tugasan.filter((t) => t.deadline && new Date(t.deadline) >= kini && new Date(t.deadline).getTime() - kini.getTime() < 3 * 86400_000);
  const penting = [...lewat, ...dekat, ...tugasan.filter((t) => !lewat.includes(t) && !dekat.includes(t))].slice(0, 5);
  baris.push(`📌 **Tugasan (${tugasan.length} belum siap):**${tugasan.length ? "" : " tiada"}`);
  for (const t of penting) baris.push(`• ${barisTugasan(t, kini)}`);

  // Kerjaya
  const indeks = await bacaIndeks();
  const sehariLalu = kini.getTime() - 86400_000;
  const baru = indeks.filter((i) => i.status === "baru" && new Date(i.dijumpai).getTime() > sehariLalu).sort((a, b) => (b.skor ?? 0) - (a.skor ?? 0));
  const menunggu = indeks.filter((i) => i.status === "draf" || i.status === "perlu_manual");
  const dihantar = indeks.filter((i) => i.status === "dihantar" || i.status === "dimohon_manual");
  const interview = indeks.filter((i) => i.status === "interview");
  baris.push(
    `💼 **Kerjaya:** ${baru.length} kerja baru · ${menunggu.length} permohonan menunggu tindakan · ${dihantar.length} dihantar · ${interview.length} interview`,
  );
  for (const b of baru.slice(0, 2)) baris.push(`• ${b.tajuk} - ${b.syarikat} (${b.skor ?? "?"}%)`);

  const arahan = await arahanUntuk(hariIni);
  const k = await bacaKeutamaan();
  if (arahan.length) baris.push(`📝 Arahan hari ini: ${arahan.map((a) => a.arahan).join("; ")}`);
  baris.push(`🔎 Carian kerja automatik jam ${k.jamCarianKerja}.`);

  // Cadangan utama (berasaskan peraturan, bukan tekaan)
  let cadangan = "";
  if (lewat.length) cadangan = `Selesaikan dahulu tugasan yang lewat: **${lewat[0].tajuk}**.`;
  else if (dekat.length) cadangan = `Deadline paling hampir: **${dekat[0].tajuk}**. Mulakan dengan ini.`;
  else if (menunggu.length) cadangan = `Ada ${menunggu.length} permohonan menunggu: semak dan hantar hari ini.`;
  else if (baru[0] && (baru[0].skor ?? 0) >= 70) cadangan = `Pertimbangkan mohon **${baru[0].tajuk}** (${baru[0].skor}% padan).`;
  if (cadangan) baris.push("", `💡 ${cadangan}`);
  return baris.join("\n");
}
