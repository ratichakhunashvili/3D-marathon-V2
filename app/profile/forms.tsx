"use client";

import { useActionState } from "react";
import { changePasswordAction, uploadAvatarAction, type ProfileState } from "@/app/actions/profile";
import { dict, type Lang } from "@/lib/i18n";

export function AvatarUpload({ lang }: { lang: Lang }) {
  const d = dict(lang).profile;
  const [state, action, pending] = useActionState<ProfileState, FormData>(uploadAvatarAction, {});

  return (
    <form action={action} className="stack-sm">
      <span className="label small muted">{d.uploadOwn}</span>
      {state.error && <div className="alert alert-error">{state.error}</div>}
      {state.ok && <div className="alert alert-ok">{state.ok}</div>}
      <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp,image/gif" required />
      <span className="tiny faint">{d.uploadOwnHint}</span>
      <div>
        <button className="btn btn-sm" disabled={pending}>
          {pending ? "…" : d.save}
        </button>
      </div>
    </form>
  );
}

export function PasswordForm({ lang }: { lang: Lang }) {
  const d = dict(lang).profile;
  const [state, action, pending] = useActionState<ProfileState, FormData>(changePasswordAction, {});

  return (
    <form action={action}>
      {state.error && <div className="alert alert-error">{state.error}</div>}
      {state.ok && <div className="alert alert-ok">{state.ok}</div>}

      <label className="field">
        <span className="label">{d.currentPassword}</span>
        <input name="current" type="password" autoComplete="current-password" required />
      </label>
      <label className="field">
        <span className="label">{d.newPassword}</span>
        <input name="next" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <label className="field">
        <span className="label">{d.confirmPassword}</span>
        <input name="repeat" type="password" autoComplete="new-password" minLength={8} required />
      </label>

      <button className="btn btn-primary" disabled={pending}>
        {pending ? "…" : d.changePassword}
      </button>
    </form>
  );
}
