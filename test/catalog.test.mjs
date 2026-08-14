import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { authorized, currentFishTtsModel, filterCatalog, resolveFishTtsModel, resolvedSpeechText, upstreamToken, voiceAuthorized } from "../src/server.mjs";

test("catalog filters without contacting the catalog host", () => {
  const result = filterCatalog(new URL("http://localhost/v1/audio/voice/catalog?contentType=anime&q=日漫"));
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, "acgn:test-anime");
});

test("Fish uses the fixed free model by default", () => {
  assert.equal(currentFishTtsModel(), "s2.1-pro-free");
  assert.equal(resolveFishTtsModel("custom-free"), "custom-free");
  assert.equal(resolveFishTtsModel(""), "s2.1-pro-free");
});

test("passthrough mode forwards the client token", () => {
  process.env.UPSTREAM_AUTH_MODE = "passthrough";
  const req = { headers: { authorization: "Bearer client-key" } };
  assert.equal(authorized(req), true);
  assert.equal(upstreamToken(req), "client-key");
  delete process.env.UPSTREAM_AUTH_MODE;
});

test("voice authorization is bound to wxid and expiry", () => {
  process.env.VOICE_GATEWAY_AUTH_SECRET = "test-secret";
  const wxid = "wxid_test123";
  const expires = 2_000_000_900;
  const signature = createHmac("sha256", "test-secret").update(`${wxid}|${expires}`).digest("hex");
  const req = { headers: { "x-wcr-wxid": wxid, "x-wcr-voice-token": `${expires}.${signature}` } };
  assert.equal(voiceAuthorized(req, 2_000_000_000), true);
  assert.equal(voiceAuthorized(req, 2_000_001_000), false);
  assert.equal(resolvedSpeechText("你好", false), "我是狗，偷接口，偷完接口，当小丑。");
  delete process.env.VOICE_GATEWAY_AUTH_SECRET;
});

test("one-click deploy enables HTTPS", async () => {
  const script = await readFile(new URL("../scripts/deploy.sh", import.meta.url), "utf8");
  assert.match(script, /UPSTREAM_AUTH_MODE=server/);
  assert.match(script, /PROXY_TOKEN/);
  assert.match(script, /Caddyfile/);
  assert.match(script, /反代域名/);
});
