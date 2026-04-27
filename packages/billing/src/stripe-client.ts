import Stripe from "stripe"

let stripeSingleton: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeSingleton) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set")
    stripeSingleton = new Stripe(key, {
      typescript: true,
    })
  }
  return stripeSingleton
}

export function getStripeWebhookSecret(): string {
  const s = process.env.STRIPE_WEBHOOK_SECRET
  if (!s) throw new Error("STRIPE_WEBHOOK_SECRET is not set")
  return s
}
