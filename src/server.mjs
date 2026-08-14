import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { loadCatalog } from "./catalog.mjs";

let catalog = await loadCatalog();
let voiceById = new Map(catalog.voices.map((voice) => [voice.id, voice]));
let nextCatalogRefreshAt = 0;
const fishTtsModel = process.env.FISH_TTS_MODEL || "s2.1-pro-free";
const unauthorizedSpeech = "我是狗，偷接口，偷完接口，当小丑。";

async function refreshCatalogIfDue() {
  const now = Date.now();
  if (now < nextCatalogRefreshAt) return;
  nextCatalogRefreshAt = now + Math.max(10, Number(process.env.CATALOG_REFRESH_SECONDS) || 300) * 1000;
  try {
    const next = await loadCatalog();
    catalog = next;
    voiceById = new Map(next.voices.map((voice) => [voice.id, voice]));
  } catch (error) {
    console.warn(`voice catalog refresh skipped: ${error.message}`);
  }
}

export function currentFishTtsModel() {
  return fishTtsModel;
}

export function resolveFishTtsModel(model) {
  return String(model || "").trim() || currentFishTtsModel();
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
    "access-control-allow-headers": "authorization, content-type, model, x-wcr-wxid, x-wcr-voice-token",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  });
  res.end(data);
}

function tokenMatches(value, expected) {
  const a = Buffer.from(value || "");
  const b = Buffer.from(expected || "");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function suppliedToken(req) {
  return (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

function passthroughAuthEnabled() {
  return process.env.UPSTREAM_AUTH_MODE === "passthrough";
}

export function voiceAuthorized(req, now = Math.floor(Date.now() / 1000)) {
  const secret = process.env.VOICE_GATEWAY_AUTH_SECRET || "";
  const wxid = String(req.headers["x-wcr-wxid"] || "").trim();
  const token = String(req.headers["x-wcr-voice-token"] || "").trim();
  const match = token.match(/^(\d{10})\.([a-f0-9]{64})$/i);
  if (!secret || !/^wxid_[a-z0-9_-]{6,100}$/i.test(wxid) || !match) return false;
  const expires = Number(match[1]);
  if (expires < now || expires > now + 3600) return false;
  const expected = createHmac("sha256", secret).update(`${wxid}|${expires}`).digest("hex");
  return tokenMatches(match[2].toLowerCase(), expected);
}

export function resolvedSpeechText(text, allowed) {
  return allowed ? text : unauthorizedSpeech;
}

export function authorized(req) {
  const supplied = suppliedToken(req);
  if (passthroughAuthEnabled()) return supplied.length > 0;
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

export function upstreamToken(req) {
  return passthroughAuthEnabled() ? suppliedToken(req) : (process.env.FISH_API_KEY || "");
}

async function fish(req, path, init = {}) {
  const key = upstreamToken(req);
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
  await refreshCatalogIfDue();
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, catalogVersion: catalog.version, voices: catalog.voices.length });
  if (req.method === "GET" && url.pathname === "/v1/audio/voice/catalog") return json(res, 200, filterCatalog(url));
  if (!authorized(req)) return json(res, 401, { error: "invalid gateway token" });
  const voiceAllowed = !passthroughAuthEnabled() || voiceAuthorized(req);
  const speechRequest = req.method === "POST" && (url.pathname === "/v1/tts" || url.pathname === "/v1/audio/speech");
  if (!voiceAllowed && !speechRequest) return json(res, 403, { error: "voice clone access denied" });

  if (req.method === "GET" && url.pathname === "/v1/audio/voice/list") {
    return forward(res, await fish(req, "/model?self=true&type=tts"));
  }

  if (req.method === "GET" && url.pathname === "/model") {
    return forward(res, await fish(req, `/model${url.search}`));
  }

  if (req.method === "POST" && url.pathname === "/v1/tts") {
    const input = JSON.parse((await requestBody(req, 1024 * 1024)).toString("utf8"));
    input.text = resolvedSpeechText(input.text, voiceAllowed);
    return forward(res, await fish(req, "/v1/tts", {
      method: "POST",
      headers: {
        "content-type": req.headers["content-type"] || "application/json",
        model: resolveFishTtsModel(req.headers.model),
      },
      body: JSON.stringify(input),
    }));
  }

  if (req.method === "POST" && url.pathname === "/model") {
    return forward(res, await fish(req, "/model", {
      method: "POST",
      headers: { "content-type": req.headers["content-type"] || "application/octet-stream" },
      body: await requestBody(req),
    }));
  }

  if (req.method === "POST" && url.pathname === "/v1/audio/speech") {
    const input = JSON.parse((await requestBody(req, 1024 * 1024)).toString("utf8"));
    const voice = voiceById.get(input.voice);
    const provider = voice?.provider || "fish";
    if (provider !== "fish") return json(res, 501, { error: `${provider} speech adapter is not enabled` });
    const referenceId = voice?.providerVoiceId || String(input.voice || "").replace(/^fish:/, "");
    if (!input.input || !referenceId) return json(res, 400, { error: "input and voice are required" });
    const payload = {
      text: resolvedSpeechText(input.input, voiceAllowed),
      reference_id: referenceId,
      format: input.response_format || "wav",
      normalize: true,
      latency: "normal",
      prosody: { speed: Number(input.speed) || 1 },
    };
    return forward(res, await fish(req, "/v1/tts", {
      method: "POST",
      headers: { "content-type": "application/json", model: resolveFishTtsModel(input.model) },
      body: JSON.stringify(payload),
    }));
  }

  if (req.method === "POST" && url.pathname === "/v1/audio/voice-clone") {
    return forward(res, await fish(req, "/model", {
      method: "POST",
      headers: { "content-type": req.headers["content-type"] || "application/octet-stream" },
      body: await requestBody(req),
    }));
  }

  const match = url.pathname.match(/^\/v1\/audio\/voice\/([^/]+)$/);
  if (req.method === "DELETE" && match) {
    return forward(res, await fish(req, `/model/${encodeURIComponent(match[1])}`, { method: "DELETE" }));
  }

  const nativeModel = url.pathname.match(/^\/model\/([^/]+)$/);
  if (req.method === "DELETE" && nativeModel) {
    return forward(res, await fish(req, `/model/${encodeURIComponent(nativeModel[1])}`, { method: "DELETE" }));
  }

  return json(res, 404, { error: "not found" });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = Number(process.env.PORT) || 8787;
  createServer((req, res) => handler(req, res).catch((error) => json(res, 500, { error: error.message }))).listen(port, "0.0.0.0");
  console.log(`WCRefine VoiceGateway listening on ${port}`);
}
