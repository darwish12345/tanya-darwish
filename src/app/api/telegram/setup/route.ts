/**
 * SETUP WEBHOOK (sekali sahaja): buka di browser
 *   https://tanya-darwish.netlify.app/api/telegram/setup?kunci=AGENT_SECRET_ANDA
 * Ini memberitahu Telegram untuk menghantar mesej bot ke /api/telegram.
 */
import { rahsiaSah } from "@/lib/rahsia";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!rahsiaSah(url.searchParams.get("kunci"))) {
    return Response.json({ ralat: "Kunci salah, atau AGENT_SECRET belum ditetapkan (minimum 16 aksara)." }, { status: 401 });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return Response.json({ ralat: "TELEGRAM_BOT_TOKEN belum ditetapkan." }, { status: 500 });

  const api = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
  const webhook = `${url.origin}/api/telegram`;

  const set = await fetch(`${api}/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhook,
      secret_token: process.env.AGENT_SECRET,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  }).then((r) => r.json());

  // Menu arahan dalam Telegram
  await fetch(`${api}/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "start", description: "Contoh arahan" },
        { command: "reset", description: "Mula perbualan baru" },
      ],
    }),
  }).catch(() => {});

  return Response.json({
    berjaya: set.ok === true,
    webhook,
    telegram: set,
    seterusnya: set.ok ? "Buka bot anda di Telegram dan hantar /start" : "Semak TELEGRAM_BOT_TOKEN",
  });
}
