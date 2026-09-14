"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { setPassword, type SetPasswordState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Set password & continue"}
    </Button>
  );
}

export function SetPasswordForm() {
  const [state, formAction] = useActionState<SetPasswordState, FormData>(
    setPassword,
    { error: null },
  );

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <Field
        id="password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        hint="At least 10 characters."
        required
      />
      <Field
        id="confirm"
        name="confirm"
        type="password"
        label="Confirm password"
        autoComplete="new-password"
        required
      />

      {state.error ? <Alert>{state.error}</Alert> : null}

      <SubmitButton />
    </form>
  );
}
