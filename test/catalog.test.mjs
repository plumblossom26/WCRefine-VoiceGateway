import test from "node:test";
import assert from "node:assert/strict";
import { currentFishTtsModel, filterCatalog, refreshFishTtsModel } from "../src/server.mjs";

test("catalog filters without contacting the catalog host", () => {
  const result = filterCatalog(new URL("http://localhost/v1/audio/voice/catalog?contentType=anime&q=日漫"));
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, "acgn:test-anime");
});

test("Fish model auto-update accepts free models only", async () => {
  await refreshFishTtsModel(async () => ({ ok: true, json: async () => ({ fish: { freeTtsModel: "s3-free" } }) }));
  assert.equal(currentFishTtsModel(), "s3-free");
  await assert.rejects(
    refreshFishTtsModel(async () => ({ ok: true, json: async () => ({ fish: { freeTtsModel: "s3-pro" } }) })),
    /invalid free Fish model/
  );
  assert.equal(currentFishTtsModel(), "s3-free");
});
