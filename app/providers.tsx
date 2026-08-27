"use client";

import { useEffect } from "react";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { api } from "@/convex/_generated/api";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Creates the `users` row the moment a visitor is authenticated.
 *
 * Every gated function goes through `requireUser`, which resolves a Clerk subject
 * to a row and throws NOT_AUTHENTICATED when there isn't one — so without this,
 * a signed-in visitor with no row is indistinguishable from a signed-out one and
 * can never spin. It sits at the provider so it is not a page's responsibility to
 * remember, and the effect runs on the false→true auth transition rather than on
 * every render. `ensureUser` is itself idempotent: an existing row is patched
 * with lastLoginAt, never duplicated.
 *
 * It does NOT collect country, region or birthDate. Those fields stay empty, so
 * `assertEligible` still refuses the spin — see the note in convex/eligibility.ts.
 * A profile-capture flow is real work, not something to improvise here.
 */
function EnsureUserRow() {
  const { isAuthenticated } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensureUser);

  useEffect(() => {
    if (!isAuthenticated) return;
    void ensureUser({}).catch((error) => {
      // Nothing to show the visitor here — the failure surfaces as a typed error
      // on the action they actually took (spin, accept rules) with its own copy.
      console.error("ensureUser failed", error);
    });
  }, [isAuthenticated, ensureUser]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <EnsureUserRow />
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
