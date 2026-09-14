import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";
import {
  ENTITY_ADDRESS,
  ENTITY_NAME,
  GOVERNING_LAW,
  PRIVACY_EMAIL,
  RETENTION,
  SUPPORT_EMAIL,
} from "@/lib/constants/legal";
import { DISCORD_INVITE_URL } from "@/lib/constants/contact";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The agreement between Green Light and the creators and companies who use it.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary="The agreement between you and Green Light. It covers who may hold an account, how commission works, what happens to a deal, and the one rule that ends an account permanently."
    >
      <h2>1. Who these terms are between</h2>
      <p>
        Green Light (&ldquo;Green Light&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;) is operated by <strong>{ENTITY_NAME}</strong>, of{" "}
        <strong>{ENTITY_ADDRESS}</strong>. These terms apply to everyone who
        uses the service, in either of the two roles it supports:
      </p>
      <ul>
        <li>
          <strong>Creators</strong> — people who make content and receive
          sponsorship offers through Green Light.
        </li>
        <li>
          <strong>Companies</strong> — brands and their agencies who make
          sponsorship offers to creators through Green Light.
        </li>
      </ul>
      <p>
        Using the service means you accept these terms. If you are using Green
        Light on behalf of a company, you confirm you are authorised to accept
        them for that company.
      </p>

      <h2>2. Accounts are created by us, not by you</h2>
      <p>
        Green Light has no public sign-up. Every account is created manually by
        an administrator after review. There is no form anywhere on this site
        that creates an account, and there is no way to self-register.
      </p>
      <p>
        When an account is created we issue a temporary password. You must
        replace it the first time you sign in — the rest of the product is
        unreachable until you do. You are responsible for keeping your password
        confidential and for everything done through your account. Tell us at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> if you believe
        someone else has access to it.
      </p>
      <p>
        You must be at least 18 years old to hold an account. Accounts are
        personal to the holder and may not be shared, sold or transferred.
      </p>

      <h2>3. What Green Light does</h2>
      <p>Green Light is a marketplace and a workspace for sponsorship deals. It:</p>
      <ul>
        <li>
          issues each creator a unique inbound email address, so sponsorship
          offers sent to their ordinary business address can be forwarded in and
          turned into a deal;
        </li>
        <li>
          produces an automated price recommendation and a green / yellow / red
          risk rating for each offer;
        </li>
        <li>
          hosts the negotiation between the two sides in a chat that hides
          personal contact details;
        </li>
        <li>
          tracks a deal through its stages, from new to agreed, and records when
          it is settled.
        </li>
      </ul>
      <p>
        <strong>
          Green Light is not a party to any sponsorship agreement between a
          creator and a company.
        </strong>{" "}
        We introduce the two sides and provide the tools they negotiate with.
        The deal itself — what is delivered, when, and on what terms — is
        between them.
      </p>

      <h2>4. The price recommendation is advice, not a valuation</h2>
      <p>
        Every offer receives an automated recommended price and a risk rating.
        These are produced by software from the data available to it, including
        the creator&apos;s reported audience figures and, where the creator has
        connected a platform analytics account, verified figures from that
        platform.
      </p>
      <p>
        They are an aid to judgement and nothing more. A rating is not a
        guarantee that a sponsor is legitimate, that a deal is safe, or that a
        price is achievable or fair. A green rating does not mean we have vetted
        the sponsor; a red one does not mean the sponsor has done anything
        wrong. You remain responsible for deciding whether to accept a deal.
      </p>
      <p>
        Where the audience data behind a rating is self-reported rather than
        verified through a platform&apos;s own API, a high-value deal is capped
        at yellow and labelled as such. That cap is a feature, not a fault.
      </p>

      <h2>5. Verified and self-reported figures</h2>
      <p>
        Green Light distinguishes between figures that came from a
        platform&apos;s official API and figures a creator entered themselves.
        Anything not verified through an API is labelled self-reported wherever
        it is shown.
      </p>
      <p>
        Creators must not enter figures they know to be false. Deliberately
        misstating reach, engagement or audience composition to obtain a better
        price is a breach of these terms and may result in account closure.
      </p>

      <h2>6. Commission</h2>
      <p>
        Green Light charges a commission on each completed deal. The rate
        depends on the account&apos;s plan and is shown on the pricing page
        inside the product at the time the deal is made.
      </p>
      <p>
        Commission is charged on the deal, not on company seats: companies
        browse and contact creators without a subscription fee.
      </p>
      <p>
        Settlement is currently handled manually. Green Light does not operate a
        live payment processor, does not hold funds in a regulated escrow
        account, and does not process card payments. When a deal is marked as
        agreed, payment and commission are reconciled by our team through the
        support channel, using the payment methods available in your region. A
        deal is marked as paid by Green Light once that reconciliation completes
        — not by either party directly.
      </p>

      <h2>7. Subscriptions and promotional codes</h2>
      <p>
        Plans, upgrades, downgrades and payment confirmation are handled by our
        team over our{" "}
        <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
          Discord support server
        </a>
        , not through a checkout in the product. Prices are shown on the pricing
        page and vary by region.
      </p>
      <p>
        Promotional codes are single-use, expire, and apply to the account that
        redeems them. We may withdraw or refuse a code that appears to have been
        obtained or used improperly.
      </p>

      <h2>8. Keeping contact details on the platform</h2>
      <p>
        This is the rule that matters most, and the one we enforce most
        strictly.
      </p>
      <p>
        A creator&apos;s real email address and phone number are never shown to
        a company. Messages sent through Green Light pass through a filter that
        removes email addresses, phone numbers and links to external messaging
        services before the message is stored. When a creator replies, the reply
        reaches the company as an email from Green Light&apos;s own sending
        address.
      </p>
      <p>
        <strong>
          Deliberately attempting to exchange direct contact details, or to move
          a deal off Green Light in order to avoid commission, results in
          permanent closure of the account.
        </strong>{" "}
        This is not a warning system. There is no first offence. When the filter
        detects an attempt, the attempt is recorded — including which rule
        matched and a redacted extract of the message — so an administrator can
        review it.
      </p>
      <p>
        If you believe your account was closed in error, you may appeal through
        the support channel and an administrator will review the record.
      </p>

      <h2>9. Acceptable use</h2>
      <p>You must not:</p>
      <ul>
        <li>
          impersonate another person, creator, brand or agency, or misrepresent
          your authority to act for one;
        </li>
        <li>
          use Green Light to send spam, to harass anyone, or to promote content
          that is unlawful where it will be published;
        </li>
        <li>
          attempt to access another account, another party&apos;s deals, or any
          part of the system you have not been given access to;
        </li>
        <li>
          probe, scan, overload or automate against the service, including
          scripted use of the automated analysis features, which are rate
          limited;
        </li>
        <li>
          scrape or bulk-collect creator profiles, or reuse them to build a
          competing directory.
        </li>
      </ul>

      <h2>10. Your content</h2>
      <p>
        You keep ownership of everything you put into Green Light — your
        profile, your figures, your messages. You grant us the limited
        permission needed to operate the service: to store that content, show it
        to the other party in a deal, process it to produce a price
        recommendation and risk rating, and display the parts of your profile
        you have chosen to make public.
      </p>
      <p>
        A creator&apos;s shareable profile page is public by design: anyone with
        the link can view it, and it may be indexed by search engines. It shows
        your name, picture, biography, country, language, connected platforms,
        listed social handles and starting rate. It never shows your email
        address or your inbound Green Light address.
      </p>

      <h2>11. Availability</h2>
      <p>
        Green Light is provided as it is. We do not promise it will be
        uninterrupted or error-free, and several features depend on third-party
        services — email delivery, platform APIs, the automated analysis engine
        — that can be unavailable or change without notice. Where one of those
        is unavailable, the affected feature degrades and the rest of the
        product continues to work.
      </p>
      <p>
        We may change, suspend or withdraw features. Where a change materially
        reduces what your plan provides, we will tell you.
      </p>

      <h2>12. Suspension and closure</h2>
      <p>
        You may ask us to close your account at any time through the support
        channel. We may suspend or close an account that breaches these terms,
        and we will close permanently for the contact-exchange breach described
        in section 8.
      </p>
      <p>
        After closure we keep deal and message records for{" "}
        {RETENTION.dealsAndMessagesMonths} months and violation records for{" "}
        {RETENTION.violationLogsMonths} months, then delete them. The{" "}
        <Link href="/privacy">Privacy Policy</Link> explains why and what
        happens to everything else.
      </p>

      <h2>13. Liability</h2>
      <p>
        Nothing in these terms limits liability that cannot lawfully be limited,
        including for death or personal injury caused by negligence, or for
        fraud.
      </p>
      <p>Subject to that, Green Light is not liable for:</p>
      <ul>
        <li>
          the conduct of any creator or company, or the performance of any deal
          agreed through the service;
        </li>
        <li>
          a decision you took on the basis of an automated price recommendation
          or risk rating;
        </li>
        <li>
          loss of profit, loss of opportunity, or loss of data, to the extent
          the law allows us to exclude it.
        </li>
      </ul>
      <p>
        Where liability is not excluded, it is limited to the total commission
        and subscription fees you paid us in the twelve months before the claim
        arose.
      </p>

      <h2>14. Changes to these terms</h2>
      <p>
        We may update these terms. The date at the top of this page always shows
        the current revision. Where a change materially affects your rights, we
        will notify account holders before it takes effect. Continuing to use
        Green Light after that means you accept the updated terms.
      </p>

      <h2>15. Governing law</h2>
      <p>
        These terms are governed by <strong>{GOVERNING_LAW}</strong>, and
        disputes are subject to the exclusive jurisdiction of its courts.
      </p>

      <h2>16. Contact</h2>
      <p>
        General questions:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, or our{" "}
        <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
          Discord support server
        </a>
        .
      </p>
      <p>
        Anything concerning your personal data:{" "}
        <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> — see the{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}
