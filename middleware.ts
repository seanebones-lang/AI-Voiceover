import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  // Public routes that don't require auth
  const publicRoutes = ["/", "/api/tts", "/api/voices"]
  
  if (publicRoutes.some(route => req.nextUrl.pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Protected routes require auth
  if (!req.auth && req.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
