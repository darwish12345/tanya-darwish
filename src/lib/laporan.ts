/**
 * LAPORAN HARIAN: dihantar ke Telegram setiap malam (21:00 waktu Malaysia).
 * Tiada LLM digunakan: nombor dan senarai diambil terus dari data, jadi sentiasa tepat.
 */
import { tarikhMY, tambahHari, paparMY } from "@/lib/masa";
import { bacaLogHari, bacaLeads, bacaPeringatan, arahanUntuk } from "@/lib/data";

export async function binaLaporan(tarikh: string = tarikhMY()): Promise<string> {
  const log = await bacaLogHari(tarikh);
  const leads = (await bacaLeads()).filter((l) => tarikhMY(new Date(l.masa)) === tarikh);
  const esok = tambahHari(tarikh, 1);
  const peringatanEsok = (await bacaPeringatan()).filter((p) => !p.dihantar && tarikhMY(new Date(p.masa)) === esok);
  const arahanEsok = await arahanUntuk(esok);

  const gagal = log.filter((l) => l.tiadaJawapan);
  const kiraan = new Map<string, number>();
  for (const l of log) {
    const k = l.soalan.trim().toLowerCase();
    kiraan.set(k, (kiraan.get(k) ?? 0) + 1);
  }
  const popular = [...kiraan.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const baris: string[] = [`**Laporan harian Tanya Darwish (${tarikh})**`, ""];
  baris.push(`Soalan dari pelawat web: **${log.length}**`);
  if (popular.length) {
    baris.push("Paling kerap ditanya:");
    for (const [s, n] of popular) baris.push(`• ${s.slice(0, 80)}${n > 1 ? ` (${n}x)` : ""}`);
  }
  if (gagal.length) {
    baris.push("", `**Agent tak dapat jawab (${gagal.length})**: pertimbangkan tambah dalam content/`);
    for (const g of gagal.slice(0, 5)) baris.push(`• ${g.soalan.slice(0, 80)}`);
  }
  baris.push("", `Lead baru: **${leads.length}**`);
  for (const l of leads.slice(0, 5)) {
    baris.push(`• ${l.nama}${l.syarikat ? ` (${l.syarikat})` : ""}: ${l.mesej.slice(0, 80)}`);
  }
  if (peringatanEsok.length || arahanEsok.length) {
    baris.push("", "**Esok:**");
    for (const p of peringatanEsok) baris.push(`• ${paparMY(new Date(p.masa))}: ${p.teks}`);
    for (const a of arahanEsok) baris.push(`• Arahan: ${a.arahan}`);
  }
  return baris.join("\n");
}
