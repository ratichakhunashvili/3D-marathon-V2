import { NextResponse } from "next/server";
import { z } from "zod";
import { sql, one, rows } from "@/lib/db";
import { currentAccount, currentLang } from "@/lib/session";
import { getSettings, uploadGate, teamStorageUsed } from "@/lib/settings";
import { dict } from "@/lib/i18n";
import { extOf, isAllowed, isViewable, kindOf, mimeFor, type FileKind } from "@/lib/filetypes";
import { uniqueSlug } from "@/lib/slug";
import { formatBytes } from "@/lib/format";
import {
  ensureFolder,
  ensureRootFolder,
  createResumableSession,
  DriveNotConnected,
} from "@/lib/drive";

const Body = z.object({
  modelId: z.string().uuid().optional(),
  model: z
    .object({
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().max(2000).default(""),
      tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
    })
    .optional(),
  version: z.object({
    name: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(4000).default(""),
  }),
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(260),
        size: z.number().int().positive(),
        kind: z.enum(["model", "texture", "screenshot", "other"]).optional(),
      }),
    )
    .min(1)
    .max(30),
});

export async function POST(request: Request) {
  const team = await currentAccount();
  if (!team) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (team.role !== "team") {
    return NextResponse.json({ error: "Only teams can upload" }, { status: 403 });
  }

  const lang = await currentLang();
  const d = dict(lang).upload;

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const body = parsed.data;

  const settings = await getSettings();
  const gate = uploadGate(settings);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.reason === "frozen" ? d.frozen : d.pastDeadline }, { status: 403 });
  }

  // ---- validate the files before touching Drive or the database
  const maxFile = Number(settings.max_file_bytes);
  const maxTeam = Number(settings.max_team_bytes);

  for (const file of body.files) {
    if (!isAllowed(file.name)) {
      return NextResponse.json({ error: d.badType(file.name) }, { status: 400 });
    }
    if (file.size > maxFile) {
      return NextResponse.json({ error: d.tooBig(file.name, formatBytes(maxFile)) }, { status: 400 });
    }
  }

  const incoming = body.files.reduce((sum, f) => sum + f.size, 0);
  const used = await teamStorageUsed(team.id);
  if (used + incoming > maxTeam) {
    return NextResponse.json(
      { error: d.quota(formatBytes(used), formatBytes(maxTeam)) },
      { status: 400 },
    );
  }

  try {
    // ---- Drive folder tree: <event> / <team> / <model> / v<n> <name>
    const rootFolder = await ensureRootFolder(settings.event_name);
    const teamFolder = await ensureFolder(team.name, rootFolder);

    let modelId: string;
    let modelSlug: string;
    let modelFolder: string;
    let isNewModel = false;

    if (body.modelId) {
      const model = one<{ id: string; slug: string; title: string; drive_folder_id: string | null; team_id: string }>(
        await sql`
          select id, slug, title, drive_folder_id, team_id
          from models where id = ${body.modelId} and deleted_at is null limit 1
        `,
      );
      if (!model) return NextResponse.json({ error: "Model not found" }, { status: 404 });
      if (model.team_id !== team.id) {
        return NextResponse.json({ error: "Not your model" }, { status: 403 });
      }
      modelId = model.id;
      modelSlug = model.slug;
      modelFolder = model.drive_folder_id ?? (await ensureFolder(model.title, teamFolder));
      if (!model.drive_folder_id) {
        await sql`update models set drive_folder_id = ${modelFolder} where id = ${modelId}`;
      }
    } else {
      if (!body.model) return NextResponse.json({ error: "Missing model details" }, { status: 400 });
      isNewModel = true;

      const taken = rows<{ slug: string }>(
        await sql`select slug from models where team_id = ${team.id}`,
      ).map((r) => r.slug);
      modelSlug = uniqueSlug(body.model.title, taken, "model");
      modelFolder = await ensureFolder(body.model.title, teamFolder);

      const created = one<{ id: string }>(
        await sql`
          insert into models (team_id, title, slug, description, tags, drive_folder_id)
          values (${team.id}, ${body.model.title}, ${modelSlug}, ${body.model.description},
                  ${body.model.tags}::text[], ${modelFolder})
          returning id
        `,
      );
      if (!created) throw new Error("Could not create the model");
      modelId = created.id;
    }

    // Version numbers count deleted versions too, so v3 is never reused after a delete.
    const numberRow = one<{ next: number }>(
      await sql`select coalesce(max(number), 0) + 1 as next from versions where model_id = ${modelId}`,
    );
    const number = numberRow?.next ?? 1;

    const versionFolder = await ensureFolder(`v${number} ${body.version.name}`, modelFolder);

    const version = one<{ id: string }>(
      await sql`
        insert into versions (model_id, number, name, notes, drive_folder_id)
        values (${modelId}, ${number}, ${body.version.name}, ${body.version.notes}, ${versionFolder})
        returning id
      `,
    );
    if (!version) throw new Error("Could not create the version");

    // ---- one pending file row + one resumable session per file
    const uploads: { fileId: string; sessionUrl: string; name: string; size: number }[] = [];

    for (const [index, file] of body.files.entries()) {
      const kind: FileKind = kindOf(file.name, file.kind);
      const ext = extOf(file.name);
      const mime = mimeFor(file.name);

      const row = one<{ id: string }>(
        await sql`
          insert into files (version_id, kind, original_name, ext, mime, size_bytes,
                             is_viewable, sort_order)
          values (${version.id}, ${kind}, ${file.name}, ${ext}, ${mime}, ${file.size},
                  ${isViewable(file.name)}, ${index})
          returning id
        `,
      );
      if (!row) throw new Error("Could not record the file");

      const sessionUrl = await createResumableSession({
        name: file.name,
        parentId: versionFolder,
        mimeType: mime,
        sizeBytes: file.size,
      });

      uploads.push({ fileId: row.id, sessionUrl, name: file.name, size: file.size });
    }

    return NextResponse.json({
      versionId: version.id,
      modelId,
      isNewModel,
      url: `/m/${team.slug}/${modelSlug}`,
      uploads,
    });
  } catch (err) {
    if (err instanceof DriveNotConnected) {
      return NextResponse.json({ error: d.driveDown }, { status: 503 });
    }
    console.error("upload init failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload could not start" },
      { status: 500 },
    );
  }
}
