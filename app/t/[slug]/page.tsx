import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentAccount, currentLang } from "@/lib/session";
import { dict } from "@/lib/i18n";
import { teamBySlug, feedModels, teamSummaries } from "@/lib/queries";
import { getSettings, teamStorageUsed } from "@/lib/settings";
import { ModelCard } from "@/components/ModelCard";
import { Avatar } from "@/components/Avatar";
import { formatBytes, absoluteDate, relativeTime } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = await teamBySlug(slug);
  return { title: team?.name ?? "Team" };
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const account = await currentAccount();
  if (!account) redirect("/login");

  const [lang, { slug }, settings] = await Promise.all([currentLang(), params, getSettings()]);
  const d = dict(lang);

  const team = await teamBySlug(slug);
  if (!team) notFound();

  const isSelf = account.id === team.id;
  const isAdmin = account.role === "admin";

  const [models, used, summaries] = await Promise.all([
    feedModels({ teamId: team.id, includeHidden: isSelf || isAdmin, limit: 100 }),
    teamStorageUsed(team.id),
    teamSummaries(true),
  ]);
  const stats = summaries.find((s) => s.id === team.id);
  const maxTeam = Number(settings.max_team_bytes);

  return (
    <>
      <div className="page-head">
        <div className="row">
          <Avatar account={team} size={64} round />
          <div>
            <h1 className="wrap-any">{team.name}</h1>
            <div className="row row-tight tiny faint">
              <span>
                {d.teams.joined} {absoluteDate(team.created_at, lang)}
              </span>
              <span>·</span>
              <span>
                {d.teams.lastActive}: {relativeTime(stats?.last_upload_at ?? team.last_login_at, lang)}
              </span>
              {team.is_disabled && <span className="chip chip-red tiny">{d.admin.teams.disabled}</span>}
            </div>
          </div>
        </div>

        {isSelf && (
          <div className="row row-tight">
            <Link href="/profile" className="btn btn-sm">
              {d.profile.title}
            </Link>
            <Link href="/new" className="btn btn-primary btn-sm">
              + {d.nav.newModel}
            </Link>
          </div>
        )}
      </div>

      <div className="stat-row" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="k">{d.profile.modelsCount}</div>
          <div className="v">{stats?.models ?? 0}</div>
        </div>
        <div className="stat">
          <div className="k">{d.profile.versionsCount}</div>
          <div className="v">{stats?.versions ?? 0}</div>
        </div>
        <div className="stat">
          <div className="k">{d.profile.likesReceived}</div>
          <div className="v">{stats?.likes_received ?? 0}</div>
        </div>
        <div className="stat">
          <div className="k">{d.profile.commentsGiven}</div>
          <div className="v">{stats?.reviews_given ?? 0}</div>
        </div>
        {(isSelf || isAdmin) && (
          <div className="stat">
            <div className="k">{d.profile.storage}</div>
            <div className="v" style={{ fontSize: "1.1rem" }}>
              {d.profile.storageOf(formatBytes(used), formatBytes(maxTeam))}
            </div>
            <div className="progress" style={{ marginTop: 6 }}>
              <i style={{ width: `${Math.min(100, (used / maxTeam) * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {models.length === 0 ? (
        <div className="empty">
          <p className="strong">{d.teams.noModels}</p>
          {isSelf && (
            <Link href="/new" className="btn btn-primary">
              + {d.nav.newModel}
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cards">
          {models.map((model) => (
            <ModelCard key={model.id} model={model} lang={lang} />
          ))}
        </div>
      )}
    </>
  );
}
