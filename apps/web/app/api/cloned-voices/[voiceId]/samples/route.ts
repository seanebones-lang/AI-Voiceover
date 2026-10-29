import { NextRequest, NextResponse } from 'next/server'
import { denyUnlessMutableApiAuthorized } from '@/lib/api-access'
import { cloneRateLimiter } from '@/lib/rate-limit'
import { config } from '@/lib/config'
import { validateAudioFile, extractClientIP, voiceIdSchema } from '@/lib/validation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/** Add more reference takes to an existing cloned voice (forwarded to the voice service). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ voiceId: string }> }) {
  const denied = denyUnlessMutableApiAuthorized(request)
  if (denied) return denied

  const { voiceId } = await params
  if (!voiceId.startsWith('clone_') || !voiceIdSchema.safeParse(voiceId).success) {
    return NextResponse.json({ error: 'Invalid cloned voice id' }, { status: 400 })
  }

  const { success, reset } = await cloneRateLimiter.limit(extractClientIP(request))
  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded for voice cloning', retryAfter: Math.ceil((reset - Date.now()) / 1000) },
      { status: 429 }
    )
  }

  if (config.isRailway && !config.xttsConfigured) {
    return NextResponse.json({ error: 'Voice service not configured (set XTTS_URL)' }, { status: 503 })
  }

  const formData = await request.formData()
  const files = formData.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: 'At least one audio file is required' }, { status: 400 })
  if (files.length > 5) return NextResponse.json({ error: 'Maximum 5 files per upload' }, { status: 400 })
  if (files.reduce((n, f) => n + f.size, 0) > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'Total upload exceeds 50MB' }, { status: 400 })
  }
  for (const file of files) {
    const v = validateAudioFile(file)
    if (!v.valid) return NextResponse.json({ error: `Invalid file ${file.name}: ${v.error}` }, { status: 400 })
  }

  const upstream = new FormData()
  for (const file of files) upstream.append('files', file, file.name)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 240_000)
  try {
    const res = await fetch(`${config.services.xtts.url}/voices/${encodeURIComponent(voiceId)}/samples`, {
      method: 'POST',
      body: upstream,
      signal: controller.signal,
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const detail = typeof data.detail === 'string' ? data.detail : `Voice service returned ${res.status}`
      return NextResponse.json({ error: detail }, { status: res.status })
    }
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: 'Voice service unavailable', details: err instanceof Error ? err.message : String(err) },
      { status: 503 }
    )
  } finally {
    clearTimeout(timer)
  }
}
