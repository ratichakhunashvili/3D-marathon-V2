-- ModelHub schema.  Safe to re-run: everything is IF NOT EXISTS / idempotent.
-- Postgres holds the INDEX (who, what, when, reviews). Google Drive holds the FILES.

create extension if not exists "pgcrypto";

-- ============================================================ accounts
-- One table for both roles so login/session logic stays in one place.
--   role='admin' -> organiser, sees everything
--   role='team'  -> a hackathon team, created by an admin
create table if not exists accounts (
  id                  uuid primary key default gen_random_uuid(),
  role                text not null check (role in ('admin','team')),
  name                text not null,                   -- display name, admin-assigned for teams
  slug                text not null unique,            -- URL handle, e.g. /t/team-bravo
  password_hash       text not null,                   -- scrypt, see lib/password.ts
  avatar_type         text not null default 'preset' check (avatar_type in ('preset','upload')),
  avatar_value        text not null default 'geo-01',  -- preset id, or a Drive file id when uploaded
  password_changed_at timestamptz,                     -- null = still on the admin-issued password
  is_disabled         boolean not null default false,
  last_login_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists accounts_role_idx on accounts(role) where is_disabled = false;

-- ============================================================ sessions
create table if not exists sessions (
  token_hash  text primary key,                        -- sha256 of the cookie value; raw token never stored
  account_id  uuid not null references accounts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  user_agent  text
);
create index if not exists sessions_account_idx on sessions(account_id);
create index if not exists sessions_expiry_idx on sessions(expires_at);

-- ============================================================ models  (like a repo)
create table if not exists models (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references accounts(id) on delete cascade,
  title           text not null,
  slug            text not null,
  description     text not null default '',
  tags            text[] not null default '{}',
  drive_folder_id text,                                -- Drive folder: <root>/<team>/<model>
  cover_file_id   uuid,                                -- -> files.id, thumbnail shown in the feed
  is_hidden       boolean not null default false,      -- admin moderation
  deleted_at      timestamptz,                         -- team soft-delete (admin still sees it)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (team_id, slug)
);
create index if not exists models_team_idx on models(team_id);
create index if not exists models_feed_idx on models(updated_at desc);

-- ============================================================ versions  (like a commit)
create table if not exists versions (
  id              uuid primary key default gen_random_uuid(),
  model_id        uuid not null references models(id) on delete cascade,
  number          integer not null,                    -- 1,2,3... per model
  name            text not null,                       -- the name the student gives this upload
  notes           text not null default '',
  drive_folder_id text,                                -- Drive folder: <model>/v<number> <name>
  viewer_file_id  uuid,                                -- -> files.id, the file the 3D viewer loads
  total_bytes     bigint not null default 0,
  is_hidden       boolean not null default false,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique (model_id, number)
);
create index if not exists versions_model_idx on versions(model_id, number desc);

-- ============================================================ files
create table if not exists files (
  id            uuid primary key default gen_random_uuid(),
  version_id    uuid not null references versions(id) on delete cascade,
  kind          text not null check (kind in ('model','texture','screenshot','other')),
  original_name text not null,
  ext           text not null,
  mime          text not null default 'application/octet-stream',
  size_bytes    bigint not null default 0,
  drive_file_id text,                                  -- null until the browser finishes uploading
  upload_state  text not null default 'pending' check (upload_state in ('pending','complete','failed')),
  is_viewable   boolean not null default false,        -- true for glb/gltf/obj/stl/ply/fbx/3mf
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists files_version_idx on files(version_id, sort_order);

-- ============================================================ comments  (public feedback)
create table if not exists comments (
  id          uuid primary key default gen_random_uuid(),
  model_id    uuid not null references models(id) on delete cascade,
  version_id  uuid references versions(id) on delete cascade,  -- null = about the model overall
  author_id   uuid references accounts(id) on delete set null,
  author_name text not null,                           -- kept so a deleted account doesn't blank the thread
  parent_id   uuid references comments(id) on delete cascade,  -- one level of replies
  body        text not null,
  is_hidden   boolean not null default false,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists comments_model_idx on comments(model_id, created_at);

-- ============================================================ likes  (per version)
create table if not exists likes (
  version_id uuid not null references versions(id) on delete cascade,
  team_id    uuid not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (version_id, team_id)
);

-- ============================================================ rubric  (scores are admin-only)
create table if not exists rubric_criteria (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  label_en   text not null,
  label_ka   text not null,
  max_score  integer not null default 10 check (max_score between 1 and 100),
  sort_order integer not null default 0,
  is_active  boolean not null default true
);

create table if not exists rubric_submissions (
  id          uuid primary key default gen_random_uuid(),
  model_id    uuid not null references models(id) on delete cascade,
  reviewer_id uuid not null references accounts(id) on delete cascade,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (model_id, reviewer_id)                       -- one scorecard per reviewer per model
);

create table if not exists rubric_scores (
  submission_id uuid not null references rubric_submissions(id) on delete cascade,
  criterion_id  uuid not null references rubric_criteria(id) on delete cascade,
  score         integer not null,
  primary key (submission_id, criterion_id)
);

-- ============================================================ activity log
create table if not exists activity (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    uuid references accounts(id) on delete set null,
  actor_name  text not null default 'system',
  action      text not null,                           -- 'login','model.create','version.create',...
  target_type text,
  target_id   text,
  team_id     uuid references accounts(id) on delete set null,
  model_id    uuid references models(id) on delete set null,
  meta        jsonb not null default '{}'::jsonb
);
create index if not exists activity_at_idx on activity(at desc);
create index if not exists activity_team_idx on activity(team_id, at desc);

-- ============================================================ event settings (single row)
create table if not exists settings (
  id             integer primary key default 1 check (id = 1),
  event_name     text not null default 'Hackathon 3D',
  deadline_at    timestamptz,
  uploads_frozen boolean not null default false,
  reveal_scores  boolean not null default false,       -- flip to show rubric averages to teams
  max_file_bytes bigint not null default 157286400,    -- 150 MB per file
  max_team_bytes bigint not null default 524288000,    -- 500 MB per team
  updated_at     timestamptz not null default now()
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- ============================================================ Google Drive connection (single row)
create table if not exists drive_auth (
  id                      integer primary key default 1 check (id = 1),
  refresh_token_enc       text,                        -- AES-256-GCM, key derived from APP_SECRET
  connected_email         text,
  root_folder_id          text,
  access_token_enc        text,                        -- short-lived cache
  access_token_expires_at timestamptz,
  updated_at              timestamptz not null default now()
);
insert into drive_auth (id) values (1) on conflict (id) do nothing;

-- true  = the organizer pinned a folder that already existed in their Drive
--         (needs the full `drive` OAuth scope: `drive.file` cannot see a parent it did not create)
-- false = the app created its own folder (the narrow `drive.file` scope is enough)
alter table drive_auth add column if not exists root_is_external boolean not null default false;

-- ============================================================ later indexes
-- Added after the first deploy, for paths that turned out to scan:
--   comments(author_id)          -> "reviews given" per team, and the CSV export
--   rubric_submissions(reviewer_id) -> reviewer joins in the score export
--   versions(created_at)         -> the admin dashboard's 10-day sparkline
create index if not exists comments_author_idx on comments(author_id) where deleted_at is null;
create index if not exists rubric_submissions_reviewer_idx on rubric_submissions(reviewer_id);
create index if not exists versions_created_idx on versions(created_at desc);

-- Deferred FKs (files is created after models/versions)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'models_cover_fk') then
    alter table models add constraint models_cover_fk
      foreign key (cover_file_id) references files(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'versions_viewer_fk') then
    alter table versions add constraint versions_viewer_fk
      foreign key (viewer_file_id) references files(id) on delete set null;
  end if;
end $$;
