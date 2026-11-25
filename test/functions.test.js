import test from "node:test";
import assert from "node:assert/strict";
import { authorized, createSession, validTikTokUrl } from "../functions/_lib.js";
const env = { SESSION_SECRET: "test-secret-that-is-at-least-32-characters-long" };
test("accepts canonical public TikTok video URLs", () => {
  assert.equal(validTikTokUrl("https://www.tiktok.com/@creator/video/123456789"), true);
});
test("rejects short links, other hosts and non-HTTPS URLs", () => {
  for (const url of ["https://vm.tiktok.com/abc/","https://tiktok.com/@creator/video/123","http://www.tiktok.com/@creator/video/123","https://example.com/@creator/video/123","https://127.0.0.1/@creator/video/123","https://www.tiktok.com.evil.example/@creator/video/123","https://user:pass@www.tiktok.com/@creator/video/123","https://www.tiktok.com:8443/@creator/video/123","https://www.tiktok.com/@creator/video/abc"]) assert.equal(validTikTokUrl(url), false, url);
});
test("creates and validates an HttpOnly Secure SameSite Strict session cookie", async () => {
  const cookie = await createSession(env);
  assert.match(cookie, /^__Host-tts_session=/);
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/);
  const request = new Request("https://example.pages.dev/api/auth/session", { headers: { cookie: cookie.split(";")[0] } });
  assert.equal(await authorized(request, env), true);
});
test("rejects missing, malformed and tampered sessions", async () => {
  const request = new Request("https://example.pages.dev/api/auth/session");
  assert.equal(await authorized(request, env), false);
  const cookie = await createSession(env);
  const token = cookie.split(";")[0].replace(/.$/, "x");
  assert.equal(await authorized(new Request("https://example.pages.dev", { headers: { cookie: token } }), env), false);
});
