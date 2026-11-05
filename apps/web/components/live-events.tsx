"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { eventLabel, fmtRelative } from "@/lib/format";
import { Badge, Button, Input, cx } from "./ui";

export interface LiveEvent {
  id: string;
  event: string;
  distinctId: string;
  personId: string;
  sessionId: string | null;
  timestamp: string;
  properties: Record<string, unknown>;
}

const MAX_ROWS = 300;

export function LiveEvents({ projectId, initial }: { projectId: string; initial: LiveEvent[] }) {
  const [events, setEvents] = useState(initial);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [, tick] = useState(0);
  const buffer = useRef<LiveEvent[]>([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const es = new EventSource(`/api/projects/${projectId}/live`);
    es.addEventListener("ready", () => setStatus("live"));
    es.addEventListener("events", (msg) => {
      const incoming = (JSON.parse((msg as MessageEvent).data) as LiveEvent[]).reverse();
      if (pausedRef.current) {
        buffer.current = [...incoming, ...buffer.current].slice(0, MAX_ROWS);
        return;
      }
      setFresh(new Set(incoming.map((e) => e.id)));
      setEvents((prev) => dedupe([...incoming, ...prev]).slice(0, MAX_ROWS));
    });
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? "offline" : "connecting");
    const t = setInterval(() => tick((n) => n + 1), 10_000);
    return () => {
      es.close();
      clearInterval(t);
    };
  }, [projectId]);

  const resume = () => {
    setEvents((prev) => dedupe([...buffer.current, ...prev]).slice(0, MAX_ROWS));
    buffer.current = [];
    setPaused(false);
  };

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return events;
    return events.filter(
      (e) => e.event.toLowerCase().includes(f) || e.distinctId.toLowerCase().includes(f) || String(e.properties.$pathname ?? "").toLowerCase().includes(f),
    );
  }, [events, filter]);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm">
          <span
            className={cx(
              "inline-block h-2 w-2 rounded-full",
              status === "live" ? (paused ? "bg-muted" : "animate-pulse bg-success") : status === "connecting" ? "bg-muted" : "bg-danger",
            )}
            aria-hidden
          />
          {status === "live" ? (paused ? "Paused" : "Live") : status === "connecting" ? "Connecting…" : "Disconnected"}
        </span>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by event, user or path"
          className="h-8 max-w-xs"
          aria-label="Filter events"
        />
        <Button variant="secondary" size="sm" className="ml-auto" onClick={() => (paused ? resume() : setPaused(true))}>
          {paused ? <Play size={12} /> : <Pause size={12} />}
          {paused ? `Resume${buffer.current.length ? ` (${buffer.current.length} new)` : ""}` : "Pause"}
        </Button>
      </div>
      {visible.length === 0 ? (
        <p className="px-4 py-14 text-center text-sm text-muted">Waiting for events… they&apos;ll appear here within a second of being sent.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Event</th>
                <th className="px-4 py-2 font-medium">Person</th>
                <th className="px-4 py-2 font-medium">Page</th>
                <th className="px-4 py-2 font-medium">Browser</th>
                <th className="px-4 py-2 text-right font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <EventRow
                  key={e.id}
                  e={e}
                  projectId={projectId}
                  isOpen={open === e.id}
                  isFresh={fresh.has(e.id)}
                  onToggle={() => setOpen(open === e.id ? null : e.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EventRow({
  e,
  projectId,
  isOpen,
  isFresh,
  onToggle,
}: {
  e: LiveEvent;
  projectId: string;
  isOpen: boolean;
  isFresh: boolean;
  onToggle: () => void;
}) {
  const custom = !e.event.startsWith("$");
  return (
    <>
      <tr className={cx("cursor-pointer border-t border-border hover:bg-surface-2", isFresh && "flash-in")} onClick={onToggle}>
        <td className="px-4 py-2">
          <Badge tone={custom ? "accent" : "neutral"}>{eventLabel(e.event)}</Badge>
        </td>
        <td className="max-w-[14rem] truncate px-4 py-2 font-mono text-xs">{e.distinctId}</td>
        <td className="max-w-[16rem] truncate px-4 py-2 text-muted">{String(e.properties.$pathname ?? "—")}</td>
        <td className="px-4 py-2 text-muted">{String(e.properties.$browser ?? "—")}</td>
        <td className="tabular px-4 py-2 text-right whitespace-nowrap text-muted" title={new Date(e.timestamp).toLocaleString()}>
          {fmtRelative(e.timestamp)}
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-surface-2/60">
          <td colSpan={5} className="px-4 py-3">
            <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted">
              <span>{new Date(e.timestamp).toLocaleString()}</span>
              {e.sessionId && (
                <Link className="text-accent hover:underline" href={`/p/${projectId}/sessions/${encodeURIComponent(e.sessionId)}`}>
                  View session →
                </Link>
              )}
            </div>
            <pre className="max-h-72 overflow-auto rounded bg-surface p-3 font-mono text-xs">{JSON.stringify(e.properties, null, 2)}</pre>
          </td>
        </tr>
      )}
    </>
  );
}

function dedupe(list: LiveEvent[]) {
  const seen = new Set<string>();
  return list.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}
