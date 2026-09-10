import { sql } from "./db";

export type ActivityAction =
  | "login"
  | "logout"
  | "team.create"
  | "team.password_reset"
  | "team.password_change"
  | "team.avatar_change"
  | "team.disable"
  | "team.enable"
  | "team.delete"
  | "model.create"
  | "model.update"
  | "model.delete"
  | "model.hide"
  | "model.unhide"
  | "version.create"
  | "version.delete"
  | "version.hide"
  | "comment.create"
  | "comment.delete"
  | "like.add"
  | "like.remove"
  | "score.submit"
  | "settings.update"
  | "drive.connect"
  | "drive.disconnect";

type LogInput = {
  actorId?: string | null;
  actorName: string;
  action: ActivityAction;
  targetType?: string | null;
  targetId?: string | null;
  teamId?: string | null;
  modelId?: string | null;
  meta?: Record<string, unknown>;
};

/** Append-only audit trail. Never throws: a logging failure must not fail the user's action. */
export async function log(input: LogInput): Promise<void> {
  try {
    await sql`
      insert into activity (actor_id, actor_name, action, target_type, target_id, team_id, model_id, meta)
      values (
        ${input.actorId ?? null}, ${input.actorName}, ${input.action},
        ${input.targetType ?? null}, ${input.targetId ?? null},
        ${input.teamId ?? null}, ${input.modelId ?? null},
        ${JSON.stringify(input.meta ?? {})}::jsonb
      )
    `;
  } catch (err) {
    console.error("activity log failed", input.action, err);
  }
}
