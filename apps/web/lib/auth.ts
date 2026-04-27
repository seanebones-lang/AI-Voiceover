/**
 * Auth barrel for Clerk (replaces legacy NextAuth).
 * Use `auth()` / `currentUser()` in Server Components and Route Handlers.
 */
export { auth, currentUser } from "@clerk/nextjs/server"
export {
  SignIn,
  SignUp,
  UserButton,
  OrganizationSwitcher,
  SignOutButton,
} from "@clerk/nextjs"
