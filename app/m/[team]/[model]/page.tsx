import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentAccount, currentLang } from "@/lib/session";
import { dict } from "@/lib/i18n";
import {
  modelBySlug,
  versionsOfModel,
  filesOfVersions,
  commentsOfModel,
  activeCriteria,
  myScorecard,
} from "@/lib/queries";
import { getSettings, uploadGate } from "@/lib/settings";
import { folderLink } from "@/lib/drive";
import { formatBytes, absoluteDateTime, relativeTime } from "@/lib/format";
import { DISPLAYABLE_IMAGE } from "@/lib/filetypes";
import { Avatar } from "@/components/Avatar";
import { ModelViewer } from "@/components/ModelViewer";
import { CommentThread } from "@/components/CommentThread";
import { Scorecard } from "@/components/Scorecard";
import {
  toggleLikeAction,
  deleteModelAction,
  deleteVersionAction,
  updateModelAction,
  setCoverAction,
  toggleModelHiddenAction,
} from "@/app/actions/models";

type Params = { team: string; model: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { team, model } = await params;
  const found = await modelBySlug(team, model);
  return { title: found ? `${found.title} · ${found.team_name}` : "Not found" };
}

export default async function ModelPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ v?: string }>;
}) {
  const account = await currentAccount();
  if (!account) redirect("/login");

  const [lang, { team: teamSlug, model: modelSlug }, query, settings] = await Promise.all([
    currentLang(),
    params,
    searchParams,
    getSettings(),
  ]);
  const d = dict(lang);

  const model = await modelBySlug(teamSlug, modelSlug);
  if (!model) notFound();

  const isOwner = account.id === model.team_id;
  const isAdmin = account.role === "admin";

  // A deleted or hidden model stays reachable for its own team and for organizers only.
  if ((model.deleted_at || model.is_hidden) && !isOwner && !isAdmin) notFound();

  const [versions, comments, criteria] = await Promise.all([
    versionsOfModel(model.id, account.id),
    commentsOfModel(model.id, isAdmin),
    activeCriteria(),
  ]);

  if (versions.length === 0) notFound();

  const files = await filesOfVersions(versions.map((v) => v.id));
  const scorecard = isOwner ? null : await myScorecard(model.id, account.id);

  const requested = query.v ? Number(query.v) : NaN;
  const selected = versions.find((v) => v.number === requested) ?? versions[0];
  const selectedFiles = files.filter((f) => f.version_id === selected.id);

  const viewerFile = selected.viewer_file_id
    ? selectedFiles.find((f) => f.id === selected.viewer_file_id)
    : selectedFiles.find((f) => f.is_viewable);
  const screenshots = selectedFiles.filter((f) => f.kind === "screenshot" && DISPLAYABLE_IMAGE.has(f.ext));
  const otherFiles = selectedFiles.filter((f) => f.id !== viewerFile?.id);
  const gate = uploadGate(settings);

  return (
    <>
      {model.deleted_at && <div className="alert alert-warn">{d.model.deletedNotice}</div>}
      {model.is_hidden && <div className="alert alert-warn">{d.model.hiddenByAdmin}</div>}

      <div className="page-head">
        <div className="stack-sm" style={{ minWidth: 0 }}>
          <div className="row row-tight">
            <Link href={`/t/${model.team_slug}`} className="row row-tight">
              <Avatar account={{ name: model.team_name, avatar_type: model.avatar_type, avatar_value: model.avatar_value }} size={26} round />
              <span className="small muted">{model.team_name}</span>
            </Link>
            <span className="faint tiny">·</span>
            <span className="faint tiny">{relativeTime(model.updated_at, lang)}</span>
          </div>
          <h1 className="wrap-any">{model.title}</h1>
          {model.tags.length > 0 && (
            <div className="row row-tight">
              {model.tags.map((tag) => (
                <Link key={tag} href={`/?q=${encodeURIComponent(tag)}`} className="chip">
                  {tag}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="row row-tight">
          {isOwner && gate.ok && (
            <Link href={`/m/${model.team_slug}/${model.slug}/upload`} className="btn btn-primary btn-sm">
              + {d.model.newVersion}
            </Link>
          )}
          {isAdmin && (
            <form action={toggleModelHiddenAction} className="inline-form">
              <input type="hidden" name="modelId" value={model.id} />
              <button className="btn btn-sm">{model.is_hidden ? d.common.unhide : d.common.hide}</button>
            </form>
          )}
        </div>
      </div>

      <div className="split">
        {/* ------------------------------------------------ main column */}
        <div className="stack">
          {viewerFile ? (
            <ModelViewer
              key={viewerFile.id}
              src={`/api/files/${viewerFile.id}`}
              ext={viewerFile.ext}
              lang={lang}
              filename={viewerFile.original_name}
            />
          ) : screenshots.length > 0 ? (
            <div className="viewer" style={{ display: "grid", placeItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- streamed from Drive */}
              <img
                src={`/api/files/${screenshots[0].id}`}
                alt={model.title}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
          ) : (
            <div className="viewer">
              <div className="viewer-overlay">
                <div>
                  <div className="strong">{d.model.viewerMissing}</div>
                  <div className="tiny faint" style={{ marginTop: 6 }}>
                    {d.model.viewerMissingHint}
                  </div>
                </div>
              </div>
            </div>
          )}

          {model.description && (
            <div className="card card-pad">
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{model.description}</p>
            </div>
          )}

          <div className="card card-pad stack-sm">
            <div className="between">
              <h2>
                {d.model.version} {selected.number}
                <span className="faint small" style={{ marginLeft: 8 }}>
                  {selected.name}
                </span>
              </h2>
              <div className="row row-tight">
                <form action={toggleLikeAction} className="inline-form">
                  <input type="hidden" name="versionId" value={selected.id} />
                  <button
                    className={`btn btn-sm${selected.liked_by_me ? " btn-primary" : ""}`}
                    disabled={isOwner}
                    title={isOwner ? d.review.ownModelNote : d.review.like}
                  >
                    ♥ {selected.likes}
                  </button>
                </form>
                {(isOwner || isAdmin) && versions.length > 0 && (
                  <form action={deleteVersionAction} className="inline-form">
                    <input type="hidden" name="versionId" value={selected.id} />
                    <button className="btn btn-danger btn-sm">{d.model.deleteVersion}</button>
                  </form>
                )}
              </div>
            </div>

            <div className="row row-tight tiny faint">
              <span>{absoluteDateTime(selected.created_at, lang)}</span>
              <span>·</span>
              <span>{formatBytes(selected.total_bytes)}</span>
              <span>·</span>
              <span>
                {selectedFiles.length} {d.model.files.toLowerCase()}
              </span>
              {folderLink(selected.drive_folder_id) && (
                <>
                  <span>·</span>
                  <a
                    className="link"
                    href={folderLink(selected.drive_folder_id) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {d.model.openInDrive}
                  </a>
                </>
              )}
            </div>

            {selected.notes ? (
              <p className="small" style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>
                {selected.notes}
              </p>
            ) : (
              <p className="small faint" style={{ margin: "4px 0 0" }}>
                {d.model.noNotes}
              </p>
            )}
          </div>

          {screenshots.length > 0 && (
            <div className="card card-pad stack-sm">
              <h3>{d.model.screenshots}</h3>
              <div className="shots">
                {screenshots.map((shot) => (
                  <div className="shot" key={shot.id}>
                    <a href={`/api/files/${shot.id}`} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- streamed from Drive */}
                      <img src={`/api/files/${shot.id}`} alt={shot.original_name} loading="lazy" />
                    </a>
                    {isOwner && model.cover_file_id !== shot.id && (
                      <form action={setCoverAction} style={{ position: "absolute", bottom: 4, right: 4 }}>
                        <input type="hidden" name="modelId" value={model.id} />
                        <input type="hidden" name="fileId" value={shot.id} />
                        <button className="btn btn-sm tiny" style={{ padding: "2px 6px" }}>
                          {d.model.setCover}
                        </button>
                      </form>
                    )}
                    {model.cover_file_id === shot.id && (
                      <span className="badge" style={{ position: "absolute", bottom: 4, right: 4 }}>
                        {d.model.coverSet}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card card-pad stack-sm">
            <h3>{d.model.files}</h3>
            {viewerFile && <FileRowView file={viewerFile} label={d.upload.viewerPick} />}
            {otherFiles.map((file) => (
              <FileRowView key={file.id} file={file} />
            ))}
          </div>

          <CommentThread
            lang={lang}
            modelId={model.id}
            versionId={selected.id}
            comments={comments}
            viewerId={account.id}
            isAdmin={isAdmin}
          />
        </div>

        {/* ------------------------------------------------ sidebar */}
        <aside className="stack sticky">
          <div className="card card-pad stack-sm">
            <h3>
              {d.model.versions} <span className="faint">{versions.length}</span>
            </h3>
            <div className="versions">
              {versions.map((version) => (
                <Link
                  key={version.id}
                  href={`/m/${model.team_slug}/${model.slug}?v=${version.number}`}
                  className={`version-item${version.id === selected.id ? " active" : ""}`}
                  scroll={false}
                >
                  <span className="version-num">v{version.number}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="small wrap-any">{version.name}</span>
                    <span className="tiny faint" style={{ display: "block" }}>
                      {relativeTime(version.created_at, lang)} · {formatBytes(version.total_bytes)} · ♥{" "}
                      {version.likes}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {!isOwner && criteria.length > 0 && (
            <div className="card card-pad">
              <Scorecard
                lang={lang}
                modelId={model.id}
                criteria={criteria.map((c) => ({
                  id: c.id,
                  label: lang === "ka" ? c.label_ka : c.label_en,
                  max: c.max_score,
                }))}
                initialScores={scorecard?.scores ?? {}}
                initialNote={scorecard?.note ?? ""}
                saved={Boolean(scorecard)}
              />
            </div>
          )}

          {isOwner && (
            <div className="card card-pad stack-sm">
              <p className="small muted" style={{ margin: 0 }}>
                {d.review.ownModelNote}
              </p>

              <details>
                <summary className="btn btn-sm btn-block">{d.model.edit}</summary>
                <form action={updateModelAction} className="stack-sm" style={{ marginTop: 12 }}>
                  <input type="hidden" name="modelId" value={model.id} />
                  <label className="field">
                    <span className="label">{d.upload.modelTitle}</span>
                    <input name="title" defaultValue={model.title} required maxLength={120} />
                  </label>
                  <label className="field">
                    <span className="label">{d.upload.description}</span>
                    <textarea name="description" defaultValue={model.description} rows={3} />
                  </label>
                  <label className="field">
                    <span className="label">{d.model.tags}</span>
                    <input name="tags" defaultValue={model.tags.join(", ")} />
                    <span className="hint">{d.upload.tagsHint}</span>
                  </label>
                  <button className="btn btn-primary btn-sm">{d.common.save}</button>
                </form>
              </details>

              <details>
                <summary className="btn btn-danger btn-sm btn-block">{d.model.delete}</summary>
                <form action={deleteModelAction} style={{ marginTop: 10 }}>
                  <input type="hidden" name="modelId" value={model.id} />
                  <p className="tiny faint">{d.model.deleteModelConfirm}</p>
                  <button className="btn btn-danger btn-sm btn-block">{d.common.delete}</button>
                </form>
              </details>
            </div>
          )}

          {folderLink(model.drive_folder_id) && (isOwner || isAdmin) && (
            <a
              className="btn btn-ghost btn-sm btn-block"
              href={folderLink(model.drive_folder_id) ?? "#"}
              target="_blank"
              rel="noreferrer"
            >
              {d.model.downloadAll}
            </a>
          )}
        </aside>
      </div>
    </>
  );
}

function FileRowView({
  file,
  label,
}: {
  file: { id: string; ext: string; original_name: string; size_bytes: string; kind: string };
  label?: string;
}) {
  return (
    <div className="file-row">
      <span className="file-ext">{file.ext || "?"}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="small wrap-any" style={{ display: "block" }}>
          {file.original_name}
        </span>
        <span className="tiny faint">
          {formatBytes(file.size_bytes)}
          {label ? ` · ${label}` : ""}
        </span>
      </span>
      <a className="btn btn-sm" href={`/api/files/${file.id}?dl=1`} download>
        ↓
      </a>
    </div>
  );
}
