import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema, type Role } from "@pulseboard/core";
import { requireUser } from "./auth";
import { can, type Permission } from "./permissions";

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that") {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);

/** Resolve a project the current user can access, plus their role in its org. 404s otherwise. */
export const getProjectAccess = cache(async (projectId: string) => {
  const user = await requireUser();
  if (!isUuid(projectId)) notFound();
  const [row] = await getDb()
    .select({ project: schema.projects, org: schema.organizations, role: schema.memberships.role })
    .from(schema.projects)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.projects.orgId))
    .innerJoin(
      schema.memberships,
      and(eq(schema.memberships.orgId, schema.projects.orgId), eq(schema.memberships.userId, user.id)),
    )
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (!row) notFound();
  return { user, ...row };
});

export async function requireProjectPermission(projectId: string, permission: Permission) {
  const access = await getProjectAccess(projectId);
  if (!can(access.role, permission)) throw new ForbiddenError();
  return access;
}

export async function getOrgRole(orgId: string, userId: string): Promise<Role | null> {
  const [m] = await getDb()
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.userId, userId)));
  return m?.role ?? null;
}

/** All projects the user can see (with their org) — powers the project switcher. */
export const listUserProjects = cache(async (userId: string) => {
  return getDb()
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      orgId: schema.organizations.id,
      orgName: schema.organizations.name,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.orgId))
    .innerJoin(schema.projects, eq(schema.projects.orgId, schema.organizations.id))
    .where(eq(schema.memberships.userId, userId))
    .orderBy(asc(schema.organizations.name), asc(schema.projects.createdAt));
});

/** Non-throwing variant for API route handlers. */
export async function findProjectAccess(projectId: string, userId: string) {
  if (!isUuid(projectId)) return null;
  const [row] = await getDb()
    .select({ project: schema.projects, role: schema.memberships.role })
    .from(schema.projects)
    .innerJoin(
      schema.memberships,
      and(eq(schema.memberships.orgId, schema.projects.orgId), eq(schema.memberships.userId, userId)),
    )
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  return row ?? null;
}
