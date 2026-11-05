import { BuilderPage } from "@/components/builder-page";

export const metadata = { title: "Retention" };

export default async function Page(props: PageProps<"/p/[projectId]/retention">) {
  const { projectId } = await props.params;
  const { insight } = await props.searchParams;
  return (
    <BuilderPage
      projectId={projectId}
      type="retention"
      title="Retention"
      description="How many people come back after their first visit or action."
      insightId={typeof insight === "string" ? insight : undefined}
    />
  );
}
