import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Tabs, TabsList, TabsTrigger } from "../shared/ui.jsx";
import { getPublicConfig } from "../shared/config.js";
import { formatDate, formatDaysRemaining, statusLabel, statusTone } from "../shared/utils.js";
import { ArrowRight, CheckCircle, Info, ShieldCheck, Zap } from "lucide-react";

function PublicApp() {
  const config = useMemo(() => getPublicConfig(), []);
  const turnstileSlotRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);
  const [activeTab, setActiveTab] = useState("activate");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [ip, setIp] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    async function initTurnstile() {
      if (!config.turnstileSiteKey || !turnstileSlotRef.current) return;
      const ready = await loadTurnstileScript();
      if (!ready || !window.turnstile?.render) return;
      if (turnstileWidgetIdRef.current !== null) return;
      turnstileWidgetIdRef.current = window.turnstile.render(turnstileSlotRef.current, {
        sitekey: config.turnstileSiteKey,
        theme: "light",
        callback: (token) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
      });
    }
    initTurnstile();
  }, [config.turnstileSiteKey, activeTab]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ip.trim()) return setResult({ tone: "error", title: "IP Address is required" });
    if (activeTab !== "status" && !turnstileToken) return setResult({ tone: "warn", title: "Please complete the security check" });

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
        title: payload.message || "Operation Successful",
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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center">
      {/* Top Navigation Bar */}
      <nav className="w-full bg-white border-b border-slate-200 py-4 px-6 mb-12">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <ShieldCheck className="text-blue-600 size-6" />
            <span>Autoscript License</span>
          </div>
          <div className="flex gap-6 text-sm font-medium text-slate-600">
            <a href="#" className="hover:text-blue-600">Documentation</a>
            <a href="#" className="hover:text-blue-600">Support</a>
          </div>
        </div>
      </nav>

      <main className="w-full max-w-4xl px-4 flex flex-col md:flex-row gap-8 pb-20">
        {/* Left Column: Content */}
        <div className="flex-1 space-y-8 page-enter">
          <header className="space-y-4">
            <Badge variant="accent">Public Portal</Badge>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
              Manage your VPS <br /> 
              <span className="text-blue-600">License Instantly.</span>
            </h1>
            <p className="text-lg text-slate-600 leading-relaxed max-w-lg">
              The professional way to activate and manage IP-based licenses. Simple, fast, and secure.
            </p>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FeatureCard icon={CheckCircle} title="Instant Activation" desc="Licenses are processed in real-time." />
            <FeatureCard icon={Zap} title="Direct Sync" desc="Automated sync with your VPS servers." />
          </div>

          <Alert tone="muted" className="bg-blue-50/50 border-blue-100 text-blue-900">
            <div className="flex gap-3">
              <Info className="size-5 shrink-0 text-blue-600" />
              <p className="text-sm">
                Default license duration is <strong>14 days</strong>. You can renew your license within the 3-day window before expiry.
              </p>
            </div>
          </Alert>
        </div>

        {/* Right Column: Action Card */}
        <div className="w-full md:w-[400px] page-enter stagger-1">
          <Card className="border-slate-200 shadow-xl shadow-slate-200/50 bg-white">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle>License Control</CardTitle>
              <CardDescription>Select an action to proceed with your IP.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full mb-6">
                  <TabsTrigger value="activate" className="flex-1">Activate</TabsTrigger>
                  <TabsTrigger value="renew" className="flex-1">Renew</TabsTrigger>
                  <TabsTrigger value="status" className="flex-1">Status</TabsTrigger>
                </TabsList>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Server IP Address</label>
                    <Input 
                      placeholder="e.g. 1.2.3.4" 
                      value={ip}
                      onChange={(e) => setIp(e.target.value)}
                      className="font-mono"
                    />
                  </div>

                  {activeTab !== "status" && (
                    <div className="space-y-3">
                      <label className="text-sm font-bold text-slate-700">Verification</label>
                      <div ref={turnstileSlotRef} className="flex justify-center" />
                    </div>
                  )}

                  <Button size="lg" className="w-full h-12" disabled={loading}>
                    {loading ? "Processing..." : activeTab === "status" ? "Check License" : "Submit Request"}
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                </form>

                {result && (
                  <div className="mt-8 border-t border-slate-100 pt-6 animate-in fade-in slide-in-from-top-2">
                    <Alert tone={result.tone} className="mb-4">
                      {result.title}
                    </Alert>
                    {result.data?.status && (
                      <div className="space-y-2">
                        <ResultRow label="Status" value={statusLabel(result.data.status)} highlight />
                        <ResultRow label="Expires" value={formatDate(result.data.expires_at)} />
                        <ResultRow label="Time Left" value={formatDaysRemaining(result.data.days_remaining)} />
                      </div>
                    )}
                  </div>
                )}
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="mt-auto py-10 w-full border-t border-slate-200 bg-white text-center">
        <p className="text-sm text-slate-500 font-medium">
          &copy; 2026 Autoscript Ecosystem. Professional Licensing Solutions.
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }) {
  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white flex gap-4 items-start">
      <div className="size-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
        <Icon className="size-5" />
      </div>
      <div>
        <h4 className="font-bold text-slate-900 text-sm">{title}</h4>
        <p className="text-xs text-slate-500 mt-1">{desc}</p>
      </div>
    </div>
  );
}

function ResultRow({ label, value, highlight = false }) {
  return (
    <div className="flex justify-between items-center py-1.5 text-sm border-b border-slate-50 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className={cn("font-bold text-slate-900", highlight && "text-blue-600")}>{value}</span>
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
