function parseInlineConfig(id) {
  const node = document.getElementById(id);
  if (!node?.textContent) return {};
  try {
    return JSON.parse(node.textContent);
  } catch (_error) {
    return {};
  }
}

function normalizeOrigin(value, fallback = window.location.origin) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return fallback;
  try {
    return new URL(raw).origin;
  } catch (_error) {
    return fallback;
  }
}

export function getPortalFallbackConfig() {
  return window.AUTOSCRIPT_PORTAL_CONFIG || {};
}

export function getPublicConfig() {
  const inline = parseInlineConfig("portal-config");
  const fallback = getPortalFallbackConfig();
  return {
    apiBaseUrl: normalizeOrigin(inline.apiBaseUrl || fallback.apiBaseUrl),
    turnstileSiteKey: String(inline.turnstileSiteKey || fallback.turnstileSiteKey || "").trim(),
  };
}

export function getAdminConfig() {
  const inline = parseInlineConfig("admin-config");
  const fallback = getPortalFallbackConfig();
  return {
    adminApiBaseUrl: normalizeOrigin(inline.adminApiBaseUrl || fallback.adminApiBaseUrl),
  };
}
