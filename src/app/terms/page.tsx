import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";
import {
  CHANGE_NOTICE_DAYS,
  GOVERNING_FORUM,
  GOVERNING_LAW,
  SECURITY_EMAIL,
  operatorIdentity,
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
        &ldquo;us&rdquo;) is operated by <strong>{operatorIdentity()}</strong>.
        These terms form a binding agreement between you and us from the moment
        you first access the service, and apply to everyone who uses it, in
        either of the two roles it supports:
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
        Subject only to the first paragraph of this clause, our total aggregate
        liability to you — in contract, tort (including negligence), breach of
        statutory duty, restitution or otherwise — arising out of or in
        connection with the service is limited to the greater of (a) the total
        commission and subscription fees you paid us in the twelve months
        immediately before the event giving rise to the claim, and (b) one
        hundred United States dollars (USD 100).
      </p>
      <p>
        The exclusions and the cap in this clause are an agreed allocation of
        risk that is reflected in the fees, and they apply even if a limited
        remedy fails of its essential purpose. If mandatory law in your
        jurisdiction does not permit an exclusion or limitation set out above,
        that exclusion or limitation does not apply to you and the remainder of
        this clause stands.
      </p>
      <p>
        <strong>Indemnity.</strong> You will indemnify us against any
        third-party claim, and against any loss, liability or reasonable legal
        cost we incur, arising from content you submit, from a sponsorship you
        agreed through the service, from your breach of these terms, or from
        your breach of any advertising-disclosure, tax or consumer-protection
        obligation. We will notify you of any such claim without undue delay,
        give you conduct of the defence where the law permits, and not settle
        it without your consent, which you will not unreasonably withhold.
      </p>

      <h2>14. Changes to these terms</h2>
      <p>
        We may update these terms — to reflect a change in the service, in the
        law, or in how commission or verification works. The date at the top of
        this page always shows the current revision.
      </p>
      <p>
        Where a change materially affects your rights or obligations, we will
        give account holders at least{" "}
        <strong>{CHANGE_NOTICE_DAYS} days&apos; notice</strong> by email before
        it takes effect. If you do not accept the change, you may close your
        account before the effective date at no cost, and we will refund the
        unused portion of any subscription you have paid for. Continuing to use
        Green Light after the effective date means you accept the updated terms.
      </p>
      <p>
        A change never applies retroactively to a deal already agreed, or to a
        commission already earned, under the previous version.
      </p>

      <h2>15. Governing law and disputes</h2>
      <p>
        These terms, and any non-contractual obligation arising out of or in
        connection with them, are governed by <strong>{GOVERNING_LAW}</strong>,
        without regard to its conflict-of-laws rules.
      </p>
      <p>
        <strong>Talk to us first.</strong> Before commencing proceedings, send a
        written notice of the dispute to{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> setting out what
        happened and what you want. We will respond within 30 days and attempt
        in good faith to resolve it. This step does not bar urgent injunctive
        relief, and it does not extend any limitation period.
      </p>
      <p>
        If it is not resolved, the dispute is subject to the exclusive
        jurisdiction of <strong>{GOVERNING_FORUM}</strong>.
      </p>
      <p>
        <strong>Nothing here removes rights you cannot waive.</strong> If you
        are a consumer, you keep the protection of the mandatory provisions of
        the law of your habitual residence — including, in Egypt, Consumer
        Protection Law No. 181 of 2018 — and you may bring proceedings in the
        courts of that country where that law gives you the right to do so.
        Nothing in this clause limits any statutory right of a data subject to
        lodge a complaint with a supervisory authority.
      </p>

      <h2>16. Electronic contracting and notices</h2>
      <p>
        You agree that accepting these terms electronically, and any action
        taken through your account, constitutes a valid electronic signature and
        a binding expression of intent under Egyptian E-Signature Law No. 15 of
        2004 and Law No. 175 of 2018 on Combating Information Technology Crimes.
        Our records of those actions are admissible evidence of them.
      </p>
      <p>
        We give notice to the email address on your account, or by a notice
        inside the service. You give notice to{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Notice is
        effective when sent, unless it bounces.
      </p>

      <h2>17. General</h2>
      <p>
        <strong>Entire agreement.</strong> These terms and the{" "}
        <Link href="/privacy">Privacy Policy</Link> are the whole agreement
        between us about the service, and replace anything said before. Nothing
        in this clause limits liability for fraud or fraudulent
        misrepresentation.
      </p>
      <p>
        <strong>Severability.</strong> If a provision is held invalid or
        unenforceable, it is modified to the minimum extent needed to make it
        enforceable, or severed if it cannot be. The rest stands.
      </p>
      <p>
        <strong>No waiver.</strong> Not enforcing a provision on one occasion is
        not a waiver of it, and does not prevent us enforcing it later.
      </p>
      <p>
        <strong>Assignment.</strong> You may not assign or transfer your rights
        under these terms without our written consent. We may assign them to a
        successor in connection with a merger, acquisition or sale of assets, on
        notice to you; your rights under these terms are unaffected.
      </p>
      <p>
        <strong>Force majeure.</strong> Neither party is liable for a failure to
        perform caused by an event beyond its reasonable control — including
        outage or withdrawal of a third-party platform, network or payment rail
        the service depends on — for as long as that event continues. This does
        not excuse an obligation to pay money already owed.
      </p>
      <p>
        <strong>No agency.</strong> We are not your agent, employer, partner or
        manager, and we are not a party to any sponsorship agreement you reach
        through the service. You are responsible for your own tax, social
        insurance and regulatory obligations, including advertising-disclosure
        rules in every market you publish to.
      </p>
      <p>
        <strong>Language.</strong> These terms are issued in English. Any
        translation is for convenience; the English text governs, except where
        mandatory local law requires otherwise.
      </p>
      <p>
        <strong>Survival.</strong> Clauses 6, 8, 10, 13, 15, 16 and 17 survive
        termination of your account.
      </p>

      <h2>18. Contact</h2>
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
      <p>
        Security vulnerabilities:{" "}
        <a href={`mailto:${SECURITY_EMAIL}`}>{SECURITY_EMAIL}</a>. We will not
        pursue or support a legal claim against anyone who reports a
        vulnerability to that address in good faith, who does not access or
        modify data beyond what is needed to demonstrate it, and who gives us a
        reasonable opportunity to fix it before disclosing it.
      </p>
    </LegalPage>
  );
}
