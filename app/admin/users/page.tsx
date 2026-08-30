"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AuthErrorBoundary } from "@/app/components/AuthErrorBoundary";
import { friendlyErrorMessage } from "@/app/lib/convexError";

type AccountStatus = "active" | "verification_required" | "restricted" | "suspended" | "banned" | "deleted";

const STATUS_OPTIONS: AccountStatus[] = [
  "active",
  "verification_required",
  "restricted",
  "suspended",
  "banned",
  "deleted",
];

function UserModeration() {
  const [searchEmail, setSearchEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const user = useQuery(api.userAdmin.searchUserByEmail, submittedEmail ? { email: submittedEmail } : "skip");
  const setAccountStatus = useMutation(api.userAdmin.setAccountStatus);

  const [status, setStatus] = useState<AccountStatus>("restricted");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onSearch = () => {
    setMessage(null);
    setSubmittedEmail(searchEmail.trim());
  };

  const onApply = async () => {
    if (user === undefined || user === null) return;
    if (!window.confirm(`Set ${user.email}'s account status to "${status}"?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await setAccountStatus({ userId: user._id, status, reason: reason.trim() || undefined });
      setMessage("Updated.");
      setReason("");
    } catch (e) {
      setMessage(friendlyErrorMessage(e, "Could not update account status."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 640 }}>
      <h1>User moderation</h1>

      <label style={{ display: "block", marginTop: 12 }}>
        Email
        <input
          type="email"
          value={searchEmail}
          onChange={(e) => setSearchEmail(e.target.value)}
          style={{ display: "block", width: "100%" }}
        />
      </label>
      <button type="button" onClick={onSearch} style={{ marginTop: 8 }}>
        Search
      </button>

      {submittedEmail && user === undefined && <p>Searching…</p>}
      {submittedEmail && user === null && <p>No user found with that email.</p>}

      {user && (
        <div style={{ marginTop: 24, borderTop: "1px solid #ccc", paddingTop: 16 }}>
          <p>Email: {user.email}</p>
          <p>Role: {user.role}</p>
          <p>Current account status: {user.accountStatus}</p>
          <p>Total spins: {user.totalSpins}</p>
          <p>Total potential wins: {user.totalPotentialWins}</p>
          <p>Fraud risk score: {user.fraudRiskScore}</p>

          <label style={{ display: "block", marginTop: 12 }}>
            New account status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AccountStatus)}
              style={{ display: "block" }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            Reason (optional, recorded in the audit log)
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ display: "block", width: "100%" }}
            />
          </label>

          {message && <p role="alert">{message}</p>}

          <button type="button" onClick={onApply} disabled={busy} style={{ marginTop: 12 }}>
            {busy ? "Applying…" : "Apply"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function UserModerationPage() {
  return (
    <AuthErrorBoundary>
      <UserModeration />
    </AuthErrorBoundary>
  );
}
