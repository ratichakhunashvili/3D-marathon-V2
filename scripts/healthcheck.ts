// Pre-event health check: runs every read query and reports the Drive connection.
// Run this the morning of the hackathon.
//   npm run check
import {
  feedModels,
  modelBySlug,
  versionsOfModel,
  filesOfVersions,
  commentsOfModel,
  teamSummaries,
  teamBySlug,
  activeCriteria,
  allCriteria,
  myScorecard,
  modelScores,
  criterionAverages,
  recentActivity,
  uploadsPerDay,
  globalStats,
} from "../lib/queries.ts";
import { getSettings, teamStorageUsed, uploadGate } from "../lib/settings.ts";
import { driveStatus, oauthConfig } from "../lib/drive.ts";
import { formatBytes } from "../lib/format.ts";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
let failures = 0;

async function check(name: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    const detail = Array.isArray(result) ? `${result.length} rows` : result === null ? "empty" : "ok";
    console.log(`  ok    ${name.padEnd(32)} ${detail}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL  ${name.padEnd(32)} ${err instanceof Error ? err.message : err}`);
  }
}

console.log("\ndatabase");
await check("settings", () => getSettings());
await check("global stats", () => globalStats());
await check("feed", () => feedModels({}));
await check("feed (search)", () => feedModels({ search: "test" }));
await check("feed (most liked)", () => feedModels({ sort: "liked" }));
await check("feed (most discussed)", () => feedModels({ sort: "discussed" }));
await check("feed (one team, hidden)", () =>
  feedModels({ teamId: NIL_UUID, includeHidden: true, includeDeleted: true }),
);
await check("teams", () => teamSummaries(true));
await check("teams (enabled only)", () => teamSummaries(false));
await check("team by slug", () => teamBySlug("nobody"));
await check("model by slug", () => modelBySlug("nobody", "nothing"));
await check("versions", () => versionsOfModel(NIL_UUID, NIL_UUID));
await check("files", () => filesOfVersions([NIL_UUID]));
await check("comments", () => commentsOfModel(NIL_UUID, true));
await check("rubric (active)", () => activeCriteria());
await check("rubric (all)", () => allCriteria());
await check("scorecard", () => myScorecard(NIL_UUID, NIL_UUID));
await check("scores", () => modelScores());
await check("criterion averages", () => criterionAverages(NIL_UUID));
await check("activity", () => recentActivity(10));
await check("activity (per team)", () => recentActivity(10, NIL_UUID));
await check("uploads per day", () => uploadsPerDay(10));
await check("team storage", () => teamStorageUsed(NIL_UUID));

const settings = await getSettings();
const gate = uploadGate(settings);
const drive = await driveStatus();

console.log("\nevent");
console.log(`  name            ${settings.event_name}`);
console.log(`  deadline        ${settings.deadline_at ?? "none"}`);
console.log(`  uploads         ${gate.ok ? "open" : `closed (${gate.reason})`}`);
console.log(`  scores visible  ${settings.reveal_scores ? "to everyone" : "organizers only"}`);
console.log(`  limits          ${formatBytes(settings.max_file_bytes)} per file, ${formatBytes(settings.max_team_bytes)} per team`);

console.log("\ngoogle drive");
console.log(`  oauth env       ${oauthConfig() ? "set" : "MISSING (uploads cannot work)"}`);
console.log(`  connected       ${drive.connected ? drive.email : "NO (connect it in /admin/settings)"}`);
console.log(`  root folder     ${drive.rootFolderId ?? "not created yet"}`);

if (!drive.connected) failures++;

console.log(`\n${failures === 0 ? "everything ready" : `${failures} problem(s) found`}\n`);
process.exit(failures === 0 ? 0 : 1);
