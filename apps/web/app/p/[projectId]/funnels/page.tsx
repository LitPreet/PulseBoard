import { BuilderPage } from "@/components/builder-page";

export const metadata = { title: "Funnels" };

export default async function Page(props: PageProps<"/p/[projectId]/funnels">) {
  const { projectId } = await props.params;
  const { insight } = await props.searchParams;
  return (
    <BuilderPage
      projectId={projectId}
      type="funnel"
      title="Funnels"
      description="See where people drop off between ordered steps."
      insightId={typeof insight === "string" ? insight : undefined}
    />
  );
}
