"use client";

import { Component, type ReactNode } from "react";

const AUTH_ERROR_CODES = ["NOT_ADMIN", "NOT_AUTHENTICATED"];

/**
 * Turns a thrown NOT_ADMIN/NOT_AUTHENTICATED from a Convex query into a
 * plain message instead of a broken page — Convex's useQuery re-throws a
 * query's server-side error synchronously during render, which is exactly
 * what a React error boundary catches. Only auth-shaped errors are caught;
 * anything else re-throws, so a genuine bug still surfaces as a real error
 * instead of a misleading "Not authorized."
 */
export class AuthErrorBoundary extends Component<
  { children: ReactNode; message?: string },
  { errored: boolean }
> {
  state = { errored: false };

  static getDerivedStateFromError(error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    if (AUTH_ERROR_CODES.some((code) => text.includes(code))) {
      return { errored: true };
    }
    throw error;
  }

  render() {
    if (this.state.errored) {
      return <p style={{ padding: 24 }}>{this.props.message ?? "Not authorized."}</p>;
    }
    return this.props.children;
  }
}
