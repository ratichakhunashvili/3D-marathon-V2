import { NextResponse, type NextRequest } from "next/server";
import { sql, one } from "@/lib/db";
import { currentAccount } from "@/lib/session";
import { downloadStream, DriveNotConnected } from "@/lib/drive";
import { DISPLAYABLE_IMAGE } from "@/lib/filetypes";

/**
 * Streams one file's bytes out of Google Drive.
 *
 * Everything here is login-walled, so a Drive access token never reaches the browser and
 * files stay private to the event. Range requests are forwarded so the 3D viewer and
 * <video> can seek instead of downloading whole files.
 */
// Big source files stream through this function, so ask for the longest window the
// free Vercel plan allows. See docs/DEPLOY.md for the limits this implies.
export const maxDuration = 60;

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const viewer = await currentAccount();
  if (!viewer) return new NextResponse("Login required", { status: 401 });

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Bad id", { status: 400 });

  const file = one<{
    drive_file_id: string | null;
    original_name: string;
    mime: string;
    ext: string;
    size_bytes: string;
    team_id: string;
    model_hidden: boolean;
    model_deleted: string | null;
    version_deleted: string | null;
  }>(
    await sql`
      select f.drive_file_id, f.original_name, f.mime, f.ext, f.size_bytes,
             m.team_id, m.is_hidden as model_hidden,
             m.deleted_at as model_deleted, v.deleted_at as version_deleted
      from files f
      join versions v on v.id = f.version_id
      join models m on m.id = v.model_id
      where f.id = ${id} and f.upload_state = 'complete'
      limit 1
    `,
  );

  if (!file?.drive_file_id) return new NextResponse("Not found", { status: 404 });

  const isOwner = viewer.id === file.team_id;
  const isAdmin = viewer.role === "admin";
  const restricted = file.model_hidden || file.model_deleted || file.version_deleted;
  if (restricted && !isOwner && !isAdmin) {
    return new NextResponse("Not found", { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await downloadStream(file.drive_file_id, request.headers.get("range"));
  } catch (err) {
    if (err instanceof DriveNotConnected) {
      return new NextResponse("File storage is not connected", { status: 503 });
    }
    console.error("drive download failed", err);
    return new NextResponse("Storage error", { status: 502 });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse("Storage error", { status: upstream.status === 404 ? 404 : 502 });
  }

  const inline = DISPLAYABLE_IMAGE.has(file.ext) || file.mime.startsWith("video/") || file.mime === "application/pdf";
  const download = request.nextUrl.searchParams.get("dl") === "1";
  const disposition = download || !inline ? "attachment" : "inline";

  const headers = new Headers();
  headers.set("Content-Type", file.mime || "application/octet-stream");
  headers.set(
    "Content-Disposition",
    `${disposition}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
  );
  // Private: these are student files behind a login, so no shared CDN caching.
  headers.set("Cache-Control", "private, max-age=86400");
  for (const key of ["content-length", "content-range", "accept-ranges", "etag"]) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (!headers.has("accept-ranges")) headers.set("Accept-Ranges", "bytes");

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
