import type { Metadata } from "next";
import { PortfolioView } from "@/components/portfolio/PortfolioView";
import { previewPortfolio } from "@/lib/preview/collab-mock";
import { DEFAULT_VISIBILITY } from "@/lib/portfolio/rules";

export const metadata: Metadata = { title: "Portfolio · Preview" };

export default function PreviewPortfolio() {
  return <PortfolioView demo items={previewPortfolio} visibility={{ ...DEFAULT_VISIBILITY, show_portfolio: true }} publicPath={null} />;
}
