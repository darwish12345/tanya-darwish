/**
 * RANGKA TOOL: struktur yang dikongsi oleh semua agent (web & Telegram).
 */
import { z } from "zod";
import type { ChatCompletionTool } from "groq-sdk/resources/chat/completions";
import type { KadProjek } from "@/lib/projects";

export type HasilTool = {
  untukLLM: unknown; // apa yang LLM akan baca
  kad?: KadProjek[]; // apa yang UI web akan paparkan (pilihan)
  tiadaHasil?: boolean; // tanda carian tidak jumpa apa-apa (untuk laporan harian)
};

export type Tool<S extends z.ZodTypeAny> = {
  nama: string;
  penerangan: string;
  skema: S;
  jalankan: (input: z.infer<S>) => Promise<HasilTool>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SebarangTool = Tool<any>;

export function buatTool<S extends z.ZodTypeAny>(t: Tool<S>) {
  return t;
}

/** Tukar tools kepada format JSON Schema yang difahami oleh API LLM. */
export function keDefinisi(tools: SebarangTool[]): ChatCompletionTool[] {
  return tools.map((t) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { $schema, ...parameters } = z.toJSONSchema(t.skema) as Record<string, unknown>;
    return { type: "function", function: { name: t.nama, description: t.penerangan, parameters } };
  });
}

/** Jalankan satu tool mengikut nama, dengan validasi input. */
export async function jalankanToolDari(
  tools: SebarangTool[],
  nama: string,
  argumenJson: string,
): Promise<HasilTool> {
  const tool = tools.find((t) => t.nama === nama);
  if (!tool) return { untukLLM: { ralat: `Tool '${nama}' tidak wujud.` } };

  let argumen: unknown;
  try {
    argumen = argumenJson ? JSON.parse(argumenJson) : {};
  } catch {
    return { untukLLM: { ralat: "Argumen bukan JSON yang sah." } };
  }

  const semak = tool.skema.safeParse(argumen);
  if (!semak.success) {
    return {
      untukLLM: { ralat: "Input tidak sah", butiran: semak.error.issues.map((i: z.core.$ZodIssue) => i.message) },
    };
  }

  try {
    return await tool.jalankan(semak.data);
  } catch (e) {
    console.error(`[tool ${nama}]`, e);
    return { untukLLM: { ralat: "Tool gagal dijalankan." } };
  }
}
