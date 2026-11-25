import test from "node:test";
import assert from "node:assert/strict";
import { validTikTokUrl } from "../functions/_lib.js";
test("accepts canonical public TikTok video URLs", () => {
  assert.equal(validTikTokUrl("https://www.tiktok.com/@creator/video/123456789"), true);
});
test("rejects short links, other hosts and non-HTTPS URLs", () => {
  for (const url of [
    "https://vm.tiktok.com/abc/",
    "https://tiktok.com/@creator/video/123",
    "http://www.tiktok.com/@creator/video/123",
    "https://example.com/@creator/video/123",
    "https://127.0.0.1/@creator/video/123",
    "https://www.tiktok.com.evil.example/@creator/video/123",
    "https://user:pass@www.tiktok.com/@creator/video/123",
    "https://www.tiktok.com:8443/@creator/video/123",
    "https://www.tiktok.com/@creator/video/abc"
  ]) assert.equal(validTikTokUrl(url), false, url);
});
