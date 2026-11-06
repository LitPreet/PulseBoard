import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Code2,
  Database,
  Filter,
  KeyRound,
  LayoutDashboard,
  MonitorPlay,
  Repeat,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { buttonClass, cx } from "@/components/ui";
import { ProductPreview } from "@/components/marketing/product-preview";
import { LiveTicker } from "@/components/marketing/live-ticker";

export const metadata = {
  title: { absolute: "PulseBoard — Product analytics for small SaaS teams" },
  description:
    "Track events with a 3 kB SDK, watch them arrive live, and answer product questions with trends, funnels, retention and sessions. Self-hosted on Postgres + Redis.",
};

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#developers", label: "Developers" },
];

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <div className="relative overflow-x-clip">
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="PulseBoard home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="transition hover:text-text">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <Link href="/app" className={buttonClass("primary")}>
                Open dashboard <ArrowRight size={14} />
              </Link>
            ) : (
              <>
                <Link href="/login" className={buttonClass("ghost")}>
                  Log in
                </Link>
                <Link href="/signup" className={buttonClass("primary")}>
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* ─── Hero ─── */}
        <section className="relative">
          <div className="mk-grid pointer-events-none absolute inset-x-0 top-0 h-[720px]" aria-hidden />
          <div className="mk-glow pointer-events-none absolute inset-x-0 -top-24 h-[620px]" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-24">
            <a
              href="#developers"
              className="mk-rise inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1 text-xs text-muted shadow-sm backdrop-blur transition hover:text-text"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Self-hosted · Postgres + Redis · 2.9 kB SDK
              <ArrowRight size={12} />
            </a>
            <h1
              className="mk-rise mx-auto mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl"
              style={{ animationDelay: "80ms" }}
            >
              Understand how people <span className="mk-gradient-text">actually use</span> your product
            </h1>
            <p
              className="mk-rise mx-auto mt-5 max-w-2xl text-base text-pretty text-muted sm:text-lg"
              style={{ animationDelay: "160ms" }}
            >
              PulseBoard is lightweight product analytics for small SaaS teams. Drop in one script, watch events arrive
              live, and turn them into trends, funnels, retention and sessions — without a data team.
            </p>
            <div className="mk-rise mt-8 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "240ms" }}>
              <Link href={user ? "/app" : "/signup"} className={cx(buttonClass("primary"), "h-11 px-5 text-base")}>
                {user ? "Open your dashboard" : "Start tracking — it's free"} <ArrowRight size={16} />
              </Link>
              <Link href={user ? "/app" : "/login"} className={cx(buttonClass("secondary"), "h-11 px-5 text-base")}>
                {user ? "Go to projects" : "Log in"}
              </Link>
            </div>
            <p className="mk-rise mt-4 text-xs text-muted" style={{ animationDelay: "300ms" }}>
              No credit card. Your data stays on your own infrastructure.
            </p>

            <div className="mk-rise relative mx-auto mt-14 max-w-5xl" style={{ animationDelay: "360ms" }}>
              <ProductPreview />
              <p className="mt-3 text-xs text-muted">Illustrative preview with sample data.</p>
            </div>
          </div>
        </section>

        {/* ─── Highlights ─── */}
        <section className="border-y border-border bg-surface/50">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 sm:px-6 md:grid-cols-4">
            {[
              ["2.9 kB", "gzipped browser SDK"],
              ["~1 second", "from click to live stream"],
              ["0 ms", "of Postgres on the ingest path"],
              ["4 roles", "owner, admin, member, viewer"],
            ].map(([value, label]) => (
              <div key={label} className="px-2 py-8 text-center">
                <dt className="sr-only">{label}</dt>
                <dd>
                  <span className="tabular block text-2xl font-semibold tracking-tight sm:text-3xl">{value}</span>
                  <span className="mt-1 block text-sm text-muted">{label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ─── Features ─── */}
        <section id="features" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <SectionHeading
            eyebrow="Features"
            title="Everything you need to answer product questions"
            body="The core of PostHog and Mixpanel, sized for teams who want answers this afternoon — not a six-week rollout."
          />
          <div className="mt-14 grid gap-4 md:grid-cols-6">
            <FeatureCard className="md:col-span-4" icon={Activity} title="Live event stream" body="See every event within about a second of it happening. Filter by event, user or page, pause the feed, and open any event's properties.">
              <div className="overflow-hidden rounded-lg border border-border bg-bg/60">
                <LiveTicker rows={4} />
              </div>
            </FeatureCard>
            <FeatureCard className="md:col-span-2" icon={Filter} title="Funnels" body="Ordered steps with a conversion window. See exactly where people drop off and how long each step takes.">
              <div className="space-y-2">
                {[100, 72, 31, 8].map((p, i) => (
                  <div key={p} className="flex items-center gap-2">
                    <span className="tabular w-4 text-xs text-muted">{i + 1}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${p}%`, background: "var(--chart-1)" }} />
                    </div>
                    <span className="tabular w-9 text-right text-xs text-muted">{p}%</span>
                  </div>
                ))}
              </div>
            </FeatureCard>
            <FeatureCard className="md:col-span-2" icon={Repeat} title="Retention cohorts" body="Daily or weekly cohorts show whether new users stick around after their first visit.">
              <div className="grid grid-cols-6 gap-1">
                {[100, 44, 26, 18, 14, 12, 100, 47, 29, 20, 15, 0, 100, 41, 24, 17, 0, 0].map((v, i) => (
                  <div
                    key={i}
                    className="h-5 rounded"
                    style={{
                      background:
                        v === 0 ? "var(--surface-2)" : `color-mix(in srgb, var(--chart-1) ${Math.round(10 + v * 0.9)}%, var(--surface))`,
                    }}
                  />
                ))}
              </div>
            </FeatureCard>
            <FeatureCard className="md:col-span-2" icon={BarChart3} title="Trends & breakdowns" body="Count events or unique users by hour, day, week or month. Break down by browser, referrer, plan — any property.">
              <div className="flex h-16 items-end gap-1">
                {[38, 52, 45, 60, 58, 72, 66, 80, 76, 92, 88, 100].map((v, i) => (
                  <div key={i} className="flex flex-1 flex-col justify-end gap-px" style={{ height: `${v}%` }}>
                    <div className="rounded-t-sm" style={{ height: "45%", background: "var(--chart-1)" }} />
                    <div style={{ height: "35%", background: "var(--chart-2)" }} />
                    <div style={{ height: "20%", background: "var(--chart-3)" }} />
                  </div>
                ))}
              </div>
            </FeatureCard>
            <FeatureCard className="md:col-span-2" icon={MonitorPlay} title="Sessions" body="Duration, pages, bounce rate and device for every visit — plus a step-by-step timeline of what happened.">
              <ol className="space-y-1.5 text-xs">
                {[
                  ["+0s", "Pageview", "/pricing"],
                  ["+42s", "Pageview", "/signup"],
                  ["+1m 9s", "signed_up", "via google"],
                ].map(([t, e, d]) => (
                  <li key={t} className="flex items-center gap-2">
                    <span className="tabular w-12 text-right text-muted">{t}</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    <span className="font-medium">{e}</span>
                    <span className="truncate text-muted">{d}</span>
                  </li>
                ))}
              </ol>
            </FeatureCard>
            <FeatureCard className="md:col-span-3" icon={LayoutDashboard} title="Dashboards with one date filter" body="Save any trend, funnel or retention chart to a dashboard. Change the date range once and every tile re-runs. Links are shareable because filters live in the URL." />
            <FeatureCard className="md:col-span-3" icon={Users} title="Teams, roles & API keys" body="Organizations with multiple projects, invite links, and owner / admin / member / viewer roles. A write-only public key for the SDK and hashed secret keys for the query API." />
          </div>
        </section>

        {/* ─── How it works ─── */}
        <section id="how" className="scroll-mt-20 border-y border-border bg-surface/50">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
            <div>
              <SectionHeading align="left" eyebrow="How it works" title="From zero to your first funnel in minutes" />
              <ol className="mt-10 space-y-8">
                {[
                  ["Create a project", "Sign up and you get an organization and a first project with its own public key."],
                  ["Add one script", "Pageviews — including single-page-app navigation — are tracked automatically. Capture anything else with one line."],
                  ["Ask questions", "Build trends, funnels and retention charts, then pin them to a dashboard your whole team can use."],
                ].map(([title, body], i) => (
                  <li key={title} className="flex gap-4">
                    <span className="tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-sm font-semibold text-accent">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold">{title}</h3>
                      <p className="mt-1 text-sm text-muted">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <CodeWindow title="index.html">
              <Line c="muted">{"<!-- 1. Load the SDK -->"}</Line>
              <Line>
                <T c="accent">{"<script "}</T>
                <T c="chart-2">src</T>=<T c="chart-3">{'"https://pulse.yourapp.com/sdk.js"'}</T>
                <T c="accent">{"></script>"}</T>
              </Line>
              <Line> </Line>
              <Line c="muted">{"// 2. Initialise with your project's public key"}</Line>
              <Line>
                pulseboard.<T c="chart-1">init</T>(<T c="chart-3">{'"pk_live_…"'}</T>, {"{"}
              </Line>
              <Line>
                {"  "}apiHost: <T c="chart-3">{'"https://pulse.yourapp.com"'}</T>,
              </Line>
              <Line>{"});"}</Line>
              <Line> </Line>
              <Line c="muted">{"// 3. Track what matters"}</Line>
              <Line>
                pulseboard.<T c="chart-1">capture</T>(<T c="chart-3">{'"signed_up"'}</T>, {"{ "}plan: <T c="chart-3">{'"pro"'}</T>
                {" });"}
              </Line>
              <Line>
                pulseboard.<T c="chart-1">identify</T>(user.id, {"{ "}email: user.email {"});"}
              </Line>
            </CodeWindow>
          </div>
        </section>

        {/* ─── Developers ─── */}
        <section id="developers" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <SectionHeading
            eyebrow="Built for developers"
            title="An architecture you can actually reason about"
            body="One Next.js app, one worker, Postgres and Redis. No black boxes, no per-event bill."
          />
          <div className="mt-14 flex flex-wrap items-center justify-center gap-2 text-sm">
            {["Browser SDK", "Ingest API", "Redis Stream", "Worker", "PostgreSQL", "Dashboard"].map((step, i, all) => (
              <span key={step} className="flex items-center gap-2">
                <span className="rounded-full border border-border bg-surface px-4 py-2 font-medium shadow-sm">{step}</span>
                {i < all.length - 1 && <ArrowRight size={16} className="text-muted" aria-hidden />}
              </span>
            ))}
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            <MiniFeature icon={Zap} title="Fast, safe ingestion">
              Events are validated, rate-limited and queued in Redis in milliseconds. Traffic spikes never reach your database.
            </MiniFeature>
            <MiniFeature icon={ShieldCheck} title="Exactly-once results">
              Client-generated UUIDv7 ids make retries idempotent, and crashed workers&apos; messages are reclaimed automatically.
            </MiniFeature>
            <MiniFeature icon={Database} title="Plain Postgres">
              Funnels and retention are parameterized SQL over indexed tables — easy to inspect, back up and extend.
            </MiniFeature>
            <MiniFeature icon={Users} title="Identity merging">
              Anonymous visitors are merged into the signed-in user on <code className="font-mono text-xs">identify</code>, across devices.
            </MiniFeature>
            <MiniFeature icon={KeyRound} title="Query API">
              Pull any trend, funnel or retention result into your own backend with a secret key.
            </MiniFeature>
            <MiniFeature icon={Code2} title="Typed end to end">
              TypeScript and zod schemas shared by the SDK, the API and the UI — the same validator everywhere.
            </MiniFeature>
          </div>
          <div className="mx-auto mt-10 max-w-3xl">
            <CodeWindow title="terminal">
              <Line>
                <T c="muted">$</T> curl -X POST https://pulse.yourapp.com/api/v1/query \
              </Line>
              <Line>
                {"    "}-H <T c="chart-3">{'"Authorization: Bearer sk_…"'}</T> \
              </Line>
              <Line>
                {"    "}-d <T c="chart-3">{`'{"query":{"type":"funnel","steps":[{"event":"signed_up"},{"event":"upgraded_plan"}]}}'`}</T>
              </Line>
            </CodeWindow>
          </div>
        </section>

        {/* ─── Final CTA ─── */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border border-border bg-surface px-6 py-16 text-center shadow-sm sm:px-12">
            <div className="mk-glow pointer-events-none absolute inset-0 opacity-70" aria-hidden />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Ship the feature. <span className="mk-gradient-text">Know if it worked.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-muted">
                Create a free account, paste one snippet, and see your first events in under five minutes.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href={user ? "/app" : "/signup"} className={cx(buttonClass("primary"), "h-11 px-5 text-base")}>
                  {user ? "Open your dashboard" : "Create your account"} <ArrowRight size={16} />
                </Link>
                {!user && (
                  <Link href="/login" className={cx(buttonClass("secondary"), "h-11 px-5 text-base")}>
                    I already have an account
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <Logo className="text-text" />
          <nav className="flex flex-wrap items-center gap-5">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-text">
                {n.label}
              </a>
            ))}
            <Link href="/login" className="hover:text-text">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-text">
              Sign up
            </Link>
          </nav>
          <p>© {new Date().getFullYear()} PulseBoard</p>
        </div>
      </footer>
    </div>
  );
}

// ─── Section building blocks ─────────────────────────────────────────────

function SectionHeading({ eyebrow, title, body, align = "center" }: { eyebrow: string; title: string; body?: string; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <p className="text-sm font-semibold text-accent">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-pretty text-muted">{body}</p>}
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
  className,
  children,
}: {
  icon: typeof Activity;
  title: string;
  body: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cx(
        "group flex flex-col gap-5 rounded-xl border border-border bg-surface p-6 transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg",
        className,
      )}
    >
      <div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon size={18} />
        </span>
        <h3 className="mt-4 font-semibold">{title}</h3>
        <p className="mt-1.5 text-sm text-muted">{body}</p>
      </div>
      {children && <div className="mt-auto">{children}</div>}
    </div>
  );
}

function MiniFeature({ icon: Icon, title, children }: { icon: typeof Activity; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-accent" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <p className="mt-2 text-sm text-muted">{children}</p>
    </div>
  );
}

function CodeWindow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mk-frame overflow-hidden rounded-xl bg-surface">
      <div className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 font-mono text-xs text-muted">{title}</span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-6">{children}</pre>
    </div>
  );
}

const TOKEN_COLORS = { muted: "var(--muted)", accent: "var(--accent)", "chart-1": "var(--chart-1)", "chart-2": "var(--chart-2)", "chart-3": "var(--chart-3)" } as const;
type Tone = keyof typeof TOKEN_COLORS;

function T({ c, children }: { c: Tone; children: ReactNode }) {
  return <span style={{ color: TOKEN_COLORS[c] }}>{children}</span>;
}

function Line({ c, children }: { c?: Tone; children: ReactNode }) {
  return (
    <span className="block" style={c ? { color: TOKEN_COLORS[c] } : undefined}>
      {children}
    </span>
  );
}
