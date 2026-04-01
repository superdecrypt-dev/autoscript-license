const DEFAULT_ADMIN_PROXY_UPSTREAM = "https://autoscript-license.minidecrypt.workers.dev";
const DEFAULT_ADMIN_PROXY_SHARED_SECRET = "autoscript-license";

export async function onRequest(context) {
  const { request, env } = context;
  const actorEmail = String(request.headers.get("CF-Access-Authenticated-User-Email") || "").trim();
  if (!actorEmail) {
    return jsonResponse(
      {
        error: "unauthorized",
        message: "Cloudflare Access identity tidak tersedia.",
      },
      401
    );
  }

  const upstreamBaseUrl = normalizeOrigin(env.PAGES_API_BASE_URL || DEFAULT_ADMIN_PROXY_UPSTREAM);
  const proxySecret = String(env.ADMIN_PROXY_SHARED_SECRET || DEFAULT_ADMIN_PROXY_SHARED_SECRET).trim();
  if (!upstreamBaseUrl || !proxySecret) {
    return jsonResponse(
      {
        error: "misconfigured",
        message: "Proxy admin belum dikonfigurasi.",
      },
      503
    );
  }

  const requestUrl = new URL(request.url);
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
    method: request.method,
    headers,
  };
  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = await request.text();
  }

  const upstreamResponse = await fetch(upstreamUrl.toString(), init);
  return withAdminProxySecurityHeaders(upstreamResponse);
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

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: buildAdminApiSecurityHeaders({
      "Content-Type": "application/json; charset=utf-8",
    }),
  });
}

function withAdminProxySecurityHeaders(response) {
  const headers = buildAdminApiSecurityHeaders(response.headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function buildAdminApiSecurityHeaders(extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return headers;
}
