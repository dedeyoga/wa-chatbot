# Panduan Maintenance - WA Chatbot

Panduan ini untuk membantu proses maintenance, update, dan troubleshooting bot WhatsApp.

---

## 📋 Daftar Isi

1. [Arsitektur Sistem](#arsitektur-sistem)
2. [Update & Upgrade](#update--upgrade)
3. [Troubleshooting Umum](#troubleshooting-umum)
4. [Monitoring & Logging](#monitoring--logging)
5. [Backup & Restore](#backup--restore)
6. [Keamanan](#keamanan)

---

## Arsitektur Sistem

### Struktur Proyek

```
wa-chatbot/
├── index.js              # Main bot WhatsApp (Baileys)
├── server.js             # Express dashboard
├── database.js           # SQLite database layer
├── ai_factory.js         # AI provider abstraction
├── package.json          # Dependencies
├── .env                  # Konfigurasi environment
├── auth_info_baileys/    # Session WhatsApp auth
├── public/               # Frontend dashboard
└── *.db                  # Database file
```

### Alur Kerja

```
Pesan masuk → index.js
    ↓
Cek tipe (teks/gambar)
    ↓
Teks → Cek command FAQ → AI Factory → Provider AI → Respons
Gambar → Deteksi tipe → Proses dokumen/pembayaran
    ↓
Kirim balik → Simpan history DB → Notifikasi Telegram (optional)
```

### Komponen Kunci

| File | Fungsi | Catatan Maintenance |
|------|--------|---------------------|
| `index.js` | Core bot WhatsApp | Sesuai update Baileys |
| `server.js` | Dashboard API | Update port di .env |
| `database.js` | SQLite layer | Backup rutin .db |
| `ai_factory.js` | AI abstraction | Cek API key valid |
| `.env` | Konfigurasi | Jangan commit ke git |

---

## Update & Upgrade

### Update Dependencies

Periksa versi saat ini:
```bash
npm outdated
```

Update semua paket:
```bash
# Backup dulu
cp package.json package.json.bak

# Update
npm update

# Cek error
npm test  # jika ada
```

### Update Node.js

Cek versi saat ini:
```bash
node --version
npm --version
```

Pastikan kompatibel dengan Baileys v6.x (minimal Node 18+).

### Update Baileys Library

Baileys sering perubahan breaking. Cek dokumen resmi sebelum update:
```bash
# Cek changelog
npm view @whiskeysockets/baileys

# Update jika perlu
npm install @whiskeysockets/baileys@latest
```

### Rollback

```bash
# Dari backup
git checkout -- package.json
npm install
```

---

## Troubleshooting Umum

### Bot Tidak Terhubung / QR Code Tidak Muncul

**Penyebab Umum:**
- Session expired (`auth_info_baileys/` corrupt)
- WhatsApp memperbarui protokol
- Dependency tidak cocok

**Solusi:**
```bash
# 1. Hapus session lama
rm -rf auth_info_baileys/

# 2. Restart bot
node index.js

# 3. Scan QR code baru
```

### Bot Terputus Terus-Menerus

**Diagnosis:**
```bash
# Jalankan dengan verbose logging
DEBUG=* node index.js 2>&1 | tee bot-debug.log
```

**Penyebab Umum:**
- API key expired/invalid
- Rate limit AI provider
- Jaringan tidak stabil
- Session WhatsApp terkena ban

**Solusi:**
1. Cek `.env` — pastikan API key valid
2. Cek `bot-debug.log` untuk error spesifik
3. Ganti provider AI jika rate limit
4. Tunggu 10-15 menit jika terkena temporary ban

### Dashboard Tidak Diakses

**Diagnosis:**
```bash
# Cek apakah server running
curl -s http://localhost:3000 | head -20

# Cek port yang digunakan
lsof -i :3000
```

**Solusi:**
```bash
# Ubah port di .env
nano .env
# Set: PORT=3001

# Restart dashboard
Ctrl+C  # stop dulu
node server.js
```

### Error Database

**Diagnosis:**
```bash
# Cek file database ada dan ukurannya
ls -lh *.db
ls -lh auth_info_baileys/

# Repair SQLite jika corrupt
sqlite3 database_name.db "PRAGMA integrity_check;"
```

**Solusi:**
```bash
# Backup dulu
cp nama_database.db nama_database.db.bak

# Repair
sqlite3 nama_database.db "VACUUM;"
```

### Memory Leak / RAM Penuh

**Diagnosis:**
```bash
# Monitor RAM
watch -n 5 free -h

# Cek proses Node
ps aux | grep node
```

**Solusi:**
```bash
# Restart bot
pkill -f "node index.js"
node index.js
```

---

## Monitoring & Logging

### Log Files

| File | Isi | Strategi |
|------|-----|----------|
| `server.log` | Bot output | Rotate mingguan |
| `server.2026-XX-XX_XX-XX-XX_*.log` | Log archive | Simpan 7 hari terakhir |

### Setup Log Rotation

```bash
# Buat script logrotate
# /etc/logrotate.d/wa-chatbot (jika root)

# Atau manual - hapus log lama
find . -name "server.*.log" -mtime +7 -delete
```

### Monitoring Sederhana

```bash
# Check bot alive
ps aux | grep "[n]ode index.js"

# Check response time
curl -o /dev/null -s -w "%{time_total}\n" http://localhost:3000/api/health

# Monitor log real-time
tail -f server.log | grep --color -E "(error|ERROR|warn|WARN)"
```

### Notifikasi Error ke Telegram

Jika bot down, dapat notifikasi via Telegram:
```bash
# Buat script watchdog
#!/data/data/com.termux/files/usr/bin/bash
if ! pgrep -f "node index.js" > /dev/null; then
    curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=BOT%20DOWN%20-%20Perlu%20restart"
fi
```

---

## Backup & Restore

### Backup Rutin

```bash
#!/data/data/com.termux/files/usr/bin/bash
# backup_wa_chatbot.sh

BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
cp *.db "$BACKUP_DIR/db_$DATE.db"

# Backup autentikasi
tar -czf "$BACKUP_DIR/auth_$DATE.tar.gz" auth_info_baileys/

# Backup konfigurasi
cp .env "$BACKUP_DIR/env_$DATE.bak"

# Hapus backup lama (>7 hari)
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup selesai: $DATE"
```

### Restore dari Backup

```bash
# 1. Stop bot
pkill -f "node index.js"

# 2. Restore database
cp backups/db_20260515_120000.db ./kartini_bot.db

# 3. Restore session (jika perlu)
tar -xzf backups/auth_20260515_120000.tar.gz

# 4. Restart bot
node index.js
```

---

## Keamanan

### Ceklist Keamanan

- [ ] `.env` tidak di-commit ke Git (sudah ada di `.gitignore`)
- [ ] API keys diganti dengan yang baru secara berkala (3-6 bulan)
- [ ] Password admin di `.env` diubah dari default
- [ ] Backup database dienkripsi jika berisi data sensitif

### Audit API Key

```bash
# Cek expiry/usage (contoh untuk Groq)
curl -s "https://api.groq.com/openai/v1/models" \
  -H "Authorization: Bearer $GROQ_API_KEY"
```

### Update API Key

```bash
# Edit .env
nano .env

# Ganti key yang expired
# Restart bot
pkill -f "node index.js"
node index.js
```

---

## Quick Reference

### Command Paling Sering Dipakai

```bash
# Start bot
node index.js

# Start dashboard
node server.js

# Stop bot
pkill -f "node index.js"

# Lihat log
tail -f server.log

# Cek apakah bot running
pgrep -fl "node index.js"

# Backup manual
./backup_wa_chatbot.sh

# Cek ukuran database
du -sh *.db
```

---

## Emergency Procedures

### Bot Tidak Bisa Dihubungi

1. Cek `ps aux | grep node` — apakah proses hidup?
2. Jika tidak, cek `server.log` untuk error fatal
3. Jika ada error dependency, restore dari git:
   ```bash
   git status
   git diff --stat
   git log --oneline -5
   ```
4. Hapus session dan scan ulang jika Baileys bermasalah

### Database Rusak

1. Stop bot
2. Backup file corrupt
3. Coba repair: `sqlite3 file.db "PRACIMA integrity_check;"`
4. Jika tidak bisa, restore dari backup terbaru

### API Key Habis

1. Cek log untuk error `401` atau `403`
2. Buat API key baru dari provider (Groq/OpenAI/Gemini)
3. Update di `.env`
4. Restart bot

---

## Kontak & Escalation

Jika maintenance melibatkan investigasi mendalam:

- Dokumentasikan gejala di `server.log`
- Catat versi Node.js dan dependency yang terpasang: `npm ls`
- Catat hash commit git terakhir: `git rev-parse HEAD`

---

**Dibuat:** Juni 2026 | **Pemilik:** dedeyoga | **Repo:** https://github.com/dedeyoga/wa-chatbot
