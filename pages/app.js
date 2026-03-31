const VIEW_META = {
  dashboard: {
    title: "Dashboard",
    description: "Pantau kesehatan lisensi, activity trend, dan sinyal operasional terbaru.",
  },
  entries: {
    title: "Entries",
    description: "Cari, edit, blokir, buka blokir, dan hapus entry lisensi IP dari satu workspace.",
  },
  audit: {
    title: "Audit Log",
    description: "Lihat jejak perubahan dan filter event operasional berdasarkan IP atau event type.",
  },
  settings: {
    title: "Settings",
    description: "Kelola sesi admin dan akses panel tanpa menampilkan endpoint Worker di UI.",
  },
};

const state = {
  apiBaseUrl: normalizeApiBase(window.AUTOSCRIPT_PORTAL_CONFIG?.apiBaseUrl || ""),
  adminEmail: localStorage.getItem("autoscriptLicenseAdminEmail") || "",
  adminPassword: sessionStorage.getItem("autoscriptLicenseAdminPassword") || "",
  activeView: localStorage.getItem("autoscriptLicenseAdminActiveView") || "dashboard",
  authStatus: "locked",
  entries: [],
  auditLogs: [],
  metrics: null,
  session: null,
  metricsWindowDays: localStorage.getItem("autoscriptLicenseMetricsWindowDays") || "14",
};

const dom = {
  loginShell: document.getElementById("login-shell"),
  loginForm: document.getElementById("login-form"),
  loginEmailInput: document.getElementById("login-email-input"),
  loginPasswordInput: document.getElementById("login-password-input"),
  loginSubmitBtn: document.getElementById("login-submit-btn"),
  loginBanner: document.getElementById("login-banner"),
  app: document.getElementById("admin-app"),
  sidebarToggle: document.getElementById("sidebar-toggle"),
  navLinks: Array.from(document.querySelectorAll("[data-view-target]")),
  viewPanels: Array.from(document.querySelectorAll("[data-view]")),
  viewTitle: document.getElementById("view-title"),
  viewDescription: document.getElementById("view-description"),
  refreshCurrentBtn: document.getElementById("refresh-current-btn"),
  logoutBtn: document.getElementById("logout-btn"),
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
  sidebarSessionBadge: document.getElementById("sidebar-session-badge"),
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
  settingsAdminPreview: document.getElementById("settings-admin-preview"),
  settingsMetricsPreview: document.getElementById("settings-metrics-preview"),
  settingsSessionPreview: document.getElementById("settings-session-preview"),
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
  localStorage.removeItem("autoscriptLicenseApiBaseUrl");
  dom.loginEmailInput.value = state.adminEmail;
  dom.loginPasswordInput.value = state.adminPassword;
  dom.metricsWindow.value = state.metricsWindowDays;
  bindEvents();
  setActiveView(state.activeView, { skipPersist: true });
  refreshVisuals();

  if (!state.apiBaseUrl) {
    setAuthState("locked");
    setLoginBanner("Config API admin belum tersedia di deploy ini. Isi PAGES_API_BASE_URL lalu redeploy Pages.", "error");
    dom.loginSubmitBtn.disabled = true;
    return;
  }

  if (state.adminEmail && state.adminPassword) {
    authenticateWithStoredCredentials();
    return;
  }

  setAuthState("locked");
}

function bindEvents() {
  dom.loginForm.addEventListener("submit", handleLoginSubmit);
  dom.sidebarToggle.addEventListener("click", toggleSidebar);
  dom.refreshCurrentBtn.addEventListener("click", refreshCurrentView);
  dom.logoutBtn.addEventListener("click", handleLogout);
  dom.clearAuthBtn.addEventListener("click", handleLogout);
  dom.navLinks.forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.viewTarget));
  });
  dom.refreshDashboardBtn.addEventListener("click", refreshEntries);
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

function setActiveView(viewName, options = {}) {
  const view = VIEW_META[viewName] ? viewName : "dashboard";
  state.activeView = view;
  if (!options.skipPersist) {
    localStorage.setItem("autoscriptLicenseAdminActiveView", view);
  }

  dom.navLinks.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewTarget === view);
  });
  dom.viewPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.view === view);
  });
  dom.viewTitle.textContent = VIEW_META[view].title;
  dom.viewDescription.textContent = VIEW_META[view].description;
  dom.app.classList.remove("sidebar-open");
}

function setAuthState(status) {
  state.authStatus = status;
  const authenticated = status === "authenticated";
  dom.loginShell.classList.toggle("is-hidden", authenticated);
  dom.app.classList.toggle("is-hidden", !authenticated);
  dom.app.setAttribute("aria-hidden", String(!authenticated));
  dom.loginSubmitBtn.disabled = status === "authenticating" || !state.apiBaseUrl;
}

function toggleSidebar() {
  dom.app.classList.toggle("sidebar-open");
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (!state.apiBaseUrl) {
    setLoginBanner("Config API admin belum tersedia di deploy ini.", "error");
    return;
  }

  const adminEmail = dom.loginEmailInput.value.trim();
  const adminPassword = dom.loginPasswordInput.value;
  if (!adminEmail || !adminPassword) {
    setLoginBanner("Masukkan user/email dan password admin terlebih dahulu.", "error");
    return;
  }

  setAuthState("authenticating");
  setLoginBanner("Memverifikasi kredensial admin...", "muted");

  try {
    await authenticateAdmin(adminEmail, adminPassword);
  } catch (error) {
    setAuthState("locked");
    setLoginBanner(error.message || "Login admin gagal.", "error");
  }
}

async function authenticateWithStoredCredentials() {
  setAuthState("authenticating");
  setLoginBanner("Memulihkan sesi admin sebelumnya...", "muted");

  try {
    await authenticateAdmin(state.adminEmail, state.adminPassword);
  } catch (_error) {
    clearStoredCredentials();
    setAuthState("locked");
    setLoginBanner("Sesi sebelumnya tidak valid. Silakan login ulang.", "error");
  }
}

async function authenticateAdmin(adminEmail, adminPassword) {
  const session = await apiFetch("/api/admin/session", {
    auth: { email: adminEmail, password: adminPassword },
  });

  state.adminEmail = adminEmail;
  state.adminPassword = adminPassword;
  state.session = session;
  localStorage.setItem("autoscriptLicenseAdminEmail", adminEmail);
  sessionStorage.setItem("autoscriptLicenseAdminPassword", adminPassword);
  setSessionState(session);
  setAuthState("authenticated");
  setLoginBanner("Akses admin berhasil diverifikasi.", "ok");
  setBanner(`Connected as ${session.admin_email || "admin"}`, "ok");
  await refreshDashboard();
}

function handleLogout() {
  clearStoredCredentials();
  state.session = null;
  state.entries = [];
  state.auditLogs = [];
  state.metrics = null;
  setSessionState(null);
  refreshVisuals();
  setAuthState("locked");
  setLoginBanner("Sesi admin dibersihkan. Masukkan kredensial untuk membuka panel lagi.", "muted");
}

function clearStoredCredentials() {
  state.adminEmail = "";
  state.adminPassword = "";
  localStorage.removeItem("autoscriptLicenseAdminEmail");
  sessionStorage.removeItem("autoscriptLicenseAdminPassword");
  dom.loginEmailInput.value = "";
  dom.loginPasswordInput.value = "";
}

async function refreshCurrentView() {
  if (state.authStatus !== "authenticated") {
    return;
  }
  if (state.activeView === "dashboard") {
    await refreshDashboard();
  } else if (state.activeView === "entries") {
    await refreshEntries();
  } else if (state.activeView === "audit") {
    await refreshAuditLogs();
  } else if (state.activeView === "settings") {
    refreshVisuals();
  }
}

async function refreshDashboard() {
  if (!ensureAuthenticated()) {
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
    setSessionState(session);
    setBanner(`Connected as ${session.admin_email || "admin"}`, "ok");
    refreshVisuals();
  } catch (error) {
    handleAuthFailure(error);
  }
}

async function refreshEntries() {
  if (!ensureAuthenticated()) {
    return;
  }
  try {
    const payload = await fetchEntries();
    state.entries = payload.items || [];
    refreshVisuals();
  } catch (error) {
    handleAuthFailure(error, "Gagal refresh daftar IP.");
  }
}

async function refreshAuditLogs() {
  if (!ensureAuthenticated()) {
    return;
  }
  try {
    const payload = await fetchAuditLogs();
    state.auditLogs = payload.items || [];
    refreshVisuals();
  } catch (error) {
    handleAuthFailure(error, "Gagal refresh audit log.");
  }
}

async function refreshMetrics() {
  if (!ensureAuthenticated()) {
    return;
  }
  try {
    const payload = await fetchMetrics();
    state.metrics = payload;
    refreshVisuals();
  } catch (error) {
    handleAuthFailure(error, "Gagal refresh historical metrics.");
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
  if (!ensureAuthenticated()) {
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
    handleAuthFailure(error, "Gagal menyimpan entry.");
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
  setActiveView("entries");
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
    handleAuthFailure(error, `Gagal ${label} entry.`);
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
    handleAuthFailure(error, "Gagal menghapus entry.");
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
  renderSettingsSummary();
}

function ensureAuthenticated() {
  if (state.authStatus === "authenticated" && state.adminEmail && state.adminPassword && state.apiBaseUrl) {
    return true;
  }
  setAuthState("locked");
  return false;
}

function handleAuthFailure(error, fallbackMessage = "Akses admin gagal.") {
  if (error?.status === 401 || String(error?.message || "").includes("401")) {
    handleLogout();
    setLoginBanner("Sesi admin tidak valid. Silakan login ulang.", "error");
    return;
  }
  setBanner(error.message || fallbackMessage, "error");
}

function setSessionState(session) {
  const label = session?.admin_email || "Not Connected";
  const tone = session ? "ok" : "muted";
  dom.sessionBadge.textContent = label;
  dom.sessionBadge.className = `session-badge ${tone}`;
  dom.sidebarSessionBadge.textContent = label;
  dom.sidebarSessionBadge.className = `session-badge ${tone}`;
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
        <td colspan="6" class="empty-row">Belum ada entry IP. Tambahkan dari workspace di kanan.</td>
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

function renderSettingsSummary() {
  dom.settingsAdminPreview.textContent = state.adminEmail || "-";
  dom.settingsMetricsPreview.textContent = `${state.metricsWindowDays || "14"} days`;
  dom.settingsSessionPreview.textContent = state.session?.admin_email || "Not Connected";
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
  if (state.authStatus === "authenticated") {
    refreshMetrics();
  } else {
    refreshVisuals();
  }
}

async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const authEmail = options.auth?.email ?? state.adminEmail;
  const authPassword = options.auth?.password ?? state.adminPassword;
  if (authEmail && authPassword) {
    headers.Authorization = `Basic ${btoa(`${authEmail}:${authPassword}`)}`;
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
    const error = new Error(payload.message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function setBanner(message, tone = "muted") {
  dom.statusBanner.textContent = message;
  dom.statusBanner.className = `status-banner ${tone}`;
}

function setLoginBanner(message, tone = "muted") {
  dom.loginBanner.textContent = message;
  dom.loginBanner.className = `status-banner ${tone}`;
}

function normalizeApiBase(value) {
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
