"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup } from "@/lib/actions/auth";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/form";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
      <p className="text-center text-sm text-muted">
        No account?{" "}
        <Link className="text-accent hover:underline" href="/signup">
          Create one
        </Link>
      </p>
    </form>
  );
}

export function SignupForm({ invite, email }: { invite?: string; email?: string }) {
  const [state, action] = useActionState(signup, undefined);
  return (
    <form action={action} className="space-y-4">
      {invite && <input type="hidden" name="invite" value={invite} />}
      <Field label="Name">
        <Input name="name" autoComplete="name" required autoFocus />
      </Field>
      <Field label="Work email">
        <Input name="email" type="email" autoComplete="email" defaultValue={email} required />
      </Field>
      <Field label="Password" hint="At least 8 characters">
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingText="Creating account…">
        {invite ? "Create account & join" : "Create account"}
      </SubmitButton>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link className="text-accent hover:underline" href={invite ? `/login?next=/invite/${invite}` : "/login"}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
