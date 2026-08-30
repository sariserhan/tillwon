"use client";

import { SignIn } from "@clerk/nextjs";

/**
 * Clerk's prebuilt sign-in widget, themed to sit on the studio background rather
 * than Clerk's own default light theme. Client-only because `<SignIn />` needs
 * browser APIs Clerk's SDK provides — kept in its own file so `page.tsx` can stay
 * a Server Component and export `metadata` (a "use client" file cannot).
 */
export function SignInCard() {
  return (
    <SignIn
      routing="hash"
      appearance={{
        variables: {
          colorPrimary: "#f0a848", // tungsten
          colorBackground: "#ece7db", // paper
          colorForeground: "#14100c", // ink
          colorInput: "#ffffff",
          colorInputForeground: "#14100c",
          colorBorder: "#d6cfbe", // paper-edge
          fontFamily: "var(--font-public-sans), sans-serif",
          borderRadius: "3px",
        },
      }}
    />
  );
}
