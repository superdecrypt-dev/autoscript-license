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
  ThemeToggle,
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
  AlertCircle,
  Clock3,
  Database,
  Download,
  Eye,
  FileJson,
  LayoutDashboard,
  Lock,
  LogOut,
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
  const adminApiOrigin = config.adminApiBaseUrl;
  const usesCrossOriginAdminApi = adminApiOrigin !== window.location.origin;
  const [activeView, setActiveView] = useState(localStorage.getItem("autoscriptLicenseAdminActiveView") || "dashboard");
  const [authStatus, setAuthStatus] = useState("authenticating");
  const [banner, setBanner] = useState({ tone: "muted", message: "Memverifikasi akses Cloudflare..." });
  const [toast, setToast] = useState({ show: false, tone: "muted", message: "" });
  const [session, setSession] = useState(null);
  const [entries, setEntries] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const bannerTimeoutRef = React.useRef(null);

  function notify(tone, message) {
    if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    setToast({ show: true, tone, message });
    bannerTimeoutRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 5000);
  }

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
  const [auditEvent, setAuditEvent] = useState("all");
  const [backupSearch, setBackupSearch] = useState("");
  const [backupSourceFilter, setBackupSourceFilter] = useState("all");
  const [backupSort, setBackupSort] = useState("created_desc");
  const [formState, setFormState] = useState(emptyEntryForm());
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [targetEntry, setTargetEntry] = useState(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [editFormState, setEditFormState] = useState(emptyEntryForm());
  const [entryDetailOpen, setEntryDetailOpen] = useState(false);
  const [entryDetail, setEntryDetail] = useState(null);
  const [backupPreviewOpen, setBackupPreviewOpen] = useState(false);
  const [sysSettings, setSysSettings] = useState({ backup_auto_enabled: true, backup_interval_hours: 24, backup_retention_days: 30 });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredEntries = useMemo(() => {
    let data = entries;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter(e => 
        (e.ip || "").toLowerCase().includes(q) || 
        (e.label || "").toLowerCase().includes(q) || 
        (e.owner || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter && statusFilter !== "all") {
      data = data.filter(e => e.effective_status === statusFilter);
    }
    return data;
  }, [entries, search, statusFilter]);

  const totalPages = Math.ceil(filteredEntries.length / pageSize);
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, pageSize]);

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
  }, [activeView, authStatus]);

  useEffect(() => {
    if (authStatus === "authenticated" && activeView === "audit") refreshAuditLogs();
  }, [auditIp, auditEvent, authStatus]);

  useEffect(() => {
    if (authStatus === "authenticated" && activeView === "entries") refreshEntries();
  }, [search, statusFilter, authStatus]);

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
    const logoutUrl = new URL("/cdn-cgi/access/logout", window.location.origin);
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
      const [payload, settings] = await Promise.all([
        fetchBackups(),
        apiFetch("/api/admin/settings")
      ]);
      setBackups(payload.items || []);
      setSysSettings(settings);
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
    if (auditEvent && auditEvent !== "all") params.set("event", auditEvent);
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
      notify("ok", "Snapshot backup berhasil dibuat.");
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
      notify("ok", `Backup ${file.name} berhasil di-import.`);
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
            ? { ...item, checksum_sha256: payload.item?.checksum_sha256 || item.checksum_sha256 || "", row_counts: payload.item?.row_counts || item.row_counts }
            : item
        )
      );
      if (!silent) notify("ok", "Preview snapshot berhasil dimuat.");
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
      notify("ok", `Dry-run OK: ${formatBackupRows(payload.row_counts)} • ${backup.created_by || "-"} • ${shortChecksum(payload.checksum_sha256)}`);
    } catch (error) {
      handleAuthFailure(error, "Gagal validasi snapshot backup.");
    }
  }

  async function restoreBackup(backupKey) {
    let backup = backups.find((item) => item.key === backupKey);
    if (!backup || !backup.checksum_sha256) {
      backup = await loadBackupPreview(backupKey, true);
    }
    const summaryStr = [
      `Created: ${formatDate(backup?.created_at)}`,
      `Actor: ${backup?.created_by || "-"}`,
      `Source: ${backup?.source || "-"}`,
      `Entries: ${formatBackupRows(backup?.row_counts)}`,
      `Size: ${formatBytes(backup?.size || 0)}`,
      `Checksum: ${backup?.checksum_sha256 || "-"}`,
    ].join("\n");
    if (!window.confirm(`Restore snapshot berikut akan mengganti daftar license entries saat ini:\n\n${summaryStr}\n\nLanjutkan?`)) return;
    try {
      await apiFetch(`/api/admin/backups/${encodeURIComponent(backupKey)}/restore`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      notify("ok", "Sistem berhasil dipulihkan dari snapshot backup.");
      await refreshDashboard();
    } catch (error) {
      handleAuthFailure(error, "Gagal restore snapshot backup.");
    }
  }

  async function deleteBackup(backupKey) {
    if (!window.confirm(`Hapus snapshot ${backupKey}?`)) return;
    try {
      await apiFetch(`/api/admin/backups/${encodeURIComponent(backupKey)}`, { method: "DELETE" });
      notify("ok", "Snapshot backup berhasil dihapus.");
      await refreshBackups();
    } catch (error) {
      handleAuthFailure(error, "Gagal menghapus snapshot backup.");
    }
  }

  async function updateSysSettings(updates) {
    setSettingsLoading(true);
    try {
      const newSettings = await apiFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(updates)
      });
      setSysSettings(newSettings);
      notify("ok", "Pengaturan sistem berhasil diperbarui.");
    } catch (error) {
      handleAuthFailure(error, "Gagal memperbarui pengaturan.");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function downloadBackup(backupKey) {
    try {
      const response = await fetchAdminBlob(`/api/admin/backups/${encodeURIComponent(backupKey)}/download`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = backupKey.split("/").pop() || "backup.json";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      notify("ok", "File backup berhasil diunduh.");
    } catch (error) {
      handleAuthFailure(error, "Gagal mengunduh file backup.");
    }
  }

  async function handleCreateEntry(event) {
    event.preventDefault();
    try {
      await apiFetch("/api/admin/license-entries", { method: "POST", body: JSON.stringify(formState) });
      notify("ok", `Sukses: IP ${formState.ip} berhasil didaftarkan.`);
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
      notify("ok", `Sukses: Perubahan IP ${editFormState.ip} berhasil disimpan.`);
      setEditDialogOpen(false);
      setEditFormState(emptyEntryForm());
      await refreshDashboard();
    } catch (error) {
      handleAuthFailure(error, "Gagal memperbarui entry.");
    }
  }

  async function toggleEntry(entry, action) {
    if (action === "revoke") {
      setTargetEntry(entry);
      setRevokeReason("");
      setRevokeDialogOpen(true);
      return;
    }
    await executeToggleEntry(entry, action);
  }

  async function executeToggleEntry(entry, action, reason = "") {
    try {
      const body = reason ? { notes_append: `\n[REVOKE REASON: ${reason}]` } : {};
      await apiFetch(`/api/admin/license-entries/${encodeURIComponent(entry.id)}/${action}`, { 
        method: "POST", 
        body: JSON.stringify(body) 
      });
      notify("ok", `Sukses: IP ${entry.ip} berhasil di-${action}.`);
      setRevokeDialogOpen(false);
      await refreshDashboard();
    } catch (error) {
      handleAuthFailure(error, `Gagal ${action} entry.`);
    }
  }

  async function deleteEntry(entry) {
    setTargetEntry(entry);
    setConfirmDeleteOpen(true);
  }

  function formatDateSimple(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function exportToCsv() {
    if (!entries.length) return;
    const headers = ["ID", "IP", "Label", "Owner", "Status", "Expires", "Notes"];
    const rows = entries.map(e => [
      e.id, 
      e.ip, 
      e.label || "", 
      e.owner || "", 
      e.effective_status, 
      formatDateSimple(e.expires_at), 
      (e.notes || "").replace(/\n/g, " ")
    ]);
    const csvContent = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `autoscript-licenses-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify("ok", "Data lisensi berhasil diekspor ke CSV.");
  }

  async function executeDeleteEntry() {
    if (!targetEntry) return;
    try {
      const deletedIp = targetEntry.ip;
      await apiFetch(`/api/admin/license-entries/${encodeURIComponent(targetEntry.id)}`, { method: "DELETE" });
      notify("ok", `Sukses: Data IP ${deletedIp} telah dihapus permanen.`);
      setConfirmDeleteOpen(false);
      setTargetEntry(null);
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
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete("relay_failed");
    
    // Redirect to local /admin/ path to trigger local Cloudflare Access first
    const relayUrl = new URL("/admin/", window.location.origin);
    relayUrl.searchParams.set("return_to", currentUrl.pathname + currentUrl.search);
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
      // If it's just a path, it's already local
      if (returnTarget.startsWith("/")) {
         currentUrl.searchParams.delete("return_to");
         window.history.replaceState({}, "", returnTarget);
         return;
      }
      const targetUrl = new URL(returnTarget, window.location.origin);
      if (targetUrl.origin === window.location.origin) {
        currentUrl.searchParams.delete("return_to");
        window.history.replaceState({}, "", targetUrl.pathname + targetUrl.search);
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
  const daily = metrics?.daily || [];
  const checksTrend = daily.map(d => ({ 
    allow: d.checks_allowed, 
    deny: d.checks_denied 
  }));
  const mutationsTrend = daily.map(d => ({ 
    admin_mutations: d.admin_mutations, 
    public_activations: d.public_activations, 
    public_renewals: d.public_renewals 
  }));
  const filteredBackups = getFilteredBackups(backups, backupSearch, backupSourceFilter, backupSort);
  const latestChecks = checksTrend.at(-1) || {};
  const latestMutations = mutationsTrend.at(-1) || {};
  const activeEntryRatio = Math.max(Number(summary.active_entries || 0), 0);
  const totalEntries = Math.max(
    Number(summary.active_entries || 0) + Number(summary.expired_entries || 0) + Number(summary.revoked_entries || 0),
    1
  );

  if (authStatus === "authenticating") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-10 font-sans text-[var(--fg)]">
        <div className="flex flex-col items-center gap-4">
           <RefreshCw className="size-10 text-[var(--accent)] animate-spin" />
           <p className="text-sm font-medium opacity-70">Memverifikasi akses...</p>
        </div>
      </div>
    );
  }

  if (authStatus !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-10 font-sans text-[var(--fg)]">
        <Card className="w-full max-w-md shadow-xl shadow-[var(--accent)]/5 border-[var(--line)]">
          <CardHeader className="text-center pt-8">
            <div className="mx-auto bg-[var(--accent)]/10 text-[var(--accent)] size-14 rounded-full flex items-center justify-center mb-4">
              <ShieldCheck className="size-7" />
            </div>
            <CardTitle className="text-2xl font-bold">Operator Console</CardTitle>
            <CardDescription className="mt-2 opacity-70">Sistem manajemen lisensi terpusat.</CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            <Alert tone={banner.tone} className="shadow-sm">{banner.message}</Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex font-sans text-[var(--fg)]">
      {/* Fixed Sidebar */}
      <aside className="hidden md:flex w-64 bg-slate-900 dark:bg-zinc-950 flex-col fixed inset-y-0 z-10 shadow-xl shadow-black/20">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3 text-white font-bold text-xl">
            <div className="bg-blue-600 p-1.5 rounded-lg shadow-md shadow-blue-900/50">
              <ShieldCheck className="size-5 text-white" />
            </div>
            <span>License Ops</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <SidebarButton icon={LayoutDashboard} active={activeView === "dashboard"} onClick={() => setActiveView("dashboard")}>Dashboard</SidebarButton>
          <SidebarButton icon={Database} active={activeView === "entries"} onClick={() => setActiveView("entries")}>License Entries</SidebarButton>
          <SidebarButton icon={Activity} active={activeView === "audit"} onClick={() => setActiveView("audit")}>Audit Logs</SidebarButton>
          <SidebarButton icon={Settings} active={activeView === "settings"} onClick={() => setActiveView("settings")}>Settings & Backup</SidebarButton>
        </nav>

        <div className="p-4 border-t border-white/10 bg-black/20 space-y-4">
          <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/10 shadow-inner">
            <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">Identity</div>
            <div className="text-sm font-medium text-slate-200 truncate" title={session?.admin_email}>{session?.admin_email || "Offline"}</div>
          </div>
          <Button variant="ghost" className="w-full text-slate-400 hover:text-white hover:bg-white/10 justify-start" onClick={logoutAccess}>
             <LogOut className="size-4 mr-2" /> Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 min-h-screen flex flex-col pb-20 md:pb-0 relative">
        {/* Floating Toast Notification */}
        <div className={`fixed top-4 left-4 right-4 z-[100] pointer-events-none flex justify-center md:left-[300px] transition-all duration-500 transform ${toast.show ? "translate-y-0 opacity-100" : "-translate-y-12 opacity-0"}`}>
           <div className="w-full max-w-md pointer-events-auto">
             <Alert tone={toast.tone} className="shadow-2xl border border-white/10 backdrop-blur-md">
                {toast.message}
             </Alert>
           </div>
        </div>
        <header className="bg-[var(--panel)] border-b border-[var(--line)] px-4 md:px-8 py-4 md:py-5 flex justify-between items-center sticky top-0 z-10 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold">{VIEW_META[activeView].title}</h1>
            <p className="text-sm text-[var(--muted)] mt-1">{VIEW_META[activeView].description}</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="secondary" onClick={refreshDashboard} className="h-9 px-3 sm:px-5">
              <RefreshCw className="size-4 sm:mr-2" /> <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={logoutAccess} className="md:hidden h-9 px-2 text-rose-500 hover:bg-rose-500/10 border border-rose-500/20">
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <div className="flex-1 p-4 md:p-8 overflow-y-auto page-enter">
          {activeView === "dashboard" && (
            <div className="space-y-6">
              {/* Top Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <MetricCard title="Active Licenses" value={summary.active_entries || 0} tone="emerald" meta={`${Math.round((activeEntryRatio / totalEntries) * 100)}% active`} />
                <MetricCard title="Expired" value={summary.expired_entries || 0} tone="amber" meta="Needs review" />
                <MetricCard title="Revoked" value={summary.revoked_entries || 0} tone="rose" meta="Blocked IPs" />
                <MetricCard title="Audit Rows" value={summary.audit_rows_window || 0} tone="slate" meta={`${metricsWindowDays} days window`} />
              </div>

              {/* Charts & Activity */}
              <div className="grid gap-6 xl:grid-cols-2">
                <TrendCard title="Check Trend" caption={`Last ${metricsWindowDays} days`} loading={metricsLoading} points={checksTrend} series={[{ key: "allow", label: "Allow", tone: "emerald" }, { key: "deny", label: "Deny", tone: "rose" }]} />
                <TrendCard title="Mutation Trend" caption={`Last ${metricsWindowDays} days`} loading={metricsLoading} points={mutationsTrend} series={[{ key: "admin_mutations", label: "Admin", tone: "amber" }, { key: "public_activations", label: "Activate", tone: "emerald" }, { key: "public_renewals", label: "Renew", tone: "slate" }]} />
              </div>

              {/* Health, Backups & Activity */}
              <div className="grid gap-6 xl:grid-cols-3">
                <OperationalHealthCard latestChecks={latestChecks} latestMutations={latestMutations} summary={summary} metricsWindowDays={metricsWindowDays} />
                <RecentRecoveryCard backups={filteredBackups} onOpenSettings={() => setActiveView("settings")} />
                <RecentActivityCard logs={auditLogs} onOpenAudit={() => setActiveView("audit")} />
              </div>
            </div>
          )}

          {activeView === "entries" && (
            <div className="space-y-6">
              <Card className="shadow-sm flex flex-col border-[var(--line)]">
                <CardHeader className="bg-[var(--panel-strong)] border-b border-[var(--line)] pb-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg font-bold">Daftar IP</CardTitle>
                      <CardDescription>Total {filteredEntries.length} data ditemukan.</CardDescription>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                      <Button variant="secondary" onClick={exportToCsv} disabled={!entries.length}>
                        <Download className="size-4 mr-2" /> <span className="hidden sm:inline">Export CSV</span>
                      </Button>
                      <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--muted)]" />
                        <Input className="pl-9 w-full" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari IP, label..." />
                      </div>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua Status</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                          <SelectItem value="revoked">Revoked</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button onClick={() => setCreateDialogOpen(true)}>
                        <Plus className="size-4 mr-2" /> <span className="whitespace-nowrap">Tambah IP</span>
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-hidden">
                  {entriesLoading ? (
                    <LoadingState message="Memuat entry..." />
                  ) : (
                    <>
                      {/* Desktop Table */}
                      <div className="hidden md:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-[var(--panel-strong)] border-[var(--line)]">
                              <TableHead>IP / Label</TableHead>
                              <TableHead>Owner</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Expires</TableHead>
                              <TableHead className="text-right">Aksi</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginatedEntries.map((entry) => (
                              <TableRow key={entry.id} className="border-[var(--line)]">
                                <TableCell>
                                  <div className="font-mono font-bold text-[var(--fg)]">{entry.ip}</div>
                                  <div className="text-xs text-[var(--muted)]">{entry.label || "-"}</div>
                                </TableCell>
                                <TableCell className="text-sm opacity-90">{entry.owner || "-"}</TableCell>
                                <TableCell><Badge variant={statusTone(entry.effective_status)}>{statusLabel(entry.effective_status)}</Badge></TableCell>
                                <TableCell className="text-sm opacity-80">{formatDate(entry.expires_at)}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="secondary" onClick={() => openEntryDetail(entry)}>
                                      <Eye className="size-4" />
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={() => {
                                      setEditFormState({
                                        id: entry.id, ip: entry.ip || "", label: entry.label || "", owner: entry.owner || "", notes: entry.notes || "", expires_at: formatForDateTimeLocal(entry.expires_at || ""),
                                      });
                                      setEditDialogOpen(true);
                                    }}>Edit</Button>
                                    <Button size="sm" variant="outline" className={entry.effective_status === 'revoked' ? 'text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/10' : 'text-rose-500 border-rose-500/20 hover:bg-rose-500/10'} onClick={() => toggleEntry(entry, entry.effective_status === "revoked" ? "reactivate" : "revoke")}>
                                      {entry.effective_status === "revoked" ? "Reactivate" : "Revoke"}
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => deleteEntry(entry)}>
                                      <Trash2 className="size-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Mobile Card List */}
                      <div className="md:hidden divide-y divide-[var(--line)]">
                        {paginatedEntries.length ? paginatedEntries.map((entry) => (
                          <div key={entry.id} className="p-4 space-y-4 active:bg-[var(--panel-strong)] transition-colors">
                            <div className="flex justify-between items-start">
                              <div className="space-y-1">
                                <div className="font-mono font-bold text-base text-[var(--accent)]">{entry.ip}</div>
                                <div className="text-xs font-medium text-[var(--muted)] bg-[var(--panel-strong)] px-2 py-0.5 rounded w-fit">{entry.label || "No Label"}</div>
                              </div>
                              <Badge variant={statusTone(entry.effective_status)} className="shadow-sm">
                                {statusLabel(entry.effective_status)}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              <div>
                                <div className="text-[var(--muted)] uppercase tracking-wider font-bold mb-0.5 opacity-70">Owner</div>
                                <div className="text-[var(--fg)]">{entry.owner || "-"}</div>
                              </div>
                              <div>
                                <div className="text-[var(--muted)] uppercase tracking-wider font-bold mb-0.5 opacity-70">Expires</div>
                                <div className="text-[var(--fg)] font-medium">{formatDate(entry.expires_at)}</div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2">
                              <Button size="sm" variant="secondary" className="h-9 shadow-sm" onClick={() => openEntryDetail(entry)}>
                                <Eye className="size-4 mr-2" /> Detail
                              </Button>
                              <Button size="sm" variant="secondary" className="h-9 shadow-sm" onClick={() => {
                                setEditFormState({
                                  id: entry.id, ip: entry.ip || "", label: entry.label || "", owner: entry.owner || "", notes: entry.notes || "", expires_at: formatForDateTimeLocal(entry.expires_at || ""),
                                });
                                setEditDialogOpen(true);
                              }}>
                                <Settings className="size-4 mr-2" /> Edit
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className={`h-9 ${entry.effective_status === 'revoked' ? 'text-emerald-500 border-emerald-500/20' : 'text-rose-500 border-rose-500/20'}`} 
                                onClick={() => toggleEntry(entry, entry.effective_status === "revoked" ? "reactivate" : "revoke")}
                              >
                                {entry.effective_status === "revoked" ? "ACTIVATE" : "REVOKE"}
                              </Button>
                              <Button size="sm" variant="destructive" className="h-9" onClick={() => deleteEntry(entry)}>
                                <Trash2 className="size-4 mr-2" /> Hapus
                              </Button>
                            </div>
                          </div>
                        )) : (
                          <div className="p-8 text-center text-[var(--muted)] text-sm">Tidak ada data.</div>
                        )}
                      </div>

                      {/* Pagination Bar */}
                      <div className="p-4 border-t border-[var(--line)] bg-[var(--panel-strong)]/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                          <span>Tampilkan</span>
                          <select 
                            className="bg-[var(--panel)] border border-[var(--line-strong)] rounded px-2 py-1 text-[var(--fg)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                            value={pageSize}
                            onChange={(e) => setPageSize(Number(e.target.value))}
                          >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                          <span>baris</span>
                        </div>
                        
                        <div className="flex items-center gap-4">
                           <span className="text-sm text-[var(--muted)]">Halaman <b>{currentPage}</b> dari <b>{totalPages || 1}</b></span>
                           <div className="flex items-center gap-2">
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                              >
                                Prev
                              </Button>
                              <Button 
                                variant="secondary" 
                                size="sm" 
                                disabled={currentPage >= totalPages}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                              >
                                Next
                              </Button>
                           </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {activeView === "audit" && (
            <Card className="shadow-sm border-[var(--line)]">
              <CardHeader className="bg-[var(--panel-strong)] border-b border-[var(--line)] pb-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <CardTitle className="text-lg font-bold">Audit Log</CardTitle>
                  <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--muted)]" />
                      <Input className="pl-9 w-full" value={auditIp} onChange={(e) => setAuditIp(e.target.value)} placeholder="Filter IP..." />
                    </div>
                    <Select value={auditEvent} onValueChange={setAuditEvent}>
                      <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Event Type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua Event</SelectItem>
                        <SelectItem value="license_check">Check (Public)</SelectItem>
                        <SelectItem value="public_activate">Activate (Public)</SelectItem>
                        <SelectItem value="public_renew">Renew (Public)</SelectItem>
                        <SelectItem value="admin_create">Create (Admin)</SelectItem>
                        <SelectItem value="admin_update">Update (Admin)</SelectItem>
                        <SelectItem value="admin_delete">Delete (Admin)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {auditLoading ? (
                  <LoadingState message="Memuat audit log..." />
                ) : (
                  <>
                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-[var(--panel-strong)] border-[var(--line)]">
                            <TableHead>Waktu / IP</TableHead>
                            <TableHead>Event</TableHead>
                            <TableHead className="hidden md:table-cell">Actor</TableHead>
                            <TableHead className="hidden lg:table-cell">Detail</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {auditLogs.length ? auditLogs.map((log) => (
                            <TableRow key={log.id} className="border-[var(--line)]">
                              <TableCell className="py-3 px-2 sm:px-4">
                                <div className="text-[10px] sm:text-sm text-[var(--muted)] font-medium">{formatDate(log.created_at)}</div>
                                <div className="font-mono text-[10px] sm:text-xs font-bold text-[var(--accent)] mt-0.5">{log.ip || "-"}</div>
                              </TableCell>
                              <TableCell className="py-3 px-1 sm:px-4">
                                <Badge variant={statusTone(log.decision)} className="text-[9px] sm:text-xs px-1.5 py-0 truncate max-w-[80px] sm:max-w-none">{log.event_type || "-"}</Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-sm opacity-80">{log.actor_email || "worker"}</TableCell>
                              <TableCell className="hidden lg:table-cell text-xs text-[var(--muted)] font-mono truncate max-w-xs" title={JSON.stringify(log.payload_json)}>{JSON.stringify(log.payload_json || {})}</TableCell>
                            </TableRow>
                          )) : <TableRow><TableCell colSpan={5}><LoadingState message="Tidak ada log."/></TableCell></TableRow>}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile Log Feed */}
                    <div className="md:hidden divide-y divide-[var(--line)]">
                      {auditLogs.length ? auditLogs.map((log) => (
                        <div key={log.id} className="p-4 flex gap-4 items-start active:bg-[var(--panel-strong)] transition-colors">
                          <div className={`mt-1 size-2 shrink-0 rounded-full ${log.decision === 'allow' || log.decision === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'} shadow-[0_0_8px_rgba(0,0,0,0.1)]`} />
                          <div className="flex-1 space-y-1 min-w-0">
                            <div className="flex justify-between items-center gap-2">
                              <div className="font-mono font-bold text-xs text-[var(--fg)] truncate">{log.ip || "System"}</div>
                              <div className="text-[10px] text-[var(--muted)] font-medium whitespace-nowrap">{formatDate(log.created_at).split(',')[1]}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={statusTone(log.decision)} className="text-[9px] px-1 py-0">{log.event_type}</Badge>
                              <span className="text-[10px] text-[var(--muted)] truncate">{log.actor_email || "worker"}</span>
                            </div>
                          </div>
                        </div>
                      )) : (
                        <div className="p-8 text-center text-[var(--muted)] text-sm">Tidak ada log.</div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {activeView === "settings" && (
            <div className="grid gap-6 xl:grid-cols-[1fr,2fr]">
              <div className="space-y-6">
                <Card className="shadow-sm h-fit border-[var(--line)]">
                  <CardHeader className="bg-[var(--panel-strong)] border-b border-[var(--line)]">
                    <CardTitle className="text-lg font-bold">System Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    <Button className="w-full justify-start" onClick={createBackup}><Database className="size-4 mr-3" /> Buat Snapshot Backup</Button>
                    <Button variant="secondary" className="w-full justify-start" onClick={refreshBackups}><RefreshCw className="size-4 mr-3" /> Refresh List</Button>
                    
                    <div className="pt-4 border-t border-[var(--line)]">
                      <input id="import-backup-input" type="file" accept="application/json,.json" hidden onChange={handleImportBackupFile} />
                      <Button variant="outline" className="w-full justify-start" onClick={() => document.getElementById("import-backup-input")?.click()}>
                         <Download className="size-4 mr-3" /> Import Backup File
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-[var(--line)]">
                  <CardHeader className="bg-[var(--panel-strong)] border-b border-[var(--line)]">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <Clock3 className="size-5 text-[var(--accent)]" />
                      Auto Backup Config
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-5">
                    <div className="flex items-center justify-between p-3 bg-[var(--panel-strong)] rounded-xl border border-[var(--line)]">
                       <div className="space-y-0.5">
                          <div className="text-sm font-bold">Backup Otomatis</div>
                          <div className="text-xs text-[var(--muted)]">Jalankan snapshot terjadwal.</div>
                       </div>
                       <button 
                        onClick={() => updateSysSettings({ backup_auto_enabled: !sysSettings.backup_auto_enabled })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${sysSettings.backup_auto_enabled ? 'bg-emerald-500' : 'bg-[var(--line-strong)]'}`}
                       >
                         <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sysSettings.backup_auto_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                       </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-[var(--muted)]">Interval (Jam)</label>
                        <Input 
                          type="number" 
                          min="1" 
                          value={sysSettings.backup_interval_hours} 
                          onChange={(e) => updateSysSettings({ backup_interval_hours: e.target.value })}
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-[var(--muted)]">Retention (Hari)</label>
                        <Input 
                          type="number" 
                          min="1" 
                          value={sysSettings.backup_retention_days} 
                          onChange={(e) => updateSysSettings({ backup_retention_days: e.target.value })}
                          className="h-9"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Mobile Session Management */}
                <Card className="md:hidden shadow-sm border-rose-500/20 bg-rose-500/5">
                  <CardHeader className="bg-rose-500/10 border-b border-rose-500/10">
                    <CardTitle className="text-sm font-bold flex items-center gap-2 text-rose-500">
                      <ShieldCheck className="size-4" />
                      Session Management
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase text-rose-400/70 font-bold tracking-wider">Logged in as</div>
                      <div className="text-sm font-bold text-[var(--fg)] truncate">{session?.admin_email || "Unknown User"}</div>
                    </div>
                    <Button variant="destructive" size="sm" className="w-full h-10" onClick={logoutAccess}>
                      <LogOut className="size-4 mr-2" /> Keluar Sesi (Logout)
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <Card className="shadow-sm border-[var(--line)]">
                <CardHeader className="bg-[var(--panel-strong)] border-b border-[var(--line)]">
                  <CardTitle className="text-lg font-bold">Daftar Snapshot</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {backupsLoading ? <LoadingState message="Memuat..." /> : 
                   filteredBackups.length ? (
                     <div className="divide-y divide-[var(--line)]">
                       {filteredBackups.map(backup => (
                         <div key={backup.key} className="p-5 hover:bg-[var(--panel-strong)]/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                           <div>
                             <div className="flex items-center gap-2 mb-1">
                               <Badge variant={backup.source === "scheduled" ? "amber" : "emerald"}>{humanizeBackupSource(backup.source)}</Badge>
                               <span className="text-sm font-bold text-[var(--fg)]">{formatDate(backup.created_at)}</span>
                             </div>
                             <div className="text-xs font-mono text-[var(--muted)] mb-1">{backup.key}</div>
                             <div className="text-sm text-[var(--muted)] flex gap-3">
                               <span>{formatBackupRows(backup.row_counts)}</span>
                               <span>&bull;</span>
                               <span>{formatBytes(backup.size)}</span>
                             </div>
                           </div>
                           <div className="flex flex-wrap gap-2">
                             <Button size="sm" variant="secondary" onClick={() => openBackupPreviewDialog(backup.key)}><Eye className="size-4 mr-1"/> Preview</Button>
                             <Button size="sm" variant="secondary" onClick={() => downloadBackup(backup.key)}><Download className="size-4 mr-1"/> Download</Button>
                             <Button size="sm" variant="outline" className="text-amber-500 border-amber-500/20 hover:bg-amber-500/10" onClick={() => restoreBackup(backup.key)}>Restore</Button>
                             <Button size="sm" variant="ghost" className="text-[var(--muted)] hover:text-red-500" onClick={() => deleteBackup(backup.key)}><Trash2 className="size-4" /></Button>
                           </div>
                         </div>
                       ))}
                     </div>
                   ) : <LoadingState message="Tidak ada backup." />
                  }
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Mobile Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--panel)] border-t border-[var(--line)] flex items-center justify-around z-20 shadow-lg px-2 safe-bottom pb-1">
          <MobileNavButton icon={LayoutDashboard} active={activeView === "dashboard"} label="Home" onClick={() => setActiveView("dashboard")} />
          <MobileNavButton icon={Database} active={activeView === "entries"} label="IPs" onClick={() => setActiveView("entries")} />
          <MobileNavButton icon={Activity} active={activeView === "audit"} label="Logs" onClick={() => setActiveView("audit")} />
          <MobileNavButton icon={Settings} active={activeView === "settings"} label="Settings" onClick={() => setActiveView("settings")} />
        </nav>
      </main>

      {/* Entry Detail Dialog */}
      <Dialog open={entryDetailOpen} onOpenChange={setEntryDetailOpen}>
        <DialogContent className="max-w-2xl border-[var(--line)] bg-[var(--panel)]">
          <DialogHeader>
            <DialogTitle>Detail Lisensi: {entryDetail?.ip}</DialogTitle>
            <DialogDescription>Informasi lengkap dan riwayat audit spesifik IP.</DialogDescription>
          </DialogHeader>
          {entryDetail && (
            <div className="space-y-6">
               <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Stat label="IP" value={entryDetail.ip} mono />
                  <Stat label="Status" value={statusLabel(entryDetail.effective_status)} />
                  <Stat label="Label" value={entryDetail.label} />
                  <Stat label="Owner" value={entryDetail.owner} />
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Stat label="Created" value={formatDate(entryDetail.created_at)} />
                  <Stat label="Expires" value={formatDate(entryDetail.expires_at)} />
               </div>
               <div className="p-4 bg-[var(--panel-strong)] border border-[var(--line)] rounded-xl">
                  <div className="text-xs font-bold text-[var(--muted)] uppercase mb-2">Internal Notes</div>
                  <div className="text-sm">{entryDetail.notes || "Tidak ada catatan."}</div>
               </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="border-[var(--line)] bg-[var(--panel)]">
          <DialogHeader>
            <DialogTitle>Edit Entry: {editFormState.ip}</DialogTitle>
            <DialogDescription>Perbarui informasi lisensi.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleUpdateEntry}>
            <Field label="Alamat IPv4">
              <Input value={editFormState.ip} disabled className="bg-[var(--panel-strong)] font-mono" />
            </Field>
            <Field label="Tanggal Expired">
              <Input type="datetime-local" value={editFormState.expires_at} onChange={(e) => setEditFormState(s => ({...s, expires_at: e.target.value}))} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Label">
                <Input value={editFormState.label} onChange={(e) => setEditFormState(s => ({...s, label: e.target.value}))} />
              </Field>
              <Field label="Owner">
                <Input value={editFormState.owner} onChange={(e) => setEditFormState(s => ({...s, owner: e.target.value}))} />
              </Field>
            </div>
            <Field label="Catatan">
              <Textarea value={editFormState.notes} onChange={(e) => setEditFormState(s => ({...s, notes: e.target.value}))} className="min-h-[100px]" />
            </Field>
            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--line)]">
              <Button type="button" variant="secondary" onClick={() => setEditDialogOpen(false)}>Batal</Button>
              <Button type="submit">Simpan Perubahan</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Entry Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="border-[var(--line)] bg-[var(--panel)]">
          <DialogHeader>
            <DialogTitle>Buat Entry Baru</DialogTitle>
            <DialogDescription>Tambahkan IP manual ke dalam sistem.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={async (e) => {
            await handleCreateEntry(e);
            setCreateDialogOpen(false);
          }}>
            <Field label="Alamat IPv4" hint="IP VPS tujuan.">
              <Input value={formState.ip} onChange={(e) => setFormState(s => ({...s, ip: e.target.value}))} placeholder="1.2.3.4" required className="font-mono" />
            </Field>
            <Field label="Tanggal Expired" hint="Kosongkan untuk durasi default.">
              <Input type="datetime-local" value={formState.expires_at} onChange={(e) => setFormState(s => ({...s, expires_at: e.target.value}))} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Label">
                <Input value={formState.label} onChange={(e) => setFormState(s => ({...s, label: e.target.value}))} placeholder="Server Name" />
              </Field>
              <Field label="Owner">
                <Input value={formState.owner} onChange={(e) => setFormState(s => ({...s, owner: e.target.value}))} placeholder="Client Name" />
              </Field>
            </div>
            <Field label="Catatan">
              <Textarea value={formState.notes} onChange={(e) => setFormState(s => ({...s, notes: e.target.value}))} placeholder="Keterangan tambahan..." className="min-h-[80px]" />
            </Field>
            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--line)]">
              <Button type="button" variant="secondary" onClick={() => setCreateDialogOpen(false)}>Batal</Button>
              <Button type="submit"><Plus className="size-4 mr-2"/> Simpan Entry</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Revoke Reason Dialog */}
      <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <DialogContent className="border-[var(--line)] bg-[var(--panel)]">
          <DialogHeader>
            <DialogTitle className="text-rose-500 flex items-center gap-2">
              <Lock className="size-5" />
              Revoke Lisensi
            </DialogTitle>
            <DialogDescription>
              IP: <b>{targetEntry?.ip}</b> akan diblokir. Berikan alasan pemblokiran untuk catatan internal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Field label="Alasan Revoke (Wajib)">
              <Textarea 
                value={revokeReason} 
                onChange={(e) => setRevokeReason(e.target.value)} 
                placeholder="Misal: Pelanggaran TOS, Pembayaran Gagal, atau Penyalahgunaan..."
                className="min-h-[100px]"
                required
              />
            </Field>
            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--line)]">
              <Button type="button" variant="secondary" onClick={() => setRevokeDialogOpen(false)}>Batal</Button>
              <Button 
                variant="destructive" 
                onClick={() => executeToggleEntry(targetEntry, "revoke", revokeReason)}
                disabled={!revokeReason.trim()}
              >
                Konfirmasi Blokir IP
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="max-w-md border-[var(--line)] bg-[var(--panel)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <AlertCircle className="size-5" />
              Hapus Lisensi Permanen?
            </DialogTitle>
            <DialogDescription>
              Tindakan ini akan menghapus data IP <b>{targetEntry?.ip}</b> dari database. Data yang sudah dihapus tidak bisa dipulihkan.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setConfirmDeleteOpen(false)}>Batal</Button>
            <Button variant="destructive" onClick={executeDeleteEntry}>Ya, Hapus Permanen</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Backup Preview Dialog */}
      <Dialog open={backupPreviewOpen} onOpenChange={setBackupPreviewOpen}>
        <DialogContent className="max-w-3xl border-[var(--line)] bg-[var(--panel)]">
          <DialogHeader>
            <DialogTitle>Snapshot Preview: {backupPreview?.key?.split('/').pop()}</DialogTitle>
            <DialogDescription>Konten terenkripsi atau data pratinjau mentah.</DialogDescription>
          </DialogHeader>
          {backupPreview ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <Stat label="Checksum (SHA-256)" value={shortChecksum(backupPreview.checksum_sha256)} mono />
                <Stat label="Rows" value={formatBackupRows(backupPreview.row_counts)} />
                <Stat label="Size" value={formatBytes(backupPreview.size)} />
                <Stat label="Created By" value={backupPreview.created_by} />
              </div>
              <div className="border border-[var(--line)] rounded-xl p-4 bg-[var(--panel-strong)]">
                <div className="text-xs font-bold text-[var(--muted)] uppercase mb-2">License Sample</div>
                <div className="space-y-2">
                  {(backupPreview.preview?.license_entries || []).map((item) => (
                    <div key={`${item.id}-${item.ip}`} className="bg-[var(--panel)] border border-[var(--line)] p-2 rounded-lg text-sm">
                      <span className="font-mono font-bold mr-2">{item.ip}</span>
                      <span className="text-[var(--muted)]">{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : <LoadingState message="Memuat..." />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SidebarButton({ icon: Icon, active, children, ...props }) {
  return (
    <button className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${active ? "bg-blue-600 text-white" : "text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel-strong)]"}`} {...props}>
      <Icon className="size-4" />
      <span>{children}</span>
    </button>
  );
}

function MobileNavButton({ icon: Icon, active, label, ...props }) {
  return (
    <button className={`flex-1 flex flex-col items-center justify-center py-2 px-1 gap-1 transition-colors ${active ? "text-blue-600" : "text-[var(--muted)] hover:text-[var(--fg)]"}`} {...props}>
      <div className={`p-1 rounded-full ${active ? "bg-blue-500/10" : ""}`}>
        <Icon className="size-5" />
      </div>
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );
}

function MetricCard({ title, value, tone, meta }) {
  return (
    <Card className="shadow-sm border-[var(--line)]">
      <CardContent className="p-5">
        <div className="text-xs font-bold uppercase text-[var(--muted)] mb-2">{title}</div>
        <div className="flex items-end justify-between">
          <div className="text-3xl font-extrabold text-[var(--fg)]">{value}</div>
          <Badge variant={tone}>{meta}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function OperationalHealthCard({ latestChecks, latestMutations, summary }) {
  return (
    <Card className="shadow-sm border-[var(--line)]">
      <CardHeader className="bg-[var(--panel-strong)] border-b border-[var(--line)]">
        <CardTitle className="text-base font-bold">Health Summary</CardTitle>
      </CardHeader>
      <CardContent className="p-5 grid grid-cols-2 gap-4">
        <StatBox label="Allow Checks" value={latestChecks.allow || 0} />
        <StatBox label="Deny Checks" value={latestChecks.deny || 0} />
        <StatBox label="Admin Edits" value={latestMutations.admin_mutations || 0} />
        <StatBox label="Public Acts" value={latestMutations.public_activations || 0} />
      </CardContent>
    </Card>
  );
}

function RecentRecoveryCard({ backups, onOpenSettings }) {
  const recent = backups.slice(0, 2);
  return (
    <Card className="shadow-sm border-[var(--line)]">
      <CardHeader className="bg-[var(--panel-strong)] border-b border-[var(--line)]">
        <CardTitle className="text-base font-bold">Recent Backups</CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-3">
        {recent.map(b => (
          <div key={b.key} className="flex justify-between items-center text-sm border border-[var(--line)] rounded-lg p-3">
            <div>
              <div className="font-bold text-[var(--fg)]">{formatDate(b.created_at)}</div>
              <div className="text-[var(--muted)] font-mono text-xs">{b.key.split('/').pop()}</div>
            </div>
            <Badge variant="slate">{formatBytes(b.size)}</Badge>
          </div>
        ))}
        <Button variant="outline" className="w-full mt-2" onClick={onOpenSettings}>Semua Backup</Button>
      </CardContent>
    </Card>
  );
}

function RecentActivityCard({ logs, onOpenAudit }) {
  const recent = logs.slice(0, 5);
  return (
    <Card className="shadow-sm border-[var(--line)]">
      <CardHeader className="bg-[var(--panel-strong)] border-b border-[var(--line)]">
        <CardTitle className="text-base font-bold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-[var(--line)]">
          {recent.length ? recent.map(log => (
            <div key={log.id} className="p-3 flex items-start gap-3 hover:bg-[var(--panel-strong)]/30 transition-colors">
               <div className={`mt-1 size-2 shrink-0 rounded-full ${statusTone(log.decision) === 'emerald' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-rose-500'}`} />
               <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[var(--accent)] truncate">{log.ip || "System"}</span>
                    <span className="text-[10px] text-[var(--muted)] whitespace-nowrap">{formatRelativeTime(log.created_at)}</span>
                  </div>
                  <div className="text-[10px] text-[var(--muted)] truncate uppercase tracking-tight font-medium">{log.event_type}</div>
               </div>
            </div>
          )) : <div className="p-8 text-center text-xs text-[var(--muted)]">No recent activity.</div>}
        </div>
        {logs.length > 5 && (
          <div className="p-2 border-t border-[var(--line)]">
            <Button variant="ghost" size="sm" className="w-full text-xs font-bold" onClick={onOpenAudit}>View All Logs</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrendCard({ title, caption, loading, points, series }) {
  return (
    <Card className="shadow-sm flex flex-col border-[var(--line)]">
      <CardHeader className="bg-[var(--panel-strong)] border-b border-[var(--line)] flex flex-row justify-between items-center">
        <CardTitle className="text-base font-bold">{title}</CardTitle>
        <span className="text-xs text-[var(--muted)] font-medium">{caption}</span>
      </CardHeader>
      <CardContent className="p-5 flex-1">
        {loading ? <LoadingState message="Memuat grafik..." /> : (
          <div className="space-y-4">
            {series.map(s => {
               const values = points.map(p => Number(p[s.key] || 0));
               const max = Math.max(...values, 1);
               return (
                 <div key={s.key}>
                   <div className="flex justify-between text-sm mb-1">
                     <span className="font-bold text-[var(--fg)] opacity-80">{s.label}</span>
                     <span className="text-[var(--muted)]">{values.reduce((a,b)=>a+b,0)} total</span>
                   </div>
                   <div className="flex items-end h-8 gap-1">
                     {values.slice(-14).map((v, i) => (
                       <div key={i} className={`flex-1 rounded-t-sm ${s.tone === 'emerald' ? 'bg-emerald-400' : s.tone==='rose' ? 'bg-rose-400' : 'bg-[var(--line-strong)]'}`} style={{ height: `${(v/max)*100}%`, minHeight: '4px' }} title={String(v)} />
                     ))}
                   </div>
                 </div>
               )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="border border-[var(--line)] rounded-xl p-3 bg-[var(--panel-strong)]">
      <div className="text-xs font-bold text-[var(--muted)] uppercase">{label}</div>
      <div className="mt-1 text-xl font-extrabold text-[var(--fg)] truncate">{value}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-bold text-[var(--fg)] opacity-80">{label}</label>
      {children}
      {hint && <p className="text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

function LoadingState({ message }) {
  return (
    <div className="p-8 text-center text-[var(--muted)] text-sm border border-dashed border-[var(--line-strong)] rounded-xl bg-[var(--panel-strong)]">
      {message}
    </div>
  );
}

function humanizeBackupSource(v) { return v === 'scheduled' ? 'Auto Backup' : 'Manual'; }
function emptyEntryForm() { return { id: "", ip: "", label: "", owner: "", notes: "", expires_at: "" }; }
function getFilteredBackups(b, q, sf, sort) { 
  const sq = (q||"").toLowerCase();
  let f = b.filter(x => (sf === 'all' || x.source === sf) && (!sq || x.key.toLowerCase().includes(sq) || x.created_by.toLowerCase().includes(sq)));
  return f.sort((a,c) => sort === 'created_asc' ? new Date(a.created_at) - new Date(c.created_at) : new Date(c.created_at) - new Date(a.created_at));
}

function Stat({ label, value, mono = false }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-semibold truncate ${mono ? "font-mono text-[var(--accent)]" : "text-[var(--fg)]"}`}>{value || "-"}</div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<AdminApp />);
