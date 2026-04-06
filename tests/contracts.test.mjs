import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");

async function bundleModule(entryPoint, outfileName) {
  const outdir = mkdtempSync(join(tmpdir(), "autoscript-license-test-"));
  const outfile = join(outdir, outfileName);
  execFileSync(
    "npx",
    [
      "-y",
      "esbuild",
      entryPoint,
      "--bundle",
      "--format=esm",
      `--outfile=${outfile}`,
      "--platform=browser",
      "--target=es2020",
    ],
    {
      cwd: repoRoot,
      stdio: "pipe",
    }
  );
  return {
    module: await import(pathToFileURL(outfile).href),
    cleanup() {
      rmSync(outdir, { force: true, recursive: true });
    },
  };
}

function createD1Stub({ entriesByIp = new Map() } = {}) {
  return {
    prepare(sql) {
      return {
        bind(...binds) {
          return {
            async first() {
              if (sql.includes("FROM license_entries") && sql.includes("WHERE ip = ?")) {
                return entriesByIp.get(String(binds[0] || "")) || null;
              }
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

test("worker /api/v1/license/check memakai source IP request dan mengembalikan public_ip final", async () => {
  const bundled = await bundleModule("worker/src/index.js", "worker.mjs");
  try {
    const worker = bundled.module.default;
    const env = {
      CACHE_TTL_SEC_DEFAULT: "3600",
      LICENSE_DB: createD1Stub({
        entriesByIp: new Map([
          [
            "198.51.100.10",
            {
              id: "entry-1",
              ip: "198.51.100.10",
              label: "primary",
              status: "active",
              expires_at: "2099-01-01T00:00:00.000Z",
            },
          ],
        ]),
      }),
    };
    const request = new Request("https://license.example/api/v1/license/check", {
      method: "POST",
      headers: {
        "CF-Connecting-IP": "198.51.100.10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        public_ipv4: "203.0.113.25",
        stage: "runtime",
        product: "autoscript",
        hostname: "vps-1",
      }),
    });

    const response = await worker.fetch(request, env);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.allowed, true);
    assert.equal(payload.public_ip, "198.51.100.10");
  } finally {
    bundled.cleanup();
  }
});

test("worker admin API gagal tertutup bila ADMIN_PROXY_SHARED_SECRET belum diisi", async () => {
  const bundled = await bundleModule("worker/src/index.js", "worker-admin.mjs");
  try {
    const worker = bundled.module.default;
    const env = {
      LICENSE_DB: createD1Stub(),
    };
    const request = new Request("https://license.example/api/admin/session", {
      method: "GET",
      headers: {
        "X-Admin-Actor-Email": "admin@example.com",
        "X-Admin-Proxy-Secret": "anything",
      },
    });

    const response = await worker.fetch(request, env);
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.error, "misconfigured");
  } finally {
    bundled.cleanup();
  }
});

test("Pages admin proxy gagal tertutup bila PAGES_API_BASE_URL tidak diisi", async () => {
  const bundled = await bundleModule("functions/api/admin/[[path]].js", "pages-admin.mjs");
  try {
    const response = await bundled.module.onRequest({
      request: new Request("https://pages.example/api/admin/session", {
        headers: {
          "CF-Access-Authenticated-User-Email": "admin@example.com",
        },
      }),
      env: {
        ADMIN_PROXY_SHARED_SECRET: "secret-1",
      },
    });
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.equal(payload.error, "misconfigured");
  } finally {
    bundled.cleanup();
  }
});

test("Pages admin proxy meneruskan request ke upstream yang dikonfigurasi", async () => {
  const bundled = await bundleModule("functions/api/admin/[[path]].js", "pages-admin-forward.mjs");
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://worker.example/api/admin/session?limit=5");
      assert.equal(init.method, "GET");
      assert.equal(init.headers.get("X-Admin-Actor-Email"), "admin@example.com");
      assert.equal(init.headers.get("X-Admin-Proxy-Secret"), "secret-2");
      assert.equal(init.headers.get("X-Admin-Request-Ip"), "198.51.100.77");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    };

    const response = await bundled.module.onRequest({
      request: new Request("https://pages.example/api/admin/session?limit=5", {
        headers: {
          "CF-Access-Authenticated-User-Email": "admin@example.com",
          "CF-Connecting-IP": "198.51.100.77",
          Origin: "https://admin.example",
        },
      }),
      env: {
        ADMIN_PROXY_SHARED_SECRET: "secret-2",
        PAGES_API_BASE_URL: "https://worker.example",
        PAGES_ADMIN_APP_ORIGINS: "https://admin.example",
      },
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://admin.example");
    assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true");
  } finally {
    globalThis.fetch = originalFetch;
    bundled.cleanup();
  }
});

test("Pages admin proxy menjawab preflight CORS untuk origin yang diizinkan", async () => {
  const bundled = await bundleModule("functions/api/admin/[[path]].js", "pages-admin-cors.mjs");
  try {
    const response = await bundled.module.onRequest({
      request: new Request("https://pages.example/api/admin/session", {
        method: "OPTIONS",
        headers: {
          Origin: "https://autoscript.license.dpdns.org",
        },
      }),
      env: {
        PAGES_ADMIN_APP_ORIGINS: "https://autoscript.license.dpdns.org",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://autoscript.license.dpdns.org");
    assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true");
    assert.match(String(response.headers.get("Access-Control-Allow-Methods") || ""), /PATCH/);
  } finally {
    bundled.cleanup();
  }
});

test("Pages admin proxy mendukung method override untuk simple cross-origin POST", async () => {
  const bundled = await bundleModule("functions/api/admin/[[path]].js", "pages-admin-method-override.mjs");
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://worker.example/api/admin/license-entries/entry-1");
      assert.equal(init.method, "PATCH");
      assert.equal(init.headers.get("X-Admin-Actor-Email"), "admin@example.com");
      assert.equal(init.headers.get("Content-Type"), "text/plain;charset=UTF-8");
      assert.equal(init.body, "{\"status\":\"revoked\"}");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    };

    const response = await bundled.module.onRequest({
      request: new Request("https://pages.example/api/admin/license-entries/entry-1?__proxy_method=PATCH", {
        method: "POST",
        headers: {
          "CF-Access-Authenticated-User-Email": "admin@example.com",
          Origin: "https://autoscript.license.dpdns.org",
          "Content-Type": "text/plain;charset=UTF-8",
        },
        body: "{\"status\":\"revoked\"}",
      }),
      env: {
        ADMIN_PROXY_SHARED_SECRET: "secret-4",
        PAGES_API_BASE_URL: "https://worker.example",
        PAGES_ADMIN_APP_ORIGINS: "https://autoscript.license.dpdns.org",
      },
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://autoscript.license.dpdns.org");
  } finally {
    globalThis.fetch = originalFetch;
    bundled.cleanup();
  }
});

test("Pages admin proxy mengembalikan 502 JSON saat upstream fetch gagal", async () => {
  const bundled = await bundleModule("functions/api/admin/[[path]].js", "pages-admin-upstream-error.mjs");
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes("/cdn-cgi/access/get-identity")) {
        return new Response(JSON.stringify({ email: "admin@example.com" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        });
      }
      throw new Error("connect failed");
    };

    const response = await bundled.module.onRequest({
      request: new Request("https://pages.example/api/admin/session", {
        headers: {
          Cookie: "CF_Authorization=session",
        },
      }),
      env: {
        ADMIN_PROXY_SHARED_SECRET: "secret-3",
        PAGES_API_BASE_URL: "https://worker.example",
      },
    });
    const payload = await response.json();

    assert.equal(response.status, 502);
    assert.equal(payload.error, "upstream_unavailable");
  } finally {
    globalThis.fetch = originalFetch;
    bundled.cleanup();
  }
});
