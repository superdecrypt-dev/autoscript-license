import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "../shared/ui.jsx";
import { getPublicConfig } from "../shared/config.js";
import { formatDate, formatDaysRemaining, statusLabel, statusTone } from "../shared/utils.js";
import { ArrowRight, Clock3, RotateCcw, Signal } from "lucide-react";

function PublicApp() {
  const config = useMemo(() => getPublicConfig(), []);
  const turnstileSlotRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);
  const [banner, setBanner] = useState({ tone: "muted", message: "Mengambil konfigurasi..." });
  const [statusBadge, setStatusBadge] = useState({ tone: "slate", message: "Memuat" });
  const [licenseDurationDays, setLicenseDurationDays] = useState(14);
  const [renewOpenBeforeDays, setRenewOpenBeforeDays] = useState(3);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [createIp, setCreateIp] = useState("");
  const [statusIp, setStatusIp] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [createResult, setCreateResult] = useState(null);
  const [statusResult, setStatusResult] = useState(null);
  const [processMode, setProcessMode] = useState("activate");

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const payload = await publicApiFetch(config.apiBaseUrl, "/api/public/config");
        if (!active) return;
        setLicenseDurationDays(Number(payload.license_duration_days || 14));
        setRenewOpenBeforeDays(Number(payload.renew_open_before_days || 3));
        setBanner({ tone: "ok", message: "Konfigurasi Worker siap digunakan." });
        setStatusBadge({ tone: "emerald", message: "Siap" });
      } catch (error) {
        if (!active) return;
        setBanner({ tone: "error", message: error.message || "Gagal mengambil konfigurasi." });
        setStatusBadge({ tone: "rose", message: "Gangguan" });
      }
    }
    bootstrap();
    return () => {
      active = false;
    };
  }, [config.apiBaseUrl]);

  useEffect(() => {
    let cancelled = false;
    async function initTurnstile() {
      if (!config.turnstileSiteKey || !turnstileSlotRef.current) return;
      const ready = await loadTurnstileScript();
      if (!ready || cancelled || !window.turnstile?.render) return;
      if (turnstileWidgetIdRef.current !== null) return;
      turnstileWidgetIdRef.current = window.turnstile.render(turnstileSlotRef.current, {
        sitekey: config.turnstileSiteKey,
        theme: "light",
        callback(token) {
          setTurnstileToken(String(token || "").trim());
        },
        "expired-callback"() {
          setTurnstileToken("");
        },
        "error-callback"() {
          setTurnstileToken("");
        },
      });
    }
    initTurnstile();
    return () => {
      cancelled = true;
    };
  }, [config.turnstileSiteKey]);

  async function handleCreateSubmit(event) {
    event.preventDefault();
    const ip = String(createIp || "").trim();
    if (!ip) {
      setCreateResult({ tone: "error", title: "IP wajib diisi.", body: null });
      return;
    }
    if (!turnstileToken) {
      setCreateResult({ tone: "warn", title: "Selesaikan verifikasi keamanan dulu.", body: null });
      return;
    }
    setCreateLoading(true);
    setCreateResult(null);
    try {
      const endpoint = processMode === "renew" ? "/api/public/license/renew" : "/api/public/license/activate";
      const payload = await publicApiFetch(config.apiBaseUrl, endpoint, {
        method: "POST",
        body: JSON.stringify({
          ip,
          turnstile_token: turnstileToken,
        }),
      });
      setBanner({ tone: "ok", message: `IP ${ip} berhasil diproses.` });
      setCreateResult({
        tone: statusTone(payload?.item?.status || "active"),
        title: payload.message || (processMode === "renew" ? "IP berhasil diperpanjang." : "IP berhasil diproses."),
        body: payload,
      });
      setProcessMode("activate");
      setTurnstileToken("");
      if (window.turnstile?.reset && turnstileWidgetIdRef.current !== null) {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      }
    } catch (error) {
      setCreateResult({ tone: "error", title: error.message || "Proses IP gagal.", body: null });
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleStatusSubmit(event) {
    event.preventDefault();
    const ip = String(statusIp || "").trim();
    if (!ip) {
      setStatusResult({ tone: "error", title: "IP wajib diisi.", body: null });
      return;
    }
    setStatusLoading(true);
    setStatusResult(null);
    try {
      const payload = await publicApiFetch(config.apiBaseUrl, "/api/public/license/status", {
        method: "POST",
        body: JSON.stringify({
          ip,
        }),
      });
      setBanner({ tone: "ok", message: `Status ${ip} berhasil diambil.` });
      setStatusResult({
        kind: "status",
        tone: statusTone(payload?.status),
        title: describeStatus(payload),
        body: payload,
      });
    } catch (error) {
      setStatusResult({ tone: "error", title: error.message || "Check status gagal.", body: null });
    } finally {
      setStatusLoading(false);
    }
  }

  function applyStatusAction(payload) {
    const item = payload || {};
    const nextAction = item.next_action || {};
    if (!nextAction.kind || nextAction.kind === "none") return;
    if (nextAction.kind === "contact_support" && nextAction.href) {
      window.location.href = nextAction.href;
      return;
    }
    setCreateIp(String(item.ip || "").trim());
    setProcessMode(nextAction.kind === "renew" ? "renew" : "activate");
    document.getElementById("process-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
      <section className="page-enter overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow)]">
        <div className="px-6 py-8 md:px-10 md:py-12">
          <div className="space-y-5">
            <Badge variant="accent">IP Access</Badge>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">Autoscript IP License</h1>
              <p className="max-w-2xl text-base leading-7 text-[var(--muted)] md:text-lg">
                Aktivasi, perpanjang, dan cek status lisensi IP VPS dalam satu halaman. Masa aktif default tetap <strong>{licenseDurationDays} hari</strong>.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => document.getElementById("process-card")?.scrollIntoView({ behavior: "smooth" })}>Proses IP</Button>
              <Button variant="secondary" onClick={() => document.getElementById("status-card")?.scrollIntoView({ behavior: "smooth" })}>Cek Status</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <HeroStat label="Worker" value={statusBadge.message} icon={Signal} />
              <HeroStat label="Renew Window" value={`${renewOpenBeforeDays} hari`} icon={Clock3} />
            </div>
          </div>
        </div>
      </section>

      <Alert className="page-enter stagger-1" tone={banner.tone}>{banner.message}</Alert>

      <div className="page-enter stagger-3 grid gap-6 lg:grid-cols-2">
        <Card id="process-card" className="bg-[var(--panel-strong)]">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Badge variant="accent">Proses</Badge>
                <CardTitle className="mt-3 text-2xl">Proses IP</CardTitle>
                <CardDescription className="mt-2">
                  {processMode === "renew"
                    ? "Mode renew publik aktif. Gunakan untuk IP yang masih aktif dan sudah masuk jendela perpanjangan."
                    : "Untuk IP baru atau IP yang sudah expired."}
                </CardDescription>
              </div>
              <Badge variant={processMode === "renew" ? "amber" : "emerald"}>{processMode === "renew" ? "Renew" : "Aktivasi"}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {processMode === "renew" ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3 text-sm text-[var(--muted)]">
                <span>Mode sekarang: renew publik.</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setProcessMode("activate")}>
                  <RotateCcw className="size-4" />
                  Pakai Aktivasi
                </Button>
              </div>
            ) : null}
            <form className="space-y-4" onSubmit={handleCreateSubmit}>
              <Field label="IPv4 VPS" help="Masukkan public IPv4 VPS yang dipakai server.">
                <Input value={createIp} onChange={(event) => setCreateIp(event.target.value)} placeholder="123.45.67.89" />
              </Field>
              <div className="space-y-3 rounded-2xl border border-dashed border-[var(--line)] bg-white/60 p-4">
                <div className="text-sm font-medium">Verifikasi Keamanan</div>
                <div ref={turnstileSlotRef} className="min-h-16" />
                <p className="text-sm text-[var(--muted)]">
                  {config.turnstileSiteKey
                    ? turnstileToken
                      ? "Verifikasi selesai. Anda bisa memproses IP."
                      : "Selesaikan verifikasi keamanan sebelum aktivasi."
                    : "Turnstile belum dikonfigurasi."}
                </p>
              </div>
              <Button className="w-full" disabled={createLoading || !turnstileToken}>
                {createLoading ? "Memproses..." : processMode === "renew" ? "Renew IP" : "Proses IP"}
              </Button>
            </form>
            <ResultPanel result={createResult} />
          </CardContent>
        </Card>

        <Card id="status-card" className="bg-[var(--panel-strong)]">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Badge variant="slate">Status</Badge>
                <CardTitle className="mt-3 text-2xl">Cek Status</CardTitle>
                <CardDescription className="mt-2">Lihat apakah IP aktif, expired, atau revoked tanpa mengubah state lisensi.</CardDescription>
              </div>
              <Badge variant="slate">Cek Saja</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <form className="space-y-4" onSubmit={handleStatusSubmit}>
              <Field label="IPv4 VPS" help="Gunakan IP yang sama dengan yang ingin dicek.">
                <Input value={statusIp} onChange={(event) => setStatusIp(event.target.value)} placeholder="123.45.67.89" />
              </Field>
              <Button className="w-full" variant="secondary" disabled={statusLoading}>
                {statusLoading ? "Memeriksa..." : "Cek Status"}
              </Button>
            </form>
            <StatusResultPanel result={statusResult} onAction={applyStatusAction} />
          </CardContent>
        </Card>
      </div>

      <Card className="page-enter stagger-3">
        <CardHeader>
          <Badge variant="slate">Aturan Singkat</Badge>
          <CardTitle className="mt-3">Aturan</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <RuleItem>Aktivasi ulang ditolak jika IP masih aktif.</RuleItem>
          <RuleItem>Renew publik baru dibuka saat sisa aktif {renewOpenBeforeDays} hari atau kurang.</RuleItem>
          <RuleItem>Jika VPS pindah IP, aktifkan ulang dengan IP baru.</RuleItem>
          <RuleItem>
            Support:{" "}
            <a className="font-medium text-[var(--accent-strong)] underline underline-offset-4" href="mailto:autoscript@atomicmail.io">
              autoscript@atomicmail.io
            </a>
          </RuleItem>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, help, children }) {
  return (
    <label className="block space-y-2">
      <div className="text-sm font-medium">{label}</div>
      {children}
      <div className="text-sm text-[var(--muted)]">{help}</div>
    </label>
  );
}

function RuleItem({ children }) {
  return <div className="rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3 text-sm leading-6 text-[var(--muted)]">{children}</div>;
}

function HeroStat({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</div>
        <Icon className="size-4 text-[var(--accent-strong)]" />
      </div>
      <div className="mt-2 text-sm font-medium">{value}</div>
    </div>
  );
}

function ResultPanel({ result }) {
  if (!result) return null;
  const body = result.body || {};
  const item = body.item || body;
  return (
    <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-white/70 p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Result</div>
          <h3 className="mt-2 text-lg font-semibold">{result.title}</h3>
        </div>
        <Badge variant={result.tone}>{statusLabel(item.status || result.tone)}</Badge>
      </div>
      {item.message ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--muted)]">
          {item.message}
        </div>
      ) : null}
      {item.ip ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Stat label="IP" value={item.ip} />
          {"entry_id" in item ? <Stat label="Entry ID" value={item.entry_id || "-"} mono /> : null}
          {"expires_at" in item ? <Stat label="Aktif Sampai" value={formatDate(item.expires_at)} /> : null}
          {"days_remaining" in item ? <Stat label="Sisa Waktu" value={formatDaysRemaining(item.days_remaining)} /> : null}
          {"renewable" in item ? <Stat label="Bisa Renew" value={item.renewable ? "Ya" : "Tidak"} /> : null}
          {"allowed" in item ? <Stat label="Akses Publik" value={item.allowed ? "Diizinkan" : "Tidak"} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function StatusResultPanel({ result, onAction }) {
  if (!result) return null;
  const item = result.body || {};
  const nextAction = item.next_action || {};
  const statusBadgeLabel = statusLabel(item.status || result.tone);
  return (
    <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-white/70 p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Status</div>
          <h3 className="mt-2 text-lg font-semibold">{result.title}</h3>
        </div>
        <Badge variant={result.tone}>{statusBadgeLabel}</Badge>
      </div>

      {item.detail_message ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--muted)]">
          {item.detail_message}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Stat label="IP Dicek" value={item.ip} mono />
        <Stat label="Akses Publik" value={item.allowed ? "Diizinkan" : "Tidak"} />
        <Stat label="Aktif Sampai" value={formatDate(item.expires_at)} />
        <Stat label="Sisa Waktu" value={formatDaysRemaining(item.days_remaining)} />
        <Stat label="Bisa Renew" value={item.renewable ? "Ya" : "Tidak"} />
        <Stat label="Jendela Renew" value={`${item.renew_open_before_days || 0} hari`} />
        {Number(item.renew_opens_in_days || 0) > 0 ? (
          <Stat label="Renew Dibuka Dalam" value={formatDaysRemaining(item.renew_opens_in_days)} />
        ) : null}
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Tindakan Berikutnya</div>
        <div className="mt-2 text-sm text-[var(--muted)]">{nextAction.help || "Tidak ada tindakan lanjutan."}</div>
        {nextAction.kind && nextAction.kind !== "none" ? (
          <div className="mt-4">
            <Button type="button" onClick={() => onAction?.(item)}>
              {nextAction.kind === "renew" ? <RotateCcw className="size-4" /> : <ArrowRight className="size-4" />}
              {nextAction.label || "Lanjut"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value, mono = false }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</div>
      <div className={`mt-1 text-sm ${mono ? "font-mono" : ""}`}>{value || "-"}</div>
    </div>
  );
}

function describeStatus(payload) {
  const status = String(payload?.status || "").toLowerCase();
  if (status === "active") return "IP aktif.";
  if (status === "expired") return "IP expired.";
  if (status === "revoked") return "IP revoked.";
  if (status === "not_found") return "IP belum terdaftar.";
  return "Status lisensi berhasil diambil.";
}

async function publicApiFetch(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
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

async function loadTurnstileScript() {
  if (window.turnstile?.render) return true;
  return new Promise((resolve) => {
    const existing = document.querySelector("script[data-turnstile]");
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = "1";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

createRoot(document.getElementById("root")).render(<PublicApp />);
