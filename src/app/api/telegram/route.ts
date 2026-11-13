/**
 * WEBHOOK TELEGRAM: POST /api/telegram
 * Mengendalikan: mesej teks, mesej suara (→ Whisper), fail PDF (→ import CV/LinkedIn) dan tekanan butang.
 * Hanya Darwish (TELEGRAM_CHAT_ID) boleh memberi arahan.
 *
 * Prinsip: semua langkah dalam try/catch; ralat direkod (dipaparkan di /api/sihat) dan Darwish
 * dimaklumkan dengan mesej mesra. Sentiasa pulangkan 200 supaya Telegram tidak menghantar semula.
 */
import { jalankanAgenPeribadi } from "@/lib/agent/peribadi";
import {
  bacaSejarahTelegram,
  simpanSejarahTelegram,
  bacaStatus,
  kemasStatus,
  kemasPeringatan,
  kemasTugasan,
  bacaTugasan,
  bacaPeringatan,
} from "@/lib/data";
import { hantarMesej, tunjukMenaip, chatIdPemilik, ralatTelegramTerakhir, jawabButang, ubahMesej, muatTurunFail } from "@/lib/telegram";
import { rahsiaSah } from "@/lib/rahsia";
import { tundaPeringatan } from "@/lib/peringatan";
import { lancar } from "@/lib/kerja";
import { transkripsi } from "@/lib/suara";
import { kemasStatusKerja, bacaRekod } from "@/lib/kerjaya/rekod";
import { ciptaPeringatan } from "@/lib/peringatan";
import { gabungMY, tambahHari, tarikhMY, jamMinitMY } from "@/lib/masa";

type Mesej = {
  message_id: number;
  text?: string;
  chat: { id: number };
  voice?: { file_id: string; duration?: number };
  audio?: { file_id: string; duration?: number };
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
};
type UpdateTelegram = {
  update_id: number;
  message?: Mesej;
  callback_query?: { id: string; data?: string; message?: Mesej };
};

const SAMBUTAN = `Hai Darwish! Saya agent peribadi & kerjaya anda. Contoh:
• "5 minit lagi ingatkan saya minum air"
• "Setiap Isnin, Khamis, Sabtu 6 petang ingatkan kelas boxing"
• "Tambah tugasan siapkan laporan LI, deadline Jumaat 5 petang"
• "Esok tak perlu cari kerja di LinkedIn"
• "Cari kerja sekarang" / "Senarai permohonan saya"
• "Interview ABC Isnin 10 pagi, masukkan dalam kalendar"
• "Tambah pengetahuan: saya lulus OCI AI Foundations"
• Hantar **PDF CV / profil LinkedIn** untuk diimport
• Hantar **voice note**, saya faham juga
/reset = mula perbualan baru`;

async function rekodRalat(langkah: string, e: unknown) {
  const mesej = `${langkah}: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`.slice(0, 300);
  console.error("[api/telegram]", mesej, e);
  await kemasStatus({ ralatWebhook: { masa: new Date().toISOString(), mesej } }).catch(() => {});
  return mesej;
}

/** Tekanan butang di bawah mesej. Format data: "<ruang>:<aksi>:<id>". */
async function kendaliButang(cb: NonNullable<UpdateTelegram["callback_query"]>, chatId: string) {
  const [ruang, aksi, id] = (cb.data ?? "").split(":");
  const mesejId = cb.message?.message_id;
  const teksAsal = cb.message?.text ?? "";
  const tandai = async (nota: string) => {
    if (mesejId) await ubahMesej(chatId, mesejId, `${teksAsal}\n\n${nota}`);
  };

  if (ruang === "p") {
    if (aksi === "tunda") {
      const p = await tundaPeringatan(id, 10);
      await jawabButang(cb.id, p ? "Ditunda 10 minit" : "Peringatan tidak dijumpai");
      if (p) await tandai(`⏰ Ditunda ke ${jamMinitMY(new Date(p.masa))}`);
    } else if (aksi === "siap") {
      await kemasPeringatan(id, { status: "selesai" });
      await jawabButang(cb.id, "Selesai ✅");
      await tandai("✅ Selesai");
    } else if (aksi === "batal") {
      const p = (await bacaPeringatan()).find((x) => x.id === id);
      await kemasPeringatan(id, { status: "dibatal" });
      await jawabButang(cb.id, "Dibatalkan");
      await hantarMesej(`🗑 Dibatalkan: ${p?.teks ?? id}`, { chatId });
    }
    return;
  }
  if (ruang === "t" && aksi === "siap") {
    const t = (await bacaTugasan()).find((x) => x.id === id);
    await kemasTugasan(id, { status: "siap", siapPada: new Date().toISOString() });
    await jawabButang(cb.id, "Tugasan siap ✅");
    await hantarMesej(`✅ Tugasan siap: **${t?.tajuk ?? id}**. Bagus!`, { chatId });
    return;
  }
  if (ruang === "k") {
    if (aksi === "mohon") {
      await jawabButang(cb.id, "Sedang menyediakan resume & cover letter...");
      await tandai("📝 Sedang menyediakan permohonan...");
      await lancar("sediakan-permohonan", { id });
    } else if (aksi === "simpan") {
      await kemasStatusKerja(id, "disimpan");
      await jawabButang(cb.id, "Disimpan ⭐");
      await tandai("⭐ Disimpan");
    } else if (aksi === "abai") {
      await kemasStatusKerja(id, "diabaikan");
      await jawabButang(cb.id, "Diabaikan");
      await tandai("✖️ Diabaikan");
    }
    return;
  }
  if (ruang === "m") {
    if (aksi === "hantar") {
      // KELULUSAN MANUSIA: satu-satunya laluan yang menghantar permohonan melalui emel
      await jawabButang(cb.id, "Menghantar permohonan...");
      await tandai("📧 Sedang dihantar...");
      await lancar("hantar-permohonan", { id });
    } else if (aksi === "batal") {
      await kemasStatusKerja(id, "disimpan");
      await jawabButang(cb.id, "Dibatalkan, draf disimpan");
      await tandai("✖️ Tidak dihantar (draf disimpan)");
    } else if (aksi === "manual") {
      const r = await bacaRekod(id);
      await kemasStatusKerja(id, "dimohon_manual", { dihantarPada: new Date().toISOString() });
      const masa = gabungMY(tambahHari(tarikhMY(), 7), "10:00");
      if (masa && r) await ciptaPeringatan(masa, `Follow-up permohonan ${r.tajuk} di ${r.syarikat}`);
      await jawabButang(cb.id, "Direkod ✅");
      await tandai("✅ Direkod sebagai sudah dimohon. Peringatan follow-up dalam 7 hari.");
    }
    return;
  }
  await jawabButang(cb.id);
}

export async function POST(req: Request) {
  if (!rahsiaSah(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("Tidak dibenarkan", { status: 401 });
  }

  let langkah = "baca mesej";
  let chatId = "";
  try {
    const update = (await req.json().catch(() => null)) as UpdateTelegram | null;
    if (!update) return Response.json({ ok: true });
    const mesej = update.message ?? update.callback_query?.message;
    chatId = mesej?.chat.id ? String(mesej.chat.id) : "";
    if (!chatId) return Response.json({ ok: true });

    // Elak proses update yang sama dua kali (Telegram mencuba semula jika lambat)
    langkah = "semak mesej berulang";
    const status = await bacaStatus();
    if (status.updateTelegramTerakhir && update.update_id <= status.updateTelegramTerakhir) return Response.json({ ok: true });
    await kemasStatus({ updateTelegramTerakhir: update.update_id });

    if (chatId !== chatIdPemilik()) {
      await hantarMesej("Ini bot peribadi Darwish. Untuk berhubung dengan Darwish, sila guna chat di https://tanya-darwish.netlify.app", { chatId });
      return Response.json({ ok: true });
    }

    // Butang
    if (update.callback_query) {
      langkah = "kendali butang";
      await kendaliButang(update.callback_query, chatId);
      return Response.json({ ok: true });
    }
    if (!update.message) return Response.json({ ok: true });

    // Fail PDF → import CV / LinkedIn
    const dok = update.message.document;
    if (dok) {
      langkah = "import PDF";
      if (dok.mime_type !== "application/pdf") {
        await hantarMesej("Saya hanya boleh membaca fail **PDF** (CV atau profil LinkedIn yang disimpan sebagai PDF).", { chatId });
      } else if ((dok.file_size ?? 0) > 10 * 1024 * 1024) {
        await hantarMesej("Fail terlalu besar (maksimum 10 MB).", { chatId });
      } else {
        await hantarMesej("📄 Sedang membaca PDF anda... (sekitar 30 saat)", { chatId });
        await lancar("import-pdf", { fileId: dok.file_id, namaFail: dok.file_name ?? "" });
      }
      return Response.json({ ok: true });
    }

    // Teks atau suara
    let teks = update.message.text?.trim() ?? "";
    let dariSuara = false;
    const suara = update.message.voice ?? update.message.audio;
    if (!teks && suara) {
      langkah = "transkripsi suara";
      if ((suara.duration ?? 0) > 120) {
        await hantarMesej("Voice note terlalu panjang (maksimum 2 minit).", { chatId });
        return Response.json({ ok: true });
      }
      await tunjukMenaip(chatId);
      const bytes = await muatTurunFail(suara.file_id);
      teks = bytes ? await transkripsi(bytes) : "";
      if (!teks) {
        await hantarMesej("Maaf, saya tak dapat dengar voice note itu dengan jelas. Cuba sekali lagi?", { chatId });
        return Response.json({ ok: true });
      }
      dariSuara = true;
    }
    if (!teks) return Response.json({ ok: true });

    if (teks === "/start" || teks === "/bantuan") {
      await hantarMesej(SAMBUTAN, { chatId });
      return Response.json({ ok: true });
    }
    if (teks === "/briefing") {
      const { binaBriefing } = await import("@/lib/briefing");
      await hantarMesej(await binaBriefing(), { chatId });
      return Response.json({ ok: true });
    }
    // Arahan menu → ayat biasa untuk agent
    const MENU: Record<string, string> = {
      "/tugasan": "Senaraikan tugasan saya yang belum siap",
      "/peringatan": "Senaraikan peringatan aktif saya",
      "/kerja": "Cari kerja sekarang",
      "/permohonan": "Senaraikan status permohonan kerja saya",
    };
    if (MENU[teks.split("@")[0]]) teks = MENU[teks.split("@")[0]];
    if (teks === "/reset") {
      await simpanSejarahTelegram([]);
      await hantarMesej("Perbualan dimulakan semula.", { chatId });
      return Response.json({ ok: true });
    }

    langkah = "baca sejarah";
    await tunjukMenaip(chatId);
    const sejarah = await bacaSejarahTelegram();
    sejarah.push({ role: "user", content: teks.slice(0, 1500) });

    langkah = "jalankan agent";
    const hasil = await jalankanAgenPeribadi(sejarah);
    sejarah.push({ role: "assistant", content: hasil.teks });

    langkah = "simpan sejarah";
    await simpanSejarahTelegram(sejarah);

    langkah = "hantar balasan";
    const awalan = dariSuara ? `🎙️ _"${teks.slice(0, 200)}"_\n\n` : "";
    if ((await hantarMesej(awalan + hasil.teks, { chatId, papan: hasil.papan })) === null) {
      await rekodRalat(langkah, ralatTelegramTerakhir);
    }
  } catch (e) {
    const mesej = await rekodRalat(langkah, e);
    if (chatId === chatIdPemilik()) {
      const sibuk = /429|rate.?limit/i.test(mesej);
      await hantarMesej(
        sibuk
          ? "Maaf, otak AI saya sedang sibuk (had percuma). Cuba lagi dalam seminit."
          : `Maaf, ada masalah teknikal semasa "${langkah}". Butiran telah direkod. Cuba lagi sebentar.`,
        { chatId },
      ).catch(() => {});
    }
  }
  return Response.json({ ok: true });
}
