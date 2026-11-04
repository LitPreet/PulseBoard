import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserProjects } from "@/lib/access";
import { EmptyState } from "@/components/ui";

export default async function Home() {
  const user = await requireUser();
  const projects = await listUserProjects(user.id);
  if (projects[0]) redirect(`/p/${projects[0].id}`);
  return (
    <main className="mx-auto max-w-lg py-24">
      <EmptyState title="You're not part of any organization yet">
        Ask a teammate for an invite link, or sign up with a new account to create your own organization.
      </EmptyState>
    </main>
  );
}
