import { Queue } from "bullmq"
import { Redis } from "ioredis"

let voiceQueue: Queue | null = null

export function getVoiceQueue(): Queue | null {
  const url = process.env.REDIS_URL
  if (!url) return null
  if (!voiceQueue) {
    const connection = new Redis(url, { maxRetriesPerRequest: null })
    voiceQueue = new Queue("voice", { connection })
  }
  return voiceQueue
}
