import { cache } from "react";
import { sql, one } from "./db";

export type Settings = {
  event_name: string;
  deadline_at: string | null;
  uploads_frozen: boolean;
  reveal_scores: boolean;
  max_file_bytes: string; // bigint arrives as a string
  max_team_bytes: string;
};

export const getSettings = cache(async (): Promise<Settings> => {
  const row = one<Settings>(
    await sql`
      select event_name, deadline_at, uploads_frozen, reveal_scores,
             max_file_bytes, max_team_bytes
      from settings where id = 1
    `,
  );
  // The row is inserted by the migration, but fall back so a fresh database cannot crash the app.
  return (
    row ?? {
      event_name: "Hackathon 3D",
      deadline_at: null,
      uploads_frozen: false,
      reveal_scores: false,
      max_file_bytes: "157286400",
      max_team_bytes: "524288000",
    }
  );
});

export type UploadGate = { ok: true } | { ok: false; reason: "frozen" | "deadline" };

/** Single place that decides whether uploading is allowed right now. */
export function uploadGate(settings: Settings): UploadGate {
  if (settings.uploads_frozen) return { ok: false, reason: "frozen" };
  if (settings.deadline_at && new Date(settings.deadline_at).getTime() <= Date.now()) {
    return { ok: false, reason: "deadline" };
  }
  return { ok: true };
}

/** Bytes a team currently occupies, counting only versions it has not deleted. */
export async function teamStorageUsed(teamId: string): Promise<number> {
  const row = one<{ total: string | null }>(
    await sql`
      select coalesce(sum(f.size_bytes), 0)::text as total
      from files f
      join versions v on v.id = f.version_id
      join models m on m.id = v.model_id
      where m.team_id = ${teamId}
        and f.upload_state = 'complete'
        and v.deleted_at is null
        and m.deleted_at is null
    `,
  );
  return Number(row?.total ?? 0);
}
