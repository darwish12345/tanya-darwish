/**
 * STORAN KEKAL (memori jangka panjang agent)
 *
 * Keutamaan:
 *   1. Upstash Redis (jika UPSTASH_REDIS_REST_URL ditetapkan): konsisten serta-merta, percuma 500K arahan/bulan
 *   2. Netlify Blobs (sandaran di Netlify): boleh lambat dikemas kini & tergantung untuk kunci yang tiada
 *   3. Fail JSON dalam .data/ (laptop / ujian)
 *
 * Kod lain hanya guna fungsi di bawah, jadi storan boleh ditukar tanpa mengubah agent.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { getStore } from "@netlify/blobs";

const AWALAN = "td:"; // awalan kunci dalam Redis
const NAMA_STORE = "tanya-darwish";
const HAD_MASA_MS = 4000;

type Storan = {
  jenis: "upstash" | "netlify-blobs" | "fail";
  baca<T>(kunci: string): Promise<T | null>;
  tulis(kunci: string, data: unknown): Promise<void>;
  tambahSenarai(kunci: string, item: unknown, had: number): Promise<void>;
  bacaSenarai<T>(kunci: string): Promise<T[]>;
  /** Tambah 1 pada pembilang yang luput selepas `saat` saat. Pulangkan nilai baru. */
  kira(kunci: string, saat: number): Promise<number>;
};

/** Gagal dengan cepat daripada tergantung (permintaan yang tergantung = pengguna menunggu lama). */
function denganHadMasa<T>(janji: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    janji,
    new Promise<T>((_, tolak) => setTimeout(() => tolak(new Error(`[store] ${label}: melebihi ${ms}ms`)), ms)),
  ]);
}

// ── 1. Upstash Redis (REST API, tiada pakej tambahan) ──────────────────────
function storanUpstash(url: string, token: string): Storan {
  async function arahan<T>(cmd: (string | number)[]): Promise<T> {
    const res = await denganHadMasa(
      fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(cmd),
        cache: "no-store",
      }),
      HAD_MASA_MS,
      String(cmd[0]),
    );
    const d = (await res.json()) as { result?: T; error?: string };
    if (!res.ok || d.error) throw new Error(`[upstash] ${cmd[0]} gagal: ${d.error ?? res.status}`);
    return d.result as T;
  }
  async function pipeline(cmds: (string | number)[][]): Promise<void> {
    const res = await denganHadMasa(
      fetch(`${url.replace(/\/$/, "")}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(cmds),
        cache: "no-store",
      }),
      HAD_MASA_MS,
      "pipeline",
    );
    if (!res.ok) throw new Error(`[upstash] pipeline gagal: ${res.status}`);
  }
  return {
    jenis: "upstash",
    async baca<T>(k: string) {
      const v = await arahan<string | null>(["GET", AWALAN + k]);
      return v == null ? null : (JSON.parse(v) as T);
    },
    async tulis(k: string, data: unknown) {
      await arahan(["SET", AWALAN + k, JSON.stringify(data)]);
    },
    // RPUSH adalah atomik: dua penulisan serentak tidak saling menindih
    async tambahSenarai(k: string, item: unknown, had: number) {
      await pipeline([
        ["RPUSH", AWALAN + k, JSON.stringify(item)],
        ["LTRIM", AWALAN + k, -had, -1],
      ]);
    },
    async bacaSenarai<T>(k: string) {
      const v = await arahan<string[]>(["LRANGE", AWALAN + k, 0, -1]);
      return (v ?? []).map((s) => JSON.parse(s) as T);
    },
    // INCR atomik: had kadar tepat walaupun Netlify menjalankan banyak salinan server serentak
    async kira(k: string, saat: number) {
      const n = await arahan<number>(["INCR", AWALAN + k]);
      if (n === 1) await arahan(["EXPIRE", AWALAN + k, saat]);
      return n;
    },
  };
}

// ── 2. Netlify Blobs (sandaran) ────────────────────────────────────────────
function storanNetlify(): Storan {
  const store = getStore({ name: NAMA_STORE });
  const baca = async <T>(k: string): Promise<T | null> => {
    try {
      return (await denganHadMasa(store.get(k, { type: "json" }), HAD_MASA_MS, `baca ${k}`)) as T | null;
    } catch (e) {
      // Blobs kadang-kadang tergantung untuk kunci yang belum wujud: anggap tiada data
      console.error("[store] Blobs baca gagal, anggap kosong:", e);
      return null;
    }
  };
  const tulis = async (k: string, data: unknown) => {
    await denganHadMasa(store.setJSON(k, data), HAD_MASA_MS, `tulis ${k}`);
  };
  return {
    jenis: "netlify-blobs",
    baca,
    tulis,
    async tambahSenarai(k, item, had) {
      const s = (await baca<unknown[]>(k)) ?? [];
      s.push(item);
      await tulis(k, s.slice(-had));
    },
    async kira(k, saat) {
      const lama = await baca<{ n: number; tamat: number }>(k);
      const kini = Date.now();
      const n = lama && lama.tamat > kini ? lama.n + 1 : 1;
      await tulis(k, { n, tamat: lama && lama.tamat > kini ? lama.tamat : kini + saat * 1000 });
      return n;
    },
    async bacaSenarai<T>(k: string) {
      return ((await baca<T[]>(k)) ?? []) as T[];
    },
  };
}

// ── 3. Fail JSON (laptop / ujian) ──────────────────────────────────────────
function storanFail(): Storan {
  const dir = process.env.DATA_DIR || path.join(process.cwd(), ".data");
  const fail = (k: string) => path.join(dir, `${k.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
  const baca = async <T>(k: string): Promise<T | null> => {
    try {
      return JSON.parse(await fs.readFile(fail(k), "utf8")) as T;
    } catch {
      return null;
    }
  };
  const tulis = async (k: string, data: unknown) => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fail(k), JSON.stringify(data, null, 2));
  };
  return {
    jenis: "fail",
    baca,
    tulis,
    async tambahSenarai(k, item, had) {
      const s = (await baca<unknown[]>(k)) ?? [];
      s.push(item);
      await tulis(k, s.slice(-had));
    },
    async kira(k, saat) {
      const lama = await baca<{ n: number; tamat: number }>(k);
      const kini = Date.now();
      const n = lama && lama.tamat > kini ? lama.n + 1 : 1;
      await tulis(k, { n, tamat: lama && lama.tamat > kini ? lama.tamat : kini + saat * 1000 });
      return n;
    },
    async bacaSenarai<T>(k: string) {
      return ((await baca<T[]>(k)) ?? []) as T[];
    },
  };
}

// ── Pilih storan ───────────────────────────────────────────────────────────
let storan: Storan | null = null;

function dapatkanStoran(): Storan {
  if (storan) return storan;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (process.env.STORAN === "fail") storan = storanFail();
  else if (url && token) storan = storanUpstash(url, token);
  else if (process.env.NODE_ENV === "production") storan = storanNetlify();
  else storan = storanFail();
  return storan;
}

/** Untuk diagnosis di /api/sihat. */
export function jenisStoran() {
  return dapatkanStoran().jenis;
}

export async function bacaJSON<T>(kunci: string, lalai: T): Promise<T> {
  return (await dapatkanStoran().baca<T>(kunci)) ?? lalai;
}

export async function tulisJSON(kunci: string, data: unknown): Promise<void> {
  await dapatkanStoran().tulis(kunci, data);
}

/** Tambah satu item ke senarai (atomik di Upstash), simpan maksimum `had` item terbaru. */
export async function tambahKeSenarai<T>(kunci: string, item: T, had = 500): Promise<void> {
  await dapatkanStoran().tambahSenarai(kunci, item, had);
}

/** Baca senarai yang ditulis dengan tambahKeSenarai(). */
export async function bacaSenarai<T>(kunci: string): Promise<T[]> {
  return dapatkanStoran().bacaSenarai<T>(kunci);
}

/** Pembilang dengan tempoh luput (untuk had kadar). */
export async function kira(kunci: string, saat: number): Promise<number> {
  return dapatkanStoran().kira(kunci, saat);
}
