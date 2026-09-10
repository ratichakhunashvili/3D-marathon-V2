"use server";

import { revalidatePath } from "next/cache";
import { sql, one, rows } from "@/lib/db";
import { requireAdmin, currentLang } from "@/lib/session";
import { hashPassword, generatePassword } from "@/lib/password";
import { slugify } from "@/lib/slug";
import { presetForName } from "@/lib/avatars";
import { log } from "@/lib/activity";
import { dict } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import {
  disconnectDrive,
  driveStatus,
  parseFolderId,
  rootConfig,
  setRootFolder,
  verifyDrive,
} from "@/lib/drive";
import { MB } from "@/lib/format";

export type TeamCreateState = {
  error?: string;
  created?: { name: string; slug: string; password: string };
};

export async function createTeamAction(
  _prev: TeamCreateState,
  formData: FormData,
): Promise<TeamCreateState> {
  const admin = await requireAdmin();
  const d = dict(await currentLang()).admin.teams;

  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) return { error: d.name };

  const slug = slugify(name, "team");
  const existing = one<{ id: string }>(await sql`select id from accounts where slug = ${slug}`);
  if (existing) return { error: d.exists };

  // Either the organizer typed a password or we mint a readable one for them to hand over.
  const typed = String(formData.get("password") ?? "").trim();
  const password = typed.length >= 6 ? typed : generatePassword(10);

  await sql`
    insert into accounts (role, name, slug, password_hash, avatar_type, avatar_value)
    values ('team', ${name}, ${slug}, ${await hashPassword(password)}, 'preset', ${presetForName(name)})
  `;

  await log({
    actorId: admin.id,
    actorName: admin.name,
    action: "team.create",
    targetType: "team",
    targetId: slug,
    meta: { name },
  });

  revalidatePath("/admin/teams");
  revalidatePath("/teams");
  return { created: { name, slug, password } };
}

export type ResetState = { error?: string; password?: string };

export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const admin = await requireAdmin();
  const teamId = String(formData.get("teamId") ?? "");

  const team = one<{ id: string; name: string }>(
    await sql`select id, name from accounts where id = ${teamId} and role = 'team'`,
  );
  if (!team) return { error: "Team not found" };

  const password = generatePassword(10);
  await sql`
    update accounts
    set password_hash = ${await hashPassword(password)},
        password_changed_at = null,
        updated_at = now()
    where id = ${teamId}
  `;
  // Force them back through the login screen with the new credentials.
  await sql`delete from sessions where account_id = ${teamId}`;

  await log({
    actorId: admin.id,
    actorName: admin.name,
    action: "team.password_reset",
    targetType: "team",
    targetId: teamId,
    teamId,
    meta: { name: team.name },
  });

  revalidatePath("/admin/teams");
  return { password };
}

export async function toggleTeamAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const teamId = String(formData.get("teamId") ?? "");

  const team = one<{ id: string; name: string; is_disabled: boolean }>(
    await sql`select id, name, is_disabled from accounts where id = ${teamId} and role = 'team'`,
  );
  if (!team) return;

  await sql`update accounts set is_disabled = ${!team.is_disabled}, updated_at = now() where id = ${teamId}`;
  if (!team.is_disabled) await sql`delete from sessions where account_id = ${teamId}`;

  await log({
    actorId: admin.id,
    actorName: admin.name,
    action: team.is_disabled ? "team.enable" : "team.disable",
    targetType: "team",
    targetId: teamId,
    teamId,
    meta: { name: team.name },
  });

  revalidatePath("/admin/teams");
  revalidatePath("/teams");
}

export async function deleteTeamAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const teamId = String(formData.get("teamId") ?? "");

  const team = one<{ id: string; name: string }>(
    await sql`select id, name from accounts where id = ${teamId} and role = 'team'`,
  );
  if (!team) return;

  // Cascades through models, versions, files, comments and likes.
  // The Drive folder is deliberately left alone so the work itself is never lost.
  await sql`delete from accounts where id = ${teamId}`;

  await log({
    actorId: admin.id,
    actorName: admin.name,
    action: "team.delete",
    targetType: "team",
    targetId: teamId,
    meta: { name: team.name },
  });

  revalidatePath("/admin/teams");
  revalidatePath("/teams");
  revalidatePath("/");
}

export type SettingsState = { error?: string; ok?: string };

export async function updateSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const admin = await requireAdmin();
  const d = dict(await currentLang()).admin.settings;

  const eventName = String(formData.get("event_name") ?? "").trim().slice(0, 80) || "Hackathon 3D";
  const deadlineRaw = String(formData.get("deadline_at") ?? "").trim();
  const frozen = formData.get("uploads_frozen") === "on";
  const reveal = formData.get("reveal_scores") === "on";

  const maxFileMb = Math.max(1, Math.min(2000, Number(formData.get("max_file_mb") ?? 150)));
  const maxTeamMb = Math.max(1, Math.min(20000, Number(formData.get("max_team_mb") ?? 500)));

  // datetime-local has no timezone, so it is interpreted in the organizer's own timezone.
  const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
  if (deadline && !Number.isFinite(deadline.getTime())) return { error: d.deadline };

  await sql`
    update settings set
      event_name = ${eventName},
      deadline_at = ${deadline ? deadline.toISOString() : null},
      uploads_frozen = ${frozen},
      reveal_scores = ${reveal},
      max_file_bytes = ${Math.round(maxFileMb * MB)},
      max_team_bytes = ${Math.round(maxTeamMb * MB)},
      updated_at = now()
    where id = 1
  `;

  await log({
    actorId: admin.id,
    actorName: admin.name,
    action: "settings.update",
    meta: { eventName, frozen, reveal, maxFileMb, maxTeamMb, deadline: deadline?.toISOString() ?? null },
  });

  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
  return { ok: d.saved };
}

export async function upsertCriterionAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const id = String(formData.get("criterionId") ?? "");
  const labelEn = String(formData.get("label_en") ?? "").trim().slice(0, 80);
  const labelKa = String(formData.get("label_ka") ?? "").trim().slice(0, 80) || labelEn;
  const max = Math.max(1, Math.min(100, Number(formData.get("max_score") ?? 10)));
  const active = formData.get("is_active") === "on";

  if (!labelEn) return;

  if (id) {
    await sql`
      update rubric_criteria
      set label_en = ${labelEn}, label_ka = ${labelKa}, max_score = ${max}, is_active = ${active}
      where id = ${id}
    `;
  } else {
    const key = slugify(labelEn, "criterion");
    const order =
      (one<{ n: number }>(await sql`select coalesce(max(sort_order), 0) + 1 as n from rubric_criteria`)?.n) ?? 1;
    await sql`
      insert into rubric_criteria (key, label_en, label_ka, max_score, sort_order, is_active)
      values (${key}, ${labelEn}, ${labelKa}, ${max}, ${order}, true)
      on conflict (key) do update
        set label_en = excluded.label_en, label_ka = excluded.label_ka,
            max_score = excluded.max_score, is_active = true
    `;
  }

  await log({
    actorId: admin.id,
    actorName: admin.name,
    action: "settings.update",
    targetType: "criterion",
    targetId: id || labelEn,
    meta: { labelEn, max, active },
  });

  revalidatePath("/admin/settings");
}

export async function deleteCriterionAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("criterionId") ?? "");
  if (!id) return;

  // Deactivate rather than delete: removing it would erase scores already given.
  await sql`update rubric_criteria set is_active = false where id = ${id}`;
  await log({
    actorId: admin.id,
    actorName: admin.name,
    action: "settings.update",
    targetType: "criterion",
    targetId: id,
    meta: { deactivated: true },
  });

  revalidatePath("/admin/settings");
}

export async function disconnectDriveAction(): Promise<void> {
  const admin = await requireAdmin();
  await disconnectDrive();
  await log({ actorId: admin.id, actorName: admin.name, action: "drive.disconnect" });
  revalidatePath("/admin/settings");
}

export type DriveRootState = { error?: string; ok?: string };

/**
 * Pins the Drive folder that uploads land in. Accepts a pasted folder link or a bare id;
 * an empty value hands the job back to the app, which then creates its own folder.
 */
export async function setDriveRootAction(
  _prev: DriveRootState,
  formData: FormData,
): Promise<DriveRootState> {
  const admin = await requireAdmin();
  const raw = String(formData.get("folder") ?? "").trim();

  if (!raw) {
    await setRootFolder(null);
    await log({ actorId: admin.id, actorName: admin.name, action: "settings.update", meta: { driveRoot: null } });
    revalidatePath("/admin/settings");
    return { ok: "Cleared — the app will create its own folder on the next connect." };
  }

  const folderId = parseFolderId(raw);
  if (!folderId) return { error: "That does not look like a Google Drive folder link or id." };

  const previous = await rootConfig();
  await setRootFolder(folderId);

  const status = await driveStatus();
  if (!status.connected) {
    // Nothing to verify against yet; the connect flow will check it.
    return { ok: `Folder saved (${folderId}). Connect Drive to verify it.` };
  }

  // Already connected: prove the folder is usable, and say so plainly if it is not.
  const settings = await getSettings();
  const check = await verifyDrive(settings.event_name);

  if (!check.ok) {
    const scopeHint = !previous.external
      ? " The app is still connected with the narrow drive.file scope, which cannot write into a folder it did not create — press Reconnect to re-approve with full access."
      : "";
    return { error: `${check.error}${scopeHint}` };
  }

  await log({
    actorId: admin.id,
    actorName: admin.name,
    action: "settings.update",
    meta: { driveRoot: folderId, folderName: check.folderName },
  });

  revalidatePath("/admin/settings");
  return { ok: `Uploads will go into "${check.folderName}".` };
}

export type DriveCheckState = { error?: string; ok?: string };

/** "Test connection": reads the root folder and writes a throwaway folder inside it. */
export async function checkDriveAction(
  _prev: DriveCheckState,
  _formData: FormData,
): Promise<DriveCheckState> {
  await requireAdmin();
  const settings = await getSettings();
  const check = await verifyDrive(settings.event_name);

  return check.ok
    ? { ok: `Working — uploads go into "${check.folderName}" and a test folder was created and removed.` }
    : { error: check.error };
}

/** Removes half-finished uploads left behind by closed tabs. */
export async function cleanupPendingAction(): Promise<void> {
  await requireAdmin();
  await sql`delete from files where upload_state = 'pending' and created_at < now() - interval '2 hours'`;
  await sql`
    delete from versions v
    where not exists (select 1 from files f where f.version_id = v.id)
      and v.created_at < now() - interval '2 hours'
  `;
  await sql`
    delete from models m
    where not exists (select 1 from versions v where v.model_id = m.id)
      and m.created_at < now() - interval '2 hours'
  `;
  revalidatePath("/admin");
}

/** Used by the settings page to prove the Drive connection really works. */
export async function listTeamsForExport() {
  await requireAdmin();
  return rows<{ name: string }>(await sql`select name from accounts where role = 'team' order by name`);
}
