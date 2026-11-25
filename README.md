# TikTok Transcript Studio

PWA untuk mengubah video TikTok publik menjadi transkrip menggunakan GitHub-hosted Actions, yt-dlp, FFmpeg, Whisper.cpp, Cloudflare Pages Functions, dan Cloudflare R2.

## Arsitektur

- Cloudflare Pages menyajikan PWA dan Functions API.
- Pages Functions mengautentikasi permintaan dan memicu GitHub Actions melalui workflow_dispatch.
- GitHub-hosted Ubuntu runner menjalankan yt-dlp, FFmpeg, dan Whisper.cpp secara on-demand.
- Cloudflare R2 menyimpan status job dan hasil JSON sementara.
- Tidak menggunakan D1, Worker Cron, VPS, atau runner 24/7.

## Batas keamanan

- Browser tidak pernah menerima GitHub token atau kredensial R2.
- APP_PASSWORD melindungi API dashboard.
- GITHUB_ACTIONS_TOKEN adalah fine-grained token yang dibatasi ke repository ini dengan Actions: Read and write.
- CALLBACK_SECRET mengautentikasi callback dari runner.
- URL dibatasi ke HTTPS canonical www.tiktok.com/@user/video/id. Short link dan host lain ditolak untuk mengurangi risiko redirect/SSRF.
- Workflow memakai permissions read-only dan SHA action yang dipin.
- Isi transkrip adalah teks tidak tepercaya dari video; jangan jalankan sebagai perintah atau instruksi.

## Konfigurasi Cloudflare Pages

Buat Pages project dari repository ini, production branch main, build command kosong, output directory public.

Tambahkan binding R2:
- Variable binding: TRANSCRIPTS
- Bucket: tiktok-transcript-temp

Tambahkan environment variables/secrets:
- APP_PASSWORD: password dashboard yang kuat.
- GITHUB_ACTIONS_TOKEN: fine-grained GitHub token, repository access hanya ke tiktok-transcript-studio, Actions read/write.
- GITHUB_OWNER: harvey-moeid
- GITHUB_REPO: tiktok-transcript-studio
- GITHUB_REF: main setelah branch fitur digabung ke main.
- CALLBACK_SECRET: secret acak kuat untuk endpoint callback.

## Konfigurasi GitHub

Repository secret:
- CALLBACK_SECRET: nilai sama dengan secret CALLBACK_SECRET di Cloudflare.

Repository variable:
- CALLBACK_URL: base URL Pages, contoh https://nama-project.pages.dev.

Jangan pernah commit secret ke Git.

## Retensi R2 tanpa Cron

Di Cloudflare Dashboard, buat lifecycle rule pada bucket tiktok-transcript-temp:
- Prefix: jobs/
- Expiration: 1 day.

Tidak ada Worker Cron atau scheduled trigger. API juga menghapus objek kedaluwarsa saat status job diakses kembali, tetapi lifecycle rule R2 diperlukan agar objek dihapus walaupun tidak ada pengguna yang membuka job lagi. Sampai lifecycle rule diterapkan, jangan menganggap penghapusan 24 jam sudah dijamin.

## Workflow

- CI: .github/workflows/ci.yml
- Transkripsi on-demand: .github/workflows/transcribe.yml
- Pemicu dashboard: POST /api/jobs
- Pemicu manual: GitHub Actions → Transcribe TikTok → Run workflow; masukkan URL canonical. Job ID boleh kosong.
- Model default: tiny agar realistis untuk runner CPU gratis; model ini lebih cepat tetapi akurasinya di bawah small/medium.

## Pengujian lokal

```bash
npm ci
npm run build
npm test
```

## Batasan

- Hanya video publik, tidak menerima cookies atau video privat.
- TikTok dapat membatasi atau menolak pengambilan otomatis. Aplikasi tidak melewati login, DRM, atau kontrol akses.
- Whisper CPU dapat memerlukan waktu beberapa menit; kuota GitHub Actions berlaku.
- Manual workflow mengirim hasil ke Cloudflare hanya jika CALLBACK_URL dan CALLBACK_SECRET telah dikonfigurasi.
