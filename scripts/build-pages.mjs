import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(currentFile), "..");
const sourceDir = resolve(rootDir, "pages");
const outputDir = resolve(rootDir, "dist");

const fallbackConfigPath = resolve(sourceDir, "config.js");
const fallbackConfig = readFileSync(fallbackConfigPath, "utf8");
const fallbackValues = extractFallbackConfig(fallbackConfig);
const configuredApiBaseUrl = normalizeUrl(process.env.PAGES_API_BASE_URL);
const fallbackApiBaseUrl = normalizeUrl(fallbackValues.apiBaseUrl);
const apiBaseUrl = configuredApiBaseUrl || fallbackApiBaseUrl;

rmSync(outputDir, { force: true, recursive: true });
mkdirSync(outputDir, { recursive: true });
cpSync(sourceDir, outputDir, { recursive: true });

const generatedConfig = `window.AUTOSCRIPT_PORTAL_CONFIG = ${JSON.stringify(
  {
    apiBaseUrl,
  },
  null,
  2
)};\n`;

writeFileSync(resolve(outputDir, "config.js"), generatedConfig, "utf8");

if (!configuredApiBaseUrl && fallbackApiBaseUrl) {
  console.log(`[build:pages] using fallback apiBaseUrl from pages/config.js: ${fallbackApiBaseUrl}`);
} else if (!apiBaseUrl) {
  console.warn("[build:pages] PAGES_API_BASE_URL belum di-set; dist/config.js tetap kosong.");
}

console.log(`[build:pages] wrote ${resolve(outputDir, "config.js")}`);

function extractFallbackConfig(source) {
  return {
    apiBaseUrl: matchConfigValue(source, "apiBaseUrl"),
  };
}

function matchConfigValue(source, key) {
  const matcher = new RegExp(`${key}:\\s*["']([^"']*)["']`);
  const match = source.match(matcher);
  return match ? match[1].trim() : "";
}

function normalizeUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) {
    return "";
  }
  try {
    return new URL(raw).origin;
  } catch (_error) {
    return raw;
  }
}
