const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const PUBLIC_RENEW_OPEN_BEFORE_DAYS = 3;
const PUBLIC_LICENSE_SUPPORT_EMAIL = "autoscript@atomicmail.io";
const BACKUP_FORMAT = "autoscript-license-backup";
const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_PREFIX = "snapshots/";
const BACKUP_IMPORT_MAX_BYTES = 20 * 1024 * 1024;
const BACKUP_AUTO_ACTOR = "system";
const BACKUP_TABLES = [
  {
    name: "license_entries",
    columns: [
      "id",
      "ip",
      "label",
      "owner",
      "notes",
      "status",
      "expires_at",
      "created_at",
      "updated_at",
      "created_by",
      "updated_by",
      "revoked_at",
      "entry_source",
      "renewal_token_hash",
      "last_renewed_at",
      "created_request_ip",
    ],
  },
];

export default {
  async fetch(request, env) {
    try {
      return await routeRequest(request, env);
    } catch (error) {
      return jsonResponse(
        {
          error: "internal_error",
          message: error instanceof Error ? error.message : "Unhandled error",
        },
        500
      );
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledMaintenance(env, controller.scheduledTime || Date.now()));
  },
};

async function routeRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS" && pathname.startsWith("/api/public/")) {
    return buildPublicCorsResponse(request, env);
  }

  if (request.method === "OPTIONS" && pathname.startsWith("/api/admin/")) {
    return buildAdminCorsResponse(request, env);
  }

  if (request.method === "GET" && pathname === "/healthz") {
    return jsonResponse({ ok: true, service: "autoscript-license-api" });
  }

  if (request.method === "GET" && pathname === "/api/public/config") {
    return withPublicCors(request, env, jsonResponse(buildPublicConfig(env, url.origin)));
  }

  if (request.method === "POST" && pathname === "/api/public/license/activate") {
    return withPublicCors(
      request,
      env,
      await handlePublicActivate(request, env, {
        actionKind: "activate",
        eventBase: "public_activate",
        rateLimitKey: "public_activate",
        rateLimitMax: parseIntSafe(env.PUBLIC_CREATE_LIMIT_MAX, 5),
        rateLimitWindowSec: parseIntSafe(env.PUBLIC_CREATE_WINDOW_SEC, 900),
        rateLimitMessage: "Terlalu banyak request aktivasi IP. Coba lagi nanti.",
        targetRateLimitKey: "public_activate",
        targetRateLimitMax: parseIntSafe(env.PUBLIC_CREATE_TARGET_LIMIT_MAX, 3),
        targetRateLimitWindowSec: parseIntSafe(env.PUBLIC_CREATE_TARGET_WINDOW_SEC, 900),
        targetRateLimitMessage: "IP ini terlalu sering diaktivasi. Coba lagi nanti.",
      })
    );
  }

  if (request.method === "POST" && pathname === "/api/public/license/create") {
    return withPublicCors(
      request,
      env,
      await handlePublicActivate(request, env, {
        actionKind: "activate",
        eventBase: "public_activate",
        rateLimitKey: "public_activate",
        rateLimitMax: parseIntSafe(env.PUBLIC_CREATE_LIMIT_MAX, 5),
        rateLimitWindowSec: parseIntSafe(env.PUBLIC_CREATE_WINDOW_SEC, 900),
        rateLimitMessage: "Terlalu banyak request aktivasi IP. Coba lagi nanti.",
        targetRateLimitKey: "public_activate",
        targetRateLimitMax: parseIntSafe(env.PUBLIC_CREATE_TARGET_LIMIT_MAX, 3),
        targetRateLimitWindowSec: parseIntSafe(env.PUBLIC_CREATE_TARGET_WINDOW_SEC, 900),
        targetRateLimitMessage: "IP ini terlalu sering diaktivasi. Coba lagi nanti.",
      })
    );
  }

  if (request.method === "POST" && pathname === "/api/public/license/status") {
    return withPublicCors(request, env, await handlePublicStatus(request, env));
  }

  if (request.method === "POST" && pathname === "/api/public/license/renew") {
    return withPublicCors(
      request,
      env,
      await handlePublicActivate(request, env, {
        actionKind: "renew",
        eventBase: "public_renew",
        rateLimitKey: "public_renew",
        rateLimitMax: parseIntSafe(env.PUBLIC_RENEW_LIMIT_MAX, 10),
        rateLimitWindowSec: parseIntSafe(env.PUBLIC_RENEW_WINDOW_SEC, 900),
        rateLimitMessage: "Terlalu banyak request renew IP. Coba lagi nanti.",
        targetRateLimitKey: "public_renew",
        targetRateLimitMax: parseIntSafe(env.PUBLIC_RENEW_TARGET_LIMIT_MAX, 5),
        targetRateLimitWindowSec: parseIntSafe(env.PUBLIC_RENEW_TARGET_WINDOW_SEC, 900),
        targetRateLimitMessage: "IP ini terlalu sering di-renew. Coba lagi nanti.",
      })
    );
  }

  if (request.method === "POST" && pathname === "/api/v1/license/check") {
    return handleWorkerLicenseCheck(request, env);
  }

  if (pathname.startsWith("/api/admin/")) {
    return withAdminCors(request, env, await routeAdminRequest(request, env, pathname));
  }

  return jsonResponse({ error: "not_found", message: "Endpoint tidak ditemukan" }, 404);
}

function buildPublicConfig(_env, _workerOrigin) {
  return {
    ok: true,
    service: "public",
  };
}

async function handleWorkerLicenseCheck(request, env) {
  const body = await parseJsonBody(request);
  if (body.error) {
    return body.error;
  }

  const requestIp = normalizeIpv4(getVisitorIp(request));
  if (!requestIp) {
    return jsonResponse(
      {
        error: "invalid_request",
        message: "Worker tidak menerima source IPv4 request yang valid dari Cloudflare.",
      },
      400
    );
  }

  const claimedPublicIp = normalizeIpv4(body.data.public_ipv4);
  const publicIp = requestIp;
  const ipMatch = !claimedPublicIp || claimedPublicIp === requestIp;
  if (!publicIp) {
    return jsonResponse({ error: "invalid_request", message: "public_ipv4 harus IPv4 literal yang valid" }, 400);
  }

  const stage = normalizeStage(body.data.stage);
  const product = normalizeShortText(body.data.product, 64) || "autoscript";
  const hostname = normalizeShortText(body.data.hostname, 255);
  const entry = await getLicenseEntryByIp(env, publicIp);
  const decision = buildLicenseDecision(entry, env);

  await insertAuditLog(env, {
    eventType: "license_check",
    ip: publicIp,
    entryId: entry?.id || "",
    stage,
    decision: decision.allowed ? "allow" : "deny",
    actorEmail: "",
    requestIp: requestIp,
    userAgent: request.headers.get("User-Agent") || "",
    payload: {
      claimed_public_ipv4: claimedPublicIp,
      hostname,
      ip_match: ipMatch,
      product,
      reason: decision.reason,
      request_public_ipv4: requestIp,
      stage,
    },
  });

  return jsonResponse({
    allowed: decision.allowed,
    reason: decision.reason,
    cache_ttl_sec: parseIntSafe(env.CACHE_TTL_SEC_DEFAULT, 3600),
    public_ip: requestIp,
  });
}

async function handlePublicActivate(request, env, options = {}) {
  const body = await parseJsonBody(request);
  if (body.error) {
    return body.error;
  }

  const visitorIp = getVisitorIp(request);
  const eventBase = normalizeShortText(options.eventBase, 64) || "public_activate";
  const limit = await enforcePublicRateLimit(
    env,
    normalizeShortText(options.rateLimitKey, 64) || "public_activate",
    visitorIp,
    parseIntSafe(options.rateLimitMax, parseIntSafe(env.PUBLIC_CREATE_LIMIT_MAX, 5)),
    parseIntSafe(options.rateLimitWindowSec, parseIntSafe(env.PUBLIC_CREATE_WINDOW_SEC, 900))
  );
  if (!limit.allowed) {
    await insertAuditLog(env, {
      eventType: `${eventBase}_rate_limited`,
      ip: "",
      entryId: "",
      stage: "public",
      decision: "rate_limited",
      actorEmail: "",
      requestIp: visitorIp,
      userAgent: request.headers.get("User-Agent") || "",
      payload: { retry_after_sec: limit.retryAfterSec },
    });
    return jsonResponse(
      {
        error: "rate_limited",
        message: options.rateLimitMessage || "Terlalu banyak request aktivasi IP. Coba lagi nanti.",
        retry_after_sec: limit.retryAfterSec,
      },
      429
    );
  }

  const publicIp = normalizeIpv4(body.data.ip);
  if (!publicIp) {
    return jsonResponse({ error: "invalid_request", message: "IP harus IPv4 literal yang valid" }, 400);
  }
  const publicLabel = normalizeShortText(body.data.label, 255) || "";

  const targetLimit = await enforcePublicTargetRateLimit(
    env,
    normalizeShortText(options.targetRateLimitKey, 64) || eventBase,
    publicIp,
    parseIntSafe(options.targetRateLimitMax, 3),
    parseIntSafe(options.targetRateLimitWindowSec, 900)
  );
  if (!targetLimit.allowed) {
    await insertAuditLog(env, {
      eventType: `${eventBase}_target_rate_limited`,
      ip: publicIp,
      entryId: "",
      stage: "public",
      decision: "rate_limited",
      actorEmail: "",
      requestIp: visitorIp,
      userAgent: request.headers.get("User-Agent") || "",
      payload: {
        request_count: targetLimit.requestCount,
        retry_after_sec: targetLimit.retryAfterSec,
        target_ip: publicIp,
      },
    });
    return jsonResponse(
      {
        error: "rate_limited",
        message: options.targetRateLimitMessage || "IP ini terlalu sering diminta. Coba lagi nanti.",
        retry_after_sec: targetLimit.retryAfterSec,
      },
      429
    );
  }

  const challenge = await verifyPublicTurnstileChallenge(
    env,
    request,
    normalizeShortText(body.data.turnstile_token, 4096),
    publicIp,
    eventBase
  );
  if (!challenge.ok) {
    return challenge.response;
  }

  const existing = await getLicenseEntryByIp(env, publicIp);
  const nowIso = nowIsoString();
  const durationDays = getLicenseDurationDays(env);
  const renewOpenBeforeDays = getPublicRenewOpenBeforeDays(env);
  const actionKind = normalizeShortText(options.actionKind, 32) === "renew" ? "renew" : "activate";

  if (existing) {
    const effectiveStatus = effectiveStatusForRow(existing, nowIso);
    const daysRemaining = calculateDaysRemaining(existing.expires_at || "", nowIso);

    if (actionKind === "renew") {
      if (effectiveStatus === "revoked") {
        await insertAuditLog(env, {
          eventType: `${eventBase}_revoked_denied`,
          ip: publicIp,
          entryId: existing.id,
          stage: "public",
          decision: "deny",
          actorEmail: "",
          requestIp: visitorIp,
          userAgent: request.headers.get("User-Agent") || "",
          payload: {
            source: "public-renew-revoked",
          },
        });
        return jsonResponse(
          {
            error: "revoked",
            message: `IP ini sedang diblokir dan tidak bisa diperpanjang dari website publik. Hubungi ${PUBLIC_LICENSE_SUPPORT_EMAIL}.`,
          },
          403
        );
      }
      
      if (effectiveStatus === "active" && daysRemaining > renewOpenBeforeDays) {
        await insertAuditLog(env, {
          eventType: `${eventBase}_too_early`,
          ip: publicIp,
          entryId: existing.id,
          stage: "public",
          decision: "deny",
          actorEmail: "",
          requestIp: visitorIp,
          userAgent: request.headers.get("User-Agent") || "",
          payload: {
            days_remaining: daysRemaining,
            renew_open_before_days: renewOpenBeforeDays,
            source: "public-renew-window",
          },
        });
        return jsonResponse(
          {
            error: "renew_not_open",
            message: `Perpanjangan publik baru dibuka saat sisa aktif ${renewOpenBeforeDays} hari atau kurang (atau sudah expired).`,
          },
          409
        );
      }

      const extendResult = await extendPublicLicenseEntry(env, existing.id, nowIso, durationDays, eventBase);
      if (statementChanges(extendResult) === 0) {
        const refreshed = await getLicenseEntryById(env, existing.id);
        if (refreshed?.status === "revoked") {
          await insertAuditLog(env, {
            eventType: `${eventBase}_revoked_during_update`,
            ip: publicIp,
            entryId: existing.id,
            stage: "public",
            decision: "deny",
            actorEmail: "",
            requestIp: visitorIp,
            userAgent: request.headers.get("User-Agent") || "",
            payload: {
              source: "public-race-revoked",
            },
          });
          return jsonResponse(
            {
              error: "revoked",
              message: `IP ini sedang diblokir dan tidak bisa diperpanjang dari website publik. Hubungi ${PUBLIC_LICENSE_SUPPORT_EMAIL}.`,
            },
            403
          );
        }
        throw new Error(`Gagal memperbarui entry IP publik: ${existing.id}`);
      }
      const updated = await getLicenseEntryById(env, existing.id);
      const newExpiresAt = updated?.expires_at || "";

      await insertAuditLog(env, {
        eventType: eventBase,
        ip: publicIp,
        entryId: existing.id,
        stage: "public",
        decision: "allow",
        actorEmail: "",
        requestIp: visitorIp,
        userAgent: request.headers.get("User-Agent") || "",
        payload: {
          days_remaining_before: daysRemaining,
          expires_at: newExpiresAt,
          previous_expires_at: existing.expires_at || "",
          source: "public-renew",
        },
      });

      return jsonResponse({
        item: serializePublicStatusEntry(updated, nowIso, env),
        message: `IP diperpanjang ${durationDays} hari.`,
      });
    }

    if (effectiveStatus === "revoked") {
      return jsonResponse(
        {
          error: "revoked",
          message: `IP ini sedang diblokir dan tidak bisa diaktifkan dari website publik. Hubungi ${PUBLIC_LICENSE_SUPPORT_EMAIL}.`,
        },
        403
      );
    }
    if (effectiveStatus === "active" || effectiveStatus === "expired") {
      await insertAuditLog(env, {
        eventType: `${eventBase}_exists_denied`,
        ip: publicIp,
        entryId: existing.id,
        stage: "public",
        decision: "deny",
        actorEmail: "",
        requestIp: visitorIp,
        userAgent: request.headers.get("User-Agent") || "",
        payload: {
          effective_status: effectiveStatus,
          days_remaining: daysRemaining,
          renew_open_before_days: renewOpenBeforeDays,
          source: "public-activate-exists",
        },
      });
      return jsonResponse(
        {
          error: "already_registered",
          message: `IP ${publicIp} sudah terdaftar di sistem. Gunakan menu 'Perpanjang' atau 'Cek Status' untuk memperbarui masa aktif.`,
        },
        409
      );
    }

    const refreshResult = await refreshExpiredPublicLicenseEntry(env, existing.id, nowIso, durationDays, eventBase);
    if (statementChanges(refreshResult) === 0) {
      const refreshed = await getLicenseEntryById(env, existing.id);
      if (refreshed?.status === "revoked") {
        return jsonResponse(
          {
            error: "revoked",
            message: `IP ini sedang diblokir dan tidak bisa diaktifkan dari website publik. Hubungi ${PUBLIC_LICENSE_SUPPORT_EMAIL}.`,
          },
          403
        );
      }
      throw new Error(`Gagal mengaktifkan ulang entry IP publik: ${existing.id}`);
    }
    const updated = await getLicenseEntryById(env, existing.id);
    const newExpiresAt = updated?.expires_at || "";

    await insertAuditLog(env, {
      eventType: eventBase,
      ip: publicIp,
      entryId: existing.id,
      stage: "public",
      decision: "allow",
      actorEmail: "",
      requestIp: visitorIp,
      userAgent: request.headers.get("User-Agent") || "",
      payload: {
        expires_at: newExpiresAt,
        previous_expires_at: existing.expires_at || "",
        source: "public-reactivate-expired",
      },
    });

    return jsonResponse({
      item: serializePublicStatusEntry(updated, nowIso, env),
      message: `IP aktif kembali selama ${durationDays} hari.`,
    });
  }

  if (actionKind === "renew") {
    await insertAuditLog(env, {
      eventType: `${eventBase}_missing_entry`,
      ip: publicIp,
      entryId: "",
      stage: "public",
      decision: "deny",
      actorEmail: "",
      requestIp: visitorIp,
      userAgent: request.headers.get("User-Agent") || "",
      payload: {
        source: "public-renew-missing-entry",
      },
    });
    return jsonResponse(
      {
        error: "not_found",
        message: "IP ini belum punya entry aktif. Gunakan aktivasi lebih dulu.",
      },
      404
    );
  }

  const expiresAt = addDaysIso(nowIso, durationDays);
  const id = crypto.randomUUID();

  const insertResult = await runStatement(
    env,
    `
      INSERT OR IGNORE INTO license_entries (
        id, ip, label, owner, notes, status, expires_at,
        created_at, updated_at, created_by, updated_by, revoked_at,
        entry_source, renewal_token_hash, last_renewed_at, created_request_ip
      )
      VALUES (?, ?, ?, '', '', 'active', ?, ?, ?, 'public', 'public', NULL, 'public', '', NULL, ?)
    `,
    [id, publicIp, publicLabel, expiresAt, nowIso, nowIso, visitorIp]
  );
  if (statementChanges(insertResult) === 0) {
    const raced = await getLicenseEntryByIp(env, publicIp);
    if (!raced) {
      throw new Error(`Gagal membaca entry IP sesudah insert ignore: ${publicIp}`);
    }
    if (raced.status === "revoked") {
      return jsonResponse(
        {
          error: "revoked",
          message: `IP ini sedang diblokir dan tidak bisa diaktifkan dari website publik. Hubungi ${PUBLIC_LICENSE_SUPPORT_EMAIL}.`,
        },
        403
      );
    }

    await insertAuditLog(env, {
      eventType: `${eventBase}_race_recovered`,
      ip: publicIp,
      entryId: raced.id,
      stage: "public",
      decision: "allow",
      actorEmail: "",
      requestIp: visitorIp,
      userAgent: request.headers.get("User-Agent") || "",
      payload: {
        expires_at: raced.expires_at || "",
        source: "public-race-recovered",
      },
    });

    return jsonResponse({
      item: serializePublicStatusEntry(raced, nowIso, env),
      message: "IP sudah aktif dari request paralel sebelumnya. Gunakan status terbaru berikut.",
    });
  }

  await insertAuditLog(env, {
    eventType: eventBase,
    ip: publicIp,
    entryId: id,
    stage: "public",
    decision: "allow",
    actorEmail: "",
    requestIp: visitorIp,
    userAgent: request.headers.get("User-Agent") || "",
    payload: {
      expires_at: expiresAt,
      source: "public",
    },
  });

  const created = await getLicenseEntryById(env, id);
  return jsonResponse(
    {
      item: serializePublicStatusEntry(created, nowIso, env),
      message: `IP aktif selama ${durationDays} hari.`,
    },
    201
  );
}

async function handlePublicStatus(request, env) {
  const body = await parseJsonBody(request);
  if (body.error) {
    return body.error;
  }

  const visitorIp = getVisitorIp(request);
  const limit = await enforcePublicRateLimit(
    env,
    "public_status",
    visitorIp,
    parseIntSafe(env.PUBLIC_STATUS_LIMIT_MAX, 30),
    parseIntSafe(env.PUBLIC_STATUS_WINDOW_SEC, 900)
  );
  if (!limit.allowed) {
    await insertAuditLog(env, {
      eventType: "public_status_rate_limited",
      ip: "",
      entryId: "",
      stage: "public",
      decision: "rate_limited",
      actorEmail: "",
      requestIp: visitorIp,
      userAgent: request.headers.get("User-Agent") || "",
      payload: { retry_after_sec: limit.retryAfterSec },
    });
    return jsonResponse(
      {
        error: "rate_limited",
        message: "Terlalu banyak request status. Coba lagi nanti.",
        retry_after_sec: limit.retryAfterSec,
      },
      429
    );
  }

  const publicIp = normalizeIpv4(body.data.ip);
  if (!publicIp) {
    return jsonResponse({ error: "invalid_request", message: "IP harus IPv4 literal yang valid" }, 400);
  }

  const entry = await getLicenseEntryByIp(env, publicIp);
  const statusPayload = serializePublicLookupStatusEntry(entry, nowIsoString(), env, publicIp);

  await insertAuditLog(env, {
    eventType: "public_status",
    ip: publicIp,
    entryId: entry?.id || "",
    stage: "public",
    decision: statusPayload.status,
    actorEmail: "",
    requestIp: visitorIp,
    userAgent: request.headers.get("User-Agent") || "",
    payload: {
      status: statusPayload.status,
    },
  });

  return jsonResponse(statusPayload);
}

async function routeAdminRequest(request, env, pathname) {
  const auth = await authenticateAdminRequest(request, env);
  if (!auth.ok) {
    return auth.response;
  }
  const actorEmail = auth.actorEmail;

  if (request.method === "GET" && pathname === "/api/admin/session") {
    return jsonResponse({
      admin_email: actorEmail,
      auth_mode: "cloudflare_access",
      ok: true,
    });
  }

  if (request.method === "GET" && pathname === "/api/admin/license-entries") {
    return handleAdminListEntries(request, env);
  }

  if (request.method === "GET" && pathname === "/api/admin/backups") {
    return handleAdminListBackups(env);
  }

  if (request.method === "GET" && pathname === "/api/admin/metrics") {
    return handleAdminMetrics(request, env);
  }

  if (request.method === "POST" && pathname === "/api/admin/backups") {
    return handleAdminCreateBackup(env, actorEmail);
  }

  if (request.method === "POST" && pathname === "/api/admin/backups/import") {
    return handleAdminImportBackup(request, env, actorEmail);
  }

  if (request.method === "POST" && pathname === "/api/admin/license-entries") {
    return handleAdminCreateEntry(request, env, actorEmail);
  }

  if (request.method === "GET" && pathname === "/api/admin/audit-logs") {
    return handleAdminListAuditLogs(request, env);
  }

  const downloadMatch = pathname.match(/^\/api\/admin\/backups\/(.+)\/download$/);
  if (request.method === "GET" && downloadMatch) {
    return handleAdminDownloadBackup(env, decodeURIComponent(downloadMatch[1]));
  }

  const previewMatch = pathname.match(/^\/api\/admin\/backups\/(.+)\/preview$/);
  if (request.method === "GET" && previewMatch) {
    return handleAdminPreviewBackup(env, decodeURIComponent(previewMatch[1]));
  }

  const manifestMatch = pathname.match(/^\/api\/admin\/backups\/(.+)\/manifest$/);
  if (request.method === "GET" && manifestMatch) {
    return handleAdminBackupManifest(env, decodeURIComponent(manifestMatch[1]));
  }

  const restoreMatch = pathname.match(/^\/api\/admin\/backups\/(.+)\/restore$/);
  if (request.method === "POST" && restoreMatch) {
    return handleAdminRestoreBackup(request, env, actorEmail, decodeURIComponent(restoreMatch[1]));
  }

  const deleteBackupMatch = pathname.match(/^\/api\/admin\/backups\/(.+)$/);
  if (request.method === "DELETE" && deleteBackupMatch) {
    return handleAdminDeleteBackup(env, actorEmail, decodeURIComponent(deleteBackupMatch[1]));
  }

  const patchMatch = pathname.match(/^\/api\/admin\/license-entries\/([^/]+)$/);
  if (request.method === "PATCH" && patchMatch) {
    return handleAdminPatchEntry(request, env, actorEmail, decodeURIComponent(patchMatch[1]));
  }
  if (request.method === "DELETE" && patchMatch) {
    return handleAdminDeleteEntry(request, env, actorEmail, decodeURIComponent(patchMatch[1]));
  }

  const toggleMatch = pathname.match(/^\/api\/admin\/license-entries\/([^/]+)\/(revoke|reactivate)$/);
  if (request.method === "POST" && toggleMatch) {
    const targetStatus = toggleMatch[2] === "revoke" ? "revoked" : "active";
    return handleAdminToggleEntry(request, env, actorEmail, decodeURIComponent(toggleMatch[1]), targetStatus);
  }

  return jsonResponse({ error: "not_found", message: "Admin endpoint tidak ditemukan." }, 404);
}

async function handleAdminListEntries(request, env) {
  const url = new URL(request.url);
  const search = normalizeShortText(url.searchParams.get("search"), 255);
  const statusFilter = normalizeStatusFilter(url.searchParams.get("status"));
  const nowIso = nowIsoString();
  const binds = [];

  let sql = `
    SELECT
      id,
      ip,
      label,
      owner,
      notes,
      status,
      expires_at,
      created_at,
      updated_at,
      created_by,
      updated_by,
      revoked_at,
      entry_source,
      last_renewed_at,
      created_request_ip,
      renewal_token_hash
    FROM license_entries
    WHERE 1 = 1
  `;

  if (search) {
    sql += `
      AND (
        lower(ip) LIKE ?
        OR lower(label) LIKE ?
        OR lower(owner) LIKE ?
        OR lower(notes) LIKE ?
        OR lower(entry_source) LIKE ?
      )
    `;
    const like = `%${search.toLowerCase()}%`;
    binds.push(like, like, like, like, like);
  }

  if (statusFilter === "active") {
    sql += ` AND status = 'active' AND (expires_at IS NULL OR expires_at = '' OR expires_at > ?)`;
    binds.push(nowIso);
  } else if (statusFilter === "revoked") {
    sql += ` AND status = 'revoked'`;
  } else if (statusFilter === "expired") {
    sql += ` AND status = 'active' AND expires_at IS NOT NULL AND expires_at != '' AND expires_at <= ?`;
    binds.push(nowIso);
  }

  sql += ` ORDER BY updated_at DESC LIMIT 250`;

  const rows = await allRows(env, sql, binds);
  return jsonResponse({
    items: rows.map((row) => serializeLicenseEntry(row, nowIso)),
  });
}

async function handleAdminMetrics(request, env) {
  const url = new URL(request.url);
  const days = Math.min(60, Math.max(7, parseIntSafe(url.searchParams.get("days"), 14)));
  const nowIso = nowIsoString();
  const rangeStartIso = startOfUtcDayIso(days - 1);
  const rangeStartDay = rangeStartIso.slice(0, 10);

  const entrySummary =
    (await firstRow(
      env,
      `
        SELECT
          COUNT(*) AS total_entries,
          SUM(CASE WHEN status = 'active' AND (expires_at IS NULL OR expires_at = '' OR expires_at > ?) THEN 1 ELSE 0 END) AS active_entries,
          SUM(CASE WHEN status = 'active' AND expires_at IS NOT NULL AND expires_at != '' AND expires_at <= ? THEN 1 ELSE 0 END) AS expired_entries,
          SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END) AS revoked_entries,
          SUM(CASE WHEN entry_source = 'public' THEN 1 ELSE 0 END) AS public_entries,
          SUM(CASE WHEN entry_source = 'admin' THEN 1 ELSE 0 END) AS admin_entries
        FROM license_entries
      `,
      [nowIso, nowIso]
    )) || {};

  const activitySummary =
    (await firstRow(
      env,
      `
        SELECT
          COUNT(*) AS audit_rows_window,
          SUM(CASE WHEN event_type = 'license_check' AND decision = 'allow' THEN 1 ELSE 0 END) AS checks_allowed,
          SUM(CASE WHEN event_type = 'license_check' AND decision = 'deny' THEN 1 ELSE 0 END) AS checks_denied,
          SUM(CASE WHEN event_type = 'public_activate' AND decision = 'allow' THEN 1 ELSE 0 END) AS public_activations,
          SUM(CASE WHEN event_type = 'public_renew' AND decision = 'allow' THEN 1 ELSE 0 END) AS public_renewals,
          SUM(CASE WHEN event_type LIKE 'admin_%' THEN 1 ELSE 0 END) AS admin_mutations
        FROM audit_logs
        WHERE created_at >= ?
      `,
      [rangeStartIso]
    )) || {};

  const dailyRows = await allRows(
    env,
    `
      SELECT
        substr(created_at, 1, 10) AS day,
        SUM(CASE WHEN event_type = 'license_check' AND decision = 'allow' THEN 1 ELSE 0 END) AS checks_allowed,
        SUM(CASE WHEN event_type = 'license_check' AND decision = 'deny' THEN 1 ELSE 0 END) AS checks_denied,
        SUM(CASE WHEN event_type = 'public_activate' AND decision = 'allow' THEN 1 ELSE 0 END) AS public_activations,
        SUM(CASE WHEN event_type = 'public_renew' AND decision = 'allow' THEN 1 ELSE 0 END) AS public_renewals,
        SUM(CASE WHEN event_type LIKE 'admin_%' THEN 1 ELSE 0 END) AS admin_mutations
      FROM audit_logs
      WHERE created_at >= ?
      GROUP BY substr(created_at, 1, 10)
      ORDER BY day ASC
    `,
    [rangeStartIso]
  );

  const dailyMap = new Map(
    dailyRows.map((row) => [
      row.day,
      {
        day: row.day,
        checks_allowed: Number(row.checks_allowed || 0),
        checks_denied: Number(row.checks_denied || 0),
        public_activations: Number(row.public_activations || 0),
        public_renewals: Number(row.public_renewals || 0),
        admin_mutations: Number(row.admin_mutations || 0),
      },
    ])
  );

  const daily = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = startOfUtcDayIso(offset).slice(0, 10);
    daily.push(
      dailyMap.get(day) || {
        day,
        checks_allowed: 0,
        checks_denied: 0,
        public_activations: 0,
        public_renewals: 0,
        admin_mutations: 0,
      }
    );
  }

  const topEventsRows = await allRows(
    env,
    `
      SELECT event_type, COUNT(*) AS count
      FROM audit_logs
      WHERE created_at >= ?
      GROUP BY event_type
      ORDER BY count DESC, event_type ASC
      LIMIT 8
    `,
    [rangeStartIso]
  );

  return jsonResponse({
    window_days: days,
    range_start: rangeStartDay,
    generated_at: nowIso,
    summary: {
      total_entries: Number(entrySummary.total_entries || 0),
      active_entries: Number(entrySummary.active_entries || 0),
      expired_entries: Number(entrySummary.expired_entries || 0),
      revoked_entries: Number(entrySummary.revoked_entries || 0),
      public_entries: Number(entrySummary.public_entries || 0),
      admin_entries: Number(entrySummary.admin_entries || 0),
      audit_rows_window: Number(activitySummary.audit_rows_window || 0),
      checks_allowed: Number(activitySummary.checks_allowed || 0),
      checks_denied: Number(activitySummary.checks_denied || 0),
      public_activations: Number(activitySummary.public_activations || 0),
      public_renewals: Number(activitySummary.public_renewals || 0),
      admin_mutations: Number(activitySummary.admin_mutations || 0),
    },
    daily,
    top_events: topEventsRows.map((row) => ({
      event_type: row.event_type,
      count: Number(row.count || 0),
    })),
  });
}

async function handleAdminListBackups(env) {
  const bucket = getLicenseBackupBucket(env);
  if (!bucket) {
    return jsonResponse({ items: [] });
  }
  const listed = await bucket.list({
    prefix: BACKUP_PREFIX,
    limit: 100,
  });
  const items = (listed.objects || [])
    .map((object) => serializeBackupObject(object))
    .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
  return jsonResponse({ items });
}

async function handleAdminCreateBackup(env, actorEmail) {
  const bucket = getLicenseBackupBucket(env);
  if (!bucket) {
    return jsonResponse(
      {
        error: "misconfigured",
        message: "Bucket backup R2 belum dikonfigurasi.",
      },
      503
    );
  }

  const snapshot = await buildBackupSnapshot(env, actorEmail, "r2");
  const key = buildBackupObjectKey(snapshot.created_at, actorEmail);
  const body = JSON.stringify(snapshot, null, 2);
  const checksumSha256 = await computeSha256Hex(body);
  const metadata = buildBackupObjectMetadata(snapshot, checksumSha256);
  await bucket.put(key, body, {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
    },
    customMetadata: metadata,
  });

  await insertAuditLog(env, {
    eventType: "admin_backup_create",
    ip: "",
    entryId: null,
    stage: "admin",
    decision: "mutate",
    actorEmail,
    requestIp: "",
    userAgent: "",
    payload: {
      backup_key: key,
      row_counts: snapshot.row_counts,
    },
  });

  return jsonResponse(
    {
      item: {
        ...serializeBackupObject({
          key,
          uploaded: new Date(snapshot.created_at),
          size: body.length,
          customMetadata: metadata,
        }),
        source: snapshot.source,
      },
    },
    201
  );
}

async function handleAdminDownloadBackup(env, backupKey) {
  const bucket = getLicenseBackupBucket(env);
  if (!bucket) {
    return jsonResponse(
      {
        error: "misconfigured",
        message: "Bucket backup R2 belum dikonfigurasi.",
      },
      503
    );
  }
  const object = await bucket.get(backupKey);
  if (!object || !object.body) {
    return jsonResponse({ error: "not_found", message: "Snapshot backup tidak ditemukan." }, 404);
  }

  const fileName = backupKey.split("/").at(-1) || "autoscript-license-backup.json";
  const headers = buildApiSecurityHeaders({
    "Content-Type": object.httpMetadata?.contentType || "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "X-Backup-SHA256": object.customMetadata?.checksum_sha256 || "",
  });
  return new Response(object.body, {
    status: 200,
    headers,
  });
}

async function handleAdminPreviewBackup(env, backupKey) {
  const bucket = getLicenseBackupBucket(env);
  if (!bucket) {
    return jsonResponse(
      {
        error: "misconfigured",
        message: "Bucket backup R2 belum dikonfigurasi.",
      },
      503
    );
  }
  const object = await bucket.get(backupKey);
  if (!object) {
    return jsonResponse({ error: "not_found", message: "Snapshot backup tidak ditemukan." }, 404);
  }
  const rawPayload = await object.text();
  const snapshot = parseAndValidateBackupSnapshot(rawPayload);
  if (snapshot.error) {
    return jsonResponse(snapshot.error, 400);
  }
  const checksumSha256 = object.customMetadata?.checksum_sha256 || (await computeSha256Hex(rawPayload));
  return jsonResponse({
    item: {
      ...serializeBackupObject(object),
      checksum_sha256: checksumSha256,
      checksum_valid: true,
      preview: {
        license_entries: (snapshot.value.tables.license_entries || []).slice(0, 5).map((row) => ({
          id: row.id,
          ip: row.ip,
          label: row.label || "",
          status: row.status || "",
          expires_at: row.expires_at || "",
        })),
      },
    },
  });
}

async function handleAdminBackupManifest(env, backupKey) {
  const bucket = getLicenseBackupBucket(env);
  if (!bucket) {
    return jsonResponse(
      {
        error: "misconfigured",
        message: "Bucket backup R2 belum dikonfigurasi.",
      },
      503
    );
  }
  const object = await bucket.get(backupKey);
  if (!object) {
    return jsonResponse({ error: "not_found", message: "Snapshot backup tidak ditemukan." }, 404);
  }
  let serialized = serializeBackupObject(object);
  if (!serialized.checksum_sha256) {
    const rawPayload = await object.text();
    serialized = {
      ...serialized,
      checksum_sha256: await computeSha256Hex(rawPayload),
    };
  }
  const payload = {
    item: serialized,
  };
  const baseName = (backupKey.split("/").at(-1) || "autoscript-license-backup.json").replace(/\.json$/i, "");
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: buildApiSecurityHeaders({
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseName}.manifest.json"`,
    }),
  });
}

async function handleAdminRestoreBackup(request, env, actorEmail, backupKey) {
  const bucket = getLicenseBackupBucket(env);
  if (!bucket) {
    return jsonResponse(
      {
        error: "misconfigured",
        message: "Bucket backup R2 belum dikonfigurasi.",
      },
      503
    );
  }
  const object = await bucket.get(backupKey);
  if (!object) {
    return jsonResponse({ error: "not_found", message: "Snapshot backup tidak ditemukan." }, 404);
  }
  const rawPayload = await object.text();
  const checksumValidation = await validateBackupChecksum(rawPayload, object.customMetadata?.checksum_sha256 || "");
  if (!checksumValidation.ok) {
    return jsonResponse(checksumValidation.error, 409);
  }
  const snapshot = parseAndValidateBackupSnapshot(rawPayload);
  if (snapshot.error) {
    return jsonResponse(snapshot.error, 400);
  }
  const dryRun = isTruthyQueryValue(new URL(request.url).searchParams.get("dry_run"));

  if (dryRun) {
    await insertAuditLog(env, {
      eventType: "admin_backup_restore_dry_run",
      ip: "",
      entryId: null,
      stage: "admin",
      decision: "inspect",
      actorEmail,
      requestIp: "",
      userAgent: "",
      payload: {
        backup_key: backupKey,
        checksum_sha256: checksumValidation.checksumSha256,
        row_counts: snapshot.value.row_counts,
        source: "r2",
      },
    });
    return jsonResponse({
      ok: true,
      dry_run: true,
      restored_key: backupKey,
      checksum_sha256: checksumValidation.checksumSha256,
      row_counts: snapshot.value.row_counts,
    });
  }

  await restoreBackupSnapshot(env, snapshot.value);
  await insertAuditLog(env, {
    eventType: "admin_backup_restore",
    ip: "",
    entryId: null,
    stage: "admin",
    decision: "mutate",
    actorEmail,
    requestIp: "",
    userAgent: "",
    payload: {
      backup_key: backupKey,
      checksum_sha256: checksumValidation.checksumSha256,
      row_counts: snapshot.value.row_counts,
      source: "r2",
    },
  });
  return jsonResponse({
    ok: true,
    restored_key: backupKey,
    checksum_sha256: checksumValidation.checksumSha256,
    row_counts: snapshot.value.row_counts,
  });
}

async function handleAdminDeleteBackup(env, actorEmail, backupKey) {
  const bucket = getLicenseBackupBucket(env);
  if (!bucket) {
    return jsonResponse(
      {
        error: "misconfigured",
        message: "Bucket backup R2 belum dikonfigurasi.",
      },
      503
    );
  }
  await bucket.delete(backupKey);
  await insertAuditLog(env, {
    eventType: "admin_backup_delete",
    ip: "",
    entryId: null,
    stage: "admin",
    decision: "mutate",
    actorEmail,
    requestIp: "",
    userAgent: "",
    payload: {
      backup_key: backupKey,
    },
  });
  return jsonResponse({
    ok: true,
    deleted_key: backupKey,
  });
}

async function handleAdminImportBackup(request, env, actorEmail) {
  const rawPayload = await request.text();
  if (!rawPayload.trim()) {
    return jsonResponse({ error: "invalid_request", message: "File backup kosong." }, 400);
  }
  if (rawPayload.length > BACKUP_IMPORT_MAX_BYTES) {
    return jsonResponse(
      {
        error: "payload_too_large",
        message: "Ukuran file backup terlalu besar untuk di-import.",
      },
      413
    );
  }

  const checksumValidation = await validateBackupChecksum(
    rawPayload,
    String(request.headers.get("X-Backup-SHA256") || "").trim()
  );
  if (!checksumValidation.ok) {
    return jsonResponse(checksumValidation.error, 409);
  }

  const snapshot = parseAndValidateBackupSnapshot(rawPayload);
  if (snapshot.error) {
    return jsonResponse(snapshot.error, 400);
  }
  const dryRun = isTruthyQueryValue(new URL(request.url).searchParams.get("dry_run"));

  if (dryRun) {
    await insertAuditLog(env, {
      eventType: "admin_backup_import_dry_run",
      ip: "",
      entryId: null,
      stage: "admin",
      decision: "inspect",
      actorEmail,
      requestIp: "",
      userAgent: "",
      payload: {
        imported_name: snapshot.value.file_name || "",
        checksum_sha256: checksumValidation.checksumSha256,
        row_counts: snapshot.value.row_counts,
        source: "browser_import",
      },
    });
    return jsonResponse({
      ok: true,
      dry_run: true,
      checksum_sha256: checksumValidation.checksumSha256,
      row_counts: snapshot.value.row_counts,
    });
  }

  await restoreBackupSnapshot(env, snapshot.value);
  await insertAuditLog(env, {
    eventType: "admin_backup_import",
    ip: "",
    entryId: null,
    stage: "admin",
    decision: "mutate",
    actorEmail,
    requestIp: "",
    userAgent: "",
    payload: {
      imported_name: snapshot.value.file_name || "",
      checksum_sha256: checksumValidation.checksumSha256,
      row_counts: snapshot.value.row_counts,
      source: "browser_import",
    },
  });

  return jsonResponse({
    ok: true,
    imported: true,
    checksum_sha256: checksumValidation.checksumSha256,
    row_counts: snapshot.value.row_counts,
  });
}

function authenticateAdminRequest(request, env) {
  const sharedSecret = getAdminProxySharedSecret(env);
  if (!sharedSecret) {
    return Promise.resolve({
      ok: false,
      response: jsonResponse(
        {
          error: "misconfigured",
          message: "Admin proxy secret belum dikonfigurasi.",
        },
        503
      ),
    });
  }

  const providedSecret = String(request.headers.get("X-Admin-Proxy-Secret") || "").trim();
  if (!providedSecret || providedSecret !== sharedSecret) {
    return Promise.resolve({
      ok: false,
      response: jsonResponse(
        {
          error: "unauthorized",
          message: "Admin API hanya menerima request internal dari Pages.",
        },
        401
      ),
    });
  }

  const actorEmail = normalizeShortText(request.headers.get("X-Admin-Actor-Email"), 255);
  if (!actorEmail) {
    return Promise.resolve({
      ok: false,
      response: jsonResponse(
        {
          error: "unauthorized",
          message: "Identitas Access tidak tersedia.",
        },
        401
      ),
    });
  }

  return Promise.resolve({
    ok: true,
    actorEmail,
  });
}

async function handleAdminCreateEntry(request, env, actorEmail) {
  const body = await parseJsonBody(request);
  if (body.error) {
    return body.error;
  }

  const normalized = normalizeEntryPayload(body.data);
  if (normalized.error) {
    return jsonResponse({ error: "invalid_request", message: normalized.error }, 400);
  }

  const existing = await getLicenseEntryByIp(env, normalized.entry.ip);
  if (existing) {
    return jsonResponse({ error: "conflict", message: "IP sudah terdaftar" }, 409);
  }

  const nowIso = nowIsoString();
  const id = crypto.randomUUID();
  await runStatement(
    env,
    `
      INSERT INTO license_entries (
        id, ip, label, owner, notes, status, expires_at,
        created_at, updated_at, created_by, updated_by, revoked_at,
        entry_source, renewal_token_hash, last_renewed_at, created_request_ip
      )
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, NULL, 'admin', '', NULL, ?)
    `,
    [
      id,
      normalized.entry.ip,
      normalized.entry.label,
      normalized.entry.owner,
      normalized.entry.notes,
      normalized.entry.expiresAt,
      nowIso,
      nowIso,
      actorEmail,
      actorEmail,
      getAdminRequestIp(request),
    ]
  );

  await insertAuditLog(env, {
    eventType: "admin_create",
    ip: normalized.entry.ip,
    entryId: id,
    stage: "admin",
    decision: "mutate",
    actorEmail,
    requestIp: getAdminRequestIp(request),
    userAgent: getAdminUserAgent(request),
    payload: normalized.entry,
  });

  const created = await getLicenseEntryById(env, id);
  return jsonResponse({ item: serializeLicenseEntry(created, nowIso) }, 201);
}

async function handleAdminPatchEntry(request, env, actorEmail, entryId) {
  const existing = await getLicenseEntryById(env, entryId);
  if (!existing) {
    return jsonResponse({ error: "not_found", message: "Entry tidak ditemukan" }, 404);
  }

  const body = await parseJsonBody(request);
  if (body.error) {
    return body.error;
  }

  const normalized = normalizeEntryPayload(body.data);
  if (normalized.error) {
    return jsonResponse({ error: "invalid_request", message: normalized.error }, 400);
  }

  const other = await getLicenseEntryByIp(env, normalized.entry.ip);
  if (other && other.id !== entryId) {
    return jsonResponse({ error: "conflict", message: "IP sudah dipakai entry lain" }, 409);
  }

  const nowIso = nowIsoString();
  await runStatement(
    env,
    `
      UPDATE license_entries
      SET ip = ?, label = ?, owner = ?, notes = ?, expires_at = ?, updated_at = ?, updated_by = ?
      WHERE id = ?
    `,
    [
      normalized.entry.ip,
      normalized.entry.label,
      normalized.entry.owner,
      normalized.entry.notes,
      normalized.entry.expiresAt,
      nowIso,
      actorEmail,
      entryId,
    ]
  );

  await insertAuditLog(env, {
    eventType: "admin_update",
    ip: normalized.entry.ip,
    entryId,
    stage: "admin",
    decision: "mutate",
    actorEmail,
    requestIp: getAdminRequestIp(request),
    userAgent: getAdminUserAgent(request),
    payload: normalized.entry,
  });

  const updated = await getLicenseEntryById(env, entryId);
  return jsonResponse({ item: serializeLicenseEntry(updated, nowIso) });
}

async function handleAdminToggleEntry(request, env, actorEmail, entryId, targetStatus) {
  const existing = await getLicenseEntryById(env, entryId);
  if (!existing) {
    return jsonResponse({ error: "not_found", message: "Entry tidak ditemukan" }, 404);
  }

  const nowIso = nowIsoString();
  const revokedAt = targetStatus === "revoked" ? nowIso : null;
  await runStatement(
    env,
    `
      UPDATE license_entries
      SET status = ?, revoked_at = ?, updated_at = ?, updated_by = ?
      WHERE id = ?
    `,
    [targetStatus, revokedAt, nowIso, actorEmail, entryId]
  );

  await insertAuditLog(env, {
    eventType: targetStatus === "revoked" ? "admin_revoke" : "admin_reactivate",
    ip: existing.ip,
    entryId,
    stage: "admin",
    decision: "mutate",
    actorEmail,
    requestIp: getAdminRequestIp(request),
    userAgent: getAdminUserAgent(request),
    payload: {
      target_status: targetStatus,
    },
  });

  const updated = await getLicenseEntryById(env, entryId);
  return jsonResponse({ item: serializeLicenseEntry(updated, nowIso) });
}

async function handleAdminDeleteEntry(request, env, actorEmail, entryId) {
  const existing = await getLicenseEntryById(env, entryId);
  if (!existing) {
    return jsonResponse({ error: "not_found", message: "Entry tidak ditemukan" }, 404);
  }

  await runStatement(env, `DELETE FROM license_entries WHERE id = ?`, [entryId]);

  await insertAuditLog(env, {
    eventType: "admin_delete",
    ip: existing.ip,
    entryId,
    stage: "admin",
    decision: "mutate",
    actorEmail,
    requestIp: getAdminRequestIp(request),
    userAgent: getAdminUserAgent(request),
    payload: {
      deleted_entry: {
        id: existing.id,
        ip: existing.ip,
        label: existing.label,
        owner: existing.owner,
        notes: existing.notes,
        status: existing.status,
        expires_at: existing.expires_at,
      },
    },
  });

  return jsonResponse({
    ok: true,
    deleted_id: entryId,
  });
}

async function handleAdminListAuditLogs(request, env) {
  const url = new URL(request.url);
  const limit = Math.min(250, Math.max(1, parseIntSafe(url.searchParams.get("limit"), 100)));
  const rawIp = String(url.searchParams.get("ip") || "").trim();
  const ip = rawIp ? normalizeIpv4(rawIp) : "";
  if (rawIp && !ip) {
    return jsonResponse({ error: "invalid_request", message: "Filter IP audit tidak valid" }, 400);
  }
  const eventType = normalizeShortText(url.searchParams.get("event"), 80);
  const binds = [];
  let sql = `
    SELECT id, event_type, ip, entry_id, stage, decision, actor_email, request_ip, user_agent, payload_json, created_at
    FROM audit_logs
    WHERE 1 = 1
  `;
  if (ip) {
    sql += ` AND ip = ?`;
    binds.push(ip);
  }
  if (eventType) {
    sql += ` AND event_type LIKE ?`;
    binds.push(`%${eventType}%`);
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  binds.push(limit);
  const rows = await allRows(env, sql, binds);
  return jsonResponse({
    filters: {
      ip,
      event: eventType,
      limit,
    },
    items: rows.map((row) => ({
      ...row,
      payload_json: parseJsonSafe(row.payload_json, {}),
    })),
  });
}

async function buildBackupSnapshot(env, actorEmail, source) {
  const createdAt = nowIsoString();
  const tables = {};
  const rowCounts = {};

  for (const table of BACKUP_TABLES) {
    const rows = await allRows(
      env,
      `SELECT ${table.columns.join(", ")} FROM ${table.name}`
    );
    tables[table.name] = rows.map((row) => sanitizeBackupRow(row, table.columns));
    rowCounts[table.name] = rows.length;
  }

  return {
    format: BACKUP_FORMAT,
    schema_version: BACKUP_SCHEMA_VERSION,
    created_at: createdAt,
    created_by: actorEmail,
    source,
    row_counts: rowCounts,
    tables,
  };
}

function sanitizeBackupRow(row, columns) {
  const sanitized = {};
  for (const column of columns) {
    if (Object.prototype.hasOwnProperty.call(row, column)) {
      sanitized[column] = row[column];
    } else {
      sanitized[column] = null;
    }
  }
  return sanitized;
}

function buildBackupObjectKey(createdAt, actorEmail) {
  const parsed = new Date(createdAt);
  const year = String(parsed.getUTCFullYear()).padStart(4, "0");
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const hour = String(parsed.getUTCHours()).padStart(2, "0");
  const minute = String(parsed.getUTCMinutes()).padStart(2, "0");
  const second = String(parsed.getUTCSeconds()).padStart(2, "0");
  return `${BACKUP_PREFIX}license-entries-${year}${month}${day}-${hour}${minute}${second}.json`;
}

function buildBackupObjectMetadata(snapshot, checksumSha256 = "") {
  return {
    format: BACKUP_FORMAT,
    schema_version: String(BACKUP_SCHEMA_VERSION),
    created_at: snapshot.created_at,
    created_by: snapshot.created_by || "admin",
    source: snapshot.source || "r2",
    checksum_sha256: checksumSha256,
    license_entries_count: String(snapshot.row_counts?.license_entries || 0),
  };
}

function serializeBackupObject(object) {
  const metadata = object.customMetadata || {};
  const rowCounts = {
    license_entries: Number(metadata.license_entries_count || 0),
  };
  return {
    key: object.key,
    size: Number(object.size || 0),
    created_at: metadata.created_at || object.uploaded?.toISOString?.() || "",
    created_by: metadata.created_by || "admin",
    source: metadata.source || "r2",
    schema_version: Number(metadata.schema_version || BACKUP_SCHEMA_VERSION),
    checksum_sha256: metadata.checksum_sha256 || "",
    row_counts: rowCounts,
  };
}

async function computeSha256Hex(input) {
  const bytes = new TextEncoder().encode(String(input || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function validateBackupChecksum(rawPayload, expectedChecksum) {
  const checksumSha256 = await computeSha256Hex(rawPayload);
  const normalizedExpected = String(expectedChecksum || "").trim().toLowerCase();
  if (normalizedExpected && normalizedExpected !== checksumSha256) {
    return {
      ok: false,
      checksumSha256,
      error: {
        error: "checksum_mismatch",
        message: "Checksum backup tidak cocok dengan payload snapshot.",
      },
    };
  }
  return {
    ok: true,
    checksumSha256,
  };
}

function parseAndValidateBackupSnapshot(rawPayload) {
  const parsed = parseJsonSafe(rawPayload, null);
  if (!parsed || typeof parsed !== "object") {
    return {
      error: {
        error: "invalid_backup",
        message: "Format file backup tidak valid.",
      },
    };
  }
  if (parsed.format !== BACKUP_FORMAT) {
    return {
      error: {
        error: "invalid_backup",
        message: "Format snapshot backup tidak dikenali.",
      },
    };
  }
  if (Number(parsed.schema_version || 0) !== BACKUP_SCHEMA_VERSION) {
    return {
      error: {
        error: "unsupported_backup",
        message: "Versi schema snapshot backup tidak didukung.",
      },
    };
  }
  if (!parsed.tables || typeof parsed.tables !== "object") {
    return {
      error: {
        error: "invalid_backup",
        message: "Isi tabel snapshot backup tidak lengkap.",
      },
    };
  }

  const normalizedTables = {};
  const rowCounts = {};
  for (const table of BACKUP_TABLES) {
    const rows = parsed.tables[table.name];
    if (!Array.isArray(rows)) {
      return {
        error: {
          error: "invalid_backup",
          message: `Data tabel ${table.name} tidak valid.`,
        },
      };
    }
    normalizedTables[table.name] = rows.map((row) => sanitizeBackupRow(row || {}, table.columns));
    rowCounts[table.name] = normalizedTables[table.name].length;
  }

  return {
    value: {
      format: BACKUP_FORMAT,
      schema_version: BACKUP_SCHEMA_VERSION,
      created_at: String(parsed.created_at || "").trim() || nowIsoString(),
      created_by: String(parsed.created_by || "").trim() || "admin",
      source: String(parsed.source || "").trim() || "import",
      file_name: String(parsed.file_name || "").trim(),
      row_counts: rowCounts,
      tables: normalizedTables,
    },
  };
}

async function restoreBackupSnapshot(env, snapshot) {
  const deleteStatements = BACKUP_TABLES.map((table) => env.LICENSE_DB.prepare(`DELETE FROM ${table.name}`));
  await runBatchStatements(env, deleteStatements);

  for (const table of BACKUP_TABLES) {
    const rows = snapshot.tables[table.name] || [];
    if (!rows.length) {
      continue;
    }
    const insertSql = buildInsertStatement(table.name, table.columns);
    const statements = rows.map((row) =>
      env.LICENSE_DB.prepare(insertSql).bind(...table.columns.map((column) => normalizeBackupValue(row[column])))
    );
    await runBatchStatements(env, statements);
  }
}

function buildInsertStatement(tableName, columns) {
  const placeholders = columns.map(() => "?").join(", ");
  return `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`;
}

function normalizeBackupValue(value) {
  return value === undefined ? null : value;
}

async function runBatchStatements(env, statements) {
  if (!Array.isArray(statements) || !statements.length) {
    return [];
  }
  const chunkSize = 50;
  const results = [];
  for (let index = 0; index < statements.length; index += chunkSize) {
    const chunk = statements.slice(index, index + chunkSize);
    const chunkResults = await env.LICENSE_DB.batch(chunk);
    results.push(...chunkResults);
  }
  return results;
}

function getLicenseBackupBucket(env) {
  return env.LICENSE_BACKUPS || null;
}

function buildLicenseDecision(entry, env) {
  const nowIso = nowIsoString();
  const durationDays = getLicenseDurationDays(env);
  if (!entry) {
    return { allowed: false, reason: "ip not registered" };
  }
  if (entry.status === "revoked") {
    return { allowed: false, reason: "license revoked" };
  }
  if (entry.expires_at && entry.expires_at <= nowIso) {
    return { allowed: false, reason: "license expired" };
  }
  return {
    allowed: true,
    reason: `matched active entry${entry.label ? ` (${entry.label})` : ""}`,
    cacheTtlSec: parseIntSafe(env.CACHE_TTL_SEC_DEFAULT, 3600),
    licenseDurationDays: durationDays,
  };
}

function serializeLicenseEntry(row, nowIso = nowIsoString()) {
  const expiresAt = row.expires_at || "";
  const effectiveStatus = effectiveStatusForRow(row, nowIso);
  return {
    id: row.id,
    ip: row.ip,
    label: row.label || "",
    owner: row.owner || "",
    notes: row.notes || "",
    status: row.status || "active",
    effective_status: effectiveStatus,
    is_expired: effectiveStatus === "expired",
    expires_at: expiresAt,
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
    created_by: row.created_by || "",
    updated_by: row.updated_by || "",
    revoked_at: row.revoked_at || "",
    entry_source: row.entry_source || "admin",
    last_renewed_at: row.last_renewed_at || "",
    created_request_ip: row.created_request_ip || "",
    has_renewal_token: Boolean(row.renewal_token_hash),
  };
}

function serializePublicStatusEntry(row, nowIso = nowIsoString(), env = {}) {
  if (!row) {
    return {
      status: "not_found",
      allowed: false,
      ip: "",
      expires_at: "",
      days_remaining: 0,
      renewable: false,
      renew_open_before_days: getPublicRenewOpenBeforeDays(env),
      renew_opens_in_days: 0,
      detail_message: "IP ini belum terdaftar. Lanjutkan aktivasi untuk membuat lisensi baru.",
      next_action: buildPublicStatusAction("not_found", false, env, 0),
    };
  }
  const effectiveStatus = effectiveStatusForRow(row, nowIso);
  const daysRemaining = calculateDaysRemaining(row.expires_at || "", nowIso);
  const renewable = effectiveStatus === "active" && daysRemaining <= getPublicRenewOpenBeforeDays(env);
  const renewOpensInDays = effectiveStatus === "active" && !renewable
    ? Math.max(daysRemaining - getPublicRenewOpenBeforeDays(env), 0)
    : 0;
  const revokeReason = effectiveStatus === "revoked" ? extractRevokeReason(row.notes) : "";

  return {
    status: effectiveStatus,
    allowed: effectiveStatus === "active",
    ip: row.ip,
    label: row.label || "",
    expires_at: row.expires_at || "",
    days_remaining: daysRemaining,
    renewable,
    renew_open_before_days: getPublicRenewOpenBeforeDays(env),
    renew_opens_in_days: renewOpensInDays,
    detail_message: buildPublicStatusMessage(effectiveStatus, daysRemaining, getPublicRenewOpenBeforeDays(env), revokeReason),
    next_action: buildPublicStatusAction(effectiveStatus, renewable, env, renewOpensInDays),
  };
}

function serializePublicLookupStatusEntry(row, nowIso = nowIsoString(), env = {}, requestedIp = "") {
  if (!row) {
    return {
      ip: requestedIp,
      label: "",
      status: "not_found",
      allowed: false,
      renewable: false,
      expires_at: "",
      days_remaining: 0,
      renew_open_before_days: getPublicRenewOpenBeforeDays(env),
      renew_opens_in_days: 0,
      detail_message: "IP ini belum terdaftar. Lanjutkan aktivasi untuk membuat lisensi baru.",
      next_action: buildPublicStatusAction("not_found", false, env, 0),
    };
  }
  const effectiveStatus = effectiveStatusForRow(row, nowIso);
  const daysRemaining = calculateDaysRemaining(row.expires_at || "", nowIso);
  const renewable = effectiveStatus === "active" && daysRemaining <= getPublicRenewOpenBeforeDays(env);
  const renewOpensInDays = effectiveStatus === "active" && !renewable
    ? Math.max(daysRemaining - getPublicRenewOpenBeforeDays(env), 0)
    : 0;
  const revokeReason = effectiveStatus === "revoked" ? extractRevokeReason(row.notes) : "";

  return {
    ip: row.ip || requestedIp,
    label: row.label || "",
    status: effectiveStatus,
    allowed: effectiveStatus === "active",
    renewable,
    expires_at: row.expires_at || "",
    days_remaining: daysRemaining,
    renew_open_before_days: getPublicRenewOpenBeforeDays(env),
    renew_opens_in_days: renewOpensInDays,
    detail_message: buildPublicStatusMessage(effectiveStatus, daysRemaining, getPublicRenewOpenBeforeDays(env), revokeReason),
    next_action: buildPublicStatusAction(effectiveStatus, renewable, env, renewOpensInDays),
  };
}

function extractRevokeReason(notes) {
  if (!notes) return "";
  const match = notes.match(/\[REVOKE REASON: (.*?)\]/);
  return match ? match[1].trim() : "";
}

function buildPublicStatusMessage(status, daysRemaining, renewOpenBeforeDays, revokeReason = "") {
  if (status === "active" && daysRemaining <= renewOpenBeforeDays) {
    return `IP aktif. Renew publik sudah dibuka karena sisa aktif ${daysRemaining} hari.`;
  }
  if (status === "active") {
    return `IP aktif. Renew publik dibuka saat sisa aktif ${renewOpenBeforeDays} hari atau kurang.`;
  }
  if (status === "expired") {
    return "IP sudah expired. Lakukan aktivasi ulang untuk memperpanjang masa aktif.";
  }
  if (status === "revoked") {
    return `IP ini sedang diblokir${revokeReason ? ` (Alasan: ${revokeReason})` : ""}. Hubungi ${PUBLIC_LICENSE_SUPPORT_EMAIL} untuk bantuan lebih lanjut.`;
  }
  return "IP ini belum terdaftar. Lanjutkan aktivasi untuk membuat lisensi baru.";
}

function buildPublicStatusAction(status, renewable, _env = {}, renewOpensInDays = 0) {
  if (status === "revoked") {
    return {
      kind: "contact_support",
      label: "Hubungi Support",
      help: `Status diblokir. Hubungi ${PUBLIC_LICENSE_SUPPORT_EMAIL}.`,
      href: `mailto:${PUBLIC_LICENSE_SUPPORT_EMAIL}`,
    };
  }
  if (status === "expired" || status === "not_found") {
    return {
      kind: "activate",
      label: "Lanjut Proses IP",
      help: status === "expired" ? "IP sudah expired dan perlu aktivasi ulang." : "IP belum terdaftar dan perlu aktivasi baru.",
      href: "",
    };
  }
  if (status === "active" && renewable) {
    return {
      kind: "renew",
      label: "Lanjut Renew",
      help: "IP aktif dan sudah masuk jendela perpanjangan publik.",
      href: "",
    };
  }
  return {
    kind: "none",
    label: "",
    help: renewOpensInDays > 0 ? `Belum perlu tindakan. Renew publik dibuka sekitar ${renewOpensInDays} hari lagi.` : "Belum perlu tindakan.",
    href: "",
  };
}

function effectiveStatusForRow(row, nowIso) {
  if ((row.status || "active") === "revoked") {
    return "revoked";
  }
  if (row.expires_at && row.expires_at <= nowIso) {
    return "expired";
  }
  return row.status || "active";
}

function calculateDaysRemaining(expiresAt, nowIso) {
  if (!expiresAt) {
    return 0;
  }
  const diffMs = new Date(expiresAt).getTime() - new Date(nowIso).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return 0;
  }
  return Math.ceil(diffMs / 86400000);
}

function normalizeEntryPayload(raw) {
  const ip = normalizeIpv4(raw?.ip);
  if (!ip) {
    return { error: "IP harus IPv4 literal yang valid" };
  }
  const expiresAt = normalizeOptionalIsoDate(raw?.expires_at);
  if (raw?.expires_at && !expiresAt) {
    return { error: "expires_at harus ISO datetime yang valid atau kosong" };
  }
  return {
    entry: {
      ip,
      label: normalizeShortText(raw?.label, 120),
      owner: normalizeShortText(raw?.owner, 120),
      notes: normalizeLongText(raw?.notes, 2000),
      expiresAt,
    },
  };
}

function normalizeStatusFilter(value) {
  const raw = String(value || "all").trim().toLowerCase();
  if (raw === "active" || raw === "revoked" || raw === "expired") {
    return raw;
  }
  return "all";
}

function normalizeStage(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["run", "setup", "manage", "runtime"].includes(raw)) {
    return raw;
  }
  return raw || "runtime";
}

function normalizeIpv4(value) {
  const raw = String(value || "").trim();
  if (!IPV4_RE.test(raw)) {
    return "";
  }
  const parts = raw.split(".").map((item) => Number(item));
  if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return "";
  }
  return parts.join(".");
}

function normalizeShortText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeLongText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeOptionalIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function isTruthyQueryValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function startOfUtcDayIso(daysAgo = 0) {
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() - Math.max(0, Number(daysAgo) || 0));
  return base.toISOString();
}

async function enforcePublicRateLimit(env, endpoint, clientIp, maxRequests, windowSec) {
  const normalizedClientIp = String(clientIp || "").trim() || "unknown";
  const slot = Math.floor(Date.now() / 1000 / windowSec);
  await runStatement(
    env,
    `
      INSERT INTO public_rate_limits (endpoint, client_ip, window_slot, request_count, updated_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(endpoint, client_ip, window_slot)
      DO UPDATE SET
        request_count = public_rate_limits.request_count + 1,
        updated_at = excluded.updated_at
    `,
    [endpoint, normalizedClientIp, slot, nowIsoString()]
  );
  const current = await firstRow(
    env,
    `
      SELECT request_count
      FROM public_rate_limits
      WHERE endpoint = ? AND client_ip = ? AND window_slot = ?
      LIMIT 1
    `,
    [endpoint, normalizedClientIp, slot]
  );
  const requestCount = Number(current?.request_count || 0);

  const nowSec = Math.floor(Date.now() / 1000);
  const retryAfterSec = Math.max(1, slot * windowSec + windowSec - nowSec);
  return {
    allowed: requestCount <= maxRequests,
    requestCount,
    retryAfterSec,
  };
}

async function enforcePublicTargetRateLimit(env, endpoint, targetIp, maxRequests, windowSec) {
  const normalizedTargetIp = String(targetIp || "").trim() || "unknown";
  const slot = Math.floor(Date.now() / 1000 / windowSec);
  await runStatement(
    env,
    `
      INSERT INTO public_target_rate_limits (endpoint, target_ip, window_slot, request_count, updated_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(endpoint, target_ip, window_slot)
      DO UPDATE SET
        request_count = public_target_rate_limits.request_count + 1,
        updated_at = excluded.updated_at
    `,
    [endpoint, normalizedTargetIp, slot, nowIsoString()]
  );
  const current = await firstRow(
    env,
    `
      SELECT request_count
      FROM public_target_rate_limits
      WHERE endpoint = ? AND target_ip = ? AND window_slot = ?
      LIMIT 1
    `,
    [endpoint, normalizedTargetIp, slot]
  );
  const requestCount = Number(current?.request_count || 0);
  const nowSec = Math.floor(Date.now() / 1000);
  const retryAfterSec = Math.max(1, slot * windowSec + windowSec - nowSec);
  return {
    allowed: requestCount <= maxRequests,
    requestCount,
    retryAfterSec,
  };
}

async function verifyPublicTurnstileChallenge(env, request, token, publicIp, eventBase) {
  const siteKey = getPublicTurnstileSiteKey(env);
  const secretKey = String(env.PUBLIC_TURNSTILE_SECRET_KEY || "").trim();
  const visitorIp = getVisitorIp(request);

  if (!siteKey || !secretKey) {
    await insertAuditLog(env, {
      eventType: `${eventBase}_challenge_unavailable`,
      ip: publicIp,
      entryId: "",
      stage: "public",
      decision: "deny",
      actorEmail: "",
      requestIp: visitorIp,
      userAgent: request.headers.get("User-Agent") || "",
      payload: {
        reason: "turnstile_not_configured",
      },
    });
    return {
      ok: false,
      response: jsonResponse(
        {
          error: "service_unavailable",
          message: "Verifikasi keamanan belum siap. Coba lagi nanti.",
        },
        503
      ),
    };
  }

  if (!token) {
    await insertAuditLog(env, {
      eventType: `${eventBase}_challenge_failed`,
      ip: publicIp,
      entryId: "",
      stage: "public",
      decision: "deny",
      actorEmail: "",
      requestIp: visitorIp,
      userAgent: request.headers.get("User-Agent") || "",
      payload: {
        reason: "turnstile_missing",
      },
    });
    return {
      ok: false,
      response: jsonResponse(
        {
          error: "challenge_required",
          message: "Selesaikan verifikasi keamanan sebelum mengirim IP.",
        },
        400
      ),
    };
  }

  let verifyPayload = null;
  try {
    const body = new URLSearchParams();
    body.set("secret", secretKey);
    body.set("response", token);
    if (visitorIp) {
      body.set("remoteip", String(visitorIp));
    }
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    verifyPayload = await response.json();
  } catch (_error) {
    await insertAuditLog(env, {
      eventType: `${eventBase}_challenge_failed`,
      ip: publicIp,
      entryId: "",
      stage: "public",
      decision: "deny",
      actorEmail: "",
      requestIp: visitorIp,
      userAgent: request.headers.get("User-Agent") || "",
      payload: {
        reason: "turnstile_fetch_failed",
      },
    });
    return {
      ok: false,
      response: jsonResponse(
        {
          error: "challenge_unavailable",
          message: "Verifikasi keamanan sedang bermasalah. Coba lagi nanti.",
        },
        502
      ),
    };
  }

  if (!verifyPayload?.success) {
    await insertAuditLog(env, {
      eventType: `${eventBase}_challenge_failed`,
      ip: publicIp,
      entryId: "",
      stage: "public",
      decision: "deny",
      actorEmail: "",
      requestIp: visitorIp,
      userAgent: request.headers.get("User-Agent") || "",
      payload: {
        error_codes: Array.isArray(verifyPayload?.["error-codes"]) ? verifyPayload["error-codes"] : [],
        reason: "turnstile_invalid",
      },
    });
    return {
      ok: false,
      response: jsonResponse(
        {
          error: "challenge_failed",
          message: "Verifikasi keamanan gagal atau sudah kedaluwarsa. Coba lagi.",
        },
        403
      ),
    };
  }

  return { ok: true };
}

async function extendPublicLicenseEntry(env, entryId, nowIso, durationDays, updatedBy) {
  return runStatement(
    env,
    `
      UPDATE license_entries
      SET
        expires_at = CASE
          WHEN expires_at IS NOT NULL AND expires_at != '' AND expires_at > ?
            THEN strftime('%Y-%m-%dT%H:%M:%fZ', datetime(expires_at, '+' || ? || ' days'))
          ELSE strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, '+' || ? || ' days'))
        END,
        updated_at = ?,
        updated_by = ?,
        last_renewed_at = ?
      WHERE id = ? AND status != 'revoked'
    `,
    [nowIso, durationDays, nowIso, durationDays, nowIso, updatedBy, nowIso, entryId]
  );
}

async function refreshExpiredPublicLicenseEntry(env, entryId, nowIso, durationDays, updatedBy) {
  return runStatement(
    env,
    `
      UPDATE license_entries
      SET
        status = 'active',
        expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', datetime(?, '+' || ? || ' days')),
        updated_at = ?,
        updated_by = ?,
        revoked_at = NULL,
        last_renewed_at = ?
      WHERE id = ? AND status != 'revoked'
    `,
    [nowIso, durationDays, nowIso, updatedBy, nowIso, entryId]
  );
}

async function getLicenseEntryByIp(env, ip) {
  return firstRow(
    env,
    `
      SELECT
        id, ip, label, owner, notes, status, expires_at,
        created_at, updated_at, created_by, updated_by, revoked_at,
        entry_source, renewal_token_hash, last_renewed_at, created_request_ip
      FROM license_entries
      WHERE ip = ?
      LIMIT 1
    `,
    [ip]
  );
}

async function getLicenseEntryById(env, id) {
  return firstRow(
    env,
    `
      SELECT
        id, ip, label, owner, notes, status, expires_at,
        created_at, updated_at, created_by, updated_by, revoked_at,
        entry_source, renewal_token_hash, last_renewed_at, created_request_ip
      FROM license_entries
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  );
}

async function insertAuditLog(env, data) {
  await runStatement(
    env,
    `
      INSERT INTO audit_logs (
        id, event_type, ip, entry_id, stage, decision, actor_email, request_ip, user_agent, payload_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      crypto.randomUUID(),
      data.eventType,
      data.ip || "",
      data.entryId || null,
      data.stage || "",
      data.decision || "",
      data.actorEmail || "",
      data.requestIp || "",
      data.userAgent || "",
      JSON.stringify(data.payload || {}),
      nowIsoString(),
    ]
  );
}

async function parseJsonBody(request) {
  try {
    const data = await request.json();
    return { data };
  } catch (_error) {
    return {
      error: jsonResponse({ error: "invalid_json", message: "Body JSON tidak valid" }, 400),
    };
  }
}

async function firstRow(env, sql, binds = []) {
  const stmt = env.LICENSE_DB.prepare(sql).bind(...binds);
  return stmt.first();
}

async function allRows(env, sql, binds = []) {
  const stmt = env.LICENSE_DB.prepare(sql).bind(...binds);
  const result = await stmt.all();
  return Array.isArray(result.results) ? result.results : [];
}

async function runStatement(env, sql, binds = []) {
  const stmt = env.LICENSE_DB.prepare(sql).bind(...binds);
  return stmt.run();
}

async function runScheduledMaintenance(env, scheduledTimeMs) {
  const nowIso = new Date(scheduledTimeMs || Date.now()).toISOString();
  const auditRetentionDays = parseIntSafe(env.AUDIT_LOG_RETENTION_DAYS, 30);
  const rateLimitRetentionDays = parseIntSafe(env.PUBLIC_RATE_LIMIT_RETENTION_DAYS, 7);
  const backupRetentionDays = parseIntSafe(env.BACKUP_RETENTION_DAYS, 30);
  const backupRetentionDaysManual = parseIntSafe(env.BACKUP_RETENTION_DAYS_MANUAL, 90);
  const backupRetentionDaysScheduled = parseIntSafe(env.BACKUP_RETENTION_DAYS_SCHEDULED, backupRetentionDays);
  const backupAutoEnabled = String(env.BACKUP_AUTO_ENABLED || "true").trim().toLowerCase() !== "false";
  const backupAutoMinIntervalHours = Math.max(1, parseIntSafe(env.BACKUP_AUTO_MIN_INTERVAL_HOURS, 24));
  const auditCutoffIso = addDaysIso(nowIso, -auditRetentionDays);
  const rateLimitCutoffIso = addDaysIso(nowIso, -rateLimitRetentionDays);
  const backupCutoffIso = addDaysIso(nowIso, -backupRetentionDays);
  const backupCutoffIsoManual = addDaysIso(nowIso, -backupRetentionDaysManual);
  const backupCutoffIsoScheduled = addDaysIso(nowIso, -backupRetentionDaysScheduled);

  const auditResult = await runStatement(
    env,
    `
      DELETE FROM audit_logs
      WHERE created_at != '' AND created_at < ?
    `,
    [auditCutoffIso]
  );
  const rateLimitResult = await runStatement(
    env,
    `
      DELETE FROM public_rate_limits
      WHERE updated_at != '' AND updated_at < ?
    `,
    [rateLimitCutoffIso]
  );
  const targetRateLimitResult = await runStatement(
    env,
    `
      DELETE FROM public_target_rate_limits
      WHERE updated_at != '' AND updated_at < ?
    `,
    [rateLimitCutoffIso]
  );

  const backupMaintenance = await maintainBackupSnapshots(env, {
    nowIso,
    backupCutoffIso,
    backupCutoffIsoManual,
    backupCutoffIsoScheduled,
    backupAutoEnabled,
    backupAutoMinIntervalHours,
  });

  console.log(
    JSON.stringify({
      audit_cutoff_iso: auditCutoffIso,
      audit_deleted: statementChanges(auditResult),
      backup_auto_created: backupMaintenance.created ? backupMaintenance.created.key : "",
      backup_auto_enabled: backupAutoEnabled,
      backup_cutoff_iso: backupCutoffIso,
      backup_cutoff_iso_manual: backupCutoffIsoManual,
      backup_cutoff_iso_scheduled: backupCutoffIsoScheduled,
      backup_deleted: backupMaintenance.deletedCount,
      event: "scheduled_maintenance",
      now_iso: nowIso,
      rate_limit_cutoff_iso: rateLimitCutoffIso,
      rate_limit_deleted: statementChanges(rateLimitResult),
      target_rate_limit_deleted: statementChanges(targetRateLimitResult),
    })
  );
}

async function maintainBackupSnapshots(env, options = {}) {
  const bucket = getLicenseBackupBucket(env);
  if (!bucket) {
    return {
      created: null,
      deletedCount: 0,
    };
  }

  const listed = await bucket.list({
    prefix: BACKUP_PREFIX,
    limit: 1000,
  });
  const objects = Array.isArray(listed.objects) ? listed.objects : [];
  const backupCutoffMs = Date.parse(String(options.backupCutoffIso || ""));
  const backupCutoffMsManual = Date.parse(String(options.backupCutoffIsoManual || options.backupCutoffIso || ""));
  const backupCutoffMsScheduled = Date.parse(String(options.backupCutoffIsoScheduled || options.backupCutoffIso || ""));
  let deletedCount = 0;

  for (const object of objects) {
    const source = String(object.customMetadata?.source || "").trim().toLowerCase();
    const createdAt = object.customMetadata?.created_at || object.uploaded?.toISOString?.() || "";
    const createdMs = Date.parse(createdAt);
    const effectiveCutoffMs =
      source === "scheduled"
        ? backupCutoffMsScheduled
        : source === "r2" || source === "manual"
          ? backupCutoffMsManual
          : backupCutoffMs;
    if (Number.isFinite(effectiveCutoffMs) && Number.isFinite(createdMs) && createdMs < effectiveCutoffMs) {
      await bucket.delete(object.key);
      deletedCount += 1;
    }
  }

  let created = null;
  if (options.backupAutoEnabled) {
    const latestObject = objects
      .filter((object) => {
        const createdAt = object.customMetadata?.created_at || object.uploaded?.toISOString?.() || "";
        const createdMs = Date.parse(createdAt);
        return Number.isFinite(createdMs) && !(Number.isFinite(backupCutoffMs) && createdMs < backupCutoffMs);
      })
      .sort((left, right) => {
        const leftMs = Date.parse(left.customMetadata?.created_at || left.uploaded?.toISOString?.() || "");
        const rightMs = Date.parse(right.customMetadata?.created_at || right.uploaded?.toISOString?.() || "");
        return rightMs - leftMs;
      })[0];

    const latestCreatedMs = latestObject
      ? Date.parse(latestObject.customMetadata?.created_at || latestObject.uploaded?.toISOString?.() || "")
      : NaN;
    const nowMs = Date.parse(String(options.nowIso || ""));
    const minIntervalMs = Math.max(1, Number(options.backupAutoMinIntervalHours || 24)) * 3600 * 1000;
    const shouldCreate = !Number.isFinite(latestCreatedMs) || !Number.isFinite(nowMs) || nowMs - latestCreatedMs >= minIntervalMs;

    if (shouldCreate) {
      const snapshot = await buildBackupSnapshot(env, BACKUP_AUTO_ACTOR, "scheduled");
      const key = buildBackupObjectKey(snapshot.created_at, BACKUP_AUTO_ACTOR);
      const body = JSON.stringify(snapshot, null, 2);
      const checksumSha256 = await computeSha256Hex(body);
      const metadata = buildBackupObjectMetadata(snapshot, checksumSha256);
      await bucket.put(key, body, {
        httpMetadata: {
          contentType: "application/json; charset=utf-8",
        },
        customMetadata: metadata,
      });
      created = {
        key,
        created_at: snapshot.created_at,
      };
    }
  }

  return {
    created,
    deletedCount,
  };
}

function buildPublicCorsResponse(request, env) {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(request, env, {
      origin: String(env.PUBLIC_UI_ORIGIN || "").trim(),
      allowHeaders: "Content-Type",
      allowMethods: "GET, POST, OPTIONS",
      allowCredentials: false,
    }),
  });
}

function withPublicCors(request, env, response) {
  return withCors(
    request,
    env,
    response,
    {
      origin: String(env.PUBLIC_UI_ORIGIN || "").trim(),
      allowHeaders: "Content-Type",
      allowMethods: "GET, POST, OPTIONS",
      allowCredentials: false,
    }
  );
}

function buildAdminCorsResponse(request, env) {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(request, env, {
      origin: getAdminUiOrigin(env),
      allowHeaders: "Authorization, Content-Type",
      allowMethods: "GET, POST, PATCH, DELETE, OPTIONS",
      allowCredentials: false,
    }),
  });
}

function withAdminCors(request, env, response) {
  return withCors(request, env, response, {
    origin: getAdminUiOrigin(env),
    allowHeaders: "Authorization, Content-Type",
    allowMethods: "GET, POST, PATCH, DELETE, OPTIONS",
    allowCredentials: false,
  });
}

function withCors(request, env, response, options) {
  const headers = new Headers(response.headers);
  const cors = buildCorsHeaders(request, env, options);
  cors.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function buildCorsHeaders(request, _env, options) {
  const requestOrigin = request.headers.get("Origin") || "";
  const allowedOrigin = resolveAllowedOrigin(requestOrigin, options.origin);
  const headers = buildApiSecurityHeaders({
    "Access-Control-Allow-Headers": options.allowHeaders,
    "Access-Control-Allow-Methods": options.allowMethods,
    "Access-Control-Allow-Origin": allowedOrigin,
    "Vary": "Origin",
  });
  if (options.allowCredentials) {
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  return headers;
}

function getAdminUiOrigin(env) {
  return String(env.ADMIN_UI_ORIGIN || env.PUBLIC_UI_ORIGIN || "").trim();
}

function resolveAllowedOrigin(requestOrigin, configuredOrigins) {
  const allowedOrigins = parseAllowedOrigins(configuredOrigins);
  if (!allowedOrigins.length) {
    return requestOrigin || "*";
  }
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  return allowedOrigins[0];
}

function parseAllowedOrigins(value) {
  return String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  const headers = buildApiSecurityHeaders(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers,
  });
}

function buildApiSecurityHeaders(extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return headers;
}

function parseIntSafe(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function statementChanges(result) {
  const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);
  if (Number.isFinite(changes) && changes >= 0) {
    return changes;
  }
  return 0;
}

function getLicenseDurationDays(env) {
  return parseIntSafe(env.PUBLIC_LICENSE_DURATION_DAYS, 14);
}

function getPublicRenewOpenBeforeDays(_env) {
  return PUBLIC_RENEW_OPEN_BEFORE_DAYS;
}

function getPublicTurnstileSiteKey(env) {
  const siteKey = String(env.PUBLIC_TURNSTILE_SITE_KEY || "").trim();
  const secretKey = String(env.PUBLIC_TURNSTILE_SECRET_KEY || "").trim();
  if (!siteKey || !secretKey) {
    return "";
  }
  return siteKey;
}

function nowIsoString() {
  return new Date().toISOString();
}

function parseJsonSafe(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function decodeBasicAuth(encoded) {
  try {
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return null;
    }
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch (_error) {
    return null;
  }
}

function getAdminProxySharedSecret(env) {
  return String(env.ADMIN_PROXY_SHARED_SECRET || "autoscript-license").trim();
}

function getVisitorIp(request) {
  return String(request.headers.get("CF-Connecting-IP") || "").trim();
}

function getAdminRequestIp(request) {
  return String(request.headers.get("X-Admin-Request-Ip") || "").trim() || getVisitorIp(request);
}

function getAdminUserAgent(request) {
  return String(request.headers.get("X-Admin-User-Agent") || request.headers.get("User-Agent") || "").trim();
}

function addDaysIso(baseIso, days) {
  const parsed = new Date(baseIso);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString();
}

function extendExpiryIso(existingIso, nowIso, days) {
  const base = existingIso && existingIso > nowIso ? existingIso : nowIso;
  return addDaysIso(base, days);
}
