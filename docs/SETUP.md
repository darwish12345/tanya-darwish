# Panduan setup (semua percuma, tanpa kad kredit)

Semua nilai di bawah dimasukkan di **Netlify → Site configuration → Environment variables**.
Selepas menambah pemboleh ubah, satu deploy diperlukan supaya ia berkuat kuasa (Deploys → Trigger deploy).
Tambah semua sekali gus, kemudian deploy **sekali sahaja** (setiap deploy produksi = 15 kredit daripada 300 sebulan).

`/api/sihat` menunjukkan bahagian mana yang sudah aktif (`ciri`).

## Sudah ada (jangan ubah)

`GROQ_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `AGENT_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

## 1. Peringatan tepat pada minit: QStash (5 minit)

1. Buka https://console.upstash.com → menu **QStash** (akaun yang sama dengan Redis).
2. Salin **QSTASH_TOKEN** (bukan signing key).
3. Netlify: `QSTASH_TOKEN` = token tadi.
4. Jika URL QStash di console bukan `https://qstash.upstash.io` (contoh rantau EU/US lain), tambah juga `QSTASH_URL`.

Tanpa QStash: peringatan tetap berfungsi melalui cron, tetapi boleh lewat sehingga 15 minit.

## 2. Cron sandaran: cron-job.org (2 minit)

Tukar jadual tugas sedia ada (`/api/cron?kunci=...`) kepada **setiap 15 minit**. Cron ini menjalankan briefing pagi,
carian kerja harian, laporan malam, semakan inbox dan sandaran peringatan.

## 3. Carian kerja harian: JSearch (5 minit)

1. Daftar di https://rapidapi.com (log masuk dengan Google).
2. Cari **JSearch** (oleh OpenWeb Ninja / letscrape) → **Pricing** → pilih **Basic ($0, 200 permintaan/bulan)**.
   Jika diminta kad kredit, BERHENTI dan beritahu Claude; jangan masukkan kad.
3. Salin **X-RapidAPI-Key** dari halaman "Endpoints".
4. Netlify: `JSEARCH_API_KEY` = kunci tadi.

Penggunaan: 3 jawatan × 30 hari ≈ 90 permintaan sebulan. Had 200 ialah had keras (tiada caj).

## 4. Hantar permohonan dari Gmail (5 minit)

1. Akaun Google → **Security** → hidupkan **2-Step Verification** (jika belum).
2. Buka https://myaccount.google.com/apppasswords → cipta App Password bernama "Tanya Darwish".
3. Netlify: `GMAIL_USER` = alamat Gmail anda, `GMAIL_APP_PASSWORD` = 16 huruf tadi (tanpa ruang).

Ini juga mengaktifkan semakan inbox: bila recruiter dari syarikat yang anda mohon membalas, anda dimaklumkan di Telegram.
Agent **tidak boleh** menghantar emel tanpa anda tekan butang **Hantar**.

## 5. Tempah interview ke Google Calendar (15 minit)

1. https://console.cloud.google.com → cipta projek baru "tanya-darwish" (percuma, tiada billing diperlukan).
2. **APIs & Services → Library** → cari **Google Calendar API** → Enable.
3. **IAM & Admin → Service Accounts** → Create → nama "agent" → Done.
4. Klik service account itu → **Keys → Add key → JSON**. Fail JSON dimuat turun.
5. Buka Google Calendar → Settings → kalendar anda → **Share with specific people** → tambah emel service account
   (contoh `agent@tanya-darwish.iam.gserviceaccount.com`) dengan kebenaran **Make changes to events**.
6. Netlify:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = `client_email` dari fail JSON
   - `GOOGLE_PRIVATE_KEY` = `private_key` dari fail JSON (salin semuanya termasuk `-----BEGIN PRIVATE KEY-----`)
   - `GOOGLE_CALENDAR_ID` = alamat Gmail anda
7. Padam fail JSON dari komputer selepas itu.

Slot interview: Isnin–Jumaat 10:00–17:00, sekurang-kurangnya 12 jam dari sekarang (boleh diubah melalui Telegram).

## 6. Maklumat resume (2 minit)

Netlify: `RESUME_TELEFON` dan `RESUME_LOKASI` (contoh "Shah Alam, Selangor"). Nilai ini tidak disimpan dalam repo awam.
Kemudian hantar **PDF CV anda** kepada bot Telegram. Agent akan mengisi pendidikan dan pengalaman dalam resume induk.

## 7. Eval di GitHub Actions (3 minit)

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
`GROQ_API_KEY` = kunci Groq yang sama. Kemudian **Actions → Eval → Run workflow** (pilih `web`, dan esoknya `peribadi`).

## 8. Selepas deploy

1. Buka sekali: `https://tanya-darwish.netlify.app/api/telegram/setup?kunci=AGENT_SECRET_ANDA`
   (perlu untuk butang Telegram dan menu arahan baharu).
2. Di Telegram, hantar `/start`.
3. Semak keutamaan: hantar "lihat keutamaan saya". Jika sumber hanya "Indeed" (kesan pepijat lama), hantar
   "mulai sekarang cari di LinkedIn, Indeed dan Glassdoor".
