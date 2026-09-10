"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { submitScorecardAction } from "@/app/actions/models";
import { dict, type Lang } from "@/lib/i18n";

export type ScorecardCriterion = { id: string; label: string; max: number };

/** Peer scoring. Values go straight to the organizers — teams never see each other's numbers. */
export function Scorecard({
  lang,
  modelId,
  criteria,
  initialScores,
  initialNote,
  saved,
}: {
  lang: Lang;
  modelId: string;
  criteria: ScorecardCriterion[];
  initialScores: Record<string, number>;
  initialNote: string;
  saved: boolean;
}) {
  const d = dict(lang).review;
  const [scores, setScores] = useState<Record<string, number>>(initialScores);

  const total = criteria.reduce((sum, c) => sum + (scores[c.id] ?? 0), 0);
  const maxTotal = criteria.reduce((sum, c) => sum + c.max, 0);

  return (
    <form action={submitScorecardAction} className="stack-sm">
      <input type="hidden" name="modelId" value={modelId} />

      <div className="between">
        <h3>{d.scorecard}</h3>
        {saved && <span className="chip chip-green">{d.scorecardYours}</span>}
      </div>
      <p className="tiny faint" style={{ margin: 0 }}>
        {d.scorecardIntro}
      </p>

      {criteria.map((criterion) => (
        <div className="criterion" key={criterion.id}>
          <span className="small">{criterion.label}</span>
          <div className="score-pills">
            {Array.from({ length: criterion.max + 1 }, (_, value) => {
              const id = `c-${criterion.id}-${value}`;
              return (
                <span key={id} style={{ position: "relative" }}>
                  <input
                    type="radio"
                    id={id}
                    name={`c_${criterion.id}`}
                    value={value}
                    checked={scores[criterion.id] === value}
                    onChange={() => setScores((prev) => ({ ...prev, [criterion.id]: value }))}
                  />
                  <label htmlFor={id}>{value}</label>
                </span>
              );
            })}
          </div>
        </div>
      ))}

      <div className="between" style={{ marginTop: 4 }}>
        <span className="small muted">{d.total}</span>
        <span className="strong">
          {total} / {maxTotal}
        </span>
      </div>

      <label className="field" style={{ marginBottom: 0 }}>
        <span className="label">{d.scorecardNote}</span>
        <textarea name="note" defaultValue={initialNote} rows={2} />
      </label>

      <SubmitButton label={d.saveScorecard} />
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
      {pending ? "…" : label}
    </button>
  );
}
