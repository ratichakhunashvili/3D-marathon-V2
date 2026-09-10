import { currentLang } from "@/lib/session";
import { dict } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { allCriteria } from "@/lib/queries";
import { driveStatus, folderLink, oauthConfig } from "@/lib/drive";
import { MB } from "@/lib/format";
import { disconnectDriveAction, upsertCriterionAction, deleteCriterionAction, cleanupPendingAction } from "@/app/actions/admin";
import { SettingsForm, DriveRootForm, DriveCheckButton } from "./forms";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ drive?: string }>;
}) {
  const [lang, settings, criteria, drive, params] = await Promise.all([
    currentLang(),
    getSettings(),
    allCriteria(),
    driveStatus(),
    searchParams,
  ]);
  const d = dict(lang).admin.settings;
  const envReady = Boolean(oauthConfig());

  return (
    <div className="stack">
      {/* ------------------------------------------------ Google Drive */}
      <section className="card card-pad stack-sm">
        <h2>{d.drive}</h2>

        {params.drive === "ok" && <div className="alert alert-ok">{d.driveOk}</div>}
        {params.drive && params.drive !== "ok" && (
          <div className="alert alert-error">
            {d.driveError}: {params.drive}
          </div>
        )}

        {!envReady && (
          <div className="alert alert-warn">
            GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI are not set. See
            <code> docs/SETUP-GOOGLE-DRIVE.md</code>.
          </div>
        )}

        <div className="between">
          <div className="stack-sm">
            <span className={`chip ${drive.connected ? "chip-green" : "chip-red"}`}>
              {drive.connected && drive.email ? d.driveConnected(drive.email) : d.driveDisconnected}
            </span>
            {drive.rootFolderId && (
              <a className="link tiny" href={folderLink(drive.rootFolderId) ?? "#"} target="_blank" rel="noreferrer">
                {d.driveFolder}: {d.driveOpen} ↗
              </a>
            )}
            {drive.rootIsExternal && (
              <span className="chip chip-amber tiny">
                full Drive access (pinned folder)
              </span>
            )}
          </div>

          <div className="row row-tight">
            <a className="btn btn-primary btn-sm" href="/api/drive/connect">
              {drive.connected ? d.driveReconnect : d.driveConnect}
            </a>
            {drive.connected && (
              <form action={disconnectDriveAction} className="inline-form">
                <button className="btn btn-danger btn-sm">✕</button>
              </form>
            )}
          </div>
        </div>

        <hr />
        <DriveRootForm lang={lang} currentId={drive.rootFolderId} isExternal={drive.rootIsExternal} />

        {drive.connected && <DriveCheckButton lang={lang} />}
      </section>

      {/* ------------------------------------------------ event settings */}
      <section className="card card-pad">
        <SettingsForm
          lang={lang}
          initial={{
            eventName: settings.event_name,
            deadlineAt: settings.deadline_at,
            frozen: settings.uploads_frozen,
            reveal: settings.reveal_scores,
            maxFileMb: Math.round(Number(settings.max_file_bytes) / MB),
            maxTeamMb: Math.round(Number(settings.max_team_bytes) / MB),
          }}
        />
      </section>

      {/* ------------------------------------------------ rubric */}
      <section className="card card-pad stack-sm">
        <h2>{d.rubric}</h2>

        {criteria.map((criterion) => (
          <form action={upsertCriterionAction} className="row" key={criterion.id} style={{ alignItems: "flex-end" }}>
            <input type="hidden" name="criterionId" value={criterion.id} />
            <label className="field" style={{ flex: "1 1 160px", marginBottom: 0 }}>
              <span className="label tiny">EN</span>
              <input name="label_en" defaultValue={criterion.label_en} maxLength={80} />
            </label>
            <label className="field" style={{ flex: "1 1 160px", marginBottom: 0 }}>
              <span className="label tiny">ქარ</span>
              <input name="label_ka" defaultValue={criterion.label_ka} maxLength={80} />
            </label>
            <label className="field" style={{ flex: "0 0 80px", marginBottom: 0 }}>
              <span className="label tiny">{d.rubricMax}</span>
              <input name="max_score" type="number" min={1} max={100} defaultValue={criterion.max_score} />
            </label>
            <label className="row row-tight small" style={{ paddingBottom: 8 }}>
              <input type="checkbox" name="is_active" defaultChecked={criterion.is_active} />
              {d.rubricActive}
            </label>
            <button className="btn btn-sm">{d.save}</button>
          </form>
        ))}

        <hr />

        <form action={upsertCriterionAction} className="row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 160px", marginBottom: 0 }}>
            <span className="label tiny">EN</span>
            <input name="label_en" placeholder={d.rubricLabel} maxLength={80} required />
          </label>
          <label className="field" style={{ flex: "1 1 160px", marginBottom: 0 }}>
            <span className="label tiny">ქარ</span>
            <input name="label_ka" placeholder={d.rubricLabel} maxLength={80} />
          </label>
          <label className="field" style={{ flex: "0 0 80px", marginBottom: 0 }}>
            <span className="label tiny">{d.rubricMax}</span>
            <input name="max_score" type="number" min={1} max={100} defaultValue={10} />
          </label>
          <button className="btn btn-primary btn-sm">{d.rubricAdd}</button>
        </form>

        {criteria.some((c) => c.is_active) && (
          <details>
            <summary className="tiny faint" style={{ cursor: "pointer" }}>
              {dict(lang).common.delete}
            </summary>
            <div className="stack-sm" style={{ marginTop: 8 }}>
              {criteria
                .filter((c) => c.is_active)
                .map((criterion) => (
                  <form action={deleteCriterionAction} className="row row-tight" key={`del-${criterion.id}`}>
                    <input type="hidden" name="criterionId" value={criterion.id} />
                    <span className="small muted" style={{ flex: 1 }}>
                      {criterion.label_en}
                    </span>
                    <button className="btn btn-danger btn-sm">{dict(lang).common.hide}</button>
                  </form>
                ))}
              <p className="tiny faint" style={{ margin: 0 }}>
                Deactivating keeps the scores already given.
              </p>
            </div>
          </details>
        )}
      </section>

      {/* ------------------------------------------------ exports & maintenance */}
      <section className="card card-pad stack-sm">
        <h2>{d.export}</h2>
        <div className="row row-tight">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler that returns a CSV download, not a page */}
          <a className="btn btn-sm" href="/api/export/teams">
            {d.exportTeams}
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler that returns a CSV download, not a page */}
          <a className="btn btn-sm" href="/api/export/models">
            {d.exportModels}
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler that returns a CSV download, not a page */}
          <a className="btn btn-sm" href="/api/export/scores">
            {d.exportScores}
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler that returns a CSV download, not a page */}
          <a className="btn btn-sm" href="/api/export/activity">
            {d.exportActivity}
          </a>
        </div>

        <hr />
        <form action={cleanupPendingAction}>
          <button className="btn btn-ghost btn-sm">Clean up abandoned uploads</button>
        </form>
      </section>
    </div>
  );
}
