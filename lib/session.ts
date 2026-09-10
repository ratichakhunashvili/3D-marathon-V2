import { cookies, headers } from "next/headers";
import { cache } from "react";
import { sql, one } from "./db";
import { randomToken, sha256 } from "./crypto";
import { LANG_COOKIE, normalizeLang, type Lang } from "./i18n";

export const SESSION_COOKIE = "mh_session";
const SESSION_DAYS = 30;

export type Account = {
  id: string;
  role: "admin" | "team";
  name: string;
  slug: string;
  avatar_type: "preset" | "upload";
  avatar_value: string;
  password_changed_at: string | null;
  is_disabled: boolean;
};

/** Memoized per request so a page that checks the session in five places still makes one query. */
export const currentAccount = cache(async (): Promise<Account | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const account = one<Account>(
    await sql`
      select a.id, a.role, a.name, a.slug, a.avatar_type, a.avatar_value,
             a.password_changed_at, a.is_disabled
      from sessions s
      join accounts a on a.id = s.account_id
      where s.token_hash = ${sha256(token)}
        and s.expires_at > now()
      limit 1
    `,
  );

  if (!account || account.is_disabled) return null;
  return account;
});

export async function createSession(accountId: string): Promise<void> {
  const token = randomToken(32);
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;

  await sql`
    insert into sessions (token_hash, account_id, expires_at, user_agent)
    values (${sha256(token)}, ${accountId}, now() + ${`${SESSION_DAYS} days`}::interval, ${ua})
  `;

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sql`delete from sessions where token_hash = ${sha256(token)}`;
  jar.delete(SESSION_COOKIE);
}

/** Housekeeping — called on login so expired rows do not pile up in the free-tier database. */
export async function pruneSessions(): Promise<void> {
  await sql`delete from sessions where expires_at < now() - interval '7 days'`;
}

export const currentLang = cache(async (): Promise<Lang> => {
  const jar = await cookies();
  return normalizeLang(jar.get(LANG_COOKIE)?.value);
});

export class AccessError extends Error {
  // Explicit field, not a constructor parameter property: Node's strip-only TypeScript
  // support (used by the scripts in scripts/) does not accept that shorthand.
  readonly kind: "auth" | "admin";

  constructor(kind: "auth" | "admin" = "auth") {
    super(kind === "admin" ? "Admin access required" : "Login required");
    this.kind = kind;
  }
}

export async function requireAccount(): Promise<Account> {
  const account = await currentAccount();
  if (!account) throw new AccessError("auth");
  return account;
}

export async function requireAdmin(): Promise<Account> {
  const account = await requireAccount();
  if (account.role !== "admin") throw new AccessError("admin");
  return account;
}

export async function requireTeam(): Promise<Account> {
  const account = await requireAccount();
  if (account.role !== "team") throw new AccessError("admin");
  return account;
}
