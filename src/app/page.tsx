import Chat from "@/components/Chat";

export default function Home() {
  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-5 py-10 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:py-16">
      <section className="space-y-6">
        <p className="text-sm font-medium text-indigo-600">Software Engineering · Agentic AI</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Hai, saya Darwish.
        </h1>
        <p className="max-w-md text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Pelatih Software Engineering yang membina perisian dan agent AI. Daripada membaca CV panjang, tanya agent saya
          terus. Ia menjawab berdasarkan projek, sijil dan pengalaman sebenar saya, lengkap dengan bukti.
        </p>
        <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Jawapan bersumber, bukan rekaan</li>
          <li>Kad projek dengan link repo dan demo</li>
          <li>Tinggal mesej, saya terima notifikasi serta-merta</li>
        </ul>
      </section>
      <Chat />
    </main>
  );
}
