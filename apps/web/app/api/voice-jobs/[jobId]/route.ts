import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { and, eq } from "drizzle-orm"
import { getDb, organizations, voiceJobs } from "@ai-voiceover/db"

export const runtime = "nodejs"

async function getOrgInternalId(clerkOrgId: string | null) {
  if (!clerkOrgId) return null
  const db = getDb()
  const row = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.clerkOrgId, clerkOrgId))
    .limit(1)
  return row[0]?.id ?? null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  let userId: string | null | undefined = null
  let clerkOrgId: string | null | undefined = null
  try {
    const authState = await auth()
    userId = authState.userId
    clerkOrgId = authState.orgId
  } catch (e) {
    console.error("[voice-jobs/:id auth GET]", e)
    return NextResponse.json(
      { error: "Auth service unavailable", details: e instanceof Error ? e.message : "Unknown auth error" },
      { status: 503 }
    )
  }
  if (!userId || !clerkOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgId = await getOrgInternalId(clerkOrgId)
  if (!orgId) return NextResponse.json({ error: "Organization not provisioned" }, { status: 400 })

  const { jobId } = await params
  const db = getDb()
  const rows = await db
    .select({
      id: voiceJobs.id,
      type: voiceJobs.type,
      status: voiceJobs.status,
      payload: voiceJobs.payload,
      result: voiceJobs.result,
      errorMessage: voiceJobs.errorMessage,
      createdAt: voiceJobs.createdAt,
      updatedAt: voiceJobs.updatedAt,
    })
    .from(voiceJobs)
    .where(and(eq(voiceJobs.id, jobId), eq(voiceJobs.orgId, orgId)))
    .limit(1)

  if (!rows.length) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  const job = rows[0]
  return NextResponse.json({
    ...job,
    resumable: ["queued", "running"].includes(job.status),
    terminal: ["succeeded", "failed", "cancelled"].includes(job.status),
  })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  let userId: string | null | undefined = null
  let clerkOrgId: string | null | undefined = null
  try {
    const authState = await auth()
    userId = authState.userId
    clerkOrgId = authState.orgId
  } catch (e) {
    console.error("[voice-jobs/:id auth DELETE]", e)
    return NextResponse.json(
      { error: "Auth service unavailable", details: e instanceof Error ? e.message : "Unknown auth error" },
      { status: 503 }
    )
  }
  if (!userId || !clerkOrgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgId = await getOrgInternalId(clerkOrgId)
  if (!orgId) return NextResponse.json({ error: "Organization not provisioned" }, { status: 400 })

  const { jobId } = await params
  const db = getDb()
  const rows = await db
    .update(voiceJobs)
    .set({
      status: "cancelled",
      errorMessage: "Cancelled by user",
      updatedAt: new Date(),
    })
    .where(and(eq(voiceJobs.id, jobId), eq(voiceJobs.orgId, orgId)))
    .returning({ id: voiceJobs.id, status: voiceJobs.status })

  if (!rows.length) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }
  return NextResponse.json(rows[0])
}
