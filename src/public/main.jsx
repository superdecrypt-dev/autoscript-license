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
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900">
      {/* Left Branding Panel */}
      <div className="md:w-5/12 bg-slate-900 text-white p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 80% 70%, #8b5cf6 0%, transparent 50%)' }} />
        
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-2">
            <div className="size-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/50">
              <ShieldCheck className="size-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">Autoscript</span>
          </div>
          
          <div className="mt-16 space-y-4">
            <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">License Portal</Badge>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
              Akses Instan ke <br />
              <span className="text-blue-400">Infrastruktur Anda.</span>
            </h1>
            <p className="text-slate-400 text-lg max-w-md leading-relaxed">
              Kelola lisensi IP VPS Anda dengan aman. Sistem terintegrasi dengan validasi otomatis dan proteksi anti-bot.
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-12 grid grid-cols-2 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Cpu className="size-4 text-blue-400" />
              <span className="text-xs font-semibold uppercase tracking-wider">Worker Status</span>
            </div>
            <div className="font-medium flex items-center gap-2">
              <div className={`size-2 rounded-full ${statusBadge.tone === 'emerald' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              {statusBadge.message}
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Clock3 className="size-4 text-blue-400" />
              <span className="text-xs font-semibold uppercase tracking-wider">Default Duration</span>
            </div>
            <div className="font-medium text-white">{licenseDurationDays} Hari</div>
          </div>
        </div>
      </div>

      {/* Right Interaction Panel */}
      <div className="flex-1 p-6 md:p-12 overflow-y-auto flex items-center justify-center">
        <div className="w-full max-w-xl space-y-6">
          <Alert tone={banner.tone} className="shadow-sm bg-white">
            {banner.message}
          </Alert>

          <Card className="border-slate-200 shadow-xl shadow-slate-200/40 bg-white">
            <div className="flex border-b border-slate-100 bg-slate-50 rounded-t-xl overflow-hidden">
                <button 
                  className={`flex-1 py-4 text-sm font-bold transition-colors ${processMode !== "status" ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
                  onClick={() => setProcessMode("activate")}
                >
                  Proses IP
                </button>
                <button 
                  className={`flex-1 py-4 text-sm font-bold transition-colors ${processMode === "status" ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}
                  onClick={() => setProcessMode("status")}
                >
                  Cek Status
                </button>
            </div>

            <CardContent className="p-6 pt-8">
              {processMode !== "status" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Aktivasi & Perpanjangan</h3>
                      <p className="text-sm text-slate-500">
                        {processMode === "renew" ? "Mode perpanjangan lisensi publik aktif." : "Daftarkan IP baru ke sistem."}
                      </p>
                    </div>
                    <Badge variant={processMode === "renew" ? "amber" : "emerald"}>
                      {processMode === "renew" ? "Renew Mode" : "Activate Mode"}
                    </Badge>
                  </div>

                  {processMode === "renew" && (
                    <div className="bg-amber-50 text-amber-800 p-3 rounded-xl border border-amber-200 text-sm flex justify-between items-center">
                      <span>Anda sedang memperpanjang lisensi.</span>
                      <Button type="button" size="sm" variant="ghost" className="h-8 hover:bg-amber-100" onClick={() => setProcessMode("activate")}>
                        <RotateCcw className="size-3 mr-1" /> Batal
                      </Button>
                    </div>
                  )}

                  <form onSubmit={handleCreateSubmit} className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Alamat IPv4</label>
                      <Input 
                        placeholder="e.g. 103.45.67.89" 
                        value={createIp}
                        onChange={e => setCreateIp(e.target.value)}
                        className="font-mono text-lg py-6"
                      />
                      <p className="text-xs text-slate-500">Masukkan IP publik VPS yang akan digunakan.</p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-slate-700">Verifikasi Keamanan</span>
                        <Badge variant={turnstileToken ? "emerald" : "slate"}>{turnstileToken ? "Verified" : "Pending"}</Badge>
                      </div>
                      <div ref={turnstileSlotRef} className="min-h-[65px] flex justify-center" />
                    </div>

                    <Button className="w-full h-12 text-base font-bold" disabled={createLoading || !turnstileToken}>
                      {createLoading ? "Memproses..." : processMode === "renew" ? "Perpanjang Lisensi" : "Aktivasi Lisensi"}
                      <ArrowRight className="ml-2 size-4" />
                    </Button>
                  </form>

                  <ResultPanel result={createResult} />
                </div>
              )}

              {processMode === "status" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Pengecekan Status</h3>
                    <p className="text-sm text-slate-500">Periksa detail lisensi IP tanpa modifikasi data.</p>
                  </div>

                  <form onSubmit={handleStatusSubmit} className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Alamat IPv4</label>
                      <Input 
                        placeholder="e.g. 103.45.67.89" 
                        value={statusIp}
                        onChange={e => setStatusIp(e.target.value)}
                        className="font-mono text-lg py-6"
                      />
                    </div>
                    <Button variant="secondary" className="w-full h-12 text-base font-bold bg-slate-100 hover:bg-slate-200 border-slate-300" disabled={statusLoading}>
                      <Search className="mr-2 size-4" />
                      {statusLoading ? "Memeriksa..." : "Cek Status Lisensi"}
                    </Button>
                  </form>

                  <StatusResultPanel result={statusResult} onAction={applyStatusAction} />
                </div>
              )}
            </CardContent>
          </Card>
          
          <div className="text-center text-sm text-slate-500 pt-4">
             Support: <a href="mailto:autoscript@atomicmail.io" className="font-bold text-blue-600 hover:underline">autoscript@atomicmail.io</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultPanel({ result }) {
  if (!result) return null;
  const body = result.body || {};
  const item = body.item || body;
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Hasil</div>
          <h3 className="mt-1 text-base font-bold text-slate-900">{result.title}</h3>
        </div>
        <Badge variant={result.tone}>{statusLabel(item.status || result.tone)}</Badge>
      </div>
      {item.message && (
        <div className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm text-slate-600">
          {item.message}
        </div>
      )}
      {item.ip && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label="IP" value={item.ip} mono />
          {"expires_at" in item && <Stat label="Aktif Sampai" value={formatDate(item.expires_at)} />}
          {"days_remaining" in item && <Stat label="Sisa Waktu" value={formatDaysRemaining(item.days_remaining)} />}
          {"allowed" in item && <Stat label="Akses Publik" value={item.allowed ? "Diizinkan" : "Ditolak"} />}
        </div>
      )}
    </div>
  );
}

function StatusResultPanel({ result, onAction }) {
  if (!result) return null;
  const item = result.body || {};
  const nextAction = item.next_action || {};
  const statusBadgeLabel = statusLabel(item.status || result.tone);
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</div>
          <h3 className="mt-1 text-base font-bold text-slate-900">{result.title}</h3>
        </div>
        <Badge variant={result.tone}>{statusBadgeLabel}</Badge>
      </div>

      {item.detail_message && (
        <div className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm text-slate-600">
          {item.detail_message}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="IP Dicek" value={item.ip} mono />
        <Stat label="Akses Publik" value={item.allowed ? "Diizinkan" : "Ditolak"} />
        <Stat label="Aktif Sampai" value={formatDate(item.expires_at)} />
        <Stat label="Sisa Waktu" value={formatDaysRemaining(item.days_remaining)} />
        <Stat label="Bisa Renew" value={item.renewable ? "Ya" : "Tidak"} />
        <Stat label="Jendela Renew" value={`${item.renew_open_before_days || 0} hari`} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tindakan Berikutnya</div>
        <div className="mt-1 text-sm text-slate-600">{nextAction.help || "Tidak ada tindakan lanjutan."}</div>
        {nextAction.kind && nextAction.kind !== "none" && (
          <div className="mt-4">
            <Button type="button" size="sm" onClick={() => onAction?.(item)}>
              {nextAction.kind === "renew" ? <RotateCcw className="size-4 mr-2" /> : <ArrowRight className="size-4 mr-2" />}
              {nextAction.label || "Lanjut"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, mono = false }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1 text-sm text-slate-900 ${mono ? "font-mono" : "font-medium"}`}>{value || "-"}</div>
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
