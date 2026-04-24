import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Tabs, TabsList, TabsTrigger } from "../shared/ui.jsx";
import { getPublicConfig } from "../shared/config.js";
import { formatDate, formatDaysRemaining, statusLabel, statusTone } from "../shared/utils.js";
import { Activity, ArrowRight, CheckCircle2, Globe, HelpCircle, Shield, Zap } from "lucide-react";

function PublicApp() {
  const config = useMemo(() => getPublicConfig(), []);
  const turnstileSlotRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);
  const [activeTab, setActiveTab] = useState("activate");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [ip, setIp] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [configData, setConfigData] = useState({ duration: 14, renewWindow: 3 });

  useEffect(() => {
    async function bootstrap() {
      try {
        const payload = await publicApiFetch(config.apiBaseUrl, "/api/public/config");
        setConfigData({
          duration: Number(payload.license_duration_days || 14),
          renewWindow: Number(payload.renew_open_before_days || 3),
        });
      } catch (e) {
        console.error("Failed to load config", e);
      }
    }
    bootstrap();
  }, [config.apiBaseUrl]);

  useEffect(() => {
    async function initTurnstile() {
      if (!config.turnstileSiteKey || !turnstileSlotRef.current) return;
      const ready = await loadTurnstileScript();
      if (!ready || !window.turnstile?.render) return;
      if (turnstileWidgetIdRef.current !== null) return;
      turnstileWidgetIdRef.current = window.turnstile.render(turnstileSlotRef.current, {
        sitekey: config.turnstileSiteKey,
        theme: "dark",
        callback: (token) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
      });
    }
    initTurnstile();
  }, [config.turnstileSiteKey, activeTab]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ip.trim()) return setResult({ tone: "error", title: "IP Address required" });
    if (activeTab !== "status" && !turnstileToken) return setResult({ tone: "warn", title: "Please complete verification" });

    setLoading(true);
    setResult(null);
    try {
      const endpoint = activeTab === "status" ? "/api/public/license/status" : activeTab === "renew" ? "/api/public/license/renew" : "/api/public/license/activate";
      const payload = await publicApiFetch(config.apiBaseUrl, endpoint, {
        method: "POST",
        body: JSON.stringify({ ip: ip.trim(), turnstile_token: turnstileToken }),
      });
      
      setResult({
        tone: statusTone(payload?.status || payload?.item?.status || "ok"),
        title: payload.message || "Success",
        data: payload.item || payload,
      });

      if (activeTab !== "status") {
        setTurnstileToken("");
        window.turnstile?.reset(turnstileWidgetIdRef.current);
      }
    } catch (error) {
      setResult({ tone: "error", title: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-12 md:py-24 overflow-hidden">
      {/* Background Orbs */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-full -z-10 pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600 rounded-full blur-[120px] animate-pulse delay-700" />
      </div>

      <header className="w-full max-w-4xl flex flex-col items-center text-center space-y-6 mb-16 page-enter">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-indigo-400">
          <Zap className="size-3 fill-current" />
          <span>Next-Gen Licensing Engine</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent">
          Autoscript <span className="text-indigo-500">License</span>
        </h1>
        <p className="text-lg md:text-xl text-[var(--muted)] max-w-2xl leading-relaxed">
          The ultimate IP-based licensing system. Secure, lightweight, and fully automated for your VPS deployment needs.
        </p>
      </header>

      <main className="w-full max-w-xl page-enter stagger-1">
        <Card className="glass relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
          
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="p-6 pb-0">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="activate">Activate</TabsTrigger>
                <TabsTrigger value="renew">Renew</TabsTrigger>
                <TabsTrigger value="status">Status</TabsTrigger>
              </TabsList>
            </div>

            <CardContent className="p-6 pt-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/70">IPv4 Address</label>
                  <Input 
                    placeholder="e.g. 123.45.67.89" 
                    value={ip}
                    onChange={(e) => setIp(e.target.value)}
                    className="text-lg font-mono tracking-wider"
                  />
                  <p className="text-xs text-[var(--muted)]">Enter the public IP address of your VPS.</p>
                </div>

                {activeTab !== "status" && (
                  <div className="space-y-4 rounded-xl bg-white/5 p-4 border border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Security Check</span>
                      <Badge variant={turnstileToken ? "emerald" : "slate"}>
                        {turnstileToken ? "Verified" : "Required"}
                      </Badge>
                    </div>
                    <div ref={turnstileSlotRef} className="min-h-[65px] flex justify-center" />
                  </div>
                )}

                <Button size="lg" className="w-full" disabled={loading}>
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="size-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Processing...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {activeTab === "status" ? "Check Status" : activeTab === "renew" ? "Renew License" : "Activate License"}
                      <ArrowRight className="size-4" />
                    </div>
                  )}
                </Button>
              </form>

              {result && (
                <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                  <Alert tone={result.tone}>
                    <div className="flex-1">
                      <div className="font-semibold text-white mb-1">{result.title}</div>
                      {result.data?.status && (
                        <div className="grid grid-cols-2 gap-4 mt-4">
                          <Stat label="Status" value={statusLabel(result.data.status)} tone={result.tone} />
                          <Stat label="Expiry" value={formatDate(result.data.expires_at)} />
                          <Stat label="Days Left" value={formatDaysRemaining(result.data.days_remaining)} />
                          <Stat label="Renewable" value={result.data.renewable ? "Yes" : "No"} />
                        </div>
                      )}
                    </div>
                  </Alert>
                </div>
              )}
            </CardContent>
          </Tabs>
        </Card>

        <div className="mt-12 grid grid-cols-2 md:grid-cols-3 gap-6 page-enter stagger-2">
          <Feature icon={Shield} title="Secure" desc="Turnstile protection." />
          <Feature icon={Zap} title="Fast" desc="Instant activation." />
          <Feature icon={Globe} title="Global" desc="Available everywhere." />
        </div>
      </main>

      <footer className="mt-auto py-12 text-center space-y-4 page-enter stagger-3">
        <div className="flex items-center justify-center gap-8 text-sm font-medium text-[var(--muted)]">
          <a href="#" className="hover:text-indigo-400 transition-colors">Documentation</a>
          <a href="#" className="hover:text-indigo-400 transition-colors">Support</a>
          <a href="#" className="hover:text-indigo-400 transition-colors">Github</a>
        </div>
        <p className="text-xs text-white/20 tracking-widest uppercase">
          &copy; 2026 Autoscript Ecosystem. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/5 p-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1">{label}</div>
      <div className={cn("text-sm font-medium", tone === "emerald" ? "text-emerald-400" : tone === "rose" ? "text-rose-400" : "text-white")}>
        {value || "-"}
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }) {
  return (
    <div className="flex flex-col items-center text-center space-y-2 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
      <div className="size-10 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
        <Icon className="size-5 text-indigo-400" />
      </div>
      <div className="font-semibold text-sm">{title}</div>
      <div className="text-xs text-[var(--muted)]">{desc}</div>
    </div>
  );
}

async function publicApiFetch(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: options.body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
  return payload;
}

async function loadTurnstileScript() {
  if (window.turnstile) return true;
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

createRoot(document.getElementById("root")).render(<PublicApp />);
