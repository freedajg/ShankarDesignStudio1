"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email">
        {(p) => <Input {...p} name="email" type="email" autoComplete="username" defaultValue={state.email} required />}
      </Field>
      <Field label="Password">
        {(p) => <Input {...p} name="password" type="password" autoComplete="current-password" required />}
      </Field>
      <Button type="submit" loading={pending} className="mt-2">
        Sign in
      </Button>
    </form>
  );
}
