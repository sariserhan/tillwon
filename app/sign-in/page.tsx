import type { Metadata } from "next";
import { SiteHeader } from "@/app/components/SiteHeader";
import { SiteFooter } from "@/app/components/SiteFooter";
import { BRAND } from "@/app/lib/brand.ts";
import { SignInCard } from "./SignInCard";

export const metadata: Metadata = {
  title: `Sign in — ${BRAND.name}`,
  description: "Sign in with an email link. No password, ever.",
};

/**
 * Email-link sign-in via Clerk's prebuilt widget. No password field exists to
 * phish, so — unlike the placeholder this replaced — a form here is safe to show.
 */
export default function SignInPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-studio-900">
      <SiteHeader />

      <main
        id="content"
        className="studio-light flex flex-1 items-center justify-center px-4 py-16 sm:px-6"
      >
        <div className="flex flex-col items-center gap-6">
          <h1 className="font-display text-center text-[clamp(1.4rem,3.6vw,2rem)] uppercase leading-[1.04] text-enamel">
            Sign in
          </h1>
          <SignInCard />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
