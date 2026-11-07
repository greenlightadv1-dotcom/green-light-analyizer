import type { StatusTone } from "../ui/status.ts";
import type { VerificationStatus } from "../types/database.ts";

export const VERIFICATION_TONE: Record<VerificationStatus, StatusTone> = {
  draft: "neutral",
  submitted: "info",
  under_review: "info",
  needs_info: "warning",
  approved: "success",
  rejected: "danger",
};
