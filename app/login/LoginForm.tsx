"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { dict, type Lang } from "@/lib/i18n";

export function LoginForm({ lang }: { lang: Lang }) {
  const d = dict(lang).login;
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={action}>
      {state.error && <div className="alert alert-error">{state.error}</div>}

      <label className="field">
        <span className="label">{d.name}</span>
        <input name="name" autoComplete="username" autoFocus required />
      </label>

      <label className="field">
        <span className="label">{d.password}</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>

      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "…" : d.submit}
      </button>
    </form>
  );
}
