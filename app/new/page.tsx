import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAccount, currentLang } from "@/lib/session";
import { dict } from "@/lib/i18n";
import { getSettings, uploadGate, teamStorageUsed } from "@/lib/settings";
import { driveStatus } from "@/lib/drive";
import { UploadForm } from "@/components/UploadForm";

export const metadata = { title: "New model" };

export default async function NewModelPage() {
  const account = await currentAccount();
  if (!account) redirect("/login");
  if (account.role !== "team") redirect("/admin");

  const [lang, settings, used, drive] = await Promise.all([
    currentLang(),
    getSettings(),
    teamStorageUsed(account.id),
    driveStatus(),
  ]);
  const d = dict(lang);
  const gate = uploadGate(settings);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="page-head">
        <h1>{d.upload.newModelTitle}</h1>
        <Link href="/" className="btn btn-ghost btn-sm">
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
          mode="model"
          maxFileBytes={Number(settings.max_file_bytes)}
          maxTeamBytes={Number(settings.max_team_bytes)}
          usedBytes={used}
        />
      )}
    </div>
  );
}
