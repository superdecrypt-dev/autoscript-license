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

function createD1Stub({ entriesByIp = new Map(), tables = {} } = {}) {
  const state = {
    license_entries: Array.isArray(tables.license_entries) ? [...tables.license_entries] : [],
    audit_logs: Array.isArray(tables.audit_logs) ? [...tables.audit_logs] : [],
    public_rate_limits: Array.isArray(tables.public_rate_limits) ? [...tables.public_rate_limits] : [],
    public_target_rate_limits: Array.isArray(tables.public_target_rate_limits) ? [...tables.public_target_rate_limits] : [],
  };

  if (!state.license_entries.length && entriesByIp.size) {
    state.license_entries = Array.from(entriesByIp.values());
  }

  function executeStatement(sql, binds, mode) {
    const normalizedSql = String(sql || "").replace(/\s+/g, " ").trim();

    if (mode === "first") {
      if (normalizedSql.includes("FROM license_entries") && normalizedSql.includes("WHERE ip = ?")) {
        return state.license_entries.find((row) => row.ip === String(binds[0] || "")) || null;
      }
      if (normalizedSql.includes("FROM license_entries") && normalizedSql.includes("WHERE id = ?")) {
        return state.license_entries.find((row) => row.id === String(binds[0] || "")) || null;
      }
      return null;
    }

    if (mode === "all") {
      if (normalizedSql.includes("FROM license_entries")) {
        return { results: [...state.license_entries] };
      }
      if (normalizedSql.includes("FROM audit_logs")) {
        return { results: [...state.audit_logs] };
      }
      if (normalizedSql.includes("FROM public_rate_limits")) {
        return { results: [...state.public_rate_limits] };
      }
      if (normalizedSql.includes("FROM public_target_rate_limits")) {
        return { results: [...state.public_target_rate_limits] };
      }
      return { results: [] };
    }

    if (mode === "run") {
      const deleteMatch = normalizedSql.match(/^DELETE FROM ([a-z_]+)/i);
      if (deleteMatch) {
        const tableName = deleteMatch[1];
        const changes = Array.isArray(state[tableName]) ? state[tableName].length : 0;
        state[tableName] = [];
        return { meta: { changes } };
      }

      const insertMatch = normalizedSql.match(/^INSERT(?: OR IGNORE)? INTO ([a-z_]+) \((.+?)\) VALUES \((.+)\)$/i);
      if (insertMatch) {
        const tableName = insertMatch[1];
        const columns = insertMatch[2].split(",").map((item) => item.trim());
        const row = {};
        columns.forEach((column, index) => {
          row[column] = binds[index] ?? null;
        });
        if (!Array.isArray(state[tableName])) {
          state[tableName] = [];
        }
        state[tableName].push(row);
        return { meta: { changes: 1 } };
      }

      return { meta: { changes: 1 } };
    }

    return null;
  }

  return {
    _state: state,
    prepare(sql) {
      return {
        sql,
        bind(...binds) {
          return {
            sql,
            binds,
            async first() {
              return executeStatement(sql, binds, "first");
            },
            async all() {
              return executeStatement(sql, binds, "all");
            },
            async run() {
              return executeStatement(sql, binds, "run");
            },
          };
        },
      };
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => executeStatement(statement.sql, statement.binds || [], "run")));
    },
  };
}

function createR2BucketStub(initialObjects = {}) {
  const state = new Map();
  const now = new Date("2026-04-07T00:00:00.000Z");
  for (const [key, object] of Object.entries(initialObjects)) {
    state.set(key, {
      key,
      body: object.body || "",
      size: String(object.body || "").length,
      uploaded: object.uploaded || now,
      customMetadata: object.customMetadata || {},
      httpMetadata: object.httpMetadata || { contentType: "application/json; charset=utf-8" },
    });
  }

  return {
    _state: state,
    async put(key, body, options = {}) {
      state.set(key, {
        key,
        body: String(body || ""),
        size: String(body || "").length,
        uploaded: new Date(),
        customMetadata: options.customMetadata || {},
        httpMetadata: options.httpMetadata || { contentType: "application/json; charset=utf-8" },
      });
    },
    async get(key) {
      const object = state.get(key);
      if (!object) {
        return null;
      }
      return {
        key: object.key,
        size: object.size,
        uploaded: object.uploaded,
        customMetadata: object.customMetadata,
        httpMetadata: object.httpMetadata,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(object.body));
            controller.close();
          },
        }),
        async text() {
          return object.body;
        },
      };
    },
    async delete(key) {
      state.delete(key);
    },
    async list({ prefix = "" } = {}) {
      return {
        objects: Array.from(state.values())
          .filter((object) => object.key.startsWith(prefix))
          .map((object) => ({
            key: object.key,
            size: object.size,
            uploaded: object.uploaded,
            customMetadata: object.customMetadata,
          })),
      };
    },
  };
}

function createAdminRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("X-Admin-Actor-Email")) {
    headers.set("X-Admin-Actor-Email", "admin@example.com");
  }
  if (!headers.has("X-Admin-Proxy-Secret")) {
    headers.set("X-Admin-Proxy-Secret", "secret-backup");
  }
  return new Request(`https://license.example${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body,
  });
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

test("worker admin API memakai fallback ADMIN_PROXY_SHARED_SECRET bila env belum diisi", async () => {
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

    assert.equal(response.status, 401);
    assert.equal(payload.error, "unauthorized");
  } finally {
    bundled.cleanup();
  }
});

test("Pages admin proxy memakai fallback upstream config bila env belum diisi", async () => {
  const bundled = await bundleModule("functions/api/admin/[[path]].js", "pages-admin.mjs");
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://autoscript-license.minidecrypt.workers.dev/api/admin/session");
      assert.equal(init.headers.get("X-Admin-Proxy-Secret"), "autoscript-license");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    };
    const response = await bundled.module.onRequest({
      request: new Request("https://pages.example/api/admin/session", {
        headers: {
          "CF-Access-Authenticated-User-Email": "admin@example.com",
        },
      }),
      env: {},
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
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

test("worker admin backup create/list/download/delete bekerja dengan R2", async () => {
  const bundled = await bundleModule("worker/src/index.js", "worker-backups.mjs");
  try {
    const worker = bundled.module.default;
    const env = {
      ADMIN_PROXY_SHARED_SECRET: "secret-backup",
      LICENSE_DB: createD1Stub({
        tables: {
          license_entries: [
            {
              id: "entry-1",
              ip: "198.51.100.10",
              label: "primary",
              owner: "alice",
              notes: "seed",
              status: "active",
              expires_at: "2099-01-01T00:00:00.000Z",
              created_at: "2026-04-01T00:00:00.000Z",
              updated_at: "2026-04-01T00:00:00.000Z",
              created_by: "admin@example.com",
              updated_by: "admin@example.com",
              revoked_at: null,
              entry_source: "admin",
              renewal_token_hash: "",
              last_renewed_at: null,
              created_request_ip: "198.51.100.1",
            },
          ],
          audit_logs: [
            {
              id: "audit-1",
              event_type: "admin_create",
              ip: "198.51.100.10",
              entry_id: "entry-1",
              stage: "admin",
              decision: "mutate",
              actor_email: "admin@example.com",
              request_ip: "198.51.100.1",
              user_agent: "test",
              payload_json: "{\"ok\":true}",
              created_at: "2026-04-01T00:00:00.000Z",
            },
          ],
          public_rate_limits: [
            {
              endpoint: "public_activate",
              client_ip: "198.51.100.1",
              window_slot: "2026-04-01T00:00:00.000Z",
              request_count: 2,
              updated_at: "2026-04-01T00:00:00.000Z",
            },
          ],
          public_target_rate_limits: [
            {
              endpoint: "public_activate",
              target_ip: "198.51.100.10",
              window_slot: "2026-04-01T00:00:00.000Z",
              request_count: 1,
              updated_at: "2026-04-01T00:00:00.000Z",
            },
          ],
        },
      }),
      LICENSE_BACKUPS: createR2BucketStub(),
    };

    const createResponse = await worker.fetch(
      createAdminRequest("/api/admin/backups", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      env
    );
    const createPayload = await createResponse.json();
    assert.equal(createResponse.status, 201);
    assert.ok(createPayload.item.key.startsWith("snapshots/"));
    assert.equal(env.LICENSE_BACKUPS._state.size, 1);

    const listResponse = await worker.fetch(createAdminRequest("/api/admin/backups"), env);
    const listPayload = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(listPayload.items.length, 1);
    assert.equal(listPayload.items[0].row_counts.license_entries, 1);

    const backupKey = encodeURIComponent(createPayload.item.key);
    const downloadResponse = await worker.fetch(
      createAdminRequest(`/api/admin/backups/${backupKey}/download`),
      env
    );
    const downloadPayload = JSON.parse(await downloadResponse.text());
    assert.equal(downloadResponse.status, 200);
    assert.equal(downloadPayload.format, "autoscript-license-backup");
    assert.equal(downloadPayload.tables.license_entries.length, 1);

    const deleteResponse = await worker.fetch(
      createAdminRequest(`/api/admin/backups/${backupKey}`, {
        method: "DELETE",
      }),
      env
    );
    const deletePayload = await deleteResponse.json();
    assert.equal(deleteResponse.status, 200);
    assert.equal(deletePayload.ok, true);
    assert.equal(env.LICENSE_BACKUPS._state.size, 0);
  } finally {
    bundled.cleanup();
  }
});

test("worker admin backup import replace-only mengganti isi tabel D1", async () => {
  const bundled = await bundleModule("worker/src/index.js", "worker-backup-import.mjs");
  try {
    const worker = bundled.module.default;
    const env = {
      ADMIN_PROXY_SHARED_SECRET: "secret-backup",
      LICENSE_DB: createD1Stub({
        tables: {
          license_entries: [
            {
              id: "legacy-entry",
              ip: "203.0.113.1",
              label: "legacy",
              owner: "",
              notes: "",
              status: "active",
              expires_at: "2026-04-15T00:00:00.000Z",
              created_at: "2026-04-01T00:00:00.000Z",
              updated_at: "2026-04-01T00:00:00.000Z",
              created_by: "legacy@example.com",
              updated_by: "legacy@example.com",
              revoked_at: null,
              entry_source: "admin",
              renewal_token_hash: "",
              last_renewed_at: null,
              created_request_ip: "203.0.113.1",
            },
          ],
        },
      }),
      LICENSE_BACKUPS: createR2BucketStub(),
    };

    const snapshot = {
      format: "autoscript-license-backup",
      schema_version: 1,
      created_at: "2026-04-07T10:00:00.000Z",
      created_by: "admin@example.com",
      source: "browser_import",
      row_counts: {
        license_entries: 1,
      },
      tables: {
        license_entries: [
          {
            id: "entry-new",
            ip: "198.51.100.20",
            label: "imported",
            owner: "bob",
            notes: "snapshot",
            status: "active",
            expires_at: "2026-05-01T00:00:00.000Z",
            created_at: "2026-04-07T10:00:00.000Z",
            updated_at: "2026-04-07T10:00:00.000Z",
            created_by: "admin@example.com",
            updated_by: "admin@example.com",
            revoked_at: null,
            entry_source: "admin",
            renewal_token_hash: "",
            last_renewed_at: null,
            created_request_ip: "198.51.100.20",
          },
        ],
      },
    };

    const importResponse = await worker.fetch(
      createAdminRequest("/api/admin/backups/import", {
        method: "POST",
        body: JSON.stringify(snapshot),
      }),
      env
    );
    const importPayload = await importResponse.json();
    assert.equal(importResponse.status, 200);
    assert.equal(importPayload.ok, true);
    assert.equal(env.LICENSE_DB._state.license_entries.length, 1);
    assert.equal(env.LICENSE_DB._state.license_entries[0].id, "entry-new");
    assert.ok(env.LICENSE_DB._state.audit_logs.some((row) => row.event_type === "admin_backup_import"));
  } finally {
    bundled.cleanup();
  }
});

test("worker admin backup restore dari R2 mengganti isi tabel D1", async () => {
  const bundled = await bundleModule("worker/src/index.js", "worker-backup-restore.mjs");
  try {
    const worker = bundled.module.default;
    const backupKey = "snapshots/2026/04/07/20260407T120000Z-admin.json";
    const snapshot = {
      format: "autoscript-license-backup",
      schema_version: 1,
      created_at: "2026-04-07T12:00:00.000Z",
      created_by: "admin@example.com",
      source: "r2",
      row_counts: {
        license_entries: 1,
      },
      tables: {
        license_entries: [
          {
            id: "entry-r2",
            ip: "198.51.100.30",
            label: "r2",
            owner: "eve",
            notes: "",
            status: "active",
            expires_at: "2026-06-01T00:00:00.000Z",
            created_at: "2026-04-07T12:00:00.000Z",
            updated_at: "2026-04-07T12:00:00.000Z",
            created_by: "admin@example.com",
            updated_by: "admin@example.com",
            revoked_at: null,
            entry_source: "admin",
            renewal_token_hash: "",
            last_renewed_at: null,
            created_request_ip: "198.51.100.30",
          },
        ],
      },
    };

    const env = {
      ADMIN_PROXY_SHARED_SECRET: "secret-backup",
      LICENSE_DB: createD1Stub({
        tables: {
          license_entries: [
            {
              id: "entry-old",
              ip: "198.51.100.40",
              label: "old",
              owner: "",
              notes: "",
              status: "active",
              expires_at: "2026-04-20T00:00:00.000Z",
              created_at: "2026-04-01T00:00:00.000Z",
              updated_at: "2026-04-01T00:00:00.000Z",
              created_by: "admin@example.com",
              updated_by: "admin@example.com",
              revoked_at: null,
              entry_source: "admin",
              renewal_token_hash: "",
              last_renewed_at: null,
              created_request_ip: "198.51.100.40",
            },
          ],
        },
      }),
      LICENSE_BACKUPS: createR2BucketStub({
        [backupKey]: {
          body: JSON.stringify(snapshot),
          customMetadata: {
            created_at: snapshot.created_at,
            created_by: snapshot.created_by,
            schema_version: "1",
            source: "r2",
            license_entries_count: "1",
          },
        },
      }),
    };

    const restoreResponse = await worker.fetch(
      createAdminRequest(`/api/admin/backups/${encodeURIComponent(backupKey)}/restore`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      env
    );
    const restorePayload = await restoreResponse.json();
    assert.equal(restoreResponse.status, 200);
    assert.equal(restorePayload.ok, true);
    assert.equal(env.LICENSE_DB._state.license_entries.length, 1);
    assert.equal(env.LICENSE_DB._state.license_entries[0].id, "entry-r2");
    assert.ok(env.LICENSE_DB._state.audit_logs.some((row) => row.event_type === "admin_backup_restore"));
  } finally {
    bundled.cleanup();
  }
});

test("worker admin backup restore dry-run tidak menulis D1", async () => {
  const bundled = await bundleModule("worker/src/index.js", "worker-backup-restore-dry-run.mjs");
  try {
    const worker = bundled.module.default;
    const backupKey = "snapshots/2026/04/07/20260407T120000Z-admin.json";
    const snapshot = {
      format: "autoscript-license-backup",
      schema_version: 1,
      created_at: "2026-04-07T12:00:00.000Z",
      created_by: "admin@example.com",
      source: "r2",
      row_counts: {
        license_entries: 1,
      },
      tables: {
        license_entries: [
          {
            id: "entry-dry-run",
            ip: "198.51.100.66",
            label: "dry-run",
            owner: "",
            notes: "",
            status: "active",
            expires_at: "2026-06-01T00:00:00.000Z",
            created_at: "2026-04-07T12:00:00.000Z",
            updated_at: "2026-04-07T12:00:00.000Z",
            created_by: "admin@example.com",
            updated_by: "admin@example.com",
            revoked_at: null,
            entry_source: "admin",
            renewal_token_hash: "",
            last_renewed_at: null,
            created_request_ip: "198.51.100.66",
          },
        ],
      },
    };

    const env = {
      ADMIN_PROXY_SHARED_SECRET: "secret-backup",
      LICENSE_DB: createD1Stub({
        tables: {
          license_entries: [
            {
              id: "entry-before",
              ip: "198.51.100.67",
              label: "before",
              owner: "",
              notes: "",
              status: "active",
              expires_at: "2026-06-02T00:00:00.000Z",
              created_at: "2026-04-07T12:00:00.000Z",
              updated_at: "2026-04-07T12:00:00.000Z",
              created_by: "admin@example.com",
              updated_by: "admin@example.com",
              revoked_at: null,
              entry_source: "admin",
              renewal_token_hash: "",
              last_renewed_at: null,
              created_request_ip: "198.51.100.67",
            },
          ],
        },
      }),
      LICENSE_BACKUPS: createR2BucketStub({
        [backupKey]: {
          body: JSON.stringify(snapshot),
          customMetadata: {
            created_at: snapshot.created_at,
            created_by: snapshot.created_by,
            schema_version: "1",
            source: "r2",
            license_entries_count: "1",
          },
        },
      }),
    };

    const response = await worker.fetch(
      createAdminRequest(`/api/admin/backups/${encodeURIComponent(backupKey)}/restore?dry_run=1`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      env
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.dry_run, true);
    assert.equal(env.LICENSE_DB._state.license_entries.length, 1);
    assert.equal(env.LICENSE_DB._state.license_entries[0].id, "entry-before");
    assert.ok(env.LICENSE_DB._state.audit_logs.some((row) => row.event_type === "admin_backup_restore_dry_run"));
    assert.equal(env.LICENSE_DB._state.audit_logs.some((row) => row.event_type === "admin_backup_restore"), false);
  } finally {
    bundled.cleanup();
  }
});

test("worker admin backup preview mengembalikan checksum dan sample isi snapshot", async () => {
  const bundled = await bundleModule("worker/src/index.js", "worker-backup-preview.mjs");
  try {
    const worker = bundled.module.default;
    const backupKey = "snapshots/2026/04/07/20260407T120000Z-admin.json";
    const snapshot = {
      format: "autoscript-license-backup",
      schema_version: 1,
      created_at: "2026-04-07T12:00:00.000Z",
      created_by: "admin@example.com",
      source: "r2",
      row_counts: {
        license_entries: 1,
      },
      tables: {
        license_entries: [
          {
            id: "entry-preview",
            ip: "198.51.100.88",
            label: "preview",
            owner: "",
            notes: "",
            status: "active",
            expires_at: "2026-06-01T00:00:00.000Z",
            created_at: "2026-04-07T12:00:00.000Z",
            updated_at: "2026-04-07T12:00:00.000Z",
            created_by: "admin@example.com",
            updated_by: "admin@example.com",
            revoked_at: null,
            entry_source: "admin",
            renewal_token_hash: "",
            last_renewed_at: null,
            created_request_ip: "198.51.100.88",
          },
        ],
      },
    };
    const snapshotBody = JSON.stringify(snapshot);

    const env = {
      ADMIN_PROXY_SHARED_SECRET: "secret-backup",
      LICENSE_DB: createD1Stub(),
      LICENSE_BACKUPS: createR2BucketStub({
        [backupKey]: {
          body: snapshotBody,
          customMetadata: {
            created_at: snapshot.created_at,
            created_by: snapshot.created_by,
            schema_version: "1",
            source: "r2",
            checksum_sha256: "abc123",
            license_entries_count: "1",
          },
        },
      }),
    };

    const previewResponse = await worker.fetch(
      createAdminRequest(`/api/admin/backups/${encodeURIComponent(backupKey)}/preview`),
      env
    );
    const previewPayload = await previewResponse.json();
    assert.equal(previewResponse.status, 200);
    assert.equal(previewPayload.item.checksum_sha256, "abc123");
    assert.equal(previewPayload.item.preview.license_entries[0].ip, "198.51.100.88");
  } finally {
    bundled.cleanup();
  }
});

test("worker admin backup manifest mengembalikan metadata snapshot tanpa body penuh", async () => {
  const bundled = await bundleModule("worker/src/index.js", "worker-backup-manifest.mjs");
  try {
    const worker = bundled.module.default;
    const backupKey = "snapshots/2026/04/07/20260407T120000Z-admin.json";
    const env = {
      ADMIN_PROXY_SHARED_SECRET: "secret-backup",
      LICENSE_DB: createD1Stub(),
      LICENSE_BACKUPS: createR2BucketStub({
        [backupKey]: {
          body: "{\"format\":\"autoscript-license-backup\"}",
          customMetadata: {
            created_at: "2026-04-07T12:00:00.000Z",
            created_by: "admin@example.com",
            schema_version: "1",
            source: "r2",
            checksum_sha256: "manifest123",
            license_entries_count: "4",
          },
        },
      }),
    };

    const response = await worker.fetch(
      createAdminRequest(`/api/admin/backups/${encodeURIComponent(backupKey)}/manifest`),
      env
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.item.checksum_sha256, "manifest123");
    assert.equal(payload.item.row_counts.license_entries, 4);
    assert.match(String(response.headers.get("Content-Disposition") || ""), /\.manifest\.json/);
  } finally {
    bundled.cleanup();
  }
});

test("worker admin backup restore menolak checksum metadata yang mismatch", async () => {
  const bundled = await bundleModule("worker/src/index.js", "worker-backup-restore-checksum.mjs");
  try {
    const worker = bundled.module.default;
    const backupKey = "snapshots/2026/04/07/mismatch.json";
    const snapshot = {
      format: "autoscript-license-backup",
      schema_version: 1,
      created_at: "2026-04-07T12:00:00.000Z",
      created_by: "admin@example.com",
      source: "r2",
      row_counts: {
        license_entries: 0,
      },
      tables: {
        license_entries: [],
      },
    };

    const env = {
      ADMIN_PROXY_SHARED_SECRET: "secret-backup",
      LICENSE_DB: createD1Stub(),
      LICENSE_BACKUPS: createR2BucketStub({
        [backupKey]: {
          body: JSON.stringify(snapshot),
          customMetadata: {
            created_at: snapshot.created_at,
            created_by: snapshot.created_by,
            schema_version: "1",
            source: "r2",
            checksum_sha256: "definitely-wrong",
            license_entries_count: "0",
          },
        },
      }),
    };

    const response = await worker.fetch(
      createAdminRequest(`/api/admin/backups/${encodeURIComponent(backupKey)}/restore`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      env
    );
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.equal(payload.error, "checksum_mismatch");
  } finally {
    bundled.cleanup();
  }
});

test("worker admin backup import menolak checksum header yang mismatch", async () => {
  const bundled = await bundleModule("worker/src/index.js", "worker-backup-import-checksum.mjs");
  try {
    const worker = bundled.module.default;
    const snapshot = {
      format: "autoscript-license-backup",
      schema_version: 1,
      created_at: "2026-04-07T10:00:00.000Z",
      created_by: "admin@example.com",
      source: "browser_import",
      row_counts: {
        license_entries: 0,
      },
      tables: {
        license_entries: [],
      },
    };

    const env = {
      ADMIN_PROXY_SHARED_SECRET: "secret-backup",
      LICENSE_DB: createD1Stub(),
      LICENSE_BACKUPS: createR2BucketStub(),
    };

    const response = await worker.fetch(
      createAdminRequest("/api/admin/backups/import", {
        method: "POST",
        headers: {
          "X-Admin-Actor-Email": "admin@example.com",
          "X-Admin-Proxy-Secret": "secret-backup",
          "X-Backup-SHA256": "wrong-checksum",
        },
        body: JSON.stringify(snapshot),
      }),
      env
    );
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.equal(payload.error, "checksum_mismatch");
  } finally {
    bundled.cleanup();
  }
});

test("worker admin backup import dry-run tidak menulis D1", async () => {
  const bundled = await bundleModule("worker/src/index.js", "worker-backup-import-dry-run.mjs");
  try {
    const worker = bundled.module.default;
    const snapshot = {
      format: "autoscript-license-backup",
      schema_version: 1,
      created_at: "2026-04-07T10:00:00.000Z",
      created_by: "admin@example.com",
      source: "browser_import",
      row_counts: {
        license_entries: 1,
      },
      tables: {
        license_entries: [
          {
            id: "entry-import-dry",
            ip: "198.51.100.91",
            label: "dry",
            owner: "",
            notes: "",
            status: "active",
            expires_at: "2026-06-01T00:00:00.000Z",
            created_at: "2026-04-07T10:00:00.000Z",
            updated_at: "2026-04-07T10:00:00.000Z",
            created_by: "admin@example.com",
            updated_by: "admin@example.com",
            revoked_at: null,
            entry_source: "admin",
            renewal_token_hash: "",
            last_renewed_at: null,
            created_request_ip: "198.51.100.91",
          },
        ],
      },
    };
    const raw = JSON.stringify(snapshot);

    const env = {
      ADMIN_PROXY_SHARED_SECRET: "secret-backup",
      LICENSE_DB: createD1Stub({
        tables: {
          license_entries: [
            {
              id: "entry-existing",
              ip: "198.51.100.92",
              label: "existing",
              owner: "",
              notes: "",
              status: "active",
              expires_at: "2026-06-01T00:00:00.000Z",
              created_at: "2026-04-07T10:00:00.000Z",
              updated_at: "2026-04-07T10:00:00.000Z",
              created_by: "admin@example.com",
              updated_by: "admin@example.com",
              revoked_at: null,
              entry_source: "admin",
              renewal_token_hash: "",
              last_renewed_at: null,
              created_request_ip: "198.51.100.92",
            },
          ],
        },
      }),
      LICENSE_BACKUPS: createR2BucketStub(),
    };

    const response = await worker.fetch(
      createAdminRequest("/api/admin/backups/import?dry_run=1", {
        method: "POST",
        headers: {
          "X-Admin-Actor-Email": "admin@example.com",
          "X-Admin-Proxy-Secret": "secret-backup",
          "X-Backup-SHA256": "5190f7",
        },
        body: raw,
      }),
      env
    );
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.equal(payload.error, "checksum_mismatch");

    const okResponse = await worker.fetch(
      createAdminRequest("/api/admin/backups/import?dry_run=1", {
        method: "POST",
        headers: {
          "X-Admin-Actor-Email": "admin@example.com",
          "X-Admin-Proxy-Secret": "secret-backup",
          "X-Backup-SHA256": await crypto.subtle
            .digest("SHA-256", new TextEncoder().encode(raw))
            .then((digest) =>
              Array.from(new Uint8Array(digest))
                .map((value) => value.toString(16).padStart(2, "0"))
                .join("")
            ),
        },
        body: raw,
      }),
      env
    );
    const okPayload = await okResponse.json();
    assert.equal(okResponse.status, 200);
    assert.equal(okPayload.dry_run, true);
    assert.equal(env.LICENSE_DB._state.license_entries[0].id, "entry-existing");
    assert.ok(env.LICENSE_DB._state.audit_logs.some((row) => row.event_type === "admin_backup_import_dry_run"));
    assert.equal(env.LICENSE_DB._state.audit_logs.some((row) => row.event_type === "admin_backup_import"), false);
  } finally {
    bundled.cleanup();
  }
});

test("worker scheduled maintenance membuat backup otomatis dan prune snapshot lama", async () => {
  const bundled = await bundleModule("worker/src/index.js", "worker-scheduled-backup.mjs");
  try {
    const worker = bundled.module.default;
    const oldSnapshot = {
      format: "autoscript-license-backup",
      schema_version: 1,
      created_at: "2026-03-01T00:00:00.000Z",
      created_by: "system",
      source: "scheduled",
      row_counts: {
        license_entries: 0,
      },
      tables: {
        license_entries: [],
      },
    };
    const recentSnapshot = {
      ...oldSnapshot,
      created_at: "2026-04-06T00:00:00.000Z",
    };
    const oldManualSnapshot = {
      ...oldSnapshot,
      created_at: "2026-02-15T00:00:00.000Z",
      source: "r2",
    };

    const env = {
      LICENSE_DB: createD1Stub({
        tables: {
          license_entries: [
            {
              id: "entry-1",
              ip: "198.51.100.10",
              label: "scheduled",
              owner: "",
              notes: "",
              status: "active",
              expires_at: "2026-06-01T00:00:00.000Z",
              created_at: "2026-04-07T00:00:00.000Z",
              updated_at: "2026-04-07T00:00:00.000Z",
              created_by: "admin@example.com",
              updated_by: "admin@example.com",
              revoked_at: null,
              entry_source: "admin",
              renewal_token_hash: "",
              last_renewed_at: null,
              created_request_ip: "198.51.100.10",
            },
          ],
        },
      }),
      LICENSE_BACKUPS: createR2BucketStub({
        "snapshots/2026/03/01/old.json": {
          body: JSON.stringify(oldSnapshot),
          uploaded: new Date("2026-03-01T00:00:00.000Z"),
          customMetadata: {
            created_at: oldSnapshot.created_at,
            created_by: "system",
            schema_version: "1",
            source: "scheduled",
            license_entries_count: "0",
          },
        },
        "snapshots/2026/04/06/recent.json": {
          body: JSON.stringify(recentSnapshot),
          uploaded: new Date("2026-04-06T00:00:00.000Z"),
          customMetadata: {
            created_at: recentSnapshot.created_at,
            created_by: "system",
            schema_version: "1",
            source: "scheduled",
            license_entries_count: "0",
          },
        },
        "snapshots/2026/02/15/manual.json": {
          body: JSON.stringify(oldManualSnapshot),
          uploaded: new Date("2026-02-15T00:00:00.000Z"),
          customMetadata: {
            created_at: oldManualSnapshot.created_at,
            created_by: "admin@example.com",
            schema_version: "1",
            source: "r2",
            license_entries_count: "0",
          },
        },
      }),
      AUDIT_LOG_RETENTION_DAYS: "30",
      PUBLIC_RATE_LIMIT_RETENTION_DAYS: "7",
      BACKUP_RETENTION_DAYS: "30",
      BACKUP_RETENTION_DAYS_MANUAL: "90",
      BACKUP_RETENTION_DAYS_SCHEDULED: "30",
      BACKUP_AUTO_ENABLED: "true",
      BACKUP_AUTO_MIN_INTERVAL_HOURS: "24",
    };

    const waiters = [];
    await worker.scheduled(
      { scheduledTime: Date.parse("2026-04-07T17:00:00.000Z") },
      env,
      {
        waitUntil(promise) {
          waiters.push(promise);
        },
      }
    );
    await Promise.all(waiters);

    const keys = Array.from(env.LICENSE_BACKUPS._state.keys()).sort();
    assert.equal(keys.includes("snapshots/2026/03/01/old.json"), false);
    assert.equal(keys.includes("snapshots/2026/04/06/recent.json"), true);
    assert.equal(keys.includes("snapshots/2026/02/15/manual.json"), true);
    assert.equal(keys.some((key) => key.includes("system.json") || key.includes("system")), true);
  } finally {
    bundled.cleanup();
  }
});
