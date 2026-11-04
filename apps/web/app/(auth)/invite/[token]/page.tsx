import Link from "next/link";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@pulseboard/core";
import { getCurrentUser } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { acceptInvite } from "@/lib/actions/team";
import { buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/form";

export const metadata = { title: "Join organization" };

export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;
  const [invite] = await getDb()
    .select({ email: schema.invites.email, role: schema.invites.role, orgName: schema.organizations.name })
    .from(schema.invites)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.invites.orgId))
    .where(
      and(
        eq(schema.invites.tokenHash, sha256(token)),
        isNull(schema.invites.acceptedAt),
        gt(schema.invites.expiresAt, new Date()),
      ),
    );

  if (!invite) {
    return (
      <>
        <h1 className="mb-1 text-lg font-semibold">Invite not found</h1>
        <p className="text-sm text-muted">This invite link is invalid, expired or has already been used.</p>
      </>
    );
  }

  const user = await getCurrentUser();
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold">Join {invite.orgName}</h1>
      <p className="mb-6 text-sm text-muted">
        You&apos;ve been invited as <strong className="text-text">{invite.role}</strong>.
      </p>
      {user ? (
        <form action={acceptInvite} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm text-muted">Signed in as {user.email}</p>
          <SubmitButton className="w-full">Accept invite</SubmitButton>
        </form>
      ) : (
        <div className="space-y-2">
          <Link
            href={`/signup?invite=${token}&email=${encodeURIComponent(invite.email)}`}
            className={buttonClass("primary") + " w-full"}
          >
            Create account
          </Link>
          <Link href={`/login?next=/invite/${token}`} className={buttonClass("secondary") + " w-full"}>
            I already have an account
          </Link>
        </div>
      )}
    </>
  );
}
