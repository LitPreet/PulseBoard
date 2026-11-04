"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@pulseboard/core";
import { invalidateProjectKeyCache } from "@pulseboard/core/ingest";
import { requireUser } from "../auth";
import { getOrgRole, requireProjectPermission } from "../access";
import { can } from "../permissions";
import { newPublicKey, newSecretKey, sha256 } from "../crypto";
import type { FormState } from "./auth";

export async function createProject(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({ orgId: z.uuid(), name: z.string().trim().min(1, "Name is required").max(80) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const user = await requireUser();
  const role = await getOrgRole(parsed.data.orgId, user.id);
  if (!role || !can(role, "manage_project")) return { error: "Only admins can create projects" };
  const [project] = await getDb()
    .insert(schema.projects)
    .values({ orgId: parsed.data.orgId, name: parsed.data.name, publicKey: newPublicKey() })
    .returning();
  redirect(`/p/${project!.id}/settings`);
}

export async function renameProject(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({ projectId: z.uuid(), name: z.string().trim().min(1, "Name is required").max(80) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await requireProjectPermission(parsed.data.projectId, "manage_project");
  await getDb().update(schema.projects).set({ name: parsed.data.name }).where(eq(schema.projects.id, parsed.data.projectId));
  revalidatePath("/p", "layout");
  return { ok: "Project renamed" };
}

export async function rotatePublicKey(form: FormData) {
  const projectId = z.uuid().parse(form.get("projectId"));
  const { project } = await requireProjectPermission(projectId, "manage_project");
  await getDb().update(schema.projects).set({ publicKey: newPublicKey() }).where(eq(schema.projects.id, projectId));
  await invalidateProjectKeyCache(project.publicKey);
  revalidatePath(`/p/${projectId}/settings`);
}

export type ApiKeyState = { error?: string; ok?: string; key?: string } | undefined;

export async function createApiKey(_: ApiKeyState, form: FormData): Promise<ApiKeyState> {
  const parsed = z
    .object({ projectId: z.uuid(), name: z.string().trim().min(1, "Give the key a name").max(80) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { user } = await requireProjectPermission(parsed.data.projectId, "manage_api_keys");
  const key = newSecretKey();
  await getDb()
    .insert(schema.apiKeys)
    .values({
      projectId: parsed.data.projectId,
      name: parsed.data.name,
      prefix: key.slice(0, 10),
      keyHash: sha256(key),
      createdBy: user.id,
    });
  revalidatePath(`/p/${parsed.data.projectId}/settings`);
  return { ok: "Key created — copy it now, it won't be shown again.", key };
}

export async function revokeApiKey(form: FormData) {
  const { projectId, keyId } = z.object({ projectId: z.uuid(), keyId: z.uuid() }).parse(Object.fromEntries(form));
  await requireProjectPermission(projectId, "manage_api_keys");
  await getDb()
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.projectId, projectId)));
  revalidatePath(`/p/${projectId}/settings`);
}
