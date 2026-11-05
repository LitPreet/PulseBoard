import { BuilderPage } from "@/components/builder-page";

export const metadata = { title: "Trends" };

export default async function Page(props: PageProps<"/p/[projectId]/trends">) {
  const { projectId } = await props.params;
  const { insight } = await props.searchParams;
  return (
    <BuilderPage
      projectId={projectId}
      type="trend"
      title="Trends"
      description="Count events and unique users over time, with filters and breakdowns."
      insightId={typeof insight === "string" ? insight : undefined}
    />
  );
}
