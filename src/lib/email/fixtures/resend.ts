/**
 * Sanitised Resend fixtures for the inbound tests.
 *
 * Shapes copied from Resend's own documentation examples (2026-10-29):
 *   - webhook:  resend.com/docs/webhooks/emails/received
 *   - content:  resend.com/docs/api-reference/emails/retrieve-received-email
 * Values replaced with reserved example domains and made-up ids. No real
 * delivery, address or credential is in this file.
 */

export const EMAIL_ID = "56761188-7520-42d8-8898-ff6fc54ce618";
export const RFC_MESSAGE_ID = "<111-222-333@mail.brand.example>";
export const ALIAS = "amir.k3f9@analyze.greenlightadvs.com";

/** `email.received` — metadata only: no text, no html, no headers. */
export function webhookPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: "email.received",
    created_at: "2026-02-22T23:41:12.126Z",
    data: {
      email_id: EMAIL_ID,
      created_at: "2026-02-22T23:41:11.894Z",
      from: "Brand Team <deals@brand.example>",
      // A Gmail forward keeps the creator's own address in To; the alias is
      // the envelope recipient.
      to: ["creator@mail.example"],
      bcc: [],
      cc: [],
      received_for: [ALIAS],
      message_id: RFC_MESSAGE_ID,
      subject: "Sponsorship: dedicated video",
      attachments: [
        {
          id: "2a0c9ce0-3112-4728-976e-47ddcd16a318",
          filename: "avatar.png",
          content_type: "image/png",
          content_disposition: "inline",
          content_id: "img001",
        },
      ],
      ...overrides,
    },
  };
}

/** `GET /emails/receiving/:email_id` — the same message, with its content. */
export function receivedEmail(overrides: Record<string, unknown> = {}) {
  return {
    object: "email",
    id: EMAIL_ID,
    to: ["creator@mail.example"],
    from: "Brand Team <deals@brand.example>",
    created_at: "2026-02-22T23:41:11.894Z",
    subject: "Sponsorship: dedicated video",
    html: "<p>Hi! We can pay <strong>$1,500</strong> for a dedicated video.</p>",
    html_format: "data_uri",
    text: null,
    headers: {
      from: "Brand Team <deals@brand.example>",
      "return-path": "bounce@brand.example",
      "mime-version": "1.0",
    },
    bcc: [],
    cc: [],
    reply_to: [],
    received_for: [ALIAS],
    authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
    message_id: RFC_MESSAGE_ID,
    raw: {
      download_url: "https://example.invalid/receiving/raw/fixture?Signature=redacted",
      expires_at: "2026-02-23T00:41:11.894Z",
    },
    attachments: [
      {
        id: "3b1d0df1-4223-5839-087f-54eedd27b419",
        filename: "rate-card.pdf",
        content_type: "application/pdf",
        content_disposition: null,
        content_id: null,
        size: 13264,
      },
    ],
    ...overrides,
  };
}
