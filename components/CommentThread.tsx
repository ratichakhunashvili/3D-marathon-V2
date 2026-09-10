import Link from "next/link";
import { Avatar } from "./Avatar";
import { addCommentAction, deleteCommentAction } from "@/app/actions/models";
import type { CommentRow } from "@/lib/queries";
import { dict, type Lang } from "@/lib/i18n";
import { relativeTime } from "@/lib/format";

/**
 * Comment list plus the forms to add and remove them. Deliberately server-rendered with plain
 * <form action={serverAction}> — it works before any JavaScript loads, which matters on a
 * school Wi-Fi network during a hackathon.
 */
export function CommentThread({
  lang,
  modelId,
  versionId,
  comments,
  viewerId,
  isAdmin,
}: {
  lang: Lang;
  modelId: string;
  versionId: string | null;
  comments: CommentRow[];
  viewerId: string;
  isAdmin: boolean;
}) {
  const d = dict(lang).review;
  const roots = comments.filter((c) => !c.parent_id);
  const repliesOf = (id: string) => comments.filter((c) => c.parent_id === id);

  return (
    <section className="card card-pad">
      <div className="between" style={{ marginBottom: 12 }}>
        <h2>
          {d.comments} <span className="faint">{comments.length ? comments.length : ""}</span>
        </h2>
      </div>

      <form action={addCommentAction} className="stack-sm" style={{ marginBottom: 14 }}>
        <input type="hidden" name="modelId" value={modelId} />
        {versionId && <input type="hidden" name="versionId" value={versionId} />}
        <textarea name="body" placeholder={d.placeholder} rows={3} required maxLength={2000} />
        <div>
          <button type="submit" className="btn btn-primary btn-sm">
            {d.post}
          </button>
        </div>
      </form>

      {roots.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          {d.noComments}
        </p>
      ) : (
        <div>
          {roots.map((comment) => (
            <div className="comment" key={comment.id}>
              <Avatar
                account={{
                  name: comment.author_name,
                  avatar_type: comment.avatar_type ?? "preset",
                  avatar_value: comment.avatar_value ?? "geo-01",
                }}
                size={32}
                round
              />
              <div className="comment-body">
                <CommentHeader comment={comment} lang={lang} viewerId={viewerId} isAdmin={isAdmin} d={d} />
                <div className="comment-text small">{comment.body}</div>

                <details style={{ marginTop: 6 }}>
                  <summary className="tiny faint" style={{ cursor: "pointer" }}>
                    {d.reply}
                  </summary>
                  <form action={addCommentAction} className="stack-sm" style={{ marginTop: 8 }}>
                    <input type="hidden" name="modelId" value={modelId} />
                    <input type="hidden" name="parentId" value={comment.id} />
                    {comment.version_id && <input type="hidden" name="versionId" value={comment.version_id} />}
                    <textarea name="body" placeholder={d.replyPlaceholder} rows={2} required maxLength={2000} />
                    <div>
                      <button type="submit" className="btn btn-sm">
                        {d.reply}
                      </button>
                    </div>
                  </form>
                </details>

                {repliesOf(comment.id).length > 0 && (
                  <div className="replies">
                    {repliesOf(comment.id).map((reply) => (
                      <div className="comment" key={reply.id} style={{ borderTop: 0, paddingTop: 8 }}>
                        <Avatar
                          account={{
                            name: reply.author_name,
                            avatar_type: reply.avatar_type ?? "preset",
                            avatar_value: reply.avatar_value ?? "geo-01",
                          }}
                          size={26}
                          round
                        />
                        <div className="comment-body">
                          <CommentHeader comment={reply} lang={lang} viewerId={viewerId} isAdmin={isAdmin} d={d} />
                          <div className="comment-text small">{reply.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CommentHeader({
  comment,
  lang,
  viewerId,
  isAdmin,
  d,
}: {
  comment: CommentRow;
  lang: Lang;
  viewerId: string;
  isAdmin: boolean;
  d: ReturnType<typeof dict>["review"];
}) {
  const canDelete = comment.author_id === viewerId || isAdmin;

  return (
    <div className="row row-tight tiny">
      {comment.author_slug ? (
        <Link href={`/t/${comment.author_slug}`} className="strong">
          {comment.author_name}
        </Link>
      ) : (
        <span className="strong">{comment.author_name}</span>
      )}
      <span className="faint">{relativeTime(comment.created_at, lang)}</span>
      {comment.is_hidden && <span className="chip chip-amber tiny">hidden</span>}
      {canDelete && (
        <form action={deleteCommentAction} className="inline-form">
          <input type="hidden" name="commentId" value={comment.id} />
          <button type="submit" className="btn btn-ghost btn-sm tiny" style={{ padding: "1px 6px" }}>
            {d.delete}
          </button>
        </form>
      )}
    </div>
  );
}
