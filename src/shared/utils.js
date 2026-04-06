import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(value, locale = "id-ID") {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

export function formatShortDay(value, locale = "en-GB") {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(parsed);
}

export function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function shortChecksum(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  if (raw.length <= 18) return raw;
  return `${raw.slice(0, 8)}...${raw.slice(-8)}`;
}

export function formatBackupRows(rowCounts) {
  return `${Number(rowCounts?.license_entries || 0)} entries`;
}

export function statusLabel(value) {
  const raw = String(value || "").toLowerCase();
  if (raw === "active") return "Active";
  if (raw === "expired") return "Expired";
  if (raw === "revoked") return "Revoked";
  return raw || "-";
}

export function statusTone(value) {
  const raw = String(value || "").toLowerCase();
  if (raw === "active" || raw === "allow" || raw === "mutate") return "emerald";
  if (raw === "expired" || raw === "warn" || raw === "rate_limited") return "amber";
  if (raw === "revoked" || raw === "deny" || raw === "error") return "rose";
  return "slate";
}

export function formatDaysRemaining(value) {
  const total = Number(value);
  if (!Number.isFinite(total)) return "-";
  if (total <= 0) return "0 days";
  if (total === 1) return "1 day";
  return `${total} days`;
}

export async function computeSha256Hex(input) {
  const bytes = new TextEncoder().encode(String(input || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function buildSparklinePath(values) {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  const step = safeValues.length > 1 ? 100 / (safeValues.length - 1) : 100;
  return safeValues
    .map((value, index) => {
      const x = safeValues.length === 1 ? 50 : index * step;
      const y = 24 - (Number(value || 0) / max) * 20;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function formatForDateTimeLocal(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const tzOffset = parsed.getTimezoneOffset();
  const local = new Date(parsed.getTime() - tzOffset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}
