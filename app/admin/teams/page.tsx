import Link from "next/link";
import { currentLang } from "@/lib/session";
import { dict } from "@/lib/i18n";
import { teamSummaries } from "@/lib/queries";
import { Avatar } from "@/components/Avatar";
import { formatBytes, relativeTime, absoluteDate } from "@/lib/format";
import { CreateTeam, TeamActions } from "./forms";

export default async function AdminTeamsPage() {
  const [lang, teams] = await Promise.all([currentLang(), teamSummaries(true)]);
  const d = dict(lang);

  return (
    <div className="stack">
      <div className="card card-pad">
        <CreateTeam lang={lang} />
      </div>

      <div className="between">
        <h2>
          {d.admin.teams.title} <span className="faint">{teams.length}</span>
        </h2>
      </div>

      {teams.length === 0 ? (
        <div className="empty">{d.teams.empty}</div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{d.admin.teams.name}</th>
                <th className="num">{d.profile.modelsCount}</th>
                <th className="num">{d.profile.versionsCount}</th>
                <th className="num">{d.profile.storage}</th>
                <th>{d.teams.lastActive}</th>
                <th>{d.admin.teams.password}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr key={team.id}>
                  <td>
                    <div className="row row-tight">
                      <Avatar account={team} size={28} round />
                      <div style={{ minWidth: 0 }}>
                        <Link href={`/t/${team.slug}`} className="strong">
                          {team.name}
                        </Link>
                        <div className="tiny faint">
                          {d.teams.joined} {absoluteDate(team.created_at, lang)}
                        </div>
                      </div>
                      {team.is_disabled && <span className="chip chip-red tiny">{d.admin.teams.disabled}</span>}
                    </div>
                  </td>
                  <td className="num">{team.models}</td>
                  <td className="num">{team.versions}</td>
                  <td className="num nowrap">{formatBytes(team.bytes)}</td>
                  <td className="nowrap tiny">
                    {relativeTime(team.last_upload_at ?? team.last_login_at, lang)}
                  </td>
                  <td className="tiny">
                    {team.password_changed_at ? (
                      <span className="chip chip-green tiny">✓</span>
                    ) : (
                      <span className="chip chip-amber tiny">{d.admin.teams.stillDefaultPassword}</span>
                    )}
                  </td>
                  <td>
                    <TeamActions
                      lang={lang}
                      teamId={team.id}
                      teamName={team.name}
                      disabled={team.is_disabled}
                    />
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
