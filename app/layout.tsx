import type { Metadata } from "next"
import { StrictMode } from "react"
import "@fontsource-variable/inter"
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
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head />
      <body className="font-sans antialiased">
        <StrictMode>
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
        </StrictMode>
      </body>
    </html>
  )
}
