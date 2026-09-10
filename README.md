# ModelHub

A private, GitHub-style social site for a 3D modeling hackathon. Teams upload their work,
give each version a name, keep uploading new versions as it progresses, and review each
other's models. Organizers see everything.

Runs entirely on free tiers: **Next.js on Vercel · Neon Postgres · Google Drive for files**.

---

## Quick start

```bash
npm install
npm run db:setup     # creates the tables and the first admin (already done once)
npm run dev          # http://localhost:3100
```

Then connect Google Drive — **uploads do not work until you do**:
see [docs/SETUP-GOOGLE-DRIVE.md](docs/SETUP-GOOGLE-DRIVE.md) (~10 minutes, no card).

Deploying: [docs/DEPLOY.md](docs/DEPLOY.md).

Your admin username and password are in `.env.local` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`).
Change the password at `/profile` after the first login.

| Command | What it does |
| --- | --- |
| `npm run dev` | dev server on port 3100 |
| `npm run build` | production build |
| `npm run check` | runs every database query and reports the Drive connection |
| `npm run db:migrate` | applies `db/schema.sql` (safe to re-run) |
| `npm run db:seed` | creates the admin and the default scoring criteria |

---

## How it works

**Teams are accounts.** An organizer registers each team with a name and gets a generated
password to hand over. There is no public sign-up. Teams can change their password and pick
an icon on their profile — 48 generated 3D icons, or their own image.

**A model is like a repository, a version is like a commit.** A team creates a model
(`Medieval lantern`), and every upload after that is a named version (`v1 blockout`,
`v2 retopology`, `v3 final bake`). Each version holds as many files as needed — the source
`.blend`, a `.glb` export, textures, screenshots — plus a note about what changed. Version
numbers are never reused, even after a delete.

**Reviewing has two layers.** Comments and likes are public between teams and drive the
feed. Underneath, each team fills in a scorecard on other teams' models against organizer-
defined criteria; **those numbers are visible only to organizers** unless you flip
*Show scores to teams* in settings. Nobody can like or score their own model.

**The 3D viewer** draws `glb, gltf, obj, stl, ply, fbx, 3mf, dae, 3ds, wrl` in the browser
(drag to rotate, wireframe toggle, Draco-compressed glTF supported offline). Every other
format — `.blend`, `.max`, `.ztl`, `.c4d`, CAD files, archives — uploads fine and appears as
a download card with the team's screenshots beside it.

**Organizers** get a dashboard with a per-team progress sparkline and inactivity flags, a
score leaderboard, a full activity log, moderation (hide/delete anything, reset any
password), a deadline that freezes uploads, per-file and per-team size caps, and CSV exports
of teams, models, scores and activity.

**Both languages.** Every label exists in Georgian and English; the header toggles between
them. Georgian is the default. Team names written in Georgian get readable URLs
(`გუნდი ბრავო` → `/t/gundi-bravo`), and such a team can log in by typing either spelling.

---

## Architecture

```
Browser ──── page + form actions ────► Next.js on Vercel ────► Neon Postgres
   │                                          (index: teams, models,
   │                                           versions, reviews, log)
   └──── file bytes, resumable PUT ────► Google Drive
                                              (the files themselves)
         downloads come back through /api/files/[id], which streams from
         Drive with the server's token so files stay behind the login
```

Two decisions carry most of the weight:

1. **Postgres holds the index, Drive holds the bytes.** Comments, likes and scores need
   concurrent, transactional writes, which a folder of JSON files cannot do safely. Drive
   gives 15 GB of free space and a folder tree an organizer can browse by hand.
2. **Uploads never touch the server.** Vercel caps a request body at 4.5 MB. The server
   opens a Drive resumable session and hands the browser the session URI, so a 150 MB
   `.blend` goes straight to Google in 8 MB chunks and resumes after a dropped connection.

### Layout

```
app/
  page.tsx                    feed (search + sort)
  login/  profile/  new/      auth, team profile & icon picker, create a model
  m/[team]/[model]/           model page: viewer, versions, files, comments, scorecard
  m/[team]/[model]/upload/    add a new version
  t/[slug]/  teams/           team profile, team directory
  admin/                      dashboard · teams · scores · activity · settings
  actions/                    server actions (auth, models, profile, admin)
  api/
    upload/init|complete|proxy   open Drive sessions, then record the result
    files/[id]  avatar/[driveId] stream bytes back through the login wall
    drive/connect|callback       Google OAuth
    export/[kind]                CSV
lib/
  db.ts queries.ts            Neon HTTP driver + every read query in one place
  drive.ts upload-client.ts    Drive REST (server) and chunked upload (browser)
  session.ts password.ts crypto.ts   scrypt hashes, cookie sessions, AES-GCM for the token
  i18n.ts avatars.ts filetypes.ts    ka/en strings, 48 generated icons, format table
components/
  ModelViewer.tsx             three.js viewport, loaders imported on demand
  UploadForm.tsx  Scorecard.tsx  CommentThread.tsx  ModelCard.tsx  Avatar.tsx
db/schema.sql                 the whole schema, idempotent
scripts/                      migrate · seed · healthcheck
```

### Security notes

- Passwords are scrypt hashes (`N=32768`); the login path runs a verification even for an
  unknown account so timing does not reveal which names exist.
- Sessions are random 256-bit tokens; only their SHA-256 is stored, in an HttpOnly cookie.
- The Google refresh token is encrypted with AES-256-GCM using `APP_SECRET`.
- The OAuth scope is `drive.file`, so the app can only ever touch files it created — never
  the rest of the owner's Drive.
- Every file request is authenticated, and hidden or deleted work is served only to its own
  team and to organizers.
- Uploads are limited to an allowlist of 3D, image, archive and document extensions, so the
  site cannot be used to hand out executables.
