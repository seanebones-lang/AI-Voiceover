import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import type { NextAuthConfig } from "next-auth"

export const config = {
  // Trust the host in production (Railway, Vercel, etc.)
  trustHost: true,
  
  // Secret for JWT signing and encryption (must be set via NEXTAUTH_SECRET or AUTH_SECRET env var)
  // In NextAuth v5, secret is read from environment variable automatically
  // Generate with: openssl rand -base64 32
  
  // JWT Security Configuration
  session: {
    strategy: 'jwt' as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // Update session every 24 hours
  },
  
  // Cookie Configuration
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' 
        ? '__Secure-next-auth.session-token' 
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        // Domain should be set in production
        ...(process.env.NODE_ENV === 'production' && process.env.COOKIE_DOMAIN
          ? { domain: process.env.COOKIE_DOMAIN }
          : {}),
      },
    },
  },
  
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // SECURITY: Hardcoded credentials removed
        // TODO: Implement proper authentication:
        // 1. Query user from database
        // 2. Verify password with bcrypt
        // 3. Implement rate limiting on login attempts
        // 4. Add account lockout after failed attempts
        // 5. Use secure session management
        
        // For now, authentication is disabled for security
        // Enable Google OAuth or implement proper database auth
        console.warn('⚠️  Credentials authentication disabled - implement proper auth')
        return null
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard")
      if (isOnDashboard) {
        if (isLoggedIn) return true
        return false // Redirect unauthenticated users to login page
      } else if (isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl))
      }
      return true
    },
    // JWT callback for custom token handling
    async jwt({ token, user, account }) {
      // Initial sign in
      if (user) {
        token.id = user.id
        token.email = user.email
      }
      
      // Add account info for OAuth providers
      if (account) {
        token.provider = account.provider
        token.providerAccountId = account.providerAccountId
      }
      
      return token
    },
    // Session callback
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as string
      }
      return session
    },
  },
} satisfies NextAuthConfig

export const { handlers, auth, signIn, signOut } = NextAuth(config)
