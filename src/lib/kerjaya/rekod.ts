/**
 * PENJEJAK PERMOHONAN: setiap kerja yang dijumpai disimpan dengan status.
 *   baru → disimpan / diabaikan → draf → dihantar / perlu_manual → interview / ditolak / tawaran
 */
import { bacaJSON, tulisJSON } from "@/lib/store";
import type { IklanKerja } from "./jsearch";
import type { Penilaian } from "./padanan";

export type StatusKerja =
  | "baru"
  | "disimpan"
  | "diabaikan"
  | "draf"
  | "dihantar"
  | "perlu_manual"
  | "dimohon_manual"
  | "interview"
  | "ditolak"
  | "tawaran";

export const LABEL_STATUS: Record<StatusKerja, string> = {
  baru: "Baru",
  disimpan: "Disimpan",
  diabaikan: "Diabaikan",
  draf: "Draf siap",
  dihantar: "Dihantar (emel)",
  perlu_manual: "Perlu mohon manual",
  dimohon_manual: "Dimohon (manual)",
  interview: "Interview",
  ditolak: "Ditolak",
  tawaran: "Tawaran",
};

export type DrafPermohonan = {
  ringkasan: string;
  kemahiran: string[];
  pengalaman: number[]; // indeks pengalaman dalam resume induk
  poinPengalaman: Record<string, number[]>;
  projek: number[];
  poinProjek: Record<string, number[]>;
  coverLetter: string;
  subjek: string;
  dicipta: string;
};

export type RekodKerja = IklanKerja &
  Partial<Omit<Penilaian, "id">> & {
    status: StatusKerja;
    dijumpai: string;
    emelHR?: string | null;
    draf?: DrafPermohonan;
    dihantarPada?: string;
    dikemaskini?: string;
  };

type Indeks = { id: string; tajuk: string; syarikat: string; skor?: number; status: StatusKerja; dijumpai: string }[];

const kunciRekod = (id: string) => `kerja-${id}`;

export const bacaIndeks = () => bacaJSON<Indeks>("kerja-indeks", []);

export async function bacaRekod(id: string): Promise<RekodKerja | null> {
  return bacaJSON<RekodKerja | null>(kunciRekod(id), null);
}

export async function simpanRekod(r: RekodKerja): Promise<void> {
  r.dikemaskini = new Date().toISOString();
  await tulisJSON(kunciRekod(r.id), r);
  const indeks = (await bacaIndeks()).filter((x) => x.id !== r.id);
  indeks.push({ id: r.id, tajuk: r.tajuk, syarikat: r.syarikat, skor: r.skor, status: r.status, dijumpai: r.dijumpai });
  await tulisJSON("kerja-indeks", indeks.slice(-400));
}

export async function kemasStatusKerja(id: string, status: StatusKerja, tambahan: Partial<RekodKerja> = {}): Promise<RekodKerja | null> {
  const r = await bacaRekod(id);
  if (!r) return null;
  const baru = { ...r, ...tambahan, status };
  await simpanRekod(baru);
  return baru;
}

/** Id kerja yang sudah pernah dijumpai (supaya iklan yang sama tidak dihantar berulang kali). */
export async function sudahDilihat(): Promise<Set<string>> {
  return new Set((await bacaIndeks()).map((x) => x.id));
}

/** Cari rekod ikut id atau padanan tajuk/syarikat. */
export async function cariRekod(rujukan: string): Promise<Indeks> {
  const r = rujukan.trim().toLowerCase();
  const indeks = await bacaIndeks();
  const ikutId = indeks.filter((x) => x.id === r);
  if (ikutId.length) return ikutId;
  return indeks.filter((x) => `${x.tajuk} ${x.syarikat}`.toLowerCase().includes(r)).reverse();
}
