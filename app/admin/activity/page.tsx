import Link from "next/link";
import { currentLang } from "@/lib/session";
import { dict } from "@/lib/i18n";
import { recentActivity, teamNames } from "@/lib/queries";
import { absoluteDateTime } from "@/lib/format";

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  // The dropdown only needs names, not the per-team rollups.
  const [lang, params, teams] = await Promise.all([currentLang(), searchParams, teamNames()]);
  const d = dict(lang).admin.activity;

  const teamId = params.team && /^[0-9a-f-]{36}$/i.test(params.team) ? params.team : null;
  const events = await recentActivity(300, teamId);

  return (
    <div className="stack">
      <div className="between">
        <h2>{d.title}</h2>
        <form className="row row-tight" action="/admin/activity">
          <select name="team" defaultValue={teamId ?? ""} style={{ width: "auto" }}>
            <option value="">{d.all}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <button className="btn btn-sm">{d.filterTeam}</button>
        </form>
      </div>

      {events.length === 0 ? (
        <div className="empty">{d.empty}</div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 150 }}>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Target</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="tiny nowrap faint">{absoluteDateTime(event.at, lang)}</td>
                  <td className="small strong">{event.actor_name}</td>
                  <td className="small">
                    <span className="chip tiny">{event.action}</span>
                  </td>
                  <td className="small">
                    {event.model_title && event.team_slug && event.model_slug ? (
                      <Link href={`/m/${event.team_slug}/${event.model_slug}`} className="link">
                        {event.model_title}
                      </Link>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td className="tiny faint mono wrap-any" style={{ maxWidth: 280 }}>
                    {formatMeta(event.meta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatMeta(meta: Record<string, unknown>): string {
  const entries = Object.entries(meta ?? {});
  if (!entries.length) return "";
  return entries
    .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
}
