import Link from "next/link";
import { currentLang } from "@/lib/session";
import { dict } from "@/lib/i18n";
import { teamSummaries, globalStats, uploadsPerDay, recentActivity } from "@/lib/queries";
import { getSettings, uploadGate } from "@/lib/settings";
import { driveStatus } from "@/lib/drive";
import { Avatar } from "@/components/Avatar";
import { formatBytes, relativeTime, absoluteDateTime } from "@/lib/format";

const TREND_DAYS = 10;

export default async function AdminDashboard() {
  const [lang, teams, stats, trend, settings, drive, activity] = await Promise.all([
    currentLang(),
    teamSummaries(true),
    globalStats(),
    uploadsPerDay(TREND_DAYS),
    getSettings(),
    driveStatus(),
    recentActivity(12),
  ]);

  const d = dict(lang);
  const dash = d.admin.dashboard;
  const gate = uploadGate(settings);

  return (
    <div className="stack">
      {!drive.connected && (
        <div className="alert alert-error">
          {d.admin.settings.driveDisconnected}{" "}
          <Link href="/admin/settings" className="link">
            {d.admin.settings.driveConnect}
          </Link>
        </div>
      )}
      {!gate.ok && (
        <div className="alert alert-warn">
          {gate.reason === "frozen" ? d.upload.frozen : d.upload.pastDeadline}
          {settings.deadline_at ? ` · ${absoluteDateTime(settings.deadline_at, lang)}` : ""}
        </div>
      )}

      <div className="stat-row">
        <div className="stat">
          <div className="k">{dash.teamsTotal}</div>
          <div className="v">{stats?.teams ?? 0}</div>
        </div>
        <div className="stat">
          <div className="k">{dash.modelsTotal}</div>
          <div className="v">{stats?.models ?? 0}</div>
        </div>
        <div className="stat">
          <div className="k">{dash.versionsTotal}</div>
          <div className="v">{stats?.versions ?? 0}</div>
        </div>
        <div className="stat">
          <div className="k">{dash.storageTotal}</div>
          <div className="v" style={{ fontSize: "1.2rem" }}>
            {formatBytes(stats?.bytes ?? 0)}
          </div>
        </div>
        <div className="stat">
          <div className="k">{dash.reviewsTotal}</div>
          <div className="v">
            {stats?.comments ?? 0} <span className="faint" style={{ fontSize: "0.8rem" }}>· {stats?.submissions ?? 0}</span>
          </div>
        </div>
      </div>

      <section>
        <div className="between" style={{ marginBottom: 12 }}>
          <h2>{dash.title}</h2>
          <span className="tiny faint">{dash.versionsTrend} · {TREND_DAYS}d</span>
        </div>

        {teams.length === 0 ? (
          <div className="empty">
            {d.teams.empty}{" "}
            <Link href="/admin/teams" className="link">
              {d.admin.teams.create}
            </Link>
          </div>
        ) : (
          <div className="grid grid-2">
            {teams.map((team) => {
              const bars = trend[team.id] ?? Array.from({ length: TREND_DAYS }, () => 0);
              const peak = Math.max(1, ...bars);

              return (
                <div className="card card-pad stack-sm" key={team.id}>
                  <div className="row">
                    <Avatar account={team} size={38} round />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Link href={`/t/${team.slug}`} className="strong wrap-any">
                        {team.name}
                      </Link>
                      <div className="tiny faint">
                        {team.models} {d.teams.models} · {team.versions} {d.model.versions.toLowerCase()} ·{" "}
                        {formatBytes(team.bytes)}
                      </div>
                    </div>
                    {team.is_disabled && <span className="chip chip-red tiny">{d.admin.teams.disabled}</span>}
                  </div>

                  <div className="spark">
                    {bars.map((value, index) => (
                      <i
                        key={index}
                        className={value === 0 ? "zero" : undefined}
                        style={{ height: value === 0 ? 3 : `${Math.max(12, (value / peak) * 100)}%` }}
                        title={`${value}`}
                      />
                    ))}
                  </div>

                  <div className="row row-tight tiny faint">
                    <span>♥ {team.likes_received}</span>
                    <span>·</span>
                    <span>
                      {team.reviews_given} {dash.given} / {team.reviews_received} {dash.received}
                    </span>
                  </div>

                  <div className="row row-tight tiny">
                    {team.versions === 0 ? (
                      <span className="chip chip-red">{dash.inactive}</span>
                    ) : team.is_quiet ? (
                      <span className="chip chip-amber">{dash.quiet}</span>
                    ) : (
                      <span className="chip chip-green">{relativeTime(team.last_upload_at, lang)}</span>
                    )}
                    {!team.password_changed_at && (
                      <span className="chip tiny">{d.admin.teams.stillDefaultPassword}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card card-pad">
        <div className="between" style={{ marginBottom: 8 }}>
          <h2>{d.admin.activity.title}</h2>
          <Link href="/admin/activity" className="link small">
            {d.common.open}
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            {d.admin.activity.empty}
          </p>
        ) : (
          <div className="stack-sm">
            {activity.map((row) => (
              <div className="row row-tight tiny" key={row.id}>
                <span className="faint nowrap" style={{ width: 70 }}>
                  {relativeTime(row.at, lang)}
                </span>
                <span className="strong">{row.actor_name}</span>
                <span className="muted">{row.action}</span>
                {row.model_title && row.team_slug && row.model_slug && (
                  <Link href={`/m/${row.team_slug}/${row.model_slug}`} className="link wrap-any">
                    {row.model_title}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
