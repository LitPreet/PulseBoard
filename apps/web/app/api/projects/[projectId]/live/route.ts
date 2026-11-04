import { createRedis, liveChannel } from "@pulseboard/core/redis";
import { getCurrentUser } from "@/lib/auth";
import { findProjectAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

/** Server-Sent Events stream of newly stored events for a project. */
export async function GET(request: Request, ctx: RouteContext<"/api/projects/[projectId]/live">) {
  const { projectId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!(await findProjectAccess(projectId, user.id))) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  const subscriber = createRedis();
  const channel = liveChannel(projectId);
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const cleanup = () => {
    clearInterval(heartbeat);
    subscriber.disconnect();
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      subscriber.on("message", (_ch, message) => send(`event: events\ndata: ${message}\n\n`));
      await subscriber.subscribe(channel);
      send(`retry: 3000\nevent: ready\ndata: {}\n\n`);
      heartbeat = setInterval(() => send(`: ping\n\n`), 15_000);
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel: cleanup,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
