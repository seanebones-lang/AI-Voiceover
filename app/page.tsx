import dynamic from 'next/dynamic'
import { SkipLink } from '@/components/skip-link'

// Lazy load dashboard for code splitting
const Dashboard = dynamic(() => import('@/components/dashboard').then(mod => ({ default: mod.Dashboard })), {
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="text-slate-400">Loading...</div>
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
