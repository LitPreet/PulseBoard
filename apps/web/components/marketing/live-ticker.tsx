"use client";

import { useEffect, useState } from "react";

const SAMPLE = [
  { event: "$pageview", who: "anon-7f3a", detail: "/pricing" },
  { event: "signed_up", who: "maya@acme.io", detail: "via google" },
  { event: "created_note", who: "maya@acme.io", detail: "template: meeting" },
  { event: "$pageview", who: "anon-91c2", detail: "/blog/funnels-101" },
  { event: "shared_note", who: "lee@studio.dev", detail: "channel: slack" },
  { event: "upgraded_plan", who: "sam@north.co", detail: "plan: pro" },
  { event: "$pageview", who: "anon-2be8", detail: "/" },
  { event: "invited_teammate", who: "lee@studio.dev", detail: "role: member" },
];

type Row = (typeof SAMPLE)[number] & { key: number; age: number };

/** Illustrative event feed for the landing page — sample data, not a real stream. */
export function LiveTicker({ rows = 5 }: { rows?: number }) {
  const [items, setItems] = useState<Row[]>(() =>
    SAMPLE.slice(0, rows).map((s, i) => ({ ...s, key: i, age: (i + 1) * 4 })),
  );

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let n = rows;
    const t = setInterval(() => {
      setItems((prev) => {
        const next = SAMPLE[n % SAMPLE.length]!;
        const aged = prev.map((p) => ({ ...p, age: p.age + 2 }));
        return [{ ...next, key: n++, age: 0 }, ...aged].slice(0, rows);
      });
    }, 2000);
    return () => clearInterval(t);
  }, [rows]);

  return (
    <ul className="divide-y divide-border text-xs">
      {items.map((r) => {
        const custom = !r.event.startsWith("$");
        return (
          <li key={r.key} className="mk-slide-in flex items-center gap-2 px-3 py-2">
            <span
              className={
                "shrink-0 rounded px-1.5 py-0.5 font-medium " + (custom ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted")
              }
            >
              {r.event === "$pageview" ? "Pageview" : r.event}
            </span>
            <span className="min-w-0 truncate font-mono text-[11px]">{r.who}</span>
            <span className="hidden min-w-0 truncate text-muted sm:inline">{r.detail}</span>
            <span className="tabular ml-auto shrink-0 text-muted">{r.age === 0 ? "now" : `${r.age}s`}</span>
          </li>
        );
      })}
    </ul>
  );
}
