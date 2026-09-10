import Link from "next/link";
import { currentLang } from "@/lib/session";
import { dict } from "@/lib/i18n";
import { modelScores, criterionAveragesFor } from "@/lib/queries";
import { getSettings } from "@/lib/settings";

export default async function AdminScoresPage() {
  const [lang, scores, settings] = await Promise.all([currentLang(), modelScores(), getSettings()]);
  const d = dict(lang).admin.scores;

  const scored = scores.filter((s) => s.submissions > 0);

  // One query for every model's breakdown, then grouped in memory.
  const details = await criterionAveragesFor(scored.slice(0, 40).map((s) => s.model_id));
  const byModel = new Map<string, typeof details>();
  for (const row of details) {
    const list = byModel.get(row.model_id);
    if (list) list.push(row);
    else byModel.set(row.model_id, [row]);
  }
  const detailFor = (modelId: string) => byModel.get(modelId) ?? [];

  return (
    <div className="stack">
      <div className="between">
        <div>
          <h2>{d.title}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {d.intro}
          </p>
        </div>
        <span className={`chip ${settings.reveal_scores ? "chip-amber" : "chip-green"}`}>
          {settings.reveal_scores ? d.revealOn : d.revealOff}
        </span>
      </div>

      {scored.length === 0 ? (
        <div className="empty">{d.noScores}</div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>{d.model}</th>
                <th>{d.team}</th>
                <th className="num">{d.reviews}</th>
                <th className="num">{d.total}</th>
                <th>{/* breakdown */}</th>
              </tr>
            </thead>
            <tbody>
              {scored.map((score, index) => (
                <tr key={score.model_id}>
                  <td className="faint num">{index + 1}</td>
                  <td>
                    <Link href={`/m/${score.team_slug}/${score.model_slug}`} className="strong">
                      {score.title}
                    </Link>
                  </td>
                  <td className="small muted">
                    <Link href={`/t/${score.team_slug}`}>{score.team_name}</Link>
                  </td>
                  <td className="num">{score.submissions}</td>
                  <td className="num strong">
                    {score.avg_total ?? "—"}
                    <span className="faint tiny"> / {score.max_total}</span>
                  </td>
                  <td>
                    <details>
                      <summary className="tiny link" style={{ cursor: "pointer" }}>
                        ⋯
                      </summary>
                      <div className="stack-sm" style={{ marginTop: 8, minWidth: 220 }}>
                        {detailFor(score.model_id).map((row) => (
                          <div className="between tiny" key={row.criterion_id}>
                            <span className="muted">{lang === "ka" ? row.label_ka : row.label_en}</span>
                            <span className="strong">
                              {row.avg ?? "—"} / {row.max_score}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scores.length > scored.length && (
        <p className="tiny faint">
          {scores.length - scored.length} × {dict(lang).review.notScored}
        </p>
      )}
    </div>
  );
}
