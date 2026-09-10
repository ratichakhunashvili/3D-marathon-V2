import { NextResponse } from "next/server";
import { sql, one } from "@/lib/db";
import { currentAccount } from "@/lib/session";
import { uploadSmallFile, DriveNotConnected } from "@/lib/drive";

/**
 * Fallback path: the file goes through this server instead of straight to Google.
 * Only used when a browser blocks the direct PUT, and capped well under Vercel's
 * 4.5 MB request-body limit — anything larger has to take the direct route.
 */
export const maxDuration = 60;

const LIMIT = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const team = await currentAccount();
  if (!team || team.role !== "team") {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const fileId = form?.get("fileId");
  const blob = form?.get("file");

  if (typeof fileId !== "string" || !(blob instanceof File)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (blob.size > LIMIT) {
    return NextResponse.json({ error: "File too large for the fallback path" }, { status: 413 });
  }

  const row = one<{ id: string; original_name: string; mime: string; folder: string | null; team_id: string }>(
    await sql`
      select f.id, f.original_name, f.mime, v.drive_folder_id as folder, m.team_id
      from files f
      join versions v on v.id = f.version_id
      join models m on m.id = v.model_id
      where f.id = ${fileId} and f.upload_state = 'pending'
      limit 1
    `,
  );

  if (!row?.folder) return NextResponse.json({ error: "Unknown upload" }, { status: 404 });
  if (row.team_id !== team.id) return NextResponse.json({ error: "Not your upload" }, { status: 403 });

  try {
    const uploaded = await uploadSmallFile({
      name: row.original_name,
      parentId: row.folder,
      mimeType: row.mime,
      body: await blob.arrayBuffer(),
    });
    return NextResponse.json({ driveFileId: uploaded.id });
  } catch (err) {
    if (err instanceof DriveNotConnected) {
      return NextResponse.json({ error: "Drive is not connected" }, { status: 503 });
    }
    console.error("proxy upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }
}
