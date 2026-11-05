import { getDb } from "@pulseboard/core";
import { recentEvents } from "@pulseboard/core/analytics";
import { getProjectAccess } from "@/lib/access";
import { PageHeader } from "@/components/ui";
import { LiveEvents } from "@/components/live-events";

export const metadata = { title: "Live events" };

export default async function EventsPage(props: PageProps<"/p/[projectId]/events">) {
  const { projectId } = await props.params;
  await getProjectAccess(projectId);
  const initial = await recentEvents(getDb(), projectId, { limit: 100 });
  return (
    <>
      <PageHeader title="Live events" description="Every event as it's stored. Click a row to inspect its properties." />
      <LiveEvents
        projectId={projectId}
        initial={initial.map((e) => ({
          id: e.id,
          event: e.event,
          distinctId: e.distinctId,
          personId: e.personId,
          sessionId: e.sessionId,
          timestamp: e.timestamp.toISOString(),
          properties: e.properties,
        }))}
      />
    </>
  );
}
