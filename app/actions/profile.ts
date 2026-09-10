"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireAccount } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { log } from "@/lib/activity";
import { dict } from "@/lib/i18n";
import { currentLang } from "@/lib/session";
import { PRESET_IDS } from "@/lib/avatars";
import { getSettings } from "@/lib/settings";
import { ensureFolder, ensureRootFolder, uploadSmallFile, deleteFile, DriveNotConnected } from "@/lib/drive";
import { one } from "@/lib/db";

const AVATAR_LIMIT = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export type ProfileState = { error?: string; ok?: string };

export async function setPresetAvatarAction(formData: FormData): Promise<void> {
  const account = await requireAccount();
  const preset = String(formData.get("preset") ?? "");
  if (!PRESET_IDS.includes(preset)) return;

  const previous = one<{ avatar_type: string; avatar_value: string }>(
    await sql`select avatar_type, avatar_value from accounts where id = ${account.id}`,
  );

  await sql`
    update accounts
    set avatar_type = 'preset', avatar_value = ${preset}, updated_at = now()
    where id = ${account.id}
  `;

  // Drop the previously uploaded image so it does not sit in Drive unused.
  if (previous?.avatar_type === "upload" && previous.avatar_value) {
    try {
      await deleteFile(previous.avatar_value);
    } catch (err) {
      console.error("old avatar cleanup failed", err);
    }
  }

  await log({
    actorId: account.id,
    actorName: account.name,
    action: "team.avatar_change",
    teamId: account.role === "team" ? account.id : null,
    meta: { kind: "preset", preset },
  });

  revalidatePath("/profile");
  revalidatePath("/", "layout");
}

export async function uploadAvatarAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const account = await requireAccount();
  const lang = await currentLang();
  const d = dict(lang);

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: d.upload.needFiles };
  if (file.size > AVATAR_LIMIT) {
    return { error: d.upload.tooBig(file.name, "2 MB") };
  }
  if (!AVATAR_TYPES.includes(file.type)) return { error: d.upload.badType(file.name) };

  try {
    const settings = await getSettings();
    const root = await ensureRootFolder(settings.event_name);
    const folder = await ensureFolder("_avatars", root);

    const uploaded = await uploadSmallFile({
      name: `${account.slug}-${Date.now()}.${file.name.split(".").pop() ?? "png"}`,
      parentId: folder,
      mimeType: file.type,
      body: await file.arrayBuffer(),
    });

    const previous = one<{ avatar_type: string; avatar_value: string }>(
      await sql`select avatar_type, avatar_value from accounts where id = ${account.id}`,
    );

    await sql`
      update accounts
      set avatar_type = 'upload', avatar_value = ${uploaded.id}, updated_at = now()
      where id = ${account.id}
    `;

    if (previous?.avatar_type === "upload" && previous.avatar_value) {
      try {
        await deleteFile(previous.avatar_value);
      } catch (err) {
        console.error("old avatar cleanup failed", err);
      }
    }

    await log({
      actorId: account.id,
      actorName: account.name,
      action: "team.avatar_change",
      teamId: account.role === "team" ? account.id : null,
      meta: { kind: "upload" },
    });

    revalidatePath("/profile");
    revalidatePath("/", "layout");
    return { ok: d.profile.saved };
  } catch (err) {
    if (err instanceof DriveNotConnected) return { error: d.upload.driveDown };
    console.error("avatar upload failed", err);
    return { error: d.common.error };
  }
}

export async function changePasswordAction(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const account = await requireAccount();
  const lang = await currentLang();
  const d = dict(lang).profile;

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const repeat = String(formData.get("repeat") ?? "");

  if (next.length < 8) return { error: d.tooShort };
  if (next !== repeat) return { error: d.mismatch };

  const row = one<{ password_hash: string }>(
    await sql`select password_hash from accounts where id = ${account.id}`,
  );
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    return { error: d.wrongCurrent };
  }

  await sql`
    update accounts
    set password_hash = ${await hashPassword(next)},
        password_changed_at = now(),
        updated_at = now()
    where id = ${account.id}
  `;

  await log({
    actorId: account.id,
    actorName: account.name,
    action: "team.password_change",
    teamId: account.role === "team" ? account.id : null,
  });

  return { ok: d.passwordChanged };
}
