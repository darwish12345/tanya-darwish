/**
 * Alat bantu ujian: storan sementara, pelayan Telegram/JSearch palsu, dan LLM palsu.
 * Tiada panggilan internet sebenar.
 */
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export function storanSementara() {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "td-"));
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.QSTASH_TOKEN;
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.JSEARCH_API_KEY;
}

export type PanggilanTelegram = { kaedah: string; badan: Record<string, unknown> | null; jenis: string };

/** Pelayan Telegram palsu. Merekod setiap panggilan. */
export async function pelayanPalsu(
  laluanLain: Record<string, (url: URL, badan: string) => unknown> = {},
): Promise<{ panggilan: PanggilanTelegram[]; tutup: () => void; asas: string }> {
  const panggilan: PanggilanTelegram[] = [];
  let mesejId = 100;
  const pelayan = http.createServer((req, res) => {
    const bahagian: Buffer[] = [];
    req.on("data", (b) => bahagian.push(b));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      const lain = Object.entries(laluanLain).find(([awalan]) => url.pathname.startsWith(awalan));
      if (lain) {
        const hasil = lain[1](url, Buffer.concat(bahagian).toString("utf8"));
        res.statusCode = (hasil as { _status?: number })?._status ?? 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(hasil));
        return;
      }
      const kaedah = url.pathname.split("/").pop() ?? "";
      const jenis = req.headers["content-type"] ?? "";
      const mentah = Buffer.concat(bahagian).toString("utf8");
      let badan: Record<string, unknown> | null = null;
      if (jenis.includes("json")) badan = JSON.parse(mentah || "{}");
      else if (jenis.includes("multipart")) badan = { multipart: true, saiz: mentah.length, mentah: mentah.slice(0, 2000) };
      panggilan.push({ kaedah, badan, jenis });
      res.setHeader("content-type", "application/json");
      if (kaedah === "getFile") return res.end(JSON.stringify({ ok: true, result: { file_path: "f/x.ogg" } }));
      res.end(JSON.stringify({ ok: true, result: kaedah === "getMe" ? { username: "ujian_bot" } : { message_id: ++mesejId } }));
    });
  });
  await new Promise<void>((r) => pelayan.listen(0, "127.0.0.1", () => r()));
  const port = (pelayan.address() as { port: number }).port;
  return { panggilan, tutup: () => pelayan.close(), asas: `http://127.0.0.1:${port}` };
}

type MesejLLM = { role: string; content: string | null; tool_calls?: unknown[] };

/** LLM palsu: setiap panggilan memulangkan item seterusnya (objek mesej, atau fungsi yang melontar ralat). */
export function llmPalsu(skrip: (MesejLLM | (() => never) | ((p: { messages: MesejLLM[] }) => MesejLLM))[]) {
  const diterima: { messages: MesejLLM[]; tools?: { function: { name: string } }[] }[] = [];
  let i = 0;
  const llm = {
    chat: {
      completions: {
        create: async (p: { messages: MesejLLM[]; tools?: { function: { name: string } }[] }) => {
          diterima.push(JSON.parse(JSON.stringify(p)));
          const item = skrip[Math.min(i++, skrip.length - 1)];
          const mesej = typeof item === "function" ? item(p) : item;
          return { choices: [{ message: mesej }] };
        },
      },
    },
  } as never;
  return { llm, diterima };
}

export const panggilTool = (id: string, name: string, args: unknown) => ({
  role: "assistant",
  content: null,
  tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
});
export const jawab = (content: string) => ({ role: "assistant", content });

export function ralatGroq(status: number, mesej: string): never {
  const e = new Error(`${status} ${mesej}`) as Error & { status: number; error: unknown };
  e.status = status;
  e.error = { error: { message: mesej, code: "tool_use_failed" } };
  throw e;
}

let bilangan = 0;
export function ok(nama: string) {
  bilangan++;
  console.log(`  ✓ ${nama}`);
}
export const jumlahLulus = () => bilangan;
