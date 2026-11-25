import { authorized, json, validTikTokUrl } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  if (!env.GITHUB_ACTIONS_TOKEN || !env.TRANSCRIPTS) return json({ error: "API belum dikonfigurasi." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Body JSON tidak valid." }, 400); }
  const url = String(body.url || "").trim();
  if (!validTikTokUrl(url)) return json({ error: "Masukkan URL video TikTok HTTPS yang valid." }, 400);

  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const status = { id, status: "queued", url, createdAt, updatedAt: createdAt };
  await env.TRANSCRIPTS.put(`jobs/${id}/status.json`, JSON.stringify(status), {
    httpMetadata: { contentType: "application/json" }
  });

  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_OWNER || "harvey-moeid"}/${env.GITHUB_REPO || "tiktok-transcript-studio"}/actions/workflows/transcribe.yml/dispatches`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
      "accept": "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      "user-agent": "tiktok-transcript-studio"
    },
    body: JSON.stringify({ ref: env.GITHUB_REF || "main", inputs: { job_id: id, url } })
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    status.status = "failed";
    status.error = `Gagal memicu GitHub Actions (HTTP ${response.status}). ${detail}`;
    status.updatedAt = Date.now();
    await env.TRANSCRIPTS.put(`jobs/${id}/status.json`, JSON.stringify(status));
    return json({ error: status.error, jobId: id }, 502);
  }
  return json({ jobId: id, status: "queued" }, 202);
}
