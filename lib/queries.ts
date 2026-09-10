import { sql, rows, one } from "./db";
import { DISPLAYABLE_IMAGE } from "./filetypes";

const IMAGE_EXTS = [...DISPLAYABLE_IMAGE];

export type FeedSort = "newest" | "liked" | "discussed";

export type FeedModel = {
  id: string;
  title: string;
  slug: string;
  updated_at: string;
  is_hidden: boolean;
  team_id: string;
  team_name: string;
  team_slug: string;
  avatar_type: "preset" | "upload";
  avatar_value: string;
  version_count: number;
  latest_number: number | null;
  latest_name: string | null;
  latest_ext: string | null;
  cover_file_id: string | null;
  likes: number;
  comments: number;
  total_bytes: string;
};

/** The feed. `includeHidden` is only ever true for admins. */
export async function feedModels(opts: {
  search?: string;
  sort?: FeedSort;
  teamId?: string;
  limit?: number;
  includeHidden?: boolean;
  includeDeleted?: boolean;
}): Promise<FeedModel[]> {
  const pattern = opts.search?.trim() ? `%${opts.search.trim()}%` : null;
  const sort: FeedSort = opts.sort ?? "newest";

  return rows<FeedModel>(
    await sql`
      select * from (
        select
          m.id, m.title, m.slug, m.updated_at, m.is_hidden, m.team_id,
          a.name as team_name, a.slug as team_slug, a.avatar_type, a.avatar_value,
          (select count(*)::int from versions v
             where v.model_id = m.id and v.deleted_at is null) as version_count,
          lv.number as latest_number,
          lv.name as latest_name,
          lv.main_ext as latest_ext,
          coalesce(cover.id, shot.id) as cover_file_id,
          (select count(*)::int from likes l
             join versions vl on vl.id = l.version_id
             where vl.model_id = m.id and vl.deleted_at is null) as likes,
          (select count(*)::int from comments c
             where c.model_id = m.id and c.deleted_at is null and c.is_hidden = false) as comments,
          (select coalesce(sum(v2.total_bytes), 0)::text from versions v2
             where v2.model_id = m.id and v2.deleted_at is null) as total_bytes
        from models m
        join accounts a on a.id = m.team_id
        left join lateral (
          select v.number, v.name,
                 (select f.ext from files f
                    where f.version_id = v.id and f.kind = 'model'
                    order by f.is_viewable desc, f.sort_order limit 1) as main_ext
          from versions v
          where v.model_id = m.id and v.deleted_at is null
          order by v.number desc limit 1
        ) lv on true
        left join files cover on cover.id = m.cover_file_id and cover.upload_state = 'complete'
        left join lateral (
          select f.id
          from files f
          join versions v3 on v3.id = f.version_id
          where v3.model_id = m.id and v3.deleted_at is null and f.upload_state = 'complete'
            and f.ext = any(${IMAGE_EXTS}::text[])
          order by (f.kind = 'screenshot') desc, v3.number desc, f.sort_order
          limit 1
        ) shot on true
        where (${opts.includeDeleted ?? false} or m.deleted_at is null)
          and (${opts.includeHidden ?? false} or m.is_hidden = false)
          and (${opts.teamId ?? null}::uuid is null or m.team_id = ${opts.teamId ?? null}::uuid)
          and (
            ${pattern}::text is null
            or m.title ilike ${pattern}
            or a.name ilike ${pattern}
            or exists (select 1 from unnest(m.tags) tg where tg ilike ${pattern})
          )
      ) q
      order by
        case when ${sort} = 'liked' then q.likes
             when ${sort} = 'discussed' then q.comments
             else null end desc nulls last,
        q.updated_at desc
      limit ${opts.limit ?? 60}
    `,
  );
}

export type ModelDetail = {
  id: string;
  title: string;
  slug: string;
  description: string;
  tags: string[];
  team_id: string;
  team_name: string;
  team_slug: string;
  avatar_type: "preset" | "upload";
  avatar_value: string;
  drive_folder_id: string | null;
  cover_file_id: string | null;
  is_hidden: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function modelBySlug(teamSlug: string, modelSlug: string): Promise<ModelDetail | null> {
  return one<ModelDetail>(
    await sql`
      select m.id, m.title, m.slug, m.description, m.tags, m.team_id,
             a.name as team_name, a.slug as team_slug, a.avatar_type, a.avatar_value,
             m.drive_folder_id, m.cover_file_id, m.is_hidden, m.deleted_at,
             m.created_at, m.updated_at
      from models m
      join accounts a on a.id = m.team_id
      where a.slug = ${teamSlug} and m.slug = ${modelSlug}
      limit 1
    `,
  );
}

export type VersionRow = {
  id: string;
  number: number;
  name: string;
  notes: string;
  drive_folder_id: string | null;
  viewer_file_id: string | null;
  total_bytes: string;
  is_hidden: boolean;
  created_at: string;
  likes: number;
  liked_by_me: boolean;
};

export async function versionsOfModel(modelId: string, viewerId: string | null): Promise<VersionRow[]> {
  return rows<VersionRow>(
    await sql`
      select v.id, v.number, v.name, v.notes, v.drive_folder_id, v.viewer_file_id,
             v.total_bytes, v.is_hidden, v.created_at,
             (select count(*)::int from likes l where l.version_id = v.id) as likes,
             exists (
               select 1 from likes l2
               where l2.version_id = v.id and l2.team_id = ${viewerId}::uuid
             ) as liked_by_me
      from versions v
      where v.model_id = ${modelId} and v.deleted_at is null
      order by v.number desc
    `,
  );
}

export type FileRow = {
  id: string;
  version_id: string;
  kind: "model" | "texture" | "screenshot" | "other";
  original_name: string;
  ext: string;
  mime: string;
  size_bytes: string;
  drive_file_id: string | null;
  is_viewable: boolean;
  sort_order: number;
};

export async function filesOfVersions(versionIds: string[]): Promise<FileRow[]> {
  if (!versionIds.length) return [];
  return rows<FileRow>(
    await sql`
      select id, version_id, kind, original_name, ext, mime, size_bytes,
             drive_file_id, is_viewable, sort_order
      from files
      where version_id = any(${versionIds}::uuid[]) and upload_state = 'complete'
      order by (kind = 'model') desc, sort_order, original_name
    `,
  );
}

export type CommentRow = {
  id: string;
  version_id: string | null;
  parent_id: string | null;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
  is_hidden: boolean;
  avatar_type: "preset" | "upload" | null;
  avatar_value: string | null;
  author_slug: string | null;
};

export async function commentsOfModel(modelId: string, includeHidden = false): Promise<CommentRow[]> {
  return rows<CommentRow>(
    await sql`
      select c.id, c.version_id, c.parent_id, c.author_id, c.author_name, c.body,
             c.created_at, c.is_hidden,
             a.avatar_type, a.avatar_value, a.slug as author_slug
      from comments c
      left join accounts a on a.id = c.author_id
      where c.model_id = ${modelId}
        and c.deleted_at is null
        and (${includeHidden} or c.is_hidden = false)
      order by c.created_at
    `,
  );
}

export type TeamSummary = {
  id: string;
  name: string;
  slug: string;
  avatar_type: "preset" | "upload";
  avatar_value: string;
  is_disabled: boolean;
  password_changed_at: string | null;
  created_at: string;
  last_login_at: string | null;
  models: number;
  versions: number;
  bytes: string;
  likes_received: number;
  reviews_given: number;
  reviews_received: number;
  last_upload_at: string | null;
  is_quiet: boolean;
};

/**
 * Per-team rollups. Seven correlated subqueries per row, so pass `teamId` when
 * you only need one team — /t/[slug] used to compute the whole event's numbers
 * to render a single profile.
 */
export async function teamSummaries(includeDisabled = true, teamId?: string): Promise<TeamSummary[]> {
  return rows<TeamSummary>(
    await sql`
      select a.id, a.name, a.slug, a.avatar_type, a.avatar_value, a.is_disabled,
             a.password_changed_at, a.created_at, a.last_login_at,
             (select count(*)::int from models m
                where m.team_id = a.id and m.deleted_at is null) as models,
             (select count(*)::int from versions v
                join models m2 on m2.id = v.model_id
                where m2.team_id = a.id and v.deleted_at is null and m2.deleted_at is null) as versions,
             (select coalesce(sum(v2.total_bytes), 0)::text from versions v2
                join models m3 on m3.id = v2.model_id
                where m3.team_id = a.id and v2.deleted_at is null and m3.deleted_at is null) as bytes,
             (select count(*)::int from likes l
                join versions v3 on v3.id = l.version_id
                join models m4 on m4.id = v3.model_id
                where m4.team_id = a.id) as likes_received,
             (select count(*)::int from comments c
                where c.author_id = a.id and c.deleted_at is null) as reviews_given,
             (select count(*)::int from comments c2
                join models m5 on m5.id = c2.model_id
                where m5.team_id = a.id and c2.deleted_at is null and c2.author_id <> a.id) as reviews_received,
             lu.at as last_upload_at,
             -- Computed by Postgres, not by the page: "now" must not be read during render.
             (lu.at is not null and lu.at < now() - interval '1 day') as is_quiet
      from accounts a
      left join lateral (
        select max(v4.created_at) as at
        from versions v4
        join models m6 on m6.id = v4.model_id
        where m6.team_id = a.id and v4.deleted_at is null
      ) lu on true
      where a.role = 'team'
        and (${includeDisabled} or a.is_disabled = false)
        and (${teamId ?? null}::uuid is null or a.id = ${teamId ?? null}::uuid)
      order by a.name
    `,
  );
}

/** Just the id/name pairs — for the activity page's filter dropdown, which does
 *  not need any of the rollups `teamSummaries` computes. */
export async function teamNames(): Promise<{ id: string; name: string }[]> {
  return rows<{ id: string; name: string }>(
    await sql`select id, name from accounts where role = 'team' order by name`,
  );
}

export async function teamBySlug(slug: string) {
  return one<{
    id: string;
    name: string;
    slug: string;
    avatar_type: "preset" | "upload";
    avatar_value: string;
    is_disabled: boolean;
    created_at: string;
    last_login_at: string | null;
  }>(
    await sql`
      select id, name, slug, avatar_type, avatar_value, is_disabled, created_at, last_login_at
      from accounts
      where slug = ${slug} and role = 'team'
      limit 1
    `,
  );
}

export type Criterion = {
  id: string;
  key: string;
  label_en: string;
  label_ka: string;
  max_score: number;
  sort_order: number;
  is_active: boolean;
};

export async function activeCriteria(): Promise<Criterion[]> {
  return rows<Criterion>(
    await sql`
      select id, key, label_en, label_ka, max_score, sort_order, is_active
      from rubric_criteria
      where is_active = true
      order by sort_order, label_en
    `,
  );
}

export async function allCriteria(): Promise<Criterion[]> {
  return rows<Criterion>(
    await sql`
      select id, key, label_en, label_ka, max_score, sort_order, is_active
      from rubric_criteria
      order by sort_order, label_en
    `,
  );
}

/** The signed-in reviewer's own scorecard for a model, as a criterion-id -> score map. */
export async function myScorecard(
  modelId: string,
  reviewerId: string,
): Promise<{ note: string; scores: Record<string, number> } | null> {
  const submission = one<{ id: string; note: string }>(
    await sql`
      select id, note from rubric_submissions
      where model_id = ${modelId} and reviewer_id = ${reviewerId}
      limit 1
    `,
  );
  if (!submission) return null;

  const scoreRows = rows<{ criterion_id: string; score: number }>(
    await sql`select criterion_id, score from rubric_scores where submission_id = ${submission.id}`,
  );

  const scores: Record<string, number> = {};
  for (const r of scoreRows) scores[r.criterion_id] = r.score;
  return { note: submission.note, scores };
}

export type ModelScore = {
  model_id: string;
  title: string;
  model_slug: string;
  team_name: string;
  team_slug: string;
  submissions: number;
  avg_total: number | null;
  max_total: number;
};

/** Peer-score averages. Admin-only by design — teams never see this. */
export async function modelScores(): Promise<ModelScore[]> {
  return rows<ModelScore>(
    await sql`
      with per_submission as (
        select s.id, s.model_id, sum(sc.score)::numeric as total
        from rubric_submissions s
        left join rubric_scores sc on sc.submission_id = s.id
        group by s.id, s.model_id
      )
      select m.id as model_id, m.title, m.slug as model_slug,
             a.name as team_name, a.slug as team_slug,
             count(ps.id)::int as submissions,
             round(avg(ps.total), 1)::float8 as avg_total,
             (select coalesce(sum(max_score), 0)::int from rubric_criteria where is_active) as max_total
      from models m
      join accounts a on a.id = m.team_id
      left join per_submission ps on ps.model_id = m.id
      where m.deleted_at is null
      group by m.id, m.title, m.slug, a.name, a.slug
      order by avg_total desc nulls last, m.title
    `,
  );
}

export type CriterionAverage = {
  model_id: string;
  criterion_id: string;
  label_en: string;
  label_ka: string;
  max_score: number;
  avg: number | null;
  n: number;
};

/**
 * Per-criterion averages for many models at once, for the admin score detail.
 * Takes every model in one query — the page previously issued one round trip
 * per model, which on Neon's HTTP driver meant up to 40 separate requests.
 * Each model still gets a row per active criterion (avg null when unscored),
 * hence the cross join.
 */
export async function criterionAveragesFor(modelIds: string[]): Promise<CriterionAverage[]> {
  if (!modelIds.length) return [];
  return rows<CriterionAverage>(
    await sql`
      with wanted as (select unnest(${modelIds}::uuid[]) as model_id)
      select w.model_id::text as model_id, rc.id as criterion_id,
             rc.label_en, rc.label_ka, rc.max_score,
             round(avg(sc.score), 1)::float8 as avg, count(sc.score)::int as n
      from wanted w
      cross join rubric_criteria rc
      left join rubric_submissions s on s.model_id = w.model_id
      left join rubric_scores sc on sc.submission_id = s.id and sc.criterion_id = rc.id
      where rc.is_active = true
      group by w.model_id, rc.id, rc.label_en, rc.label_ka, rc.max_score, rc.sort_order
      order by w.model_id, rc.sort_order
    `,
  );
}

export type ActivityRow = {
  id: string;
  at: string;
  actor_name: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  team_id: string | null;
  model_id: string | null;
  meta: Record<string, unknown>;
  model_title: string | null;
  model_slug: string | null;
  team_slug: string | null;
};

export async function recentActivity(limit = 100, teamId?: string | null): Promise<ActivityRow[]> {
  return rows<ActivityRow>(
    await sql`
      select ac.id::text, ac.at, ac.actor_name, ac.action, ac.target_type, ac.target_id,
             ac.team_id, ac.model_id, ac.meta,
             m.title as model_title, m.slug as model_slug, a.slug as team_slug
      from activity ac
      left join models m on m.id = ac.model_id
      left join accounts a on a.id = coalesce(ac.team_id, m.team_id)
      where (${teamId ?? null}::uuid is null or ac.team_id = ${teamId ?? null}::uuid or m.team_id = ${teamId ?? null}::uuid)
      order by ac.at desc
      limit ${limit}
    `,
  );
}

/** Uploads per day for the last `days` days, used for the admin sparklines. */
export async function uploadsPerDay(days = 10): Promise<Record<string, number[]>> {
  const data = rows<{ team_id: string; day_index: number; n: number }>(
    await sql`
      select m.team_id,
             (date_part('day', date_trunc('day', now()) - date_trunc('day', v.created_at)))::int as day_index,
             count(*)::int as n
      from versions v
      join models m on m.id = v.model_id
      where v.created_at > now() - (${days} || ' days')::interval
      group by m.team_id, day_index
    `,
  );

  const out: Record<string, number[]> = {};
  for (const row of data) {
    if (!out[row.team_id]) out[row.team_id] = Array.from({ length: days }, () => 0);
    const slot = days - 1 - row.day_index;
    if (slot >= 0 && slot < days) out[row.team_id][slot] = row.n;
  }
  return out;
}

export async function globalStats() {
  return one<{
    teams: number;
    models: number;
    versions: number;
    bytes: string;
    comments: number;
    submissions: number;
  }>(
    await sql`
      select
        (select count(*)::int from accounts where role = 'team' and is_disabled = false) as teams,
        (select count(*)::int from models where deleted_at is null) as models,
        (select count(*)::int from versions v join models m on m.id = v.model_id
           where v.deleted_at is null and m.deleted_at is null) as versions,
        (select coalesce(sum(v.total_bytes), 0)::text from versions v join models m on m.id = v.model_id
           where v.deleted_at is null and m.deleted_at is null) as bytes,
        (select count(*)::int from comments where deleted_at is null) as comments,
        (select count(*)::int from rubric_submissions) as submissions
    `,
  );
}
