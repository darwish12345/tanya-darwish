/**
 * Helper Telegram Bot API.
 * TELEGRAM_API_BASE boleh ditukar untuk ujian (pelayan palsu).
 */
const API = () => process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

export function telegramDisetup(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/** Chat ID pemilik (Darwish). Hanya chat ini boleh memberi arahan kepada agent peribadi. */
export function chatIdPemilik(): string {
  return String(process.env.TELEGRAM_CHAT_ID ?? "");
}

/** Tukar Markdown ringkas dari LLM (**tebal**) kepada HTML Telegram yang selamat. */
export function keHtmlTelegram(teks: string): string {
  const selamat = teks.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return selamat
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|\s)_(.+?)_(?=\s|$)/g, "$1<i>$2</i>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** Hantar mesej. Pulangkan true jika berjaya. Tidak membuang ralat (agent tidak patut terhenti). */
export async function hantarTelegram(
  teks: string,
  chatId: string = chatIdPemilik(),
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) {
    console.error("[telegram] Token atau chat id belum ditetapkan");
    return false;
  }
  try {
    // Telegram hadkan 4096 aksara setiap mesej
    const res = await fetch(`${API()}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: keHtmlTelegram(teks).slice(0, 4000),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error("[telegram] Ditolak:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[telegram] Rangkaian gagal:", e);
    return false;
  }
}

/** Tunjuk "sedang menaip..." semasa agent berfikir. */
export async function tunjukMenaip(chatId: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`${API()}/bot${token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});
}
