/**
 * Helper Telegram Bot API: mesej, butang (inline keyboard), dokumen dan fail.
 * TELEGRAM_API_BASE boleh ditukar untuk ujian (pelayan palsu).
 */
import { bersihkanOutput } from "@/lib/teks";

const API = () => process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

/** Nilai env dibersihkan: ruang/baris baru yang terikut semasa tampal di Netlify dibuang. */
export function tokenBot(): string {
  return (process.env.TELEGRAM_BOT_TOKEN ?? "").trim().replace(/^bot/i, "");
}

export function telegramDisetup(): boolean {
  return Boolean(tokenBot() && chatIdPemilik());
}

/** Chat ID pemilik (Darwish). Hanya chat ini boleh memberi arahan kepada agent peribadi. */
export function chatIdPemilik(): string {
  return String(process.env.TELEGRAM_CHAT_ID ?? "").trim();
}

/** Ralat Telegram terakhir disimpan dalam memori supaya /api/sihat boleh tunjukkan (bukan senyap). */
export let ralatTelegramTerakhir: string | null = null;

/** Satu butang: teks dipaparkan + data yang dihantar semula bila ditekan (maks 64 bait). */
export type Butang = { teks: string; data?: string; url?: string };
/** Baris-baris butang di bawah mesej. */
export type Papan = Butang[][];

function kePapanTelegram(papan?: Papan) {
  if (!papan?.length) return undefined;
  return {
    inline_keyboard: papan.map((baris) =>
      baris.map((b) => (b.url ? { text: b.teks, url: b.url } : { text: b.teks, callback_data: (b.data ?? "").slice(0, 64) })),
    ),
  };
}

/** Tukar Markdown ringkas dari LLM (**tebal**) kepada HTML Telegram yang selamat. */
export function keHtmlTelegram(teks: string): string {
  const selamat = teks.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return selamat
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|\s)_(.+?)_(?=\s|$)/g, "$1<i>$2</i>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

async function panggil(method: string, badan: Record<string, unknown>): Promise<Response> {
  return fetch(`${API()}/bot${tokenBot()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(badan),
  });
}

function rekodRalat(ralat: string) {
  ralatTelegramTerakhir = ralat;
  console.error("[telegram]", ralat);
}

/**
 * Hantar mesej (dengan butang pilihan). Pulangkan message_id jika berjaya, null jika gagal.
 * Tidak membuang ralat: agent tidak patut terhenti kerana Telegram.
 */
export async function hantarMesej(
  teks: string,
  opsyen: { chatId?: string; papan?: Papan } = {},
): Promise<number | null> {
  const chatId = opsyen.chatId ?? chatIdPemilik();
  if (!tokenBot() || !chatId) {
    rekodRalat("Token atau chat id belum ditetapkan");
    return null;
  }
  const bersih = bersihkanOutput(teks) || "(tiada kandungan)";
  const asas = { chat_id: chatId, disable_web_page_preview: true, reply_markup: kePapanTelegram(opsyen.papan) };
  try {
    // Cuba dengan format HTML; jika Telegram tolak format itu, hantar sebagai teks biasa
    let res = await panggil("sendMessage", { ...asas, text: keHtmlTelegram(bersih).slice(0, 4000), parse_mode: "HTML" });
    if (res.status === 400) res = await panggil("sendMessage", { ...asas, text: bersih.replace(/\*\*/g, "").slice(0, 4000) });
    if (!res.ok) {
      rekodRalat(`sendMessage ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    ralatTelegramTerakhir = null;
    const d = (await res.json().catch(() => ({}))) as { result?: { message_id?: number } };
    return d.result?.message_id ?? 0;
  } catch (e) {
    rekodRalat(`Rangkaian gagal: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Versi ringkas (serasi dengan kod lama): pulangkan true/false. */
export async function hantarTelegram(teks: string, chatId: string = chatIdPemilik()): Promise<boolean> {
  return (await hantarMesej(teks, { chatId })) !== null;
}

/** Ubah teks mesej sedia ada (contoh selepas butang ditekan) dan buang/ganti butang. */
export async function ubahMesej(chatId: string, messageId: number, teks: string, papan?: Papan): Promise<void> {
  const bersih = bersihkanOutput(teks);
  const res = await panggil("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: keHtmlTelegram(bersih).slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: kePapanTelegram(papan) ?? { inline_keyboard: [] },
  }).catch(() => null);
  if (res && !res.ok) console.error("[telegram] editMessageText:", res.status, await res.text().catch(() => ""));
}

/** Jawab tekanan butang (hilangkan ikon "loading" pada butang). */
export async function jawabButang(callbackId: string, teks?: string): Promise<void> {
  await panggil("answerCallbackQuery", { callback_query_id: callbackId, text: teks?.slice(0, 190) }).catch(() => {});
}

/** Hantar fail (contoh PDF resume). */
export async function hantarDokumen(
  namaFail: string,
  kandungan: Uint8Array,
  opsyen: { kapsyen?: string; papan?: Papan; chatId?: string } = {},
): Promise<boolean> {
  const chatId = opsyen.chatId ?? chatIdPemilik();
  if (!tokenBot() || !chatId) return false;
  const borang = new FormData();
  borang.append("chat_id", chatId);
  borang.append("document", new Blob([kandungan as BlobPart], { type: "application/pdf" }), namaFail);
  if (opsyen.kapsyen) {
    borang.append("caption", keHtmlTelegram(bersihkanOutput(opsyen.kapsyen)).slice(0, 1000));
    borang.append("parse_mode", "HTML");
  }
  const papan = kePapanTelegram(opsyen.papan);
  if (papan) borang.append("reply_markup", JSON.stringify(papan));
  try {
    const res = await fetch(`${API()}/bot${tokenBot()}/sendDocument`, { method: "POST", body: borang });
    if (!res.ok) {
      rekodRalat(`sendDocument ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    rekodRalat(`sendDocument gagal: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** Muat turun fail yang dihantar oleh pengguna (dokumen / mesej suara). */
export async function muatTurunFail(fileId: string): Promise<Uint8Array | null> {
  try {
    const r = await panggil("getFile", { file_id: fileId });
    const d = (await r.json()) as { ok: boolean; result?: { file_path: string } };
    if (!d.ok || !d.result) return null;
    const f = await fetch(`${API()}/file/bot${tokenBot()}/${d.result.file_path}`);
    if (!f.ok) return null;
    return new Uint8Array(await f.arrayBuffer());
  } catch (e) {
    console.error("[telegram] muatTurunFail:", e);
    return null;
  }
}

/** Tunjuk "sedang menaip..." semasa agent berfikir. */
export async function tunjukMenaip(chatId: string): Promise<void> {
  if (!tokenBot()) return;
  await panggil("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
}

/** Semak token dengan getMe: pulangkan username bot jika token sah. */
export async function semakBot(): Promise<{ ok: boolean; bot?: string; ralat?: string }> {
  if (!tokenBot()) return { ok: false, ralat: "Token tiada" };
  try {
    const res = await fetch(`${API()}/bot${tokenBot()}/getMe`);
    const d = (await res.json()) as { ok: boolean; result?: { username: string }; description?: string };
    return d.ok ? { ok: true, bot: `@${d.result?.username}` } : { ok: false, ralat: `${res.status} ${d.description ?? ""}` };
  } catch (e) {
    return { ok: false, ralat: e instanceof Error ? e.message : String(e) };
  }
}
