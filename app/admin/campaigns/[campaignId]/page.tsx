"use client";

import { use, useState } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AuthErrorBoundary } from "@/app/components/AuthErrorBoundary";
import { friendlyErrorMessage } from "@/app/lib/convexError";

const REGISTRATION_THRESHOLD_CENTS = 500_000;

type DisqualificationPolicy = "resume_campaign" | "select_alternate" | "end_campaign";

function CampaignDetail({ campaignId }: { campaignId: Id<"campaigns"> }) {
  const detail = useQuery(api.campaignAdmin.getCampaignDetail, { campaignId });
  const activate = useAction(api.campaignAdmin.activate);
  const suspendCampaign = useMutation(api.campaignAdmin.suspendCampaign);
  const resumeCampaign = useMutation(api.campaignAdmin.resumeCampaign);
  const cancelCampaign = useMutation(api.campaignAdmin.cancelCampaign);
  const updateDraftCampaign = useMutation(api.campaignAdmin.updateDraftCampaign);
  const deleteDraftCampaign = useMutation(api.campaignAdmin.deleteDraftCampaign);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const router = useRouter();

  // Edit-form state, initialized once the query resolves (see the `initialized`
  // guard below) so it starts pre-filled with the campaign's current values.
  const [initialized, setInitialized] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dailySpins, setDailySpins] = useState("10");
  const [resetTimezone, setResetTimezone] = useState("UTC");
  const [resetHour, setResetHour] = useState("0");
  const [targetVolume, setTargetVolume] = useState("1000");
  const [disqualificationPolicy, setDisqualificationPolicy] =
    useState<DisqualificationPolicy>("resume_campaign");
  const [rulesContent, setRulesContent] = useState("");

  if (detail === undefined) return <p style={{ padding: 24 }}>Loading…</p>;

  const { campaign, sponsorName, prizeTitle, prizeValueCents } = detail;
  const isTier5Or6 = (prizeValueCents ?? 0) >= REGISTRATION_THRESHOLD_CENTS;

  if (!initialized) {
    setInitialized(true);
    setTitle(campaign.title);
    setDescription(campaign.description);
    setDailySpins(String(campaign.dailySpins));
    setResetTimezone(campaign.resetTimezone);
    setResetHour(String(campaign.resetHour));
    setTargetVolume(String(campaign.oddsDenominator));
    setDisqualificationPolicy(campaign.disqualificationPolicy);
    setRulesContent(detail.rulesContent);
  }

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

  const onSuspend = async () => {
    if (!window.confirm("Suspend this campaign? Spins stop immediately until it's resumed.")) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await suspendCampaign({ campaignId, reason: reason.trim() || undefined });
      setReason("");
    } catch (e) {
      setMessage(friendlyErrorMessage(e, "Could not suspend the campaign."));
    } finally {
      setBusy(false);
    }
  };

  const onResume = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await resumeCampaign({ campaignId });
    } catch (e) {
      setMessage(friendlyErrorMessage(e, "Could not resume the campaign."));
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    if (
      !window.confirm(
        "Cancel this campaign? This is permanent and stops the draw for good — it cannot be resumed.",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await cancelCampaign({ campaignId, reason: reason.trim() || undefined });
      setReason("");
    } catch (e) {
      setMessage(friendlyErrorMessage(e, "Could not cancel the campaign."));
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await updateDraftCampaign({
        campaignId,
        title,
        description,
        dailySpins: Number(dailySpins),
        resetTimezone,
        resetHour: Number(resetHour),
        targetVolume: Number(targetVolume),
        disqualificationPolicy,
        rulesContent,
      });
      setMessage("Saved.");
    } catch (e) {
      setMessage(friendlyErrorMessage(e, "Could not save changes."));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this draft campaign? This cannot be undone.")) {
      return;
    }
    setBusy(true);
    try {
      await deleteDraftCampaign({ campaignId });
      router.push("/admin");
    } catch (e) {
      setMessage(friendlyErrorMessage(e, "Could not delete the campaign."));
      setBusy(false);
    }
  };

  if (campaign.status === "draft") {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 640 }}>
        <h1>Edit draft campaign</h1>
        <p>Sponsor: {sponsorName}</p>
        <p>Prize: {prizeTitle}</p>

        {isTier5Or6 && (
          <p style={{ padding: 12, border: "1px solid #900", marginTop: 16 }}>
            This prize is $5,000 or more — NY/FL registration and bonding apply, and
            this system does not yet enforce a hard end date for that requirement
            (see ROADMAP.md). Confirm this has been handled outside the app before
            activating.
          </p>
        )}

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
          Target volume (stated odds denominator)
          <input
            type="number"
            value={targetVolume}
            onChange={(e) => setTargetVolume(e.target.value)}
            style={{ display: "block" }}
          />
        </label>
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

        {message && <p role="alert">{message}</p>}

        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={onSave} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button type="button" onClick={onActivate} disabled={busy} style={{ marginLeft: 8 }}>
            {busy ? "Activating…" : "Activate"}
          </button>
          <button type="button" onClick={onDelete} disabled={busy} style={{ marginLeft: 8 }}>
            {busy ? "Working…" : "Delete draft"}
          </button>
        </div>
      </div>
    );
  }

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

      {(campaign.status === "live" || campaign.status === "suspended") && (
        <div style={{ marginTop: 16 }}>
          <label style={{ display: "block" }}>
            Reason (optional, recorded in the audit log)
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>
          <div style={{ marginTop: 8 }}>
            {campaign.status === "live" && (
              <button type="button" onClick={onSuspend} disabled={busy}>
                {busy ? "Working…" : "Suspend"}
              </button>
            )}
            {campaign.status === "suspended" && (
              <button type="button" onClick={onResume} disabled={busy}>
                {busy ? "Working…" : "Resume"}
              </button>
            )}
            <button type="button" onClick={onCancel} disabled={busy} style={{ marginLeft: 8 }}>
              {busy ? "Working…" : "Cancel campaign"}
            </button>
          </div>
        </div>
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
