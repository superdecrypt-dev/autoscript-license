export async function onRequest(context) {
  const { request, env } = context;
  const requestUrl = new URL(request.url);
  if (request.method === "OPTIONS") {
    return buildPreflightResponse(request, env);
  }
  const actorEmail = await resolveAccessActorEmail(request);
  if (!actorEmail) {
    return jsonResponse(
      {
        error: "unauthorized",
        message: "Cloudflare Access identity tidak tersedia.",
      },
      401,
      request,
      env
    );
  }

  const upstreamBaseUrl = normalizeOrigin(env.PAGES_API_BASE_URL || "");
  const proxySecret = String(env.ADMIN_PROXY_SHARED_SECRET || "").trim();
  if (!upstreamBaseUrl || !proxySecret) {
    return jsonResponse(
      {
        error: "misconfigured",
        message: "Proxy admin belum dikonfigurasi. Isi PAGES_API_BASE_URL dan ADMIN_PROXY_SHARED_SECRET.",
      },
      503,
      request,
      env
    );
  }

  const upstreamMethod = resolveUpstreamMethod(request, requestUrl);
  requestUrl.searchParams.delete("__proxy_method");
  const upstreamUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, upstreamBaseUrl);
  const headers = new Headers();
  const contentType = request.headers.get("Content-Type");
  const userAgent = request.headers.get("User-Agent");
  const requestIp = request.headers.get("CF-Connecting-IP");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  if (userAgent) {
    headers.set("X-Admin-User-Agent", userAgent);
  }
  if (requestIp) {
    headers.set("X-Admin-Request-Ip", requestIp);
  }
  headers.set("X-Admin-Actor-Email", actorEmail);
  headers.set("X-Admin-Proxy-Secret", proxySecret);

  const init = {
    method: upstreamMethod,
    headers,
  };
  if (!["GET", "HEAD"].includes(upstreamMethod)) {
    init.body = await request.text();
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), init);
    return withAdminProxySecurityHeaders(upstreamResponse, request, env);
  } catch (_error) {
    return jsonResponse(
      {
        error: "upstream_unavailable",
        message: "Admin upstream tidak dapat dihubungi.",
      },
      502,
      request,
      env
    );
  }
}

async function resolveAccessActorEmail(request) {
  const directHeader = String(
    request.headers.get("CF-Access-Authenticated-User-Email") ||
      request.headers.get("Cf-Access-Authenticated-User-Email") ||
      ""
  ).trim();
  if (directHeader) {
    return directHeader;
  }

  const cookie = request.headers.get("Cookie");
  if (!cookie) {
    return "";
  }

  try {
    const identityUrl = new URL("/cdn-cgi/access/get-identity", request.url);
    const response = await fetch(identityUrl.toString(), {
      headers: {
        Cookie: cookie,
      },
    });
    if (!response.ok) {
      return "";
    }
    const payload = await response.json();
    return String(payload?.email || payload?.identity?.email || "").trim();
  } catch (_error) {
    return "";
  }
}

function normalizeOrigin(value) {
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

function jsonResponse(payload, status = 200, request, env) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: buildAdminApiSecurityHeaders({
      "Content-Type": "application/json; charset=utf-8",
    }, request, env),
  });
}

function withAdminProxySecurityHeaders(response, request, env) {
  const headers = buildAdminApiSecurityHeaders(response.headers, request, env);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function buildAdminApiSecurityHeaders(extraHeaders = {}, request, env) {
  const headers = new Headers(extraHeaders);
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  applyCorsHeaders(headers, request, env);
  return headers;
}

function buildPreflightResponse(request, env) {
  const headers = buildAdminApiSecurityHeaders({}, request, env);
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin, request, env)) {
    return new Response(null, {
      status: 403,
      headers,
    });
  }
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(null, {
    status: 204,
    headers,
  });
}

function resolveUpstreamMethod(request, requestUrl) {
  if (request.method !== "POST") {
    return request.method;
  }
  const override = String(requestUrl.searchParams.get("__proxy_method") || "")
    .trim()
    .toUpperCase();
  if (["POST", "PATCH", "DELETE", "PUT"].includes(override)) {
    return override;
  }
  return request.method;
}

function applyCorsHeaders(headers, request, env) {
  const origin = request?.headers?.get("Origin");
  if (!isAllowedOrigin(origin, request, env)) {
    return;
  }
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.append("Vary", "Origin");
}

function isAllowedOrigin(origin, request, env) {
  const normalizedOrigin = normalizeOrigin(origin || "");
  if (!normalizedOrigin) {
    return false;
  }
  const requestOrigin = normalizeOrigin(request?.url || "");
  if (normalizedOrigin === requestOrigin) {
    return true;
  }
  const configuredOrigins = String(env?.PAGES_ADMIN_APP_ORIGINS || "")
    .split(",")
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);
  return configuredOrigins.includes(normalizedOrigin);
}
