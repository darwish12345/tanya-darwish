"use client";

import { useEffect, useState } from "react";

type Data = {
  dikemaskini: string;
  tempohHari: number;
  jumlahSoalan: number;
  kadarTiadaJawapan: number;
  harian: { tarikh: string; soalan: number }[];
  tools: { nama: string; bilangan: number }[];
  leads: number;
  kerjaya: { iklanDinilai: number; dimohon: number };
  pengetahuan: { jumlahKetul: number };
  eval: { dijalankan: string | null; model: string | null; jumlah: number; lulus: number; kadarLulus: number | null; ikutKategori: { kategori: string; jumlah: number; lulus: number }[] };
};

const NAMA_TOOL: Record<string, string> = {
  cari_pengetahuan: "Cari pengetahuan (RAG)",
  papar_projek: "Papar kad projek",
  maklum_darwish: "Maklumkan Darwish",
  nilai_padanan_jawatan: "Nilai padanan jawatan",
  semak_slot_interview: "Semak slot interview",
  tempah_interview: "Tempah interview",
};

const peratus = (n: number) => `${Math.round(n * 100)}%`;
const tarikhPendek = (t: string) => new Date(`${t}T00:00:00+08:00`).toLocaleDateString("ms-MY", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" });

export default function Statistik() {
  const [data, setData] = useState<Data | null>(null);
  const [ralat, setRalat] = useState(false);
  const [jadual, setJadual] = useState(false);

  useEffect(() => {
    fetch("/api/statistik")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setRalat(true));
  }, []);

  if (ralat) return <p className="text-sm text-red-600">Statistik tidak dapat dimuatkan. Cuba sebentar lagi.</p>;
  if (!data) return <p className="text-sm text-zinc-500">Memuatkan statistik...</p>;

  const maks = Math.max(1, ...data.harian.map((h) => h.soalan));
  const maksTool = Math.max(1, ...data.tools.map((t) => t.bilangan));
  const e = data.eval;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Soalan pelawat" nilai={String(data.jumlahSoalan)} nota={`${data.tempohHari} hari`} />
        <Tile label="Dijawab dengan bukti" nilai={data.jumlahSoalan ? peratus(1 - data.kadarTiadaJawapan) : "-"} nota="tidak termasuk 'tidak pasti'" />
        <Tile label="Skor eval" nilai={e.kadarLulus != null ? peratus(e.kadarLulus) : "-"} nota={e.jumlah ? `${e.lulus}/${e.jumlah} kes lulus` : "belum dijalankan"} />
        <Tile label="Mesej kepada Darwish" nilai={String(data.leads)} nota="lead pintar" />
      </div>

      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">Soalan sehari</h2>
          <button onClick={() => setJadual(!jadual)} className="text-xs text-indigo-600 hover:underline">
            {jadual ? "Lihat carta" : "Lihat jadual"}
          </button>
        </div>
        {jadual ? (
          <div className="max-h-72 overflow-y-auto text-sm">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="py-1 font-medium">Tarikh</th>
                  <th className="py-1 text-right font-medium">Soalan</th>
                </tr>
              </thead>
              <tbody>
                {data.harian.map((h) => (
                  <tr key={h.tarikh} className="border-t border-zinc-100 dark:border-zinc-900">
                    <td className="py-1">{tarikhPendek(h.tarikh)}</td>
                    <td className="py-1 text-right tabular-nums">{h.soalan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            <div className="flex h-40 items-end gap-[2px]" role="img" aria-label={`Carta bar soalan sehari, maksimum ${maks}`}>
              {data.harian.map((h) => (
                <div key={h.tarikh} className="group relative flex h-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-[4px] bg-indigo-500 transition-opacity group-hover:opacity-80 dark:bg-indigo-400"
                    style={{ height: h.soalan ? `${Math.max(3, (h.soalan / maks) * 100)}%` : "0" }}
                  />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[11px] text-white group-hover:block dark:bg-zinc-100 dark:text-zinc-900">
                    {tarikhPendek(h.tarikh)}: {h.soalan} soalan
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between border-t border-zinc-200 pt-1 text-[11px] text-zinc-500 dark:border-zinc-800">
              <span>{tarikhPendek(data.harian[0].tarikh)}</span>
              <span>Hari ini</span>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="mb-1 text-sm font-semibold">Tools yang dipilih oleh agent</h2>
          <p className="mb-4 text-xs text-zinc-500">Bilangan perbualan di mana LLM memutuskan untuk memanggil setiap tool.</p>
          {data.tools.length === 0 && <p className="text-xs text-zinc-500">Belum ada data.</p>}
          <ul className="space-y-2.5">
            {data.tools.map((t) => (
              <li key={t.nama} className="text-xs">
                <div className="mb-1 flex justify-between">
                  <span>{NAMA_TOOL[t.nama] ?? t.nama}</span>
                  <span className="tabular-nums text-zinc-500">{t.bilangan}</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-900">
                  <div className="h-2 rounded-full bg-indigo-500 dark:bg-indigo-400" style={{ width: `${(t.bilangan / maksTool) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="mb-1 text-sm font-semibold">Eval automatik</h2>
          <p className="mb-4 text-xs text-zinc-500">
            {e.dijalankan
              ? `Dijalankan ${new Date(e.dijalankan).toLocaleDateString("ms-MY", { day: "numeric", month: "short", year: "numeric" })} dengan ${e.model}.`
              : "Suite eval belum dijalankan di GitHub Actions."}
          </p>
          <ul className="space-y-2 text-xs">
            {e.ikutKategori.map((k) => (
              <li key={k.kategori} className="flex justify-between border-b border-zinc-100 pb-1.5 dark:border-zinc-900">
                <span>{k.kategori}</span>
                <span className="tabular-nums text-zinc-500">
                  {k.lulus}/{k.jumlah}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span>Ketul pengetahuan: <b className="text-zinc-900 dark:text-zinc-100">{data.pengetahuan.jumlahKetul}</b></span>
            <span>Iklan kerja dinilai: <b className="text-zinc-900 dark:text-zinc-100">{data.kerjaya.iklanDinilai}</b></span>
          </div>
        </section>
      </div>

      <p className="text-xs text-zinc-500">Dikemas kini {new Date(data.dikemaskini).toLocaleString("ms-MY", { timeZone: "Asia/Kuala_Lumpur" })} (dicache 10 minit).</p>
    </div>
  );
}

function Tile({ label, nilai, nota }: { label: string; nilai: string; nota: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{nilai}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500">{nota}</p>
    </div>
  );
}
