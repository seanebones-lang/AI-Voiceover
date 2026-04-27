import { NextResponse } from 'next/server'

export type ApiErrorBody = {
  error: string
  code?: string
  requestId?: string
  hint?: string
  /** Extra context for operators (e.g. upstream message); avoid displaying raw secrets. */
  details?: string
}

/**
 * JSON error responses with optional stable `code` for clients and `X-Request-Id` when provided.
 */
export function jsonApiError(
  status: number,
  message: string,
  opts?: { code?: string; requestId?: string; hint?: string; details?: string }
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = { error: message }
  if (opts?.code) body.code = opts.code
  if (opts?.requestId) body.requestId = opts.requestId
  if (opts?.hint) body.hint = opts.hint
  if (opts?.details) body.details = opts.details
  const headers = new Headers()
  if (opts?.requestId) headers.set('X-Request-Id', opts.requestId)
  return NextResponse.json(body, { status, headers })
}
