"use server";

import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@pulseboard/core";
import { createSession, destroySession } from "../auth";
import { hashPassword, newPublicKey, sha256, verifyPassword } from "../crypto";

export type FormState = { error?: string; ok?: string } | undefined;

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.email("Enter a valid email").transform((e) => e.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  invite: z.string().optional(),
});

function safeNext(next: FormDataEntryValue | null) {
  const v = typeof next === "string" ? next : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/app";
}

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { name, email, password, invite } = parsed.data;
  const db = getDb();

  const existing = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (existing.length) return { error: "An account with that email already exists" };

  const passwordHash = await hashPassword(password);

  const userId = await db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ name, email, passwordHash }).returning();
    const pendingInvite = invite
      ? (
          await tx
            .select()
            .from(schema.invites)
            .where(
              and(
                eq(schema.invites.tokenHash, sha256(invite)),
                isNull(schema.invites.acceptedAt),
                gt(schema.invites.expiresAt, new Date()),
              ),
            )
        )[0]
      : undefined;

    if (pendingInvite) {
      await tx.insert(schema.memberships).values({ orgId: pendingInvite.orgId, userId: user!.id, role: pendingInvite.role });
      await tx.update(schema.invites).set({ acceptedAt: new Date() }).where(eq(schema.invites.id, pendingInvite.id));
    } else {
      const [org] = await tx.insert(schema.organizations).values({ name: `${name.split(" ")[0]}'s Org` }).returning();
      await tx.insert(schema.memberships).values({ orgId: org!.id, userId: user!.id, role: "owner" });
      await tx.insert(schema.projects).values({ orgId: org!.id, name: "My first project", publicKey: newPublicKey() });
    }
    return user!.id;
  });

  await createSession(userId);
  redirect("/app");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string().min(1),
});

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password" };
  const [user] = await getDb().select().from(schema.users).where(eq(schema.users.email, parsed.data.email));
  // Always run a hash comparison so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? "scrypt$AAAA$AAAA");
  if (!user || !ok) return { error: "Invalid email or password" };
  await createSession(user.id);
  redirect(safeNext(form.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
