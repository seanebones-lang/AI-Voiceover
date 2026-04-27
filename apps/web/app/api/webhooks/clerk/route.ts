import { NextResponse } from "next/server"
import { verifyWebhook } from "@clerk/backend/webhooks"
import { handleClerkWebhook } from "@/lib/clerk-sync"

export const runtime = "nodejs"

export async function POST(req: Request): Promise<Response> {
  try {
    const evt = await verifyWebhook(req)
    await handleClerkWebhook(evt)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[clerk webhook]", err)
    return NextResponse.json({ error: "invalid webhook" }, { status: 400 })
  }
}
