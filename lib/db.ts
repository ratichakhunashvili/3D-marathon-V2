import { neon } from "@neondatabase/serverless";

// Neon's HTTP driver: one fetch per query, no connection pool to manage.
// That is what makes this work on Vercel's serverless functions, which are
// created and destroyed per request and cannot hold a Postgres connection open.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

export const sql = neon(connectionString);

/** Tagged-template query with a caller-supplied row type: `const rows = await q<Team>()\`select ...\`` is not
 *  possible with generics on a tag, so we cast at the call site instead: `(await sql\`...\`) as Team[]`.
 *  This helper just makes that cast read cleanly and stay in one place. */
export function rows<T>(result: unknown): T[] {
  return result as T[];
}

export function one<T>(result: unknown): T | null {
  const list = result as T[];
  return list.length ? list[0] : null;
}
