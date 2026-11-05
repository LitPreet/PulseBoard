import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@pulseboard/core";
import { getSession, listSessions } from "@pulseboard/core/analytics";
import { getProjectAccess } from "@/lib/access";
import { eventLabel, fmtDateTime, fmtDuration } from "@/lib/format";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";

export const metadata = { title: "Session" };

export default async function SessionPage(props: PageProps<"/p/[projectId]/sessions/[sessionId]">) {
  const { projectId, sessionId } = await props.params;
  await getProjectAccess(projectId);
  const db = getDb();
  const data = await getSession(db, projectId, decodeURIComponent(sessionId));
  if (!data) notFound();
  const { session, events, person } = data;
  const otherSessions = await listSessions(db, projectId, { range: "180d", personId: session.personId, limit: 10 });
  const start = session.startedAt.getTime();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/p/${projectId}/sessions`} className="text-muted hover:text-text">
          ← Sessions
        </Link>
      </p>
      <PageHeader
        title={`Session on ${fmtDateTime(session.startedAt)}`}
        description={`${fmtDuration(session.durationSeconds)} · ${session.pageviewCount} pages · ${session.eventCount} events`}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardHeader title="Timeline" />
          <ol className="relative px-5 py-4">
            {events.map((e, i) => {
              const custom = !e.event.startsWith("$");
              return (
                <li key={e.id} className="relative flex gap-4 pb-4 last:pb-0">
                  {i < events.length - 1 && <span className="absolute top-5 left-[2.85rem] h-full w-px bg-border" aria-hidden />}
                  <span className="tabular w-10 shrink-0 pt-0.5 text-right text-xs text-muted">
                    +{fmtDuration((e.timestamp.getTime() - start) / 1000)}
                  </span>
                  <span
                    className="relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-surface"
                    style={{ background: custom ? "var(--accent)" : "var(--muted)" }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={custom ? "accent" : "neutral"}>{eventLabel(e.event)}</Badge>
                      {typeof e.properties.$pathname === "string" && <span className="truncate text-sm">{e.properties.$pathname}</span>}
                    </div>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-muted hover:text-text">Properties</summary>
                      <pre className="mt-1 max-h-60 overflow-auto rounded bg-surface-2 p-2 font-mono text-xs">{JSON.stringify(e.properties, null, 2)}</pre>
                    </details>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Person" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <div>
                <dt className="text-xs text-muted">Distinct id</dt>
                <dd className="font-mono text-xs break-all">{session.distinctId}</dd>
              </div>
              {person && (
                <>
                  <div>
                    <dt className="text-xs text-muted">First seen</dt>
                    <dd>{fmtDateTime(person.firstSeen)}</dd>
                  </div>
                  {Object.entries(person.properties).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted">{k}</dt>
                      <dd className="break-all">{String(v)}</dd>
                    </div>
                  ))}
                </>
              )}
              <div>
                <dt className="text-xs text-muted">Device</dt>
                <dd>{[session.browser, session.os, session.deviceType].filter(Boolean).join(" · ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Referrer</dt>
                <dd className="break-all">{session.referrer === "$direct" ? "Direct" : (session.referrer ?? "—")}</dd>
              </div>
            </dl>
          </Card>
          {otherSessions.length > 1 && (
            <Card>
              <CardHeader title="Other sessions" />
              <ul className="divide-y divide-border text-sm">
                {otherSessions.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/p/${projectId}/sessions/${encodeURIComponent(s.id)}`}
                      className={`flex justify-between px-5 py-2 hover:bg-surface-2 ${s.id === session.id ? "font-medium text-accent" : ""}`}
                    >
                      <span>{fmtDateTime(s.startedAt)}</span>
                      <span className="tabular text-muted">{fmtDuration(s.durationSeconds)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
