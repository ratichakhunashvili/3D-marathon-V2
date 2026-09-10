# Putting ModelHub online (free)

**Live at <https://3d-marathon.vercel.app>** — project `3d-marathon` in the
`ratichakhunashvilis-projects` scope, connected to
<https://github.com/ratichakhunashvili/3D-marathon-V2>, so every push to `main`
redeploys automatically.

The whole stack stays inside free tiers:

| Piece | Service | Free allowance | Card needed |
| --- | --- | --- | --- |
| Web app | Vercel Hobby | 100 GB bandwidth/month | no |
| Database | Neon (already created) | 0.5 GB, plenty for text | no |
| Files | Google Drive | 15 GB | no |

---

## 1. Push the code to GitHub

```bash
cd C:\Users\bliad\modelhub
git add -A
git commit -m "ModelHub: 3D hackathon platform"
gh repo create modelhub --private --source=. --push
```

Without the `gh` CLI: create an empty private repo on github.com, then

```bash
git remote add origin https://github.com/YOUR-NAME/modelhub.git
git push -u origin main
```

`.env.local` is git-ignored, so no secrets are pushed.

## 2. Import it into Vercel

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Import the `modelhub` repository. Framework detection picks Next.js automatically —
   leave every build setting alone.
3. Before clicking **Deploy**, open **Environment Variables** and add these.
   Copy the secrets straight out of your local `.env.local` — never retype them:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the Neon connection string from `.env.local` |
   | `APP_SECRET` | the long random hex string from `.env.local` |
   | `GOOGLE_CLIENT_ID` | from Google Cloud |
   | `GOOGLE_CLIENT_SECRET` | from Google Cloud |
   | `GOOGLE_REDIRECT_URI` | `https://YOUR-APP.vercel.app/api/drive/callback` |
   | `APP_BASE_URL` | `https://YOUR-APP.vercel.app` |
   | `GOOGLE_DRIVE_ROOT_ID` | `1pF2Z7BaO_m0oZtJndE8Y4KJGPvrKyqx0` (the `3D Marathon` folder) |

   `GOOGLE_DRIVE_ROOT_ID` only seeds the setting on first use — the pinned folder
   is already stored in the database — but setting it keeps the two in agreement.

   Use the **same** `APP_SECRET` as locally — it decrypts the stored Google token. A new
   secret means you must reconnect Drive.

4. Deploy. You do not need to run migrations: the database is already set up, and the same
   Neon database serves both local and production.

## 3. Point Google at the deployed URL

All seven environment variables are already set on the project, and
`APP_BASE_URL` / `GOOGLE_REDIRECT_URI` already point at https://3d-marathon.vercel.app.
What remains is the one thing that can only be done in Google's console:

1. Open <https://console.cloud.google.com/auth/clients> as the account that owns
   the `3D Marathon` folder (`r.chakhunashvili@skillwill.edu.ge`).
2. Open the ModelHub OAuth client and add this **Authorised redirect URI**, exactly:

   ```
   https://3d-marathon.vercel.app/api/drive/callback
   ```

   Keep `http://localhost:3100/api/drive/callback` alongside it for local work.
3. Then open <https://3d-marathon.vercel.app/admin/settings>, log in as admin, and press **Test connection**.

Until step 2 is done, existing uploads keep working on the refresh token already in
the database, but pressing **Reconnect** will fail with `redirect_uri_mismatch`.

## 4. Before the event

- Change the admin password at `/profile` (the seeded one is in `.env.local`).
- Set the event name, deadline and size caps in `/admin/settings`.
- Register the teams in `/admin/teams` and write down the generated passwords.
- Run `npm run check` locally — it verifies every query and the Drive connection.
- Upload one small `.glb` yourself as a test team, then delete it.

---

## Free-tier limits worth knowing

**Uploads bypass the server entirely.** Vercel's request-body limit is 100 MB (it was
4.5 MB when this was written), still under the 150 MB per-file cap — and streaming that
much through a function would be wasteful regardless. The browser opens a resumable
session and PUTs bytes straight to Google, and a dropped connection resumes from the last
confirmed byte rather than starting over.

**Downloads do pass through the server**, because files stay private to logged-in users.
A function may run for 300 seconds (`maxDuration` in `app/api/files/[id]/route.ts`), so
only a very large file on a very slow connection can now time out mid-download. In practice reviewers only pull the small
`.glb` and the screenshots, which are fast. Organizers and the owning team also get an
**Open in Drive** link on every model, which downloads directly from Google with no limit.
If this ever becomes a problem, lower the per-file cap in `/admin/settings`.

**Neon scales to zero.** The first request after a quiet period waits about a second for
the database to wake up. Nothing to configure.

**Vercel Hobby is for non-commercial use**, which an educational hackathon satisfies.

## If something breaks during the event

| Symptom | Fix |
| --- | --- |
| Uploads fail with "file storage is not connected" | `/admin/settings` → **Reconnect** (the Testing-mode token expires weekly) |
| `redirect_uri_mismatch` on connect | The URI in Google Cloud must match `GOOGLE_REDIRECT_URI` exactly, including `https` and no trailing slash |
| A team is locked out | `/admin/teams` → the 🔑 button issues a new password and ends their sessions |
| Half-finished uploads cluttering a model | `/admin/settings` → **Clean up abandoned uploads** |
| Need to stop all uploads now | `/admin/settings` → **Freeze uploads now** |
| Everything looks wrong | `npm run check` names the failing piece |
