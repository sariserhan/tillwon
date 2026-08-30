"use client";

import { Component, type ReactNode } from "react";

/**
 * Turns a thrown NOT_ADMIN/NOT_AUTHENTICATED from an admin query into a
 * plain message instead of a broken page. Convex's useQuery re-throws a
 * query's server-side error synchronously during render, which is exactly
 * what a React error boundary catches.
 */
export class AdminGate extends Component<{ children: ReactNode }, { errored: boolean }> {
  state = { errored: false };
  static getDerivedStateFromError() {
    return { errored: true };
  }
  render() {
    if (this.state.errored) {
      return <p style={{ padding: 24 }}>Not authorized.</p>;
    }
    return this.props.children;
  }
}
