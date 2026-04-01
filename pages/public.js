const publicState = {
  apiBaseUrl: (window.AUTOSCRIPT_PORTAL_CONFIG?.apiBaseUrl || "").replace(/\/+$/, ""),
  licenseDurationDays: 14,
  renewOpenBeforeDays: 3,
  workerConfigLoaded: false,
  turnstileSiteKey: "",
  turnstileScriptPromise: null,
  turnstileScriptReady: false,
  createTurnstileWidgetId: null,
  createTurnstileToken: "",
};

const publicDom = {
  banner: document.getElementById("public-banner"),
  statusBadge: document.getElementById("public-status-badge"),
  createForm: document.getElementById("create-form"),
  statusForm: document.getElementById("status-form"),
  createIp: document.getElementById("create-ip"),
  statusIp: document.getElementById("status-ip"),
  createResult: document.getElementById("create-result"),
  statusResult: document.getElementById("status-result"),
  createTurnstile: document.getElementById("create-turnstile"),
  createChallengeNote: document.getElementById("create-challenge-note"),
  durationDays: document.getElementById("license-duration-days"),
  createSubmitBtn: document.getElementById("create-submit-btn"),
  statusSubmitBtn: document.getElementById("status-submit-btn"),
  createSubmitLabel: document.getElementById("create-submit-label"),
  statusSubmitLabel: document.getElementById("status-submit-label"),
};

bootstrapPublicPortal();

async function bootstrapPublicPortal() {
  initPublicDeviceContext();
  bindPublicEvents();
  renderDurationDays();
  setCreateChallengeState(false, "Memuat verifikasi keamanan...");
  if (!publicState.apiBaseUrl) {
    setPublicBanner("Belum siap.", "error");
    setStatusBadge("Not ready", "error");
    setCreateChallengeState(false, "Verifikasi keamanan belum tersedia.");
    return;
  }
  await loadWorkerPublicConfig();
}

function bindPublicEvents() {
  publicDom.createForm.addEventListener("submit", handleCreateSubmit);
  publicDom.statusForm.addEventListener("submit", handleStatusSubmit);
}

function initPublicDeviceContext() {
  syncPublicDeviceContext();
  window.addEventListener("resize", syncPublicDeviceContext, { passive: true });
}

function syncPublicDeviceContext() {
  const device = detectClientDevice();
  document.documentElement.dataset.device = device;
  document.body.dataset.device = device;
}

function detectClientDevice() {
  const userAgent = String(navigator.userAgent || "");
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  const isTabletUa = /(iPad|Tablet|PlayBook|Silk)|(Android(?!.*Mobile))/i.test(userAgent);
  const isMobileUa = /(iPhone|iPod|Android.*Mobile|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile)/i.test(userAgent);

  if (isTabletUa || (touchPoints > 0 && width >= 768 && width <= 1180)) {
    return "tablet";
  }
  if (isMobileUa || width < 768) {
    return "mobile";
  }
  return "desktop";
}

async function loadWorkerPublicConfig() {
  try {
    const payload = await publicApiFetch("/api/public/config", { method: "GET" });
    publicState.workerConfigLoaded = true;
    publicState.licenseDurationDays = Number(payload.license_duration_days || 14);
    publicState.renewOpenBeforeDays = Number(payload.renew_open_before_days || 3);
    publicState.turnstileSiteKey = String(payload.turnstile_site_key || "").trim();
    renderDurationDays();
    const challengeReady = await initializePublicChallenge();
    if (challengeReady) {
      setPublicBanner("Siap digunakan.", "ok");
      setStatusBadge("Ready", "ok");
    } else {
      setPublicBanner("Cek status siap. Aktivasi sementara belum tersedia.", "warn");
      setStatusBadge("Status only", "warn");
    }
  } catch (error) {
    setPublicBanner(error.message || "Gagal memuat konfigurasi.", "error");
    setStatusBadge("Config failed", "error");
    setCreateChallengeState(false, "Verifikasi keamanan belum tersedia.");
  }
}

function renderDurationDays() {
  const durationText = String(publicState.licenseDurationDays);
  publicDom.durationDays.textContent = durationText;
  publicDom.createSubmitLabel.textContent = "Proses IP";
}

async function handleCreateSubmit(event) {
  event.preventDefault();
  if (!publicState.turnstileSiteKey) {
    showPublicResult(
      publicDom.createResult,
      "Aktivasi belum tersedia. Coba lagi nanti.",
      "warn"
    );
    return;
  }
  const ip = normalizeIpInput(publicDom.createIp.value);
  if (!ip) {
    showPublicResult(
      publicDom.createResult,
      "Masukkan public IPv4 VPS yang valid, misalnya 123.45.67.89.",
      "error"
    );
    publicDom.createIp.focus();
    return;
  }
  publicDom.createIp.value = ip;
  publicDom.statusIp.value = ip;
  if (!publicState.createTurnstileToken) {
    showPublicResult(
      publicDom.createResult,
      "Selesaikan verifikasi keamanan sebelum mengirim IP.",
      "warn"
    );
    return;
  }
  setSubmitState(publicDom.createSubmitBtn, publicDom.createSubmitLabel, true, "Memproses...");

  try {
    const statusPayload = await publicApiFetch("/api/public/license/status", {
      method: "POST",
      body: JSON.stringify({
        ip,
      }),
    });
    const submitPlan = planCreateSubmission(statusPayload);
    if (!submitPlan.allowed) {
      showPublicResult(
        publicDom.createResult,
        renderCreateBlockedResult(statusPayload, ip, submitPlan.message),
        submitPlan.tone,
        true
      );
      setPublicBanner(submitPlan.banner || submitPlan.message, submitPlan.tone);
      return;
    }
    setSubmitState(
      publicDom.createSubmitBtn,
      publicDom.createSubmitLabel,
      true,
      submitPlan.pendingLabel
    );
    const payload = await publicApiFetch(submitPlan.endpoint, {
      method: "POST",
      body: JSON.stringify({
        ip,
        turnstile_token: publicState.createTurnstileToken,
      }),
    });
    publicDom.createForm.reset();
    showPublicResult(
      publicDom.createResult,
      renderCreateResult(payload, submitPlan.actionKind),
      "ok",
      true
    );
    publicDom.statusIp.value = ip;
    setPublicBanner(submitPlan.banner || "Permintaan berhasil.", "ok");
  } catch (error) {
    showPublicResult(publicDom.createResult, error.message || "Create gagal.", "error");
  } finally {
    resetCreateTurnstileWidget();
    setSubmitState(
      publicDom.createSubmitBtn,
      publicDom.createSubmitLabel,
      false,
      "Memproses...",
      "Proses IP"
    );
    syncCreateSubmitAvailability();
  }
}

async function handleStatusSubmit(event) {
  event.preventDefault();
  const ip = normalizeIpInput(publicDom.statusIp.value);
  if (!ip) {
    showPublicResult(
      publicDom.statusResult,
      "Masukkan public IPv4 VPS yang valid, misalnya 123.45.67.89.",
      "error"
    );
    publicDom.statusIp.focus();
    return;
  }
  publicDom.statusIp.value = ip;
  publicDom.createIp.value = ip;
  setSubmitState(publicDom.statusSubmitBtn, publicDom.statusSubmitLabel, true, "Memeriksa...");

  try {
    const payload = await publicApiFetch("/api/public/license/status", {
      method: "POST",
      body: JSON.stringify({
        ip,
      }),
    });
    const tone = statusToTone(payload.status);
    showPublicResult(
      publicDom.statusResult,
      renderStatusResult(payload, ip),
      tone,
      true
    );
    setPublicBanner(`Status ${ip} berhasil diambil.`, tone === "error" ? "warn" : "ok");
  } catch (error) {
    showPublicResult(publicDom.statusResult, error.message || "Check status gagal.", "error");
  } finally {
    setSubmitState(publicDom.statusSubmitBtn, publicDom.statusSubmitLabel, false, "Memeriksa...", "Cek Status");
  }
}

function renderCreateResult(payload, actionKind = "activate") {
  const item = payload.item || {};
  const status = item.status || "active";
  const tone = statusToTone(status);
  const daysRemaining = formatDaysRemaining(item.days_remaining);
  const isRenew = actionKind === "renew";
  const operationLabel = isRenew ? "Perpanjangan" : "Aktivasi";
  const operationTitle = isRenew ? "Perpanjangan Berhasil" : "Aktivasi Berhasil";
  const operationSummary = isRenew
    ? "siap dipakai lebih lama untuk validasi lisensi VPS."
    : "siap dipakai untuk validasi lisensi VPS.";
  return `
    <div class="result-topline">
      <div>
        <span class="result-kicker">${operationLabel}</span>
        <h3 class="result-title">${operationTitle}</h3>
        <p class="result-lead">${escapeHtml(payload.message || "")}</p>
        <p class="result-summary"><strong>${escapeHtml(item.ip || "-")}</strong> ${operationSummary}</p>
      </div>
      <span class="tone-chip ${tone}">${escapeHtml(statusLabel(status))}</span>
    </div>
    <div class="result-grid">
      <article>
        <strong>Entry ID</strong>
        <span class="mono">${escapeHtml(item.entry_id || "-")}</span>
      </article>
      <article>
        <strong>IPv4</strong>
        <span class="mono">${escapeHtml(item.ip || "-")}</span>
      </article>
      <article>
        <strong>Status</strong>
        <span>${escapeHtml(item.status || "-")}</span>
      </article>
      <article>
        <strong>Aktif Sampai</strong>
        <span>${escapeHtml(formatDate(item.expires_at) || "-")}</span>
      </article>
      <article>
        <strong>Sisa Waktu</strong>
        <span>${escapeHtml(daysRemaining)}</span>
      </article>
    </div>
    <ul class="action-list">
      <li>Aktivasi hanya untuk IP baru atau yang sudah expired.</li>
      <li>Renew publik baru dibuka saat sisa aktif ${escapeHtml(formatDaysRemaining(publicState.renewOpenBeforeDays))} atau kurang.</li>
      <li>${isRenew ? "Perpanjangan langsung ditolak jika masih terlalu awal." : "IP aktif tidak bisa diaktivasi ulang sebelum expired."}</li>
      <li>Jika IP berubah, aktivasi ulang.</li>
    </ul>
  `;
}

function renderCreateBlockedResult(statusPayload, ip, message) {
  const tone = statusToTone(statusPayload.status);
  const daysRemaining = formatDaysRemaining(statusPayload.days_remaining);
  return `
    <div class="result-topline">
      <div>
        <span class="result-kicker">Tidak Diproses</span>
        <h3 class="result-title">Permintaan Ditolak</h3>
        <p class="result-lead">${escapeHtml(message)}</p>
        <p class="result-summary"><strong>${escapeHtml(ip || "-")}</strong> tetap memakai status yang ada saat ini.</p>
      </div>
      <span class="tone-chip ${tone}">${escapeHtml(statusLabel(statusPayload.status))}</span>
    </div>
    <div class="result-grid">
      <article>
        <strong>Status</strong>
        <span>${escapeHtml(statusPayload.status || "-")}</span>
      </article>
      <article>
        <strong>IP</strong>
        <span class="mono">${escapeHtml(ip || "-")}</span>
      </article>
      <article>
        <strong>Aktif Sampai</strong>
        <span>${escapeHtml(formatDate(statusPayload.expires_at) || "-")}</span>
      </article>
      <article>
        <strong>Sisa Waktu</strong>
        <span>${escapeHtml(daysRemaining)}</span>
      </article>
      <article>
        <strong>Bisa Renew</strong>
        <span>${statusPayload.renewable ? "Ya" : "Tidak"}</span>
      </article>
    </div>
    <p class="result-caption">${escapeHtml(nextActionForStatus(statusPayload))}</p>
  `;
}

function renderStatusResult(payload, ip) {
  const tone = statusToTone(payload.status);
  const summary = describeStatus(payload);
  const daysRemaining = formatDaysRemaining(payload.days_remaining);
  return `
    <div class="result-topline">
      <div>
        <span class="result-kicker">Status</span>
        <h3 class="result-title">Status License</h3>
        <p class="result-lead">${escapeHtml(summary)}</p>
        <p class="result-summary"><strong>${escapeHtml(ip || "-")}</strong> berhasil diperiksa.</p>
      </div>
      <span class="tone-chip ${tone}">${escapeHtml(statusLabel(payload.status))}</span>
    </div>
    <div class="result-grid">
      <article>
        <strong>Status</strong>
        <span>${escapeHtml(payload.status || "-")}</span>
      </article>
      <article>
        <strong>IP</strong>
        <span class="mono">${escapeHtml(ip || "-")}</span>
      </article>
      <article>
        <strong>Akses Publik</strong>
        <span>${payload.allowed ? "Diizinkan" : "Tidak"}</span>
      </article>
      <article>
        <strong>Bisa Renew</strong>
        <span>${payload.renewable ? "Ya" : "Tidak"}</span>
      </article>
      <article>
        <strong>Aktif Sampai</strong>
        <span>${escapeHtml(formatDate(payload.expires_at) || "-")}</span>
      </article>
      <article>
        <strong>Sisa Waktu</strong>
        <span>${escapeHtml(daysRemaining)}</span>
      </article>
    </div>
    <p class="result-caption">${escapeHtml(nextActionForStatus(payload))}</p>
  `;
}

async function publicApiFetch(path, options = {}) {
  const response = await fetch(`${publicState.apiBaseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
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

function showPublicResult(target, htmlOrText, tone = "ok", isHtml = false) {
  target.className = `result-card ${tone}`;
  target.innerHTML = isHtml ? htmlOrText : `<p>${escapeHtml(htmlOrText)}</p>`;
}

function setPublicBanner(message, tone = "muted") {
  publicDom.banner.textContent = message;
  publicDom.banner.className = `public-banner ${tone}`;
}

function setStatusBadge(message, tone = "muted") {
  publicDom.statusBadge.textContent = message;
  publicDom.statusBadge.className = `status-pill ${tone}`;
}

async function initializePublicChallenge() {
  if (!publicState.turnstileSiteKey) {
    setCreateChallengeState(false, "Verifikasi keamanan belum tersedia.");
    return false;
  }
  try {
    await loadTurnstileScript();
    renderCreateTurnstileWidget();
    setCreateChallengeState(false, "Selesaikan verifikasi keamanan sebelum aktivasi.");
    return true;
  } catch (_error) {
    setCreateChallengeState(false, "Verifikasi keamanan gagal dimuat.");
    return false;
  }
}

function setCreateChallengeState(enabled, note) {
  if (publicDom.createChallengeNote) {
    publicDom.createChallengeNote.textContent = note;
  }
  publicDom.createSubmitBtn.disabled = !enabled;
}

function syncCreateSubmitAvailability() {
  const canSubmit = Boolean(publicState.turnstileSiteKey && publicState.createTurnstileToken);
  setCreateChallengeState(
    canSubmit,
    canSubmit ? "Verifikasi selesai. Anda bisa mengaktifkan IP." : "Selesaikan verifikasi keamanan sebelum aktivasi."
  );
}

function resetCreateTurnstileWidget() {
  publicState.createTurnstileToken = "";
  if (publicState.createTurnstileWidgetId !== null && window.turnstile?.reset) {
    window.turnstile.reset(publicState.createTurnstileWidgetId);
  }
}

function renderCreateTurnstileWidget() {
  if (!publicDom.createTurnstile || !publicState.turnstileSiteKey || !window.turnstile?.render) {
    return;
  }
  if (publicState.createTurnstileWidgetId !== null) {
    resetCreateTurnstileWidget();
    return;
  }
  publicState.createTurnstileWidgetId = window.turnstile.render(publicDom.createTurnstile, {
    sitekey: publicState.turnstileSiteKey,
    theme: "light",
    callback(token) {
      publicState.createTurnstileToken = String(token || "").trim();
      syncCreateSubmitAvailability();
    },
    "expired-callback"() {
      publicState.createTurnstileToken = "";
      syncCreateSubmitAvailability();
    },
    "error-callback"() {
      publicState.createTurnstileToken = "";
      setCreateChallengeState(false, "Verifikasi keamanan gagal. Muat ulang lalu coba lagi.");
    },
  });
}

async function loadTurnstileScript() {
  if (publicState.turnstileScriptReady && window.turnstile?.render) {
    return window.turnstile;
  }
  if (publicState.turnstileScriptPromise) {
    return publicState.turnstileScriptPromise;
  }
  publicState.turnstileScriptPromise = new Promise((resolve, reject) => {
    if (window.turnstile?.render) {
      publicState.turnstileScriptReady = true;
      resolve(window.turnstile);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      publicState.turnstileScriptReady = true;
      resolve(window.turnstile);
    };
    script.onerror = () => {
      reject(new Error("Gagal memuat verifikasi keamanan."));
    };
    document.head.appendChild(script);
  });
  return publicState.turnstileScriptPromise;
}

function formatDate(value) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function normalizeIpInput(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const parts = raw.split(".");
  if (parts.length !== 4) {
    return "";
  }
  const normalized = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return "";
    }
    const num = Number(part);
    if (!Number.isInteger(num) || num < 0 || num > 255) {
      return "";
    }
    normalized.push(String(num));
  }
  return normalized.join(".");
}

function setSubmitState(button, label, pending, pendingText, idleText = "") {
  button.disabled = pending;
  label.textContent = pending ? pendingText : idleText || label.textContent;
}

function statusToTone(status) {
  if (status === "active") {
    return "ok";
  }
  if (status === "expired") {
    return "warn";
  }
  return "error";
}

function statusLabel(status) {
  if (status === "active") {
    return "Active";
  }
  if (status === "expired") {
    return "Expired";
  }
  if (status === "revoked") {
    return "Revoked";
  }
  if (status === "not_found") {
    return "Not Found";
  }
  return status || "Unknown";
}

function describeStatus(payload) {
  const status = payload.status || "unknown";
  if (status === "active") {
    if (payload.renewable) {
      return `IP ini aktif dan sudah masuk jendela renew ${publicState.renewOpenBeforeDays} hari terakhir.`;
    }
    return "IP ini aktif dan belum masuk jendela renew publik.";
  }
  if (status === "expired") {
    return "IP ini pernah aktif, tetapi masa berlakunya sudah habis dan perlu diaktifkan ulang.";
  }
  if (status === "revoked") {
    return "IP ini sedang diblokir dan tidak bisa diaktifkan kembali dari halaman ini.";
  }
  if (status === "not_found") {
    return "IP ini belum terdaftar.";
  }
  return "Status IP berhasil diambil dari Worker.";
}

function nextActionForStatus(payload) {
  const status = payload.status || "unknown";
  if (status === "active") {
    if (payload.renewable) {
      return `Perpanjangan publik sudah dibuka karena sisa aktif tinggal ${publicState.renewOpenBeforeDays} hari atau kurang.`;
    }
    return `Perpanjangan publik baru dibuka saat sisa aktif ${publicState.renewOpenBeforeDays} hari atau kurang.`;
  }
  if (status === "expired") {
    return "Lakukan aktivasi ulang dengan IP yang sama untuk menambah masa aktif baru.";
  }
  if (status === "revoked") {
    return "Hubungi operator karena status revoked tidak bisa dipulihkan dari halaman publik.";
  }
  if (status === "not_found") {
    return "Gunakan form aktivasi untuk mendaftarkan IP ini pertama kali.";
  }
  return "Gunakan form aktivasi atau hubungi operator jika hasil tidak sesuai.";
}

function planCreateSubmission(statusPayload) {
  const status = String(statusPayload?.status || "unknown");
  if (status === "active") {
    if (statusPayload.renewable) {
      return {
        allowed: true,
        actionKind: "renew",
        endpoint: "/api/public/license/renew",
        pendingLabel: "Memperpanjang...",
        banner: "Perpanjangan berhasil.",
      };
    }
    return {
      allowed: false,
      tone: "warn",
      message: `IP ini masih aktif. Perpanjangan publik baru dibuka saat sisa aktif ${publicState.renewOpenBeforeDays} hari atau kurang.`,
      banner: "Perpanjangan belum dibuka.",
    };
  }
  if (status === "revoked") {
    return {
      allowed: false,
      tone: "error",
      message: "IP ini sedang diblokir dan tidak bisa diproses dari halaman ini.",
      banner: "IP sedang diblokir.",
    };
  }
  if (status === "expired" || status === "not_found") {
    return {
      allowed: true,
      actionKind: "activate",
      endpoint: "/api/public/license/create",
      pendingLabel: "Mengaktifkan...",
      banner: "Aktivasi berhasil.",
    };
  }
  return {
    allowed: false,
    tone: "error",
    message: "Status IP tidak bisa dipastikan. Coba cek status lagi beberapa saat lagi.",
    banner: "Status IP belum pasti.",
  };
}

function formatDaysRemaining(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number <= 0) {
    return "0 hari";
  }
  if (number === 1) {
    return "1 hari";
  }
  return `${number} hari`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
