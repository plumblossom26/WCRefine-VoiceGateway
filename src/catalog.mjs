import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const defaultURL = "https://raw.githubusercontent.com/plumblossom26/WCRefine-VoiceHub/main/catalog/voices.json";

function valid(catalog) {
  return catalog && Number.isInteger(catalog.version) && Array.isArray(catalog.voices);
}

async function readJSON(path) {
  const value = JSON.parse(await readFile(path, "utf8"));
  if (!valid(value)) throw new Error("invalid voice catalog");
  return value;
}

export async function loadCatalog() {
  if (process.env.CATALOG_PATH) return readJSON(process.env.CATALOG_PATH);
  const cachePath = process.env.CATALOG_CACHE_PATH || "/data/catalog.json";
  try {
    const response = await fetch(process.env.VOICE_CATALOG_URL || defaultURL);
    if (!response.ok) throw new Error(`catalog HTTP ${response.status}`);
    const value = await response.json();
    if (!valid(value)) throw new Error("invalid voice catalog");
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(value));
    return value;
  } catch (error) {
    try {
      return await readJSON(cachePath);
    } catch {
      throw error;
    }
  }
}

