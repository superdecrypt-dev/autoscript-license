import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "../shared/ui.jsx";
import { getAdminConfig } from "../shared/config.js";
import {
  buildSparklinePath,
  computeSha256Hex,
  formatBackupRows,
  formatBytes,
  formatDate,
  formatForDateTimeLocal,
  formatShortDay,
  formatRelativeTime,
  shortChecksum,
  statusLabel,
  statusTone,
} from "../shared/utils.js";
import {
  Activity,
  Clock3,
  Database,
  Download,
  Eye,
  FileJson,
  Globe,
  HardDriveUpload,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
} from "lucide-react";

const VIEW_META = {
  dashboard: { title: "Dashboard", description: "Ringkasan lisensi, aktivitas, dan backup terbaru." },
  entries: { title: "Entries", description: "Kelola IP, masa aktif, dan tindakan admin." },
  audit: { title: "Audit Log", description: "Pantau jejak perubahan dan akses publik." },
  settings: { title: "Settings", description: "Kelola sesi dan snapshot backup/restore." },
};

function AdminApp() {
  const config = useMemo(() => getAdminConfig(), []);
  const adminApiOrigin = useMemo(() => new URL(config.adminApiBaseUrl).origin, [config.adminApiBaseUrl]);
  const usesCrossOriginAdminApi = adminApiOrigin !== window.location.origin;
  const [activeView, setActiveView] = useState(localStorage.getItem("autoscriptLicenseAdminActiveView") || "dashboard");
  const [authStatus, setAuthStatus] = useState("authenticating");
  const [banner, setBanner] = useState({ tone: "muted", message: "Memverifikasi akses Cloudflare..." });
  const [session, setSession] = useState(null);
  const [entries, setEntries] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [backups, setBackups] = useState([]);
  const [backupPreview, setBackupPreview] = useState(null);
  const [metricsWindowDays, setMetricsWindowDays] = useState(localStorage.getItem("autoscriptLicenseMetricsWindowDays") || "14");
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [auditIp, setAuditIp] = useState("");
  const [auditEvent, setAuditEvent] = useState("");
  const [backupSearch, setBackupSearch] = useState("");
  const [backupSourceFilter, setBackupSourceFilter] = useState("all");
  const [backupSort, setBackupSort] = useState("created_desc");
  const [formState, setFormState] = useState(emptyEntryForm());
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormState, setEditFormState] = useState(emptyEntryForm());
  const [lastSyncedAt, setLastSyncedAt] = useState("");

  useEffect(() => {
    localStorage.setItem("autoscriptLicenseAdminActiveView", activeView);
  }, [activeView]);

  useEffect(() => {
    localStorage.setItem("autoscriptLicenseMetricsWindowDays", metricsWindowDays);
  }, [metricsWindowDays]);

  useEffect(() => {
    authenticateWithAccess();
  }, []);

  useEffect(() => {
    if (authStatus === "authenticated") {
      if (activeView === "dashboard") refreshDashboard();
      if (activeView === "entries") refreshEntries();
      if (activeView === "audit") refreshAuditLogs();
      if (activeView === "settings") refreshBackups();
    }
  }, [activeView]);

  useEffect(() => {
    if (authStatus === "authenticated" && activeView === "audit") refreshAuditLogs();
  }, [auditIp, auditEvent]);

  useEffect(() => {
    if (authStatus === "authenticated" && activeView === "entries") refreshEntries();
  }, [search, statusFilter]);

  async function authenticateWithAccess() {
    setAuthStatus("authenticating");
    setBanner({ tone: "muted", message: "Memverifikasi akses Cloudflare..." });
    try {
      const currentSession = await apiFetch("/api/admin/session");
      maybeCompleteAccessRelay();
      setSession(currentSession);
      setAuthStatus("authenticated");
      setBanner({ tone: "ok", message: `Terhubung: ${currentSession.admin_email || "-"}` });
      await refreshDashboard();
    } catch (error) {
      setSession(null);
      if (shouldStartAccessRelay(error)) {
        redirectToAccessRelay();
        return;
      }
      setAuthStatus("locked");
      setBanner({ tone: "error", message: error.message || "Akses belum tersedia." });
    }
  }

  function logoutAccess() {
    const logoutUrl = new URL("/cdn-cgi/access/logout", adminApiOrigin);
    window.location.assign(logoutUrl.toString());
  }

  function ensureAuthenticated() {
    return authStatus === "authenticated";
  }

  async function refreshDashboard() {
    if (!ensureAuthenticated()) return;
    setEntriesLoading(true);
    setAuditLoading(true);
    setMetricsLoading(true);
    setBackupsLoading(true);
    try {
      const [currentSession, entriesPayload, auditPayload, metricsPayload, backupsPayload] = await Promise.all([
        apiFetch("/api/admin/session"),
        fetchEntries(),
        fetchAuditLogs(),
        fetchMetrics(),
        fetchBackups(),
      ]);
      setSession(currentSession);
      setEntries(entriesPayload.items || []);
      setAuditLogs(auditPayload.items || []);
      setMetrics(metricsPayload || null);
      setBackups(backupsPayload.items || []);
      setLastSyncedAt(new Date().toISOString());
      setBanner({ tone: "ok", message: `Terhubung: ${currentSession.admin_email || "-"}` });
    } catch (error) {
      handleAuthFailure(error);
    } finally {
      setEntriesLoading(false);
      setAuditLoading(false);
      setMetricsLoading(false);
      setBackupsLoading(false);
    }
  }

  async function refreshEntries() {
    if (!ensureAuthenticated()) return;
    setEntriesLoading(true);
    try {
      const payload = await fetchEntries();
      setEntries(payload.items || []);
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      handleAuthFailure(error, "Gagal refresh daftar IP.");
    } finally {
      setEntriesLoading(false);
    }
  }

  async function refreshAuditLogs() {
    if (!ensureAuthenticated()) return;
    setAuditLoading(true);
    try {
      const payload = await fetchAuditLogs();
      setAuditLogs(payload.items || []);
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      handleAuthFailure(error, "Gagal refresh audit log.");
    } finally {
      setAuditLoading(false);
    }
  }

  async function refreshMetrics() {
    if (!ensureAuthenticated()) return;
    setMetricsLoading(true);
    try {
      const payload = await fetchMetrics();
      setMetrics(payload || null);
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      handleAuthFailure(error, "Gagal refresh metrics.");
    } finally {
      setMetricsLoading(false);
    }
  }

  async function refreshBackups() {
    if (!ensureAuthenticated()) return;
    setBackupsLoading(true);
    try {
      const payload = await fetchBackups();
      setBackups(payload.items || []);
      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      handleAuthFailure(error, "Gagal refresh backup snapshot.");
    } finally {
      setBackupsLoading(false);
    }
  }

  async function fetchEntries() {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return apiFetch(`/api/admin/license-entries${suffix}`);
  }

  async function fetchAuditLogs() {
    const params = new URLSearchParams({ limit: "120" });
    if (auditIp.trim()) params.set("ip", auditIp.trim());
    if (auditEvent.trim()) params.set("event", auditEvent.trim());
    return apiFetch(`/api/admin/audit-logs?${params.toString()}`);
  }

  async function fetchMetrics() {
    const params = new URLSearchParams({ days: metricsWindowDays });
    return apiFetch(`/api/admin/metrics?${params.toString()}`);
  }

  async function fetchBackups() {
    return apiFetch("/api/admin/backups");
  }

  async function createBackup() {
    try {
      await apiFetch("/api/admin/backups", { method: "POST", body: JSON.stringify({}) });
      setBanner({ tone: "ok", message: "Snapshot backup berhasil dibuat." });
      await refreshBackups();
    } catch (error) {
      handleAuthFailure(error, "Gagal membuat snapshot backup.");
    }
  }

  async function handleImportBackupFile(event) {
    const [file] = Array.from(event.target.files || []);
    event.target.value = "";
    if (!file) return;
    const accepted = window.confirm(`Import backup ${file.name} akan mengganti daftar license entries saat ini. Lanjutkan?`);
    if (!accepted) return;
    try {
      const rawPayload = await file.text();
      const checksumSha256 = await computeSha256Hex(rawPayload);
      const dryRunPayload = await apiFetch("/api/admin/backups/import?dry_run=1", {
        method: "POST",
        headers: {
          "X-Backup-SHA256": checksumSha256,
        },
        body: rawPayload,
      });
      const confirmed = window.confirm(
        `Import backup ${file.name} siap dijalankan.\n\nEntries: ${formatBackupRows(dryRunPayload.row_counts)}\nChecksum: ${shortChecksum(dryRunPayload.checksum_sha256)}\n\nLanjutkan import penuh?`
      );
      if (!confirmed) {
        setBanner({ tone: "muted", message: "Import backup dibatalkan setelah dry-run." });
        return;
      }
      await apiFetch("/api/admin/backups/import", {
        method: "POST",
        headers: {
          "X-Backup-SHA256": checksumSha256,
        },
        body: rawPayload,
      });
      setBanner({ tone: "ok", message: `Backup ${file.name} berhasil di-import.` });
      await refreshDashboard();
    } catch (error) {
      handleAuthFailure(error, "Gagal import file backup.");
    }
  }

  async function loadBackupPreview(backupKey, silent = false) {
    try {
      const payload = await apiFetch(`/api/admin/backups/${encodeURIComponent(backupKey)}/preview`);
      setBackupPreview(payload.item || null);
      setBackups((current) =>
        current.map((item) =>
          item.key === payload.item?.key
            ? { ...item, checksum_sha256: payload.item?.checksum_sha256 || item.checksum_sha256 || "" }
            : item
        )
      );
      if (!silent) setBanner({ tone: "ok", message: "Preview snapshot berhasil dimuat." });
      return payload.item || null;
    } catch (error) {
      if (!silent) handleAuthFailure(error, "Gagal memuat preview snapshot backup.");
      throw error;
    }
  }

  async function validateBackupRestore(backupKey) {
    try {
      const payload = await apiFetch(`/api/admin/backups/${encodeURIComponent(backupKey)}/restore?dry_run=1`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const backup = backups.find((item) => item.key === backupKey) || {};
      setBanner({ tone: "ok", message: `Dry-run OK: ${formatBackupRows(payload.row_counts)} • ${backup.created_by || "-"} • ${shortChecksum(payload.checksum_sha256)}` });
    } catch (error) {
      handleAuthFailure(error, "Gagal validasi snapshot backup.");
    }
  }

  async function restoreBackup(backupKey) {
    let backup = backups.find((item) => item.key === backupKey);
    if (!backup || !backup.checksum_sha256) {
      backup = await loadBackupPreview(backupKey, true);
    }
    const summary = [
      `Created: ${formatDate(backup?.created_at)}`,
      `Actor: ${backup?.created_by || "-"}`,
      `Source: ${backup?.source || "-"}`,
      `Entries: ${formatBackupRows(backup?.row_counts)}`,
      `Size: ${formatBytes(backup?.size || 0)}`,
      `Checksum: ${backup?.checksum_sha256 || "-"}`,
    ].join("\n");
    if (!window.confirm(`Restore snapshot berikut akan mengganti daftar license entries saat ini:\n\n${summary}\n\nLanjutkan?`)) return;
    try {
      await apiFetch(`/api/admin/backups/${encodeURIComponent(backupKey)}/restore`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setBanner({ tone: "ok", message: "Restore snapshot berhasil." });
      await refreshDashboard();
    } catch (error) {
      handleAuthFailure(error, "Gagal restore snapshot backup.");
    }
  }

  async function deleteBackup(backupKey) {
    if (!window.confirm(`Hapus snapshot ${backupKey}?`)) return;
    try {
      await apiFetch(`/api/admin/backups/${encodeURIComponent(backupKey)}`, { method: "DELETE" });
      setBanner({ tone: "ok", message: "Snapshot backup berhasil dihapus." });
      await refreshBackups();
    } catch (error) {
      handleAuthFailure(error, "Gagal menghapus snapshot backup.");
    }
  }

  async function downloadBackup(backupKey) {
    try {
      const response = await fetchAdminBlob(`/api/admin/backups/${encodeURIComponent(backupKey)}/download`);
      const blob = await response.blob();
      triggerDownload(blob, backupKey.split("/").at(-1) || "autoscript-license-backup.json");
      setBanner({ tone: "ok", message: "Snapshot backup berhasil diunduh." });
    } catch (error) {
      handleAuthFailure(error, "Gagal mengunduh snapshot backup.");
    }
  }

  async function downloadBackupManifest(backupKey) {
    try {
      const response = await fetchAdminBlob(`/api/admin/backups/${encodeURIComponent(backupKey)}/manifest`);
      const blob = await response.blob();
      triggerDownload(blob, `${backupKey.split("/").at(-1) || "autoscript-license-backup"}.manifest.json`);
      setBanner({ tone: "ok", message: "Manifest backup berhasil diunduh." });
    } catch (error) {
      handleAuthFailure(error, "Gagal mengunduh manifest backup.");
    }
  }

  async function handleCreateEntry(event) {
    event.preventDefault();
    try {
      await apiFetch("/api/admin/license-entries", { method: "POST", body: JSON.stringify(formState) });
      setBanner({ tone: "ok", message: `Entry ${formState.ip} berhasil dibuat.` });
      setFormState(emptyEntryForm());
      await refreshDashboard();
    } catch (error) {
      handleAuthFailure(error, "Gagal menyimpan entry.");
    }
  }

  async function handleUpdateEntry(event) {
    event.preventDefault();
    try {
      await apiFetch(`/api/admin/license-entries/${encodeURIComponent(editFormState.id)}`, { method: "PATCH", body: JSON.stringify(editFormState) });
      setBanner({ tone: "ok", message: `Entry ${editFormState.ip} berhasil diperbarui.` });
      setEditDialogOpen(false);
      setEditFormState(emptyEntryForm());
      await refreshDashboard();
    } catch (error) {
      handleAuthFailure(error, "Gagal memperbarui entry.");
    }
  }

  async function toggleEntry(entry, action) {
    try {
      await apiFetch(`/api/admin/license-entries/${encodeURIComponent(entry.id)}/${action}`, { method: "POST", body: JSON.stringify({}) });
      setBanner({ tone: "ok", message: `Entry ${entry.ip} berhasil di-${action}.` });
      await refreshDashboard();
    } catch (error) {
      handleAuthFailure(error, `Gagal ${action} entry.`);
    }
  }

  async function deleteEntry(entry) {
    if (!window.confirm(`Hapus entry ${entry.ip}?`)) return;
    try {
      await apiFetch(`/api/admin/license-entries/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
      setBanner({ tone: "ok", message: `Entry ${entry.ip} berhasil dihapus.` });
      await refreshDashboard();
    } catch (error) {
      handleAuthFailure(error, "Gagal menghapus entry.");
    }
  }

  function handleAuthFailure(error, fallbackMessage = "") {
    const status = Number(error?.status || 0);
    if ([0, 401].includes(status)) {
      if (shouldStartAccessRelay(error)) {
        redirectToAccessRelay();
        return;
      }
      setAuthStatus("locked");
      setBanner({ tone: "error", message: error.message || "Akses belum tersedia." });
      return;
    }
    setBanner({ tone: "error", message: fallbackMessage || error.message || "Operasi gagal." });
  }

  async function apiFetch(path, options = {}) {
    const intendedMethod = String(options.method || "GET").toUpperCase();
    const requestUrl = new URL(path, adminApiOrigin);
    const headers = { ...(options.headers || {}) };
    let requestMethod = intendedMethod;
    let requestBody = options.body;

    if (usesCrossOriginAdminApi && !["GET", "HEAD"].includes(intendedMethod)) {
      requestMethod = "POST";
      requestUrl.searchParams.set("__proxy_method", intendedMethod);
      headers["Content-Type"] = "text/plain;charset=UTF-8";
    } else if (!["GET", "HEAD"].includes(requestMethod)) {
      headers["Content-Type"] = "application/json";
    }

    let response;
    try {
      response = await fetch(requestUrl.toString(), {
        method: requestMethod,
        headers,
        body: requestBody,
        credentials: "include",
      });
    } catch (_error) {
      const error = new Error("Sesi Access belum aktif.");
      error.status = 0;
      throw error;
    }

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

  async function fetchAdminBlob(path) {
    const requestUrl = new URL(path, adminApiOrigin);
    let response;
    try {
      response = await fetch(requestUrl.toString(), {
        method: "GET",
        credentials: "include",
      });
    } catch (_error) {
      const error = new Error("Sesi Access belum aktif.");
      error.status = 0;
      throw error;
    }
    if (!response.ok) {
      let payload = {};
      try {
        payload = await response.clone().json();
      } catch (_error) {
        payload = {};
      }
      const error = new Error(payload.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response;
  }

  function shouldStartAccessRelay(error) {
    return usesCrossOriginAdminApi && [0, 401].includes(Number(error?.status || 0)) && !new URL(window.location.href).searchParams.has("relay_failed");
  }

  function redirectToAccessRelay() {
    const relayUrl = new URL("/admin/", adminApiOrigin);
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete("relay_failed");
    relayUrl.searchParams.set("return_to", currentUrl.toString());
    window.location.assign(relayUrl.toString());
  }

  function maybeCompleteAccessRelay() {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has("relay_failed")) {
      currentUrl.searchParams.delete("relay_failed");
      window.history.replaceState({}, "", currentUrl.toString());
    }
    const returnTarget = currentUrl.searchParams.get("return_to");
    if (!returnTarget) return;
    try {
      const targetUrl = new URL(returnTarget, window.location.origin);
      if (targetUrl.origin === window.location.origin) {
        currentUrl.searchParams.delete("return_to");
        window.history.replaceState({}, "", currentUrl.toString());
        return;
      }
      targetUrl.searchParams.set("relay_failed", "0");
      window.location.replace(targetUrl.toString());
    } catch (_error) {
      currentUrl.searchParams.delete("return_to");
      window.history.replaceState({}, "", currentUrl.toString());
    }
  }

  const summary = metrics?.summary || {};
  const topEvents = metrics?.top_events || [];
  const checksTrend = metrics?.daily_checks || [];
  const mutationsTrend = metrics?.daily_mutations || [];
  const filteredBackups = getFilteredBackups(backups, backupSearch, backupSourceFilter, backupSort);
  const latestChecks = checksTrend.at(-1) || {};
  const latestMutations = mutationsTrend.at(-1) || {};
  const activeEntryRatio = Math.max(Number(summary.active_entries || 0), 0);
  const totalEntries = Math.max(
    Number(summary.active_entries || 0) + Number(summary.expired_entries || 0) + Number(summary.revoked_entries || 0),
    1
  );

  if (authStatus !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <Badge variant="accent">Access</Badge>
            <CardTitle className="mt-3 text-3xl">Memverifikasi Akses</CardTitle>
            <CardDescription className="mt-2">Halaman ini dilindungi Cloudflare Access. Jika sesi gagal, muat ulang setelah sesi Access aktif.</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert tone={banner.tone}>{banner.message}</Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-[1600px] gap-5 p-4 lg:grid-cols-[280px,1fr] lg:p-6">
        <aside className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-[var(--sidebar-2)] to-[var(--sidebar)] p-4 text-white shadow-[var(--shadow)] lg:p-5">
          <Badge variant="accent">Ops Console</Badge>
          <div className="mt-4">
            <h1 className="text-2xl font-semibold">Autoscript License</h1>
            <p className="mt-2 text-sm leading-6 text-white/65">Kelola lisensi, audit, metrics, dan recovery dengan stack React modern.</p>
          </div>
          <nav className="mt-6 flex gap-2 overflow-x-auto pb-1 lg:mt-8 lg:flex-col lg:overflow-visible lg:pb-0">
            <SidebarButton icon={LayoutDashboard} active={activeView === "dashboard"} onClick={() => setActiveView("dashboard")}>Dashboard</SidebarButton>
            <SidebarButton icon={ShieldCheck} active={activeView === "entries"} onClick={() => setActiveView("entries")}>Entries</SidebarButton>
            <SidebarButton icon={RefreshCw} active={activeView === "audit"} onClick={() => setActiveView("audit")}>Audit Log</SidebarButton>
            <SidebarButton icon={Settings} active={activeView === "settings"} onClick={() => setActiveView("settings")}>Settings</SidebarButton>
          </nav>
          <div className="mt-6 grid gap-3 lg:mt-8">
            <CompactSidebarStat label="Live Entries" value={`${activeEntryRatio}/${totalEntries}`} />
            <CompactSidebarStat label="Last Sync" value={formatRelativeTime(lastSyncedAt)} />
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 lg:mt-8">
            <div className="text-xs uppercase tracking-[0.16em] text-white/55">Access Identity</div>
            <div className="mt-3">
              <Badge variant="emerald">{session?.admin_email || "Not Connected"}</Badge>
            </div>
            <div className="mt-3 text-xs leading-5 text-white/55">
              API origin: <span className="font-mono text-white/80">{adminApiOrigin}</span>
            </div>
          </div>
        </aside>

        <main className="space-y-5">
          <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[var(--shadow)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <Badge variant="accent">Professional Ops</Badge>
                <h2 className="mt-3 text-3xl font-semibold">{VIEW_META[activeView].title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{VIEW_META[activeView].description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant="emerald">Access Protected</Badge>
                  <Badge variant="slate">{usesCrossOriginAdminApi ? "Relay via pages.dev" : "Same Origin"}</Badge>
                  <Badge variant="amber">{formatRelativeTime(lastSyncedAt)}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={refreshDashboard}><RefreshCw className="size-4" />Refresh</Button>
                <Button variant="outline" onClick={logoutAccess}>Logout Access</Button>
              </div>
            </div>
          </div>

          <Alert tone={banner.tone}>{banner.message}</Alert>

          {activeView === "dashboard" ? (
            <div className="space-y-5">
              <Card className="bg-[var(--panel-strong)]">
                <CardContent className="p-5">
                  <div className="grid gap-3 lg:grid-cols-[1fr,auto] lg:items-center">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <QuickSignal icon={Activity} label="Checks Today" value={`${Number(latestChecks.allow || 0) + Number(latestChecks.deny || 0)}`} meta={`${latestChecks.allow || 0} allow / ${latestChecks.deny || 0} deny`} />
                      <QuickSignal icon={RefreshCw} label="Mutations Today" value={`${Number(latestMutations.admin_mutations || 0) + Number(latestMutations.public_activations || 0) + Number(latestMutations.public_renewals || 0)}`} meta={`${latestMutations.admin_mutations || 0} admin / ${latestMutations.public_activations || 0} activate`} />
                      <QuickSignal icon={Database} label="Backups" value={backups.length} meta={`${filteredBackups.length} visible snapshots`} />
                      <QuickSignal icon={Clock3} label="Last Sync" value={formatRelativeTime(lastSyncedAt)} meta={lastSyncedAt ? formatDate(lastSyncedAt) : "Belum pernah refresh"} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[200px,1fr] lg:w-[360px]">
                      <Select value={metricsWindowDays} onValueChange={setMetricsWindowDays}>
                        <SelectTrigger><SelectValue placeholder="Metrics Window" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">Last 7 days</SelectItem>
                          <SelectItem value="14">Last 14 days</SelectItem>
                          <SelectItem value="30">Last 30 days</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="grid grid-cols-2 gap-3">
                        <Button variant="secondary" onClick={refreshMetrics}>Refresh Metrics</Button>
                        <Button variant="outline" onClick={() => setActiveView("settings")}>Open Recovery</Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="Active" value={summary.active_entries || 0} tone="emerald" meta={`${Math.round((activeEntryRatio / totalEntries) * 100)}% dari total entry`} />
                <MetricCard title="Expired" value={summary.expired_entries || 0} tone="amber" meta="Perlu review atau renew" />
                <MetricCard title="Revoked" value={summary.revoked_entries || 0} tone="rose" meta="Sedang diblokir dari alur publik" />
                <MetricCard title="Audit Rows" value={summary.audit_rows_window || 0} tone="slate" meta={`Window ${metricsWindowDays} hari`} />
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                <TrendCard title="License Check Trend" caption={`Last ${metricsWindowDays} days`} loading={metricsLoading} points={checksTrend} series={[{ key: "allow", label: "Allow", tone: "emerald" }, { key: "deny", label: "Deny", tone: "rose" }]} />
                <TrendCard title="Mutations Trend" caption={`Last ${metricsWindowDays} days`} loading={metricsLoading} points={mutationsTrend} series={[{ key: "admin_mutations", label: "Admin", tone: "amber" }, { key: "public_activations", label: "Activation", tone: "emerald" }, { key: "public_renewals", label: "Renew", tone: "slate" }]} />
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                <TopEventsCard items={topEvents} />
                <SourceSplitCard summary={summary} />
              </div>
            </div>
          ) : null}

          {activeView === "entries" ? (
            <div className="grid gap-5 xl:grid-cols-[1.45fr,0.85fr]">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <Badge variant="accent">Lookup</Badge>
                      <CardTitle className="mt-3">Entries</CardTitle>
                    </div>
                    <div className="flex flex-col gap-3 md:flex-row">
                      <div className="relative w-full md:w-72">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                        <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari IP, label, owner, notes" />
                      </div>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="All Status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                          <SelectItem value="revoked">Revoked</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 grid gap-3 sm:grid-cols-3">
                    <StatBox label="Visible" value={entries.length} />
                    <StatBox label="Filter Status" value={statusFilter === "all" ? "All" : statusLabel(statusFilter)} />
                    <StatBox label="Query" value={search.trim() || "No filter"} mono={Boolean(search.trim())} />
                  </div>
                  {entriesLoading ? (
                    <LoadingState message="Memuat entry lisensi..." />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>IP / Label</TableHead>
                            <TableHead>Owner / Notes</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Expires</TableHead>
                            <TableHead>Updated</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entries.length ? entries.map((entry) => (
                            <TableRow key={entry.id}>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="font-semibold">{entry.ip}</div>
                                  <div className="text-xs text-[var(--muted)]">{entry.label || "-"}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <div>{entry.owner || "-"}</div>
                                  <div className="text-xs text-[var(--muted)]">{entry.notes || "-"}</div>
                                </div>
                              </TableCell>
                              <TableCell><Badge variant={statusTone(entry.effective_status)}>{statusLabel(entry.effective_status)}</Badge></TableCell>
                              <TableCell>{formatDate(entry.expires_at)}</TableCell>
                              <TableCell>{formatDate(entry.updated_at)}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-2">
                                  <Button size="sm" variant="secondary" onClick={() => {
                                    setEditFormState({
                                      id: entry.id,
                                      ip: entry.ip || "",
                                      label: entry.label || "",
                                      owner: entry.owner || "",
                                      notes: entry.notes || "",
                                      expires_at: formatForDateTimeLocal(entry.expires_at || ""),
                                    });
                                    setEditDialogOpen(true);
                                  }}>Edit</Button>
                                  {entry.effective_status === "revoked" ? (
                                    <Button size="sm" variant="outline" onClick={() => toggleEntry(entry, "reactivate")}>Reactivate</Button>
                                  ) : (
                                    <Button size="sm" variant="outline" onClick={() => toggleEntry(entry, "revoke")}>Revoke</Button>
                                  )}
                                  <Button size="sm" variant="destructive" onClick={() => deleteEntry(entry)}>Delete</Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )) : (
                            <TableRow>
                              <TableCell colSpan={6}><LoadingState message="Belum ada entry IP." copy="Coba ubah filter atau buat entry baru." /></TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-[var(--panel-strong)]">
                <CardHeader>
                  <Badge variant="accent">Create Entry</Badge>
                  <CardTitle className="mt-3">Create IP Entry</CardTitle>
                  <CardDescription className="mt-2">Masukkan IP, masa aktif, dan catatan operator.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={handleCreateEntry}>
                    <Field label="IPv4 VPS"><Input value={formState.ip} onChange={(event) => setFormState((state) => ({ ...state, ip: event.target.value }))} placeholder="123.45.67.89" required /></Field>
                    <Field label="Label"><Input value={formState.label} onChange={(event) => setFormState((state) => ({ ...state, label: event.target.value }))} placeholder="Server SG-01" /></Field>
                    <Field label="Owner"><Input value={formState.owner} onChange={(event) => setFormState((state) => ({ ...state, owner: event.target.value }))} placeholder="Atomic Host" /></Field>
                    <Field label="Expires At"><Input type="datetime-local" value={formState.expires_at} onChange={(event) => setFormState((state) => ({ ...state, expires_at: event.target.value }))} /></Field>
                    <Field label="Notes"><Textarea value={formState.notes} onChange={(event) => setFormState((state) => ({ ...state, notes: event.target.value }))} placeholder="Keterangan operator" /></Field>
                    <div className="flex gap-3">
                      <Button className="flex-1"><Plus className="size-4" />Create Entry</Button>
                      <Button type="button" variant="secondary" onClick={() => setFormState(emptyEntryForm())}>Reset</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {activeView === "audit" ? (
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <Badge variant="accent">Audit</Badge>
                    <CardTitle className="mt-3">Audit Log</CardTitle>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input value={auditIp} onChange={(event) => setAuditIp(event.target.value)} placeholder="Filter IP audit" />
                    <Input value={auditEvent} onChange={(event) => setAuditEvent(event.target.value)} placeholder="Filter event" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <StatBox label="Rows" value={auditLogs.length} />
                  <StatBox label="IP Filter" value={auditIp.trim() || "All"} mono={Boolean(auditIp.trim())} />
                  <StatBox label="Event Filter" value={auditEvent.trim() || "All"} mono={Boolean(auditEvent.trim())} />
                </div>
                {auditLoading ? (
                  <LoadingState message="Memuat audit log..." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>When</TableHead>
                          <TableHead>Event</TableHead>
                          <TableHead>IP</TableHead>
                          <TableHead>Stage</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>Payload</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLogs.length ? auditLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell>{formatDate(log.created_at)}</TableCell>
                            <TableCell><Badge variant={statusTone(log.decision)}>{log.event_type || "-"}</Badge></TableCell>
                            <TableCell className="font-mono text-xs">{log.ip || "-"}</TableCell>
                            <TableCell>{log.stage || "-"}</TableCell>
                            <TableCell>{log.actor_email || "worker"}</TableCell>
                            <TableCell className="max-w-md text-xs text-[var(--muted)]">{JSON.stringify(log.payload_json || {})}</TableCell>
                          </TableRow>
                        )) : (
                          <TableRow>
                            <TableCell colSpan={6}><LoadingState message="Belum ada audit log." copy="Activity akan muncul setelah ada check atau perubahan." /></TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {activeView === "settings" ? (
            <div className="grid gap-5 xl:grid-cols-[0.75fr,1.25fr]">
              <Card>
                <CardHeader>
                  <Badge variant="accent">Session</Badge>
                  <CardTitle className="mt-3">Environment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <StatBox label="Admin" value={session?.admin_email || "-"} />
                  <StatBox label="Metrics Window" value={`${metricsWindowDays} days`} />
                  <StatBox label="Session" value="Protected by Access" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button variant="secondary" onClick={refreshBackups}><RefreshCw className="size-4" />Refresh Backups</Button>
                    <Button onClick={createBackup}><ShieldCheck className="size-4" />Create Backup</Button>
                  </div>
                  <div>
                    <input id="import-backup-input" type="file" accept="application/json,.json" hidden onChange={handleImportBackupFile} />
                    <Button variant="outline" onClick={() => document.getElementById("import-backup-input")?.click()}>Import Backup</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4">
                    <div>
                      <Badge variant="accent">Recovery</Badge>
                      <CardTitle className="mt-3">Backup & Restore</CardTitle>
                      <CardDescription className="mt-2">Mode restore v1 mengganti hanya `license_entries`. Gunakan Validate lebih dulu.</CardDescription>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1fr,180px,180px]">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                        <Input className="pl-9" value={backupSearch} onChange={(event) => setBackupSearch(event.target.value)} placeholder="Cari backup berdasarkan waktu, actor, atau key" />
                      </div>
                      <Select value={backupSourceFilter} onValueChange={setBackupSourceFilter}>
                        <SelectTrigger><SelectValue placeholder="All Sources" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sources</SelectItem>
                          <SelectItem value="r2">Manual</SelectItem>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={backupSort} onValueChange={setBackupSort}>
                        <SelectTrigger><SelectValue placeholder="Newest First" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="created_desc">Newest First</SelectItem>
                          <SelectItem value="created_asc">Oldest First</SelectItem>
                          <SelectItem value="rows_desc">Largest Entries</SelectItem>
                          <SelectItem value="size_desc">Largest Size</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {backupsLoading ? (
                    <LoadingState message="Memuat snapshot backup..." />
                  ) : filteredBackups.length ? (
                    <div className="space-y-3">
                      {filteredBackups.map((backup) => (
                        <div key={backup.key} className="rounded-2xl border border-[var(--line)] bg-white/75 p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={backup.source === "scheduled" ? "amber" : "emerald"}>{humanizeBackupSource(backup.source)}</Badge>
                                <span className="text-sm text-[var(--muted)]">{formatDate(backup.created_at)}</span>
                              </div>
                              <div className="font-medium">{backup.created_by || "-"}</div>
                              <div className="font-mono text-xs text-[var(--muted)]">{backup.key}</div>
                              <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
                                <span>{formatBackupRows(backup.row_counts)}</span>
                                <span>{formatBytes(backup.size || 0)}</span>
                                <span>{shortChecksum(backup.checksum_sha256)}</span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="secondary" onClick={() => loadBackupPreview(backup.key)}><Eye className="size-4" />Preview</Button>
                              <Button size="sm" variant="secondary" onClick={() => validateBackupRestore(backup.key)}>Validate</Button>
                              <Button size="sm" variant="outline" onClick={() => downloadBackupManifest(backup.key)}><FileJson className="size-4" />Manifest</Button>
                              <Button size="sm" variant="outline" onClick={() => downloadBackup(backup.key)}><Download className="size-4" />Download</Button>
                              <Button size="sm" onClick={() => restoreBackup(backup.key)}>Restore</Button>
                              <Button size="sm" variant="destructive" onClick={() => deleteBackup(backup.key)}><Trash2 className="size-4" />Delete</Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <LoadingState message="Belum ada snapshot backup." copy="Buat backup pertama dari panel admin." />
                  )}

                  <Card className="bg-[var(--panel-strong)] shadow-none">
                    <CardHeader>
                      <CardTitle>Backup Preview</CardTitle>
                      <CardDescription>{backupPreview ? `${formatDate(backupPreview.created_at)} • ${backupPreview.created_by || "-"} • ${formatBackupRows(backupPreview.row_counts)} • ${formatBytes(backupPreview.size || 0)}` : "Pilih preview snapshot untuk melihat ringkasan isi sebelum restore."}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {backupPreview ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          <StatBox label="Key" value={backupPreview.key} mono />
                          <StatBox label="Checksum" value={backupPreview.checksum_sha256 || "-"} mono />
                          <div className="md:col-span-2 rounded-2xl border border-[var(--line)] bg-white/70 p-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">License Sample</div>
                            <div className="mt-3 space-y-2 text-sm">
                              {(backupPreview.preview?.license_entries || []).length ? (
                                backupPreview.preview.license_entries.map((item) => (
                                  <div key={`${item.id}-${item.ip}`} className="rounded-xl border border-[var(--line)] px-3 py-2">
                                    <div className="font-medium">{item.ip || "-"}</div>
                                    <div className="text-xs text-[var(--muted)]">
                                      {item.label || "-"} • {item.status || "-"} • {formatDate(item.expires_at)}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-[var(--muted)]">Tidak ada sample.</div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <LoadingState message="Belum ada preview snapshot yang dipilih." />
                      )}
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </main>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
            <DialogDescription>Perbarui IP, masa aktif, dan catatan tanpa mengubah alur backend.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleUpdateEntry}>
            <Field label="IPv4 VPS"><Input value={editFormState.ip} onChange={(event) => setEditFormState((state) => ({ ...state, ip: event.target.value }))} required /></Field>
            <Field label="Label"><Input value={editFormState.label} onChange={(event) => setEditFormState((state) => ({ ...state, label: event.target.value }))} /></Field>
            <Field label="Owner"><Input value={editFormState.owner} onChange={(event) => setEditFormState((state) => ({ ...state, owner: event.target.value }))} /></Field>
            <Field label="Expires At"><Input type="datetime-local" value={editFormState.expires_at} onChange={(event) => setEditFormState((state) => ({ ...state, expires_at: event.target.value }))} /></Field>
            <Field label="Notes"><Textarea value={editFormState.notes} onChange={(event) => setEditFormState((state) => ({ ...state, notes: event.target.value }))} /></Field>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button>Update Entry</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SidebarButton({ icon: Icon, active, children, ...props }) {
  return (
    <button className={`flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition lg:min-w-0 ${active ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/8 hover:text-white"}`} {...props}>
      <Icon className="size-4" />
      <span>{children}</span>
    </button>
  );
}

function MetricCard({ title, value, tone, meta }) {
  return (
    <Card className="bg-[var(--panel-strong)]">
      <CardContent className="p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{title}</div>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div className="text-4xl font-semibold">{value}</div>
          <Badge variant={tone}>{title}</Badge>
        </div>
        <div className="mt-3 text-sm text-[var(--muted)]">{meta || "Operational snapshot"}</div>
      </CardContent>
    </Card>
  );
}

function QuickSignal({ icon: Icon, label, value, meta }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white/72 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</div>
        <Icon className="size-4 text-[var(--accent-strong)]" />
      </div>
      <div className="mt-3 text-2xl font-semibold leading-none">{value}</div>
      <div className="mt-2 text-sm text-[var(--muted)]">{meta}</div>
    </div>
  );
}

function TrendCard({ title, caption, loading, points, series }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge variant="accent">Trend</Badge>
            <CardTitle className="mt-3">{title}</CardTitle>
          </div>
          <Badge variant="slate">{caption}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingState message="Memuat trend..." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            {series.map((item) => {
              const values = points.map((point) => Number(point[item.key] || 0));
              const total = values.reduce((sum, value) => sum + value, 0);
              const latest = values.at(-1) || 0;
              return (
                <div key={item.key} className="rounded-2xl border border-[var(--line)] bg-white/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{item.label}</div>
                      <div className="text-sm text-[var(--muted)]">{total} total</div>
                    </div>
                    <Badge variant={item.tone}>{latest} latest</Badge>
                  </div>
                  <svg className="mt-4 h-14 w-full" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
                    <path d={buildSparklinePath(values)} fill="none" stroke="currentColor" strokeWidth="1.75" className={item.tone === "emerald" ? "text-emerald-600" : item.tone === "rose" ? "text-rose-600" : item.tone === "amber" ? "text-amber-600" : "text-slate-600"} vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                    {points.slice(-6).map((point) => (
                      <span key={`${item.key}-${point.day}`}>{formatShortDay(point.day)}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TopEventsCard({ items }) {
  return (
    <Card>
      <CardHeader>
        <Badge variant="accent">Activity</Badge>
        <CardTitle className="mt-3">Top Events</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <div className="space-y-3">
            {items.map((item) => {
              const width = Math.max(8, Math.round((Number(item.count || 0) / Math.max(...items.map((entry) => Number(entry.count || 0)), 1)) * 100));
              return (
                <div key={item.event_type} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{item.event_type || "-"}</div>
                    <div className="text-sm text-[var(--muted)]">{item.count} events</div>
                  </div>
                  <div className="h-2 rounded-full bg-black/5">
                    <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <LoadingState message="Belum ada event historis." copy="Window ini belum memiliki cukup data." />
        )}
      </CardContent>
    </Card>
  );
}

function SourceSplitCard({ summary }) {
  const publicEntries = Number(summary.public_entries || 0);
  const adminEntries = Number(summary.admin_entries || 0);
  const total = Math.max(publicEntries + adminEntries, 1);
  const publicWidth = Math.round((publicEntries / total) * 100);
  const adminWidth = 100 - publicWidth;
  return (
    <Card>
      <CardHeader>
        <Badge variant="accent">Source Split</Badge>
        <CardTitle className="mt-3">Entry Source</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex h-4 overflow-hidden rounded-full bg-black/5">
          <div className="bg-emerald-500" style={{ width: `${publicWidth}%` }} />
          <div className="bg-[var(--accent)]" style={{ width: `${adminWidth}%` }} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <StatBox label="Public Entry" value={publicEntries} />
          <StatBox label="Manual Entry" value={adminEntries} />
          <StatBox label="Manual Updates" value={Number(summary.admin_mutations || 0)} />
          <StatBox label="Audit Rows Window" value={Number(summary.audit_rows_window || 0)} />
        </div>
      </CardContent>
    </Card>
  );
}

function StatBox({ label, value, mono = false }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white/70 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</div>
      <div className={`mt-2 text-sm ${mono ? "font-mono break-all" : "font-medium"}`}>{String(value ?? "-")}</div>
    </div>
  );
}

function CompactSidebarStat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className="mt-2 text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-2">
      <div className="text-sm font-medium">{label}</div>
      {children}
    </label>
  );
}

function LoadingState({ message, copy = "Tunggu sebentar." }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--line)] p-10 text-center text-sm text-[var(--muted)]">
      <div className="font-medium text-[var(--fg)]">{message}</div>
      <div className="mt-2">{copy}</div>
    </div>
  );
}

function emptyEntryForm() {
  return { id: "", ip: "", label: "", owner: "", notes: "", expires_at: "" };
}

function humanizeBackupSource(value) {
  const source = String(value || "r2").trim().toLowerCase();
  if (source === "scheduled") return "Scheduled";
  if (source === "r2") return "Manual";
  return source || "Unknown";
}

function getFilteredBackups(backups, query, sourceFilter, sortKey) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const filtered = backups.filter((backup) => {
    const source = String(backup.source || "r2").trim().toLowerCase();
    if (sourceFilter !== "all" && source !== sourceFilter) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      backup.key,
      backup.created_at,
      backup.created_by,
      formatDate(backup.created_at || ""),
      formatBackupRows(backup.row_counts),
      backup.checksum_sha256,
      humanizeBackupSource(backup.source),
    ].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });
  return filtered.sort((left, right) => {
    if (sortKey === "created_asc") return Date.parse(String(left.created_at || "")) - Date.parse(String(right.created_at || ""));
    if (sortKey === "rows_desc") return Number(right.row_counts?.license_entries || 0) - Number(left.row_counts?.license_entries || 0);
    if (sortKey === "size_desc") return Number(right.size || 0) - Number(left.size || 0);
    return Date.parse(String(right.created_at || "")) - Date.parse(String(left.created_at || ""));
  });
}

function triggerDownload(blob, fileName) {
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
}

createRoot(document.getElementById("root")).render(<AdminApp />);
