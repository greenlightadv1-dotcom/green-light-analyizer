"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { generateCode, type GenerateCodeState } from "./actions";

const selectClass =
  "h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm text-white transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Generating…" : "Generate code"}
    </Button>
  );
}

export function GenerateCodeForm() {
  const [state, formAction] = useActionState<GenerateCodeState, FormData>(
    generateCode,
    { error: null, created: null },
  );

  return (
    <GlassPanel className="p-6">
      <h2 className="text-sm font-semibold text-white">New code</h2>
      <p className="mt-1 text-xs leading-relaxed text-white/45">
        Single-use. A creator redeems it in Settings to activate the plan
        below for the chosen duration.
      </p>

      <form action={formAction} className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="duration_days"
            className="block text-xs font-medium tracking-wide text-white/70 uppercase"
          >
            Duration
          </label>
          <select
            id="duration_days"
            name="duration_days"
            className={selectClass}
            required
          >
            <option value="3">3 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="target_plan"
            className="block text-xs font-medium tracking-wide text-white/70 uppercase"
          >
            Plan
          </label>
          <select
            id="target_plan"
            name="target_plan"
            className={selectClass}
            required
          >
            <option value="Pro">Pro</option>
            <option value="Elite">Elite</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="expires_at"
            className="block text-xs font-medium tracking-wide text-white/70 uppercase"
          >
            Code valid until
          </label>
          <input
            id="expires_at"
            name="expires_at"
            type="date"
            className={selectClass}
            required
          />
        </div>

        {state.error ? <Alert>{state.error}</Alert> : null}

        {state.created ? (
          <div className="rounded-xl border border-brand-green/25 bg-brand-green/10 p-3.5">
            <p className="text-sm text-brand-green">Code generated</p>
            <p className="mt-2 text-xs text-white/60">
              Copy it now to hand to the creator — it also stays visible in
              the list to the right.
            </p>
            <code className="mt-1.5 block rounded-lg bg-navy-dark/80 px-3 py-2 font-mono text-sm break-all text-white">
              {state.created.code}
            </code>
          </div>
        ) : null}

        <SubmitButton />
      </form>
    </GlassPanel>
  );
}
