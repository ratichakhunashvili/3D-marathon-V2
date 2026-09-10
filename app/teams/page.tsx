import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAccount, currentLang } from "@/lib/session";
import { dict } from "@/lib/i18n";
import { teamSummaries } from "@/lib/queries";
import { Avatar } from "@/components/Avatar";
import { formatBytes, relativeTime } from "@/lib/format";

export const metadata = { title: "Teams" };

export default async function TeamsPage() {
  const account = await currentAccount();
  if (!account) redirect("/login");

  const [lang, teams] = await Promise.all([currentLang(), teamSummaries(account.role === "admin")]);
  const d = dict(lang);
  const visible = teams.filter((team) => account.role === "admin" || !team.is_disabled);

  return (
    <>
      <div className="page-head">
        <h1>
          {d.teams.title} <span className="faint">{visible.length}</span>
        </h1>
      </div>

      {visible.length === 0 ? (
        <div className="empty">{d.teams.empty}</div>
      ) : (
        <div className="grid grid-cards">
          {visible.map((team) => (
            <Link key={team.id} href={`/t/${team.slug}`} className="card card-pad stack-sm">
              <div className="row">
                <Avatar account={team} size={44} round />
                <div style={{ minWidth: 0 }}>
                  <div className="strong wrap-any">{team.name}</div>
                  <div className="tiny faint">
                    {team.models} {d.teams.models} · {team.versions} {d.model.versions.toLowerCase()}
                  </div>
                </div>
              </div>

              <div className="row row-tight tiny faint">
                <span>♥ {team.likes_received}</span>
                <span>·</span>
                <span>{formatBytes(team.bytes)}</span>
                {team.is_disabled && <span className="chip chip-red tiny">{d.admin.teams.disabled}</span>}
              </div>

              <div className="tiny faint">
                {d.teams.lastActive}: {relativeTime(team.last_upload_at ?? team.last_login_at, lang)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
