export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <rect width="24" height="24" rx="6" fill="var(--accent)" />
        <path
          d="M4 13h3.5l2-5 3 9 2.5-6 1.5 2H20"
          fill="none"
          stroke="var(--accent-fg)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      PulseBoard
    </span>
  );
}
