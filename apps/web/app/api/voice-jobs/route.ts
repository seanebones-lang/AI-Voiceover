import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { eq, desc } from "drizzle-orm"
import { createVoiceJobBodySchema } from "@ai-voiceover/contracts"
import { getDb, voiceJobs, organizations } from "@ai-voiceover/db"
import { getVoiceQueue } from "@/lib/queue"

export const runtime = "nodejs"

export async function POST(req: Request): Promise<Response> {
  const { userId, orgId: clerkOrgId } = await auth()
  if (!userId || !clerkOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = createVoiceJobBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const db = getDb()
    const orgRow = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.clerkOrgId, clerkOrgId))
      .limit(1)

    if (!orgRow.length) {
      return NextResponse.json(
        { error: "Organization not provisioned yet; ensure Clerk webhooks are configured." },
        { status: 400 }
      )
    }

    const [row] = await db
      .insert(voiceJobs)
      .values({
        orgId: orgRow[0].id,
        projectId: parsed.data.projectId ?? null,
        type: parsed.data.type,
        payload: parsed.data.payload,
        status: "queued",
      })
      .returning({ id: voiceJobs.id })

    const q = getVoiceQueue()
    if (q && row) {
      await q.add(
        "run",
        { rowId: row.id, type: parsed.data.type },
        { removeOnComplete: 100, removeOnFail: 500 }
      )
    }

    return NextResponse.json({ id: row?.id, status: "queued" })
  } catch (e) {
    console.error("[voice-jobs]", e)
    const message = e instanceof Error ? e.message : "Server error"
    if (message.includes("DATABASE_URL")) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(): Promise<Response> {
  const { userId, orgId: clerkOrgId } = await auth()
  if (!userId || !clerkOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const db = getDb()
    const orgRow = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.clerkOrgId, clerkOrgId))
      .limit(1)

    if (!orgRow.length) {
      return NextResponse.json({ jobs: [] })
    }

    const rows = await db
      .select({
        id: voiceJobs.id,
        type: voiceJobs.type,
        status: voiceJobs.status,
        createdAt: voiceJobs.createdAt,
      })
      .from(voiceJobs)
      .where(eq(voiceJobs.orgId, orgRow[0].id))
      .orderBy(desc(voiceJobs.createdAt))
      .limit(50)

    return NextResponse.json({ jobs: rows })
  } catch (e) {
    console.error("[voice-jobs GET]", e)
    return NextResponse.json({ jobs: [] })
  }
}
