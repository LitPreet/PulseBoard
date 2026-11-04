import { getProjectAccess, listUserProjects } from "@/lib/access";
import { logout } from "@/lib/actions/auth";
import { Sidebar } from "@/components/sidebar";

export default async function ProjectLayout(props: LayoutProps<"/p/[projectId]">) {
  const { projectId } = await props.params;
  const { user } = await getProjectAccess(projectId);
  const projects = await listUserProjects(user.id);
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar projectId={projectId} projects={projects} user={user} logoutAction={logout} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{props.children}</div>
      </main>
    </div>
  );
}
