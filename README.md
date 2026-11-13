# Tanya Darwish: Portfolio Agent

Agent AI di laman portfolio yang menjawab soalan recruiter dan kawan tentang kerjaya Darwish, memaparkan kad projek dan menghantar mesej kepada Darwish melalui Telegram.

Dibina dengan **Next.js + TypeScript**, LLM percuma dari **Groq**, dan gelung agent yang ditulis sendiri (tanpa framework) supaya setiap langkah boleh difahami.

## Cara ia berfungsi

```
Pelawat ──soalan──▶ /api/chat ──▶ GELUNG AGENT ◀──▶ Groq (LLM)
                                     │
                                     ▼ LLM minta tool, kod kita jalankan
                       ┌─────────────┼──────────────┐
               cari_pengetahuan  papar_projek  maklum_darwish
                 (folder content/)  (kad projek)   (Telegram)
```

1. Pelawat tekan butang soalan atau menaip.
2. `/api/chat` semak guardrails (had kadar, panjang mesej).
3. Gelung agent hantar system prompt + senarai tools + mesej kepada LLM.
4. LLM minta tool (contoh `cari_pengetahuan`). Kod kita jalankan dan hantar hasil semula.
5. Ulang sehingga LLM beri jawapan akhir (maksimum 5 pusingan).
6. Jawapan, kad projek dan soalan susulan dipaparkan.

## Struktur projek

| Fail | Konsep agentic AI | Apa isinya |
| --- | --- | --- |
| `src/lib/agent/loop.ts` | Gelung agent | Jantung sistem. Baca fail ini dahulu. |
| `src/lib/agent/prompt.ts` | System prompt | Identiti dan peraturan agent |
| `src/lib/agent/tools.ts` | Tool calling | Definisi dan kod setiap tool |
| `src/lib/rag/knowledge.ts` | RAG | Pecah fail jadi ketul, cari ketul relevan |
| `src/lib/guardrails.ts` | Guardrails | Had kadar dan had panjang mesej |
| `src/app/api/chat/route.ts` | Backend | Endpoint yang dipanggil oleh UI |
| `src/components/Chat.tsx` | UI | Widget chat, butang soalan, kad projek |
| `src/config/suggestions.ts` | UX | Butang soalan pembuka |
| `content/` | Pangkalan pengetahuan | **Maklumat tentang anda: isi di sini** |
| `scripts/chat.ts` | Debug | Chat dari terminal, nampak setiap tool dipanggil |
| `scripts/test-agent.ts` | Eval asas | Ujian gelung agent dengan LLM palsu |

## Cara jalankan (kali pertama)

Keperluan: [Node.js](https://nodejs.org) versi 20 atau lebih baru.

1. **Dapatkan kunci Groq percuma:** daftar di [console.groq.com](https://console.groq.com), buka *API Keys*, tekan *Create API Key*, dan salin kunci.
2. **Pasang pakej:**
   ```bash
   npm install
   ```
3. **Tetapkan kunci:** salin `.env.example` kepada `.env.local`, kemudian isi `GROQ_API_KEY`.
   ```bash
   cp .env.example .env.local
   ```
4. **Uji gelung agent (tanpa internet):**
   ```bash
   npm run test:agent
   ```
5. **Chat dari terminal** untuk nampak agent bekerja:
   ```bash
   npm run chat
   ```
6. **Jalankan laman web:**
   ```bash
   npm run dev
   ```
   Buka http://localhost:3000

## Isi maklumat anda

Semua pengetahuan agent ada dalam folder `content/`:

- `profil.md`: ringkasan, pendidikan, pengalaman, kemahiran, matlamat
- `sijil.md`: sijil dengan link pengesahan
- `faq.md`: jawapan yang anda mahu agent beri
- `projek.json`: senarai projek untuk kad projek dan carian

Peraturan:

- Satu tajuk `##` = satu topik. Agent mencari ikut bahagian ini.
- Baris yang bermula dengan `TODO` **tidak dibaca** oleh agent. Gantikan dengan maklumat sebenar.
- Projek dengan `"draf": true` tidak dipaparkan.
- Jangan masukkan maklumat sulit syarikat tanpa kebenaran supervisor, atau maklumat peribadi (alamat, IC, nombor telefon).

Selepas mengubah `content/`, mulakan semula `npm run dev`.

## Tambah tool baru

Dalam `src/lib/agent/tools.ts`, cipta tool dengan `buatTool({ nama, penerangan, skema, jalankan })` dan tambah ke senarai `TOOLS`. LLM memilih tool berdasarkan `penerangan`, jadi tulis dengan jelas bila tool itu patut digunakan.

## Notifikasi Telegram (pilihan)

1. Di Telegram, cari **@BotFather**, hantar `/newbot` dan salin token.
2. Hantar satu mesej kepada bot baru anda.
3. Buka `https://api.telegram.org/bot<TOKEN>/getUpdates` dan salin nombor `chat.id`.
4. Isi `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` dalam `.env.local`.

Tanpa Telegram, mesej pelawat hanya dicetak di terminal.

## Deploy ke Vercel (percuma)

1. Push projek ke GitHub (fail `.env.local` tidak akan ikut, dan itu betul).
2. Di [vercel.com](https://vercel.com), *Add New Project* dan pilih repo ini.
3. Dalam *Environment Variables*, tambah `GROQ_API_KEY` (dan Telegram jika ada).
4. Tekan *Deploy*.

## Agent peribadi Telegram (Fasa 1)

Bot Telegram yang hanya mendengar arahan Darwish:

- **Peringatan** ikut waktu Malaysia: *"Esok pukul 7 pagi ingatkan saya siap sedia interview"*
- **Keutamaan carian kerja**: *"Tambah lokasi Kuala Lumpur"*, *"Esok tak perlu cari di LinkedIn"*
- **Lead pintar**: setiap mesej pelawat laman disimpan + notifikasi Telegram tersusun
- **Laporan harian** jam 9 malam: soalan pelawat, soalan yang agent gagal jawab, leads, jadual esok

| Fail | Fungsi |
| --- | --- |
| `src/lib/agent/peribadi.ts` | Prompt + tools agent peribadi |
| `src/app/api/telegram/route.ts` | Webhook: Telegram hantar mesej bot ke sini |
| `src/app/api/telegram/setup/route.ts` | Sambung bot ke webhook (sekali sahaja) |
| `src/app/api/cron/route.ts` | Dipanggil setiap 5 minit: peringatan & laporan |
| `src/lib/store.ts` | Memori kekal: Netlify Blobs (fail `.data/` di laptop) |
| `src/lib/masa.ts` | Penukaran waktu Malaysia |

### Setup

1. Netlify → *Environment variables*: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `AGENT_SECRET` (huruf + nombor, minimum 16 aksara). Deploy semula.
2. Buka sekali: `https://tanya-darwish.netlify.app/api/telegram/setup?kunci=AGENT_SECRET`
3. Di [cron-job.org](https://cron-job.org) (percuma), cipta cron job setiap 5 minit ke `https://tanya-darwish.netlify.app/api/cron?kunci=AGENT_SECRET`
4. Hantar `/start` kepada bot anda.

Ujian tanpa internet: `npm run test:peribadi`

## Tukar model

Lalai: `openai/gpt-oss-120b`. Tetapkan `GROQ_MODEL` dalam `.env.local` untuk mencuba model lain yang menyokong tool calling, contohnya `llama-3.3-70b-versatile`. Senarai model dan had percuma terkini ada di console Groq.

## Fasa seterusnya

- [ ] Isi semua `TODO` dalam `content/`
- [ ] Streaming jawapan (perkataan demi perkataan)
- [ ] Carian vektor: embedding + Supabase pgvector (ganti `cariPengetahuan`, gelung tidak berubah)
- [ ] Tools `hantar_cv` dan `tempah_meeting`
- [ ] Panel admin untuk upload bahan
- [x] Agent peribadi Telegram, peringatan, lead pintar, laporan harian
- [ ] Carian kerja harian (JSearch) + penilai padanan jawatan
- [ ] Resume ATS + cover letter, draf diluluskan melalui Telegram, hantar melalui Gmail
- [ ] Tempah interview (Google Calendar) melalui web & Telegram
- [ ] Had kadar kekal
- [ ] Set eval 40 soalan
