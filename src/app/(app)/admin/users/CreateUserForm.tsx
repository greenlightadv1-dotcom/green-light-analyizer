"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { createUser, type CreateUserState } from "./actions";

const selectClass =
  "h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm text-white transition focus:border-brand-green/50 focus:ring-3 focus:ring-brand-green/15 focus:outline-none";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create account"}
    </Button>
  );
}

export function CreateUserForm() {
  const [state, formAction] = useActionState<CreateUserState, FormData>(
    createUser,
    { error: null, created: null },
  );

  return (
    <GlassPanel className="p-6">
      <h2 className="text-sm font-semibold text-white">New account</h2>
      <p className="mt-1 text-xs leading-relaxed text-white/45">
        A temporary password is generated and shown once. The account holder is
        forced to replace it on first login.
      </p>

      <form action={formAction} className="mt-5 space-y-4">
        <Field
          id="full_name"
          name="full_name"
          label="Full name"
          autoComplete="off"
          required
        />
        <Field
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="off"
          required
        />

        <div className="space-y-1.5">
          <label
            htmlFor="role"
            className="block text-xs font-medium tracking-wide text-white/70 uppercase"
          >
            Role
          </label>
          <select id="role" name="role" className={selectClass} required>
            <option value="creator">Creator</option>
            <option value="company">Company</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="region"
            className="block text-xs font-medium tracking-wide text-white/70 uppercase"
          >
            Region
          </label>
          {/*
            §13 open question: region is set by the admin here rather than
            auto-detected, because it drives which price list the user sees.
          */}
          <select id="region" name="region" className={selectClass} required>
            <option value="MENA">MENA</option>
            <option value="International">International</option>
          </select>
        </div>

        {state.error ? <Alert>{state.error}</Alert> : null}

        {state.created ? (
          <div className="rounded-xl border border-brand-green/25 bg-brand-green/10 p-3.5">
            <p className="text-sm text-brand-green">
              Account created for {state.created.email}
            </p>
            <p className="mt-2 text-xs text-white/60">
              Temporary password — copy it now, it is not shown again:
            </p>
            <code className="mt-1.5 block rounded-lg bg-navy-dark/80 px-3 py-2 font-mono text-sm break-all text-white">
              {state.created.tempPassword}
            </code>
          </div>
        ) : null}

        <SubmitButton />
      </form>
    </GlassPanel>
  );
}
