import Link from "next/link";
import Chat from "@/components/Chat";

const REPO = "https://github.com/darwish12345/tanya-darwish";

const CIRI = [
  { tajuk: "Jawapan bersumber", teks: "Agent mencari dalam pangkalan pengetahuan (RAG) sebelum menjawab. Tiada maklumat, tiada rekaan." },
  { tajuk: "Penilai padanan jawatan", teks: "Tampal job description, dapatkan skor padanan yang jujur termasuk kekurangan." },
  { tajuk: "Tempah interview", teks: "Agent menyemak kalendar Darwish dan menempah slot kosong secara terus." },
  { tajuk: "Agent peribadi Telegram", teks: "Peringatan, tugasan, carian kerja harian dan resume ATS yang dihantar hanya selepas Darwish setuju." },
];

const SENIBINA = [
  ["LLM", "Groq (gpt-oss-120b) dengan tool calling"],
  ["Gelung agent", "Ditulis sendiri: LLM pilih tool → kod jalankan → hasil dihantar semula"],
  ["Pengetahuan", "RAG dengan MiniSearch + kamus sinonim BM/English, auto-segerak repo GitHub"],
  ["Memori & kerja latar", "Upstash Redis + QStash (peringatan tepat pada minit)"],
  ["Kualiti", "Guardrails, ujian regresi, eval automatik di GitHub Actions"],
  ["Kos", "RM0 sebulan (semua peringkat percuma)"],
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 lg:py-16">
      {/* Mudah alih: pengenalan → chat → ciri. Desktop: pengenalan + ciri di kiri, chat di kanan. */}
      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-x-10">
        <section className="space-y-6 lg:self-end">
          <p className="text-sm font-medium text-indigo-600">Software Engineering · Agentic AI</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Hai, saya Darwish.</h1>
          <p className="max-w-md text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
            Pelatih Software Engineering yang membina perisian dan agent AI. Daripada membaca CV panjang, tanya agent saya
            terus. Ia menjawab berdasarkan projek, sijil dan pengalaman sebenar saya, lengkap dengan bukti.
          </p>
        </section>
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
          <Chat />
        </div>
        <ul className="grid max-w-md gap-3 self-start sm:grid-cols-2">
          {CIRI.map((c) => (
            <li key={c.tajuk} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-sm font-medium">{c.tajuk}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{c.teks}</p>
            </li>
          ))}
        </ul>
      </div>

      <section id="di-sebalik-tabir" className="mt-16 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Di sebalik tabir</h2>
          <div className="flex gap-4 text-sm">
            <Link href="/statistik" className="text-indigo-600 hover:underline">
              Statistik & skor eval →
            </Link>
            <a href={REPO} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
              Kod sumber (GitHub) →
            </a>
          </div>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Agent ini bukan chatbot biasa. Setiap jawapan melalui gelung agent: model memutuskan tool yang perlu dipanggil,
          kod menjalankannya dengan validasi, dan hasilnya disemak sebelum sampai kepada anda. Label kecil di atas setiap
          jawapan menunjukkan tool yang digunakan.
        </p>
        <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {SENIBINA.map(([k, v]) => (
            <div key={k} className="flex gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-900">
              <dt className="w-36 shrink-0 font-medium">{k}</dt>
              <dd className="text-zinc-600 dark:text-zinc-400">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
