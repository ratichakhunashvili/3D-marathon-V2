import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAccount, currentLang } from "@/lib/session";
import { dict } from "@/lib/i18n";
import { feedModels, type FeedSort } from "@/lib/queries";
import { getSettings, uploadGate } from "@/lib/settings";
import { ModelCard } from "@/components/ModelCard";
import { absoluteDateTime } from "@/lib/format";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const account = await currentAccount();
  if (!account) redirect("/login");

  const [lang, params, settings] = await Promise.all([currentLang(), searchParams, getSettings()]);
  const d = dict(lang);

  const sort: FeedSort = params.sort === "liked" || params.sort === "discussed" ? params.sort : "newest";
  const search = params.q ?? "";
  const models = await feedModels({ search, sort, includeHidden: account.role === "admin" });
  const gate = uploadGate(settings);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{d.feed.title}</h1>
          <p className="muted small" style={{ margin: 0 }}>
            {settings.deadline_at && gate.ok
              ? `${d.admin.settings.deadline}: ${absoluteDateTime(settings.deadline_at, lang)}`
              : null}
          </p>
        </div>

        <form className="row row-tight" action="/">
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder={d.feed.search}
            style={{ width: 210 }}
          />
          <select name="sort" defaultValue={sort} style={{ width: "auto" }}>
            <option value="newest">{d.feed.sortNewest}</option>
            <option value="liked">{d.feed.sortLiked}</option>
            <option value="discussed">{d.feed.sortDiscussed}</option>
          </select>
          <button className="btn btn-sm" type="submit">
            {d.feed.sort}
          </button>
        </form>
      </div>

      {!gate.ok && (
        <div className="alert alert-warn">
          {gate.reason === "frozen" ? d.upload.frozen : d.upload.pastDeadline}
        </div>
      )}

      {models.length === 0 ? (
        <div className="empty">
          <p className="strong">{search ? d.feed.noResults : d.feed.empty}</p>
          {!search && account.role === "team" && (
            <>
              <p className="small">{d.feed.emptyHint}</p>
              <Link href="/new" className="btn btn-primary">
                + {d.nav.newModel}
              </Link>
            </>
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
