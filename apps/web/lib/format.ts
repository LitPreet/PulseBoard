const nf = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export const fmtNumber = (n: number) => nf.format(Math.round(n));
export const fmtCompact = (n: number) => (Math.abs(n) < 10_000 ? nf.format(Math.round(n)) : compact.format(n));
export const fmtPercent = (r: number, digits = 1) => `${(r * 100).toFixed(digits)}%`;

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

export function fmtRelative(date: Date | string, now = Date.now()): string {
  const t = typeof date === "string" ? Date.parse(date) : date.getTime();
  const diff = Math.round((now - t) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function fmtBucket(iso: string, interval: "hour" | "day" | "week" | "month"): string {
  const d = new Date(iso);
  if (interval === "hour") return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", timeZone: "UTC" });
  if (interval === "month") return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  return d.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(date: Date | string) {
  return new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Human label for internal event names. */
export function eventLabel(name: string) {
  const map: Record<string, string> = {
    $pageview: "Pageview",
    $pageleave: "Page leave",
    $identify: "Identify",
    $set: "Set properties",
  };
  return map[name] ?? name;
}
