# WA Chatbot - AI-Powered WhatsApp Bot

Dokumentasi telah disesuaikan dengan codebase terbaru.

WA Chatbot adalah bot Customer Service WhatsApp yang menggabungkan proses bot (Baileys) dan dashboard API (Express) dalam satu proses (entrypoint: index.js). README ini fokus pada konfigurasi yang benar agar tidak terjadi kebingungan.

## 🎯 Ringkasan fitur

- AI multi-provider (Groq, OpenRouter, OpenAI, Google Gemini) melalui modul ai_factory.js
- Auto-fallback provider (sesuai konfigurasi di database)
- Support pesan teks & gambar (deteksi bukti pembayaran)
- Penyimpanan history & konfigurasi di SQLite (database layer: database.js)
- Notifikasi opsional ke Telegram
- Sinkronisasi produk ke WhatsApp Business Catalog (jika akun Business)
- Dashboard statis di `public/` yang dilayani oleh Express (mock auth default)

---

## 🚀 Menjalankan (singkat)

1. Clone repo

```bash
git clone https://github.com/deyogaid/wa-chatbot.git
cd wa-chatbot
```

2. Install dependencies

```bash
npm install
```

3. Buat file .env dari contoh atau buat baru

```bash
cp .env.example .env
# edit .env sesuai kebutuhan
```

4. Jalankan (bot + dashboard dijalankan bersamaan oleh index.js)

```bash
npm start
# atau
node index.js
```

Setelah berjalan, dashboard (statis) tersedia di http://localhost:3000 dan API juga dilayani di port yang sama.

---

## 🔧 Environment variables (penting)

Berikut variabel environment yang digunakan oleh codebase. Sesuaikan di `.env`.

- PORT (opsional, default: 3000)
- OWNER_PAUSE_MINUTES (opsional, default: 5) — durasi pause saat owner sedang mengetik
- TELEGRAM_BOT_TOKEN (opsional) — untuk notifikasi ke Telegram
- TELEGRAM_CHAT_ID (opsional)
- N8N_WEBHOOK_URL (opsional) — forward bukti pembayaran ke n8n
- BOTPRESS_BOT_ID (opsional) — gunakan jika ingin forward ke Botpress
- BOTPRESS_ACCESS_TOKEN (opsional)

AI provider (salah satu atau beberapa, disimpan juga di DB melalui dashboard):
- GROQ_API_KEY, GROQ_MODEL
- OPENROUTER_API_KEY, OPENROUTER_MODEL
- OPENAI_API_KEY, OPENAI_MODEL
- GEMINI_API_KEY, GEMINI_MODEL

Catatan:
- Code memeriksa konfigurasi AI dari database (db.getAIConfig). Pastikan Anda menyimpan API key + provider di dashboard (API) atau langsung di DB.
- Jika tidak ada API key di DB, bot akan menolak panggilan AI dan mengembalikan pesan konfigurasi belum lengkap.

---

## 📁 Lokasi & file penting

- entrypoint: `index.js` (menggabungkan bot WA dan Express API)
- static dashboard: `public/`
- database layer: `database.js` (SQLite)
- AI abstraction: `ai_factory.js`
- WhatsApp auth session: `./auth_info_baileys/` (folder yang berisi cred untuk Baileys)
- DB file (default dibuat oleh database.js) — biasanya `kartini_bot.db` atau path yang diset di database.js

Penting: untuk reset pairing, hapus isi folder `auth_info_baileys/` dan restart bot untuk scan QR ulang.

---

## 📡 API (ringkasan endpoint)

Dashboard saat ini menggunakan mock authentication (mockAuth) yang menetapkan user id `admin`. Ganti mekanisme autentikasi sebelum deployment production.

Beberapa endpoint yang tersedia:
- GET `/api/bot-status` — status koneksi WA
- POST `/api/bot-connect` — minta pairing code (body: { phone })
- GET/POST `/api/ai-config` — baca / update konfigurasi AI untuk user (mock: admin)
- GET/POST/PUT/DELETE `/api/products` — CRUD produk
- POST `/api/products/sync-catalog` — sinkronisasi produk ke WA Catalog (WA Business required)
- GET/POST `/api/faqs` dan `/api/faqs/:id` — CRUD FAQ
- GET/POST/PUT/DELETE `/api/quick-replies/local` — quick replies yang disimpan di DB
- GET `/api/quick-replies` — quick replies dari WA Business (WA Business required)
- POST `/api/quick-replies/refresh` — refresh cache quick replies dari WA
- GET `/api/alerts` — system alerts
- POST `/api/models` — fetch model list dari provider (body: { provider, api_key })
- POST `/api/chat` — kirim pesan WA via bot (body: { to, message })
- GET `/` — health check

Contoh `POST /api/chat`:
- body: { "to": "6281234567890", "message": "Halo" }
- Endpoint akan menambahkan `@s.whatsapp.net` jika belum disertakan.

---

## 🛡️ Keamanan & catatan deployment

- Dashboard saat ini menggunakan mockAuth (untuk pengembangan). Sangat disarankan menambahkan autentikasi (JWT / OAuth2 / session) sebelum produksi.
- Jangan simpan API keys di repo publik. Gunakan environment variables atau secret manager.
- Jika men-deploy di server publik, gunakan reverse proxy (nginx) + HTTPS.
- Untuk auto-restart gunakan PM2:

```bash
npm install -g pm2
pm start # atau pm2 start index.js --name wa-bot
```

---

## 📱 Termux (Android)

Code mendeteksi Termux dan akan mengatur user-agent/browser agar kompatibel.

Langkah umum di Termux:

1. Update & install build tools (penting untuk sqlite native builds):

```bash
pkg update -y && pkg upgrade -y
pkg install -y python make clang git
pkg install -y nodejs npm
```

2. Clone & install

```bash
git clone https://github.com/deyogaid/wa-chatbot.git
cd wa-chatbot
npm install
```

3. Jika ada error saat install `sqlite3`, coba build dari source:

```bash
npm install sqlite3 --build-from-source
```

4. Jalankan

```bash
node index.js
```

---

## 🐞 Troubleshooting umum

- QR tidak muncul atau koneksi gagal:
  - Pastikan `auth_info_baileys/` dapat ditulis oleh process.
  - Hapus folder `auth_info_baileys/` untuk reset pairing.

- Bot belum terhubung saat panggilan API:
  - Pastikan `startBot()` berjalan tanpa error di log.
  - Cek endpoint `/api/bot-status` untuk status koneksi.

- Error: Sistem AI belum dikonfigurasi
  - Simpan API key + provider di `/api/ai-config` (dashboard) atau langsung di DB.

- Sinkronisasi katalog WA gagal:
  - Fitur ini hanya untuk akun WA Business.
  - Pastikan `currentSock` terhubung dan `isWABiz(currentSock)` bernilai true.

---

## ⚙️ Catatan teknis penting

- entrypoint tunggal: `index.js` menjalankan Express + Baileys sehingga tidak perlu menjalankan `server.js` terpisah (pastikan package.json `start` memakai `node index.js`).
- Mock auth: `const mockAuth = (req, res, next) => { req.user = { id: 'admin' }; next(); };` — ganti sebelum produksi.
- Quick replies: ada dua sumber quick replies — lokal (DB) dan WA Business (jika tersedia). Sistem memeriksa lokal dulu untuk menghemat penggunaan AI.

---

## 📚 Sumber & kontribusi

- Fork → branch → PR. Untuk perubahan cepat di repo Anda, saya sudah memperbarui README ini agar sesuai codebase.

---

**Terakhir diupdate:** 30 Mei 2026

Dibuat dengan ❤️ untuk memudahkan deployment dan menghindari kebingungan konfigurasi.
