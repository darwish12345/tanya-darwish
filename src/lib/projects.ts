import fs from "node:fs";
import path from "node:path";

export type Projek = {
  id: string;
  draf?: boolean;
  nama: string;
  ringkasan: string;
  peranan: string;
  tempoh: string;
  tech: string[];
  tag: string[];
  link: { repo: string; demo: string };
  butiran: string;
};

/** Data yang dihantar ke UI untuk dipaparkan sebagai kad projek. */
export type KadProjek = Pick<Projek, "id" | "nama" | "ringkasan" | "peranan" | "tech" | "link">;

let cache: Projek[] | null = null;

/** Semua projek yang bukan draf. */
export function senaraiProjek(): Projek[] {
  if (!cache) {
    const fail = path.join(process.cwd(), "content", "projek.json");
    const semua = JSON.parse(fs.readFileSync(fail, "utf8")) as Projek[];
    cache = semua.filter((p) => !p.draf);
  }
  return cache;
}

export function keKad(p: Projek): KadProjek {
  return { id: p.id, nama: p.nama, ringkasan: p.ringkasan, peranan: p.peranan, tech: p.tech, link: p.link };
}
