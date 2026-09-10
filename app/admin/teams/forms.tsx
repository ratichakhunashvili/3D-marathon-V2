"use client";

import { useActionState, useState } from "react";
import {
  createTeamAction,
  resetPasswordAction,
  toggleTeamAction,
  deleteTeamAction,
  type TeamCreateState,
  type ResetState,
} from "@/app/actions/admin";
import { dict, type Lang } from "@/lib/i18n";

export function CreateTeam({ lang }: { lang: Lang }) {
  const d = dict(lang).admin.teams;
  const [state, action, pending] = useActionState<TeamCreateState, FormData>(createTeamAction, {});
  const [copied, setCopied] = useState(false);

  const credentials = state.created
    ? `${state.created.name}\n${state.created.password}`
    : "";

  return (
    <div className="stack-sm">
      <h2>{d.create}</h2>

      {state.error && <div className="alert alert-error">{state.error}</div>}

      {state.created && (
        <div className="alert alert-ok">
          <div className="strong">{d.created(state.created.name, state.created.password)}</div>
          <div className="row row-tight" style={{ marginTop: 8 }}>
            <code className="mono" style={{ fontSize: 15 }}>
              {state.created.password}
            </code>
            <button
              type="button"
              className="btn btn-sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(credentials);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? d.copied : d.copyCredentials}
            </button>
          </div>
        </div>
      )}

      <form action={action} className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "1 1 220px", marginBottom: 0 }}>
          <span className="label">{d.name}</span>
          <input name="name" required maxLength={80} placeholder="Team Bravo" />
          <span className="hint">{d.nameHint}</span>
        </label>

        <label className="field" style={{ flex: "0 1 200px", marginBottom: 0 }}>
          <span className="label">
            {d.password} <span className="faint">({d.generate})</span>
          </span>
          <input name="password" maxLength={60} placeholder="auto" />
        </label>

        <button className="btn btn-primary" disabled={pending}>
          {pending ? "…" : d.submit}
        </button>
      </form>
    </div>
  );
}

export function TeamActions({
  lang,
  teamId,
  teamName,
  disabled,
}: {
  lang: Lang;
  teamId: string;
  teamName: string;
  disabled: boolean;
}) {
  const d = dict(lang).admin.teams;
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPasswordAction, {});

  return (
    <div className="stack-sm" style={{ minWidth: 190 }}>
      {state.password && <div className="chip chip-green tiny mono">{d.resetDone(state.password)}</div>}

      <div className="row row-tight">
        <form action={action} className="inline-form">
          <input type="hidden" name="teamId" value={teamId} />
          <button className="btn btn-sm" disabled={pending} title={d.resetPassword}>
            {pending ? "…" : "🔑"}
          </button>
        </form>

        <form action={toggleTeamAction} className="inline-form">
          <input type="hidden" name="teamId" value={teamId} />
          <button className="btn btn-sm">{disabled ? d.enable : d.disable}</button>
        </form>

        <details>
          <summary className="btn btn-danger btn-sm">{d.deleteTeam}</summary>
          <form action={deleteTeamAction} style={{ marginTop: 8 }}>
            <input type="hidden" name="teamId" value={teamId} />
            <p className="tiny faint" style={{ maxWidth: 240 }}>
              {d.deleteConfirm}
            </p>
            <button className="btn btn-danger btn-sm">
              {d.deleteTeam}: {teamName}
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}
