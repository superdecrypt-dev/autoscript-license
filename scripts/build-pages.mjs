import { build } from "esbuild";
import { execSync } from "node:child_process";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
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
  throw new Error("PAGES_API_BASE_URL belum di-set dan pages/config.js tidak menyediakan fallback apiBaseUrl.");
}

const pageSourceArtifacts = new Set([
  "_headers",
  "config.js",
]);

rmSync(outputDir, { force: true, recursive: true });
mkdirSync(outputDir, { recursive: true });

copyStaticPagesFiles(sourceDir);

const jsAssets = await buildEntryGroup({
  entryPoints: {
    public: "src/public/main.jsx",
    admin: "src/admin/main.jsx",
  },
});

const cssAssets = {
  public: await buildCssAsset("src/styles/public.css", "public"),
  admin: await buildCssAsset("src/styles/admin.css", "admin"),
};

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
if (!configuredAdminApiBaseUrl && fallbackAdminApiBaseUrl) {
  console.log(`[build:pages] using fallback adminApiBaseUrl from pages/config.js: ${fallbackAdminApiBaseUrl}`);
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
  const entryPointsArgs = Object.entries(entryPoints).map(([name, path]) => `${path}`).join(" ");
  const command = `npx esbuild ${entryPointsArgs} --bundle --minify --platform=browser --target=es2020 --outdir=${outputDir} --entry-names=assets/[name].[hash] --metafile=${resolve(outputDir, "meta.json")} --jsx=automatic --legal-comments=none`;

  try {
    execSync(command, { stdio: 'inherit', cwd: rootDir });
    const metafile = JSON.parse(readFileSync(resolve(outputDir, "meta.json"), "utf8"));
    return extractEntryOutputs(metafile.outputs);
  } catch (error) {
    console.error("[build:pages] esbuild CLI failed:", error.message);
    throw error;
  }
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
  if (entryPoint.endsWith("src/public/main.jsx")) {
    return "public";
  }
  if (entryPoint.endsWith("src/admin/main.jsx")) {
    return "admin";
  }
  return "";
}

async function buildCssAsset(relativePath, name) {
  const inputPath = resolve(rootDir, relativePath);
  const source = readFileSync(inputPath, "utf8");
  const result = await postcss([tailwind(), autoprefixer]).process(source, {
    from: inputPath,
  });
  const hash = createHash("sha256").update(result.css).digest("hex").slice(0, 8);
  const outputPath = resolve(outputDir, `assets/${name}.${hash}.css`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, result.css, "utf8");
  return outputPath;
}

function renderPublicHtml({ cssHref, jsHref, apiBaseUrl, turnstileSiteKey }) {
  const inlineConfig = `<script id="portal-config" type="application/json">${serializeInlineConfig({
    apiBaseUrl,
    turnstileSiteKey,
  })}</script>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Autoscript IP Access</title>
    <script>
      (function() {
        try {
          // Force dark mode always
          document.documentElement.classList.add('dark');
          localStorage.setItem('theme', 'dark');
        } catch (e) {}
      })();
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${cssHref}" />
    ${inlineConfig}
  </head>
  <body>
    <div id="root"></div>
    <script src="${jsHref}" defer></script>
  </body>
</html>`;
}

function renderAdminHtml({ cssHref, jsHref, adminApiBaseUrl }) {
  const inlineConfig = `<script id="admin-config" type="application/json">${serializeInlineConfig({
    adminApiBaseUrl,
  })}</script>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Autoscript License Admin</title>
    <script>
      (function() {
        try {
          // Force dark mode always
          document.documentElement.classList.add('dark');
          localStorage.setItem('theme', 'dark');
        } catch (e) {}
      })();
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${cssHref}" />
    ${inlineConfig}
  </head>
  <body>
    <div id="root"></div>
    <script src="${jsHref}" defer></script>
  </body>
</html>`;
}

function renderHeaders({ publicCsp, adminCsp }) {
  const template = readFileSync(resolve(sourceDir, "_headers"), "utf8");
  return template.replaceAll("__PUBLIC_CSP__", publicCsp).replaceAll("__ADMIN_CSP__", adminCsp);
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
  return match ? match[1] : "";
}

function normalizeUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) {
    return "";
  }
  try {
    return new URL(raw).origin;
  } catch (_error) {
    return "";
  }
}

function normalizeText(value) {
  return String(value || "").trim();
}
