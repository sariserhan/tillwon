"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AuthErrorBoundary } from "@/app/components/AuthErrorBoundary";
import { friendlyErrorMessage } from "@/app/lib/convexError";
import { resolveTier, defaultOddsDenominator } from "@/convex/lib/tiers.ts";

type FulfillmentType = "physical" | "digital" | "experience";
type DisqualificationPolicy = "resume_campaign" | "select_alternate" | "end_campaign";

function NewCampaignForm() {
  const prizes = useQuery(api.campaignAdmin.listPrizes, {});
  const createDraftCampaign = useMutation(api.campaignAdmin.createDraftCampaign);
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dailySpins, setDailySpins] = useState("10");
  const [resetTimezone, setResetTimezone] = useState("UTC");
  const [resetHour, setResetHour] = useState("0");
  const [targetVolume, setTargetVolume] = useState("1000");
  const [disqualificationPolicy, setDisqualificationPolicy] =
    useState<DisqualificationPolicy>("resume_campaign");
  const [rulesContent, setRulesContent] = useState("");

  const [prizeMode, setPrizeMode] = useState<"existing" | "new">("new");
  const [existingPrizeId, setExistingPrizeId] = useState("");

  const [sponsorName, setSponsorName] = useState("");
  const [sponsorWebsiteUrl, setSponsorWebsiteUrl] = useState("");
  const [sponsorCtaLabel, setSponsorCtaLabel] = useState("");
  const [sponsorCtaUrl, setSponsorCtaUrl] = useState("");
  const [sponsorDescription, setSponsorDescription] = useState("");
  const [sponsorContactName, setSponsorContactName] = useState("");
  const [sponsorContactEmail, setSponsorContactEmail] = useState("");
  const [prizeTitle, setPrizeTitle] = useState("");
  const [prizeDescription, setPrizeDescription] = useState("");
  const [prizeValueDollars, setPrizeValueDollars] = useState("100");
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>("digital");
  const [fulfillmentNotes, setFulfillmentNotes] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A live hint, not an auto-fill — an admin who already typed a value
  // shouldn't have it silently overwritten as the prize value changes.
  const suggestedVolume =
    prizeMode === "new" && prizeValueDollars
      ? defaultOddsDenominator(resolveTier(Math.round(Number(prizeValueDollars) * 100)))
      : null;

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const campaignId = await createDraftCampaign({
        title,
        description,
        dailySpins: Number(dailySpins),
        resetTimezone,
        resetHour: Number(resetHour),
        targetVolume: Number(targetVolume),
        disqualificationPolicy,
        rulesContent,
        prize:
          prizeMode === "existing"
            ? { kind: "existing" as const, prizeId: existingPrizeId as Id<"prizes"> }
            : {
                kind: "new" as const,
                sponsor: {
                  name: sponsorName,
                  websiteUrl: sponsorWebsiteUrl,
                  ctaLabel: sponsorCtaLabel,
                  ctaUrl: sponsorCtaUrl,
                  description: sponsorDescription,
                  contactName: sponsorContactName,
                  contactEmail: sponsorContactEmail,
                },
                title: prizeTitle,
                description: prizeDescription,
                estimatedRetailValueCents: Math.round(Number(prizeValueDollars) * 100),
                fulfillmentType,
                fulfillmentNotes,
              },
      });
      router.push(`/admin/campaigns/${campaignId}`);
    } catch (e) {
      setError(friendlyErrorMessage(e, "Could not create the campaign."));
      setBusy(false);
    }
  };

  if (prizes === undefined) return <p style={{ padding: 24 }}>Loading…</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 640 }}>
      <h1>New campaign</h1>

      <h2>Campaign</h2>
      <label style={{ display: "block", marginTop: 12 }}>
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <label style={{ display: "block", marginTop: 12 }}>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <label style={{ display: "block", marginTop: 12 }}>
        Daily spins
        <input
          type="number"
          value={dailySpins}
          onChange={(e) => setDailySpins(e.target.value)}
          style={{ display: "block" }}
        />
      </label>
      <label style={{ display: "block", marginTop: 12 }}>
        Reset timezone (IANA name, e.g. America/New_York)
        <input
          type="text"
          value={resetTimezone}
          onChange={(e) => setResetTimezone(e.target.value)}
          style={{ display: "block" }}
        />
      </label>
      <label style={{ display: "block", marginTop: 12 }}>
        Reset hour (0-23, local to the timezone above)
        <input
          type="number"
          value={resetHour}
          onChange={(e) => setResetHour(e.target.value)}
          style={{ display: "block" }}
        />
      </label>
      <label style={{ display: "block", marginTop: 12 }}>
        Target volume (stated odds denominator — the campaign is designed to
        produce a winner around this many total spins)
        <input
          type="number"
          value={targetVolume}
          onChange={(e) => setTargetVolume(e.target.value)}
          style={{ display: "block" }}
        />
      </label>
      {suggestedVolume !== null && (
        <p style={{ marginTop: 4 }}>Suggested starting point for this prize&rsquo;s tier: {suggestedVolume}</p>
      )}
      <label style={{ display: "block", marginTop: 12 }}>
        Disqualification policy
        <select
          value={disqualificationPolicy}
          onChange={(e) => setDisqualificationPolicy(e.target.value as DisqualificationPolicy)}
          style={{ display: "block" }}
        >
          <option value="resume_campaign">Resume campaign (target unchanged)</option>
          <option value="select_alternate">Select an alternate winner (re-seal)</option>
          <option value="end_campaign">End the campaign</option>
        </select>
      </label>
      <label style={{ display: "block", marginTop: 12 }}>
        Official Rules text
        <textarea
          value={rulesContent}
          onChange={(e) => setRulesContent(e.target.value)}
          rows={8}
          style={{ display: "block", width: "100%" }}
        />
      </label>

      <h2 style={{ marginTop: 24 }}>Prize</h2>
      <label style={{ display: "block" }}>
        <input
          type="radio"
          checked={prizeMode === "existing"}
          onChange={() => setPrizeMode("existing")}
        />{" "}
        Use an existing prize
      </label>
      <label style={{ display: "block" }}>
        <input type="radio" checked={prizeMode === "new"} onChange={() => setPrizeMode("new")} /> Create
        a new prize
      </label>

      {prizeMode === "existing" ? (
        <label style={{ display: "block", marginTop: 12 }}>
          Prize
          <select
            value={existingPrizeId}
            onChange={(e) => setExistingPrizeId(e.target.value)}
            style={{ display: "block" }}
          >
            <option value="">Select a prize…</option>
            {prizes.map((p) => (
              <option key={p._id} value={p._id}>
                {p.title} ({p.sponsorName})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <h3 style={{ marginTop: 12 }}>Sponsor</h3>
          <label style={{ display: "block" }}>
            Name
            <input
              type="text"
              value={sponsorName}
              onChange={(e) => setSponsorName(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Website URL
            <input
              type="text"
              value={sponsorWebsiteUrl}
              onChange={(e) => setSponsorWebsiteUrl(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            CTA label
            <input
              type="text"
              value={sponsorCtaLabel}
              onChange={(e) => setSponsorCtaLabel(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            CTA URL
            <input
              type="text"
              value={sponsorCtaUrl}
              onChange={(e) => setSponsorCtaUrl(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Description
            <input
              type="text"
              value={sponsorDescription}
              onChange={(e) => setSponsorDescription(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Contact name
            <input
              type="text"
              value={sponsorContactName}
              onChange={(e) => setSponsorContactName(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Contact email
            <input
              type="email"
              value={sponsorContactEmail}
              onChange={(e) => setSponsorContactEmail(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>

          <h3 style={{ marginTop: 12 }}>Prize</h3>
          <label style={{ display: "block" }}>
            Title
            <input
              type="text"
              value={prizeTitle}
              onChange={(e) => setPrizeTitle(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Description
            <input
              type="text"
              value={prizeDescription}
              onChange={(e) => setPrizeDescription(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Estimated retail value (USD)
            <input
              type="number"
              value={prizeValueDollars}
              onChange={(e) => setPrizeValueDollars(e.target.value)}
              style={{ display: "block" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Fulfillment type
            <select
              value={fulfillmentType}
              onChange={(e) => setFulfillmentType(e.target.value as FulfillmentType)}
              style={{ display: "block" }}
            >
              <option value="digital">Digital</option>
              <option value="physical">Physical</option>
              <option value="experience">Experience</option>
            </select>
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Fulfillment notes
            <input
              type="text"
              value={fulfillmentNotes}
              onChange={(e) => setFulfillmentNotes(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
        </>
      )}

      {error && (
        <p role="alert" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || (prizeMode === "existing" && !existingPrizeId)}
        style={{ marginTop: 24 }}
      >
        {busy ? "Creating…" : "Create draft campaign"}
      </button>
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <AuthErrorBoundary>
      <NewCampaignForm />
    </AuthErrorBoundary>
  );
}
