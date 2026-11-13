/**
 * STORAN KEKAL (memori jangka panjang agent)
 *
 * - Di Netlify: guna Netlify Blobs (percuma, tiada setup).
 * - Di laptop / ujian: simpan sebagai fail JSON dalam folder .data/
 *
 * Kod lain hanya guna bacaJSON() dan tulisJSON(), jadi storan boleh ditukar
 * (contoh ke Supabase) tanpa mengubah agent.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { getStore } from "@netlify/blobs";

const NAMA_STORE = "tanya-darwish";

type Storan = {
  baca<T>(kunci: string): Promise<T | null>;
  tulis(kunci: string, data: unknown): Promise<void>;
};

function storanFail(): Storan {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), ".data");
  const fail = (k: string) => path.join(dir, `${k.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  return {
    async baca<T>(k: string) {
      try {
        return JSON.parse(await fs.readFile(fail(k), "utf8")) as T;
      } catch {
        return null;
      }
    },
    async tulis(k: string, data: unknown) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fail(k), JSON.stringify(data, null, 2));
    },
  };
}

function storanNetlify(): Storan {
  const store = getStore({ name: NAMA_STORE, consistency: "strong" });
  return {
    async baca<T>(k: string) {
      return (await store.get(k, { type: "json" })) as T | null;
    },
    async tulis(k: string, data: unknown) {
      await store.setJSON(k, data);
    },
  };
}

let storan: Storan | null = null;

function dapatkanStoran(): Storan {
  if (storan) return storan;
  // Laptop / ujian (npm run dev, skrip): fail JSON. Produksi (Netlify): Blobs.
  // Di produksi kita TIDAK diam-diam guna fail, kerana fail di server hilang selepas setiap permintaan.
  const guneFail = process.env.STORAN === "fail" || process.env.NODE_ENV !== "production";
  storan = guneFail ? storanFail() : storanNetlify();
  return storan;
}

export async function bacaJSON<T>(kunci: string, lalai: T): Promise<T> {
  const nilai = await dapatkanStoran().baca<T>(kunci);
  return nilai ?? lalai;
}

export async function tulisJSON(kunci: string, data: unknown): Promise<void> {
  await dapatkanStoran().tulis(kunci, data);
}

/** Tambah satu item ke senarai, simpan maksimum `had` item terbaru. */
export async function tambahKeSenarai<T>(kunci: string, item: T, had = 500): Promise<void> {
  const senarai = await bacaJSON<T[]>(kunci, []);
  senarai.push(item);
  await tulisJSON(kunci, senarai.slice(-had));
}
