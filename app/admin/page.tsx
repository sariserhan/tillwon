"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AuthErrorBoundary } from "@/app/components/AuthErrorBoundary";

function CampaignsSection() {
  const campaigns = useQuery(api.campaignAdmin.listCampaigns, {});
  if (campaigns === undefined) return <p>Loading campaigns…</p>;

  return (
    <div style={{ marginBottom: 32 }}>
      <h1>
        Campaigns{" "}
        <Link href="/admin/campaigns/new" style={{ fontSize: "0.6em" }}>
          + New campaign
        </Link>
      </h1>
      {campaigns.length === 0 ? (
        <p>No campaigns yet.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", marginTop: 16 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Title</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Status</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Sponsor</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Prize</th>
              <th style={{ padding: 8, borderBottom: "1px solid #ccc" }}></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c._id}>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.title}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.status}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.sponsorName}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{c.prizeTitle}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                  <Link href={`/admin/campaigns/${c._id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AdminClaimsPage() {
  const rows = useQuery(api.admin.listPendingClaims, {});

  if (rows === undefined) return <p style={{ padding: 24 }}>Loading…</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <CampaignsSection />

      <h2>Claims pending ({rows.length})</h2>
      {rows.length === 0 ? (
        <p>Nothing pending.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", marginTop: 16 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Reference</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Status</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Prize</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Region</th>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Birthdate</th>
              <th style={{ padding: 8, borderBottom: "1px solid #ccc" }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.claim._id}>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{row.claim.claimReference}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                  {row.claim.status.replace(/_/g, " ")}
                </td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{row.prizeTitle}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{row.region}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{row.birthDate}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                  <Link href={`/admin/claims/${row.claim._id}`}>Review</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function AdminClaimsPageRoute() {
  return (
    <AuthErrorBoundary>
      <AdminClaimsPage />
    </AuthErrorBoundary>
  );
}
