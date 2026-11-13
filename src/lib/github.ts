/**
 * SEGERAK GITHUB: repo awam Darwish dijadikan kad projek & pengetahuan secara automatik.
 * Guna API awam GitHub (tiada token diperlukan; had 60 permintaan sejam, cukup untuk sehari sekali).
 * Repo boleh disembunyikan melalui Telegram ("sembunyikan repo X").
 */
import { bacaJSON, tulisJSON } from "@/lib/store";
import type { Projek } from "@/lib/projects";

export const namaPengguna = () => process.env.GITHUB_USERNAME?.trim() || "darwish12345";

type RepoMentah = {
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics?: string[];
  fork: boolean;
  archived: boolean;
  pushed_at: string;
  stargazers_count: number;
};

export async function segerakGitHub(): Promise<{ bilangan: number; ralat?: string }> {
  try {
    const res = await fetch(`https://api.github.com/users/${namaPengguna()}/repos?sort=pushed&per_page=100`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "tanya-darwish-agent" },
    });
    if (!res.ok) return { bilangan: 0, ralat: `GitHub ${res.status}` };
    const repo = ((await res.json()) as RepoMentah[]).filter((r) => !r.fork && !r.archived);
    const projek: Projek[] = repo.map((r) => ({
      id: `gh-${r.name.toLowerCase()}`,
      nama: r.name,
      ringkasan: r.description ?? "",
      peranan: "Pemilik repo",
      tempoh: `Kemas kini terakhir ${r.pushed_at.slice(0, 10)}`,
      tech: [r.language, ...(r.topics ?? [])].filter((x): x is string => Boolean(x)).slice(0, 6),
      tag: ["github", ...(r.topics ?? [])],
      link: { repo: r.html_url, demo: r.homepage ?? "" },
      butiran: [r.description, r.language ? `Bahasa utama: ${r.language}` : "", r.topics?.length ? `Topik: ${r.topics.join(", ")}` : ""]
        .filter(Boolean)
        .join(". "),
    }));
    await tulisJSON("projek-github", projek);
    return { bilangan: projek.length };
  } catch (e) {
    return { bilangan: 0, ralat: e instanceof Error ? e.message : String(e) };
  }
}

export const bacaProjekGitHub = () => bacaJSON<Projek[]>("projek-github", []);
export const bacaRepoTersembunyi = () => bacaJSON<string[]>("github-sembunyi", []);

export async function sembunyikanRepo(nama: string, sembunyi: boolean): Promise<boolean> {
  const semua = await bacaProjekGitHub();
  const sasaran = semua.find((p) => p.nama.toLowerCase() === nama.toLowerCase() || p.id === nama.toLowerCase());
  if (!sasaran) return false;
  const senarai = new Set(await bacaRepoTersembunyi());
  if (sembunyi) senarai.add(sasaran.id);
  else senarai.delete(sasaran.id);
  await tulisJSON("github-sembunyi", [...senarai]);
  return true;
}
