import { json } from "../../_lib.js";
export async function onRequestPost({ request, env }) {
  if (!env.CALLBACK_SECRET || request.headers.get("authorization") !== "Bearer " + env.CALLBACK_SECRET) return json({ error: "Unauthorized" }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const id = String(body.jobId || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid job ID" }, 400);
  const key = "jobs/" + id + "/status.json";
  const existing = await env.TRANSCRIPTS.get(key);
  const status = existing ? await existing.json() : { id, status: "queued", url: String(body.url || "").slice(0, 2048), createdAt: Date.now() };
  if (body.status === "completed" && body.result && typeof body.result === "object") {
    const resultText = JSON.stringify(body.result);
    if (resultText.length > 5000000) return json({ error: "Result too large" }, 413);
    await env.TRANSCRIPTS.put("jobs/" + id + "/result.json", resultText, { httpMetadata: { contentType: "application/json" } });
    status.status = "completed";
  } else {
    status.status = "failed";
    status.error = String(body.error || "Transkripsi gagal.").slice(0, 1000);
  }
  status.updatedAt = Date.now();
  await env.TRANSCRIPTS.put(key, JSON.stringify(status), { httpMetadata: { contentType: "application/json" } });
  return json({ ok: true });
}
