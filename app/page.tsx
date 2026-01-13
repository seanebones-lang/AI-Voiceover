import { redirect } from 'next/navigation'

export default function Home() {
  // Redirect to the full-featured static HTML frontend
  redirect('/index.html')
}
