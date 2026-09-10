# Connecting Google Drive (one-time, ~10 minutes)

Drive is where every uploaded 3D file lives. The database only stores names and ids.
Do this once before the hackathon starts — **until it is connected, uploads fail**.

Everything here is free. No credit card, no billing account.

---

## Which Google account to use

Use a **normal Gmail account** (personal, or a fresh one made for the event).
It gets 15 GB free, shared with that account's Gmail and Photos.

A brand-new account is the tidier choice: the hackathon files never mix with your own
Drive, and the full 15 GB is available. Whatever you pick, this account **owns all the
student files**, so do not delete it after the event if you want to keep the work.

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

This app only asks for `drive.file` (files it creates itself) plus your email address.
Because it never requests access to the rest of your Drive, clicking **Publish app**
normally goes through immediately without a verification review.

**Recommended:** click **Publish app**. If Google asks for a verification review instead,
just stay in **Testing** — everything works, you only need to press **Reconnect** in
`/admin/settings` if uploads start failing. For a hackathon that runs a few days, Testing
mode is perfectly adequate.

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
3. Sign in with the account that will own the files.
4. If you see a warning like *"Google hasn't verified this app"*, click **Advanced →
   Go to ModelHub (unsafe)**. That warning appears for every unverified app; it is your own
   app asking for permission to create files in your own Drive.
5. Approve the permission. You land back on the settings page with a green
   **Connected as you@gmail.com**.

Confirm it worked:

```bash
npm run check
```

The Google Drive section should read `connected  you@gmail.com`.

---

## What the app does inside your Drive

It creates one folder named after your event and keeps everything underneath it:

```
Hackathon 3D/                 <- root folder, named from the event name in settings
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
panel links straight to it. Renaming a model on the site also renames its Drive folder.

Because the app holds the `drive.file` scope, it can only ever see files it created itself.
It cannot read anything else in that Google account.

## Things worth knowing

- **Deleting on the site does not delete in Drive.** A team deleting a model hides it from
  the site; the files stay in Drive so nothing is ever really lost. Clear out old folders
  by hand if you need the space back.
- **15 GB is the ceiling**, shared with that account's Gmail and Photos. The app enforces
  per-file and per-team caps (150 MB and 500 MB by default) in `/admin/settings`. With
  15 teams at 500 MB the worst case is 7.5 GB, which fits comfortably.
- **Uploads never pass through the web server.** The browser sends bytes straight to
  Google, which is what lets a 150 MB `.blend` work on a free hosting plan.
- **If uploads suddenly fail**, the token has most likely expired (Testing mode, 7 days).
  Go to `/admin/settings` and press **Reconnect**.
