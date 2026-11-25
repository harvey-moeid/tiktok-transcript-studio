import { createSession, json, sameOrigin, verifyPassword } from "../../_lib.js";
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Origin tidak diizinkan." }, 403);
  if (!env.APP_PASSWORD || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return json({ error: "Autentikasi belum dikonfigurasi." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Body JSON tidak valid." }, 400); }
  if (!await verifyPassword(body.password, env)) return json({ error: "Password tidak sesuai." }, 401);
  try { return json({ authenticated: true }, 200, { "set-cookie": await createSession(env) }); }
  catch { return json({ error: "Gagal membuat sesi." }, 500); }
}