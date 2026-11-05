"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import type {
  DateRangeInput,
  FunnelQuery,
  InsightQuery,
  InsightResult,
  PropertyFilter,
  RetentionQuery,
  TrendQuery,
} from "@pulseboard/core/analytics";
import { saveInsight } from "@/lib/actions/insights";
import { eventLabel } from "@/lib/format";
import { InsightView } from "./charts/insight-view";
import { seriesColor } from "./charts/trend-chart";
import { Button, Card, Input, Select, cx } from "./ui";

const COMMON_PROPERTIES = [
  "$pathname",
  "$current_url",
  "$host",
  "$referring_domain",
  "$browser",
  "$os",
  "$device_type",
  "$country",
  "utm_source",
  "utm_campaign",
  "plan",
];

const RANGES: { value: string; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "180d", label: "Last 180 days" },
];

const OPS: { value: PropertyFilter["op"]; label: string; needsValue: boolean }[] = [
  { value: "eq", label: "equals", needsValue: true },
  { value: "neq", label: "doesn't equal", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "not_contains", label: "doesn't contain", needsValue: true },
  { value: "gt", label: "greater than", needsValue: true },
  { value: "lt", label: "less than", needsValue: true },
  { value: "is_set", label: "is set", needsValue: false },
  { value: "is_not_set", label: "is not set", needsValue: false },
];

export type BuilderType = InsightQuery["type"];

export function defaultQuery(type: BuilderType, events: string[]): InsightQuery {
  const has = (e: string) => events.includes(e);
  const firstCustom = events.find((e) => !e.startsWith("$"));
  switch (type) {
    case "trend":
      return { type, series: [{ event: has("$pageview") ? "$pageview" : (events[0] ?? "$pageview"), math: "total", filters: [] }], interval: "day", dateRange: "30d", chart: "line" };
    case "funnel": {
      const custom = events.filter((e) => !e.startsWith("$"));
      const steps = (custom.length >= 2 ? custom.slice(0, 3) : ["$pageview", firstCustom ?? "signed_up"]).map((event) => ({ event, filters: [] }));
      return { type, steps, windowDays: 14, dateRange: "30d" };
    }
    case "retention":
      return { type, startEvent: firstCustom ?? "$pageview", returnEvent: "$pageview", period: "week", periods: 8, dateRange: "90d" };
  }
}

interface Props {
  projectId: string;
  type: BuilderType;
  eventNames: string[];
  dashboards: { id: string; name: string }[];
  canEdit: boolean;
  initial?: { id: string; name: string; config: InsightQuery; dashboardId: string | null };
}

export function InsightBuilder({ projectId, type, eventNames, dashboards, canEdit, initial }: Props) {
  const [query, setQuery] = useState<InsightQuery>(() => initial?.config ?? defaultQuery(type, eventNames));
  const [result, setResult] = useState<InsightResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ms, setMs] = useState<number | null>(null);

  const key = useMemo(() => JSON.stringify(query), [query]);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: `{"query":${key}}`,
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setResult(data.result);
        setMs(data.ms);
        setError(null);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError((err as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, projectId]);

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <datalist id="pb-events">
        {eventNames.map((e) => (
          <option key={e} value={e} />
        ))}
      </datalist>
      <datalist id="pb-props">
        {COMMON_PROPERTIES.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="space-y-4">
        <Card className="space-y-4 p-4">
          {query.type === "trend" && <TrendControls q={query} set={setQuery} />}
          {query.type === "funnel" && <FunnelControls q={query} set={setQuery} />}
          {query.type === "retention" && <RetentionControls q={query} set={setQuery} />}
          <Row label="Date range">
            <Select
              value={typeof query.dateRange === "string" ? query.dateRange : "30d"}
              onChange={(e) => setQuery({ ...query, dateRange: e.target.value as DateRangeInput })}
            >
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Row>
        </Card>
        {canEdit ? (
          <SavePanel projectId={projectId} query={query} dashboards={dashboards} initial={initial} />
        ) : (
          <p className="text-xs text-muted">Viewers can explore but not save insights.</p>
        )}
      </div>

      <Card className="min-w-0 p-5">
        <div className="mb-3 flex items-center justify-between text-xs text-muted">
          <span>{loading ? "Running query…" : ms !== null ? `Computed in ${ms} ms` : " "}</span>
        </div>
        <div className={cx("transition-opacity", loading && result && "opacity-50")}>
          {error ? (
            <p className="py-16 text-center text-sm text-danger">{error}</p>
          ) : result ? (
            <InsightView result={result} chart={query.type === "trend" ? query.chart : undefined} />
          ) : (
            <div className="h-72 animate-pulse rounded bg-surface-2" />
          )}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
      {children}
    </div>
  );
}

function EventInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Input
      list="pb-events"
      value={draft}
      aria-label={label}
      placeholder="Event name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() && draft !== value && onChange(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function FilterEditor({ filters, onChange }: { filters: PropertyFilter[]; onChange: (f: PropertyFilter[]) => void }) {
  return (
    <div className="space-y-2">
      {filters.map((f, i) => {
        const op = OPS.find((o) => o.value === f.op)!;
        const update = (patch: Partial<PropertyFilter>) => onChange(filters.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        return (
          <div key={i} className="grid grid-cols-[1fr_auto] gap-1.5 rounded-md border border-border p-2">
            <Input list="pb-props" defaultValue={f.key} placeholder="property" className="h-8 text-xs" aria-label="Property" onBlur={(e) => update({ key: e.target.value.trim() || f.key })} />
            <button type="button" onClick={() => onChange(filters.filter((_, j) => j !== i))} className="text-muted hover:text-text" aria-label="Remove filter">
              <X size={14} />
            </button>
            <Select value={f.op} className="h-8 text-xs" aria-label="Operator" onChange={(e) => update({ op: e.target.value as PropertyFilter["op"] })}>
              {OPS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <span />
            {op.needsValue && (
              <Input defaultValue={String(f.value ?? "")} placeholder="value" className="h-8 text-xs" aria-label="Value" onBlur={(e) => update({ value: e.target.value })} />
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
        onClick={() => onChange([...filters, { key: "$pathname", op: "eq", value: "/" }])}
      >
        <Plus size={12} /> Add filter
      </button>
    </div>
  );
}

function TrendControls({ q, set }: { q: TrendQuery; set: (q: TrendQuery) => void }) {
  const updateSeries = (i: number, patch: Partial<TrendQuery["series"][number]>) =>
    set({ ...q, series: q.series.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <>
      <Row label="Series">
        <div className="space-y-3">
          {q.series.map((s, i) => (
            <div key={i} className="space-y-2 rounded-md bg-surface-2/60 p-2.5">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: seriesColor(i) }} />
                <EventInput value={s.event} onChange={(event) => updateSeries(i, { event })} label={`Series ${i + 1} event`} />
                {q.series.length > 1 && (
                  <button type="button" onClick={() => set({ ...q, series: q.series.filter((_, j) => j !== i) })} className="text-muted hover:text-text" aria-label="Remove series">
                    <X size={14} />
                  </button>
                )}
              </div>
              <Select value={s.math} className="h-8 text-xs" onChange={(e) => updateSeries(i, { math: e.target.value as "total" | "unique" })} aria-label="Aggregation">
                <option value="total">Total count</option>
                <option value="unique">Unique users</option>
              </Select>
              <FilterEditor filters={s.filters} onChange={(filters) => updateSeries(i, { filters })} />
            </div>
          ))}
          {q.series.length < 6 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => set({ ...q, series: [...q.series, { event: q.series[0]?.event ?? "$pageview", math: "unique", filters: [] }] })}
            >
              <Plus size={12} /> Add series
            </Button>
          )}
        </div>
      </Row>
      <div className="grid grid-cols-2 gap-3">
        <Row label="Interval">
          <Select value={q.interval} onChange={(e) => set({ ...q, interval: e.target.value as TrendQuery["interval"] })}>
            <option value="hour">Hour</option>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </Select>
        </Row>
        <Row label="Chart">
          <Select value={q.chart} onChange={(e) => set({ ...q, chart: e.target.value as "line" | "bar" })}>
            <option value="line">Line</option>
            <option value="bar">Stacked bar</option>
          </Select>
        </Row>
      </div>
      <Row label="Breakdown by property">
        <div className="flex gap-2">
          <Input
            list="pb-props"
            key={q.breakdown ?? "none"}
            defaultValue={q.breakdown ?? ""}
            placeholder="e.g. $browser"
            onBlur={(e) => set({ ...q, breakdown: e.target.value.trim() || undefined })}
          />
          {q.breakdown && (
            <Button variant="ghost" size="sm" onClick={() => set({ ...q, breakdown: undefined })}>
              Clear
            </Button>
          )}
        </div>
      </Row>
    </>
  );
}

function FunnelControls({ q, set }: { q: FunnelQuery; set: (q: FunnelQuery) => void }) {
  const updateStep = (i: number, patch: Partial<FunnelQuery["steps"][number]>) =>
    set({ ...q, steps: q.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, d: -1 | 1) => {
    const steps = [...q.steps];
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j]!, steps[i]!];
    set({ ...q, steps });
  };
  return (
    <>
      <Row label="Steps (in order)">
        <ol className="space-y-3">
          {q.steps.map((s, i) => (
            <li key={i} className="space-y-2 rounded-md bg-surface-2/60 p-2.5">
              <div className="flex items-center gap-2">
                <span className="tabular w-4 shrink-0 text-xs text-muted">{i + 1}</span>
                <EventInput value={s.event} onChange={(event) => updateStep(i, { event })} label={`Step ${i + 1} event`} />
                <div className="flex shrink-0 flex-col text-muted">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-[10px] leading-none hover:text-text disabled:opacity-30" aria-label="Move up">
                    ▲
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === q.steps.length - 1} className="text-[10px] leading-none hover:text-text disabled:opacity-30" aria-label="Move down">
                    ▼
                  </button>
                </div>
                {q.steps.length > 2 && (
                  <button type="button" onClick={() => set({ ...q, steps: q.steps.filter((_, j) => j !== i) })} className="text-muted hover:text-text" aria-label="Remove step">
                    <X size={14} />
                  </button>
                )}
              </div>
              <FilterEditor filters={s.filters} onChange={(filters) => updateStep(i, { filters })} />
            </li>
          ))}
        </ol>
        {q.steps.length < 10 && (
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => set({ ...q, steps: [...q.steps, { event: "$pageview", filters: [] }] })}>
            <Plus size={12} /> Add step
          </Button>
        )}
      </Row>
      <Row label="Conversion window">
        <Select value={q.windowDays} onChange={(e) => set({ ...q, windowDays: Number(e.target.value) })}>
          {[1, 3, 7, 14, 30, 60, 90].map((d) => (
            <option key={d} value={d}>
              {d} day{d > 1 ? "s" : ""}
            </option>
          ))}
        </Select>
      </Row>
    </>
  );
}

function RetentionControls({ q, set }: { q: RetentionQuery; set: (q: RetentionQuery) => void }) {
  return (
    <>
      <Row label="Cohort: people who first did">
        <EventInput value={q.startEvent} onChange={(startEvent) => set({ ...q, startEvent })} label="Start event" />
      </Row>
      <Row label="…and came back to do">
        <EventInput value={q.returnEvent} onChange={(returnEvent) => set({ ...q, returnEvent })} label="Return event" />
      </Row>
      <div className="grid grid-cols-2 gap-3">
        <Row label="Period">
          <Select value={q.period} onChange={(e) => set({ ...q, period: e.target.value as "day" | "week" })}>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
          </Select>
        </Row>
        <Row label="Periods">
          <Select value={q.periods} onChange={(e) => set({ ...q, periods: Number(e.target.value) })}>
            {[4, 6, 8, 10, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Row>
      </div>
    </>
  );
}

function autoName(q: InsightQuery): string {
  switch (q.type) {
    case "trend":
      return q.series.map((s) => eventLabel(s.event)).join(" vs ") + (q.breakdown ? ` by ${q.breakdown}` : "");
    case "funnel":
      return q.steps.map((s) => eventLabel(s.event)).join(" → ");
    case "retention":
      return `Retention: ${eventLabel(q.startEvent)} → ${eventLabel(q.returnEvent)}`;
  }
}

function SavePanel({
  projectId,
  query,
  dashboards,
  initial,
}: {
  projectId: string;
  query: InsightQuery;
  dashboards: { id: string; name: string }[];
  initial?: Props["initial"];
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [target, setTarget] = useState<string>(initial?.dashboardId ?? dashboards[0]?.id ?? "new");
  const [newName, setNewName] = useState("My dashboard");
  const [state, setState] = useState<{ error?: string; savedTo?: string; insightId?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Card className="space-y-3 p-4">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">{initial ? "Update saved insight" : "Save to dashboard"}</p>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName(query)} aria-label="Insight name" />
      <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Dashboard">
        {dashboards.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
        <option value="new">+ New dashboard…</option>
      </Select>
      {target === "new" && <Input value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="New dashboard name" />}
      <Button
        className="w-full"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          const res = await saveInsight({
            projectId,
            insightId: state?.insightId ?? initial?.id,
            name: name.trim() || autoName(query),
            config: query,
            dashboardId: target === "new" ? undefined : target,
            newDashboardName: target === "new" ? newName : undefined,
          });
          setSaving(false);
          setState(res.error ? { error: res.error } : { savedTo: res.dashboardId, insightId: res.insightId });
          if (res.dashboardId && target === "new") setTarget(res.dashboardId);
        }}
      >
        {saving ? "Saving…" : initial || state?.insightId ? "Save changes" : "Save insight"}
      </Button>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.savedTo && (
        <p className="text-sm text-success">
          Saved.{" "}
          <Link href={`/p/${projectId}/dashboards/${state.savedTo}`} className="underline">
            Open dashboard →
          </Link>
        </p>
      )}
    </Card>
  );
}
