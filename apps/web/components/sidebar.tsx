"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  ChevronsUpDown,
  Filter,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MonitorPlay,
  Repeat,
  Users,
} from "lucide-react";
import { Logo } from "./logo";
import { cx } from "./ui";

type ProjectItem = { id: string; name: string; orgId: string; orgName: string };

const NAV = [
  { href: "", label: "Overview", icon: Gauge },
  { href: "/events", label: "Live events", icon: Activity },
  { href: "/trends", label: "Trends", icon: BarChart3 },
  { href: "/funnels", label: "Funnels", icon: Filter },
  { href: "/retention", label: "Retention", icon: Repeat },
  { href: "/sessions", label: "Sessions", icon: MonitorPlay },
  { href: "/dashboards", label: "Dashboards", icon: LayoutDashboard },
];

const SETTINGS = [
  { href: "/settings", label: "Project & API keys", icon: KeyRound },
  { href: "/team", label: "Team", icon: Users },
];

export function Sidebar({
  projectId,
  projects,
  user,
  logoutAction,
}: {
  projectId: string;
  projects: ProjectItem[];
  user: { name: string; email: string };
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const base = `/p/${projectId}`;
  const current = projects.find((p) => p.id === projectId);

  const link = (item: (typeof NAV)[number]) => {
    const href = base + item.href;
    const active = item.href === "" ? pathname === base : pathname.startsWith(href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={href}
        className={cx(
          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition",
          active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-text",
        )}
      >
        <Icon size={16} strokeWidth={2} />
        {item.label}
      </Link>
    );
  };

  return (
    <aside className="flex w-full flex-col border-b border-border bg-surface md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0">
      <div className="px-4 pt-4 pb-3">
        <Logo />
      </div>

      <details className="group relative mx-3 mb-3">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-surface-2">
          <span className="min-w-0">
            <span className="block truncate text-xs text-muted">{current?.orgName}</span>
            <span className="block truncate font-medium">{current?.name}</span>
          </span>
          <ChevronsUpDown size={14} className="text-muted" />
        </summary>
        <div className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-md border border-border bg-surface p-1 shadow-lg">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              className={cx(
                "block rounded px-2 py-1.5 text-sm hover:bg-surface-2",
                p.id === projectId && "font-medium text-accent",
              )}
            >
              <span className="block truncate">{p.name}</span>
              <span className="block truncate text-xs text-muted">{p.orgName}</span>
            </Link>
          ))}
          <Link href={`${base}/settings#new-project`} className="block rounded px-2 py-1.5 text-sm text-accent hover:bg-surface-2">
            + New project
          </Link>
        </div>
      </details>

      <nav className="flex flex-row flex-wrap gap-0.5 px-3 md:flex-col">{NAV.map(link)}</nav>
      <p className="mt-5 hidden px-5 pb-1 text-xs font-medium uppercase tracking-wide text-muted md:block">Settings</p>
      <nav className="flex flex-row flex-wrap gap-0.5 px-3 pb-3 md:flex-col">{SETTINGS.map(link)}</nav>

      <div className="mt-auto hidden border-t border-border px-4 py-3 md:block">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.email}</p>
        <form action={logoutAction} className="mt-2">
          <button className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-text">
            <LogOut size={12} /> Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
