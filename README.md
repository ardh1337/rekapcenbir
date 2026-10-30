# Telegram Bot Rekap Centang Biru

Bot Telegram untuk rekapitulasi data pengerjaan centang biru (multi-user grup) dengan pencatatan nomor, foto, nama, email, grouping set, rekapan data otomatis (+7 hari langganan), pengiriman album report ke grup, dan sistem reminder H-1 otomatis pada pukul 12:00 WIB dan 20:00 WIB.

---

## 🚀 Fitur Utama

0. **Live Animated Custom Emoji**:
   * Terintegrasi dengan emoji pack live Telegram [hhbp21](https://t.me/addemoji/hhbp21).
   * Tampilan pesan di Telegram menggunakan animasi emoji live (📋, 📊, 📧, 📦, 📅, 🔔, 🧾, dll.) dengan fallback unicode standar.

1. **Reaktif 100% pada Pengiriman Foto + Caption Nomor**:
   * Anggota tim langsung kirim Foto dengan caption nomor HP (contoh: `628258149784` atau `08123456789`).
   * Bot merespon dengan urutan langkah interaktif:
     * **Langkah 1 (NAMA):** Pilihan nama bersama. Nama yang terakhir dipilih/dibuat berada di **paling kiri (`🟢 Thomas Lee`)** untuk semua anggota grup. Input nama baru otomatis dikonversi ke **Title Case**.
     * **Langkah 2 (SET):** Pilihan set bersama (Format: `Set 1 19 Oct 2026`). Set yang terakhir dibuat berada di **paling kiri (`🟢 Set 1 19 Oct 2026`)** untuk semua anggota grup. Ada opsi `➕ Buat Set Baru` (Auto-increment `⏩ Set 2...` atau `✍️ Input Manual`).
     * **Langkah 3 (EMAIL):** Pilihan email. Email terakhir diingat **per-user (`🟢 email_pribadi`)** di paling kiri. Bisa tambah email baru dengan `➕ Add Email`.
   * **Notifikasi Sukses:**
     ```text
     ✅ Tersimpan ke Set 1 19 oct 2026
     👤 Nama: Alex
     📱 Nomor: 628258149784
     ⏰ Waktu: 19 Oct 2026 22:00:13 WIB
     📧 Email: email1@gmail.com
     ```

2. **Menu `/start` Minimalis (2 Tombol Saja)**:
   * `[ 📋 Data ]` dan `[ 📊 Report ]`

3. **Tombol `[ 📋 Data ]` (Filter Tanggal Pengerjaan Nyata / Input Time)**:
   * Menampilkan daftar tanggal pengerjaan.
   * Menghitung total nomor, breakdown per-set, tanggal mulai langganan (+7 hari dari tanggal input), dan kalkulasi biaya langganan:
     ```text
     📋 DATA: 19 Oct 2026 - Start Langganan di tanggal 26 Oct 2026
     Total: 25 Nomor (2 Set) - Rp 3.125.000

     📦 Set 1:
     1. Alex - wa.me/+628258149784
     2. Alex - wa.me/+628641842121
     3. Budi - wa.me/+628641842121

     📦 Set 2:
     1. Budi - wa.me/+628641849636
     ```

4. **Tombol `[ 📊 Report ]` (Pengiriman Album Foto ke Telegram)**:
   * Menampilkan pilihan Set atau Semua Set pada tanggal tersebut.
   * Mengirim **Album Foto** ke chat dengan format caption:
     * **Jika 1 Nama:**
       ```text
       Alex
       • wa.me/+628258149784
       • wa.me/+628641842121
       ```
     * **Jika >1 Nama:**
       ```text
       Alex & Budi
       1. Alex - wa.me/+628258149784
       2. Alex - wa.me/+628641842121
       3. Budi - wa.me/+628641849636
       ```

5. **Pengingat Otomatis (Reminder H-1 Langganan)**:
   * Dikirim 2x sehari pada H-1 (pukul **12:00 WIB** dan **20:00 WIB**) ke grup Telegram.
   * Format pesan:
     ```text
     🔔 PENGINGAT (H-1 LANGGANAN) 🔔

     Besok (26 Oct 2026) ada jadwal mulai langganan untuk data input 19 Oct 2026!
     📊 Total: 25 Nomor (2 Set)
     💰 Total Biaya: 25 x Rp 125.000 = Rp 3.125.000
     ```

6. **Penyimpanan Lokal & Private Report**:
   * Database SQLite bawaan Node.js (`node:sqlite`) yang aman dan cepat.
   * Foto otomatis diunduh ke folder `storage/photos/[Set_Name]/`.
   * Perintah `/excel` untuk export seluruh database ke file Excel `.xlsx`.

---

## 🛠️ Cara Menjalankan

1. **Buat file `.env`**:
   Salin `.env.example` menjadi `.env`:
   ```bash
   cp .env.example .env
   ```
   Isi `BOT_TOKEN` dengan token bot dari [@BotFather](https://t.me/BotFather).

2. **Jalankan Bot**:
   ```bash
   npm start
   ```

3. **Gunakan di Grup Telegram**:
   * Masukkan bot ke grup Telegram tim Anda dan beri izin mengirim pesan/media.
   * Bot akan otomatis mendeteksi ID grup saat aktif.
   * Ketik `/start` untuk membuka menu, atau langsung kirim foto + caption nomor telepon untuk mulai merekap data!

