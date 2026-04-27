import type { Metadata } from "next"
import { StrictMode } from "react"
import { ClerkProvider } from "@clerk/nextjs"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { ErrorBoundary } from "@/components/error-boundary"
import { WebVitalsTracker } from "@/components/web-vitals-tracker"

export const metadata: Metadata = {
  title: "VoiceClone AI - Enterprise TTS & Voice Cloning",
  description: "Studio-quality text-to-speech and voice cloning. 100% self-hosted, no external APIs required.",
  keywords: ["TTS", "text-to-speech", "voice cloning", "AI voice", "voice synthesis"],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const clerkPk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  const shell = (
    <ErrorBoundary>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        disableTransitionOnChange
      >
        <WebVitalsTracker />
        {children}
      </ThemeProvider>
    </ErrorBoundary>
  )

  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body>
        <StrictMode>
          {clerkPk ? (
            <ClerkProvider publishableKey={clerkPk}>{shell}</ClerkProvider>
          ) : (
            shell
          )}
        </StrictMode>
      </body>
    </html>
  )
}
