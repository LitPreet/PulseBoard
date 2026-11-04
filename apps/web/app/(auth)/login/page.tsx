import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "../auth-forms";

export const metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { next: rawNext } = await props.searchParams;
  const next = typeof rawNext === "string" && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : undefined;
  if (await getCurrentUser()) redirect(next ?? "/");
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Welcome back</h1>
      <p className="mb-6 text-sm text-muted">Sign in to your PulseBoard workspace.</p>
      <LoginForm next={next} />
    </>
  );
}
