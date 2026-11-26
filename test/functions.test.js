import test from "node:test";
import assert from "node:assert/strict";
import { authorized, createSession, isTikTokShortLink, resolveTikTokUrl, validTikTokUrl } from "../functions/_lib.js";
const env = { SESSION_SECRET: "test-secret-that-is-at-least-32-characters-long" };
const redirect = (location, status = 302) => new Response(null, { status, headers: location ? { location } : {} });
const fakeFetch = (routes, calls = []) => async (url, options) => {
  calls.push({ url, options });
  const next = routes[url];
  if (next === undefined) throw new Error(`unexpected request to ${url}`);
  return next instanceof Error ? Promise.reject(next) : next;
};
test("accepts canonical public TikTok video URLs", () => {
  assert.equal(validTikTokUrl("https://www.tiktok.com/@creator/video/123456789"), true);
});
test("rejects short links, other hosts and non-HTTPS URLs", () => {
  for (const url of ["https://vm.tiktok.com/abc/","https://tiktok.com/@creator/video/123","http://www.tiktok.com/@creator/video/123","https://example.com/@creator/video/123","https://127.0.0.1/@creator/video/123","https://www.tiktok.com.evil.example/@creator/video/123","https://user:pass@www.tiktok.com/@creator/video/123","https://www.tiktok.com:8443/@creator/video/123","https://www.tiktok.com/@creator/video/abc"]) assert.equal(validTikTokUrl(url), false, url);
});
test("recognises TikTok short links only on TikTok hosts", () => {
  for (const url of ["https://vm.tiktok.com/ZMabc123/", "https://vt.tiktok.com/ZSabc123", "https://www.tiktok.com/t/ZTabc123/", "https://tiktok.com/t/ZTabc123"]) assert.equal(isTikTokShortLink(url), true, url);
  for (const url of ["http://vm.tiktok.com/abc", "https://vm.tiktok.com.evil.example/abc", "https://evil.example/t/abc", "https://vm.tiktok.com/", "https://vm.tiktok.com:8443/abc", "https://user@vm.tiktok.com/abc", "https://www.tiktok.com/@creator/video/123", "https://m.tiktok.com/t/abc"]) assert.equal(isTikTokShortLink(url), false, url);
});
test("resolves a short link to the canonical video URL and drops tracking parameters", async () => {
  const calls = [];
  const fetchImpl = fakeFetch({ "https://vm.tiktok.com/ZMabc123/": redirect("https://www.tiktok.com/@creator/video/123456789?_r=1&u_code=x&share_app_id=1", 301) }, calls);
  assert.equal(await resolveTikTokUrl("https://vm.tiktok.com/ZMabc123/", { fetchImpl }), "https://www.tiktok.com/@creator/video/123456789");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.redirect, "manual");
});
test("follows several TikTok hops and relative redirects", async () => {
  const fetchImpl = fakeFetch({
    "https://vt.tiktok.com/ZSabc123/": redirect("/ZSdef456/"),
    "https://vt.tiktok.com/ZSdef456/": redirect("https://www.tiktok.com/t/ZTabc123/"),
    "https://www.tiktok.com/t/ZTabc123/": redirect("https://m.tiktok.com/@a.b/video/42")
  });
  assert.equal(await resolveTikTokUrl("https://vt.tiktok.com/ZSabc123/", { fetchImpl }), "https://www.tiktok.com/@a.b/video/42");
});
test("returns canonical URLs without any network request", async () => {
  const calls = [];
  const url = "https://www.tiktok.com/@creator/video/123456789";
  assert.equal(await resolveTikTokUrl(url, { fetchImpl: fakeFetch({}, calls) }), url);
  assert.equal(calls.length, 0);
});
test("never requests a host outside TikTok, even when a short link redirects there", async () => {
  for (const target of ["https://evil.example/@creator/video/1", "http://169.254.169.254/latest/meta-data/", "https://www.tiktok.com.evil.example/@creator/video/1", "https://user:pass@www.tiktok.com/@creator/video/1", "https://www.tiktok.com:8443/@creator/video/1", "javascript:alert(1)"]) {
    const calls = [];
    const fetchImpl = fakeFetch({ "https://vm.tiktok.com/abc/": redirect(target) }, calls);
    assert.equal(await resolveTikTokUrl("https://vm.tiktok.com/abc/", { fetchImpl }), null, target);
    assert.deepEqual(calls.map(c => c.url), ["https://vm.tiktok.com/abc/"], target);
  }
});
test("gives up on redirect loops, missing locations, non-redirects, photo posts and network errors", async () => {
  assert.equal(await resolveTikTokUrl("https://vm.tiktok.com/loop/", { fetchImpl: fakeFetch({ "https://vm.tiktok.com/loop/": redirect("https://vm.tiktok.com/loop/") }) }), null);
  assert.equal(await resolveTikTokUrl("https://vm.tiktok.com/none/", { fetchImpl: fakeFetch({ "https://vm.tiktok.com/none/": redirect(null) }) }), null);
  assert.equal(await resolveTikTokUrl("https://vm.tiktok.com/ok/", { fetchImpl: fakeFetch({ "https://vm.tiktok.com/ok/": new Response("hi", { status: 200 }) }) }), null);
  assert.equal(await resolveTikTokUrl("https://vm.tiktok.com/photo/", { fetchImpl: fakeFetch({ "https://vm.tiktok.com/photo/": redirect("https://www.tiktok.com/@creator/photo/1") }) }), null);
  assert.equal(await resolveTikTokUrl("https://vm.tiktok.com/down/", { fetchImpl: fakeFetch({ "https://vm.tiktok.com/down/": new Error("boom") }) }), null);
  assert.equal(await resolveTikTokUrl("https://example.com/abc", { fetchImpl: fakeFetch({}) }), null);
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
  const parts = cookie.split(";")[0].split(".");
  parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1); // first char carries all 6 bits, so this always changes the signature
  const token = parts.join(".");
  assert.equal(await authorized(new Request("https://example.pages.dev", { headers: { cookie: token } }), env), false);
});
