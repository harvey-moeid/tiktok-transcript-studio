import { clearSessionCookie, json, sameOrigin } from "../../_lib.js";
export async function onRequestPost({ request }) {
  if (!sameOrigin(request)) return json({ error: "Origin tidak diizinkan." }, 403);
  return json({ authenticated: false }, 200, { "set-cookie": clearSessionCookie() });
}