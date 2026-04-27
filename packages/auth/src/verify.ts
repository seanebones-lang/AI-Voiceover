import { verifyToken } from "@clerk/backend"

/**
 * Verify a Clerk-issued JWT (Bearer) for API routes.
 * Returns Clerk user id (`sub`) if valid.
 */
export async function verifyBearerToken(token: string): Promise<{ userId: string } | null> {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey || !token) return null
  try {
    const payload = await verifyToken(token, { secretKey })
    const sub = typeof payload.sub === "string" ? payload.sub : null
    if (!sub) return null
    return { userId: sub }
  } catch {
    return null
  }
}

/** Placeholder: map verified user to org membership (resolved in app layer with DB). */
export async function verifyBearerForOrg(
  _token: string,
  _orgId: string
): Promise<{ userId: string } | null> {
  return verifyBearerToken(_token)
}
