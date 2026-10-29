/**
 * Railway worker: consumes BullMQ `voice` queue jobs created by the web app.
 * Set REDIS_URL (and DATABASE_URL if jobs persist results to Postgres).
 */
import { Worker } from "bullmq"
import { Redis } from "ioredis"
import { eq } from "drizzle-orm"
import { getDb, voiceJobs } from "@ai-voiceover/db"
import { runTtsJob } from "./tts-job.js"

const redisUrl = process.env.REDIS_URL
if (!redisUrl) {
  console.error("[workers] REDIS_URL is required")
  process.exit(1)
}

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null })

const worker = new Worker(
  "voice",
  async (job) => {
    const { rowId, type } = job.data as { rowId?: string; type?: string }
    if (!rowId) {
      console.warn("[workers] job missing rowId", job.id)
      // Mark job as failed since we can't process it
      const db = getDb()
      await db
        .update(voiceJobs)
        .set({
          status: "failed",
          errorMessage: "Job missing rowId",
          updatedAt: new Date(),
        })
        .where(eq(voiceJobs.id, rowId ?? ''))
      return
    }

    const db = getDb()
    await db
      .update(voiceJobs)
      .set({
        status: "running",
        updatedAt: new Date(),
        bullmqJobId: String(job.id),
      })
      .where(eq(voiceJobs.id, rowId))

    try {
      if (type !== "tts") {
        // Cloning needs uploaded audio and runs synchronously via /api/clone-voice.
        throw new Error(`Job type "${type}" is not supported by the worker; use /api/clone-voice for cloning`)
      }
      const [row] = await db.select({ payload: voiceJobs.payload }).from(voiceJobs).where(eq(voiceJobs.id, rowId)).limit(1)
      await job.updateProgress(5)
      const result = await runTtsJob(row?.payload ?? {}, {
        jobId: String(job.id),
        onProgress: (pct) => job.updateProgress(pct),
        isCancelled: async () => {
          const [cur] = await db.select({ status: voiceJobs.status }).from(voiceJobs).where(eq(voiceJobs.id, rowId)).limit(1)
          return cur?.status === "cancelled"
        },
      })
      if (!result) {
        console.log("[workers] job cancelled", rowId)
        return
      }
      await job.updateProgress(100)

      await db
        .update(voiceJobs)
        .set({
          status: "succeeded",
          result: result as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(voiceJobs.id, rowId))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db
        .update(voiceJobs)
        .set({
          status: "failed",
          errorMessage: message,
          updatedAt: new Date(),
        })
        .where(eq(voiceJobs.id, rowId))
      // Do NOT re-throw - let the job naturally complete
    }
  },
  { connection }
)

worker.on("failed", (job, err) => {
  console.error("[workers] job failed", job?.id, err)
})

console.log("[workers] voice queue worker started")
