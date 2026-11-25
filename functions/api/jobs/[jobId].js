import { authorized, json, readJob } from "../../_lib.js";
export async function onRequestGet({ request, env, params }) {
  if (!await authorized(request, env)) return json({ error: "Unauthorized" }, 401);
  const id = String(params.jobId || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Job ID tidak valid." }, 400);
  const status = await readJob(env, id);
  if (!status) return json({ error: "Job tidak ditemukan atau sudah kedaluwarsa." }, 404);
  const resultObject = status.status === "completed" ? await env.TRANSCRIPTS.get(`jobs/${id}/result.json`) : null;
  return json({ ...status, result: resultObject ? await resultObject.json() : null });
}