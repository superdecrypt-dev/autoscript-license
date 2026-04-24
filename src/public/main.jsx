import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "../shared/ui.jsx";
import { getPublicConfig } from "../shared/config.js";
import { formatDate, formatDaysRemaining, statusLabel, statusTone } from "../shared/utils.js";
import { ArrowRight, CheckCircle2, Clock3, Radar, RefreshCw, ScanSearch, ShieldCheck, Sparkles } from "lucide-react";

function PublicApp() {
  const config = useMemo(() => getPublicConfig(), []);
  const turnstileSlotRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);
  const [banner, setBanner] = useState({ tone: "muted", message: "Mengambil konfigurasi portal..." });
  const [statusBadge, setStatusBadge] = useState({ tone: "slate", message: "Booting" });
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
        setBanner({ tone: "ok", message: "Portal publik siap dipakai. Worker merespons dengan normal." });
        setStatusBadge({ tone: "emerald", message: "Online" });
      } catch (error) {
        if (!active) return;
        setBanner({ tone: "error", message: error.message || "Gagal mengambil konfigurasi portal." });
        setStatusBadge({ tone: "rose", message: "Unavailable" });
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
      setCreateResult({ tone: "warn", title: "Selesaikan verifikasi keamanan sebelum melanjutkan.", body: null });
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
      setBanner({ tone: "ok", message: `IP ${ip} berhasil diproses oleh worker.` });
      setCreateResult({
        tone: statusTone(payload?.item?.status || "active"),
        title: payload.message || (processMode === "renew" ? "Renew berhasil diproses." : "Aktivasi berhasil diproses."),
        body: payload,
      });
      setProcessMode("activate");
      setTurnstileToken("");
      if (window.turnstile?.reset && turnstileWidgetIdRef.current !== null) {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      }
    } catch (error) {
      setCreateResult({ tone: "error", title: error.message || "Mutasi lisensi gagal.", body: null });
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
        body: JSON.stringify({ ip }),
      });
      setBanner({ tone: "ok", message: `Status ${ip} berhasil dimuat.` });
      setStatusResult({
        kind: "status",
        tone: statusTone(payload?.status),
        title: describeStatus(payload),
        body: payload,
      });
    } catch (error) {
      setStatusResult({ tone: "error", title: error.message || "Gagal membaca status lisensi.", body: null });
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
    document.getElementById("action-station")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const createItem = createResult?.body?.item || createResult?.body || {};
  const statusItem = statusResult?.body || {};

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1520px] flex-col gap-6 px-4 py-5 md:px-6 md:py-6 lg:px-8">
      <section className="page-enter overflow-hidden rounded-[2.25rem] border border-[var(--line)] bg-[linear-gradient(135deg,rgba(255,250,244,0.96),rgba(245,238,227,0.84))] shadow-[var(--shadow)]">
        <div className="grid gap-6 p-5 md:p-8 xl:grid-cols-[1.08fr,0.92fr] xl:p-10">
          <div className="space-y-7">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="accent">Public Launchpad</Badge>
              <div className="rounded-full border border-[var(--line)] bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Worker {statusBadge.message}
              </div>
            </div>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.06em] md:text-6xl xl:text-7xl">
                Lisensi VPS terasa seperti workspace yang membimbing, bukan sekadar form submit.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[var(--muted)] md:text-lg">
                Halaman publik dibelah jadi dua jalur kerja yang jelas. Jalur pertama untuk aktivasi atau renew, jalur kedua untuk diagnosis state lisensi
                sebelum user memutuskan tindakan berikutnya.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <HeroStat icon={Sparkles} label="License Span" value={`${licenseDurationDays} hari`} detail="Durasi default lisensi publik." />
              <HeroStat icon={Clock3} label="Renew Window" value={`${renewOpenBeforeDays} hari`} detail="Publik baru bisa renew saat ambang ini tercapai." />
              <HeroStat icon={ShieldCheck} label="Security" value={config.turnstileSiteKey ? "Turnstile on" : "Turnstile off"} detail="Proteksi untuk jalur mutasi lisensi." />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => document.getElementById("action-station")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                <ArrowRight className="size-4" />
                Buka Action Station
              </Button>
              <Button variant="secondary" onClick={() => document.getElementById("status-deck")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                <Radar className="size-4" />
                Buka Status Deck
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            <Card className="border-white/70 bg-white/72">
              <CardHeader>
                <Badge variant="slate">Flow Map</Badge>
                <CardTitle className="mt-3 text-2xl">Tiga langkah, dua jalur kerja</CardTitle>
                <CardDescription className="mt-2">
                  Pengguna publik tidak perlu menebak. Status checker memberi konteks, action station mengeksekusi keputusan.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <FlowLane step="01" title="Masukkan IPv4 publik VPS" copy="Masukkan IP publik final yang benar-benar dipakai server pada saat request lisensi." />
                <FlowLane step="02" title="Validasi dan cek state" copy="Gunakan status checker bila ragu, atau lanjutkan langsung ke action station bila state-nya sudah jelas." />
                <FlowLane step="03" title="Ikuti rekomendasi worker" copy="Hasil status akan mengarahkan ke aktivasi, renew, atau eskalasi support bila diperlukan." />
              </CardContent>
            </Card>
            <Card className="border-white/70 bg-[linear-gradient(180deg,rgba(15,76,129,0.08),rgba(255,255,255,0.82))]">
              <CardHeader>
                <Badge variant="emerald">Operator Notes</Badge>
                <CardTitle className="mt-3 text-2xl">Aturan kerja yang paling sering dipakai</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
                <MiniRule title="Status dulu jika ragu">
                  Aktivasi ulang untuk entry aktif bisa ditolak. Jalankan pemeriksaan status sebelum submit mutasi.
                </MiniRule>
                <MiniRule title="Renew tidak selalu terbuka">
                  Window renew baru aktif saat sisa masa aktif sudah cukup dekat dengan tanggal jatuh tempo.
                </MiniRule>
                <MiniRule title="IP baru berarti target baru">
                  Bila VPS berganti IP, lisensi diproses terhadap IP pengganti itu sendiri, bukan histori IP lama.
                </MiniRule>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Alert className="page-enter stagger-1" tone={banner.tone}>{banner.message}</Alert>

      <section className="grid gap-6 xl:grid-cols-[1.02fr,0.98fr]">
        <Card id="action-station" className="page-enter stagger-2 overflow-hidden border-[rgba(234,109,47,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(249,241,231,0.9))]">
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <Badge variant="accent">Action Station</Badge>
                <CardTitle className="mt-3 text-3xl">Aktivasi dan renew dalam satu komando kerja</CardTitle>
                <CardDescription className="mt-2">
                  Jalur ini dipakai saat user memang ingin mengubah state lisensi. Mode akan mengikuti aksi yang Anda pilih atau rekomendasi dari status deck.
                </CardDescription>
              </div>
              <Badge variant={processMode === "renew" ? "amber" : "emerald"}>{processMode === "renew" ? "Renew Mode" : "Activation Mode"}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <StationMetric label="Current Action" value={processMode === "renew" ? "Perpanjang entry aktif" : "Buat atau hidupkan lisensi"} />
              <StationMetric label="Turnstile" value={turnstileToken ? "Verified" : "Pending"} />
              <StationMetric label="Default Term" value={`${licenseDurationDays} hari`} />
            </div>
            <form className="space-y-4" onSubmit={handleCreateSubmit}>
              <Field label="IPv4 publik VPS" help="Gunakan IP publik final yang sama dengan identitas server di lapangan.">
                <Input value={createIp} onChange={(event) => setCreateIp(event.target.value)} placeholder="123.45.67.89" />
              </Field>
              <div className="rounded-[1.65rem] border border-[var(--line)] bg-white/70 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Verification Slot</div>
                <div className="mt-3 min-h-[76px]" ref={turnstileSlotRef} />
                <div className="mt-3 text-sm text-[var(--muted)]">
                  Turnstile wajib valid untuk jalur aktivasi dan renew. Jika token expired, ulangi verifikasi sebelum submit.
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={createLoading}>
                  {createLoading ? <RefreshCw className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  {createLoading ? "Memproses..." : processMode === "renew" ? "Jalankan Renew" : "Jalankan Aktivasi"}
                </Button>
                {processMode === "renew" ? (
                  <Button type="button" variant="secondary" onClick={() => setProcessMode("activate")}>
                    <RefreshCw className="size-4" />
                    Kembali ke Aktivasi
                  </Button>
                ) : null}
              </div>
            </form>
            <ActionResult result={createResult} item={createItem} />
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card id="status-deck" className="page-enter stagger-3 border-[rgba(15,76,129,0.18)] bg-[linear-gradient(180deg,rgba(242,248,252,0.92),rgba(255,255,255,0.88))]">
            <CardHeader>
              <Badge variant="slate">Status Deck</Badge>
              <CardTitle className="mt-3 text-3xl">Pemeriksaan state sebelum mengambil keputusan</CardTitle>
              <CardDescription className="mt-2">
                Jalur ini cocok untuk user yang tidak yakin harus aktivasi, renew, atau berhenti dan menghubungi support.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <form className="space-y-4" onSubmit={handleStatusSubmit}>
                <Field label="IPv4 yang ingin dicek" help="Worker akan mengembalikan detail aman, status lisensi, dan rekomendasi tindakan berikutnya.">
                  <Input value={statusIp} onChange={(event) => setStatusIp(event.target.value)} placeholder="123.45.67.89" />
                </Field>
                <Button type="submit" variant="secondary" disabled={statusLoading}>
                  {statusLoading ? <RefreshCw className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
                  {statusLoading ? "Mengecek..." : "Periksa Status"}
                </Button>
              </form>
              <StatusDeck result={statusResult} item={statusItem} onAction={applyStatusAction} />
            </CardContent>
          </Card>

          <Card className="border-[rgba(19,24,43,0.08)] bg-[rgba(255,255,255,0.78)]">
            <CardHeader>
              <Badge variant="accent">Quick Read</Badge>
              <CardTitle className="mt-3 text-2xl">Portal behavior snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <QuickRead label="Worker State" value={statusBadge.message} detail="Sinyal konektivitas portal saat ini." />
              <QuickRead label="Renew Gate" value={`${renewOpenBeforeDays} hari`} detail="Ambang sebelum jalur renew publik dibuka." />
              <QuickRead label="Support" value="autoscript@atomicmail.io" detail="Kontak saat status menyarankan eskalasi." mono />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function HeroStat({ icon: Icon, label, value, detail }) {
  return (
    <div className="rounded-[1.65rem] border border-[var(--line)] bg-white/68 p-4 shadow-[0_18px_32px_rgba(17,24,39,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
        <Icon className="size-4 text-[var(--accent-strong)]" />
      </div>
      <div className="mt-3 text-xl font-semibold tracking-[-0.03em]">{value}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail}</div>
    </div>
  );
}

function FlowLane({ step, title, copy }) {
  return (
    <div className="grid grid-cols-[auto,1fr] gap-4 rounded-[1.55rem] border border-[var(--line)] bg-white/68 p-4">
      <div className="flex size-11 items-center justify-center rounded-full bg-[var(--fg)] text-sm font-semibold text-white">{step}</div>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="mt-1 text-sm leading-6 text-[var(--muted)]">{copy}</div>
      </div>
    </div>
  );
}

function MiniRule({ title, children }) {
  return (
    <div className="rounded-[1.45rem] border border-[var(--line)] bg-white/70 p-4">
      <div className="font-semibold tracking-[-0.02em]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{children}</div>
    </div>
  );
}

function StationMetric({ label, value }) {
  return (
    <div className="rounded-[1.35rem] border border-[var(--line)] bg-white/68 px-4 py-3">
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

function ActionResult({ result, item }) {
  if (!result) return null;
  return (
    <div className="rounded-[1.7rem] border border-[var(--line)] bg-white/74 p-4 shadow-[0_20px_40px_rgba(17,24,39,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Mutation Result</div>
          <div className="mt-2 text-xl font-semibold tracking-[-0.03em]">{result.title}</div>
        </div>
        <Badge variant={result.tone}>{statusLabel(item.status || result.tone)}</Badge>
      </div>
      {item.message ? (
        <div className="mt-4 rounded-[1.25rem] border border-[var(--line)] bg-white/78 px-4 py-3 text-sm leading-6 text-[var(--muted)]">
          {item.message}
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <InfoCell label="IP" value={item.ip} mono />
        {"entry_id" in item ? <InfoCell label="Entry ID" value={item.entry_id || "-"} mono /> : null}
        {"expires_at" in item ? <InfoCell label="Aktif sampai" value={formatDate(item.expires_at)} /> : null}
        {"days_remaining" in item ? <InfoCell label="Sisa waktu" value={formatDaysRemaining(item.days_remaining)} /> : null}
        {"renewable" in item ? <InfoCell label="Renewable" value={item.renewable ? "Ya" : "Tidak"} /> : null}
        {"allowed" in item ? <InfoCell label="Akses publik" value={item.allowed ? "Diizinkan" : "Tidak"} /> : null}
      </div>
    </div>
  );
}

function StatusDeck({ result, item, onAction }) {
  if (!result) return null;
  const nextAction = item.next_action || {};
  return (
    <div className="rounded-[1.7rem] border border-[var(--line)] bg-white/74 p-4 shadow-[0_20px_40px_rgba(17,24,39,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Inspection Result</div>
          <div className="mt-2 text-xl font-semibold tracking-[-0.03em]">{result.title}</div>
        </div>
        <Badge variant={result.tone}>{statusLabel(item.status || result.tone)}</Badge>
      </div>

      {item.detail_message ? (
        <div className="mt-4 rounded-[1.25rem] border border-[var(--line)] bg-white/78 px-4 py-3 text-sm leading-6 text-[var(--muted)]">
          {item.detail_message}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <InfoCell label="IP dicek" value={item.ip} mono />
        <InfoCell label="Akses publik" value={item.allowed ? "Diizinkan" : "Tidak"} />
        <InfoCell label="Aktif sampai" value={formatDate(item.expires_at)} />
        <InfoCell label="Sisa waktu" value={formatDaysRemaining(item.days_remaining)} />
        <InfoCell label="Bisa renew" value={item.renewable ? "Ya" : "Tidak"} />
        <InfoCell label="Jendela renew" value={`${item.renew_open_before_days || 0} hari`} />
        {Number(item.renew_opens_in_days || 0) > 0 ? <InfoCell label="Renew dibuka dalam" value={formatDaysRemaining(item.renew_opens_in_days)} /> : null}
      </div>

      <div className="mt-4 rounded-[1.45rem] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(15,76,129,0.06),rgba(255,255,255,0.75))] p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Recommended Next Action</div>
        <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{nextAction.help || "Tidak ada tindakan lanjutan yang dibutuhkan."}</div>
        {nextAction.kind && nextAction.kind !== "none" ? (
          <div className="mt-4">
            <Button type="button" onClick={() => onAction?.(item)}>
              {nextAction.kind === "renew" ? <RefreshCw className="size-4" /> : <ArrowRight className="size-4" />}
              {nextAction.label || "Lanjutkan"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function QuickRead({ label, value, detail, mono = false }) {
  return (
    <div className="rounded-[1.45rem] border border-[var(--line)] bg-white/72 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</div>
      <div className={`mt-2 text-sm ${mono ? "break-all font-mono" : "font-semibold"}`}>{value}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail}</div>
    </div>
  );
}

function InfoCell({ label, value, mono = false }) {
  return (
    <div className="rounded-[1.25rem] border border-[var(--line)] bg-white/76 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</div>
      <div className={`mt-2 text-sm ${mono ? "break-all font-mono" : "font-medium"}`}>{value || "-"}</div>
    </div>
  );
}

function describeStatus(payload) {
  const status = String(payload?.status || "").toLowerCase();
  if (status === "active") return "IP ini masih aktif dan ada di dalam cakupan lisensi.";
  if (status === "expired") return "IP ini sudah melewati masa aktif dan perlu diproses ulang.";
  if (status === "revoked") return "IP sedang berada pada status revoked dan tidak bisa memakai alur publik normal.";
  if (status === "not_found") return "IP belum tercatat di database lisensi.";
  return "Status lisensi berhasil dimuat.";
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
