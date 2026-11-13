/**
 * WEBHOOK TELEGRAM: POST /api/telegram
 * Telegram menghantar setiap mesej yang diterima oleh bot ke sini.
 * Hanya mesej dari Darwish (TELEGRAM_CHAT_ID) diproses oleh agent peribadi.
 */
import { jalankanAgenPeribadi } from "@/lib/agent/peribadi";
import { bacaSejarahTelegram, simpanSejarahTelegram, bacaStatus, kemasStatus } from "@/lib/data";
import { hantarTelegram, tunjukMenaip, chatIdPemilik } from "@/lib/telegram";
import { rahsiaSah } from "@/lib/rahsia";

type UpdateTelegram = {
  update_id: number;
  message?: { text?: string; chat: { id: number } };
};

const SAMBUTAN = `Hai Darwish! Saya agent peribadi anda. Contoh arahan:
• "Esok pukul 7 pagi ingatkan saya siap sedia interview"
• "Senaraikan peringatan saya"
• "Esok tak perlu cari kerja di LinkedIn"
• "Tambah lokasi carian: Kuala Lumpur atau remote"
• "Ada lead baru?"
• "Ringkasan hari ini"
Taip /reset untuk mula perbualan baru.`;

export async function POST(req: Request) {
  // 1. Pastikan permintaan benar-benar dari Telegram (secret token yang kita tetapkan semasa setup)
  if (!rahsiaSah(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("Tidak dibenarkan", { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as UpdateTelegram | null;
  const teks = update?.message?.text?.trim();
  const chatId = update?.message?.chat.id ? String(update.message.chat.id) : "";
  if (!update || !teks || !chatId) return Response.json({ ok: true }); // abaikan gambar, sticker, dll.

  // 2. Elak proses mesej yang sama dua kali (Telegram mencuba semula jika lambat)
  const status = await bacaStatus();
  if (status.updateTelegramTerakhir && update.update_id <= status.updateTelegramTerakhir) {
    return Response.json({ ok: true });
  }
  await kemasStatus({ updateTelegramTerakhir: update.update_id });

  // 3. Hanya Darwish boleh memberi arahan
  if (chatId !== chatIdPemilik()) {
    await hantarTelegram(
      "Ini bot peribadi Darwish. Untuk berhubung dengan Darwish, sila guna chat di https://tanya-darwish.netlify.app",
      chatId,
    );
    return Response.json({ ok: true });
  }

  // 4. Arahan khas
  if (teks === "/start") {
    await hantarTelegram(SAMBUTAN, chatId);
    return Response.json({ ok: true });
  }
  if (teks === "/reset") {
    await simpanSejarahTelegram([]);
    await hantarTelegram("Perbualan dimulakan semula.", chatId);
    return Response.json({ ok: true });
  }

  // 5. Jalankan agent peribadi
  try {
    await tunjukMenaip(chatId);
    const sejarah = await bacaSejarahTelegram();
    sejarah.push({ role: "user", content: teks.slice(0, 1000) });
    const balasan = await jalankanAgenPeribadi(sejarah);
    sejarah.push({ role: "assistant", content: balasan });
    await simpanSejarahTelegram(sejarah);
    await hantarTelegram(balasan, chatId);
  } catch (e) {
    console.error("[api/telegram]", e);
    await hantarTelegram("Maaf, berlaku ralat semasa memproses arahan anda. Cuba lagi sebentar.", chatId);
  }
  // Sentiasa pulangkan 200 supaya Telegram tidak menghantar semula mesej yang sama
  return Response.json({ ok: true });
}
