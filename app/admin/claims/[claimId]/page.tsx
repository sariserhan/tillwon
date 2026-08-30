"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminGate } from "../../AdminGate";

function ClaimDetail({ claimId }: { claimId: Id<"claims"> }) {
  const detail = useQuery(api.admin.getClaimDetail, { claimId });
  const approve = useMutation(api.admin.approveClaim);
  const reject = useMutation(api.admin.rejectClaim);
  const purge = useMutation(api.admin.purgeClaimDocuments);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  if (detail === undefined) return <p style={{ padding: 24 }}>Loading…</p>;

  const onApprove = async () => {
    setBusy(true);
    try {
      await approve({ claimId });
      router.push("/admin");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Approval failed.");
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
      setMessage(e instanceof Error ? e.message : "Rejection failed.");
      setBusy(false);
    }
  };

  const onPurge = async () => {
    setBusy(true);
    try {
      await purge({ claimId });
      setMessage("Documents purged.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Purge failed.");
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
            {doc.type}:{" "}
            {doc.url ? (
              <a href={doc.url} target="_blank" rel="noreferrer">
                view
              </a>
            ) : (
              "unavailable"
            )}
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
    <AdminGate>
      <ClaimDetail claimId={claimId as Id<"claims">} />
    </AdminGate>
  );
}
