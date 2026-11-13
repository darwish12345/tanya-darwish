/**
 * Helper Telegram Bot API.
 * TELEGRAM_API_BASE boleh ditukar untuk ujian (pelayan palsu).
 */
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
  const token = tokenBot();
  if (!token || !chatId) {
    ralatTelegramTerakhir = "Token atau chat id belum ditetapkan";
    console.error("[telegram]", ralatTelegramTerakhir);
    return false;
  }
  const hantar = (badan: Record<string, unknown>) =>
    fetch(`${API()}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, disable_web_page_preview: true, ...badan }),
    });
  try {
    // Cuba dengan format HTML; jika Telegram tolak format itu, hantar sebagai teks biasa
    let res = await hantar({ text: keHtmlTelegram(teks).slice(0, 4000), parse_mode: "HTML" });
    if (res.status === 400) res = await hantar({ text: teks.replace(/\*\*/g, "").slice(0, 4000) });
    if (!res.ok) {
      ralatTelegramTerakhir = `sendMessage ${res.status}: ${(await res.text()).slice(0, 200)}`;
      console.error("[telegram] Ditolak:", ralatTelegramTerakhir);
      return false;
    }
    ralatTelegramTerakhir = null;
    return true;
  } catch (e) {
    ralatTelegramTerakhir = `Rangkaian gagal: ${e instanceof Error ? e.message : String(e)}`;
    console.error("[telegram]", ralatTelegramTerakhir);
    return false;
  }
}

/** Tunjuk "sedang menaip..." semasa agent berfikir. */
export async function tunjukMenaip(chatId: string): Promise<void> {
  const token = tokenBot();
  if (!token) return;
  await fetch(`${API()}/bot${token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});
}

/** Semak token dengan getMe: pulangkan username bot jika token sah. */
export async function semakBot(): Promise<{ ok: boolean; bot?: string; ralat?: string }> {
  const token = tokenBot();
  if (!token) return { ok: false, ralat: "Token tiada" };
  try {
    const res = await fetch(`${API()}/bot${token}/getMe`);
    const d = (await res.json()) as { ok: boolean; result?: { username: string }; description?: string };
    return d.ok ? { ok: true, bot: `@${d.result?.username}` } : { ok: false, ralat: `${res.status} ${d.description ?? ""}` };
  } catch (e) {
    return { ok: false, ralat: e instanceof Error ? e.message : String(e) };
  }
}
