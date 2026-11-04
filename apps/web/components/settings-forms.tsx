"use client";

import { useActionState } from "react";
import { createApiKey, createProject, renameProject } from "@/lib/actions/project";
import { createInvite } from "@/lib/actions/team";
import { ROLES, ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { Input, Select } from "./ui";
import { CopyButton, FormMessage, SubmitButton } from "./form";

export function RenameProjectForm({ projectId, name, disabled }: { projectId: string; name: string; disabled: boolean }) {
  const [state, action] = useActionState(renameProject, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <Input name="name" defaultValue={name} disabled={disabled} className="max-w-xs" aria-label="Project name" />
      {!disabled && (
        <SubmitButton variant="secondary" pendingText="Saving…">
          Save
        </SubmitButton>
      )}
      <FormMessage state={state} />
    </form>
  );
}

export function CreateApiKeyForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(createApiKey, undefined);
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        <Input name="name" placeholder="Key name, e.g. Backend reporting" className="max-w-xs" required />
        <SubmitButton pendingText="Creating…">Create secret key</SubmitButton>
      </form>
      <FormMessage state={state} />
      {state?.key && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent-soft px-3 py-2">
          <code className="min-w-0 flex-1 break-all font-mono text-sm">{state.key}</code>
          <CopyButton value={state.key} />
        </div>
      )}
    </div>
  );
}

export function CreateProjectForm({ orgs }: { orgs: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createProject, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <Select name="orgId" className="max-w-[12rem]" aria-label="Organization">
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
      <Input name="name" placeholder="Project name" className="max-w-xs" required />
      <SubmitButton variant="secondary" pendingText="Creating…">
        Create project
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function InviteForm({ orgId, canInviteOwner }: { orgId: string; canInviteOwner: boolean }) {
  const [state, action] = useActionState(createInvite, undefined);
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="orgId" value={orgId} />
        <Input name="email" type="email" placeholder="teammate@company.com" className="max-w-xs" required />
        <Select name="role" defaultValue="member" className="max-w-[10rem]" aria-label="Role">
          {ROLES.filter((r) => canInviteOwner || r !== "owner").map((r) => (
            <option key={r} value={r} title={ROLE_DESCRIPTIONS[r]}>
              {r}
            </option>
          ))}
        </Select>
        <SubmitButton pendingText="Creating…">Create invite link</SubmitButton>
      </form>
      <FormMessage state={state} />
      {state?.link && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent-soft px-3 py-2">
          <code className="min-w-0 flex-1 break-all font-mono text-xs">{state.link}</code>
          <CopyButton value={state.link} />
        </div>
      )}
    </div>
  );
}
