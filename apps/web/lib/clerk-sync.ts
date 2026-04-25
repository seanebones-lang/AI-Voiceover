import { and, eq } from "drizzle-orm"
import type { WebhookEvent } from "@clerk/backend"
import { mapClerkOrgRole } from "@ai-voiceover/contracts"
import { contractRoleToDb } from "@ai-voiceover/auth"
import { getDb, users, organizations, orgMembers } from "@ai-voiceover/db"

function primaryEmail(u: {
  primary_email_address_id: string | null
  email_addresses: { id: string; email_address: string }[]
}): string | null {
  if (u.primary_email_address_id) {
    const found = u.email_addresses?.find((e) => e.id === u.primary_email_address_id)
    if (found) return found.email_address
  }
  return u.email_addresses?.[0]?.email_address ?? null
}

/**
 * Sync Clerk webhook events into Postgres (orgs, users, memberships).
 */
export async function handleClerkWebhook(evt: WebhookEvent): Promise<void> {
  const db = getDb()

  switch (evt.type) {
    case "user.created":
    case "user.updated": {
      const u = evt.data
      await db
        .insert(users)
        .values({
          clerkUserId: u.id,
          email: primaryEmail(u),
        })
        .onConflictDoUpdate({
          target: users.clerkUserId,
          set: {
            email: primaryEmail(u),
            updatedAt: new Date(),
          },
        })
      break
    }
    case "organization.created":
    case "organization.updated": {
      const o = evt.data
      await db
        .insert(organizations)
        .values({
          clerkOrgId: o.id,
          name: o.name,
        })
        .onConflictDoUpdate({
          target: organizations.clerkOrgId,
          set: {
            name: o.name,
            updatedAt: new Date(),
          },
        })
      break
    }
    case "organizationMembership.created":
    case "organizationMembership.updated": {
      const m = evt.data
      const clerkUserId = m.public_user_data.user_id
      const clerkOrgId = m.organization.id

      const userRows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkUserId, clerkUserId))
        .limit(1)
      const orgRows = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.clerkOrgId, clerkOrgId))
        .limit(1)

      if (!userRows.length || !orgRows.length) {
        console.warn("[clerk-sync] membership before user/org row; skipping", evt.type)
        return
      }

      const internalRole = contractRoleToDb(mapClerkOrgRole(String(m.role)))

      await db
        .insert(orgMembers)
        .values({
          orgId: orgRows[0].id,
          userId: userRows[0].id,
          role: internalRole,
        })
        .onConflictDoUpdate({
          target: [orgMembers.orgId, orgMembers.userId],
          set: {
            role: internalRole,
          },
        })
      break
    }
    case "organizationMembership.deleted": {
      const m = evt.data
      const clerkUserId = m.public_user_data.user_id
      const clerkOrgId = m.organization.id
      const userRows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkUserId, clerkUserId))
        .limit(1)
      const orgRows = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.clerkOrgId, clerkOrgId))
        .limit(1)
      if (!userRows.length || !orgRows.length) break
      await db
        .delete(orgMembers)
        .where(
          and(eq(orgMembers.orgId, orgRows[0].id), eq(orgMembers.userId, userRows[0].id))
        )
      break
    }
    default:
      break
  }
}
