import type { Role } from "@pulseboard/core";

const rank: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export type Permission =
  | "view"
  | "edit_insights"
  | "manage_project"
  | "manage_api_keys"
  | "invite_members"
  | "manage_roles";

const required: Record<Permission, Role> = {
  view: "viewer",
  edit_insights: "member",
  manage_project: "admin",
  manage_api_keys: "admin",
  invite_members: "admin",
  manage_roles: "owner",
};

export function can(role: Role, permission: Permission): boolean {
  return rank[role] >= rank[required[permission]];
}

export const ROLES: Role[] = ["owner", "admin", "member", "viewer"];

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full control, including roles and members",
  admin: "Manage projects, API keys and invites",
  member: "Create and edit insights and dashboards",
  viewer: "Read-only access to analytics",
};
