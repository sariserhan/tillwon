import type { Metadata } from "next";
import Link from "next/link";
import { DocumentShell } from "@/app/components/DocumentShell";
import { BRAND } from "@/app/lib/brand.ts";

export const metadata: Metadata = {
  title: `Sign in — ${BRAND.name}`,
  description: "Sign-in arrives with the backend. Nothing here collects credentials.",
};

/**
 * Placeholder, deliberately inert.
 *
 * The header links here, so a 404 was the alternative. It shows no form at all:
 * a non-functional sign-in form that looks real is a phishing pattern, and this
 * product cannot afford to train its visitors to type an email into something
 * that does nothing.
 */
export default function SignInPage() {
  return (
    <DocumentShell
      title="Sign in"
      standfirst="Accounts are not live yet."
      draftNotice="Authentication is not built. This page exists so the header link resolves, and it deliberately shows no form — a sign-in form that does nothing is indistinguishable from a phishing page."
    >
      <section>
        <h2>What is coming</h2>
        <p>
          Signing in will use an email magic link, Google, or Apple. You will never
          need a password, and {BRAND.name} will never ask you for payment details —
          there is nothing to pay for.
        </p>
      </section>

      <section>
        <h2>In the meantime</h2>
        <p>
          The campaign surface is live and you can see the draw, the prize, the
          odds, and how the winner is determined without an account.
        </p>
        <ul>
          <li>
            <Link href="/" className="underline">
              The current draw
            </Link>
          </li>
          <li>
            <Link href="/rules" className="underline">
              Official Rules
            </Link>
          </li>
          <li>
            <Link href="/winners" className="underline">
              Winners
            </Link>
          </li>
        </ul>
      </section>
    </DocumentShell>
  );
}
