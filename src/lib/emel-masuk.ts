/**
 * PEMANTAU INBOX GMAIL (IMAP): maklumkan Darwish bila recruiter membalas.
 * Guna GMAIL_USER + GMAIL_APP_PASSWORD yang sama. Hanya membaca maklumat sampul
 * (pengirim & subjek) emel baru, dan tidak memadam atau menanda apa-apa.
 */
import { ImapFlow } from "imapflow";
import { emelDisetup } from "@/lib/emel";
import { bacaStatus, kemasStatus } from "@/lib/data";
import { hantarMesej } from "@/lib/telegram";
import { bacaIndeks, bacaRekod } from "@/lib/kerjaya/rekod";

const KATA_KUNCI = /interview|temuduga|temu duga|application|permohonan|shortlist|offer|tawaran|assessment|recruit|hiring|jawatan|position|career/i;

async function domainSyarikatDimohon(): Promise<Set<string>> {
  const domain = new Set<string>();
  for (const x of (await bacaIndeks()).filter((i) => i.status === "dihantar").slice(-50)) {
    const r = await bacaRekod(x.id);
    const d = r?.emelHR?.split("@")[1]?.toLowerCase();
    if (d && !/gmail|yahoo|hotmail|outlook/.test(d)) domain.add(d);
  }
  return domain;
}

export type EmelPenting = { daripada: string; subjek: string; tarikh: string };

export async function semakEmelMasuk(): Promise<EmelPenting[]> {
  if (!emelDisetup()) return [];
  const klien = new ImapFlow({
    host: process.env.IMAP_HOST || "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: process.env.GMAIL_USER!.trim(), pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "") },
    logger: false,
    socketTimeout: 8000,
    greetingTimeout: 5000,
  });
  const penting: EmelPenting[] = [];
  await klien.connect();
  const kunci = await klien.getMailboxLock("INBOX");
  try {
    const status = await bacaStatus();
    const peti = klien.mailbox;
    const uidSeterusnya = peti && typeof peti === "object" ? Number(peti.uidNext ?? 1) : 1;
    // Kali pertama: mula dari sekarang (jangan banjiri dengan emel lama)
    if (!status.emelUidTerakhir) {
      await kemasStatus({ emelUidTerakhir: uidSeterusnya - 1 });
      return [];
    }
    if (uidSeterusnya - 1 <= status.emelUidTerakhir) return [];

    const domain = await domainSyarikatDimohon();
    let tertinggi = status.emelUidTerakhir;
    let bilangan = 0;
    for await (const m of klien.fetch(`${status.emelUidTerakhir + 1}:*`, { envelope: true, uid: true }, { uid: true })) {
      if (++bilangan > 40) break;
      tertinggi = Math.max(tertinggi, m.uid);
      const dari = m.envelope?.from?.[0];
      const alamat = (dari?.address ?? "").toLowerCase();
      const subjek = m.envelope?.subject ?? "";
      const dariSyarikat = [...domain].some((d) => alamat.endsWith(`@${d}`));
      if (dariSyarikat || KATA_KUNCI.test(subjek)) {
        penting.push({ daripada: dari?.name ? `${dari.name} <${alamat}>` : alamat, subjek, tarikh: m.envelope?.date ? new Date(m.envelope.date).toISOString() : "" });
      }
    }
    await kemasStatus({ emelUidTerakhir: tertinggi });
  } finally {
    kunci.release();
    await klien.logout().catch(() => {});
  }

  if (penting.length) {
    await hantarMesej(
      `📬 **${penting.length} emel berkaitan kerjaya:**\n${penting.map((e) => `• ${e.subjek}\n   _${e.daripada}_`).join("\n")}\n\nSemak Gmail anda untuk membalas.`,
    );
  }
  return penting;
}
