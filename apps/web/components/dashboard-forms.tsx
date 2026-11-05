"use client";

import { useActionState } from "react";
import { createDashboard } from "@/lib/actions/insights";
import { Input } from "./ui";
import { FormMessage, SubmitButton } from "./form";

export function CreateDashboardForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(createDashboard, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <Input name="name" placeholder="Dashboard name" className="max-w-xs" required />
      <Input name="description" placeholder="Description (optional)" className="max-w-sm" />
      <SubmitButton pendingText="Creating…">New dashboard</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
