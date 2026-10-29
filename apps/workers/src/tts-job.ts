/**
 * Long-form TTS for queued jobs. Splits a script at paragraph/sentence boundaries, renders
 * each part on the self-hosted voice service (no gateway timeout here, so parts can be much
 * larger than the synchronous /api/tts limit), and joins the MP3 parts (CBR, no Xing header,
 * so concatenation is seamless).
 */

const VOICE_SERVICE_URL = (process.env.XTTS_URL || process.env.XTTS_SIDECAR_URL || "http://localhost:8081").replace(/\/$/, "")
const PART_CHARS = Number(process.env.WORKER_TTS_PART_CHARS || 4500)
const PART_TIMEOUT_MS = Number(process.env.WORKER_TTS_PART_TIMEOUT_MS || 20 * 60_000)
const MAX_SCRIPT_CHARS = 200_000
const MAX_RESULT_BYTES = 25 * 1024 * 1024

const PASSTHROUGH_KEYS = [
  "language", "speed", "pitch", "volume", "reverb", "echo", "noise_reduction", "special_effect",
  "mastering_enabled", "mastering_profile", "clone_preset", "temperature", "repetition_penalty",
  "top_k", "top_p",
] as const

export interface TtsJobPayload {
  text: string
  voice_id: string
  [key: string]: unknown
}

export interface TtsJobResult {
  ok: true
  contentType: "audio/mpeg"
  audioBase64: string
  bytes: number
  durationSec: number
  parts: number
  characters: number
  engine: string | null
}

export function parseTtsPayload(payload: Record<string, unknown>): TtsJobPayload {
  const text = typeof payload.text === "string" ? payload.text.replace(/\r\n?/g, "\n").trim() : ""
  const voiceId = typeof payload.voice_id === "string" ? payload.voice_id : ""
  if (!text) throw new Error("payload.text is required")
  if (text.length > MAX_SCRIPT_CHARS) throw new Error(`payload.text exceeds ${MAX_SCRIPT_CHARS} characters`)
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(voiceId)) throw new Error("payload.voice_id is missing or invalid")
  return { ...payload, text, voice_id: voiceId }
}

/** Group paragraphs into parts of at most `limit` chars; oversized paragraphs split on sentences, then words. */
export function splitScript(text: string, limit: number = PART_CHARS): string[] {
  const pieces: string[] = []
  for (const para of text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
    if (para.length <= limit) {
      pieces.push(para)
      continue
    }
    let cur = ""
    const sentences = para.match(/[^.!?。！？]+[.!?。！？]+["')\]]*\s*|[^.!?。！？]+$/g) ?? [para]
    for (const raw of sentences) {
      const words = raw.length > limit ? raw.split(/(?<=\s)/) : [raw]
      for (const w of words) {
        if (cur && cur.length + w.length > limit) {
          pieces.push(cur.trim())
          cur = ""
        }
        cur += w
      }
    }
    if (cur.trim()) pieces.push(cur.trim())
  }
  const parts: string[] = []
  let cur = ""
  for (const p of pieces) {
    if (cur && cur.length + 2 + p.length > limit) {
      parts.push(cur)
      cur = p
    } else {
      cur = cur ? `${cur}\n\n${p}` : p
    }
  }
  if (cur) parts.push(cur)
  return parts
}

async function renderPart(payload: TtsJobPayload, text: string, requestId: string) {
  const body: Record<string, unknown> = { text, voice_id: payload.voice_id, output_format: "mp3" }
  for (const k of PASSTHROUGH_KEYS) if (payload[k] !== undefined) body[k] = payload[k]
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PART_TIMEOUT_MS)
  try {
    const res = await fetch(`${VOICE_SERVICE_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: unknown }
      throw new Error(`Voice service ${res.status}: ${typeof err.detail === "string" ? err.detail : "synthesis failed"}`)
    }
    return {
      audio: Buffer.from(await res.arrayBuffer()),
      duration: Number(res.headers.get("x-audio-duration") || 0),
      engine: res.headers.get("x-engine"),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function runTtsJob(
  rawPayload: Record<string, unknown>,
  opts: { jobId: string; onProgress: (pct: number) => Promise<void>; isCancelled: () => Promise<boolean> }
): Promise<TtsJobResult | null> {
  const payload = parseTtsPayload(rawPayload)
  const parts = splitScript(payload.text)
  const audio: Buffer[] = []
  let duration = 0
  let engine: string | null = null
  let bytes = 0
  for (let i = 0; i < parts.length; i++) {
    if (await opts.isCancelled()) return null
    const out = await renderPart(payload, parts[i], `${opts.jobId}-p${i + 1}`)
    bytes += out.audio.length
    if (bytes > MAX_RESULT_BYTES) throw new Error("Rendered audio exceeds 25 MB; split the script into several jobs")
    audio.push(out.audio)
    duration += out.duration
    engine = engine ?? out.engine
    await opts.onProgress(Math.round(((i + 1) / parts.length) * 95))
  }
  const joined = Buffer.concat(audio)
  return {
    ok: true,
    contentType: "audio/mpeg",
    audioBase64: joined.toString("base64"),
    bytes: joined.length,
    durationSec: Math.round(duration * 100) / 100,
    parts: parts.length,
    characters: payload.text.length,
    engine,
  }
}
