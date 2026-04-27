import type { EntitlementFeature } from "@ai-voiceover/contracts"

/** Map Stripe Price IDs → feature flags (set in Stripe Dashboard + env). */
export function priceIdToEntitlements(priceId: string | null | undefined): Partial<
  Record<EntitlementFeature, unknown>
> {
  if (!priceId) return {}
  const tierPro = process.env.STRIPE_PRICE_ID_PRO
  const tierTeam = process.env.STRIPE_PRICE_ID_TEAM
  const base: Partial<Record<EntitlementFeature, unknown>> = {
    "voice.tts": true,
  }
  if (priceId === tierPro) {
    return {
      ...base,
      "voice.clone": true,
      "api.access": true,
      "analytics.dashboard": true,
      "collab.max_members": 25,
    }
  }
  if (priceId === tierTeam) {
    return {
      ...base,
      "voice.clone": true,
      "api.access": true,
      "analytics.dashboard": true,
      "collab.max_members": 100,
    }
  }
  /** Starter / default price */
  return {
    ...base,
    "voice.clone": false,
    "api.access": false,
    "analytics.dashboard": false,
    "collab.max_members": 3,
  }
}
