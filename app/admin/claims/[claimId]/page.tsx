"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AuthErrorBoundary } from "@/app/components/AuthErrorBoundary";
import { friendlyErrorMessage } from "@/app/lib/convexError";

type DocType = "photo_id" | "proof_of_address" | "winner_photo";

/**
 * Fetches a document through the authenticated /documents HTTP action
 * (convex/http.ts) on click, rather than rendering a pre-resolved
 * `storage.getUrl()` link — that link would work for anyone who ever saw it,
 * with no expiry. The token comes straight from Clerk (the same default
 * session token ConvexProviderWithClerk already uses), attached as a
 * standard bearer header a plain `<a href>` can't carry.
 */
function DocumentLink({ claimId, type }: { claimId: Id<"claims">; type: DocType }) {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const onClick = async () => {
    setStatus("loading");
    try {
      const token = await getToken();
      const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
      const response = await fetch(`${siteUrl}/documents?claimId=${claimId}&type=${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  return (
    <>
      <button type="button" onClick={onClick} disabled={status === "loading"}>
        {status === "loading" ? "Loading…" : "view"}
      </button>
      {status === "error" && <span style={{ marginLeft: 8 }}>Could not load this document.</span>}
    </>
  );
}

function ClaimDetail({ claimId }: { claimId: Id<"claims"> }) {
  const detail = useQuery(api.admin.getClaimDetail, { claimId });
  const approve = useMutation(api.admin.approveClaim);
  // An action, not a mutation: select_alternate needs a fresh crypto nonce,
  // which this codebase generates outside a transaction that may be retried.
  const reject = useAction(api.admin.rejectClaim);
  const purge = useMutation(api.admin.purgeClaimDocuments);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  if (detail === undefined) return <p style={{ padding: 24 }}>Loading…</p>;

  const onApprove = async () => {
    if (
      !window.confirm(
        "Approve this claim? This publishes the winner publicly and reveals the sealed draw target. This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await approve({ claimId });
      router.push("/admin");
    } catch (e) {
      setMessage(friendlyErrorMessage(e, "Approval failed."));
      setBusy(false);
    }
  };

  const onReject = async () => {
    if (!reason) {
      setMessage("A rejection reason is required.");
      return;
    }
    setBusy(true);
    try {
      await reject({ claimId, reason });
      router.push("/admin");
    } catch (e) {
      setMessage(friendlyErrorMessage(e, "Rejection failed."));
      setBusy(false);
    }
  };

  const onPurge = async () => {
    if (
      !window.confirm(
        "Permanently delete this claim's uploaded documents? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await purge({ claimId });
      setMessage("Documents purged.");
    } catch (e) {
      setMessage(friendlyErrorMessage(e, "Purge failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 720 }}>
      <h1>Claim {detail.claim.claimReference}</h1>
      <p>Status: {detail.claim.status}</p>
      <p>Legal name: {detail.claim.legalName}</p>
      <p>Self-certified region: {detail.region}</p>
      <p>Self-certified birthdate: {detail.birthDate}</p>

      <h2>Documents</h2>
      <ul>
        {detail.documents.map((doc) => (
          <li key={doc.type}>
            {doc.type}: <DocumentLink claimId={claimId} type={doc.type} />
          </li>
        ))}
      </ul>

      {message && <p role="alert">{message}</p>}

      <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={onApprove} disabled={busy}>
          Approve
        </button>
        <input
          type="text"
          placeholder="Rejection reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button type="button" onClick={onReject} disabled={busy}>
          Reject
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <button type="button" onClick={onPurge} disabled={busy}>
          Purge documents
        </button>
      </div>
    </div>
  );
}

export default function ClaimDetailPage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = use(params);
  return (
    <AuthErrorBoundary>
      <ClaimDetail claimId={claimId as Id<"claims">} />
    </AuthErrorBoundary>
  );
}
