/**
 * TOOLS: apa yang agent BOLEH lakukan.
 *
 * Setiap tool ada dua bahagian:
 *   - definisi: nama, penerangan dan skema input (dihantar kepada LLM supaya ia tahu tool ini wujud)
 *   - jalankan: kod sebenar yang dilaksanakan oleh program kita (LLM tidak boleh menjalankannya sendiri)
 *
 * Untuk menambah tool baru: tambah satu objek dalam senarai TOOLS di bawah.
 */
import { z } from "zod";
import { cariPengetahuan } from "@/lib/rag/knowledge";
import { senaraiProjekSemua, keKad } from "@/lib/projects";
import { buatTool, keDefinisi, jalankanToolDari, type SebarangTool, type HasilTool } from "./rangka";
import { simpanLead } from "@/lib/data";
import { hantarTelegram, telegramDisetup } from "@/lib/telegram";
import { nilaiJobDescription } from "@/lib/kerjaya/padanan";
import { kalendarDisetup, slotKosong, ciptaAcara, paparSlot } from "@/lib/kalendar";
import { emelDisetup, hantarEmel } from "@/lib/emel";
import { ciptaPeringatan } from "@/lib/peringatan";
import { bacaJSON, tulisJSON } from "@/lib/store";
import { tarikhMY, paparMY } from "@/lib/masa";

export type { HasilTool };

// ---------------------------------------------------------------------------
// 1. cari_pengetahuan: RAG
// ---------------------------------------------------------------------------
const cariPengetahuanTool = buatTool({
  nama: "cari_pengetahuan",
  penerangan:
    "Cari maklumat tentang Darwish (profil, pendidikan, pengalaman, kemahiran, projek, sijil, soalan lazim). Wajib digunakan sebelum menjawab apa-apa fakta tentang Darwish.",
  skema: z.object({
    soalan: z.string().min(2).max(200).describe("Kata kunci atau soalan untuk dicari, contoh 'sijil' atau 'pengalaman AI'"),
  }),
  async jalankan({ soalan }) {
    const ketul = await cariPengetahuan(soalan);
    if (ketul.length === 0) {
      return { untukLLM: { hasil: [], nota: "Tiada maklumat dijumpai. Jangan meneka." }, tiadaHasil: true };
    }
    return {
      untukLLM: { hasil: ketul.map((k) => ({ sumber: k.sumber, tajuk: k.tajuk, teks: k.teks })) },
    };
  },
});

// ---------------------------------------------------------------------------
// 2. papar_projek: pulangkan data kad projek untuk UI
// ---------------------------------------------------------------------------
const paparProjekTool = buatTool({
  nama: "papar_projek",
  penerangan:
    "Paparkan kad projek Darwish kepada pelawat (dengan link repo/demo). Guna bila pelawat mahu melihat projek, repo GitHub atau hasil kerja. Kosongkan 'tag' untuk semua projek.",
  skema: z.object({
    tag: z.string().max(30).optional().describe("Tapis ikut tag, contoh 'ai' atau 'web'. Kosongkan untuk semua."),
  }),
  async jalankan({ tag }) {
    let projek = await senaraiProjekSemua();
    if (tag) {
      const t = tag.toLowerCase();
      const ditapis = projek.filter((p) => p.tag.includes(t) || p.tech.some((x) => x.toLowerCase().includes(t)));
      if (ditapis.length > 0) projek = ditapis;
    }
    const kad = projek.slice(0, 6).map(keKad);
    return {
      untukLLM: {
        dipaparkan: kad.map((k) => ({ nama: k.nama, ringkasan: k.ringkasan, link: k.link })),
        nota: "Kad sudah dipaparkan di skrin pelawat. Jangan senaraikan semula semua butiran, cukup ringkasan pendek.",
      },
      kad,
    };
  },
});

// ---------------------------------------------------------------------------
// 3. maklum_darwish: hantar notifikasi Telegram kepada Darwish
// ---------------------------------------------------------------------------
const maklumDarwishTool = buatTool({
  nama: "maklum_darwish",
  penerangan:
    "Hantar mesej pelawat kepada Darwish (notifikasi Telegram + disimpan sebagai lead). Guna HANYA selepas pelawat memberi nama dan mesej mereka.",
  skema: z.object({
    nama: z.string().min(1).max(80),
    syarikat: z.string().max(80).optional(),
    jawatan: z.string().max(100).optional().describe("Jawatan yang ditawarkan atau dibincangkan, jika ada"),
    hubungan: z.string().max(120).optional().describe("Emel atau LinkedIn pelawat, jika diberi"),
    jenis: z.enum(["recruiter", "kawan", "lain"]).describe("Siapa pelawat ini, berdasarkan perbualan"),
    mesej: z.string().min(1).max(500),
    ringkasan: z
      .string()
      .max(300)
      .describe("Ringkasan satu ayat: apa yang pelawat tanya atau minati sebelum ini dalam perbualan"),
  }),
  async jalankan(lead) {
    // 1. Simpan dahulu, supaya lead tidak hilang walaupun Telegram gagal
    let disimpan = false;
    try {
      await simpanLead({ ...lead, masa: new Date().toISOString() });
      disimpan = true;
    } catch (e) {
      console.error("[maklum_darwish] Gagal simpan lead:", e);
    }

    // 2. Notifikasi Telegram yang tersusun
    const label = lead.jenis === "recruiter" ? "Recruiter" : lead.jenis === "kawan" ? "Kawan" : "Pelawat";
    const teks = [
      `**Lead baru: ${label}**`,
      `Nama: ${lead.nama}`,
      lead.syarikat ? `Syarikat: ${lead.syarikat}` : "",
      lead.jawatan ? `Jawatan: ${lead.jawatan}` : "",
      lead.hubungan ? `Hubungan: ${lead.hubungan}` : "",
      `Mesej: ${lead.mesej}`,
      lead.ringkasan ? `Konteks: ${lead.ringkasan}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const dihantar = telegramDisetup() ? await hantarTelegram(teks) : false;

    // 3. Jujur dengan pelawat tentang status sebenar
    if (dihantar) return { untukLLM: { status: "dihantar" } };
    if (disimpan) {
      return {
        untukLLM: {
          status: "disimpan",
          nota: "Mesej disimpan dengan selamat dan Darwish akan melihatnya dalam laporan hariannya. Beritahu pelawat begitu (bukan 'dihantar serta-merta').",
        },
      };
    }
    return {
      untukLLM: {
        status: "gagal",
        nota: "Mesej TIDAK sampai kepada Darwish. Beritahu pelawat dengan jujur dan cadangkan mereka cuba lagi nanti atau hubungi Darwish melalui LinkedIn.",
      },
    };
  },
});

// ---------------------------------------------------------------------------
// 4. nilai_padanan_jawatan: recruiter tampal job description
// ---------------------------------------------------------------------------
const nilaiPadananTool = buatTool({
  nama: "nilai_padanan_jawatan",
  penerangan:
    "Nilai sejauh mana profil Darwish sepadan dengan job description yang ditampal oleh pelawat. Guna bila pelawat memberi teks iklan/job description atau bertanya 'sesuai tak Darwish untuk jawatan ini'.",
  skema: z.object({
    job_description: z.string().min(40).max(6000).describe("Teks penuh job description dari pelawat"),
  }),
  async jalankan({ job_description }) {
    const h = await nilaiJobDescription(job_description);
    return {
      untukLLM: {
        skor: h.skor,
        ringkasan: h.ringkasan,
        padan: h.padan,
        kurang: h.kurang,
        nota: "Laporkan skor, perkara yang sepadan dan yang kurang dengan jujur. Cadangkan pelawat tempah interview jika sesuai.",
      },
    };
  },
});

// ---------------------------------------------------------------------------
// 5. semak_slot_interview + 6. tempah_interview (Google Calendar Darwish)
// ---------------------------------------------------------------------------
const semakSlotTool = buatTool({
  nama: "semak_slot_interview",
  penerangan: "Senaraikan slot masa kosong dalam kalendar Darwish untuk interview/meeting (7 hari akan datang).",
  skema: z.object({}),
  async jalankan() {
    if (!kalendarDisetup()) {
      return { untukLLM: { status: "tidak tersedia", nota: "Tempahan automatik belum aktif. Cadangkan pelawat tinggalkan mesej (maklum_darwish) dengan masa pilihan mereka." } };
    }
    const slot = await slotKosong();
    return {
      untukLLM: {
        slot: slot.map((iso) => ({ id: iso, papar: paparSlot(iso) })),
        nota: "Tunjuk slot (papar) sebagai senarai bernombor. Bila pelawat pilih, minta nama dan emel, kemudian panggil tempah_interview dengan id slot.",
      },
    };
  },
});

const tempahInterviewTool = buatTool({
  nama: "tempah_interview",
  penerangan: "Tempah slot interview/meeting dengan Darwish. Guna HANYA selepas pelawat memilih slot dari semak_slot_interview DAN memberi nama serta emel.",
  skema: z.object({
    slot: z.string().describe("id slot (masa ISO) dari semak_slot_interview"),
    nama: z.string().min(2).max(80),
    emel: z.string().email().max(120),
    syarikat: z.string().max(80).optional(),
    tujuan: z.string().max(300).optional().describe("Contoh: interview jawatan Junior Developer"),
  }),
  async jalankan({ slot, nama, emel, syarikat, tujuan }) {
    if (!kalendarDisetup()) return { untukLLM: { status: "tidak tersedia" } };
    const mula = new Date(slot);
    if (Number.isNaN(mula.getTime()) || mula.getTime() < Date.now() + 3600_000) {
      return { untukLLM: { ralat: "Slot tidak sah atau sudah terlalu hampir. Semak slot semula." } };
    }
    // Guardrail: maksimum 5 tempahan sehari dari laman web (elak spam)
    const kunci = `tempahan-${tarikhMY()}`;
    const hariIni = await bacaJSON<number>(kunci, 0);
    if (hariIni >= 5) return { untukLLM: { ralat: "Had tempahan hari ini dicapai. Minta pelawat tinggalkan mesej." } };
    // Slot mesti salah satu slot sah (waktu interview Darwish, ≥12 jam lagi, masih kosong).
    // Ini menghalang pelawat "memujuk" agent menempah masa lain (contoh 3 pagi hari Ahad).
    const sah = await slotKosong({ hari: 14, maks: 500 });
    if (!sah.includes(mula.toISOString())) {
      return { untukLLM: { ralat: "Slot itu tidak tersedia. Panggil semak_slot_interview dan tunjuk slot yang sah sahaja." } };
    }

    const tajuk = `Interview/Meeting: ${nama}${syarikat ? ` (${syarikat})` : ""}`;
    await ciptaAcara({ tajuk, mula, minit: 30, penerangan: `Ditempah melalui Tanya Darwish.\nNama: ${nama}\nEmel: ${emel}\nSyarikat: ${syarikat ?? "-"}\nTujuan: ${tujuan ?? "-"}` });
    await tulisJSON(kunci, hariIni + 1);
    await simpanLead({ masa: new Date().toISOString(), nama, syarikat, hubungan: emel, jenis: "recruiter", mesej: `Tempah interview ${paparMY(mula)}. ${tujuan ?? ""}`.trim() });
    // Peringatan untuk Darwish: sehari dan sejam sebelum
    for (const [minitSebelum, label] of [[24 * 60, "esok"], [60, "dalam 1 jam"]] as const) {
      const masa = new Date(mula.getTime() - minitSebelum * 60_000);
      if (masa.getTime() > Date.now()) await ciptaPeringatan(masa, `Interview ${label}: ${nama}${syarikat ? ` (${syarikat})` : ""}`);
    }
    if (telegramDisetup()) await hantarTelegram(`📅 **Interview baru ditempah**\n${tajuk}\n${paparMY(mula)}\nEmel: ${emel}\nTujuan: ${tujuan ?? "-"}`);
    if (emelDisetup()) {
      await hantarEmel({
        kepada: emel,
        subjek: "Confirmed: meeting with Muhammad Darwish",
        teks: `Hi ${nama},\n\nThank you for booking a meeting with me. Confirmed for ${paparMY(mula)} (Malaysia time, 30 minutes).\nI will follow up with the meeting link if needed.\n\nBest regards,\nMuhammad Darwish`,
      });
    }
    return { untukLLM: { status: "ditempah", masa: paparMY(mula), emelPengesahan: emelDisetup() } };
  },
});

// ---------------------------------------------------------------------------
// Senarai semua tools agent web
// ---------------------------------------------------------------------------
export const TOOLS: SebarangTool[] = [
  cariPengetahuanTool,
  paparProjekTool,
  maklumDarwishTool,
  nilaiPadananTool,
  semakSlotTool,
  tempahInterviewTool,
];
export const DEFINISI_TOOLS = keDefinisi(TOOLS);
export const jalankanTool = (nama: string, argumen: string) => jalankanToolDari(TOOLS, nama, argumen);
