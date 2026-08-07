import { ImageResponse } from "next/og";
import { BRAND } from "@/app/lib/brand.ts";
import { formatMoney, formatOdds } from "@/app/lib/tiers.ts";
import { CURRENT_CAMPAIGN, CURRENT_ODDS } from "@/app/lib/currentCampaign.ts";

export const alt = `${BRAND.name} — ten free spins every day, no purchase necessary`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The social preview card.
 *
 * A shared link previewed as a bare URL, which for a product whose main obstacle
 * is being mistaken for a scam is actively expensive — a link with no card looks
 * like a link nobody vouches for.
 *
 * Deliberately shows no reels. Rendering three tiles here would either need the
 * icon set (unavailable in Satori without embedding each SVG) or fall back to
 * Unicode glyphs, and three sevens on a social card would imply a jackpot that
 * has not happened.
 *
 * Known limitation: this uses the bundled default face, not Archivo, because
 * ImageResponse cannot read next/font and fetching a font at build time would make
 * the build depend on the network. The world carries through colour and layout
 * instead. Worth revisiting once a font file lives in the repo.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          backgroundColor: "#0d4a4e",
          // The tungsten key from high left, as in the studio itself.
          backgroundImage:
            "radial-gradient(44% 58% at 13% 6%, rgba(240,168,72,0.42) 0%, rgba(240,168,72,0.13) 38%, rgba(240,168,72,0) 72%)",
          color: "#e8e2d4",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              backgroundColor: "#d6301f",
            }}
          />
          <div
            style={{
              fontSize: 24,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "#e8e2d4",
            }}
          >
            Live
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 104,
              lineHeight: 1,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: -2,
            }}
          >
            10 free spins
          </div>
          <div
            style={{
              fontSize: 104,
              lineHeight: 1,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: -2,
            }}
          >
            every day
          </div>
          {/* One string child on purpose: Satori requires an explicit
              display:flex on any element with more than one child, and this line
              is prose rather than a layout row. */}
          <div style={{ marginTop: 28, fontSize: 34, color: "#a8bfbc" }}>
            {/* No separate value: prizeTitle already carries it, and printing
                "$100 gift card · $100" repeats the amount on one line. */}
            {`Win the ${CURRENT_CAMPAIGN.prizeTitle} · odds ${formatOdds(CURRENT_ODDS)}`}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 24, color: "#a8bfbc", maxWidth: 760 }}>
            No purchase necessary. A purchase will not increase your chances of
            winning.
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            {BRAND.name}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
