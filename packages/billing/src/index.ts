import type Stripe from "stripe"
import { getStripe, getStripeWebhookSecret } from "./stripe-client"
export { getStripe, getStripeWebhookSecret } from "./stripe-client"
export { priceIdToEntitlements } from "./entitlements"
export { handleStripeEvent } from "./webhook-handlers"

export function constructStripeWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  return getStripe().webhooks.constructEvent(payload, signature, getStripeWebhookSecret())
}
