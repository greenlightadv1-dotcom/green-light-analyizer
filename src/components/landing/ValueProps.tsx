const VALUE_PROPS = [
  {
    title: "No screenshot fraud",
    body: "Creator stats sync from official platform APIs — YouTube, Twitch and Instagram — never a self-reported screenshot. Anything unverified is labelled as such, everywhere it's shown.",
  },
  {
    title: "Commission stays protected",
    body: "A creator's real email and phone never reach a company. Every message runs through the masked in-app chat, so a deal can't quietly move off-platform.",
  },
  {
    title: "AI Deal Co-Pilot",
    body: "Every inbound offer gets an instant price recommendation and a green / yellow / red risk rating, weighted by how much of the audience data behind it is actually verified.",
  },
];

/** Glassmorphism cards (spec point 2) grounded in CLAUDE.md §1's real value props, not generic filler. */
export function ValueProps() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {VALUE_PROPS.map((prop) => (
          <div
            key={prop.title}
            className="rounded-2xl border border-navy/10 bg-white/70 p-6 shadow-[0_8px_30px_-20px_rgba(41,62,97,0.4)] backdrop-blur-xl dark:border-white/10 dark:bg-navy/25 dark:shadow-none"
          >
            <h3 className="text-sm font-semibold text-ink dark:text-white">
              {prop.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/60 dark:text-white/55">
              {prop.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
