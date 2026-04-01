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
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
  return context.next();
}
