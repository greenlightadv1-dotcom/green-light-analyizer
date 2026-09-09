import type { SubscriptionPlan } from "@/lib/types/database";

export type Plan = {
  tier: SubscriptionPlan;
  nameKey: string;
  menaPrice: string;
  intlPrice: string;
  commission: string;
  featuresKey: string;
  highlighted?: boolean;
};

/** CLAUDE.md §8's pricing table. */
export const PLANS: Plan[] = [
  {
    tier: "Starter",
    nameKey: "pricing.starterName",
    menaPrice: "$0",
    intlPrice: "$0",
    commission: "15%",
    featuresKey: "pricing.starterFeatures",
  },
  {
    tier: "Pro",
    nameKey: "pricing.proName",
    menaPrice: "$12–15",
    intlPrice: "$29",
    commission: "8–10%",
    featuresKey: "pricing.proFeatures",
    highlighted: true,
  },
  {
    tier: "Elite",
    nameKey: "pricing.eliteName",
    menaPrice: "$49",
    intlPrice: "$99",
    commission: "5%",
    featuresKey: "pricing.eliteFeatures",
  },
];
