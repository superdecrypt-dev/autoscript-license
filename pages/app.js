const state = {
  apiBaseUrl:
    localStorage.getItem("autoscriptLicenseApiBaseUrl") ||
    (window.AUTOSCRIPT_PORTAL_CONFIG?.apiBaseUrl || "").replace(/\/+$/, ""),
  adminEmail: localStorage.getItem("autoscriptLicenseAdminEmail") || "",
  adminPassword: sessionStorage.getItem("autoscriptLicenseAdminPassword") || "",
  entries: [],
  auditLogs: [],
  metrics: null,
  session: null,
  metricsWindowDays: localStorage.getItem("autoscriptLicenseMetricsWindowDays") || "14",
};

const dom = {
  apiBaseInput: document.getElementById("api-base-input"),
  adminEmailInput: document.getElementById("admin-email-input"),
  adminPasswordInput: document.getElementById("admin-password-input"),
  connectBtn: document.getElementById("connect-btn"),
  clearAuthBtn: document.getElementById("clear-auth-btn"),
  refreshDashboardBtn: document.getElementById("refresh-dashboard-btn"),
  refreshAuditBtn: document.getElementById("refresh-audit-btn"),
  refreshMetricsBtn: document.getElementById("refresh-metrics-btn"),
  resetFormBtn: document.getElementById("reset-form-btn"),
  cancelEditBtn: document.getElementById("cancel-edit-btn"),
  metricsWindow: document.getElementById("metrics-window"),
  auditIpInput: document.getElementById("audit-ip-input"),
  auditEventInput: document.getElementById("audit-event-input"),
  statusBanner: document.getElementById("status-banner"),
  sessionBadge: document.getElementById("session-badge"),
  metricActive: document.getElementById("metric-active"),
  metricExpired: document.getElementById("metric-expired"),
  metricRevoked: document.getElementById("metric-revoked"),
  metricAudit: document.getElementById("metric-audit"),
  metricChecksAllowed: document.getElementById("metric-checks-allowed"),
  metricChecksDenied: document.getElementById("metric-checks-denied"),
  metricPublicActivations: document.getElementById("metric-public-activations"),
  metricPublicRenewals: document.getElementById("metric-public-renewals"),
  searchInput: document.getElementById("search-input"),
  statusFilter: document.getElementById("status-filter"),
  entriesBody: document.getElementById("entries-body"),
  auditBody: document.getElementById("audit-body"),
  checksChart: document.getElementById("checks-chart"),
  mutationsChart: document.getElementById("mutations-chart"),
  checksChartCaption: document.getElementById("checks-chart-caption"),
  mutationsChartCaption: document.getElementById("mutations-chart-caption"),
  topEvents: document.getElementById("top-events"),
  entrySourceSummary: document.getElementById("entry-source-summary"),
  form: document.getElementById("entry-form"),
  formTitle: document.getElementById("form-title"),
  entryId: document.getElementById("entry-id"),
  fieldIp: document.getElementById("field-ip"),
  fieldLabel: document.getElementById("field-label"),
  fieldOwner: document.getElementById("field-owner"),
  fieldExpiresAt: document.getElementById("field-expires-at"),
  fieldNotes: document.getElementById("field-notes"),
  submitEntryBtn: document.getElementById("submit-entry-btn"),
};

bootstrap();

function bootstrap() {
  dom.apiBaseInput.value = state.apiBaseUrl;
  dom.adminEmailInput.value = state.adminEmail;
  dom.adminPasswordInput.value = state.adminPassword;
  dom.metricsWindow.value = state.metricsWindowDays;
  bindEvents();
  refreshVisuals();
  if (state.apiBaseUrl && state.adminEmail && state.adminPassword) {
    refreshDashboard();
  }
}

function bindEvents() {
  dom.connectBtn.addEventListener("click", handleConnect);
  dom.clearAuthBtn.addEventListener("click", handleClearAuth);
  dom.refreshDashboardBtn.addEventListener("click", refreshDashboard);
  dom.refreshAuditBtn.addEventListener("click", refreshAuditLogs);
  dom.refreshMetricsBtn.addEventListener("click", refreshMetrics);
  dom.resetFormBtn.addEventListener("click", resetForm);
  dom.cancelEditBtn.addEventListener("click", resetForm);
  dom.form.addEventListener("submit", handleSubmitEntry);
  dom.searchInput.addEventListener("input", refreshEntries);
  dom.statusFilter.addEventListener("change", refreshEntries);
  dom.metricsWindow.addEventListener("change", handleMetricsWindowChange);
  dom.auditIpInput.addEventListener("input", refreshAuditLogs);
  dom.auditEventInput.addEventListener("input", refreshAuditLogs);
}

async function handleConnect() {
  const candidate = normalizeApiBase(dom.apiBaseInput.value);
  const adminEmail = dom.adminEmailInput.value.trim();
  const adminPassword = dom.adminPasswordInput.value;
  if (!candidate) {
    setBanner("Masukkan Worker API Base URL yang valid.", "error");
    return;
  }
  if (!adminEmail || !adminPassword) {
    setBanner("Masukkan email dan password admin terlebih dahulu.", "error");
    return;
  }
  state.apiBaseUrl = candidate;
  state.adminEmail = adminEmail;
  state.adminPassword = adminPassword;
  localStorage.setItem("autoscriptLicenseApiBaseUrl", candidate);
  localStorage.setItem("autoscriptLicenseAdminEmail", adminEmail);
  sessionStorage.setItem("autoscriptLicenseAdminPassword", adminPassword);
  setBanner("Konfigurasi admin disimpan. Mencoba koneksi...", "muted");
  await refreshDashboard();
}

function handleClearAuth() {
  state.adminEmail = "";
  state.adminPassword = "";
  state.session = null;
  state.entries = [];
  state.auditLogs = [];
  localStorage.removeItem("autoscriptLicenseAdminEmail");
  sessionStorage.removeItem("autoscriptLicenseAdminPassword");
  dom.adminEmailInput.value = "";
  dom.adminPasswordInput.value = "";
  dom.sessionBadge.textContent = "Signed Out";
  dom.sessionBadge.className = "session-badge muted";
  setBanner("Kredensial admin dihapus dari browser ini.", "muted");
  refreshVisuals();
}

async function refreshDashboard() {
  if (!ensureConnectionSettings()) {
    return;
  }
  try {
    const [session, entriesPayload, auditPayload, metricsPayload] = await Promise.all([
      apiFetch("/api/admin/session"),
      fetchEntries(),
      fetchAuditLogs(),
      fetchMetrics(),
    ]);
    state.session = session;
    state.entries = entriesPayload.items || [];
    state.auditLogs = auditPayload.items || [];
    state.metrics = metricsPayload;
    setBanner(`Connected as ${session.admin_email || "admin"}`, "ok");
    dom.sessionBadge.textContent = session.admin_email || "Access Verified";
    dom.sessionBadge.className = "session-badge ok";
    refreshVisuals();
  } catch (error) {
    state.session = null;
    state.entries = [];
    state.auditLogs = [];
    state.metrics = null;
    dom.sessionBadge.textContent = "Connection Failed";
    dom.sessionBadge.className = "session-badge error";
    setBanner(error.message || "Gagal mengambil data dari Worker API.", "error");
    refreshVisuals();
  }
}

async function refreshEntries() {
  if (!ensureConnectionSettings()) {
    return;
  }
  try {
    const payload = await fetchEntries();
    state.entries = payload.items || [];
    refreshVisuals();
  } catch (error) {
    setBanner(error.message || "Gagal refresh daftar IP.", "error");
  }
}

async function refreshAuditLogs() {
  if (!ensureConnectionSettings()) {
    return;
  }
  try {
    const payload = await fetchAuditLogs();
    state.auditLogs = payload.items || [];
    refreshVisuals();
  } catch (error) {
    setBanner(error.message || "Gagal refresh audit log.", "error");
  }
}

async function refreshMetrics() {
  if (!ensureConnectionSettings()) {
    return;
  }
  try {
    const payload = await fetchMetrics();
    state.metrics = payload;
    refreshVisuals();
  } catch (error) {
    setBanner(error.message || "Gagal refresh historical metrics.", "error");
  }
}

async function fetchEntries() {
  const search = dom.searchInput.value.trim();
  const status = dom.statusFilter.value;
  const params = new URLSearchParams();
  if (search) {
    params.set("search", search);
  }
  if (status && status !== "all") {
    params.set("status", status);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch(`/api/admin/license-entries${suffix}`);
}

async function fetchAuditLogs() {
  const ip = dom.auditIpInput.value.trim();
  const event = dom.auditEventInput.value.trim();
  const params = new URLSearchParams({ limit: "120" });
  if (ip) {
    params.set("ip", ip);
  }
  if (event) {
    params.set("event", event);
  }
  return apiFetch(`/api/admin/audit-logs?${params.toString()}`);
}

async function fetchMetrics() {
  const params = new URLSearchParams({ days: state.metricsWindowDays || "14" });
  return apiFetch(`/api/admin/metrics?${params.toString()}`);
}

async function handleSubmitEntry(event) {
  event.preventDefault();
  if (!ensureConnectionSettings()) {
    return;
  }
  const id = dom.entryId.value.trim();
  const payload = {
    ip: dom.fieldIp.value.trim(),
    label: dom.fieldLabel.value.trim(),
    owner: dom.fieldOwner.value.trim(),
    notes: dom.fieldNotes.value.trim(),
    expires_at: normalizeDateTimeLocal(dom.fieldExpiresAt.value),
  };

  try {
    if (id) {
      await apiFetch(`/api/admin/license-entries/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setBanner(`Entry ${payload.ip} berhasil diperbarui.`, "ok");
    } else {
      await apiFetch("/api/admin/license-entries", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setBanner(`Entry ${payload.ip} berhasil dibuat.`, "ok");
    }
    resetForm();
    await refreshDashboard();
  } catch (error) {
    setBanner(error.message || "Gagal menyimpan entry.", "error");
  }
}

function beginEditEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) {
    return;
  }
  dom.entryId.value = entry.id;
  dom.fieldIp.value = entry.ip || "";
  dom.fieldLabel.value = entry.label || "";
  dom.fieldOwner.value = entry.owner || "";
  dom.fieldNotes.value = entry.notes || "";
  dom.fieldExpiresAt.value = formatForDateTimeLocal(entry.expires_at || "");
  dom.formTitle.textContent = `Edit ${entry.ip}`;
  dom.submitEntryBtn.textContent = "Update Entry";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function toggleEntry(id, action) {
  const label = action === "revoke" ? "revoke" : "reactivate";
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) {
    return;
  }
  try {
    await apiFetch(`/api/admin/license-entries/${encodeURIComponent(id)}/${label}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    setBanner(`Entry ${entry.ip} berhasil di-${label}.`, "ok");
    await refreshDashboard();
  } catch (error) {
    setBanner(error.message || `Gagal ${label} entry.`, "error");
  }
}

async function deleteEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) {
    return;
  }
  const confirmed = window.confirm(`Hapus permanen entry ${entry.ip}? Aksi ini tidak bisa dibatalkan.`);
  if (!confirmed) {
    return;
  }
  try {
    await apiFetch(`/api/admin/license-entries/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setBanner(`Entry ${entry.ip} berhasil dihapus permanen.`, "ok");
    if (dom.entryId.value === id) {
      resetForm();
    }
    await refreshDashboard();
  } catch (error) {
    setBanner(error.message || "Gagal menghapus entry.", "error");
  }
}

function resetForm() {
  dom.entryId.value = "";
  dom.form.reset();
  dom.formTitle.textContent = "Create IP Entry";
  dom.submitEntryBtn.textContent = "Save Entry";
}

function refreshVisuals() {
  renderSummary();
  renderHistoricalMetrics();
  renderEntries();
  renderAuditLogs();
}

function renderSummary() {
  const active = state.entries.filter((item) => item.effective_status === "active").length;
  const expired = state.entries.filter((item) => item.effective_status === "expired").length;
  const revoked = state.entries.filter((item) => item.effective_status === "revoked").length;
  dom.metricActive.textContent = String(active);
  dom.metricExpired.textContent = String(expired);
  dom.metricRevoked.textContent = String(revoked);
  dom.metricAudit.textContent = String(state.auditLogs.length);
}

function renderHistoricalMetrics() {
  const summary = state.metrics?.summary || {};
  dom.metricChecksAllowed.textContent = String(summary.checks_allowed || 0);
  dom.metricChecksDenied.textContent = String(summary.checks_denied || 0);
  dom.metricPublicActivations.textContent = String(summary.public_activations || 0);
  dom.metricPublicRenewals.textContent = String(summary.public_renewals || 0);

  const caption = `Last ${state.metrics?.window_days || Number(state.metricsWindowDays || 14)} days`;
  dom.checksChartCaption.textContent = caption;
  dom.mutationsChartCaption.textContent = caption;
  renderTrendChart(dom.checksChart, state.metrics?.daily || [], [
    { key: "checks_allowed", label: "Allow", tone: "ok" },
    { key: "checks_denied", label: "Deny", tone: "danger" },
  ]);
  renderTrendChart(dom.mutationsChart, state.metrics?.daily || [], [
    { key: "public_activations", label: "Activate", tone: "accent" },
    { key: "public_renewals", label: "Renew", tone: "warn" },
    { key: "admin_mutations", label: "Admin", tone: "muted" },
  ]);
  renderTopEvents();
  renderEntrySourceSummary();
}

function renderEntries() {
  if (!state.entries.length) {
    dom.entriesBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-row">Belum ada entry IP. Tambahkan dari form di samping.</td>
      </tr>
    `;
    return;
  }

  dom.entriesBody.innerHTML = state.entries
    .map((entry) => {
      const canRevoke = entry.effective_status !== "revoked";
      const canReactivate = entry.status === "revoked";
      return `
        <tr>
          <td>
            <div class="entry-meta">
              <strong class="mono">${escapeHtml(entry.ip)}</strong>
              <span>${escapeHtml(entry.label || "-")}</span>
            </div>
          </td>
          <td>
            <div class="entry-meta">
              <strong>${escapeHtml(entry.owner || "-")}</strong>
              <span>${escapeHtml(entry.notes || "-")}</span>
            </div>
          </td>
          <td><span class="status-pill ${entry.effective_status}">${escapeHtml(entry.effective_status)}</span></td>
          <td>${escapeHtml(formatDate(entry.expires_at) || "Never")}</td>
          <td>${escapeHtml(formatDate(entry.updated_at) || "-")}</td>
          <td>
            <div class="action-stack">
              <button type="button" data-action="edit" data-entry-id="${entry.id}">Edit</button>
              ${canRevoke ? `<button type="button" data-action="revoke" data-entry-id="${entry.id}">Revoke</button>` : ""}
              ${canReactivate ? `<button type="button" data-action="reactivate" data-entry-id="${entry.id}">Reactivate</button>` : ""}
              <button type="button" data-action="delete" data-entry-id="${entry.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  dom.entriesBody.querySelectorAll("button[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const { action, entryId } = button.dataset;
      if (action === "edit") {
        beginEditEntry(entryId);
      } else if (action === "revoke") {
        await toggleEntry(entryId, "revoke");
      } else if (action === "reactivate") {
        await toggleEntry(entryId, "reactivate");
      } else if (action === "delete") {
        await deleteEntry(entryId);
      }
    });
  });
}

function renderAuditLogs() {
  if (!state.auditLogs.length) {
    dom.auditBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-row">Belum ada audit log.</td>
      </tr>
    `;
    return;
  }

  dom.auditBody.innerHTML = state.auditLogs
    .map(
      (log) => `
        <tr>
          <td>${escapeHtml(formatDate(log.created_at) || "-")}</td>
          <td>${escapeHtml(log.event_type || "-")}</td>
          <td class="mono">${escapeHtml(log.ip || "-")}</td>
          <td>${escapeHtml(log.stage || "-")}</td>
          <td>${escapeHtml(log.decision || "-")}</td>
          <td>${escapeHtml(log.actor_email || "worker")}</td>
        </tr>
      `
    )
    .join("");
}

function renderTopEvents() {
  const items = state.metrics?.top_events || [];
  if (!items.length) {
    dom.topEvents.innerHTML = `<div class="empty-chart">Belum ada event historis pada window ini.</div>`;
    return;
  }
  const max = Math.max(...items.map((item) => Number(item.count || 0)), 1);
  dom.topEvents.innerHTML = items
    .map((item) => {
      const count = Number(item.count || 0);
      const width = Math.max(8, Math.round((count / max) * 100));
      return `
        <div class="top-event-row">
          <div class="top-event-meta">
            <strong>${escapeHtml(item.event_type || "-")}</strong>
            <span>${count} events</span>
          </div>
          <div class="top-event-bar">
            <span style="width:${width}%"></span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderEntrySourceSummary() {
  const summary = state.metrics?.summary || {};
  const publicEntries = Number(summary.public_entries || 0);
  const adminEntries = Number(summary.admin_entries || 0);
  const total = Math.max(publicEntries + adminEntries, 1);
  const publicWidth = Math.round((publicEntries / total) * 100);
  const adminWidth = 100 - publicWidth;
  dom.entrySourceSummary.innerHTML = `
    <div class="source-stack">
      <span class="source-stack-public" style="width:${publicWidth}%"></span>
      <span class="source-stack-admin" style="width:${adminWidth}%"></span>
    </div>
    <div class="source-grid">
      <div class="source-card">
        <strong>${publicEntries}</strong>
        <span>Public Entry</span>
      </div>
      <div class="source-card">
        <strong>${adminEntries}</strong>
        <span>Admin Entry</span>
      </div>
      <div class="source-card">
        <strong>${Number(summary.admin_mutations || 0)}</strong>
        <span>Admin Mutations</span>
      </div>
      <div class="source-card">
        <strong>${Number(summary.audit_rows_window || 0)}</strong>
        <span>Audit Rows Window</span>
      </div>
    </div>
  `;
}

function renderTrendChart(container, points, series) {
  if (!points.length) {
    container.innerHTML = `<div class="empty-chart">Belum ada data historis untuk window ini.</div>`;
    return;
  }
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => series.map((item) => Number(point[item.key] || 0)))
  );
  const legend = `
    <div class="chart-legend">
      ${series
        .map(
          (item) => `
            <span class="legend-item">
              <i class="legend-dot ${item.tone}"></i>
              ${escapeHtml(item.label)}
            </span>
          `
        )
        .join("")}
    </div>
  `;
  const bars = `
    <div class="trend-bars">
      ${points
        .map((point) => {
          const barSet = series
            .map((item) => {
              const value = Number(point[item.key] || 0);
              const height = Math.max(value > 0 ? 10 : 4, Math.round((value / maxValue) * 100));
              return `<span class="trend-bar ${item.tone}" style="height:${height}%"><b>${value}</b></span>`;
            })
            .join("");
          return `
            <div class="trend-day">
              <div class="trend-bar-set">${barSet}</div>
              <span class="trend-label">${escapeHtml(formatShortDay(point.day))}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
  container.innerHTML = `${legend}${bars}`;
}

function handleMetricsWindowChange() {
  state.metricsWindowDays = dom.metricsWindow.value || "14";
  localStorage.setItem("autoscriptLicenseMetricsWindowDays", state.metricsWindowDays);
  refreshMetrics();
}

async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (state.adminEmail && state.adminPassword) {
    headers.Authorization = `Basic ${btoa(`${state.adminEmail}:${state.adminPassword}`)}`;
  }
  const response = await fetch(`${state.apiBaseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body,
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.message || `HTTP ${response.status}`);
  }
  return payload;
}

function ensureConnectionSettings() {
  if (state.apiBaseUrl && state.adminEmail && state.adminPassword) {
    return true;
  }
  setBanner("Isi Worker API Base URL, email admin, dan password admin terlebih dahulu.", "error");
  return false;
}

function setBanner(message, tone = "muted") {
  dom.statusBanner.textContent = message;
  dom.statusBanner.className = `status-banner ${tone}`;
}

function normalizeApiBase(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw);
    return url.origin;
  } catch (_error) {
    return "";
  }
}

function normalizeDateTimeLocal(value) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString();
}

function formatForDateTimeLocal(value) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const tzOffset = parsed.getTimezoneOffset();
  const local = new Date(parsed.getTime() - tzOffset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatShortDay(value) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(parsed);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
