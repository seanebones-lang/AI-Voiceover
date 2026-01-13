import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  // Public routes that don't require auth
  const publicRoutes = [
    "/",
    "/login",
    "/api/tts",
    "/api/voices",
    "/api/clone",
    "/api/clone-voice",
    "/playground",
    "/index.html",
  ]
  
  const pathname = req.nextUrl.pathname
  
  // Allow public routes
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + "/"))) {
    return NextResponse.next()
  }

  // Protected routes require auth
  if (!req.auth && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
