import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignupForm } from "../auth-forms";

export const metadata = { title: "Create account" };

export default async function SignupPage(props: PageProps<"/signup">) {
  const { invite, email } = await props.searchParams;
  if (await getCurrentUser()) redirect(typeof invite === "string" ? `/invite/${invite}` : "/app");
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Create your account</h1>
      <p className="mb-6 text-sm text-muted">
        {invite ? "You'll join your team's organization." : "We'll set up an organization and a first project for you."}
      </p>
      <SignupForm
        invite={typeof invite === "string" ? invite : undefined}
        email={typeof email === "string" ? email : undefined}
      />
    </>
  );
}
