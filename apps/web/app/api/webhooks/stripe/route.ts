import { NextResponse } from "next/server"
import { constructStripeWebhookEvent, handleStripeEvent } from "@ai-voiceover/billing"

export const runtime = "nodejs"

export async function POST(req: Request): Promise<Response> {
  const sig = req.headers.get("stripe-signature")
  if (!sig) {
    return NextResponse.json({ error: "missing stripe-signature" }, { status: 400 })
  }

  const raw = await req.text()

  try {
    const event = constructStripeWebhookEvent(raw, sig)
    await handleStripeEvent(event)
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error("[stripe webhook]", err)
    return NextResponse.json({ error: "invalid webhook" }, { status: 400 })
  }
}
