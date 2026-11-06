import { Activity, BarChart3, Filter, Gauge, LayoutDashboard, MonitorPlay, Repeat } from "lucide-react";
import { LiveTicker } from "./live-ticker";

// Deterministic sample series for the illustration.
const USERS = [42, 48, 45, 55, 61, 58, 66, 72, 69, 78, 85, 81, 90, 97, 93, 104, 112, 108, 118, 126];
const VIEWS = USERS.map((u, i) => Math.round(u * 2.6 + (i % 3) * 9));

function path(data: number[], w: number, h: number, max: number) {
  const step = w / (data.length - 1);
  return data.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(" ");
}

const FUNNEL = [
  { label: "Signed up", pct: 100 },
  { label: "Created note", pct: 72 },
  { label: "Shared note", pct: 31 },
  { label: "Upgraded", pct: 8 },
];

/** A static, illustrative mock of the dashboard for the hero section. */
export function ProductPreview() {
  const w = 520;
  const h = 150;
  const max = Math.max(...VIEWS) * 1.1;
  const users = path(USERS, w, h, max);
  const views = path(VIEWS, w, h, max);

  return (
    <div className="mk-frame overflow-hidden rounded-xl bg-surface text-left" aria-hidden>
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="mx-auto rounded-md bg-surface px-3 py-0.5 font-mono text-[11px] text-muted">pulseboard.yourapp.com</span>
      </div>
      <div className="flex">
        {/* sidebar */}
        <div className="hidden w-40 shrink-0 space-y-0.5 border-r border-border p-3 md:block">
          {[
            [Gauge, "Overview", true],
            [Activity, "Live events"],
            [BarChart3, "Trends"],
            [Filter, "Funnels"],
            [Repeat, "Retention"],
            [MonitorPlay, "Sessions"],
            [LayoutDashboard, "Dashboards"],
          ].map(([Icon, label, active]) => {
            const I = Icon as typeof Gauge;
            return (
              <div
                key={label as string}
                className={
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs " +
                  (active ? "bg-accent-soft font-medium text-accent" : "text-muted")
                }
              >
                <I size={13} /> {label as string}
              </div>
            );
          })}
        </div>

        {/* main */}
        <div className="min-w-0 flex-1 space-y-3 p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Unique users", "2,206", "+18%"],
              ["Pageviews", "7,966", "+11%"],
              ["Sessions", "3,108", "+9%"],
              ["Avg. session", "3m 17s", "+4%"],
            ].map(([label, value, delta], i) => (
              <div key={label} className="mk-rise rounded-lg border border-border p-2.5" style={{ animationDelay: `${700 + i * 90}ms` }}>
                <p className="text-[10px] font-medium tracking-wide text-muted uppercase">{label}</p>
                <p className="tabular mt-0.5 text-base font-semibold">
                  {value} <span className="text-[10px] font-medium text-success">{delta}</span>
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="min-w-0 rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center gap-3 text-[11px] text-muted">
                <span className="font-medium text-text">Visitors</span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--chart-1)" }} /> Unique users
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} /> Pageviews
                </span>
              </div>
              <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="pv-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75].map((y) => (
                  <line key={y} x1="0" x2={w} y1={h * y} y2={h * y} stroke="var(--grid)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                ))}
                <path d={`${views} L${w},${h} L0,${h} Z`} fill="url(#pv-fill)" className="mk-fade-late" />
                <path d={views} pathLength={1} className="mk-draw" fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                <path d={users} pathLength={1} className="mk-draw" style={{ animationDelay: "1.2s" }} fill="none" stroke="var(--chart-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>

            <div className="min-w-0 overflow-hidden rounded-lg border border-border">
              <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-[11px] font-medium">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> Live events
              </div>
              <LiveTicker rows={4} />
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-[11px] font-medium">
              Activation funnel <span className="font-normal text-muted">· 14-day window</span>
            </p>
            <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {FUNNEL.map((f, i) => (
                <div key={f.label} className="flex items-center gap-2 text-[11px]">
                  <span className="w-20 shrink-0 truncate text-muted">{f.label}</span>
                  <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="mk-bar-in absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${f.pct}%`, background: "var(--chart-1)", animationDelay: `${1400 + i * 120}ms` }}
                    />
                  </span>
                  <span className="tabular w-8 text-right">{f.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
