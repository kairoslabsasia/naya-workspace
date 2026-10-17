# PANDUAN DEPLOY NAYA WORKSPACE DI CPANEL (NODE.JS APP)

Selamat! Paket ini telah siap untuk di-deploy langsung ke cPanel hosting Anda tanpa perlu setup rumit.

---

## 🚀 LANGKAH DEPLOYMENT CEPAT (3 MENIT)

### 1. Upload File ZIP ke cPanel
1. Login ke akun **cPanel** hosting Anda.
2. Buka menu **File Manager**.
3. Buat folder baru (misalnya `naya-workspace` di luar `public_html` atau sesuai keinginan Anda), atau langsung di folder subdomain yang Anda inginkan (misal `app.domainanda.com`).
4. **Upload** file `naya-workspace-cpanel.zip` ke dalam folder tersebut.
5. Klik kanan file zip > pilih **Extract** (Ekstrak di folder tersebut).

---

### 2. Setup Node.js Application di cPanel
1. Kembali ke Dashboard utama cPanel, cari dan klik menu **Setup Node.js App** (biasanya ada di bagian *Software*).
2. Klik tombol biru **Create Application**.
3. Isi kolom konfigurasi sebagai berikut:
   - **Node.js version**: Pilih versi **18.x** atau **20.x** (disarankan versi LTS terbaru yang tersedia).
   - **Application mode**: Pilih **Production**.
   - **Application root**: Masukkan nama folder tempat Anda mengekstrak file tadi (misal: `naya-workspace` atau `app.domainanda.com`).
   - **Application URL**: Pilih domain atau subdomain tempat aplikasi ingin diakses (misal: `app.domainanda.com` atau domain utama).
   - **Application startup file**: Ketik `server.js`.
4. Di bagian **Environment Variables** (opsional / jika ingin mengatur variabel di cPanel):
   - `PORT`: (Biarkan default / otomatis oleh Passenger)
   - `GEMINI_API_KEY`: Masukkan API Key Gemini Anda (file `.env` juga sudah otomatis disertakan di dalam folder).
   - `AI_NAME`: `Naya`
5. Klik tombol **Create** di kanan atas.

---

### 3. Jalankan Aplikasi
1. Setelah aplikasi terbuat, klik tombol **Start Application** (atau **Restart Application** jika sudah berjalan).
2. Buka URL domain/subdomain Anda di browser.
3. 🎉 **Aplikasi Naya Workspace sudah aktif dan berjalan secara live!**

---

## 🔐 KREDENSIAL LOGIN BAWAAN
- **Super Administrator**:
  - Username: `admin`
  - Password: `admin123`
- **Member Tim (Bisa ditambah/dihapus via menu Kelola Tim)**:
  - Username: `budi` (Password: `budi123`)
  - Username: `siti` (Password: `siti123`)

---

## 💡 TIPS & CATATAN PENTING
1. **Node Modules Sudah Terpasang**: Paket zip ini sudah dilengkapi folder `node_modules` bawaan yang kompatibel. Anda tidak wajib menjalankan `npm install` lagi di terminal.
2. **PWA & Akses HP**: Pastikan domain/subdomain Anda sudah aktif **SSL (HTTPS)** agar fitur Progressive Web App (PWA) dan tombol *"Install Aplikasi ke Layar Utama"* dapat berjalan maksimal di HP Android / iOS tim Anda.
3. **Database Lokal**: Data room, member, chat, dan ringkasan tersimpan aman di folder `data/db.json` tanpa memerlukan database MySQL/PostgreSQL eksternal. Backup rutin dapat dilakukan cukup dengan mengunduh folder `data/`.
