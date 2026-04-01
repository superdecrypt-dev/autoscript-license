const BLOCKED_LEGACY_PATHS = new Set([
  "/public.js",
  "/public.css",
  "/config.js",
  "/app.js",
  "/styles.css",
]);

export async function onRequest(context) {
  const pathname = new URL(context.request.url).pathname;
  if (BLOCKED_LEGACY_PATHS.has(pathname)) {
    return new Response("Not Found", {
      status: 404,
      headers: buildBlockedResponseHeaders({
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "text/plain; charset=utf-8",
      }),
    });
  }
  return context.next();
}

function buildBlockedResponseHeaders(extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return headers;
}
