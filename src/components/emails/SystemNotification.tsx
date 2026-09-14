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
 * Platform / transactional alert — account changes, plan updates, violation
 * warnings, anything the system needs to say rather than a person. Deliberately
 * plainer than CreatorOutreach: one message, one optional action, no pitch
 * copy to compete with it.
 */
export type NotificationTone = "info" | "success" | "warning" | "error";

export interface SystemNotificationProps {
  title: string;
  message: string;
  /** Defaults to "info". */
  tone?: NotificationTone;
  ctaLabel?: string;
  ctaUrl?: string;
}

const NAVY = "#293E61";
const NAVY_DARK = "#1F2E47";
const GREEN = "#62E823";
const INK = "#231F20";

const TONE_STYLES: Record<NotificationTone, { label: string; bg: string; fg: string }> = {
  info: { label: "Notice", bg: "rgba(41, 62, 97, 0.10)", fg: NAVY },
  success: { label: "Success", bg: "rgba(98, 232, 35, 0.14)", fg: "#2F7A0F" },
  warning: { label: "Warning", bg: "rgba(250, 166, 26, 0.16)", fg: "#8A5A00" },
  error: { label: "Alert", bg: "rgba(237, 66, 69, 0.12)", fg: "#B0221F" },
};

export function SystemNotification({
  title,
  message,
  tone = "info",
  ctaLabel,
  ctaUrl,
}: SystemNotificationProps) {
  const toneStyle = TONE_STYLES[tone];

  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ backgroundColor: "#F4F6F8", margin: 0, padding: "32px 0", fontFamily: "Helvetica, Arial, sans-serif" }}>
        <Container style={{ backgroundColor: "#FFFFFF", borderRadius: 16, overflow: "hidden", maxWidth: 520 }}>
          <Section style={{ backgroundColor: NAVY_DARK, padding: "20px 32px" }}>
            <Text style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              <span style={{ color: "#FFFFFF" }}>GREEN</span>
              <span style={{ color: GREEN }}>LIGHT</span>
            </Text>
          </Section>

          <Section style={{ padding: "32px" }}>
            <Text
              style={{
                display: "inline-block",
                margin: "0 0 12px",
                padding: "4px 10px",
                borderRadius: 999,
                backgroundColor: toneStyle.bg,
                color: toneStyle.fg,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              {toneStyle.label}
            </Text>
            <Heading style={{ margin: "0 0 12px", fontSize: 20, color: NAVY }}>
              {title}
            </Heading>
            <Text style={{ margin: ctaLabel && ctaUrl ? "0 0 24px" : 0, fontSize: 14, lineHeight: "22px", color: INK, whiteSpace: "pre-wrap" }}>
              {message}
            </Text>

            {ctaLabel && ctaUrl ? (
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
            ) : null}
          </Section>

          <Hr style={{ borderColor: "#E5E7EB", margin: "8px 0" }} />

          <Section style={{ padding: "0 32px 28px" }}>
            <Text style={{ margin: 0, fontSize: 11, lineHeight: "18px", color: "#9CA3AF" }}>
              Automated notification from Green Light. No action is needed
              unless this message says otherwise.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default SystemNotification;
