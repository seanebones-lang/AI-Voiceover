import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { signIn } from '@/lib/auth'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50 dark:from-slate-900 dark:via-purple-900/20 dark:to-slate-900">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>
            Sign in to access VoiceClone AI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            action={async () => {
              'use server'
              await signIn('google')
            }}
          >
            <Button type="submit" className="w-full">
              Sign in with Google
            </Button>
          </form>
          <div className="text-center text-sm text-muted-foreground">
            Demo: demo@example.com / demo123
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
