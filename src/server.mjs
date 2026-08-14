import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { loadCatalog } from "./catalog.mjs";

const catalog = await loadCatalog();
const voiceById = new Map(catalog.voices.map((voice) => [voice.id, voice]));
const fishTtsModel = process.env.FISH_TTS_MODEL || "s2.1-pro-free";

export function currentFishTtsModel() {
  return fishTtsModel;
}

export function filterCatalog(url) {
  const q = (url.searchParams.get("q") || "").trim().toLocaleLowerCase();
  const contentType = url.searchParams.get("contentType") || "";
  const provider = url.searchParams.get("provider") || "";
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const filtered = catalog.voices.filter((voice) =>
    (!contentType || voice.contentType === contentType) &&
    (!provider || voice.provider === provider) &&
    (!q || `${voice.name} ${voice.providerVoiceId}`.toLocaleLowerCase().includes(q))
  );
  return { version: catalog.version, total: filtered.length, offset, limit, items: filtered.slice(offset, offset + limit) };
}

function json(res, status, value) {
  const data = Buffer.from(JSON.stringify(value));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": data.length,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  });
  res.end(data);
}

function tokenMatches(value, expected) {
  const a = Buffer.from(value || "");
  const b = Buffer.from(expected || "");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function authorized(req) {
  const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return tokenMatches(supplied, process.env.PROXY_TOKEN || "");
}

async function requestBody(req, maxBytes = 20 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function fish(path, init = {}) {
  const key = process.env.FISH_API_KEY || "";
  if (!key) throw new Error("FISH_API_KEY is not configured");
  const base = (process.env.FISH_BASE_URL || "https://api.fish.audio").replace(/\/$/, "");
  return fetch(`${base}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${key}`, ...(init.headers || {}) },
  });
}

async function forward(res, upstream) {
  const bytes = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(upstream.status, {
    "content-type": upstream.headers.get("content-type") || "application/octet-stream",
    "content-length": bytes.length,
  });
  res.end(bytes);
}

export async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, catalogVersion: catalog.version, voices: catalog.voices.length });
  if (req.method === "GET" && url.pathname === "/v1/audio/voice/catalog") return json(res, 200, filterCatalog(url));
  if (!authorized(req)) return json(res, 401, { error: "invalid gateway token" });

  if (req.method === "GET" && url.pathname === "/v1/audio/voice/list") {
    return forward(res, await fish("/model?self=true&type=tts"));
  }

  if (req.method === "POST" && url.pathname === "/v1/audio/speech") {
    const input = JSON.parse((await requestBody(req, 1024 * 1024)).toString("utf8"));
    const voice = voiceById.get(input.voice);
    const provider = voice?.provider || "fish";
    if (provider !== "fish") return json(res, 501, { error: `${provider} speech adapter is not enabled` });
    const referenceId = voice?.providerVoiceId || String(input.voice || "").replace(/^fish:/, "");
    if (!input.input || !referenceId) return json(res, 400, { error: "input and voice are required" });
    const payload = {
      text: input.input,
      reference_id: referenceId,
      format: input.response_format || "wav",
      normalize: true,
      latency: "normal",
      prosody: { speed: Number(input.speed) || 1 },
    };
    return forward(res, await fish("/v1/tts", {
      method: "POST",
      headers: { "content-type": "application/json", model: currentFishTtsModel() },
      body: JSON.stringify(payload),
    }));
  }

  if (req.method === "POST" && url.pathname === "/v1/audio/voice-clone") {
    return forward(res, await fish("/model", {
      method: "POST",
      headers: { "content-type": req.headers["content-type"] || "application/octet-stream" },
      body: await requestBody(req),
    }));
  }

  const match = url.pathname.match(/^\/v1\/audio\/voice\/([^/]+)$/);
  if (req.method === "DELETE" && match) {
    return forward(res, await fish(`/model/${encodeURIComponent(match[1])}`, { method: "DELETE" }));
  }

  return json(res, 404, { error: "not found" });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = Number(process.env.PORT) || 8787;
  createServer((req, res) => handler(req, res).catch((error) => json(res, 500, { error: error.message }))).listen(port, "0.0.0.0");
  console.log(`WCRefine VoiceGateway listening on ${port}`);
}
