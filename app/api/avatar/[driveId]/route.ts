import { NextResponse } from "next/server";
import { sql, one } from "@/lib/db";
import { currentAccount } from "@/lib/session";
import { downloadStream, DriveNotConnected } from "@/lib/drive";

/**
 * Streams an uploaded team icon. Avatars live in Drive like any other file, but they are
 * not rows in `files` — so the Drive id is checked against the accounts table instead,
 * which also stops this route from becoming a general "fetch any Drive id" proxy.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ driveId: string }> }) {
  const viewer = await currentAccount();
  if (!viewer) return new NextResponse("Login required", { status: 401 });

  const { driveId } = await ctx.params;

  const owner = one<{ id: string }>(
    await sql`
      select id from accounts
      where avatar_type = 'upload' and avatar_value = ${driveId}
      limit 1
    `,
  );
  if (!owner) return new NextResponse("Not found", { status: 404 });

  try {
    const upstream = await downloadStream(driveId);
    if (!upstream.ok) return new NextResponse("Storage error", { status: 502 });

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") ?? "image/png");
    headers.set("Cache-Control", "private, max-age=3600");
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (err) {
    if (err instanceof DriveNotConnected) return new NextResponse("Not connected", { status: 503 });
    console.error("avatar stream failed", err);
    return new NextResponse("Storage error", { status: 502 });
  }
}
