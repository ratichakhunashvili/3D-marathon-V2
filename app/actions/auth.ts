"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { sql, one } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { slugify } from "@/lib/slug";
import { createSession, destroySession, currentAccount, currentLang, pruneSessions } from "@/lib/session";
import { log } from "@/lib/activity";
import { dict, LANG_COOKIE, normalizeLang } from "@/lib/i18n";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const lang = await currentLang();
  const d = dict(lang).login;

  const rawName = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!rawName || !password) return { error: d.missing };

  // Teams log in with their display name; matching on the slug makes it
  // case- and spacing-insensitive, which matters when a password is read off paper.
  const account = one<{ id: string; password_hash: string; is_disabled: boolean; role: string }>(
    await sql`
      select id, password_hash, is_disabled, role
      from accounts
      where slug = ${slugify(rawName, "-")}
      limit 1
    `,
  );

  // Always run a verification so a missing account and a wrong password take the same time.
  const hash = account?.password_hash ?? "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const ok = await verifyPassword(password, hash);

  if (!account || !ok) return { error: d.invalid };
  if (account.is_disabled) return { error: d.disabled };

  await createSession(account.id);
  // Housekeeping on the one path that is already slow (scrypt dominates it), so
  // expired rows never accumulate in the free-tier database.
  await Promise.all([
    sql`update accounts set last_login_at = now() where id = ${account.id}`,
    pruneSessions(),
  ]);
  await log({ actorId: account.id, actorName: rawName, action: "login", teamId: account.role === "team" ? account.id : null });

  redirect(account.role === "admin" ? "/admin" : "/");
}

export async function logoutAction(): Promise<void> {
  const account = await currentAccount();
  if (account) {
    await log({ actorId: account.id, actorName: account.name, action: "logout" });
  }
  await destroySession();
  redirect("/login");
}

export async function setLangAction(formData: FormData): Promise<void> {
  const lang = normalizeLang(String(formData.get("lang") ?? ""));
  (await cookies()).set(LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
