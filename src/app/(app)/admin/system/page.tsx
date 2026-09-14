import type { Metadata } from "next";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { requireRole } from "@/lib/auth";
import { readConfigReport } from "@/lib/config";

export const metadata: Metadata = { title: "System" };

// Env vars are read at request time, so this must never be prerendered.
export const dynamic = "force-dynamic";

/**
 * Deployment readiness. Admin-only.
 *
 * Exists because every integration here degrades quietly by design, which is
 * correct behaviour and also exactly how a deploy ends up half-working with
 * nobody able to say which half. Shows presence only — never a value, never
 * even a prefix.
 */
export default async function SystemPage() {
  await requireRole("admin");
  const report = readConfigReport();

  return (
    <>
      <SectionHeader
        title="System"
        description="Which integrations are configured on this deployment, and what is degraded while they are not."
      />

      <GlassPanel
        className={`mb-4 p-5 ${
          report.ready
            ? "border-brand-green/25 bg-brand-green/5"
            : "border-amber-300/25 bg-amber-300/5"
        }`}
      >
        <p className="text-sm font-medium text-fg">
          {report.ready
            ? "All required configuration is present."
            : `${report.missingRequired.length} required ${report.missingRequired.length === 1 ? "variable is" : "variables are"} missing.`}
        </p>
        {!report.ready ? (
          <p className="mt-1.5 font-mono text-xs text-amber-700 dark:text-amber-200">
            {report.missingRequired.join(", ")}
          </p>
        ) : null}
      </GlassPanel>

      <GlassPanel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-fg/8 text-xs tracking-wide text-fg/40 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Variable</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">If missing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fg/5">
              {report.items.map((item) => (
                <tr key={item.name}>
                  <td className="px-5 py-3 align-top">
                    <span className="font-mono text-xs text-fg">
                      {item.name}
                    </span>
                    {item.required ? (
                      <span className="ml-2 text-[10px] tracking-wide text-fg/35 uppercase">
                        required
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 align-top whitespace-nowrap">
                    {item.set ? (
                      <span className="text-brand-green">Set</span>
                    ) : (
                      <span
                        className={
                          item.required ? "text-red-700 dark:text-red-300" : "text-amber-700/80 dark:text-amber-300/80"
                        }
                      >
                        Not set
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 align-top text-xs leading-relaxed text-fg/45">
                    {item.set ? "—" : item.impact}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassPanel>

      <p className="mt-4 text-xs leading-relaxed text-fg/30">
        Values are never displayed here, only whether something is present. Set
        them in Vercel under Project Settings → Environment Variables, then
        redeploy — Next.js reads server environment variables at build and
        request time, so a change needs a new deployment to take effect.
      </p>
    </>
  );
}
