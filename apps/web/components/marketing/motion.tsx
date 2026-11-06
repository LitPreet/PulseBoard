"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Call `onShow` once when the element scrolls into view. */
function useInView<T extends Element>(onShow: () => void, threshold = 0.15) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      onShow();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onShow();
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

/**
 * Fades and lifts its children in when scrolled into view. Descendants with
 * `.mk-grow` / `.mk-grow-y` animate their bars once the section is shown.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
  style,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: ElementType;
  style?: CSSProperties;
}) {
  const [shown, setShown] = useState(false);
  const ref = useInView<HTMLElement>(() => setShown(true));
  return (
    <Tag
      ref={ref}
      data-reveal=""
      data-shown={shown ? "" : undefined}
      className={className}
      style={{ ...style, transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/** Counts from 0 to `to` once visible. */
export function CountUp({
  to,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1400,
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const [value, setValue] = useState(to);
  const started = useRef(false);
  const ref = useInView<HTMLSpanElement>(() => {
    if (started.current || prefersReducedMotion()) return;
    started.current = true;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(to * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    setValue(0);
    requestAnimationFrame(tick);
  }, 0.4);
  return (
    <span ref={ref} className="tabular">
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** Tracks the pointer over children marked `.mk-spot` so a radial highlight follows the cursor. */
export function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={className}
      onPointerMove={(e) => {
        const card = (e.target as HTMLElement).closest<HTMLElement>(".mk-spot");
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </div>
  );
}
