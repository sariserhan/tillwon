import type { Metadata } from "next";
import { Archivo, Public_Sans } from "next/font/google";
import "./globals.css";

// Archivo carries a width axis; the broadcast titling voice lives at its
// expanded end. Public Sans is the civic register — a public draw, in the
// typeface public communication actually uses.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

/**
 * The direction contract, emitted into the markup so the built page can be
 * audited against the world it was committed to.
 *
 * A static literal with no interpolation and no request-, user-, or
 * config-derived content. Nothing may ever be concatenated into this string —
 * the moment it takes a dynamic value it becomes an injection sink.
 */
const DIRECTION_CONTRACT = `<!--
THESIS: A draw the visitor watches happen in the open. Refuses the casino-app
  arrangement and the trustworthy-fintech dodge alike.
OWN-WORLD: A civic broadcast studio. Drenched teal-petrol cyclorama under one
  directional tungsten key; brushed aluminium, cream enamel split-flap tiles, a
  filament tally lamp in signal red that means live and nothing else. Archivo at
  its expanded width over Public Sans.
STORY: This is a real prize, drawn in public, free to enter - so spin.
FIRST VIEWPORT: Prize lit as the programme's subject; apparatus and action
  compressed into a dense broadcast graphics band across the lower third; tally
  lamp top-left, wax-sealed commitment top-right; compliance caption on the
  bottom edge.
FORM: The Public Draw, Broadcast Live; candidate 5 of 7; seed 6d9531b0.
FINISH: unreviewed and undocumented is unfinished; this build ends with the
  finish review, the verdict, and DESIGN.md
-->`;

export const metadata: Metadata = {
  title: "SpinDrop — 10 free spins every day",
  description:
    "Spin for a chance to win the current sponsored prize. No purchase necessary.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${publicSans.variable}`}>
        {/* A JSX comment is a JavaScript comment: React never emits it, so the
            contract would exist only in source maps. This renders it into the
            markup itself, where a build can be audited against it. */}
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        {children}
      </body>
    </html>
  );
}
