import { build } from "esbuild";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(currentFile), "..");
const sourceDir = resolve(rootDir, "pages");
const outputDir = resolve(rootDir, "dist");

const fallbackConfigPath = resolve(sourceDir, "config.js");
const fallbackConfig = readFileSync(fallbackConfigPath, "utf8");
const fallbackValues = extractFallbackConfig(fallbackConfig);
const configuredApiBaseUrl = normalizeUrl(process.env.PAGES_API_BASE_URL);
const configuredAdminApiBaseUrl = normalizeUrl(process.env.PAGES_ADMIN_API_BASE_URL);
const configuredTurnstileSiteKey = normalizeText(process.env.PAGES_TURNSTILE_SITE_KEY);
const fallbackApiBaseUrl = normalizeUrl(fallbackValues.apiBaseUrl);
const fallbackAdminApiBaseUrl = normalizeUrl(fallbackValues.adminApiBaseUrl);
const fallbackTurnstileSiteKey = normalizeText(fallbackValues.turnstileSiteKey);
const apiBaseUrl = configuredApiBaseUrl || fallbackApiBaseUrl;
const adminApiBaseUrl = configuredAdminApiBaseUrl || fallbackAdminApiBaseUrl;
const turnstileSiteKey = configuredTurnstileSiteKey || fallbackTurnstileSiteKey;

if (!apiBaseUrl) {
  throw new Error(
    "PAGES_API_BASE_URL belum di-set dan pages/config.js tidak menyediakan fallback apiBaseUrl."
  );
}

const pageSourceArtifacts = new Set([
  "_headers",
  "index.html",
  "admin/index.html",
  "public.js",
  "public.css",
  "app.js",
  "styles.css",
  "config.js",
]);

rmSync(outputDir, { force: true, recursive: true });
mkdirSync(outputDir, { recursive: true });

copyStaticPagesFiles(sourceDir);

const jsAssets = await buildEntryGroup({
  entryPoints: {
    public: "pages/public.js",
    admin: "pages/app.js",
  },
});
const cssAssets = await buildEntryGroup({
  entryPoints: {
    public: "pages/public.css",
    admin: "pages/styles.css",
  },
});

const publicHtml = renderPublicHtml({
  cssHref: toOutputHref(resolve(outputDir, "index.html"), cssAssets.public),
  jsHref: toOutputHref(resolve(outputDir, "index.html"), jsAssets.public),
  apiBaseUrl,
  turnstileSiteKey,
});
const adminHtml = renderAdminHtml({
  cssHref: toOutputHref(resolve(outputDir, "admin/index.html"), cssAssets.admin),
  jsHref: toOutputHref(resolve(outputDir, "admin/index.html"), jsAssets.admin),
  adminApiBaseUrl,
});
const headersFile = renderHeaders({
  publicCsp: buildPublicCsp(apiBaseUrl),
  adminCsp: buildAdminCsp(adminApiBaseUrl),
});

mkdirSync(resolve(outputDir, "admin"), { recursive: true });
writeFileSync(resolve(outputDir, "index.html"), publicHtml, "utf8");
writeFileSync(resolve(outputDir, "admin/index.html"), adminHtml, "utf8");
writeFileSync(resolve(outputDir, "_headers"), headersFile, "utf8");

if (!configuredApiBaseUrl && fallbackApiBaseUrl) {
  console.log(`[build:pages] using fallback apiBaseUrl from pages/config.js: ${fallbackApiBaseUrl}`);
}
if (!configuredTurnstileSiteKey && fallbackTurnstileSiteKey) {
  console.log("[build:pages] using fallback turnstileSiteKey from pages/config.js");
} else if (!turnstileSiteKey) {
  console.warn("[build:pages] PAGES_TURNSTILE_SITE_KEY belum di-set; Turnstile publik akan nonaktif.");
}

console.log(`[build:pages] wrote ${resolve(outputDir, "index.html")}`);
console.log(`[build:pages] wrote ${resolve(outputDir, "admin/index.html")}`);
console.log(`[build:pages] wrote ${resolve(outputDir, "_headers")}`);
console.log("[build:pages] emitted hashed assets under dist/assets");

function copyStaticPagesFiles(currentDir) {
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const inputPath = resolve(currentDir, entry.name);
    const relativePath = relative(sourceDir, inputPath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      copyStaticPagesFiles(inputPath);
      continue;
    }
    if (pageSourceArtifacts.has(relativePath)) {
      continue;
    }
    const outputPath = resolve(outputDir, relativePath);
    mkdirSync(dirname(outputPath), { recursive: true });
    copyFileSync(inputPath, outputPath);
  }
}

async function buildEntryGroup({ entryPoints }) {
  const result = await build({
    absWorkingDir: rootDir,
    bundle: true,
    entryNames: "assets/[name].[hash]",
    entryPoints,
    legalComments: "none",
    logLevel: "silent",
    metafile: true,
    minify: true,
    outdir: outputDir,
    platform: "browser",
    sourcemap: false,
    target: ["es2020"],
    write: true,
  });
  return extractEntryOutputs(result.metafile.outputs);
}

function extractEntryOutputs(outputs) {
  const assets = {};
  for (const [outputPath, meta] of Object.entries(outputs)) {
    if (!meta.entryPoint) {
      continue;
    }
    const entryName = deriveEntryName(meta.entryPoint);
    if (!entryName) {
      continue;
    }
    assets[entryName] = resolve(outputPath);
  }
  return assets;
}

function deriveEntryName(entryPoint) {
  if (entryPoint.endsWith("pages/public.js") || entryPoint.endsWith("pages/public.css")) {
    return "public";
  }
  if (entryPoint.endsWith("pages/app.js") || entryPoint.endsWith("pages/styles.css")) {
    return "admin";
  }
  return "";
}

function renderPublicHtml({ cssHref, jsHref, apiBaseUrl, turnstileSiteKey }) {
  const template = readFileSync(resolve(sourceDir, "index.html"), "utf8");
  const inlineConfig = `<script id="portal-config" type="application/json">${serializeInlineConfig({
    apiBaseUrl,
    turnstileSiteKey,
  })}</script>`;
  return template
    .replace('<link rel="stylesheet" href="./public.css" />', `<link rel="stylesheet" href="${cssHref}" />`)
    .replace('<script src="./config.js"></script>', inlineConfig)
    .replace('<script src="./public.js" defer></script>', `<script src="${jsHref}" defer></script>`);
}

function renderAdminHtml({ cssHref, jsHref, adminApiBaseUrl }) {
  const template = readFileSync(resolve(sourceDir, "admin/index.html"), "utf8");
  const inlineConfig = `<script id="admin-config" type="application/json">${serializeInlineConfig({
    adminApiBaseUrl,
  })}</script>`;
  return template
    .replace('<link rel="stylesheet" href="../styles.css" />', `<link rel="stylesheet" href="${cssHref}" />`)
    .replace("</head>", `    ${inlineConfig}\n  </head>`)
    .replace('<script src="../app.js"></script>', `<script src="${jsHref}"></script>`);
}

function renderHeaders({ publicCsp, adminCsp }) {
  const template = readFileSync(resolve(sourceDir, "_headers"), "utf8");
  return template
    .replaceAll("__PUBLIC_CSP__", publicCsp)
    .replaceAll("__ADMIN_CSP__", adminCsp);
}

function toOutputHref(htmlPath, assetPath) {
  const relativeHref = relative(dirname(htmlPath), assetPath).replace(/\\/g, "/");
  if (!relativeHref.startsWith(".")) {
    return `./${relativeHref}`;
  }
  return relativeHref;
}

function serializeInlineConfig(config) {
  return JSON.stringify(config)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function buildPublicCsp(apiBaseUrl) {
  const connectSources = ["'self'"];
  if (apiBaseUrl) {
    connectSources.push(apiBaseUrl);
  }
  connectSources.push("https://challenges.cloudflare.com");

  return [
    "default-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https://challenges.cloudflare.com",
    `connect-src ${connectSources.join(" ")}`,
    "frame-src https://challenges.cloudflare.com",
  ].join("; ");
}

function buildAdminCsp(adminApiBaseUrl) {
  const connectSources = ["'self'"];
  if (adminApiBaseUrl) {
    connectSources.push(adminApiBaseUrl);
  }
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
  ].join("; ");
}

function extractFallbackConfig(source) {
  return {
    apiBaseUrl: matchConfigValue(source, "apiBaseUrl"),
    adminApiBaseUrl: matchConfigValue(source, "adminApiBaseUrl"),
    turnstileSiteKey: matchConfigValue(source, "turnstileSiteKey"),
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

function normalizeText(value) {
  return String(value || "").trim();
}
