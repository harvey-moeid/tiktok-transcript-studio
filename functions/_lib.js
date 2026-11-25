export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
export function authorized(request, env) {
  const token = request.headers.get("authorization") || "";
  return Boolean(env.APP_PASSWORD) && token === `Bearer ${env.APP_PASSWORD}`;
}
export function validTikTokUrl(input) {
  let url;
  try { url = new URL(input); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return ["tiktok.com","www.tiktok.com","m.tiktok.com","vm.tiktok.com","vt.tiktok.com"].includes(host)
    && (host === "vm.tiktok.com" || host === "vt.tiktok.com" || /^\/@[\w.-]+\/video\/\d+/.test(url.pathname) || url.pathname.startsWith("/t/"));
}
export async function readJob(env, id) {
  const object = await env.TRANSCRIPTS.get(`jobs/${id}/status.json`);
  if (!object) return null;
  const value = await object.json();
  if (Date.now() - value.createdAt > MAX_AGE_MS) {
    await env.TRANSCRIPTS.delete([`jobs/${id}/status.json`, `jobs/${id}/result.json`]);
    return null;
  }
  return value;
}
