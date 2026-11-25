export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SESSION_SECONDS = 12 * 60 * 60;
const COOKIE = "__Host-tts_session";
export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
});
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const fromB64url = (value) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}
async function equalSecret(a, b) {
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", new TextEncoder().encode(a)), crypto.subtle.digest("SHA-256", new TextEncoder().encode(b))]);
  const aa = new Uint8Array(x), bb = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
function cookieValue(request) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
  }
  return "";
}
export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
export async function createSession(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET harus berisi minimal 32 karakter.");
  const payload = `${Date.now() + SESSION_SECONDS * 1000}.${b64url(crypto.getRandomValues(new Uint8Array(24)))}`;
  const signature = b64url(await hmac(env.SESSION_SECRET, payload));
  return `${COOKIE}=${payload}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
}
export async function authorized(request, env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return false;
  const token = cookieValue(request);
  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0])) return false;
  if (Number(parts[0]) <= Date.now()) return false;
  try {
    const payload = parts[0] + "." + parts[1];
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("HMAC", key, fromB64url(parts[2]), new TextEncoder().encode(payload));
  } catch { return false; }
}
export async function verifyPassword(password, env) {
  return Boolean(env.APP_PASSWORD) && await equalSecret(String(password), String(env.APP_PASSWORD));
}
export const clearSessionCookie = () => `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
export function validTikTokUrl(input) {
  let url;
  try { url = new URL(input); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hostname.toLowerCase() !== "www.tiktok.com") return false;
  return /^\/@[\w.-]+\/video\/\d+\/?$/.test(url.pathname);
}
export async function readJob(env, id) {
  const object = await env.TRANSCRIPTS.get("jobs/" + id + "/status.json");
  if (!object) return null;
  const value = await object.json();
  if (Date.now() - value.createdAt > MAX_AGE_MS) {
    await env.TRANSCRIPTS.delete(["jobs/" + id + "/status.json", "jobs/" + id + "/result.json"]);
    return null;
  }
  return value;
}