import Link from "next/link";
import { Avatar } from "./Avatar";
import type { FeedModel } from "@/lib/queries";
import { dict, type Lang } from "@/lib/i18n";
import { relativeTime } from "@/lib/format";

export function ModelCard({ model, lang }: { model: FeedModel; lang: Lang }) {
  const d = dict(lang);
  const href = `/m/${model.team_slug}/${model.slug}`;

  return (
    <article className="model-card">
      <Link href={href}>
        <div className="thumb">
          {model.cover_file_id ? (
            /* eslint-disable-next-line @next/next/no-img-element -- streamed from Drive at runtime */
            <img src={`/api/files/${model.cover_file_id}`} alt={model.title} loading="lazy" />
          ) : (
            <span className="thumb-ext">
              <span style={{ fontSize: 26, opacity: 0.5 }}>◈</span>
              {model.latest_ext ? `.${model.latest_ext}` : "3D"}
            </span>
          )}
          <div className="thumb-badges">
            {model.is_hidden && <span className="badge">{d.model.hiddenByAdmin}</span>}
            <span className="badge">
              v{model.latest_number ?? 1} · {model.version_count}
            </span>
          </div>
        </div>
      </Link>

      <div className="model-card-body">
        <Link href={href} className="model-card-title">
          {model.title}
        </Link>

        {model.latest_name && <div className="tiny faint wrap-any">{model.latest_name}</div>}

        <div className="meta-row">
          <Link href={`/t/${model.team_slug}`} className="row row-tight" style={{ minWidth: 0 }}>
            <Avatar account={{ name: model.team_name, avatar_type: model.avatar_type, avatar_value: model.avatar_value }} size={20} round />
            <span className="muted tiny nowrap" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {model.team_name}
            </span>
          </Link>
          <span className="spacer" />
          <span title={d.review.comments}>♥ {model.likes}</span>
          <span title={d.review.comments}>💬 {model.comments}</span>
        </div>

        <div className="tiny faint">{relativeTime(model.updated_at, lang)}</div>
      </div>
    </article>
  );
}
