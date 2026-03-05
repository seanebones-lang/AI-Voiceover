import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { StrictMode } from "react"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { ErrorBoundary } from "@/components/error-boundary"
import { WebVitalsTracker } from "@/components/web-vitals-tracker"

// Optimize font loading
const inter = Inter({ 
  subsets: ["latin"],
  display: 'swap', // Prevent invisible text during font load
  preload: true,
  variable: '--font-inter',
})

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
      <head>
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={inter.className}>
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
