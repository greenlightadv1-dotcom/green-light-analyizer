import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * Sponsorship-pitch email to a creator — a company's offer, formatted for
 * their inbox rather than left as raw pasted text. Brand colors per
 * CLAUDE.md §2.1; the "Liquid Glass" glassmorphism (§2.2) has no email
 * equivalent — backdrop-filter blur isn't supported by any mail client — so
 * this leans on a plain light layout with the same navy/green accents
 * instead of trying to reproduce the in-app look.
 */
export interface CreatorOutreachProps {
  creatorName: string;
  campaignTitle: string;
  offerAmountUsd: number;
  pitchDetails: string;
  ctaLabel: string;
  ctaUrl: string;
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string;
}

const NAVY = "#293E61";
const NAVY_DARK = "#1F2E47";
const GREEN = "#62E823";
const INK = "#231F20";

export function CreatorOutreach({
  creatorName,
  campaignTitle,
  offerAmountUsd,
  pitchDetails,
  ctaLabel,
  ctaUrl,
  secondaryCtaLabel,
  secondaryCtaUrl,
}: CreatorOutreachProps) {
  const formattedOffer = `$${offerAmountUsd.toLocaleString("en-US")}`;

  return (
    <Html>
      <Head />
      <Preview>
        {campaignTitle} — {formattedOffer} offer via Green Light
      </Preview>
      <Body style={{ backgroundColor: "#F4F6F8", margin: 0, padding: "32px 0", fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Container style={{ backgroundColor: "#FFFFFF", borderRadius: 16, overflow: "hidden", maxWidth: 560 }}>
          <Section style={{ backgroundColor: NAVY_DARK, padding: "20px 32px" }}>
            <Text style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              <span style={{ color: "#FFFFFF" }}>GREEN</span>
              <span style={{ color: GREEN }}>LIGHT</span>
            </Text>
          </Section>

          <Section style={{ padding: "32px 32px 8px" }}>
            <Text style={{ margin: "0 0 4px", fontSize: 13, color: "#6B7280" }}>
              Hi {creatorName},
            </Text>
            <Heading style={{ margin: "0 0 12px", fontSize: 22, color: NAVY }}>
              {campaignTitle}
            </Heading>
            <Text
              style={{
                display: "inline-block",
                margin: "0 0 20px",
                padding: "6px 14px",
                borderRadius: 999,
                backgroundColor: "rgba(98, 232, 35, 0.12)",
                color: "#2F7A0F",
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              Offer: {formattedOffer}
            </Text>
            <Text style={{ margin: "0 0 24px", fontSize: 14, lineHeight: "22px", color: INK, whiteSpace: "pre-wrap" }}>
              {pitchDetails}
            </Text>

            <Button
              href={ctaUrl}
              style={{
                backgroundColor: GREEN,
                color: NAVY_DARK,
                fontSize: 14,
                fontWeight: 700,
                padding: "12px 24px",
                borderRadius: 10,
                textDecoration: "none",
              }}
            >
              {ctaLabel}
            </Button>

            {secondaryCtaLabel && secondaryCtaUrl ? (
              <Text style={{ margin: "16px 0 0" }}>
                <a href={secondaryCtaUrl} style={{ color: NAVY, fontSize: 13 }}>
                  {secondaryCtaLabel}
                </a>
              </Text>
            ) : null}
          </Section>

          <Hr style={{ borderColor: "#E5E7EB", margin: "8px 0" }} />

          <Section style={{ padding: "0 32px 28px" }}>
            <Text style={{ margin: 0, fontSize: 11, lineHeight: "18px", color: "#9CA3AF" }}>
              Sent via Green Light on behalf of a sponsor. Your real email and
              phone number stay private — every reply and negotiation happens
              inside the platform, never through this inbox directly.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default CreatorOutreach;
