"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AuthErrorBoundary } from "@/app/components/AuthErrorBoundary";

function AdminClaimsPage() {
  const rows = useQuery(api.admin.listPendingClaims, {});

  if (rows === undefined) return <p style={{ padding: 24 }}>Loading…</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Claims under review ({rows.length})</h1>
      {rows.length === 0 ? (
        <p>Nothing pending.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", marginTop: 16 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #ccc" }}>Reference</th>
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
