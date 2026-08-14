import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { authorized, currentFishTtsModel, filterCatalog, resolveFishTtsModel, upstreamToken } from "../src/server.mjs";

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

test("one-click deploy enables pass-through HTTPS", async () => {
  const script = await readFile(new URL("../scripts/deploy.sh", import.meta.url), "utf8");
  assert.match(script, /UPSTREAM_AUTH_MODE=passthrough/);
  assert.match(script, /Caddyfile/);
  assert.match(script, /反代域名/);
});
