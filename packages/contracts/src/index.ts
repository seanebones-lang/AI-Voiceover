import { z } from "zod"

/** Clerk organization roles → app RBAC */
export const orgRoleSchema = z.enum([
  "org:admin",
  "org:member",
  "org:billing",
  "org:viewer",
])
export type OrgRole = z.infer<typeof orgRoleSchema>

export const permissionSchema = z.enum([
  "project:read",
  "project:write",
  "voice:clone",
  "voice:tts",
  "billing:manage",
  "org:manage",
  "api_keys:manage",
  "audit:read",
])
export type Permission = z.infer<typeof permissionSchema>

/** Maps Clerk organization role strings to internal roles */
export function mapClerkOrgRole(clerkRole: string | undefined): OrgRole {
  const r = (clerkRole ?? "").toLowerCase()
  if (r.includes("admin") || r === "org:admin") return "org:admin"
  if (r.includes("billing")) return "org:billing"
  if (r.includes("viewer") || r === "guest") return "org:viewer"
  return "org:member"
}

export const voiceJobTypeSchema = z.enum(["tts", "clone", "transcode"])
export type VoiceJobType = z.infer<typeof voiceJobTypeSchema>

export const voiceJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
])
export type VoiceJobStatus = z.infer<typeof voiceJobStatusSchema>

export const createVoiceJobBodySchema = z.object({
  type: voiceJobTypeSchema,
  projectId: z.string().uuid().optional(),
  payload: z.record(z.unknown()),
})
export type CreateVoiceJobBody = z.infer<typeof createVoiceJobBodySchema>

export const apiKeyCreateBodySchema = z.object({
  name: z.string().min(1).max(128),
  scopes: z.array(z.string()).optional(),
})
export type ApiKeyCreateBody = z.infer<typeof apiKeyCreateBodySchema>

export const entitlementFeatureSchema = z.enum([
  "voice.tts",
  "voice.clone",
  "api.access",
  "collab.max_members",
  "analytics.dashboard",
])
export type EntitlementFeature = z.infer<typeof entitlementFeatureSchema>

export const stripeSubscriptionMetadataSchema = z.object({
  orgId: z.string().uuid().optional(),
  clerkOrgId: z.string().optional(),
})
