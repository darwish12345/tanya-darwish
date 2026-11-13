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

/**
 * Semua projek untuk dipaparkan: projek dalam content/projek.json dahulu,
 * kemudian repo GitHub yang disegerakkan (kecuali yang disembunyikan atau sudah ada).
 */
export async function senaraiProjekSemua(): Promise<Projek[]> {
  const { bacaProjekGitHub, bacaRepoTersembunyi } = await import("@/lib/github");
  const statik = senaraiProjek();
  let github: Projek[] = [];
  try {
    const sembunyi = new Set(await bacaRepoTersembunyi());
    const sudahAda = new Set(statik.flatMap((p) => [p.id, p.link.repo.toLowerCase()]));
    github = (await bacaProjekGitHub()).filter(
      (p) => !sembunyi.has(p.id) && !sudahAda.has(p.link.repo.toLowerCase()) && !sudahAda.has(p.id.replace(/^gh-/, "")),
    );
  } catch (e) {
    console.error("[projects] Gagal baca projek GitHub:", e);
  }
  return [...statik, ...github];
}
