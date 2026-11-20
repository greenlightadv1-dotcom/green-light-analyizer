"use client";

import { Component, type ReactNode } from "react";

/**
 * Contains a failure in an optional side panel so the page around it (a deal
 * room's chat, above all) keeps working. Renders `fallback` instead of the
 * panel; nothing is logged here, because the server already logs the data
 * paths that feed these panels and the client has no logger (§12).
 */
export class PanelBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
