import { sql, one } from "./db";
import { encrypt, decrypt } from "./crypto";

/**
 * Google Drive is the file vault. Postgres only stores ids.
 *
 * Two decisions worth knowing about:
 *
 * 1. Scope is `drive.file`, not `drive`. The app can only touch files it created itself,
 *    which means it can never read the owner's other documents. It is also a *non-sensitive*
 *    scope, so the OAuth app can be published without Google review — and that is what stops
 *    the refresh token from expiring every 7 days.
 *
 * 2. Uploads never pass through this server. We ask Drive for a resumable session URI and hand
 *    it to the browser, which PUTs the bytes straight to Google. Vercel caps a serverless
 *    request body at 4.5 MB, so a 120 MB .blend could not go through a route handler anyway.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "email",
].join(" ");

export class DriveNotConnected extends Error {
  constructor() {
    super("Google Drive is not connected");
  }
}

type AuthRow = {
  refresh_token_enc: string | null;
  connected_email: string | null;
  root_folder_id: string | null;
  access_token_enc: string | null;
  access_token_expires_at: string | null;
};

async function authRow(): Promise<AuthRow | null> {
  return one<AuthRow>(
    await sql`
      select refresh_token_enc, connected_email, root_folder_id,
             access_token_enc, access_token_expires_at
      from drive_auth where id = 1
    `,
  );
}

export type DriveStatus = {
  connected: boolean;
  email: string | null;
  rootFolderId: string | null;
};

export async function driveStatus(): Promise<DriveStatus> {
  const row = await authRow();
  return {
    connected: Boolean(row?.refresh_token_enc),
    email: row?.connected_email ?? null,
    rootFolderId: row?.root_folder_id ?? null,
  };
}

export function oauthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function authorizeUrl(state: string): string | null {
  const cfg = oauthConfig();
  if (!cfg) return null;
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPES,
    access_type: "offline",
    prompt: "consent", // always return a refresh_token, even on re-connect
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

/** Exchanges the ?code= from Google's redirect for a refresh token and stores it encrypted. */
export async function completeOAuth(code: string): Promise<{ email: string }> {
  const cfg = oauthConfig();
  if (!cfg) throw new Error("Google OAuth environment variables are not set");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
    error_description?: string;
    error?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Token exchange failed");
  }
  if (!data.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.",
    );
  }

  const email = emailFromIdToken(data.id_token) ?? (await fetchEmail(data.access_token)) ?? "unknown";
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);

  await sql`
    update drive_auth set
      refresh_token_enc = ${encrypt(data.refresh_token)},
      access_token_enc = ${encrypt(data.access_token)},
      access_token_expires_at = ${expiresAt.toISOString()},
      connected_email = ${email},
      updated_at = now()
    where id = 1
  `;

  return { email };
}

export async function disconnectDrive(): Promise<void> {
  await sql`
    update drive_auth set
      refresh_token_enc = null, access_token_enc = null,
      access_token_expires_at = null, connected_email = null, updated_at = now()
    where id = 1
  `;
}

function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const claims = JSON.parse(json) as { email?: string };
    return claims.email ?? null;
  } catch {
    return null;
  }
}

async function fetchEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}

/** Returns a valid access token, refreshing (and caching in Postgres) only when needed. */
export async function accessToken(): Promise<string> {
  const row = await authRow();
  if (!row?.refresh_token_enc) throw new DriveNotConnected();

  const cached = decrypt(row.access_token_enc);
  const expiresAt = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0;
  if (cached && expiresAt - Date.now() > 60_000) return cached;

  const refreshToken = decrypt(row.refresh_token_enc);
  if (!refreshToken) throw new DriveNotConnected();

  const cfg = oauthConfig();
  if (!cfg) throw new Error("Google OAuth environment variables are not set");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token",
    }),
  });

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.access_token) {
    // invalid_grant means the owner revoked access or the token expired — force a reconnect.
    if (data.error === "invalid_grant") {
      await sql`update drive_auth set refresh_token_enc = null, updated_at = now() where id = 1`;
      throw new DriveNotConnected();
    }
    throw new Error(data.error_description || data.error || "Token refresh failed");
  }

  const newExpiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
  await sql`
    update drive_auth set
      access_token_enc = ${encrypt(data.access_token)},
      access_token_expires_at = ${newExpiry.toISOString()},
      updated_at = now()
    where id = 1
  `;
  return data.access_token;
}

async function driveFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  return fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}

async function driveJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await driveFetch(path, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Drive allows duplicate names, so a name is quoted and escaped for the query language. */
function quote(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

async function findFolder(name: string, parentId: string): Promise<string | null> {
  const q = [
    `name = ${quote(name)}`,
    `mimeType = '${FOLDER_MIME}'`,
    `${quote(parentId)} in parents`,
    "trashed = false",
  ].join(" and ");
  const data = await driveJson<{ files: { id: string }[] }>(
    `/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1&supportsAllDrives=true`,
  );
  return data.files?.[0]?.id ?? null;
}

export async function createFolder(name: string, parentId: string): Promise<string> {
  const data = await driveJson<{ id: string }>("/files?fields=id&supportsAllDrives=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: safeName(name), mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return data.id;
}

export async function ensureFolder(name: string, parentId: string): Promise<string> {
  const clean = safeName(name);
  return (await findFolder(clean, parentId)) ?? (await createFolder(clean, parentId));
}

/** Drive rejects nothing much, but slashes and control characters make folders unreadable. */
export function safeName(name: string): string {
  return (
    name
      .replace(new RegExp("[\u0000-\u001f\u007f]", "g"), "") // control characters
      .replace(/[\\/]+/g, "-")
      .trim()
      .slice(0, 120) || "untitled"
  );
}

/** The event's top-level folder, created on first use and remembered in the database. */
export async function ensureRootFolder(eventName: string): Promise<string> {
  const row = await authRow();
  if (!row?.refresh_token_enc) throw new DriveNotConnected();
  if (row.root_folder_id) return row.root_folder_id;

  const id = await ensureFolder(eventName || "Hackathon 3D", "root");
  await sql`update drive_auth set root_folder_id = ${id}, updated_at = now() where id = 1`;
  return id;
}

export async function renameFile(fileId: string, name: string): Promise<void> {
  const res = await driveFetch(`/files/${fileId}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: safeName(name) }),
  });
  if (!res.ok) throw new Error(`Drive rename failed: ${res.status}`);
}

export async function deleteFile(fileId: string): Promise<void> {
  const res = await driveFetch(`/files/${fileId}?supportsAllDrives=true`, { method: "DELETE" });
  // 404 means it is already gone, which is the state we wanted.
  if (!res.ok && res.status !== 404) throw new Error(`Drive delete failed: ${res.status}`);
}

/**
 * Opens a resumable upload session and returns the URI the browser will PUT to.
 * The URI itself is the credential — it is single-purpose, expires in about a week,
 * and carries no account access, so it is safe to hand to the client.
 */
export async function createResumableSession(opts: {
  name: string;
  parentId: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<string> {
  const token = await accessToken();
  const res = await fetch(`${UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": opts.mimeType,
      "X-Upload-Content-Length": String(opts.sizeBytes),
    },
    body: JSON.stringify({
      name: safeName(opts.name),
      parents: [opts.parentId],
      mimeType: opts.mimeType,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not start upload session (${res.status}): ${text.slice(0, 300)}`);
  }
  const location = res.headers.get("location");
  if (!location) throw new Error("Drive did not return an upload session URI");
  return location;
}

/** Small-file fallback used when a browser blocks the direct PUT (see app/api/upload/proxy). */
export async function uploadSmallFile(opts: {
  name: string;
  parentId: string;
  mimeType: string;
  body: ArrayBuffer;
}): Promise<{ id: string; size: number }> {
  const token = await accessToken();
  const boundary = `mh${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({
    name: safeName(opts.name),
    parents: [opts.parentId],
    mimeType: opts.mimeType,
  });

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`),
    Buffer.from(opts.body),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true&fields=id,size`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: new Uint8Array(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id: string; size?: string };
  return { id: data.id, size: Number(data.size ?? opts.body.byteLength) };
}

export type DriveFileMeta = { id: string; name: string; size: number; mimeType: string };

export async function fileMeta(fileId: string): Promise<DriveFileMeta | null> {
  const res = await driveFetch(`/files/${fileId}?fields=id,name,size,mimeType&supportsAllDrives=true`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Drive metadata failed: ${res.status}`);
  const data = (await res.json()) as { id: string; name: string; size?: string; mimeType: string };
  return { id: data.id, name: data.name, size: Number(data.size ?? 0), mimeType: data.mimeType };
}

/**
 * Streams a file's bytes back. Used by /api/files/[id] so the browser never needs a Google token
 * and files stay private to logged-in users. `range` is forwarded so the 3D viewer and <video>
 * can seek.
 */
export async function downloadStream(fileId: string, range?: string | null): Promise<Response> {
  const token = await accessToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (range) headers.Range = range;
  return fetch(`${API}/files/${fileId}?alt=media&supportsAllDrives=true`, { headers });
}

export function folderLink(folderId: string | null | undefined): string | null {
  return folderId ? `https://drive.google.com/drive/folders/${folderId}` : null;
}

export function fileLink(fileId: string | null | undefined): string | null {
  return fileId ? `https://drive.google.com/file/d/${fileId}/view` : null;
}
