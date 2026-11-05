import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@pulseboard/core";
import { getProjectAccess } from "@/lib/access";
import { can, ROLES, ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { removeMember, revokeInvite, updateMemberRole } from "@/lib/actions/team";
import { Badge, Card, CardHeader, PageHeader, Select } from "@/components/ui";
import { ConfirmForm, SubmitButton } from "@/components/form";
import { InviteForm } from "@/components/settings-forms";

export const metadata = { title: "Team" };

export default async function TeamPage(props: PageProps<"/p/[projectId]/team">) {
  const { projectId } = await props.params;
  const { org, role, user } = await getProjectAccess(projectId);
  const db = getDb();

  const members = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.orgId, org.id))
    .orderBy(asc(schema.memberships.createdAt));

  const canInvite = can(role, "invite_members");
  const canRoles = can(role, "manage_roles");
  const pending = canInvite
    ? await db
        .select()
        .from(schema.invites)
        .where(and(eq(schema.invites.orgId, org.id), isNull(schema.invites.acceptedAt), gt(schema.invites.expiresAt, new Date())))
        .orderBy(asc(schema.invites.createdAt))
    : [];

  return (
    <>
      <PageHeader
        title="Team"
        description={
          <>
            Members of <strong className="text-text">{org.name}</strong> can access every project in the organization.
          </>
        }
      />
      <div className="space-y-6">
        {canInvite && (
          <Card>
            <CardHeader title="Invite a teammate" description="Generates a one-time link valid for 7 days." />
            <div className="px-5 py-4">
              <InviteForm orgId={org.id} canInviteOwner={role === "owner"} />
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title={`Members (${members.length})`} />
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.name} {m.id === user.id && <span className="text-muted">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{m.email}</p>
                </div>
                {canRoles ? (
                  <form action={updateMemberRole} className="flex items-center gap-2">
                    <input type="hidden" name="orgId" value={org.id} />
                    <input type="hidden" name="userId" value={m.id} />
                    <Select name="role" defaultValue={m.role} inline className="h-8 w-28 text-xs" aria-label={`Role for ${m.name}`}>
                      {ROLES.map((r) => (
                        <option key={r} value={r} title={ROLE_DESCRIPTIONS[r]}>
                          {r}
                        </option>
                      ))}
                    </Select>
                    <SubmitButton variant="secondary" size="sm">
                      Update
                    </SubmitButton>
                  </form>
                ) : (
                  <Badge tone={m.role === "owner" ? "accent" : "neutral"}>{m.role}</Badge>
                )}
                {(canRoles || m.id === user.id) && (
                  <ConfirmForm
                    action={removeMember}
                    message={m.id === user.id ? "Leave this organization?" : `Remove ${m.name} from ${org.name}?`}
                  >
                    <input type="hidden" name="orgId" value={org.id} />
                    <input type="hidden" name="userId" value={m.id} />
                    <SubmitButton variant="ghost" size="sm">
                      {m.id === user.id ? "Leave" : "Remove"}
                    </SubmitButton>
                  </ConfirmForm>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {pending.length > 0 && (
          <Card>
            <CardHeader title="Pending invites" />
            <ul className="divide-y divide-border">
              {pending.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{i.email}</span>
                  <Badge>{i.role}</Badge>
                  <span className="text-xs text-muted">expires {i.expiresAt.toLocaleDateString()}</span>
                  <form action={revokeInvite}>
                    <input type="hidden" name="inviteId" value={i.id} />
                    <SubmitButton variant="ghost" size="sm">
                      Revoke
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <CardHeader title="Roles" />
          <dl className="grid gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2">
            {ROLES.map((r) => (
              <div key={r}>
                <dt className="font-medium capitalize">{r}</dt>
                <dd className="text-muted">{ROLE_DESCRIPTIONS[r]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
