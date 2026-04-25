import { SignUp } from "@clerk/nextjs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Authentication not configured</CardTitle>
            <CardDescription>
              Set Clerk environment variables before using sign-up (see <code className="text-xs">.env.example</code>
              ).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-purple-50 to-blue-50 dark:from-slate-900 dark:via-purple-900/20 dark:to-slate-900">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Sign up for VoiceClone AI.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <SignUp routing="path" path="/sign-up" signInUrl="/login" />
        </CardContent>
      </Card>
    </div>
  )
}
