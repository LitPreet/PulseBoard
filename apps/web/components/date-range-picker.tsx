"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Calendar } from "lucide-react";
import type { DateRangeInput } from "@pulseboard/core/analytics";
import { Button, Input, Select, cx } from "./ui";

const PRESETS: { value: string; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "180d", label: "Last 180 days" },
  { value: "custom", label: "Custom range…" },
];

/** URL-driven date filter, so filtered views are shareable and survive reloads. */
export function DateRangePicker({ value, unsetLabel }: { value?: DateRangeInput; unsetLabel?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const isCustom = value !== undefined && typeof value !== "string";
  const [mode, setMode] = useState<string>(isCustom ? "custom" : (value ?? ""));
  const [from, setFrom] = useState(isCustom ? value.from.slice(0, 10) : "");
  const [to, setTo] = useState(isCustom ? value.to.slice(0, 10) : "");

  const push = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  };

  return (
    <div className={cx("flex flex-wrap items-center gap-2", pending && "opacity-60")}>
      <Calendar size={16} className="text-muted" aria-hidden />
      <Select
        aria-label="Date range"
        value={mode}
        inline
        className="h-8 text-sm"
        onChange={(e) => {
          setMode(e.target.value);
          if (e.target.value !== "custom") push({ range: e.target.value || null, from: null, to: null });
        }}
      >
        {unsetLabel && <option value="">{unsetLabel}</option>}
        {PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Select>
      {mode === "custom" && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) push({ from, to, range: null });
          }}
        >
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} inline className="h-8" aria-label="From" required />
          <span className="text-muted">→</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} inline className="h-8" aria-label="To" required />
          <Button size="sm" type="submit">
            Apply
          </Button>
        </form>
      )}
    </div>
  );
}
