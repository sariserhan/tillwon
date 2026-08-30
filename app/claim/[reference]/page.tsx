"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DocumentShell } from "@/app/components/DocumentShell";
import { BRAND } from "@/app/lib/brand.ts";

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: "Confirm you control this account",
    body: "You sign in to the account that produced the winning entry. A claim cannot be transferred to another account or another person.",
  },
  {
    title: "Verify who you are",
    body: "Government-issued photo identification, your legal first and last name, and your date of birth. We check that you meet the minimum age and that the details match the account.",
  },
  {
    title: "Verify where you live",
    body: "Proof of address in an eligible jurisdiction. Eligibility is decided by where you live, so this cannot be skipped.",
  },
  {
    title: "Sign the affidavit and publicity release",
    body: "An eligibility affidavit confirming you meet the rules, and a publicity release. Accepting the prize requires the release, because winners are published by name and photograph.",
  },
  {
    title: "Provide a photograph",
    body: "A photograph of you for the winner archive, published alongside your name and your city or region.",
  },
  {
    title: "Tax paperwork, only if the prize requires it",
    body: "For prizes of $600 or more, a completed W-9 carrying your SSN or ITIN. Below that threshold no tax form is requested, and none should be sent. The number itself is never stored in our database.",
  },
  {
    title: "Review, then fulfilment",
    body: "We check everything against the Official Rules and tell you the outcome. Once approved, the prize is arranged and its progress is shown here.",
  },
];

type DocType = "photo_id" | "proof_of_address" | "winner_photo";
const DOC_LABELS: Record<DocType, string> = {
  photo_id: "Government photo ID",
  proof_of_address: "Proof of address",
  winner_photo: "Photo for the winner archive",
};

/**
 * One file input that uploads and registers itself the moment a file is
 * picked. No completion callback: `claim` in the parent comes from a
 * reactive `useQuery`, so the moment `registerDocument` commits, the query
 * re-fires and `registeredTypes` updates on its own — an explicit callback
 * here would just be a second, redundant way of learning the same thing.
 */
function DocumentField({
  reference,
  type,
  registered,
}: {
  reference: string;
  type: DocType;
  registered: boolean;
}) {
  const generateUploadUrl = useMutation(api.claims.generateDocumentUploadUrl);
  const registerDocument = useMutation(api.claims.registerUploadedDocument);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("uploading");
    setError(null);
    try {
      const url = await generateUploadUrl({ reference });
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await response.json();
      await registerDocument({ reference, type, storageId });
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("Could not upload that file. Check it is a JPEG, PNG or PDF under 10MB and try again.");
    }
  };

  return (
    <div className="mt-3.5">
      <label className="block text-sm font-semibold text-ink">
        {DOC_LABELS[type]} {registered && <span className="text-ink-soft">— received</span>}
      </label>
      <input
        type="file"
        accept={type === "winner_photo" ? "image/jpeg,image/png" : "image/jpeg,image/png,application/pdf"}
        onChange={onChange}
        disabled={status === "uploading"}
        className="mt-1.5 text-sm"
      />
      {status === "uploading" && <p className="mt-1 text-sm text-ink-soft">Uploading…</p>}
      {error && <p role="alert" className="mt-1 text-sm text-ink-soft">{error}</p>}
    </div>
  );
}

function ClaimForm({ reference }: { reference: string }) {
  const claim = useQuery(api.claims.getMyClaim, { reference });
  const submit = useMutation(api.claims.submitClaimDocuments);
  const [legalName, setLegalName] = useState("");
  const [publicDisplayName, setPublicDisplayName] = useState("");
  const [affidavitAccepted, setAffidavitAccepted] = useState(false);
  const [publicityReleaseAccepted, setPublicityReleaseAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (claim === undefined) return <p className="mt-3.5">Loading your claim…</p>;
  if (claim === null) {
    return (
      <p className="mt-3.5">
        We could not find a claim matching this link for your signed-in account. If you believe
        this is wrong, contact{" "}
        <Link href="/legal/contact" className="underline">
          support
        </Link>
        .
      </p>
    );
  }

  const registeredTypes = new Set(claim.documents.map((d) => d.type));
  const allDocumentsIn =
    registeredTypes.has("photo_id") &&
    registeredTypes.has("proof_of_address") &&
    registeredTypes.has("winner_photo");

  if (claim.claim.status !== "potential_winner") {
    return (
      <p className="mt-3.5">
        Your claim's current status is <strong>{claim.claim.status.replace(/_/g, " ")}</strong>.
      </p>
    );
  }

  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await submit({
        reference,
        legalName,
        publicDisplayName: publicDisplayName || undefined,
        affidavitAccepted,
        publicityReleaseAccepted,
      });
    } catch {
      setError("Something went wrong submitting your claim. Nothing was lost — try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3.5">
      <label className="block text-sm font-semibold text-ink">Legal first and last name</label>
      <input
        type="text"
        value={legalName}
        onChange={(e) => setLegalName(e.target.value)}
        className="mt-1.5 w-full max-w-[28rem] border border-ink/25 px-2 py-1.5 text-sm"
      />

      <label className="mt-3.5 block text-sm font-semibold text-ink">
        Name as you'd like it published (optional — leave blank to use your legal name)
      </label>
      <input
        type="text"
        value={publicDisplayName}
        onChange={(e) => setPublicDisplayName(e.target.value)}
        className="mt-1.5 w-full max-w-[28rem] border border-ink/25 px-2 py-1.5 text-sm"
      />

      {(["photo_id", "proof_of_address", "winner_photo"] as const).map((type) => (
        <DocumentField
          key={type}
          reference={reference}
          type={type}
          registered={registeredTypes.has(type)}
        />
      ))}

      <label className="mt-3.5 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={affidavitAccepted}
          onChange={(e) => setAffidavitAccepted(e.target.checked)}
          className="mt-0.5"
        />
        I confirm, under penalty of perjury, that I meet the eligibility requirements in the{" "}
        <Link href="/rules" className="underline">
          Official Rules
        </Link>
        .
      </label>
      <label className="mt-2 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={publicityReleaseAccepted}
          onChange={(e) => setPublicityReleaseAccepted(e.target.checked)}
          className="mt-0.5"
        />
        I agree to the publicity release: my name and photograph may be published as a winner.
      </label>

      {error && <p role="alert" className="mt-2 text-sm text-ink-soft">{error}</p>}

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting || !allDocumentsIn || !legalName || !affidavitAccepted || !publicityReleaseAccepted}
        className="btn-primary mt-3.5"
      >
        {submitting ? "Submitting…" : "Submit claim"}
      </button>
    </div>
  );
}

export default function ClaimPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = use(params);
  const shown = decodeURIComponent(reference).toUpperCase().slice(0, 32);
  const { isAuthenticated, isLoading } = useConvexAuth();

  return (
    <DocumentShell
      title="Your claim"
      standfirst="If you have reached a winning result, this is the process that follows. Nothing here is automatic, and nothing is decided until verification is complete."
    >
      <section>
        <h2>Reference in this link</h2>
        <p>
          <span className="font-display tracking-[0.06em]">{shown}</span>
        </p>
        {isLoading ? (
          <p className="mt-3.5">Checking your account…</p>
        ) : !isAuthenticated ? (
          <p className="mt-3.5">
            <Link href="/sign-in" className="underline">
              Sign in
            </Link>{" "}
            with the account that produced this result to continue your claim.
          </p>
        ) : (
          <ClaimForm reference={reference} />
        )}
      </section>

      <section>
        <h2>What a winning result actually means</h2>
        <p>
          A winning result makes you a <strong>potential winner</strong>. It does not
          mean you have won. The campaign pauses while your eligibility is verified,
          and the prize is only awarded once that verification is complete.
        </p>
      </section>

      <section>
        <h2>The steps</h2>
        <ol className="mt-3 list-decimal pl-5">
          {STEPS.map((step) => (
            <li key={step.title} className="mt-3">
              <strong>{step.title}.</strong> {step.body}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>How your documents are handled</h2>
        <p>
          Verification documents are held in restricted storage, are never publicly
          accessible, and are reachable only by you and by a reviewer. They are used to
          confirm eligibility and fulfil the prize, and for nothing else.
        </p>
        <p>
          What gets published is your name (or the name you choose to publish), your
          region, the prize, and your photograph. Your date of birth, identification
          documents, address, and tax information are never published.
        </p>
      </section>

      <section>
        <h2>Nobody will ever ask you to pay</h2>
        <p>
          There is no fee, no deposit, no shipping charge and no tax payment to us at
          any stage. If anyone contacts you asking for money to release a {BRAND.name}
          prize, it is a fraud and not from us. Please{" "}
          <Link href="/legal/abuse" className="underline">
            report it
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>Support</h2>
        <p>
          Questions about a claim go to support, and the{" "}
          <Link href="/rules" className="underline">
            Official Rules
          </Link>{" "}
          govern anything this page summarises.
        </p>
      </section>
    </DocumentShell>
  );
}
