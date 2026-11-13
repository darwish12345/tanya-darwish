/**
 * WEBHOOK TELEGRAM: POST /api/telegram
 * Telegram menghantar setiap mesej yang diterima oleh bot ke sini.
 * Hanya mesej dari Darwish (TELEGRAM_CHAT_ID) diproses oleh agent peribadi.
 *
 * Prinsip: SEMUA langkah dalam try/catch. Jika ada ralat, kita rekod langkah mana yang gagal
 * (dipaparkan di /api/sihat), beritahu Darwish, dan tetap pulangkan 200 supaya Telegram
 * tidak menghantar mesej yang sama berulang kali.
 */
import { jalankanAgenPeribadi } from "@/lib/agent/peribadi";
import { bacaSejarahTelegram, simpanSejarahTelegram, bacaStatus, kemasStatus } from "@/lib/data";
import { hantarTelegram, tunjukMenaip, chatIdPemilik, ralatTelegramTerakhir } from "@/lib/telegram";
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

/** Rekod ralat ke storan; jangan sekali-kali biar rekod ralat itu sendiri meranapkan webhook. */
async function rekodRalat(langkah: string, e: unknown) {
  const mesej = `${langkah}: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`.slice(0, 300);
  console.error("[api/telegram]", mesej, e);
  await kemasStatus({ ralatWebhook: { masa: new Date().toISOString(), mesej } }).catch(() => {});
  return mesej;
}

export async function POST(req: Request) {
  // 1. Pastikan permintaan benar-benar dari Telegram (secret token yang kita tetapkan semasa setup)
  if (!rahsiaSah(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("Tidak dibenarkan", { status: 401 });
  }

  let langkah = "baca mesej";
  let chatId = "";
  try {
    const update = (await req.json().catch(() => null)) as UpdateTelegram | null;
    const teks = update?.message?.text?.trim();
    chatId = update?.message?.chat.id ? String(update.message.chat.id) : "";
    if (!update || !teks || !chatId) return Response.json({ ok: true }); // abaikan gambar, sticker, dll.

    // 2. Elak proses mesej yang sama dua kali (Telegram mencuba semula jika lambat)
    langkah = "semak mesej berulang";
    const status = await bacaStatus();
    if (status.updateTelegramTerakhir && update.update_id <= status.updateTelegramTerakhir) {
      return Response.json({ ok: true });
    }
    await kemasStatus({ updateTelegramTerakhir: update.update_id });

    // 3. Hanya Darwish boleh memberi arahan
    if (chatId !== chatIdPemilik()) {
      langkah = "balas orang lain";
      await hantarTelegram(
        "Ini bot peribadi Darwish. Untuk berhubung dengan Darwish, sila guna chat di https://tanya-darwish.netlify.app",
        chatId,
      );
      return Response.json({ ok: true });
    }

    // 4. Arahan khas
    if (teks === "/start") {
      langkah = "hantar sambutan";
      if (!(await hantarTelegram(SAMBUTAN, chatId))) await rekodRalat(langkah, ralatTelegramTerakhir);
      return Response.json({ ok: true });
    }
    if (teks === "/reset") {
      langkah = "reset sejarah";
      await simpanSejarahTelegram([]);
      await hantarTelegram("Perbualan dimulakan semula.", chatId);
      return Response.json({ ok: true });
    }

    // 5. Jalankan agent peribadi
    langkah = "baca sejarah";
    await tunjukMenaip(chatId);
    const sejarah = await bacaSejarahTelegram();
    sejarah.push({ role: "user", content: teks.slice(0, 1000) });

    langkah = "jalankan agent";
    const balasan = await jalankanAgenPeribadi(sejarah);
    sejarah.push({ role: "assistant", content: balasan });

    langkah = "simpan sejarah";
    await simpanSejarahTelegram(sejarah);

    langkah = "hantar balasan";
    if (!(await hantarTelegram(balasan, chatId))) await rekodRalat(langkah, ralatTelegramTerakhir);
  } catch (e) {
    const mesej = await rekodRalat(langkah, e);
    if (chatId === chatIdPemilik()) {
      await hantarTelegram(`Maaf, ralat semasa "${langkah}". Butiran: ${mesej}`, chatId).catch(() => {});
    }
  }
  // Sentiasa pulangkan 200 supaya Telegram tidak menghantar semula mesej yang sama
  return Response.json({ ok: true });
}
