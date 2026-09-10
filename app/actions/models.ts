"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, one } from "@/lib/db";
import { requireAccount } from "@/lib/session";
import { log } from "@/lib/activity";
import { renameFile } from "@/lib/drive";

/** Loads a model and answers "may this account change it?" in one place. */
async function loadOwnedModel(modelId: string) {
  const account = await requireAccount();
  const model = one<{
    id: string;
    team_id: string;
    title: string;
    slug: string;
    team_slug: string;
    drive_folder_id: string | null;
  }>(
    await sql`
      select m.id, m.team_id, m.title, m.slug, a.slug as team_slug, m.drive_folder_id
      from models m join accounts a on a.id = m.team_id
      where m.id = ${modelId} limit 1
    `,
  );
  if (!model) throw new Error("Model not found");

  const isOwner = model.team_id === account.id;
  const isAdmin = account.role === "admin";
  if (!isOwner && !isAdmin) throw new Error("Not your model");

  return { account, model, isOwner, isAdmin };
}

function modelPath(teamSlug: string, modelSlug: string) {
  return `/m/${teamSlug}/${modelSlug}`;
}

// ------------------------------------------------------------------ likes

export async function toggleLikeAction(formData: FormData): Promise<void> {
  const account = await requireAccount();
  const versionId = String(formData.get("versionId") ?? "");

  const version = one<{ id: string; model_id: string; team_id: string; team_slug: string; model_slug: string }>(
    await sql`
      select v.id, v.model_id, m.team_id, a.slug as team_slug, m.slug as model_slug
      from versions v
      join models m on m.id = v.model_id
      join accounts a on a.id = m.team_id
      where v.id = ${versionId} and v.deleted_at is null
      limit 1
    `,
  );
  if (!version) return;

  // Teams cannot inflate their own work.
  if (version.team_id === account.id) return;

  const existing = one<{ team_id: string }>(
    await sql`select team_id from likes where version_id = ${versionId} and team_id = ${account.id}`,
  );

  if (existing) {
    await sql`delete from likes where version_id = ${versionId} and team_id = ${account.id}`;
  } else {
    await sql`
      insert into likes (version_id, team_id) values (${versionId}, ${account.id})
      on conflict do nothing
    `;
  }

  await log({
    actorId: account.id,
    actorName: account.name,
    action: existing ? "like.remove" : "like.add",
    targetType: "version",
    targetId: versionId,
    teamId: version.team_id,
    modelId: version.model_id,
  });

  revalidatePath(modelPath(version.team_slug, version.model_slug));
}

// ------------------------------------------------------------------ comments

export async function addCommentAction(formData: FormData): Promise<void> {
  const account = await requireAccount();
  const modelId = String(formData.get("modelId") ?? "");
  const versionId = String(formData.get("versionId") ?? "") || null;
  const parentId = String(formData.get("parentId") ?? "") || null;
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  if (!body) return;

  const model = one<{ id: string; team_id: string; team_slug: string; slug: string }>(
    await sql`
      select m.id, m.team_id, a.slug as team_slug, m.slug
      from models m join accounts a on a.id = m.team_id
      where m.id = ${modelId} and m.deleted_at is null limit 1
    `,
  );
  if (!model) return;

  await sql`
    insert into comments (model_id, version_id, author_id, author_name, parent_id, body)
    values (${modelId}, ${versionId}::uuid, ${account.id}, ${account.name}, ${parentId}::uuid, ${body})
  `;

  await log({
    actorId: account.id,
    actorName: account.name,
    action: "comment.create",
    targetType: "model",
    targetId: modelId,
    teamId: model.team_id,
    modelId,
    meta: { length: body.length, reply: Boolean(parentId) },
  });

  revalidatePath(modelPath(model.team_slug, model.slug));
}

export async function deleteCommentAction(formData: FormData): Promise<void> {
  const account = await requireAccount();
  const commentId = String(formData.get("commentId") ?? "");

  const comment = one<{ id: string; author_id: string | null; model_id: string; team_slug: string; model_slug: string }>(
    await sql`
      select c.id, c.author_id, c.model_id, a.slug as team_slug, m.slug as model_slug
      from comments c
      join models m on m.id = c.model_id
      join accounts a on a.id = m.team_id
      where c.id = ${commentId} limit 1
    `,
  );
  if (!comment) return;

  // A comment can be removed by whoever wrote it, or by an organizer moderating.
  if (comment.author_id !== account.id && account.role !== "admin") return;

  await sql`update comments set deleted_at = now() where id = ${commentId}`;
  await log({
    actorId: account.id,
    actorName: account.name,
    action: "comment.delete",
    targetType: "comment",
    targetId: commentId,
    modelId: comment.model_id,
  });

  revalidatePath(modelPath(comment.team_slug, comment.model_slug));
}

// ------------------------------------------------------------------ scorecards

export async function submitScorecardAction(formData: FormData): Promise<void> {
  const account = await requireAccount();
  const modelId = String(formData.get("modelId") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);

  const model = one<{ id: string; team_id: string; team_slug: string; slug: string }>(
    await sql`
      select m.id, m.team_id, a.slug as team_slug, m.slug
      from models m join accounts a on a.id = m.team_id
      where m.id = ${modelId} and m.deleted_at is null limit 1
    `,
  );
  if (!model) return;
  if (model.team_id === account.id) return; // no self-scoring

  const criteria = (await sql`
    select id, max_score from rubric_criteria where is_active = true
  `) as { id: string; max_score: number }[];

  const submission = one<{ id: string }>(
    await sql`
      insert into rubric_submissions (model_id, reviewer_id, note)
      values (${modelId}, ${account.id}, ${note})
      on conflict (model_id, reviewer_id)
        do update set note = excluded.note, updated_at = now()
      returning id
    `,
  );
  if (!submission) return;

  let scored = 0;
  for (const criterion of criteria) {
    const raw = formData.get(`c_${criterion.id}`);
    if (raw === null || raw === "") continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > criterion.max_score) continue;

    await sql`
      insert into rubric_scores (submission_id, criterion_id, score)
      values (${submission.id}, ${criterion.id}, ${value})
      on conflict (submission_id, criterion_id) do update set score = excluded.score
    `;
    scored++;
  }

  await log({
    actorId: account.id,
    actorName: account.name,
    action: "score.submit",
    targetType: "model",
    targetId: modelId,
    teamId: model.team_id,
    modelId,
    meta: { criteria: scored },
  });

  revalidatePath(modelPath(model.team_slug, model.slug));
}

// ------------------------------------------------------------------ model edits

export async function updateModelAction(formData: FormData): Promise<void> {
  const modelId = String(formData.get("modelId") ?? "");
  const { account, model } = await loadOwnedModel(modelId);

  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const description = String(formData.get("description") ?? "").trim().slice(0, 2000);
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (!title) return;

  await sql`
    update models
    set title = ${title}, description = ${description}, tags = ${tags}::text[], updated_at = now()
    where id = ${modelId}
  `;

  // Keep the Drive folder readable for organizers browsing the Drive directly.
  if (model.drive_folder_id && title !== model.title) {
    try {
      await renameFile(model.drive_folder_id, title);
    } catch (err) {
      console.error("drive folder rename failed", err);
    }
  }

  await log({
    actorId: account.id,
    actorName: account.name,
    action: "model.update",
    targetType: "model",
    targetId: modelId,
    teamId: model.team_id,
    modelId,
    meta: { title },
  });

  revalidatePath(modelPath(model.team_slug, model.slug));
}

export async function setCoverAction(formData: FormData): Promise<void> {
  const modelId = String(formData.get("modelId") ?? "");
  const fileId = String(formData.get("fileId") ?? "");
  const { model } = await loadOwnedModel(modelId);

  // Only an image that belongs to this model may become its cover.
  const file = one<{ id: string }>(
    await sql`
      select f.id from files f
      join versions v on v.id = f.version_id
      where f.id = ${fileId} and v.model_id = ${modelId} and f.upload_state = 'complete'
      limit 1
    `,
  );
  if (!file) return;

  await sql`update models set cover_file_id = ${fileId} where id = ${modelId}`;
  revalidatePath(modelPath(model.team_slug, model.slug));
  revalidatePath("/");
}

export async function deleteModelAction(formData: FormData): Promise<void> {
  const modelId = String(formData.get("modelId") ?? "");
  const { account, model } = await loadOwnedModel(modelId);

  // Soft delete: the row and the Drive files stay, so organizers keep the full record.
  await sql`update models set deleted_at = now() where id = ${modelId}`;
  await log({
    actorId: account.id,
    actorName: account.name,
    action: "model.delete",
    targetType: "model",
    targetId: modelId,
    teamId: model.team_id,
    modelId,
    meta: { title: model.title },
  });

  revalidatePath("/");
  redirect(`/t/${model.team_slug}`);
}

export async function deleteVersionAction(formData: FormData): Promise<void> {
  const versionId = String(formData.get("versionId") ?? "");
  const account = await requireAccount();

  const version = one<{
    id: string;
    number: number;
    model_id: string;
    team_id: string;
    team_slug: string;
    model_slug: string;
    remaining: number;
  }>(
    await sql`
      select v.id, v.number, v.model_id, m.team_id, a.slug as team_slug, m.slug as model_slug,
             (select count(*)::int from versions v2
                where v2.model_id = v.model_id and v2.deleted_at is null) as remaining
      from versions v
      join models m on m.id = v.model_id
      join accounts a on a.id = m.team_id
      where v.id = ${versionId} and v.deleted_at is null
      limit 1
    `,
  );
  if (!version) return;
  if (version.team_id !== account.id && account.role !== "admin") return;

  await sql`update versions set deleted_at = now() where id = ${versionId}`;

  // Removing the last version leaves an empty model, so retire the model with it.
  if (version.remaining <= 1) {
    await sql`update models set deleted_at = now() where id = ${version.model_id}`;
  }

  // The cover may have lived in the deleted version — fall back to any surviving image.
  await sql`
    update models
    set cover_file_id = (
      select f.id from files f
      join versions v on v.id = f.version_id
      where v.model_id = ${version.model_id} and v.deleted_at is null
        and f.upload_state = 'complete'
        and f.ext = any(array['png','jpg','jpeg','webp','avif','gif','bmp'])
      order by (f.kind = 'screenshot') desc, v.number desc, f.sort_order
      limit 1
    ),
    updated_at = now()
    where id = ${version.model_id}
      and (cover_file_id is null or cover_file_id in (
        select id from files where version_id = ${versionId}
      ))
  `;

  await log({
    actorId: account.id,
    actorName: account.name,
    action: "version.delete",
    targetType: "version",
    targetId: versionId,
    teamId: version.team_id,
    modelId: version.model_id,
    meta: { version: version.number },
  });

  revalidatePath(modelPath(version.team_slug, version.model_slug));
  revalidatePath("/");

  if (version.remaining <= 1) redirect(`/t/${version.team_slug}`);
}

// ------------------------------------------------------------------ moderation (admin)

export async function toggleModelHiddenAction(formData: FormData): Promise<void> {
  const account = await requireAccount();
  if (account.role !== "admin") return;

  const modelId = String(formData.get("modelId") ?? "");
  const model = one<{ id: string; is_hidden: boolean; team_id: string; team_slug: string; slug: string }>(
    await sql`
      select m.id, m.is_hidden, m.team_id, a.slug as team_slug, m.slug
      from models m join accounts a on a.id = m.team_id
      where m.id = ${modelId} limit 1
    `,
  );
  if (!model) return;

  await sql`update models set is_hidden = ${!model.is_hidden} where id = ${modelId}`;
  await log({
    actorId: account.id,
    actorName: account.name,
    action: model.is_hidden ? "model.unhide" : "model.hide",
    targetType: "model",
    targetId: modelId,
    teamId: model.team_id,
    modelId,
  });

  revalidatePath(modelPath(model.team_slug, model.slug));
  revalidatePath("/");
}
