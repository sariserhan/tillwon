"use client";

import { use, useState } from "react";
import { useQuery, useAction } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AuthErrorBoundary } from "@/app/components/AuthErrorBoundary";
import { friendlyErrorMessage } from "@/app/lib/convexError";

const REGISTRATION_THRESHOLD_CENTS = 500_000;

function CampaignDetail({ campaignId }: { campaignId: Id<"campaigns"> }) {
  const detail = useQuery(api.campaignAdmin.getCampaignDetail, { campaignId });
  const activate = useAction(api.campaignAdmin.activate);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  if (detail === undefined) return <p style={{ padding: 24 }}>Loading…</p>;

  const { campaign, sponsorName, prizeTitle, prizeValueCents } = detail;
  const isTier5Or6 = (prizeValueCents ?? 0) >= REGISTRATION_THRESHOLD_CENTS;

  const onActivate = async () => {
    if (
      !window.confirm(
        "Activate this campaign? This seals the cryptographic commitment and makes the campaign live immediately. This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await activate({ campaignId });
      router.push("/admin");
    } catch (e) {
      setMessage(friendlyErrorMessage(e, "Activation failed."));
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 640 }}>
      <h1>{campaign.title}</h1>
      <p>Status: {campaign.status}</p>
      <p>Slug: {campaign.slug}</p>
      <p>Sponsor: {sponsorName}</p>
      <p>Prize: {prizeTitle}</p>
      <p>Daily spins: {campaign.dailySpins}</p>
      <p>
        Reset: {campaign.resetHour}:00 {campaign.resetTimezone}
      </p>
      <p>Target volume / stated odds: 1 in {campaign.oddsDenominator}</p>
      <p>Shard count: {campaign.shardCount}</p>
      <p>Reel columns: {campaign.reelColumns}</p>
      <p>Disqualification policy: {campaign.disqualificationPolicy}</p>

      {isTier5Or6 && (
        <p style={{ padding: 12, border: "1px solid #900", marginTop: 16 }}>
          This prize is $5,000 or more — NY/FL registration and bonding apply, and
          this system does not yet enforce a hard end date for that requirement
          (see ROADMAP.md). Confirm this has been handled outside the app before
          activating.
        </p>
      )}

      {message && <p role="alert">{message}</p>}

      {campaign.status === "draft" && (
        <button type="button" onClick={onActivate} disabled={busy} style={{ marginTop: 16 }}>
          {busy ? "Activating…" : "Activate"}
        </button>
      )}
    </div>
  );
}

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);
  return (
    <AuthErrorBoundary>
      <CampaignDetail campaignId={campaignId as Id<"campaigns">} />
    </AuthErrorBoundary>
  );
}
