import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";
import {
  ENTITY_ADDRESS,
  ENTITY_NAME,
  PRIVACY_EMAIL,
  RETENTION,
} from "@/lib/constants/legal";
import { DISCORD_INVITE_URL } from "@/lib/constants/contact";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What data Green Light collects, why, who it is shared with, how long it is kept, and how to have it deleted.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="What we collect, why we collect it, who processes it on our behalf, how long we keep it, and how to get it deleted. Written to describe what the software actually does rather than to reserve every right we could."
    >
      <h2>1. Who is responsible for your data</h2>
      <p>
        <strong>{ENTITY_NAME}</strong>, of <strong>{ENTITY_ADDRESS}</strong>, is
        the controller of the personal data described here.
      </p>
      <p>
        For anything concerning your personal data — a copy of it, a correction,
        deletion, or a complaint — write to{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. That address
        reaches a person, not a queue, and we answer within 30 days.
      </p>

      <h2>2. What we collect</h2>

      <h3>Account details</h3>
      <p>
        Your name, email address, role (creator or company), region, plan, and
        the date the account was created. Passwords are stored only as
        cryptographic hashes by our authentication provider; we never see or
        store the password itself. If an account is closed for a breach of the
        terms, we record that fact and the reason.
      </p>

      <h3>Creator profile</h3>
      <p>
        A biography, profile picture link, country, primary language, starting
        rate, social media handles, and a URL slug for your public profile. All
        of it is optional and all of it is entered by you.
      </p>

      <h3>Audience figures</h3>
      <p>
        For each platform a creator connects: the platform, the channel handle,
        average views, average concurrent viewers, engagement rate, content
        category and language, content tags, and audience geography. Audience
        geography is stored in two separate fields — one for figures you entered
        yourself, one for figures retrieved from a platform&apos;s own analytics
        API — and the product always shows which of the two it is displaying.
      </p>

      <h3>Deals and messages</h3>
      <p>
        The sponsor&apos;s email address, the deal&apos;s status, the amount
        offered, our recommended price and risk rating, the deliverable type,
        the countries the sponsor wants to reach, and every message exchanged in
        the deal room.
      </p>
      <p>
        Messages are filtered before they are stored. Email addresses, phone
        numbers and links to external messaging services are replaced with a
        placeholder <em>server-side, before the message reaches our database</em>
        . The unfiltered text is never written to storage.
      </p>

      <h3>Records of attempts to exchange contact details</h3>
      <p>
        When that filter is triggered we record which rule matched, a redacted
        extract of the message, and the account and deal it relates to, so that
        an administrator can review it. The extract stores the already-filtered
        text, not the original.
      </p>

      <h3>Forwarded email</h3>
      <p>
        Creators are given an inbound Green Light address and may set up
        forwarding from their ordinary business address to it. When a message
        arrives we record the provider&apos;s message identifier, the address it
        was sent to, the sender&apos;s address and whether processing succeeded,
        and we turn the message into a deal.
      </p>
      <p>
        This means we process personal data belonging to the sender — a person
        at a sponsoring company who is not a Green Light user. We process it to
        deliver the service the creator asked for, we apply the same contact
        filter to it, and a sender may write to{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> to ask what we
        hold about them. Green Light does not connect to your mailbox, does not
        ask for access to your email account, and can only ever see messages
        that were forwarded to the address we issued.
      </p>

      <h3>Sponsor domain checks</h3>
      <p>
        To help creators judge an unfamiliar sponsor, we look up public
        registration information for the sender&apos;s email domain and check
        links in the message against a malicious-URL database. The result — the
        domain, its registration record, whether anything was flagged, and a
        trust score — is stored with the deal.
      </p>

      <h3>Notifications</h3>
      <p>
        If you opt in, a WhatsApp phone number, used only to tell you a new deal
        has arrived. Turning the option off stops the messages; deleting the
        number removes it.
      </p>

      <h3>Technical records</h3>
      <p>
        Counters recording how many times an account has used the automated
        analysis features, to enforce the limits in our terms. Standard server
        logs held by our hosting provider. Green Light sets no advertising
        cookies and runs no third-party analytics or tracking scripts. The only
        data stored in your browser is your session, your theme and your
        language preference.
      </p>

      <h2>3. Why we use it, and on what legal basis</h2>
      <ul>
        <li>
          <strong>To provide the service</strong> — running your account,
          delivering offers, hosting negotiations, producing recommendations,
          tracking deals and charging commission. Basis: performance of our
          contract with you.
        </li>
        <li>
          <strong>To protect the platform and its commission</strong> —
          filtering contact details from messages, recording attempts to bypass
          that filter, checking sponsor domains, and limiting automated use.
          Basis: our legitimate interests in preventing fraud and abuse and in
          operating a viable service.
        </li>
        <li>
          <strong>To retrieve verified audience figures</strong> from YouTube or
          Instagram. Basis: your consent, given when you connect the account and
          withdrawable at any time.
        </li>
        <li>
          <strong>To send WhatsApp notifications.</strong> Basis: your consent,
          withdrawable in settings.
        </li>
        <li>
          <strong>To meet legal and accounting obligations.</strong> Basis: legal
          obligation.
        </li>
      </ul>

      <h2>4. Automated analysis of offer text</h2>
      <p>
        The text of an offer, and the most recent message in a deal room when
        you ask for a suggested reply, are sent to a third-party AI service to
        produce a price recommendation, a risk rating, or a draft reply.
      </p>
      <p>
        We instruct that this content is used for that evaluation only. We do
        not sell it, do not use it to train models, and do not send it anywhere
        else. <strong>One limitation we state plainly rather than bury:</strong>{" "}
        our current AI provider&apos;s terms allow it to retain submitted
        content for a limited period — up to 30 days on the tier we use — for
        its own security monitoring. That is the provider&apos;s retention, not
        ours, and we are reviewing it.
      </p>
      <p>
        These recommendations do not produce a legal or similarly significant
        decision about you. Nothing is automatically accepted, rejected or
        priced on your behalf: a recommendation is shown to a person, who
        decides.
      </p>

      <h2>5. Google user data</h2>
      <p>
        If you connect a YouTube account, we request read-only access to your
        YouTube analytics in order to retrieve the geographic breakdown of your
        audience, and we read public channel statistics to populate your media
        kit.
      </p>
      <p>
        Green Light&apos;s use of information received from Google APIs adheres
        to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Specifically:
      </p>
      <ul>
        <li>
          we use Google user data only to provide and improve the
          audience-verification feature you connected it for;
        </li>
        <li>
          we do not transfer it to others except as needed to provide that
          feature, for security purposes, or to comply with applicable law;
        </li>
        <li>we do not use it for advertising;</li>
        <li>
          we do not allow humans to read it, except with your explicit consent
          for a specific support request, where it is necessary for security, or
          where the law requires it;
        </li>
        <li>we do not sell it.</li>
      </ul>
      <p>
        Disconnecting the account in your media kit settings immediately deletes
        the stored access tokens, clears the verified figures, and returns your
        audience geography to self-reported. You can also revoke access from
        your{" "}
        <a
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google account permissions
        </a>{" "}
        page.
      </p>

      <h2>6. Meta and Instagram data</h2>
      <p>
        If you connect an Instagram professional account, we request access to
        its insights to retrieve your audience&apos;s country breakdown, and to
        recent post captions if you ask us to detect your content niche.
      </p>
      <p>
        We use it only for those two features, we do not use it for advertising,
        and we do not sell or transfer it. Disconnecting in your media kit
        settings deletes the tokens and clears the derived figures immediately.
        You can also remove Green Light from your Instagram or Facebook apps
        settings.
      </p>
      <p>
        Separately, if you opt into WhatsApp notifications we send your number
        and the notification text to Meta&apos;s WhatsApp Business API to
        deliver the message.
      </p>

      <h2>7. Who else processes your data</h2>
      <p>
        We do not sell personal data and we do not share it for advertising. We
        use these providers to run the service, each processing only what their
        function requires:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — database, authentication and storage. Our
          database is hosted in Frankfurt, Germany.
        </li>
        <li>
          <strong>Vercel</strong> — application hosting and server logs.
        </li>
        <li>
          <strong>Resend</strong> — receiving forwarded email and sending
          platform email on a creator&apos;s behalf.
        </li>
        <li>
          <strong>NVIDIA</strong> — the AI service that produces price
          recommendations, risk ratings and draft replies (see section 4).
        </li>
        <li>
          <strong>Google</strong> — YouTube statistics and analytics you have
          connected, and the malicious-URL check applied to links in offers.
        </li>
        <li>
          <strong>Meta</strong> — Instagram insights you have connected, and
          WhatsApp notification delivery if you opted in.
        </li>
        <li>
          <strong>IP2WHOIS</strong> — public domain registration lookups for
          sponsor domains.
        </li>
      </ul>
      <p>
        We may also disclose data where the law requires it, to establish or
        defend a legal claim, or to a buyer if the business is sold — in which
        case we would tell you first.
      </p>
      <p>
        Our support runs on{" "}
        <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
          Discord
        </a>
        , which is a separate service with its own privacy policy. Anything you
        choose to tell us there is handled under Discord&apos;s terms as well as
        ours.
      </p>

      <h2>8. Where your data goes</h2>
      <p>
        Your account and deal data is stored in Frankfurt, Germany. Several of
        the providers above are based in the United States, so some data is
        transferred outside the European Economic Area. Those transfers rely on
        the European Commission&apos;s Standard Contractual Clauses or an
        equivalent approved mechanism.
      </p>

      <h2>9. How long we keep it</h2>
      <ul>
        <li>
          <strong>While your account is open</strong> — account, profile and
          audience data is kept for as long as you use Green Light.
        </li>
        <li>
          <strong>Deals and messages</strong> — kept for{" "}
          {RETENTION.dealsAndMessagesMonths} months after an account closes, so
          that a commission dispute or a question about a past deal can still be
          resolved, then deleted.
        </li>
        <li>
          <strong>Records of contact-exchange attempts</strong> — kept for{" "}
          {RETENTION.violationLogsMonths} months after closure, so a closure can
          be reviewed or appealed, then deleted.
        </li>
        <li>
          <strong>Platform access tokens</strong> — deleted immediately when you
          disconnect the account, and when your account closes.
        </li>
        <li>
          <strong>Rate-limit counters</strong> — overwritten continuously; they
          hold only a count and a timestamp, never message content.
        </li>
      </ul>

      <h2>10. Your rights</h2>
      <p>
        Wherever you live, you can ask us to give you a copy of your data,
        correct it, delete it, restrict or object to how we use it, or provide
        it in a portable format. Where we rely on your consent — connected
        analytics accounts, WhatsApp notifications — you can withdraw it at any
        time without affecting what we did before you withdrew it.
      </p>
      <p>
        <strong>To delete your data:</strong> write to{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> from the address
        on your account, or ask in the support channel. We will confirm, close
        the account, and delete your personal data within 30 days, apart from
        the records in section 9 that we are keeping for a stated period and
        anything we must retain by law. You can delete connected platform data
        yourself at any time by disconnecting the account in your media kit.
      </p>
      <p>
        If you are in the European Economic Area or the United Kingdom and you
        think we have handled your data badly, you can complain to your national
        data protection authority. We would rather you told us first so we can
        put it right.
      </p>

      <h2>11. Keeping it safe</h2>
      <p>
        Data is encrypted in transit and at rest. Access between accounts is
        enforced at the database level, not only in the application, so one
        account cannot read another&apos;s deals or messages even if the
        application were to misbehave. Contact details are filtered out of
        messages before storage. Access to production data is restricted to
        administrators who need it.
      </p>
      <p>
        No system is perfectly secure. If a breach affects your personal data
        and is likely to put you at risk, we will tell you and the relevant
        authority without undue delay.
      </p>

      <h2>12. Children</h2>
      <p>
        Green Light is not for anyone under 18. We do not knowingly collect data
        from children. If you believe a child has an account, tell us and we
        will remove it.
      </p>

      <h2>13. Changes</h2>
      <p>
        We will update this policy as the product changes. The date at the top
        shows the current revision, and we will notify account holders before a
        material change takes effect.
      </p>

      <h2>14. Contact</h2>
      <p>
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> for anything in
        this policy. See also our <Link href="/terms">Terms of Service</Link>.
      </p>
    </LegalPage>
  );
}
