"use client";

import { useActionState } from "react";
import { updateSettingsAction, type SettingsState } from "@/app/actions/admin";
import { dict, type Lang } from "@/lib/i18n";
import { toDatetimeLocal } from "@/lib/format";

export function SettingsForm({
  lang,
  initial,
}: {
  lang: Lang;
  initial: {
    eventName: string;
    deadlineAt: string | null;
    frozen: boolean;
    reveal: boolean;
    maxFileMb: number;
    maxTeamMb: number;
  };
}) {
  const d = dict(lang).admin.settings;
  const scores = dict(lang).admin.scores;
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateSettingsAction, {});

  return (
    <form action={action} className="stack-sm">
      <h2>{d.title}</h2>

      {state.error && <div className="alert alert-error">{state.error}</div>}
      {state.ok && <div className="alert alert-ok">{state.ok}</div>}

      <label className="field">
        <span className="label">{d.eventName}</span>
        <input name="event_name" defaultValue={initial.eventName} maxLength={80} required />
      </label>

      <label className="field">
        <span className="label">{d.deadline}</span>
        <input name="deadline_at" type="datetime-local" defaultValue={toDatetimeLocal(initial.deadlineAt)} />
        <span className="hint">{d.deadlineHint}</span>
      </label>

      <div className="grid grid-2">
        <label className="field">
          <span className="label">
            {d.maxFile} ({d.megabytes})
          </span>
          <input name="max_file_mb" type="number" min={1} max={2000} defaultValue={initial.maxFileMb} />
        </label>
        <label className="field">
          <span className="label">
            {d.maxTeam} ({d.megabytes})
          </span>
          <input name="max_team_mb" type="number" min={1} max={20000} defaultValue={initial.maxTeamMb} />
        </label>
      </div>

      <label className="row row-tight small">
        <input type="checkbox" name="uploads_frozen" defaultChecked={initial.frozen} />
        <span>
          {d.freeze}
          <span className="tiny faint" style={{ display: "block" }}>
            {d.freezeHint}
          </span>
        </span>
      </label>

      <label className="row row-tight small">
        <input type="checkbox" name="reveal_scores" defaultChecked={initial.reveal} />
        <span>
          {scores.reveal}
          <span className="tiny faint" style={{ display: "block" }}>
            {initial.reveal ? scores.revealOn : scores.revealOff}
          </span>
        </span>
      </label>

      <div>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "…" : d.save}
        </button>
      </div>
    </form>
  );
}
