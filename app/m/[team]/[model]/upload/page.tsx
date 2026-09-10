import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentAccount, currentLang } from "@/lib/session";
import { dict } from "@/lib/i18n";
import { modelBySlug } from "@/lib/queries";
import { getSettings, uploadGate, teamStorageUsed } from "@/lib/settings";
import { driveStatus } from "@/lib/drive";
import { UploadForm } from "@/components/UploadForm";

export const metadata = { title: "New version" };

export default async function NewVersionPage({
  params,
}: {
  params: Promise<{ team: string; model: string }>;
}) {
  const account = await currentAccount();
  if (!account) redirect("/login");

  const [lang, { team: teamSlug, model: modelSlug }] = await Promise.all([currentLang(), params]);
  const d = dict(lang);

  const model = await modelBySlug(teamSlug, modelSlug);
  if (!model || model.deleted_at) notFound();

  // Only the owning team adds versions — an organizer editing student work would muddy the record.
  if (model.team_id !== account.id) redirect(`/m/${teamSlug}/${modelSlug}`);

  const [settings, used, drive] = await Promise.all([
    getSettings(),
    teamStorageUsed(account.id),
    driveStatus(),
  ]);
  const gate = uploadGate(settings);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="page-head">
        <div>
          <div className="small muted">{model.title}</div>
          <h1>{d.upload.newVersionTitle}</h1>
        </div>
        <Link href={`/m/${teamSlug}/${modelSlug}`} className="btn btn-ghost btn-sm">
          {d.common.cancel}
        </Link>
      </div>

      {!drive.connected ? (
        <div className="alert alert-error">{d.upload.driveDown}</div>
      ) : !gate.ok ? (
        <div className="alert alert-warn">
          {gate.reason === "frozen" ? d.upload.frozen : d.upload.pastDeadline}
        </div>
      ) : (
        <UploadForm
          lang={lang}
          mode="version"
          modelId={model.id}
          maxFileBytes={Number(settings.max_file_bytes)}
          maxTeamBytes={Number(settings.max_team_bytes)}
          usedBytes={used}
        />
      )}
    </div>
  );
}
