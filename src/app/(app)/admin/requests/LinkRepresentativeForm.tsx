"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { linkRepresentative, type LinkState } from "./actions";

export function LinkRepresentativeForm() {
  const [state, action, pending] = useActionState<LinkState, FormData>(linkRepresentative, { error: null, linked: false });
  return (
    <form action={action} className="space-y-3">
      <Field id="member_email" name="member_email" type="email" label="Representative account email" required autoComplete="off" />
      <Field id="company_email" name="company_email" type="email" label="Company account email" required autoComplete="off" />
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.linked ? <Alert tone="info">Linked.</Alert> : null}
      <Button type="submit" disabled={pending} fullWidth={false}>
        {pending ? "Linking…" : "Link representative"}
      </Button>
    </form>
  );
}
