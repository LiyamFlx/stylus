/**
 * Whether Clerk is configured in this build (ADR 002 — sign-in is opt-in,
 * the app must be fully functional without it). Missing the publishable key
 * is a normal state, not an error: local dev without `vercel env pull`, or
 * any environment that hasn't set up Clerk yet, boots straight into the
 * existing local-only experience with zero sync — never a crash.
 */
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

export const isClerkConfigured = Boolean(CLERK_PUBLISHABLE_KEY);
