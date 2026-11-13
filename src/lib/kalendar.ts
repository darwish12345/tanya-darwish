/**
 * GOOGLE CALENDAR melalui Service Account (percuma).
 * Env: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_CALENDAR_ID (alamat Gmail anda).
 * Kalendar anda mesti dikongsi dengan emel service account ("Make changes to events").
 *
 * Tanda tangan JWT ditulis sendiri dengan modul crypto Node (tiada pakej Google yang berat).
 */
import { createSign } from "node:crypto";
import { bacaKeutamaan } from "@/lib/data";
import { gabungMY, hariMingguMY, tarikhMY, tambahHari, paparPendekMY, ZON } from "@/lib/masa";

export function kalendarDisetup(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() && process.env.GOOGLE_PRIVATE_KEY?.trim() && process.env.GOOGLE_CALENDAR_ID?.trim(),
  );
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");
// Boleh ditukar untuk ujian (pelayan palsu)
const URL_TOKEN = () => process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const URL_API = () => process.env.GOOGLE_API_BASE || "https://www.googleapis.com";
let tokenCache: { token: string; tamat: number } | null = null;

async function tokenAkses(): Promise<string> {
  if (tokenCache && tokenCache.tamat > Date.now() + 60_000) return tokenCache.token;
  const emel = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!.trim();
  // Netlify menyimpan "\n" sebagai teks; tukar semula kepada baris baru sebenar
  const kunci = process.env.GOOGLE_PRIVATE_KEY!.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");
  const kini = Math.floor(Date.now() / 1000);
  const kepala = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const tuntutan = b64url(
    JSON.stringify({
      iss: emel,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      iat: kini,
      exp: kini + 3600,
    }),
  );
  const tandatangan = createSign("RSA-SHA256").update(`${kepala}.${tuntutan}`).sign(kunci, "base64url");
  const res = await fetch(URL_TOKEN(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${kepala}.${tuntutan}.${tandatangan}`,
    }),
  });
  const d = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!d.access_token) throw new Error(`Google token gagal: ${d.error_description ?? res.status}`);
  tokenCache = { token: d.access_token, tamat: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return d.access_token;
}

async function google<T>(laluan: string, opsyen: { method?: string; badan?: unknown } = {}): Promise<T> {
  const res = await fetch(`${URL_API()}/calendar/v3${laluan}`, {
    method: opsyen.method ?? "GET",
    headers: { Authorization: `Bearer ${await tokenAkses()}`, "Content-Type": "application/json" },
    body: opsyen.badan ? JSON.stringify(opsyen.badan) : undefined,
  });
  if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

const idKalendar = () => encodeURIComponent(process.env.GOOGLE_CALENDAR_ID!.trim());

export type Acara = { id: string; tajuk: string; mula: string; tamat: string };

export async function senaraiAcara(dari: Date, hingga: Date): Promise<Acara[]> {
  const p = new URLSearchParams({
    timeMin: dari.toISOString(),
    timeMax: hingga.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });
  const d = await google<{ items?: { id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }[] }>(
    `/calendars/${idKalendar()}/events?${p}`,
  );
  return (d.items ?? []).map((e) => ({
    id: e.id,
    tajuk: e.summary ?? "(tanpa tajuk)",
    mula: e.start?.dateTime ?? `${e.start?.date}T00:00:00+08:00`,
    tamat: e.end?.dateTime ?? `${e.end?.date}T00:00:00+08:00`,
  }));
}

async function masaSibuk(dari: Date, hingga: Date): Promise<{ mula: number; tamat: number }[]> {
  const d = await google<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>("/freeBusy", {
    method: "POST",
    badan: { timeMin: dari.toISOString(), timeMax: hingga.toISOString(), timeZone: ZON, items: [{ id: process.env.GOOGLE_CALENDAR_ID!.trim() }] },
  });
  const kal = Object.values(d.calendars ?? {})[0];
  return (kal?.busy ?? []).map((b) => ({ mula: new Date(b.start).getTime(), tamat: new Date(b.end).getTime() }));
}

/** Slot interview kosong dalam 7 hari akan datang (ikut waktu interview dalam keutamaan). */
export async function slotKosong(opsyen: { hari?: number; minit?: number; maks?: number } = {}, kini = new Date()): Promise<string[]> {
  const k = await bacaKeutamaan();
  const minit = opsyen.minit ?? 30;
  const awal = kini.getTime() + 12 * 3600_000; // sekurang-kurangnya 12 jam dari sekarang
  const hingga = new Date(kini.getTime() + (opsyen.hari ?? 7) * 86400_000);
  const sibuk = await masaSibuk(kini, hingga);
  const slot: string[] = [];
  for (let n = 0; n <= (opsyen.hari ?? 7); n++) {
    const tarikh = tambahHari(tarikhMY(kini), n);
    const mulaHari = gabungMY(tarikh, k.waktuInterview.mula);
    const tamatHari = gabungMY(tarikh, k.waktuInterview.tamat);
    if (!mulaHari || !tamatHari || !k.waktuInterview.hari.includes(hariMingguMY(mulaHari))) continue;
    for (let t = mulaHari.getTime(); t + minit * 60_000 <= tamatHari.getTime(); t += 30 * 60_000) {
      const tamat = t + minit * 60_000;
      if (t < awal) continue;
      if (sibuk.some((b) => t < b.tamat && tamat > b.mula)) continue;
      slot.push(new Date(t).toISOString());
      if (slot.length >= (opsyen.maks ?? 8)) return slot;
    }
  }
  return slot;
}

export async function ciptaAcara(opsyen: { tajuk: string; mula: Date; minit: number; penerangan?: string }): Promise<Acara> {
  const tamat = new Date(opsyen.mula.getTime() + opsyen.minit * 60_000);
  const d = await google<{ id: string }>(`/calendars/${idKalendar()}/events`, {
    method: "POST",
    badan: {
      summary: opsyen.tajuk,
      description: opsyen.penerangan,
      start: { dateTime: opsyen.mula.toISOString(), timeZone: ZON },
      end: { dateTime: tamat.toISOString(), timeZone: ZON },
      reminders: { useDefault: true },
    },
  });
  return { id: d.id, tajuk: opsyen.tajuk, mula: opsyen.mula.toISOString(), tamat: tamat.toISOString() };
}

/** Pastikan slot masih kosong sebelum menempah (elak tempahan bertindih). */
export async function slotMasihKosong(mula: Date, minit: number): Promise<boolean> {
  const tamat = new Date(mula.getTime() + minit * 60_000);
  const sibuk = await masaSibuk(new Date(mula.getTime() - 60_000), new Date(tamat.getTime() + 60_000));
  return !sibuk.some((b) => mula.getTime() < b.tamat && tamat.getTime() > b.mula);
}

export function paparSlot(iso: string): string {
  return paparPendekMY(new Date(iso));
}
