import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@pulseboard/core";
import { getProjectAccess, listUserProjects } from "@/lib/access";
import { can } from "@/lib/permissions";
import { revokeApiKey, rotatePublicKey } from "@/lib/actions/project";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { ConfirmForm, CopyButton, SubmitButton } from "@/components/form";
import { CreateApiKeyForm, CreateProjectForm, RenameProjectForm } from "@/components/settings-forms";

export const metadata = { title: "Project settings" };

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export default async function SettingsPage(props: PageProps<"/p/[projectId]/settings">) {
  const { projectId } = await props.params;
  const { project, role, user } = await getProjectAccess(projectId);
  const canManage = can(role, "manage_project");
  const canKeys = can(role, "manage_api_keys");

  const keys = canKeys
    ? await getDb()
        .select()
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.projectId, projectId))
        .orderBy(desc(schema.apiKeys.createdAt))
    : [];

  const adminOrgs = (await listUserProjects(user.id))
    .filter((p) => can(p.role, "manage_project"))
    .reduce<{ id: string; name: string }[]>(
      (acc, p) => (acc.some((o) => o.id === p.orgId) ? acc : [...acc, { id: p.orgId, name: p.orgName }]),
      [],
    );

  const snippet = `<script src="${appUrl()}/sdk.js"></script>
<script>
  pulseboard.init("${project.publicKey}", { apiHost: "${appUrl()}" });
</script>`;

  const npmSnippet = `import { pulseboard } from "@pulseboard/sdk";

pulseboard.init("${project.publicKey}", { apiHost: "${appUrl()}" });
pulseboard.capture("signed_up", { plan: "pro" });
pulseboard.identify(user.id, { email: user.email });`;

  return (
    <>
      <PageHeader title="Project settings" description="Install the SDK, manage keys and configure this project." />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Project name" />
          <div className="px-5 py-4">
            <RenameProjectForm projectId={projectId} name={project.name} disabled={!canManage} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Install the SDK"
            description="Paste this before </body> on every page. Pageviews are captured automatically, including SPA navigation."
            action={<CopyButton value={snippet} />}
          />
          <div className="space-y-4 px-5 py-4">
            <pre className="overflow-x-auto rounded-md bg-surface-2 p-4 font-mono text-xs leading-relaxed">{snippet}</pre>
            <details>
              <summary className="cursor-pointer text-sm text-muted hover:text-text">Using a bundler instead?</summary>
              <pre className="mt-3 overflow-x-auto rounded-md bg-surface-2 p-4 font-mono text-xs leading-relaxed">{npmSnippet}</pre>
            </details>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted">Public key</span>
              <code className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs">{project.publicKey}</code>
              <CopyButton value={project.publicKey} />
              {canManage && (
                <ConfirmForm
                  action={rotatePublicKey}
                  message="Rotate the public key? Sites using the old key will stop sending events until updated."
                >
                  <input type="hidden" name="projectId" value={projectId} />
                  <SubmitButton variant="danger" size="sm">
                    Rotate
                  </SubmitButton>
                </ConfirmForm>
              )}
            </div>
            <p className="text-xs text-muted">
              The public key can only <em>send</em> events, so it&apos;s safe to ship in client-side code.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Secret API keys"
            description={
              <>
                Query your analytics from your backend: <code className="font-mono text-xs">POST /api/v1/query</code> with{" "}
                <code className="font-mono text-xs">Authorization: Bearer sk_…</code>
              </>
            }
          />
          {canKeys ? (
            <div className="space-y-4 px-5 py-4">
              <CreateApiKeyForm projectId={projectId} />
              {keys.length === 0 ? (
                <p className="text-sm text-muted">No secret keys yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted">
                      <tr>
                        <th className="py-2 font-medium">Name</th>
                        <th className="py-2 font-medium">Key</th>
                        <th className="py-2 font-medium">Created</th>
                        <th className="py-2 font-medium">Last used</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((k) => (
                        <tr key={k.id} className="border-t border-border">
                          <td className="py-2.5">{k.name}</td>
                          <td className="py-2.5 font-mono text-xs">{k.prefix}…</td>
                          <td className="py-2.5 text-muted">{k.createdAt.toLocaleDateString()}</td>
                          <td className="py-2.5 text-muted">{k.lastUsedAt ? k.lastUsedAt.toLocaleString() : "Never"}</td>
                          <td className="py-2.5 text-right">
                            {k.revokedAt ? (
                              <Badge tone="danger">Revoked</Badge>
                            ) : (
                              <ConfirmForm action={revokeApiKey} message={`Revoke "${k.name}"? This can't be undone.`}>
                                <input type="hidden" name="projectId" value={projectId} />
                                <input type="hidden" name="keyId" value={k.id} />
                                <SubmitButton variant="danger" size="sm">
                                  Revoke
                                </SubmitButton>
                              </ConfirmForm>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <EmptyState title="Admins only">Ask an admin of this organization to create secret keys.</EmptyState>
          )}
        </Card>

        {adminOrgs.length > 0 && (
          <Card>
            <div id="new-project" />
            <CardHeader title="New project" description="Projects keep events, keys and dashboards separate (e.g. staging vs production)." />
            <div className="px-5 py-4">
              <CreateProjectForm orgs={adminOrgs} />
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
