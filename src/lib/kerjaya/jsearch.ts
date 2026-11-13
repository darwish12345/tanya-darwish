/**
 * KLIEN JSEARCH: carian kerja dari LinkedIn, Indeed, Glassdoor dan lain-lain (melalui Google for Jobs).
 * LinkedIn & Indeed tiada API carian awam, jadi kita guna agregator ini (percuma, terhad).
 *
 * Env:
 *   JSEARCH_API_KEY   kunci API
 *   JSEARCH_PROVIDER  "rapidapi" (lalai) atau "openwebninja"
 */
import { createHash } from "node:crypto";
import { cariEmel } from "@/lib/teks";

export type IklanKerja = {
  id: string; // id pendek (hash) — selamat untuk butang Telegram
  idSumber: string;
  tajuk: string;
  syarikat: string;
  lokasi: string;
  penerbit: string; // contoh "Indeed"
  pautan: string;
  pautanPilihan: { penerbit: string; pautan: string }[];
  penerangan: string;
  tarikhSiar?: string;
  jenis?: string;
  emel?: string | null;
};

export function jsearchDisetup(): boolean {
  return Boolean(process.env.JSEARCH_API_KEY?.trim());
}

export function idKerja(idSumber: string): string {
  return createHash("sha1").update(idSumber).digest("hex").slice(0, 10);
}

type JobMentah = {
  job_id: string;
  job_title?: string;
  employer_name?: string;
  job_publisher?: string;
  job_apply_link?: string;
  apply_options?: { publisher?: string; apply_link?: string }[];
  job_description?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_location?: string;
  job_posted_at_datetime_utc?: string;
  job_employment_type?: string;
};

export function normalkan(j: JobMentah): IklanKerja {
  const pilihan = (j.apply_options ?? [])
    .filter((o) => o.apply_link)
    .map((o) => ({ penerbit: o.publisher ?? "", pautan: o.apply_link! }));
  const lokasi = j.job_location || [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", ");
  const penerangan = (j.job_description ?? "").slice(0, 6000);
  return {
    id: idKerja(j.job_id),
    idSumber: j.job_id,
    tajuk: j.job_title ?? "(tanpa tajuk)",
    syarikat: j.employer_name ?? "(syarikat tidak dinyatakan)",
    lokasi,
    penerbit: j.job_publisher ?? pilihan[0]?.penerbit ?? "",
    pautan: j.job_apply_link ?? pilihan[0]?.pautan ?? "",
    pautanPilihan: pilihan,
    penerangan,
    tarikhSiar: j.job_posted_at_datetime_utc,
    jenis: j.job_employment_type,
    emel: cariEmel(penerangan),
  };
}

export async function cariJSearch(
  pertanyaan: string,
  opsyen: { negara?: string; tempoh?: "today" | "3days" | "week" | "month"; kecuali?: string[]; keperluan?: string } = {},
): Promise<IklanKerja[]> {
  const kunci = process.env.JSEARCH_API_KEY?.trim();
  if (!kunci) throw new Error("JSEARCH_API_KEY belum ditetapkan");
  const pembekal = (process.env.JSEARCH_PROVIDER || "rapidapi").toLowerCase();

  const p = new URLSearchParams({
    query: pertanyaan,
    page: "1",
    num_pages: "1",
    country: opsyen.negara ?? "my",
    date_posted: opsyen.tempoh ?? "3days",
  });
  if (opsyen.kecuali?.length) p.set("exclude_job_publishers", opsyen.kecuali.join(","));
  // Contoh "under_3_years_experience,no_experience" untuk fresh grad
  if (opsyen.keperluan) p.set("job_requirements", opsyen.keperluan);

  const [url, headers] =
    pembekal === "openwebninja"
      ? [`https://api.openwebninja.com/jsearch/search?${p}`, { "x-api-key": kunci }]
      : [
          `${process.env.JSEARCH_BASE || "https://jsearch.p.rapidapi.com"}/search?${p}`,
          { "X-RapidAPI-Key": kunci, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" },
        ];

  const kawalan = new AbortController();
  const pemasa = setTimeout(() => kawalan.abort(), 9000);
  try {
    const res = await fetch(url, { headers, signal: kawalan.signal });
    if (!res.ok) throw new Error(`JSearch ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const d = (await res.json()) as { data?: JobMentah[] };
    return (d.data ?? []).filter((j) => j.job_id).map(normalkan);
  } finally {
    clearTimeout(pemasa);
  }
}

/**
 * Kekalkan iklan dari sumber yang dibenarkan sahaja (contoh hanya Indeed),
 * dan tukar pautan utama kepada pautan dari sumber itu.
 */
export function tapisIkutSumber(iklan: IklanKerja[], sumber: string[]): IklanKerja[] {
  if (!sumber.length) return iklan;
  const dibenar = sumber.map((s) => s.toLowerCase());
  const padan = (penerbit: string) => dibenar.some((s) => penerbit.toLowerCase().includes(s));
  const hasil: IklanKerja[] = [];
  for (const k of iklan) {
    if (padan(k.penerbit)) {
      hasil.push(k);
      continue;
    }
    const pilihan = k.pautanPilihan.find((o) => padan(o.penerbit));
    if (pilihan) hasil.push({ ...k, penerbit: pilihan.penerbit, pautan: pilihan.pautan });
  }
  return hasil;
}

/**
 * Buang iklan yang jelas bukan untuk fresh grad: internship, senior/lead/manager, atau menuntut 3+ tahun.
 * (Graduate trainee / management trainee DIKEKALKAN kerana memang untuk graduan baru.)
 */
const TAJUK_BUKAN_FRESH = /\b(intern|internship|industrial training|praktikal|latihan industri|senior|sr\.?|lead|principal|manager|head of|architect|staff engineer|director)\b/i;
const TUNTUT_PENGALAMAN = /(?<!\d\s*[-–]\s*|\bto\s)\b([3-9]|1\d)\s*\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs?|tahun)\b[^.]{0,40}\b(experience|pengalaman)/i;

export function sesuaiFreshGrad(k: IklanKerja): boolean {
  if (TAJUK_BUKAN_FRESH.test(k.tajuk)) return false;
  if (TUNTUT_PENGALAMAN.test(k.penerangan.slice(0, 4000))) return false;
  return true;
}
