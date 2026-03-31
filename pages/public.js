const publicState = {
  apiBaseUrl: (window.AUTOSCRIPT_PORTAL_CONFIG?.apiBaseUrl || "").replace(/\/+$/, ""),
  licenseDurationDays: 14,
  workerConfigLoaded: false,
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
  durationDays: document.getElementById("license-duration-days"),
  overviewDurationDays: document.getElementById("overview-duration-days"),
  createSubmitBtn: document.getElementById("create-submit-btn"),
  statusSubmitBtn: document.getElementById("status-submit-btn"),
  createSubmitLabel: document.getElementById("create-submit-label"),
  statusSubmitLabel: document.getElementById("status-submit-label"),
};

bootstrapPublicPortal();

async function bootstrapPublicPortal() {
  bindPublicEvents();
  renderDurationDays();
  if (!publicState.apiBaseUrl) {
    setPublicBanner("Operator belum mengisi API base URL di config.js.", "error");
    setStatusBadge("Portal not configured", "error");
    return;
  }
  await loadWorkerPublicConfig();
}

function bindPublicEvents() {
  publicDom.createForm.addEventListener("submit", handleCreateSubmit);
  publicDom.statusForm.addEventListener("submit", handleStatusSubmit);
}

async function loadWorkerPublicConfig() {
  try {
    const payload = await publicApiFetch("/api/public/config", { method: "GET" });
    publicState.workerConfigLoaded = true;
    publicState.licenseDurationDays = Number(payload.license_duration_days || 14);
    renderDurationDays();
    setPublicBanner("Portal siap dipakai. Input IP VPS untuk create, cek status, atau renew.", "ok");
    setStatusBadge("Worker connected", "ok");
  } catch (error) {
    setPublicBanner(error.message || "Gagal mengambil konfigurasi Worker publik.", "error");
    setStatusBadge("Worker config failed", "error");
  }
}

function renderDurationDays() {
  const durationText = String(publicState.licenseDurationDays);
  publicDom.durationDays.textContent = durationText;
  publicDom.overviewDurationDays.textContent = durationText;
  publicDom.createSubmitLabel.textContent = `Aktifkan ${durationText} Hari`;
}

async function handleCreateSubmit(event) {
  event.preventDefault();
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
  setSubmitState(publicDom.createSubmitBtn, publicDom.createSubmitLabel, true, "Memproses...");

  try {
    const payload = await publicApiFetch("/api/public/license/create", {
      method: "POST",
      body: JSON.stringify({
        ip,
      }),
    });
    publicDom.createForm.reset();
    showPublicResult(
      publicDom.createResult,
      renderCreateResult(payload),
      "ok",
      true
    );
    publicDom.statusIp.value = ip;
    setPublicBanner("Aktivasi berhasil diproses. Gunakan form status untuk verifikasi bila perlu.", "ok");
  } catch (error) {
    showPublicResult(publicDom.createResult, error.message || "Create gagal.", "error");
  } finally {
    setSubmitState(
      publicDom.createSubmitBtn,
      publicDom.createSubmitLabel,
      false,
      "Memproses...",
      `Aktifkan ${publicState.licenseDurationDays} Hari`
    );
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
    setPublicBanner(`Status terbaru untuk ${ip} berhasil diambil.`, tone === "error" ? "warn" : "ok");
  } catch (error) {
    showPublicResult(publicDom.statusResult, error.message || "Check status gagal.", "error");
  } finally {
    setSubmitState(publicDom.statusSubmitBtn, publicDom.statusSubmitLabel, false, "Memeriksa...", "Check Status");
  }
}

function renderCreateResult(payload) {
  const item = payload.item || {};
  const status = item.status || "active";
  const tone = statusToTone(status);
  const daysRemaining = formatDaysRemaining(item.days_remaining);
  return `
    <div class="result-topline">
      <div>
        <h3 class="result-title">Aktivasi IP Berhasil Diproses</h3>
        <p class="result-lead">${escapeHtml(payload.message || "")}</p>
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
      <li>Gunakan IP yang sama lagi kapan pun untuk memperpanjang masa aktif.</li>
      <li>Simpan hasil ini jika Anda perlu konfirmasi ke operator.</li>
      <li>Jika VPS berganti IP, lakukan aktivasi ulang dengan IP baru.</li>
    </ul>
  `;
}

function renderStatusResult(payload, ip) {
  const tone = statusToTone(payload.status);
  const summary = describeStatus(payload);
  return `
    <div class="result-topline">
      <div>
        <h3 class="result-title">Status License</h3>
        <p class="result-lead">${escapeHtml(summary)}</p>
      </div>
      <span class="tone-chip ${tone}">${escapeHtml(statusLabel(payload.status))}</span>
    </div>
    <div class="result-grid">
      <article>
        <strong>Status</strong>
        <span>${escapeHtml(payload.status || "-")}</span>
      </article>
      <article>
        <strong>IP Dicek</strong>
        <span class="mono">${escapeHtml(ip || "-")}</span>
      </article>
      <article>
        <strong>Akses Portal Publik</strong>
        <span>${payload.allowed ? "Diizinkan" : "Tidak diizinkan"}</span>
      </article>
      <article>
        <strong>Bisa Renew Publik</strong>
        <span>${payload.renewable ? "Ya" : "Tidak"}</span>
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
    return "IP ini aktif dan masih bisa dipakai oleh VPS yang memakai IP tersebut.";
  }
  if (status === "expired") {
    return "IP ini pernah aktif, tetapi masa berlakunya sudah habis dan perlu diaktifkan ulang.";
  }
  if (status === "revoked") {
    return "IP ini sedang diblokir dan tidak bisa diaktifkan kembali dari portal publik.";
  }
  if (status === "not_found") {
    return "IP ini belum terdaftar pada portal lisensi publik.";
  }
  return "Status IP berhasil diambil dari Worker.";
}

function nextActionForStatus(payload) {
  const status = payload.status || "unknown";
  if (status === "active") {
    return "Jika ingin memperpanjang lebih awal, submit IP yang sama lagi di form aktivasi.";
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
