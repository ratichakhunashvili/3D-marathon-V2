# Running ModelHub on Firebase

The site is live at **<https://hackathon-f160f.web.app>** — share that link.

Firebase project: `hackathon-f160f` (Blaze plan).
Source: <https://github.com/ratichakhunashvili/3D-marathon-V2>

There are two deployment paths set up, and they are independent:

| Path | What serves the app | Deploy trigger | Status |
| --- | --- | --- | --- |
| **Cloud Run + Firebase Hosting** | Cloud Run service `modelhub-web` | one command, from this folder | **live now** |
| **Firebase App Hosting** | backend `modelhub` | automatic, on git push | created, not serving — see below |

---

## How the live setup fits together

```
browser ──► Firebase Hosting (CDN, hackathon-f160f.web.app)
                │  static files in public/ served straight from the CDN
                └► rewrite ** ──► Cloud Run `modelhub-web` (us-central1)
                                      │
                                      ├──► Neon Postgres (us-east-2)
                                      └──► Google Drive
```

`firebase.json` holds the rewrite. Everything that is not a file in `public/`
goes to Cloud Run, which runs the Next.js standalone server from `Dockerfile`.

**Why us-central1.** Every page render makes several sequential queries to Neon,
which lives in `us-east-2`. Putting the app next to the database (~25 ms away)
beats putting it next to the users in Georgia (~100 ms from Europe to Ohio,
multiplied by every query in the request). If you ever move the Neon database to
`eu-central-1`, move this to `europe-west4` at the same time — that combination
would be the fastest of all.

## Redeploying after a code change

```bash
gcloud run deploy modelhub-web --source . --project hackathon-f160f --region us-central1
```

Environment variables and secrets are already attached to the service, so they
do not need repeating. Only re-run the Hosting deploy if you changed
`firebase.json` or files in `public/`:

```bash
firebase deploy --only hosting --project hackathon-f160f
```

## Where the configuration lives

Secrets are in Google Secret Manager, not in the repo:

| Secret | Used for |
| --- | --- |
| `DATABASE_URL` | Neon connection string |
| `APP_SECRET` | signs sessions, encrypts the stored Google refresh token |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Drive OAuth |

To change one:

```bash
firebase apphosting:secrets:set DATABASE_URL --project hackathon-f160f
gcloud run services update modelhub-web --project hackathon-f160f --region us-central1  # pick up :latest
```

Plain (non-secret) values are set on the service itself: `APP_BASE_URL`,
`GOOGLE_REDIRECT_URI`, `GOOGLE_DRIVE_ROOT_ID`.

`APP_SECRET` is the same value as in `.env.local` on purpose — that is what lets
the deployed site decrypt the Google refresh token the local install already
stored, so Drive is connected without reconnecting.

## One thing still to do: register the redirect URI

Uploads work right now, because the refresh token already in the database is
still valid. But **reconnecting** Drive from the deployed site will fail with
`redirect_uri_mismatch` until this is added:

1. Open <https://console.cloud.google.com/auth/clients> as
   `r.chakhunashvili@skillwill.edu.ge`.
2. Open the ModelHub OAuth client.
3. Under **Authorised redirect URIs**, add exactly:

   ```
   https://hackathon-f160f.web.app/api/drive/callback
   ```

4. Save. (Keep the `localhost:3100` one for local development.)

Remember the OAuth app is in **Testing** mode, so Google expires the refresh
token about every 7 days — `/admin/settings` → **Reconnect** fixes it, and that
is exactly the flow that needs the URI above.

## Cost

`minInstances: 0`, so the service scales to zero and an idle deployment costs
nothing beyond a few pennies of storage for the container image. The trade is a
~1.7 s cold start on the first request after a quiet period (measured; a warm
request is ~0.35 s). Set `--min-instances 1` to remove the cold start, at the
cost of one continuously billed instance.

---

## The other path: Firebase App Hosting

Already done for you:

- backend `modelhub` in `us-central1` (`nodejs22`)
- the four secrets above, with access granted
- `apphosting.yaml` at the repo root, pointing at
  `https://modelhub--hackathon-f160f.us-central1.hosted.app`

**This backend is not serving anything yet.** Two ways to finish it, and both
have a catch:

*Deploy from a connected GitHub repo (the intended path).* The code is already
on GitHub at <https://github.com/ratichakhunashvili/3D-marathon-V2>, so:

1. In the [App Hosting console](https://console.firebase.google.com/project/hackathon-f160f/apphosting),
   open the `modelhub` backend and connect that repository. This step needs a
   browser — it installs Firebase's GitHub app — and there is no CLI
   equivalent, which is why it is not already done.
2. Roll out:

   ```bash
   firebase apphosting:rollouts:create modelhub --git-branch main --project hackathon-f160f
   ```

3. Add `https://modelhub--hackathon-f160f.us-central1.hosted.app/api/drive/callback`
   to the OAuth client too, and set `APP_BASE_URL` in `apphosting.yaml` to
   whichever URL you settle on.

*Deploy from local source.* Adding an `apphosting` block to `firebase.json`
(`backendId`, `rootDir`, `ignore`) makes `firebase deploy --only apphosting`
upload this folder directly, no GitHub needed. It was tried and **the build
fails**: the Node.js buildpack exits 51 inside the CNB lifecycle, and the log
is not retrievable through `gcloud builds log`, Cloud Logging or a logs bucket —
only through the Cloud Build console. Removing `package-lock.json` from the
upload (to rule out the lockfile problem below) did not change it. The most
likely cause is `output: "standalone"` in `next.config.ts`, which the Cloud Run
image needs but which App Hosting's own Next adapter may not expect. If you
want to chase it, read the log in the console first:

<https://console.cloud.google.com/cloud-build/builds;region=us-central1?project=495241590412>

The `apphosting` block is deliberately **not** in `firebase.json` right now, so
that a plain `firebase deploy` cannot fail on it.

Connecting GitHub buys automatic redeploys on push; it is not needed for the
site to be up, because Cloud Run already serves it.

If you ever get App Hosting working and prefer it, delete the Cloud Run service
and drop the `rewrites` block from `firebase.json`, so there is only one live
copy of the site:

```bash
gcloud run services delete modelhub-web --project hackathon-f160f --region us-central1
```

## Note on the build

`Dockerfile` runs `npm install` rather than `npm ci`. `package-lock.json` was
generated on Windows, where npm prunes the optional dependencies belonging to
sharp's non-native variants, so the lock has no `@emnapi/runtime` and `npm ci`
refuses to run on Linux ("package.json and package-lock.json are not in sync").
One lock file cannot satisfy both platforms here. If you later generate the lock
on Linux or in CI, switch that line back to `npm ci` for reproducible builds.
