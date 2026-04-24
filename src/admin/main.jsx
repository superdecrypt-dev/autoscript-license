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
  formatRelativeTime,
  formatShortDay,
  shortChecksum,
  statusLabel,
  statusTone,
} from "../shared/utils.js";
import {
  Activity,
  ArrowUpRight,
  Clock3,
  Database,
  Download,
  Eye,
  FileJson,
  Filter,
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
  dashboard: {
    label: "Dashboard",
    title: "Operations Console",
    description: "Radar utama untuk lisensi, traffic checks, dan backup health.",
  },
  entries: {
    label: "Entries",
    title: "Registry Board",
    description: "Kelola entry lisensi, expiry, revocation, dan identity metadata.",
  },
  audit: {
    label: "Audit",
    title: "Event Ledger",
    description: "Lihat jejak event publik dan admin secara cepat dan tersaring.",
  },
  settings: {
    label: "Recovery",
    title: "Recovery Deck",
    description: "Snapshot backup, restore, download, dan import ada di sini.",
  },
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
  const [entryDetailOpen, setEntryDetailOpen] = useState(false);
  const [entryDetail, setEntryDetail] = useState(null);
  const [backupPreviewOpen, setBackupPreviewOpen] = useState(false);
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
  }, [authStatus, activeView]);

  useEffect(() => {
    if (authStatus === "authenticated" && activeView === "audit") refreshAuditLogs();
  }, [auditIp, auditEvent]);

  useEffect(() => {
    if (authStatus === "authenticated" && activeView === "entries") refreshEntries();
  }, [search, statusFilter]);

  useEffect(() => {
    if (authStatus === "authenticated" && activeView === "dashboard") refreshMetrics();
  }, [metricsWindowDays]);

  async function authenticateWithAccess() {
    setAuthStatus("authenticating");
    setBanner({ tone: "muted", message: "Memverifikasi akses Cloudflare..." });
    try {
      const currentSession = await apiFetch("/api/admin/session");
      maybeCompleteAccessRelay();
      setSession(currentSession);
      setAuthStatus("authenticated");
      setBanner({ tone: "ok", message: `Terhubung: ${currentSession.admin_email || "-"}` });
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
      handleAuthFailure(error, "Gagal refresh daftar entry.");
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
      handleAuthFailure(error, "Gagal refresh event ledger.");
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

  function openEntryDetail(entry) {
    setEntryDetail(entry);
    setEntryDetailOpen(true);
  }

  async function openBackupPreviewDialog(backupKey) {
    const preview = await loadBackupPreview(backupKey);
    if (preview) setBackupPreviewOpen(true);
  }

  async function validateBackupRestore(backupKey) {
    try {
      const payload = await apiFetch(`/api/admin/backups/${encodeURIComponent(backupKey)}/restore?dry_run=1`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const backup = backups.find((item) => item.key === backupKey) || {};
      setBanner({
        tone: "ok",
        message: `Dry-run OK: ${formatBackupRows(payload.row_counts)} • ${backup.created_by || "-"} • ${shortChecksum(payload.checksum_sha256)}`,
      });
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
      await apiFetch(`/api/admin/license-entries/${encodeURIComponent(editFormState.id)}`, {
        method: "PATCH",
        body: JSON.stringify(editFormState),
      });
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
      await apiFetch(`/api/admin/license-entries/${encodeURIComponent(entry.id)}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
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
    const requestBody = options.body;

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
  const latestChecks = checksTrend.at(-1) || {};
  const latestMutations = mutationsTrend.at(-1) || {};
  const filteredBackups = getFilteredBackups(backups, backupSearch, backupSourceFilter, backupSort);
  const adminAlertClass =
    banner.tone === "ok"
      ? "border-emerald-400/25 bg-emerald-500/14 text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      : banner.tone === "error"
        ? "border-rose-400/25 bg-rose-500/14 text-rose-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        : banner.tone === "warn"
          ? "border-amber-400/25 bg-amber-500/16 text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border-white/10 bg-white/5 text-white/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";
  const activeEntries = Number(summary.active_entries || 0);
  const expiredEntries = Number(summary.expired_entries || 0);
  const revokedEntries = Number(summary.revoked_entries || 0);
  const totalEntries = Math.max(activeEntries + expiredEntries + revokedEntries, 1);

  if (authStatus !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <Badge variant="accent">Cloudflare Access</Badge>
            <CardTitle className="mt-3 text-3xl">Memverifikasi sesi admin</CardTitle>
            <CardDescription className="mt-2">
              Dashboard admin tetap dilindungi Access. Bila sesi belum aktif, browser akan diarahkan ke relay yang benar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className={adminAlertClass} tone={banner.tone}>{banner.message}</Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-[1700px] p-4 md:p-6">
      <div className="grid gap-5 xl:grid-cols-[300px,1fr]">
        <aside className="page-enter overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(9,15,31,0.98),rgba(8,11,24,0.98))] p-5 shadow-[var(--shadow)]">
          <div className="space-y-6">
            <div>
              <Badge variant="accent">Admin Surface</Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-white">Autoscript License</h1>
              <p className="mt-3 text-sm leading-6 text-white/62">
                Console operasi baru untuk registry, event ledger, dan recovery flow. Fokusnya cepat dipindai saat pekerjaan sedang ramai.
              </p>
            </div>

            <div className="grid gap-3">
              <SidebarSignal label="Identity" value={session?.admin_email || "Unknown"} />
              <SidebarSignal label="Entries" value={`${activeEntries} active / ${totalEntries} total`} />
              <SidebarSignal label="Last Sync" value={lastSyncedAt ? formatRelativeTime(lastSyncedAt) : "Belum ada"} />
            </div>

            <div className="space-y-2">
              {Object.entries(VIEW_META).map(([key, item]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveView(key)}
                  className={`w-full rounded-[1.35rem] border px-4 py-3 text-left transition ${
                    activeView === key
                      ? "border-white/24 bg-white/12 text-white shadow-[0_18px_36px_rgba(0,0,0,0.22)]"
                      : "border-white/10 bg-white/[0.03] text-white/68 hover:border-white/14 hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.18em]">{item.label}</div>
                  <div className="mt-2 text-sm font-medium">{item.title}</div>
                </button>
              ))}
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">API Origin</div>
              <div className="mt-2 break-all font-mono text-xs text-white/80">{adminApiOrigin}</div>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" size="sm" onClick={refreshDashboard}>
                  <RefreshCw className="size-4" />
                  Sync
                </Button>
                <Button variant="outline" size="sm" onClick={logoutAccess}>Logout</Button>
              </div>
            </div>
          </div>
        </aside>

        <main className="space-y-5">
          <section className="page-enter rounded-[2rem] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[var(--shadow)] md:p-6">
            <div className="grid gap-5 lg:grid-cols-[1fr,auto] lg:items-end">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <Badge variant="accent">{VIEW_META[activeView].label}</Badge>
                  <Badge variant="slate">Metrics window {metricsWindowDays} hari</Badge>
                </div>
                <div>
                  <h2 className="text-4xl font-semibold tracking-[-0.05em]">{VIEW_META[activeView].title}</h2>
                  <p className="mt-3 max-w-4xl text-sm leading-6 text-[var(--muted)]">{VIEW_META[activeView].description}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                  <MetricTile label="Checks Today" value={Number(latestChecks.allow || 0) + Number(latestChecks.deny || 0)} note={`${latestChecks.allow || 0} allow / ${latestChecks.deny || 0} deny`} icon={Activity} />
                  <MetricTile label="Mutations Today" value={Number(latestMutations.admin_mutations || 0) + Number(latestMutations.public_activations || 0) + Number(latestMutations.public_renewals || 0)} note={`${latestMutations.admin_mutations || 0} admin actions`} icon={ArrowUpRight} />
                  <MetricTile label="Snapshots" value={backups.length} note={`${filteredBackups.length} visible`} icon={Database} />
                  <MetricTile label="Registry" value={`${activeEntries}/${totalEntries}`} note={`${revokedEntries} revoked / ${expiredEntries} expired`} icon={ShieldCheck} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[220px,1fr]">
                <Select value={metricsWindowDays} onValueChange={setMetricsWindowDays}>
                  <SelectTrigger><SelectValue placeholder="Pilih window metrics" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="14">Last 14 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="secondary" onClick={refreshDashboard}><RefreshCw className="size-4" />Refresh</Button>
                  <Button variant="outline" onClick={() => setActiveView("settings")}>Recovery</Button>
                </div>
              </div>
            </div>
          </section>

          <Alert className={`page-enter stagger-1 ${adminAlertClass}`} tone={banner.tone}>{banner.message}</Alert>

          {activeView === "dashboard" ? (
            <section className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard title="Active Entries" value={activeEntries} detail={`${Math.round((activeEntries / totalEntries) * 100)}% dari registry`} tone="emerald" />
                <KpiCard title="Expired Entries" value={expiredEntries} detail="Perlu review / renew" tone="amber" />
                <KpiCard title="Revoked Entries" value={revokedEntries} detail="Diblokir dari jalur publik" tone="rose" />
                <KpiCard title="Audit Rows" value={Number(summary.audit_rows_window || 0)} detail={`Window ${metricsWindowDays} hari`} tone="slate" />
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <TrendPanel
                  title="License Check Stream"
                  caption={`Aktivitas allow vs deny selama ${metricsWindowDays} hari`}
                  loading={metricsLoading}
                  points={checksTrend}
                  series={[
                    { key: "allow", label: "Allow", tone: "emerald" },
                    { key: "deny", label: "Deny", tone: "rose" },
                  ]}
                />
                <TrendPanel
                  title="Mutation Stream"
                  caption={`Aktivitas admin, activation, dan renew publik`}
                  loading={metricsLoading}
                  points={mutationsTrend}
                  series={[
                    { key: "admin_mutations", label: "Admin", tone: "amber" },
                    { key: "public_activations", label: "Activation", tone: "emerald" },
                    { key: "public_renewals", label: "Renew", tone: "slate" },
                  ]}
                />
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.1fr,0.9fr]">
                <Card>
                  <CardHeader>
                    <Badge variant="accent">Top Events</Badge>
                    <CardTitle className="mt-3">Apa yang paling sering terjadi</CardTitle>
                    <CardDescription className="mt-2">Distribusi event pada window metrics aktif.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {topEvents.length ? (
                      <div className="space-y-3">
                        {topEvents.map((item) => {
                          const width = Math.max(8, Math.round((Number(item.count || 0) / Math.max(...topEvents.map((entry) => Number(entry.count || 0)), 1)) * 100));
                          return (
                            <div key={item.event_type} className="space-y-2 rounded-[1.35rem] border border-[var(--line)] bg-white/70 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="font-medium">{item.event_type || "-"}</div>
                                <Badge variant="slate">{item.count} events</Badge>
                              </div>
                              <div className="h-2 rounded-full bg-black/5">
                                <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${width}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <EmptyState title="Belum ada event historis" body="Window metrics ini belum memiliki cukup data untuk divisualkan." />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <Badge variant="accent">Source Split</Badge>
                    <CardTitle className="mt-3">Asal entry lisensi</CardTitle>
                    <CardDescription className="mt-2">Perbandingan entry dari jalur publik vs tindakan manual admin.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <SplitBar left={Number(summary.public_entries || 0)} right={Number(summary.admin_entries || 0)} />
                    <div className="grid gap-3 md:grid-cols-2">
                      <DataCell label="Public Entry" value={summary.public_entries || 0} />
                      <DataCell label="Manual Entry" value={summary.admin_entries || 0} />
                      <DataCell label="Manual Mutations" value={summary.admin_mutations || 0} />
                      <DataCell label="Visible Snapshots" value={filteredBackups.length} />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.05fr,0.95fr]">
                <Card>
                  <CardHeader>
                    <Badge variant="emerald">System Readout</Badge>
                    <CardTitle className="mt-3">Ringkasan operasional</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    <DataCell label="Allow Today" value={latestChecks.allow || 0} />
                    <DataCell label="Deny Today" value={latestChecks.deny || 0} />
                    <DataCell label="Public Activations" value={latestMutations.public_activations || 0} />
                    <DataCell label="Public Renewals" value={latestMutations.public_renewals || 0} />
                    <DataCell label="Admin Mutations" value={latestMutations.admin_mutations || 0} />
                    <DataCell label="Last Sync" value={lastSyncedAt ? formatRelativeTime(lastSyncedAt) : "Belum ada"} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <Badge variant="amber">Recovery Watch</Badge>
                    <CardTitle className="mt-3">Snapshot terbaru</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {filteredBackups.length ? (
                      <div className="space-y-3">
                        {filteredBackups.slice(0, 3).map((backup) => (
                          <div key={backup.key} className="rounded-[1.35rem] border border-[var(--line)] bg-white/72 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-medium">{backup.key.split("/").at(-1) || backup.key}</div>
                                <div className="mt-1 text-sm text-[var(--muted)]">{formatDate(backup.created_at)} • {humanizeBackupSource(backup.source)}</div>
                              </div>
                              <Badge variant="slate">{formatBackupRows(backup.row_counts)}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState title="Belum ada snapshot" body="Buat snapshot pertama untuk membuka jalur recovery." />
                    )}
                  </CardContent>
                </Card>
              </div>
            </section>
          ) : null}

          {activeView === "entries" ? (
            <section className="grid gap-5 xl:grid-cols-[1.08fr,0.92fr]">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <Badge variant="accent">Registry Scanner</Badge>
                      <CardTitle className="mt-3">Entry board</CardTitle>
                      <CardDescription className="mt-2">Scanning dibuat cepat: filter di atas, metadata inti di depan, tindakan di sisi kanan.</CardDescription>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),180px]">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" />
                        <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari IP, label, owner, notes" />
                      </div>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger><SelectValue placeholder="Semua status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua status</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                          <SelectItem value="revoked">Revoked</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <DataCell label="Visible Rows" value={entries.length} />
                    <DataCell label="Current Filter" value={statusFilter === "all" ? "Semua" : statusLabel(statusFilter)} />
                    <DataCell label="Query" value={search.trim() || "Tanpa query"} mono={Boolean(search.trim())} />
                  </div>

                  <div className="hidden xl:block">
                    <div className="overflow-hidden rounded-[1.6rem] border border-[var(--line)] bg-white/74">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Identity</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Expiry</TableHead>
                            <TableHead>Owner</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entries.map((entry) => (
                            <TableRow key={entry.id}>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="font-mono text-sm font-semibold">{entry.ip}</div>
                                  <div className="text-sm text-[var(--muted)]">{entry.label || "Tanpa label"}</div>
                                </div>
                              </TableCell>
                              <TableCell><Badge variant={statusTone(entry.effective_status)}>{statusLabel(entry.effective_status)}</Badge></TableCell>
                              <TableCell>{formatDate(entry.expires_at)}</TableCell>
                              <TableCell>{entry.owner || "-"}</TableCell>
                              <TableCell className="max-w-[240px] text-sm text-[var(--muted)]">{entry.notes || "-"}</TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="ghost" onClick={() => openEntryDetail(entry)}><Eye className="size-4" />Detail</Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                      setEditFormState({
                                        id: entry.id,
                                        ip: entry.ip || "",
                                        label: entry.label || "",
                                        owner: entry.owner || "",
                                        notes: entry.notes || "",
                                        expires_at: formatForDateTimeLocal(entry.expires_at),
                                      });
                                      setEditDialogOpen(true);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => toggleEntry(entry, entry.effective_status === "revoked" ? "reactivate" : "revoke")}>
                                    {entry.effective_status === "revoked" ? "Reactivate" : "Revoke"}
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => deleteEntry(entry)}><Trash2 className="size-4" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:hidden">
                    {entries.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        onInspect={() => openEntryDetail(entry)}
                        onEdit={() => {
                          setEditFormState({
                            id: entry.id,
                            ip: entry.ip || "",
                            label: entry.label || "",
                            owner: entry.owner || "",
                            notes: entry.notes || "",
                            expires_at: formatForDateTimeLocal(entry.expires_at),
                          });
                          setEditDialogOpen(true);
                        }}
                        onToggle={() => toggleEntry(entry, entry.effective_status === "revoked" ? "reactivate" : "revoke")}
                        onDelete={() => deleteEntry(entry)}
                      />
                    ))}
                  </div>

                  {!entriesLoading && !entries.length ? (
                    <EmptyState title="Tidak ada entry yang cocok" body="Ubah filter atau tambahkan entry baru dari panel composer." />
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <Badge variant="emerald">Composer</Badge>
                  <CardTitle className="mt-3">Buat entry baru</CardTitle>
                  <CardDescription className="mt-2">Panel ini dipakai untuk input manual saat perlu override jalur publik atau menambahkan lisensi secara langsung.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <DataCell label="Mode" value="Create Entry" />
                    <DataCell label="Expiry" value={formState.expires_at ? formatDate(formState.expires_at) : "Default backend"} />
                    <DataCell label="Target IP" value={formState.ip?.trim() || "Belum diisi"} mono={Boolean(formState.ip?.trim())} />
                    <DataCell label="Identity" value={buildFormIdentity(formState)} />
                  </div>
                  <form className="space-y-4" onSubmit={handleCreateEntry}>
                    <Field label="IP">
                      <Input value={formState.ip} onChange={(event) => setFormState((current) => ({ ...current, ip: event.target.value }))} placeholder="123.45.67.89" />
                    </Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Label">
                        <Input value={formState.label} onChange={(event) => setFormState((current) => ({ ...current, label: event.target.value }))} placeholder="Production VPS" />
                      </Field>
                      <Field label="Owner">
                        <Input value={formState.owner} onChange={(event) => setFormState((current) => ({ ...current, owner: event.target.value }))} placeholder="Ops Team" />
                      </Field>
                    </div>
                    <Field label="Expires At">
                      <Input type="datetime-local" value={formState.expires_at} onChange={(event) => setFormState((current) => ({ ...current, expires_at: event.target.value }))} />
                    </Field>
                    <Field label="Notes">
                      <Textarea value={formState.notes} onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))} placeholder="Catatan internal admin..." />
                    </Field>
                    <Button type="submit"><Plus className="size-4" />Create Entry</Button>
                  </form>
                </CardContent>
              </Card>
            </section>
          ) : null}

          {activeView === "audit" ? (
            <section className="grid gap-5 xl:grid-cols-[340px,1fr]">
              <Card>
                <CardHeader>
                  <Badge variant="accent">Ledger Filter</Badge>
                  <CardTitle className="mt-3">Saring event</CardTitle>
                  <CardDescription className="mt-2">Gunakan filter tipis untuk memperkecil noise dan menemukan thread kejadian dengan cepat.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="IP Filter">
                    <Input value={auditIp} onChange={(event) => setAuditIp(event.target.value)} placeholder="123.45.67.89" />
                  </Field>
                  <Field label="Event Filter">
                    <Input value={auditEvent} onChange={(event) => setAuditEvent(event.target.value)} placeholder="license_check, public_activate..." />
                  </Field>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                    <DataCell label="Visible Events" value={auditLogs.length} />
                    <DataCell label="Window" value="Last 120 rows" />
                  </div>
                  <Button variant="secondary" onClick={refreshAuditLogs}><Filter className="size-4" />Refresh Ledger</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <Badge variant="slate">Event Ledger</Badge>
                  <CardTitle className="mt-3">Jejak event terbaru</CardTitle>
                </CardHeader>
                <CardContent>
                  {auditLoading ? (
                    <EmptyState title="Memuat event ledger" body="Sedang mengambil audit log terbaru dari worker." />
                  ) : auditLogs.length ? (
                    <div className="grid gap-3">
                      {auditLogs.map((log) => (
                        <AuditRow key={log.id || `${log.created_at}-${log.event_type}-${log.ip || "x"}`} log={log} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Belum ada event" body="Filter saat ini tidak mengembalikan event apa pun." />
                  )}
                </CardContent>
              </Card>
            </section>
          ) : null}

          {activeView === "settings" ? (
            <section className="grid gap-5 xl:grid-cols-[360px,1fr]">
              <Card>
                <CardHeader>
                  <Badge variant="amber">Recovery Controls</Badge>
                  <CardTitle className="mt-3">Backup operations</CardTitle>
                  <CardDescription className="mt-2">Buat snapshot, import backup file, lalu validasi restore sebelum menyentuh data produksi.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                    <DataCell label="Snapshots" value={backups.length} />
                    <DataCell label="Visible" value={filteredBackups.length} />
                  </div>
                  <Button onClick={createBackup}><Plus className="size-4" />Create Snapshot</Button>
                  <label className="block">
                    <input className="hidden" type="file" accept="application/json" onChange={handleImportBackupFile} />
                    <span className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--line-strong)] bg-[var(--panel-strong)] px-5 text-sm font-semibold text-[var(--fg)] transition hover:bg-[var(--panel)]">
                      <HardDriveUpload className="size-4" />
                      Import Backup File
                    </span>
                  </label>
                  <Field label="Search Snapshot">
                    <Input value={backupSearch} onChange={(event) => setBackupSearch(event.target.value)} placeholder="Cari key, checksum, actor..." />
                  </Field>
                  <Field label="Source">
                    <Select value={backupSourceFilter} onValueChange={setBackupSourceFilter}>
                      <SelectTrigger><SelectValue placeholder="Semua source" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua source</SelectItem>
                        <SelectItem value="r2">Manual</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Sort">
                    <Select value={backupSort} onValueChange={setBackupSort}>
                      <SelectTrigger><SelectValue placeholder="Sort backup" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="created_desc">Newest first</SelectItem>
                        <SelectItem value="created_asc">Oldest first</SelectItem>
                        <SelectItem value="rows_desc">Largest row count</SelectItem>
                        <SelectItem value="size_desc">Largest file size</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <Badge variant="slate">Snapshot Deck</Badge>
                  <CardTitle className="mt-3">Backup inventory</CardTitle>
                  <CardDescription className="mt-2">Setiap row mendukung preview, dry-run restore, download, restore penuh, dan delete.</CardDescription>
                </CardHeader>
                <CardContent>
                  {backupsLoading ? (
                    <EmptyState title="Memuat snapshot" body="Sedang mengambil daftar backup dari worker." />
                  ) : filteredBackups.length ? (
                    <div className="grid gap-3">
                      {filteredBackups.map((backup) => (
                        <BackupCard
                          key={backup.key}
                          backup={backup}
                          onPreview={() => openBackupPreviewDialog(backup.key)}
                          onValidate={() => validateBackupRestore(backup.key)}
                          onDownload={() => downloadBackup(backup.key)}
                          onManifest={() => downloadBackupManifest(backup.key)}
                          onRestore={() => restoreBackup(backup.key)}
                          onDelete={() => deleteBackup(backup.key)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Tidak ada snapshot yang cocok" body="Ubah filter pencarian atau buat snapshot baru." />
                  )}
                </CardContent>
              </Card>
            </section>
          ) : null}
        </main>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit entry</DialogTitle>
            <DialogDescription>Perubahan ini akan dikirim ke worker admin API dan dicatat dalam audit log.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleUpdateEntry}>
            <Field label="IP">
              <Input value={editFormState.ip} onChange={(event) => setEditFormState((current) => ({ ...current, ip: event.target.value }))} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Label">
                <Input value={editFormState.label} onChange={(event) => setEditFormState((current) => ({ ...current, label: event.target.value }))} />
              </Field>
              <Field label="Owner">
                <Input value={editFormState.owner} onChange={(event) => setEditFormState((current) => ({ ...current, owner: event.target.value }))} />
              </Field>
            </div>
            <Field label="Expires At">
              <Input type="datetime-local" value={editFormState.expires_at} onChange={(event) => setEditFormState((current) => ({ ...current, expires_at: event.target.value }))} />
            </Field>
            <Field label="Notes">
              <Textarea value={editFormState.notes} onChange={(event) => setEditFormState((current) => ({ ...current, notes: event.target.value }))} />
            </Field>
            <div className="flex gap-3">
              <Button type="submit">Save Changes</Button>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={entryDetailOpen} onOpenChange={setEntryDetailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Entry detail</DialogTitle>
            <DialogDescription>Ringkasan lengkap metadata entry yang sedang dipilih.</DialogDescription>
          </DialogHeader>
          {entryDetail ? (
            <div className="grid gap-3 md:grid-cols-2">
              <DataCell label="IP" value={entryDetail.ip} mono />
              <DataCell label="Status" value={statusLabel(entryDetail.effective_status)} />
              <DataCell label="Label" value={entryDetail.label || "-"} />
              <DataCell label="Owner" value={entryDetail.owner || "-"} />
              <DataCell label="Created At" value={formatDate(entryDetail.created_at)} />
              <DataCell label="Updated At" value={formatDate(entryDetail.updated_at)} />
              <DataCell label="Expires At" value={formatDate(entryDetail.expires_at)} />
              <DataCell label="Entry ID" value={entryDetail.id} mono />
              <div className="md:col-span-2">
                <DataCell label="Notes" value={entryDetail.notes || "-"} />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={backupPreviewOpen} onOpenChange={setBackupPreviewOpen}>
        <DialogContent className="w-[min(94vw,900px)]">
          <DialogHeader>
            <DialogTitle>Snapshot preview</DialogTitle>
            <DialogDescription>Metadata, row count, dan sample isi backup sebelum restore dijalankan.</DialogDescription>
          </DialogHeader>
          {backupPreview ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <DataCell label="Key" value={backupPreview.key} mono />
                <DataCell label="Created" value={formatDate(backupPreview.created_at)} />
                <DataCell label="Actor" value={backupPreview.created_by || "-"} />
                <DataCell label="Source" value={humanizeBackupSource(backupPreview.source)} />
                <DataCell label="Size" value={formatBytes(backupPreview.size || 0)} />
                <DataCell label="Checksum" value={backupPreview.checksum_sha256 || "-"} mono />
              </div>
              <div className="rounded-[1.45rem] border border-[var(--line)] bg-white/74 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Row Counts</div>
                <div className="mt-2 text-sm">{formatBackupRows(backupPreview.row_counts)}</div>
              </div>
              <div className="rounded-[1.45rem] border border-[var(--line)] bg-white/74 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Sample Payload</div>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-[1.2rem] bg-black/[0.04] p-4 text-xs leading-6 text-[var(--muted)]">
                  {formatPayloadSummary(backupPreview.sample_payload || {})}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SidebarSignal({ label, value }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42">{label}</div>
      <div className="mt-2 text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function MetricTile({ label, value, note, icon: Icon }) {
  return (
    <div className="rounded-[1.45rem] border border-[var(--line)] bg-white/74 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
        <Icon className="size-4 text-[var(--accent)]" />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{value}</div>
      <div className="mt-2 text-sm text-[var(--muted)]">{note}</div>
    </div>
  );
}

function KpiCard({ title, value, detail, tone }) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/18 bg-emerald-500/[0.07]"
      : tone === "amber"
        ? "border-amber-400/18 bg-amber-500/[0.08]"
        : tone === "rose"
          ? "border-rose-400/18 bg-rose-500/[0.07]"
          : "border-[var(--line)] bg-white/72";
  return (
    <div className={`rounded-[1.55rem] border p-5 ${toneClass}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{title}</div>
      <div className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail}</div>
    </div>
  );
}

function TrendPanel({ title, caption, loading, points, series }) {
  return (
    <Card>
      <CardHeader>
        <Badge variant="accent">Trend</Badge>
        <CardTitle className="mt-3">{title}</CardTitle>
        <CardDescription className="mt-2">{caption}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <EmptyState title="Memuat trend data" body="Sedang mengambil metrics dari worker." />
        ) : !points.length ? (
          <EmptyState title="Belum ada data trend" body="Window ini belum punya data historis yang cukup." />
        ) : (
          <div className="grid gap-4">
            {series.map((item) => {
              const values = points.map((point) => Number(point[item.key] || 0));
              const latest = values.at(-1) || 0;
              const total = values.reduce((sum, value) => sum + value, 0);
              return (
                <div key={item.key} className="rounded-[1.4rem] border border-[var(--line)] bg-white/72 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{item.label}</div>
                      <div className="text-sm text-[var(--muted)]">{total} total</div>
                    </div>
                    <Badge variant={item.tone}>{latest} latest</Badge>
                  </div>
                  <svg className="mt-4 h-16 w-full" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
                    <path
                      d={buildSparklinePath(values)}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      className={item.tone === "emerald" ? "text-emerald-600" : item.tone === "rose" ? "text-rose-600" : item.tone === "amber" ? "text-amber-600" : "text-slate-600"}
                      vectorEffect="non-scaling-stroke"
                    />
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

function SplitBar({ left, right }) {
  const total = Math.max(Number(left || 0) + Number(right || 0), 1);
  const leftWidth = Math.round((Number(left || 0) / total) * 100);
  return (
    <div className="space-y-3">
      <div className="flex h-4 overflow-hidden rounded-full bg-black/5">
        <div className="bg-emerald-500" style={{ width: `${leftWidth}%` }} />
        <div className="bg-[var(--accent)]" style={{ width: `${100 - leftWidth}%` }} />
      </div>
      <div className="flex justify-between text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
        <span>Public</span>
        <span>Manual</span>
      </div>
    </div>
  );
}

function DataCell({ label, value, mono = false }) {
  return (
    <div className="rounded-[1.3rem] border border-[var(--line)] bg-white/72 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</div>
      <div className={`mt-2 text-sm ${mono ? "break-all font-mono" : "font-medium"}`}>{String(value ?? "-")}</div>
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

function EmptyState({ title, body }) {
  return (
    <div className="rounded-[1.55rem] border border-dashed border-[var(--line)] bg-white/40 p-10 text-center">
      <div className="font-medium tracking-[-0.02em]">{title}</div>
      <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{body}</div>
    </div>
  );
}

function EntryCard({ entry, onInspect, onEdit, onToggle, onDelete }) {
  return (
    <div className="rounded-[1.55rem] border border-[var(--line)] bg-white/74 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-sm font-semibold">{entry.ip}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">{entry.label || "Tanpa label"}</div>
        </div>
        <Badge variant={statusTone(entry.effective_status)}>{statusLabel(entry.effective_status)}</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <DataCell label="Owner" value={entry.owner || "-"} />
        <DataCell label="Expires" value={formatDate(entry.expires_at)} />
        <DataCell label="Updated" value={formatDate(entry.updated_at)} />
        <DataCell label="Notes" value={entry.notes || "-"} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="sm" variant="ghost" onClick={onInspect}>Detail</Button>
        <Button size="sm" variant="secondary" onClick={onEdit}>Edit</Button>
        <Button size="sm" variant="outline" onClick={onToggle}>{entry.effective_status === "revoked" ? "Reactivate" : "Revoke"}</Button>
        <Button size="sm" variant="destructive" onClick={onDelete}>Delete</Button>
      </div>
    </div>
  );
}

function AuditRow({ log }) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/74 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium">{log.event_type || "-"}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">{formatDate(log.created_at)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={statusTone(log.decision)}>{log.decision || "n/a"}</Badge>
          <Badge variant="slate">{log.stage || "log"}</Badge>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <DataCell label="IP" value={log.ip || "-"} mono />
        <DataCell label="Actor" value={log.actor_email || "worker"} />
        <DataCell label="Event ID" value={log.id || "-"} mono />
      </div>
      <div className="mt-4 rounded-[1.35rem] border border-[var(--line)] bg-white/70 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Payload Summary</div>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-[var(--muted)]">
          {formatPayloadSummary(log.payload_json)}
        </pre>
      </div>
    </div>
  );
}

function BackupCard({ backup, onPreview, onValidate, onDownload, onManifest, onRestore, onDelete }) {
  return (
    <div className="rounded-[1.55rem] border border-[var(--line)] bg-white/74 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="font-medium">{backup.key}</div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="slate">{humanizeBackupSource(backup.source)}</Badge>
            <Badge variant="amber">{formatBackupRows(backup.row_counts)}</Badge>
          </div>
          <div className="text-sm leading-6 text-[var(--muted)]">
            {formatDate(backup.created_at)} • {backup.created_by || "-"} • {formatBytes(backup.size || 0)}
          </div>
          <div className="break-all font-mono text-xs text-[var(--muted)]">{backup.checksum_sha256 || "Checksum belum dimuat"}</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:w-[360px]">
          <Button size="sm" variant="ghost" onClick={onPreview}><Eye className="size-4" />Preview</Button>
          <Button size="sm" variant="secondary" onClick={onValidate}><ShieldCheck className="size-4" />Validate</Button>
          <Button size="sm" variant="outline" onClick={onRestore}><RefreshCw className="size-4" />Restore</Button>
          <Button size="sm" variant="outline" onClick={onDownload}><Download className="size-4" />Backup</Button>
          <Button size="sm" variant="outline" onClick={onManifest}><FileJson className="size-4" />Manifest</Button>
          <Button size="sm" variant="destructive" onClick={onDelete}><Trash2 className="size-4" />Delete</Button>
        </div>
      </div>
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

function formatPayloadSummary(payload) {
  try {
    return JSON.stringify(payload || {}, null, 2);
  } catch (_error) {
    return "{}";
  }
}

function buildFormIdentity(formState) {
  const parts = [formState.label, formState.owner].map((value) => String(value || "").trim()).filter(Boolean);
  return parts.length ? parts.join(" / ") : "Belum ada identitas tambahan";
}

createRoot(document.getElementById("root")).render(<AdminApp />);
