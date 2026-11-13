"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SOALAN_PEMBUKA, type SoalanPembuka } from "@/config/suggestions";
import type { HasilAgent, Langkah } from "@/lib/agent/loop";
import type { KadProjek } from "@/lib/projects";

type Mesej =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; kad: KadProjek[]; langkah: Langkah[]; cadangan: string[] };

const LABEL_TOOL: Record<string, string> = {
  cari_pengetahuan: "Mencari dalam pengetahuan",
  papar_projek: "Memaparkan projek",
  maklum_darwish: "Menghantar mesej kepada Darwish",
  nilai_padanan_jawatan: "Menilai padanan jawatan",
  semak_slot_interview: "Menyemak kalendar Darwish",
  tempah_interview: "Menempah interview",
};

const HAD = 3000;

export default function Chat() {
  const [mesej, setMesej] = useState<Mesej[]>([]);
  const [input, setInput] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [ralat, setRalat] = useState<string | null>(null);
  const bawahRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Kotak mesej membesar mengikut isi (sehingga ~8 baris)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  function pilihCadangan(c: SoalanPembuka) {
    if (!c.isi) return hantar(c.soalan);
    setInput(c.soalan);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      // Pilih teks placeholder supaya tampalan terus menggantikannya
      const mula = c.soalan.indexOf("[");
      if (mula >= 0) el.setSelectionRange(mula, c.soalan.length);
    });
  }

  useEffect(() => {
    bawahRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mesej, sibuk]);

  async function hantar(teks: string) {
    const soalan = teks.trim();
    if (!soalan || sibuk) return;
    setRalat(null);
    setInput("");

    const baru: Mesej[] = [...mesej, { role: "user", content: soalan }];
    setMesej(baru);
    setSibuk(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Hanya teks dihantar; kad dan langkah tinggal di browser
        body: JSON.stringify({ messages: baru.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.ralat ?? "Ralat tidak diketahui");

      const hasil = data as HasilAgent;
      setMesej([
        ...baru,
        { role: "assistant", content: hasil.jawapan, kad: hasil.kad, langkah: hasil.langkah, cadangan: hasil.cadangan },
      ]);
    } catch (e) {
      setRalat(e instanceof Error ? e.message : "Ralat rangkaian");
      setMesej(baru.slice(0, -1)); // pulangkan mesej supaya boleh cuba semula
      setInput(soalan);
    } finally {
      setSibuk(false);
    }
  }

  const terakhir = mesej[mesej.length - 1];
  const cadanganSemasa: SoalanPembuka[] =
    mesej.length === 0
      ? SOALAN_PEMBUKA
      : terakhir?.role === "assistant"
        ? terakhir.cadangan.map((s) => ({ label: s, soalan: s }))
        : [];

  return (
    <section className="flex h-[min(720px,calc(100dvh-2rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <header className="flex items-center gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
          TD
        </div>
        <div>
          <h2 className="text-sm font-semibold">Tanya Darwish</h2>
          <p className="text-xs text-zinc-500">Agent AI · jawapan berdasarkan bukti kerja Darwish</p>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {mesej.length === 0 && (
          <div className="rounded-xl bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
            Hai! Saya agent AI Darwish. Tanya apa sahaja tentang projek, kemahiran dan pengalamannya, atau pilih soalan di bawah.
          </div>
        )}

        {mesej.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-h-60 max-w-[85%] overflow-y-auto whitespace-pre-wrap rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="space-y-2">
              {m.langkah.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {m.langkah.map((l, j) => (
                    <span
                      key={j}
                      title={l.input}
                      className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-500 dark:border-zinc-800"
                    >
                      {LABEL_TOOL[l.tool] ?? l.tool}
                    </span>
                  ))}
                </div>
              )}
              <div className="prose-chat max-w-[90%] rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-2.5 text-sm leading-relaxed dark:bg-zinc-900">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              </div>
              {m.kad.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {m.kad.map((k) => (
                    <KadProjekUI key={k.id} kad={k} />
                  ))}
                </div>
              )}
            </div>
          ),
        )}

        {sibuk && (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
            Agent sedang berfikir dan menggunakan tools...
          </div>
        )}
        <div ref={bawahRef} />
      </div>

      <footer className="space-y-3 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
        {cadanganSemasa.length > 0 && !sibuk && (
          <div className="flex flex-wrap gap-2">
            {cadanganSemasa.map((c) => (
              <button
                key={c.label}
                onClick={() => pilihCadangan(c)}
                className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
        {ralat && <p className="text-xs text-red-600">{ralat}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            hantar(input);
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, HAD))}
            onKeyDown={(e) => {
              // Enter = hantar, Shift+Enter = baris baru
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                hantar(input);
              }
            }}
            placeholder="Tanya tentang Darwish, atau tampal job description..."
            aria-label="Mesej kepada agent"
            disabled={sibuk}
            className="max-h-[200px] flex-1 resize-none rounded-xl border border-zinc-300 bg-transparent px-4 py-2.5 text-sm leading-relaxed outline-none focus:border-indigo-500 dark:border-zinc-700"
          />
          <button
            type="submit"
            disabled={sibuk || !input.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Hantar
          </button>
        </form>
        {input.length > HAD * 0.8 && <p className="text-right text-[11px] text-zinc-500">{input.length}/{HAD}</p>}
      </footer>
    </section>
  );
}

function KadProjekUI({ kad }: { kad: KadProjek }) {
  return (
    <article className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="text-sm font-semibold">{kad.nama}</h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{kad.ringkasan}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {kad.tech.slice(0, 5).map((t) => (
          <span key={t} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            {t}
          </span>
        ))}
      </div>
      {(kad.link.repo || kad.link.demo) && (
        <div className="mt-2 flex gap-3 text-xs">
          {kad.link.repo && (
            <a href={kad.link.repo} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
              Repo
            </a>
          )}
          {kad.link.demo && (
            <a href={kad.link.demo} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
              Demo
            </a>
          )}
        </div>
      )}
    </article>
  );
}
