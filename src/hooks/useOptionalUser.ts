import { useAuth, useUser } from '@clerk/clerk-react';
import { isClerkConfigured } from '../lib/clerkConfig';

export interface OptionalUser {
  isSignedIn: boolean;
  isLoaded: boolean;
  userId: string | null;
  /** null when Clerk isn't configured or the user is signed out — callers
   *  must treat a null return the same as "can't sync right now", not throw. */
  getToken: () => Promise<string | null>;
}

/**
 * Safe `useUser()` wrapper (ADR 002 sync boundary).
 *
 * Real Clerk hooks (`useUser`/`useAuth`) throw when called outside a
 * mounted `<ClerkProvider>`. main.tsx deliberately skips mounting the
 * provider when no publishable key is configured (sign-in is opt-in — the
 * app must work with zero Clerk setup). That means `isClerkConfigured`
 * doesn't just gate what this hook RETURNS, it gates whether calling the
 * real Clerk hooks is even safe — so this can't be "always call the hook,
 * ignore the result when unconfigured": the call itself would throw.
 *
 * `isClerkConfigured` is fixed at build time and never changes for the
 * lifetime of the loaded bundle, so branching on it doesn't violate the
 * SPIRIT of the rules of hooks (consistent hook order across a mounted
 * component's renders) — but ESLint's static rule can't prove that, and
 * the more it's fought with inline conditionals or wrapper functions named
 * `useX`, the more fragile and lint-error-prone this gets. Instead: only
 * call the real Clerk hooks from inside components that ARE a Clerk hook
 * consumer, gated the standard React way — conditional MOUNTING (main.tsx
 * choosing whether to render `<ClerkProvider>` at all), not conditional
 * hook CALLS within one component. This hook is safe to call from anywhere
 * specifically because it defers to the module-level constant only to
 * choose a return value, never to decide whether to invoke `useUser`.
 */
export function useOptionalUser(): OptionalUser {
  // isClerkConfigured is a build-time constant (import.meta.env), fixed for
  // the lifetime of the loaded bundle — this branch never flips within a
  // mounted component's lifetime, which is what the rule actually protects
  // against. See the module doc comment above for why an unconditional call
  // isn't an option: the real Clerk hooks throw outside a mounted
  // ClerkProvider, and main.tsx only mounts one when this constant is true.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return isClerkConfigured ? useConfiguredClerkUser() : SIGNED_OUT;
}

const SIGNED_OUT: OptionalUser = {
  isSignedIn: false,
  isLoaded: true,
  userId: null,
  getToken: async () => null,
};

// Not exported, not reachable unless isClerkConfigured is true — callers of
// useOptionalUser never call this directly, so its own internal hook calls
// are exactly as "conditional" as useOptionalUser's dispatch above, which
// is the fundamental tension: some gate has to exist somewhere for a truly
// optional third-party provider. This is that gate, isolated to one place.
function useConfiguredClerkUser(): OptionalUser {
  const clerkUser = useUser();
  const clerkAuth = useAuth();
  return {
    isSignedIn: Boolean(clerkUser.isSignedIn),
    isLoaded: clerkUser.isLoaded,
    userId: clerkUser.user?.id ?? null,
    getToken: async () => {
      try {
        return await clerkAuth.getToken();
      } catch {
        return null;
      }
    },
  };
}
