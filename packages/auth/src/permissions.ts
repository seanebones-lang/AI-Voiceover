import type { OrgRole, Permission } from "@ai-voiceover/contracts"

/** Internal keys aligned with DB enum */
export type OrgRoleKey = "org_admin" | "org_member" | "org_billing" | "org_viewer"

export function contractRoleToDb(role: OrgRole): OrgRoleKey {
  switch (role) {
    case "org:admin":
      return "org_admin"
    case "org:billing":
      return "org_billing"
    case "org:viewer":
      return "org_viewer"
    default:
      return "org_member"
  }
}

export const ORG_ROLE_PERMISSIONS: Record<OrgRoleKey, ReadonlySet<Permission>> = {
  org_admin: new Set<Permission>([
    "project:read",
    "project:write",
    "voice:clone",
    "voice:tts",
    "billing:manage",
    "org:manage",
    "api_keys:manage",
    "audit:read",
  ]),
  org_member: new Set<Permission>([
    "project:read",
    "project:write",
    "voice:clone",
    "voice:tts",
    "api_keys:manage",
  ]),
  org_billing: new Set<Permission>([
    "project:read",
    "billing:manage",
    "audit:read",
  ]),
  org_viewer: new Set<Permission>(["project:read", "audit:read"]),
}

export function roleHasPermission(role: OrgRoleKey, permission: Permission): boolean {
  return ORG_ROLE_PERMISSIONS[role]?.has(permission) ?? false
}
