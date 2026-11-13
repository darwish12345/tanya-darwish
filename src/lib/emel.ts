/**
 * EMEL melalui Gmail (percuma).
 * Env: GMAIL_USER (alamat Gmail) + GMAIL_APP_PASSWORD (App Password 16 aksara, bukan kata laluan biasa).
 * Agent TIDAK pernah menghantar emel tanpa kelulusan Darwish (butang "Hantar" di Telegram).
 */
import nodemailer from "nodemailer";

export function emelDisetup(): boolean {
  return Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
}

export type Lampiran = { namaFail: string; kandungan: Uint8Array; jenis?: string };

export async function hantarEmel(opsyen: {
  kepada: string;
  subjek: string;
  teks: string;
  lampiran?: Lampiran[];
  balasKe?: string;
}): Promise<{ ok: boolean; ralat?: string }> {
  if (!emelDisetup()) return { ok: false, ralat: "Gmail belum disetup (GMAIL_USER / GMAIL_APP_PASSWORD)" };
  const pengirim = process.env.GMAIL_USER!.trim();
  try {
    const pengangkut = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: { user: pengirim, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "") },
    });
    await pengangkut.sendMail({
      from: pengirim,
      to: opsyen.kepada,
      replyTo: opsyen.balasKe,
      subject: opsyen.subjek,
      text: opsyen.teks,
      attachments: opsyen.lampiran?.map((l) => ({
        filename: l.namaFail,
        content: Buffer.from(l.kandungan),
        contentType: l.jenis ?? "application/pdf",
      })),
    });
    return { ok: true };
  } catch (e) {
    const ralat = e instanceof Error ? e.message : String(e);
    console.error("[emel]", ralat);
    return { ok: false, ralat };
  }
}
