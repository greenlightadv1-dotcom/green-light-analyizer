import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";
import {
  DSR_RESPONSE_DAYS,
  SECURITY_EMAIL,
  operatorIdentity,
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
        <strong>{operatorIdentity()}</strong> operates Green Light and is the
        controller of the personal data described in this policy. Controller
        means we decide what personal data is collected, why, and how long it
        is kept, and we are accountable for those decisions.
      </p>
      <p>
        This policy is issued under, and is to be read consistently with:
      </p>
      <ul>
        <li>
          Egyptian Law No. 151 of 2020 on the Protection of Personal Data and
          its Executive Regulations (the <strong>PDPL</strong>), which governs
          our processing as an operator established in the Arab Republic of
          Egypt;
        </li>
        <li>
          Regulation (EU) 2016/679 (the <strong>GDPR</strong>) and the UK GDPR,
          to the extent we offer the service to data subjects in the European
          Economic Area or the United Kingdom;
        </li>
        <li>
          the California Consumer Privacy Act as amended by the California
          Privacy Rights Act (the <strong>CCPA</strong>), to the extent it
          applies to California residents.
        </li>
      </ul>
      <p>
        Where these instruments differ, we apply the standard most protective of
        you for the processing in question.
      </p>
      <p>
        For anything concerning your personal data — a copy of it, a correction,
        deletion, restriction, objection, portability, or a complaint — write to{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. That address
        reaches a person, not a queue. We acknowledge without undue delay and
        respond substantively within {DSR_RESPONSE_DAYS} days. Where a request
        is complex we may extend that period once, by no more than a further{" "}
        {DSR_RESPONSE_DAYS} days, and we will tell you why within the original
        period.
      </p>
      <p>
        We do not charge for exercising these rights. We will not refuse,
        degrade, delay or price the service differently because you exercised
        them.
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

      <h2>8. Where your data goes, and on what basis</h2>
      <p>
        Your account and deal data is stored in Frankfurt, Germany. Several of
        the providers listed above are established in the United States, so some
        personal data is transferred outside the European Economic Area and
        outside the Arab Republic of Egypt.
      </p>
      <p>
        <strong>Under the GDPR.</strong> Transfers to a country without an
        adequacy decision are made under the European Commission&apos;s Standard
        Contractual Clauses (Implementing Decision (EU) 2021/914) or, where the
        importer is certified, the EU–US Data Privacy Framework. We carry out a
        transfer impact assessment before relying on the Clauses and apply
        supplementary measures — encryption in transit and at rest, and
        minimisation of the fields sent — where the assessment calls for them.
      </p>
      <p>
        <strong>Under the PDPL.</strong> Article 14 of Law 151/2020 prohibits
        the cross-border transfer of personal data without a licence or permit
        from the Personal Data Protection Centre, except where the data subject
        has given explicit consent and the receiving jurisdiction affords a
        level of protection not less than that of the PDPL. We rely on that
        framework, hold contractual commitments from every processor listed
        above, and will hold the Centre&apos;s licence for the transfers that
        require one.
      </p>
      <p>
        A copy of the safeguards applying to any specific transfer is available
        on request to{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
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
        <li>
          <strong>Invoices and commission records</strong> — kept for{" "}
          {RETENTION.financialRecordsYears} years, because Article 24 of the
          Egyptian Commercial Code (Law 17/1999) and the Income Tax Law require
          commercial books to be retained for that period. This is a legal
          obligation, so it survives a deletion request; the records hold the
          amount, the date and the parties, not message content.
        </li>
      </ul>
      <p>
        When a retention period ends, data is deleted or irreversibly
        anonymised. Backups are rotated on a rolling cycle and a deletion
        propagates to them within 35 days; a restored backup is re-processed for
        deletions before it is returned to service.
      </p>

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
      <h3>If the GDPR or UK GDPR applies to you</h3>
      <p>
        You have the rights of access (Art. 15), rectification (Art. 16),
        erasure (Art. 17), restriction of processing (Art. 18), notification of
        rectification or erasure to recipients (Art. 19), data portability
        (Art. 20), objection including to processing based on our legitimate
        interests (Art. 21), and not to be subject to a decision based solely on
        automated processing that produces legal or similarly significant
        effects (Art. 22). Section 4 explains why the analysis we run does not
        fall under Article 22: it produces advice a person is free to ignore,
        and no account is opened, closed, priced or refused by a model.
      </p>
      <p>
        You may lodge a complaint with the supervisory authority of your
        habitual residence, place of work or the place of the alleged
        infringement (Art. 77), and you have a right to an effective judicial
        remedy (Art. 79). We would rather you told us first so we can put it
        right, but you are not required to.
      </p>

      <h3>If the PDPL applies to you</h3>
      <p>
        Article 2 of Law 151/2020 gives you the right to know what personal data
        we hold and to access it, to withdraw a consent you previously gave, to
        correct, erase or amend it, to restrict its processing to a stated
        purpose, to be informed of any breach or infringement affecting it, and
        to object to processing or to a resulting outcome where it conflicts
        with your fundamental rights and freedoms. You may complain to the
        Personal Data Protection Centre established under Article 19.
      </p>

      <h3>If you are a California resident</h3>
      <p>
        In the twelve months before the date at the top of this page we
        collected the categories of personal information described in section 2:
        identifiers, commercial information, internet activity, professional
        information and inferences drawn from offer text. Section 3 states the
        business purpose for each, and section 7 lists every service provider we
        disclose it to.
      </p>
      <p>
        <strong>
          We do not sell personal information, and we do not share it for
          cross-context behavioural advertising.
        </strong>{" "}
        We have never done so, including for anyone under 16. There is therefore
        no &ldquo;Do Not Sell or Share My Personal Information&rdquo; mechanism
        to offer, because there is nothing for it to stop.
      </p>
      <p>
        You have the right to know, to delete, to correct, to limit the use of
        sensitive personal information, and not to be discriminated against for
        exercising any of them. We do not use or disclose sensitive personal
        information beyond the purposes permitted by CCPA § 7027(m). An
        authorised agent may act for you on written proof of authority; we may
        ask you to verify the request directly.
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
        We review access, dependencies and the row-level rules that separate one
        account from another as part of every release, and we keep an audit
        trail of administrative actions on accounts.
      </p>
      <h3>If something goes wrong</h3>
      <p>
        No system is perfectly secure. If a personal data breach occurs we will:
      </p>
      <ul>
        <li>
          notify the competent supervisory authority without undue delay and, in
          any event, within <strong>72 hours</strong> of becoming aware of it,
          as required by GDPR Art. 33 — and, where the PDPL applies, notify the
          Personal Data Protection Centre within the 72-hour period set by
          Article 7 of Law 151/2020 and its Executive Regulations;
        </li>
        <li>
          notify you directly, without undue delay, where the breach is likely
          to result in a high risk to your rights and freedoms (GDPR Art. 34),
          describing in plain language what happened, what data was involved,
          what we have done, and what you should do;
        </li>
        <li>
          document the facts, effects and remedial action taken for every
          breach, whether or not it was notifiable.
        </li>
      </ul>
      <p>
        To report a vulnerability, write to{" "}
        <a href={`mailto:${SECURITY_EMAIL}`}>{SECURITY_EMAIL}</a>. We will not
        pursue a claim against anyone who reports one in good faith and gives us
        a reasonable chance to fix it before disclosing it.
      </p>

      <h2>12. Children</h2>
      <p>
        Green Light is not offered to anyone under 18, and accounts are created
        only by an administrator after verifying the applicant, so there is no
        route by which a child can register. We do not knowingly collect
        personal data from children, and we do not process the data of a child
        under Article 12 of the PDPL, which requires the consent of a guardian.
      </p>
      <p>
        If you believe a person under 18 holds an account, write to{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. We will close
        it and erase the associated personal data without undue delay.
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
