import { eq } from "drizzle-orm"
import type Stripe from "stripe"
import {
  getDb,
  organizations,
  subscriptions,
  entitlements,
  stripeWebhookEvents,
} from "@ai-voiceover/db"
import { priceIdToEntitlements } from "./entitlements"

function subscriptionStatusMap(
  s: Stripe.Subscription.Status
):
  | "active"
  | "past_due"
  | "canceled"
  | "trialing"
  | "incomplete"
  | "unpaid" {
  switch (s) {
    case "active":
      return "active"
    case "past_due":
      return "past_due"
    case "canceled":
      return "canceled"
    case "trialing":
      return "trialing"
    case "unpaid":
      return "unpaid"
    default:
      return "incomplete"
  }
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const db = getDb()

  const existing = await db
    .select({ id: stripeWebhookEvents.id })
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.id, event.id))
    .limit(1)

  if (existing.length > 0) return

  await db.insert(stripeWebhookEvents).values({
    id: event.id,
    payloadHash: null,
  })

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription
      await upsertSubscription(db, sub)
      break
    }
    default:
      break
  }
}

async function upsertSubscription(
  db: ReturnType<typeof getDb>,
  sub: Stripe.Subscription
): Promise<void> {
  const orgIdMeta = sub.metadata?.orgId as string | undefined
  const clerkOrgId = sub.metadata?.clerkOrgId as string | undefined
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null

  let orgRow = orgIdMeta
    ? await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, orgIdMeta))
        .limit(1)
    : []

  if (orgRow.length === 0 && clerkOrgId) {
    orgRow = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.clerkOrgId, clerkOrgId))
      .limit(1)
  }

  if (orgRow.length === 0 && customerId) {
    orgRow = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.stripeCustomerId, customerId))
      .limit(1)
  }

  if (orgRow.length === 0) {
    console.warn("[billing] subscription event without resolvable org", sub.id)
    return
  }

  const orgId = orgRow[0].id
  const priceId = sub.items.data[0]?.price?.id ?? null
  const status = subscriptionStatusMap(sub.status)

  await db
    .insert(subscriptions)
    .values({
      orgId,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      status,
      currentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : null,
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        stripePriceId: priceId,
        status,
        currentPeriodEnd: sub.current_period_end
          ? new Date(sub.current_period_end * 1000)
          : null,
        updatedAt: new Date(),
      },
    })

  const featureMap = priceIdToEntitlements(priceId)
  for (const [featureKey, value] of Object.entries(featureMap)) {
    await db
      .insert(entitlements)
      .values({
        orgId,
        featureKey,
        value: value as unknown,
      })
      .onConflictDoUpdate({
        target: [entitlements.orgId, entitlements.featureKey],
        set: {
          value: value as unknown,
          updatedAt: new Date(),
        },
      })
  }
}
