import { readFile } from "node:fs/promises";
const jobId = process.env.JOB_ID || crypto.randomUUID();
const base = process.env.CALLBACK_URL;
const secret = process.env.CALLBACK_SECRET;
if (!base || !secret) {
  console.error("CALLBACK_URL/CALLBACK_SECRET belum dikonfigurasi; hasil tidak dapat dikirim.");
  process.exit(1);
}
let body;
try {
  const result = JSON.parse(await readFile("/tmp/transcript.json", "utf8"));
  body = { jobId, status: "completed", result };
} catch {
  body = { jobId, status: "failed", error: "Runner gagal atau tidak menghasilkan transkrip." };
}
const response = await fetch(new URL("/api/internal/callback", base), {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
  body: JSON.stringify(body)
});
if (!response.ok) {
  console.error("Callback gagal:", response.status, (await response.text()).slice(0, 300));
  process.exit(1);
}
console.log("Status job berhasil dikirim ke API.");
