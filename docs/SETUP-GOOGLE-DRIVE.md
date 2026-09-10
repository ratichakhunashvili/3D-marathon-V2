# Connecting Google Drive (one-time, ~10 minutes)

Drive is where every uploaded 3D file lives. The database only stores names and ids.
Do this once before the hackathon starts — **until it is connected, uploads fail**.

Everything here is free. No credit card, no billing account.

---

## Where uploads land

This install is already pinned to your own folder:

```
3D Marathon      https://drive.google.com/drive/folders/1pF2Z7BaO_m0oZtJndE8Y4KJGPvrKyqx0
                 (My Drive of r.chakhunashvili@skillwill.edu.ge)
```

It is set in two places — `GOOGLE_DRIVE_ROOT_ID` in `.env.local`, and the **Root folder**
field in `/admin/settings`, where you can paste a different folder link at any time.

**You must sign in as the account that owns that folder** (`r.chakhunashvili@skillwill.edu.ge`)
when you connect, or the app will not be able to see it. Storage comes out of that account's
quota, so check what your school Workspace allows.

### This choice costs you the narrow scope — read this

Google offers two levels of Drive access, and pinning a folder you created yourself forces
the broader one:

| | `drive.file` (narrow) | `drive` (full) |
| --- | --- | --- |
| What the app can touch | only files it created itself | everything in that Drive |
| Works with a pinned pre-existing folder | **no** — Drive returns 404 for a parent it did not create | yes |
| Google verification to publish | not needed | usually required |
| Token lifetime while unverified | 7 days (Testing mode) | 7 days (Testing mode) |
| Blocked by some school Workspace policies | rarely | **sometimes** |

Because `3D Marathon` is pinned, the app now requests the **full `drive` scope**
automatically. `npm run check` prints which scope will be requested, so you can always see
which mode you are in.

### The narrow alternative, if you prefer it

You can keep the app on `drive.file` and still end up with everything inside `3D Marathon`:

1. In `/admin/settings`, clear the **Root folder** field and save.
2. Press **Connect Google Drive**. The app creates its own folder in My Drive.
3. In Google Drive, **drag that folder into `3D Marathon`**.

The app tracks its folder by id, and moving a folder does not change its id — so uploads
keep working and land inside `3D Marathon` exactly as you wanted, while the app still cannot
see anything else in your Drive. This is the safer setup if your Workspace admin blocks
unverified apps that ask for full Drive access.

---

## Step 1 — Create a Google Cloud project

1. Go to <https://console.cloud.google.com/projectcreate> (sign in as the account above).
2. Project name: `modelhub` (anything works). Click **Create**.
3. Wait for it to finish, then make sure the project is selected in the top bar.

## Step 2 — Turn on the Drive API

1. Go to <https://console.cloud.google.com/apis/library/drive.googleapis.com>
2. Click **Enable**.

## Step 3 — Fill in the OAuth consent screen

1. Go to <https://console.cloud.google.com/auth/overview> (**APIs & Services → OAuth consent screen**).
2. Choose **External** and click **Create**.
3. Fill in only what is required:
   - App name: `ModelHub` (this is what you will see on the consent screen)
   - User support email: your address
   - Developer contact email: your address
4. Save and continue through the remaining steps. You do not need to add scopes here —
   the app requests them at sign-in time.

### Step 3b — Important: publishing status

On the OAuth consent screen there is a **Publishing status**:

| Status | What it means for you |
| --- | --- |
| **Testing** | Works fine, but Google expires the saved token after **7 days**, so you must click **Reconnect** in the admin panel about once a week. While in Testing, add your own Google address under **Test users** or sign-in will be refused. |
| **In production** | The token keeps working indefinitely. |

Because a folder is pinned, this install asks for the full `drive` scope (see
*Where uploads land* above), which Google normally wants to review before publishing.

**For a hackathon that runs a few days, stay in Testing.** Add
`r.chakhunashvili@skillwill.edu.ge` under **Test users** and everything works; the only cost
is pressing **Reconnect** in `/admin/settings` about once a week. Requesting a verification
review takes days and is not worth it for a short event.

If you want a setup that can be published and never needs reconnecting, use the narrow
alternative described in *Where uploads land*.

## Step 4 — Create the OAuth client

1. Go to <https://console.cloud.google.com/auth/clients> (**APIs & Services → Credentials**).
2. **Create credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Name: `ModelHub web`.
5. Under **Authorised redirect URIs**, click **Add URI** and add **both** of these:

   ```
   http://localhost:3100/api/drive/callback
   https://YOUR-APP.vercel.app/api/drive/callback
   ```

   The second one you can add later, once you know your Vercel URL. The value must match
   `GOOGLE_REDIRECT_URI` **character for character** — a missing or extra `/` is the single
   most common cause of a `redirect_uri_mismatch` error.
6. Click **Create**. Google shows a **Client ID** and a **Client secret**.

## Step 5 — Put the credentials in `.env.local`

Open `.env.local` in the project root and fill in the two blank values:

```ini
GOOGLE_CLIENT_ID="1234567890-abcdefg.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxxxxx"
GOOGLE_REDIRECT_URI="http://localhost:3100/api/drive/callback"
```

Restart the dev server after editing this file (`Ctrl+C`, then `npm run dev`).

## Step 6 — Connect

1. Open <http://localhost:3100/admin/settings> as the admin.
2. Click **Connect Google Drive**.
3. Sign in as **r.chakhunashvili@skillwill.edu.ge** — the account that owns `3D Marathon`.
   Signing in as any other account leaves the pinned folder invisible to the app.
4. If you see a warning like *"Google hasn't verified this app"*, click **Advanced →
   Go to ModelHub (unsafe)**. That warning appears for every unverified app; it is your own
   app asking for permission to create files in your own Drive.
5. Approve the permission. You land back on the settings page with a green
   **Connected as …**.
6. Press **Test connection**. It should report that uploads go into `3D Marathon`.

Confirm from the terminal too:

```bash
npm run check
```

The Google Drive section should show your address, the pinned folder, and `write test ok`.

---

## What the app does inside your Drive

Everything goes underneath the folder you pinned:

```
3D Marathon/                  <- your folder, pinned in /admin/settings
├── _avatars/                 <- uploaded team icons
├── გუნდი ბრავო/              <- one folder per team, named exactly as registered
│   └── Medieval lantern/     <- one folder per model
│       ├── v1 blockout/      <- one folder per version, with the name the student typed
│       │   ├── lantern.blend
│       │   ├── lantern.glb
│       │   └── render01.png
│       └── v2 final bake/
│           └── ...
└── Team Cyan/
    └── ...
```

You can open this folder in Drive at any time and browse the work by hand — the admin
panel links straight to it. Renaming a model on the site renames its Drive folder too, so
the tree stays readable.

To confirm the connection really works, press **Test connection** in `/admin/settings`: it
reads the pinned folder and creates and deletes a throwaway folder inside it, which catches
a wrong folder id or too narrow a scope before students start uploading.

## Things worth knowing

- **Deleting on the site does not delete in Drive.** A team deleting a model hides it from
  the site; the files stay in Drive so nothing is ever really lost. Clear out old folders
  by hand if you need the space back.
- **The quota is whatever that Google account has** (15 GB on a personal Gmail; your
  school Workspace may allow more or less). The app enforces
  per-file and per-team caps (150 MB and 500 MB by default) in `/admin/settings`. With
  15 teams at 500 MB the worst case is 7.5 GB, which fits comfortably.
- **Uploads never pass through the web server.** The browser sends bytes straight to
  Google, which is what lets a 150 MB `.blend` work on a free hosting plan.
- **If uploads suddenly fail**, the token has most likely expired (Testing mode, 7 days).
  Go to `/admin/settings` and press **Reconnect**, then **Test connection**.
- **If Google refuses the sign-in entirely**, your Workspace admin probably blocks unverified
  apps requesting full Drive access. Use the narrow alternative in *Where uploads land*.
