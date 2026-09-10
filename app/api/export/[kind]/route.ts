import { NextResponse } from "next/server";
import { sql, rows } from "@/lib/db";
import { currentAccount } from "@/lib/session";

/** CSV exports for the organizers' own spreadsheets. Admin only — scores are in here. */
const QUERIES = {
  teams: async () =>
    rows<Record<string, unknown>>(
      await sql`
        select a.name as team, a.slug,
               a.created_at as registered,
               a.last_login_at as last_login,
               (a.password_changed_at is not null) as changed_password,
               a.is_disabled as disabled,
               (select count(*) from models m where m.team_id = a.id and m.deleted_at is null) as models,
               (select count(*) from versions v join models m2 on m2.id = v.model_id
                  where m2.team_id = a.id and v.deleted_at is null) as versions,
               (select coalesce(sum(v2.total_bytes), 0) from versions v2 join models m3 on m3.id = v2.model_id
                  where m3.team_id = a.id and v2.deleted_at is null) as bytes,
               (select count(*) from comments c where c.author_id = a.id and c.deleted_at is null) as reviews_written
        from accounts a
        where a.role = 'team'
        order by a.name
      `,
    ),

  models: async () =>
    rows<Record<string, unknown>>(
      await sql`
        select a.name as team, m.title as model, m.slug as model_slug,
               v.number as version, v.name as version_name, v.notes,
               v.created_at as uploaded_at, v.total_bytes as bytes,
               (select count(*) from files f where f.version_id = v.id and f.upload_state = 'complete') as files,
               (select count(*) from likes l where l.version_id = v.id) as likes,
               v.drive_folder_id,
               (m.deleted_at is not null) as model_deleted,
               (v.deleted_at is not null) as version_deleted,
               m.is_hidden as hidden
        from versions v
        join models m on m.id = v.model_id
        join accounts a on a.id = m.team_id
        order by a.name, m.title, v.number
      `,
    ),

  scores: async () =>
    rows<Record<string, unknown>>(
      await sql`
        select owner.name as team, m.title as model,
               reviewer.name as reviewer, rc.label_en as criterion,
               sc.score, rc.max_score, s.note, s.updated_at
        from rubric_submissions s
        join models m on m.id = s.model_id
        join accounts owner on owner.id = m.team_id
        join accounts reviewer on reviewer.id = s.reviewer_id
        left join rubric_scores sc on sc.submission_id = s.id
        left join rubric_criteria rc on rc.id = sc.criterion_id
        order by owner.name, m.title, reviewer.name, rc.sort_order
      `,
    ),

  activity: async () =>
    rows<Record<string, unknown>>(
      await sql`
        select ac.at, ac.actor_name, ac.action, ac.target_type, ac.target_id,
               m.title as model, a.name as team, ac.meta::text as meta
        from activity ac
        left join models m on m.id = ac.model_id
        left join accounts a on a.id = ac.team_id
        order by ac.at desc
        limit 20000
      `,
    ),
} as const;

type ExportKind = keyof typeof QUERIES;

export async function GET(_request: Request, ctx: { params: Promise<{ kind: string }> }) {
  const account = await currentAccount();
  if (!account || account.role !== "admin") {
    return new NextResponse("Admin only", { status: 403 });
  }

  const { kind } = await ctx.params;
  if (!(kind in QUERIES)) return new NextResponse("Unknown export", { status: 404 });

  const data = await QUERIES[kind as ExportKind]();
  const csv = toCsv(data);
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      // BOM so Excel opens UTF-8 (Georgian text) correctly on a double-click.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="modelhub-${kind}-${date}.csv"`,
    },
  });
}

function toCsv(data: Record<string, unknown>[]): string {
  if (!data.length) return "﻿";
  const columns = Object.keys(data[0]);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const text = value instanceof Date ? value.toISOString() : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [columns.join(",")];
  for (const row of data) lines.push(columns.map((column) => escape(row[column])).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
