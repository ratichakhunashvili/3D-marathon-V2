// Creates the first admin account and the default rubric criteria.
// Re-running only fills in what is missing; it never overwrites an existing admin password.
//   npm run db:seed
import pg from "pg";
import { hashPassword } from "../lib/password.ts";
import { slugify } from "../lib/slug.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/seed.ts");
  process.exit(1);
}

const username = process.env.ADMIN_USERNAME || "admin";
const password = process.env.ADMIN_PASSWORD;
if (!password) {
  console.error("ADMIN_PASSWORD is not set in .env.local");
  process.exit(1);
}

const DEFAULT_CRITERIA = [
  { key: "modeling", en: "Modeling & topology", ka: "მოდელირება და ტოპოლოგია", max: 10, order: 1 },
  { key: "texturing", en: "Texturing & materials", ka: "ტექსტურა და მატერიალები", max: 10, order: 2 },
  { key: "creativity", en: "Creativity & concept", ka: "კრეატიულობა და კონცეფცია", max: 10, order: 3 },
  { key: "presentation", en: "Presentation", ka: "პრეზენტაცია", max: 10, order: 4 },
];

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const slug = slugify(username, "admin");
  const existing = await client.query<{ id: string }>(
    "select id from accounts where slug = $1 and role = 'admin'",
    [slug],
  );

  if (existing.rowCount) {
    console.log(`admin "${username}" already exists — password left unchanged`);
  } else {
    await client.query(
      `insert into accounts (role, name, slug, password_hash, password_changed_at)
       values ('admin', $1, $2, $3, now())`,
      [username, slug, await hashPassword(password)],
    );
    console.log(`admin created — username: ${username}`);
  }

  for (const c of DEFAULT_CRITERIA) {
    await client.query(
      `insert into rubric_criteria (key, label_en, label_ka, max_score, sort_order)
       values ($1, $2, $3, $4, $5)
       on conflict (key) do nothing`,
      [c.key, c.en, c.ka, c.max, c.order],
    );
  }
  console.log(`rubric criteria ready (${DEFAULT_CRITERIA.length})`);
} catch (err) {
  console.error("seed failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
