'use client'

import dynamic from 'next/dynamic'
import { SkipLink } from '@/components/skip-link'

// Lazy load dashboard for code splitting
const Dashboard = dynamic(() => import('@/components/dashboard').then(mod => ({ default: mod.Dashboard })), {
  loading: () => (
    <div
      className="min-h-screen flex items-center justify-center bg-slate-950"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="text-slate-400 flex items-center gap-2">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-slate-400" aria-hidden="true" />
        Loading…
      </div>
    </div>
  ),
  ssr: false,
})

export default function Home() {
  return (
    <>
      <SkipLink />
      <main id="main-content">
        <Dashboard />
      </main>
    </>
  )
}
