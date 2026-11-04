"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type Role } from "@pulseboard/core";
import { requireUser } from "../auth";
import { getOrgRole } from "../access";
import { can, ROLES, type Permission } from "../permissions";
import { randomToken, sha256 } from "../crypto";
import type { FormState } from "./auth";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function requireOrgPermission(orgId: string, permission: Permission) {
  const user = await requireUser();
  const role = await getOrgRole(orgId, user.id);
  if (!role || !can(role, permission)) throw new Error("You don't have permission to do that");
  return { user, role };
}

const roleSchema = z.enum(ROLES as [Role, ...Role[]]);

export type InviteState = { error?: string; ok?: string; link?: string } | undefined;

export async function createInvite(_: InviteState, form: FormData): Promise<InviteState> {
  const parsed = z
    .object({ orgId: z.uuid(), email: z.email("Enter a valid email"), role: roleSchema })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { orgId, email, role } = parsed.data;

  const { user, role: myRole } = await requireOrgPermission(orgId, "invite_members");
  if (role === "owner" && myRole !== "owner") return { error: "Only owners can invite other owners" };

  const token = randomToken();
  await getDb()
    .insert(schema.invites)
    .values({
      orgId,
      email: email.toLowerCase(),
      role,
      tokenHash: sha256(token),
      invitedBy: user.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
  revalidatePath("/p", "layout");
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return { ok: `Invite created for ${email}`, link: `${base}/invite/${token}` };
}

export async function revokeInvite(form: FormData) {
  const id = z.uuid().parse(form.get("inviteId"));
  const [invite] = await getDb().select().from(schema.invites).where(eq(schema.invites.id, id));
  if (!invite) return;
  await requireOrgPermission(invite.orgId, "invite_members");
  await getDb().delete(schema.invites).where(eq(schema.invites.id, id));
  revalidatePath("/p", "layout");
}

async function ownerCount(orgId: string) {
  const [r] = await getDb()
    .select({ n: count() })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.role, "owner")));
  return r?.n ?? 0;
}

export async function updateMemberRole(form: FormData) {
  const { orgId, userId, role } = z
    .object({ orgId: z.uuid(), userId: z.uuid(), role: roleSchema })
    .parse(Object.fromEntries(form));
  await requireOrgPermission(orgId, "manage_roles");
  const current = await getOrgRole(orgId, userId);
  if (current === "owner" && role !== "owner" && (await ownerCount(orgId)) <= 1) {
    throw new Error("An organization needs at least one owner");
  }
  await getDb()
    .update(schema.memberships)
    .set({ role })
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId)));
  revalidatePath("/p", "layout");
}

export async function removeMember(form: FormData) {
  const { orgId, userId } = z.object({ orgId: z.uuid(), userId: z.uuid() }).parse(Object.fromEntries(form));
  const me = await requireUser();
  const myRole = await getOrgRole(orgId, me.id);
  const leavingSelf = me.id === userId;
  if (!myRole || (!leavingSelf && !can(myRole, "manage_roles"))) throw new Error("Not allowed");
  if ((await getOrgRole(orgId, userId)) === "owner" && (await ownerCount(orgId)) <= 1) {
    throw new Error("An organization needs at least one owner");
  }
  await getDb()
    .delete(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId)));
  revalidatePath("/p", "layout");
  if (leavingSelf) redirect("/");
}

/** Accept an invite as the signed-in user. */
export async function acceptInvite(form: FormData) {
  const token = z.string().min(10).parse(form.get("token"));
  const user = await requireUser();
  const db = getDb();
  const [invite] = await db
    .select()
    .from(schema.invites)
    .where(
      and(
        eq(schema.invites.tokenHash, sha256(token)),
        isNull(schema.invites.acceptedAt),
        gt(schema.invites.expiresAt, new Date()),
      ),
    );
  if (!invite) redirect("/?error=invite");
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.memberships)
      .values({ orgId: invite.orgId, userId: user.id, role: invite.role })
      .onConflictDoNothing();
    await tx.update(schema.invites).set({ acceptedAt: new Date() }).where(eq(schema.invites.id, invite.id));
  });
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.orgId, invite.orgId)).limit(1);
  redirect(project ? `/p/${project.id}` : "/");
}
