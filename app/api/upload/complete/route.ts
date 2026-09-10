import { NextResponse } from "next/server";
import { z } from "zod";
import { sql, one, rows } from "@/lib/db";
import { currentAccount } from "@/lib/session";
import { log } from "@/lib/activity";
import { DISPLAYABLE_IMAGE, VIEWABLE } from "@/lib/filetypes";

const Body = z.object({
  versionId: z.string().uuid(),
  succeeded: z.array(z.object({ fileId: z.string().uuid(), driveFileId: z.string().min(5) })).default([]),
  failed: z.array(z.string().uuid()).default([]),
});

/** Formats the browser can draw, best first — decides which file the viewer opens by default. */
const VIEWER_PREFERENCE = ["glb", "gltf", "obj", "stl", "ply", "3mf", "fbx", "dae", "3ds", "wrl", "vrml"];

export async function POST(request: Request) {
  const team = await currentAccount();
  if (!team) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { versionId, succeeded, failed } = parsed.data;

  const version = one<{
    id: string;
    number: number;
    name: string;
    model_id: string;
    team_id: string;
    model_title: string;
    model_slug: string;
    team_slug: string;
    cover_file_id: string | null;
  }>(
    await sql`
      select v.id, v.number, v.name, v.model_id, m.team_id,
             m.title as model_title, m.slug as model_slug, m.cover_file_id, a.slug as team_slug
      from versions v
      join models m on m.id = v.model_id
      join accounts a on a.id = m.team_id
      where v.id = ${versionId} limit 1
    `,
  );

  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  if (version.team_id !== team.id && team.role !== "admin") {
    return NextResponse.json({ error: "Not your version" }, { status: 403 });
  }

  for (const item of succeeded) {
    await sql`
      update files
      set drive_file_id = ${item.driveFileId}, upload_state = 'complete'
      where id = ${item.fileId} and version_id = ${versionId}
    `;
  }

  if (failed.length) {
    await sql`
      delete from files
      where id = any(${failed}::uuid[]) and version_id = ${versionId} and upload_state <> 'complete'
    `;
  }
  // Anything the browser never reported on (closed tab, crash) is not a real file.
  await sql`delete from files where version_id = ${versionId} and upload_state = 'pending'`;

  const complete = rows<{ id: string; ext: string; kind: string; size_bytes: string; sort_order: number }>(
    await sql`
      select id, ext, kind, size_bytes, sort_order
      from files where version_id = ${versionId} and upload_state = 'complete'
      order by sort_order
    `,
  );

  if (complete.length === 0) {
    // Every file failed — drop the empty version so the team's history stays honest.
    await sql`delete from versions where id = ${versionId}`;
    const remaining = one<{ n: number }>(
      await sql`select count(*)::int as n from versions where model_id = ${version.model_id}`,
    );
    if ((remaining?.n ?? 0) === 0) {
      await sql`delete from models where id = ${version.model_id}`;
    }
    return NextResponse.json({ error: "No files were uploaded", url: "/" }, { status: 400 });
  }

  const totalBytes = complete.reduce((sum, f) => sum + Number(f.size_bytes), 0);

  const viewerFile =
    complete
      .filter((f) => f.ext in VIEWABLE)
      .sort((a, b) => {
        const rank = VIEWER_PREFERENCE.indexOf(a.ext) - VIEWER_PREFERENCE.indexOf(b.ext);
        return rank !== 0 ? rank : a.sort_order - b.sort_order;
      })[0] ?? null;

  await sql`
    update versions
    set total_bytes = ${totalBytes}, viewer_file_id = ${viewerFile?.id ?? null}
    where id = ${versionId}
  `;

  // The newest screenshot becomes the model's cover unless the team already picked one.
  const coverCandidate =
    complete.find((f) => f.kind === "screenshot" && DISPLAYABLE_IMAGE.has(f.ext)) ??
    complete.find((f) => DISPLAYABLE_IMAGE.has(f.ext)) ??
    null;

  await sql`
    update models
    set updated_at = now(),
        cover_file_id = coalesce(cover_file_id, ${coverCandidate?.id ?? null})
    where id = ${version.model_id}
  `;

  await log({
    actorId: team.id,
    actorName: team.name,
    action: version.number === 1 ? "model.create" : "version.create",
    targetType: "version",
    targetId: versionId,
    teamId: version.team_id,
    modelId: version.model_id,
    meta: {
      version: version.number,
      versionName: version.name,
      files: complete.length,
      bytes: totalBytes,
      failed: failed.length,
    },
  });

  return NextResponse.json({
    url: `/m/${version.team_slug}/${version.model_slug}?v=${version.number}`,
    files: complete.length,
  });
}
