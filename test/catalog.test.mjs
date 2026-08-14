import test from "node:test";
import assert from "node:assert/strict";
import { currentFishTtsModel, filterCatalog } from "../src/server.mjs";

test("catalog filters without contacting the catalog host", () => {
  const result = filterCatalog(new URL("http://localhost/v1/audio/voice/catalog?contentType=anime&q=日漫"));
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, "acgn:test-anime");
});

test("Fish uses the fixed free model by default", () => {
  assert.equal(currentFishTtsModel(), "s2.1-pro-free");
});
