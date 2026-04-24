import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "../shared/ui.jsx";
import { getPublicConfig } from "../shared/config.js";
import { formatDate, formatDaysRemaining, statusLabel, statusTone } from "../shared/utils.js";
import { ArrowRight, Clock3, RotateCcw, ScanSearch, ShieldCheck, Signal, Sparkles } from "lucide-react";

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
        setBanner({ tone: "ok", message: "Portal siap dipakai. Konfigurasi worker berhasil dimuat." });
        setStatusBadge({ tone: "emerald", message: "Online" });
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
    document.getElementById("mission-control")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-6 px-4 py-5 md:px-6 md:py-6 lg:px-8">
      <section className="page-enter relative overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow)] md:p-8">
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,rgba(234,109,47,0.22),transparent_48%),radial-gradient(circle_at_top_right,rgba(15,76,129,0.18),transparent_42%)]" />
        <div className="relative grid gap-8 xl:grid-cols-[1.15fr,0.85fr]">
          <div className="space-y-7">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="accent">Public Control Surface</Badge>
              <div className="rounded-full border border-[var(--line)] bg-white/60 px-3 py-1 text-xs font-medium text-[var(--muted)]">
                Worker: <span className="text-[var(--fg)]">{statusBadge.message}</span>
              </div>
            </div>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.05em] md:text-6xl xl:text-7xl">
                Portal lisensi IP VPS yang terasa lebih seperti mission control, bukan form biasa.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[var(--muted)] md:text-lg">
                Aktivasi IP baru, renew saat window terbuka, dan cek status lisensi dari satu permukaan kerja yang ringkas. Durasi lisensi default tetap
                {" "}
                <strong>{licenseDurationDays} hari</strong>
                {" "}
                dengan jendela renew publik
                {" "}
                <strong>{renewOpenBeforeDays} hari</strong>
                {" "}
                sebelum jatuh tempo.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => document.getElementById("mission-control")?.scrollIntoView({ behavior: "smooth" })}>
                <Sparkles className="size-4" />
                Mulai Proses IP
              </Button>
              <Button variant="secondary" onClick={() => document.getElementById("status-lab")?.scrollIntoView({ behavior: "smooth" })}>
                <ScanSearch className="size-4" />
                Buka Status Lab
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <HeroSignal label="Worker" value={statusBadge.message} meta="Koneksi portal ke API lisensi" icon={Signal} />
              <HeroSignal label="Renew Window" value={`${renewOpenBeforeDays} hari`} meta="Renew publik baru dibuka saat ambang ini tercapai" icon={Clock3} />
              <HeroSignal label="Protection" value={config.turnstileSiteKey ? "Turnstile aktif" : "Turnstile off"} meta="Proteksi publik untuk aktivasi dan renew" icon={ShieldCheck} />
            </div>
          </div>

          <Card className="bg-[rgba(255,255,255,0.58)]">
            <CardHeader>
              <Badge variant="slate">Flow Preview</Badge>
              <CardTitle className="mt-3 text-2xl">Cara kerja portal ini</CardTitle>
              <CardDescription className="mt-2">
                Pengguna publik tidak perlu membuka banyak menu. UX dibagi jadi dua jalur yang jelas: mutasi state dan inspeksi status.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TimelineStep number="01" title="Masukkan IPv4 publik VPS" copy="Gunakan IP final yang memang dipakai server saat dicek oleh autoscript client." />
              <TimelineStep number="02" title="Verifikasi keamanan" copy="Turnstile wajib diselesaikan sebelum aktivasi atau renew dijalankan." />
              <TimelineStep number="03" title="Proses atau cek status" copy="Portal akan mengarahkan tindakan berikutnya berdasarkan state lisensi yang dikembalikan worker." />
              <div className="rounded-[1.4rem] border border-[var(--line)] bg-white/70 p-4 text-sm leading-6 text-[var(--muted)]">
                Support:
                {" "}
                <a className="font-semibold text-[var(--accent-strong)] underline underline-offset-4" href="mailto:autoscript@atomicmail.io">
                  autoscript@atomicmail.io
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Alert className="page-enter stagger-1" tone={banner.tone}>{banner.message}</Alert>

      <section className="page-enter stagger-2 grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <Card id="mission-control" className="bg-[var(--panel-strong)]">
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <Badge variant="accent">Mission Control</Badge>
                <CardTitle className="mt-3 text-3xl">Aktivasi dan renew dari satu panel utama</CardTitle>
                <CardDescription className="mt-2">
                  {processMode === "renew"
                    ? "Mode renew sedang aktif. Portal akan memperpanjang hanya jika entry memang sudah masuk jendela renew."
                    : "Gunakan mode ini untuk IP baru, IP expired, atau hasil tindak lanjut dari status checker."}
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={processMode === "renew" ? "amber" : "emerald"}>{processMode === "renew" ? "Renew Mode" : "Activation Mode"}</Badge>
                {processMode === "renew" ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setProcessMode("activate")}>
                    <RotateCcw className="size-4" />
                    Kembali ke Aktivasi
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <ProcessMetric label="Target action" value={processMode === "renew" ? "Perpanjang entry aktif" : "Buat / hidupkan lisensi"} />
              <ProcessMetric label="Verification" value={turnstileToken ? "Verified" : "Pending"} />
              <ProcessMetric label="Default duration" value={`${licenseDurationDays} hari`} />
            </div>
            <form className="space-y-4" onSubmit={handleCreateSubmit}>
              <Field label="IPv4 VPS" help="Masukkan public IPv4 VPS yang dipakai server.">
                <Input value={createIp} onChange={(event) => setCreateIp(event.target.value)} placeholder="123.45.67.89" />
              </Field>
              <div className="rounded-[1.5rem] border border-dashed border-[var(--line-strong)] bg-[rgba(255,255,255,0.64)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Verifikasi Keamanan</div>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {config.turnstileSiteKey
                        ? turnstileToken
                          ? "Turnstile sudah valid. Jalur mutasi siap dipakai."
                          : "Selesaikan verifikasi sebelum menekan tombol proses."
                        : "Turnstile belum dikonfigurasi."}
                    </p>
                  </div>
                  <Badge variant={turnstileToken ? "emerald" : "slate"}>{turnstileToken ? "Verified" : "Waiting"}</Badge>
                </div>
                <div ref={turnstileSlotRef} className="mt-4 min-h-16" />
              </div>
              <div className="flex flex-col gap-3 md:flex-row">
                <Button className="flex-1" disabled={createLoading || !turnstileToken}>
                  {createLoading ? "Memproses..." : processMode === "renew" ? "Jalankan Renew" : "Jalankan Aktivasi"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setCreateIp("");
                    setCreateResult(null);
                    setProcessMode("activate");
                  }}
                >
                  Reset
                </Button>
              </div>
            </form>
            <ResultPanel result={createResult} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card id="status-lab" className="bg-[var(--panel-strong)]">
            <CardHeader>
              <Badge variant="slate">Status Lab</Badge>
              <CardTitle className="mt-3 text-3xl">Inspeksi status sebelum ambil tindakan</CardTitle>
              <CardDescription className="mt-2">
                Jalur ini tidak mengubah state lisensi. Pakai untuk memastikan apakah IP masih aktif, expired, atau perlu diarahkan ke renew/support.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <form className="space-y-4" onSubmit={handleStatusSubmit}>
                <Field label="IPv4 VPS" help="Gunakan IP yang sama dengan target lisensi yang ingin dicek.">
                  <Input value={statusIp} onChange={(event) => setStatusIp(event.target.value)} placeholder="123.45.67.89" />
                </Field>
                <Button className="w-full" variant="secondary" disabled={statusLoading}>
                  {statusLoading ? "Memeriksa..." : "Analisis Status"}
                </Button>
              </form>
              <StatusResultPanel result={statusResult} onAction={applyStatusAction} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Badge variant="accent">Aturan Operasi</Badge>
              <CardTitle className="mt-3">Panduan singkat yang benar-benar dipakai user</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <RuleItem title="Aktivasi ulang ditolak saat entry masih aktif.">
                Jalankan status check dulu jika ragu apakah IP sudah aktif atau belum.
              </RuleItem>
              <RuleItem title={`Renew publik dibuka saat sisa aktif ${renewOpenBeforeDays} hari atau kurang.`}>
                Portal status akan mengarahkan user ke renew mode jika waktunya sudah tepat.
              </RuleItem>
              <RuleItem title="IP baru berarti entry baru.">
                Jika VPS pindah IP, proses lisensi dilakukan terhadap IP pengganti itu sendiri.
              </RuleItem>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function HeroSignal({ label, value, meta, icon: Icon }) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/62 p-4 shadow-[0_16px_36px_rgba(16,24,40,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
        <Icon className="size-4 text-[var(--accent-strong)]" />
      </div>
      <div className="mt-3 text-xl font-semibold tracking-[-0.03em]">{value}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{meta}</div>
    </div>
  );
}

function TimelineStep({ number, title, copy }) {
  return (
    <div className="grid grid-cols-[auto,1fr] gap-4 rounded-[1.4rem] border border-[var(--line)] bg-white/68 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
      <div className="flex size-11 items-center justify-center rounded-full bg-[var(--fg)] text-sm font-semibold text-white">{number}</div>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="mt-1 text-sm leading-6 text-[var(--muted)]">{copy}</div>
      </div>
    </div>
  );
}

function ProcessMetric({ label, value }) {
  return (
    <div className="rounded-[1.3rem] border border-[var(--line)] bg-white/62 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium">{value}</div>
    </div>
  );
}

function Field({ label, help, children }) {
  return (
    <label className="block space-y-2">
      <div className="text-sm font-medium">{label}</div>
      {children}
      <div className="text-sm leading-6 text-[var(--muted)]">{help}</div>
    </label>
  );
}

function RuleItem({ title, children }) {
  return (
    <div className="rounded-[1.4rem] border border-[var(--line)] bg-white/65 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.32)]">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-sm leading-6 text-[var(--muted)]">{children}</div>
    </div>
  );
}

function ResultPanel({ result }) {
  if (!result) return null;
  const body = result.body || {};
  const item = body.item || body;
  return (
    <div className="space-y-4 rounded-[1.6rem] border border-[var(--line)] bg-[rgba(255,255,255,0.74)] p-4 shadow-[0_18px_42px_rgba(16,24,40,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Mutation Result</div>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{result.title}</h3>
        </div>
        <Badge variant={result.tone}>{statusLabel(item.status || result.tone)}</Badge>
      </div>
      {item.message ? (
        <div className="rounded-[1.2rem] border border-[var(--line)] bg-white/70 px-3 py-3 text-sm leading-6 text-[var(--muted)]">
          {item.message}
        </div>
      ) : null}
      {item.ip ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Stat label="IP" value={item.ip} mono />
          {"entry_id" in item ? <Stat label="Entry ID" value={item.entry_id || "-"} mono /> : null}
          {"expires_at" in item ? <Stat label="Aktif sampai" value={formatDate(item.expires_at)} /> : null}
          {"days_remaining" in item ? <Stat label="Sisa waktu" value={formatDaysRemaining(item.days_remaining)} /> : null}
          {"renewable" in item ? <Stat label="Bisa renew" value={item.renewable ? "Ya" : "Tidak"} /> : null}
          {"allowed" in item ? <Stat label="Akses publik" value={item.allowed ? "Diizinkan" : "Tidak"} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function StatusResultPanel({ result, onAction }) {
  if (!result) return null;
  const item = result.body || {};
  const nextAction = item.next_action || {};
  return (
    <div className="space-y-4 rounded-[1.6rem] border border-[var(--line)] bg-[rgba(255,255,255,0.74)] p-4 shadow-[0_18px_42px_rgba(16,24,40,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Inspection Result</div>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{result.title}</h3>
        </div>
        <Badge variant={result.tone}>{statusLabel(item.status || result.tone)}</Badge>
      </div>

      {item.detail_message ? (
        <div className="rounded-[1.2rem] border border-[var(--line)] bg-white/70 px-3 py-3 text-sm leading-6 text-[var(--muted)]">
          {item.detail_message}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Stat label="IP dicek" value={item.ip} mono />
        <Stat label="Akses publik" value={item.allowed ? "Diizinkan" : "Tidak"} />
        <Stat label="Aktif sampai" value={formatDate(item.expires_at)} />
        <Stat label="Sisa waktu" value={formatDaysRemaining(item.days_remaining)} />
        <Stat label="Bisa renew" value={item.renewable ? "Ya" : "Tidak"} />
        <Stat label="Jendela renew" value={`${item.renew_open_before_days || 0} hari`} />
        {Number(item.renew_opens_in_days || 0) > 0 ? <Stat label="Renew dibuka dalam" value={formatDaysRemaining(item.renew_opens_in_days)} /> : null}
      </div>

      <div className="rounded-[1.4rem] border border-[var(--line)] bg-white/72 p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Aksi berikutnya</div>
        <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{nextAction.help || "Tidak ada tindakan lanjutan."}</div>
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
    <div className="rounded-[1.2rem] border border-[var(--line)] bg-white/72 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</div>
      <div className={`mt-2 text-sm ${mono ? "font-mono break-all" : "font-medium"}`}>{value || "-"}</div>
    </div>
  );
}

function describeStatus(payload) {
  const status = String(payload?.status || "").toLowerCase();
  if (status === "active") return "IP masih aktif dan berada dalam cakupan lisensi.";
  if (status === "expired") return "IP sudah expired dan perlu diproses ulang.";
  if (status === "revoked") return "IP sedang revoked dan tidak dapat memakai jalur publik normal.";
  if (status === "not_found") return "IP belum tercatat di sistem lisensi.";
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
