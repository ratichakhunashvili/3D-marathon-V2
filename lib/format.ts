import { dict, type Lang } from "./i18n";

export function formatBytes(bytes: number | string | null | undefined): string {
  const n = Number(bytes ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0 MB";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function relativeTime(value: string | Date | null | undefined, lang: Lang): string {
  if (!value) return dict(lang).teams.never;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  const d = dict(lang).common;
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));

  if (seconds < 60) return d.justNow;
  if (seconds < 3600) return d.minutesAgo(Math.floor(seconds / 60));
  if (seconds < 86400) return d.hoursAgo(Math.floor(seconds / 3600));
  if (seconds < 86400 * 30) return d.daysAgo(Math.floor(seconds / 86400));
  return absoluteDate(value, lang);
}

export function absoluteDate(value: string | Date | null | undefined, lang: Lang): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString(lang === "ka" ? "ka-GE" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function absoluteDateTime(value: string | Date | null | undefined, lang: Lang): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(lang === "ka" ? "ka-GE" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** For <input type="datetime-local"> which needs `YYYY-MM-DDTHH:mm` in *local* time. */
export function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const MB = 1024 * 1024;
