import { redirect } from "next/navigation";
import { currentAccount, currentLang } from "@/lib/session";
import { dict } from "@/lib/i18n";
import { getSettings, teamStorageUsed } from "@/lib/settings";
import { PRESET_IDS } from "@/lib/avatars";
import { Avatar, PresetIcon } from "@/components/Avatar";
import { setPresetAvatarAction } from "@/app/actions/profile";
import { AvatarUpload, PasswordForm } from "./forms";
import { formatBytes } from "@/lib/format";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const account = await currentAccount();
  if (!account) redirect("/login");

  const [lang, settings] = await Promise.all([currentLang(), getSettings()]);
  const d = dict(lang);
  const used = account.role === "team" ? await teamStorageUsed(account.id) : 0;
  const maxTeam = Number(settings.max_team_bytes);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="page-head">
        <div className="row">
          <Avatar account={account} size={56} round />
          <div>
            <h1 className="wrap-any">{account.name}</h1>
            <div className="tiny faint">
              {account.role === "admin" ? d.admin.title : `/t/${account.slug}`}
            </div>
          </div>
        </div>
      </div>

      {!account.password_changed_at && (
        <div className="alert alert-warn">{d.profile.passwordIssued}</div>
      )}

      <div className="stack">
        {account.role === "team" && (
          <div className="card card-pad stack-sm">
            <div className="between">
              <h2>{d.profile.storage}</h2>
              <span className="small muted">{d.profile.storageOf(formatBytes(used), formatBytes(maxTeam))}</span>
            </div>
            <div className="progress">
              <i style={{ width: `${Math.min(100, (used / maxTeam) * 100)}%` }} />
            </div>
          </div>
        )}

        <div className="card card-pad stack-sm">
          <h2>{d.profile.avatar}</h2>

          <form action={setPresetAvatarAction} className="stack-sm">
            <span className="label small muted">{d.profile.presets}</span>
            <div className="icon-grid">
              {PRESET_IDS.map((preset) => {
                const selected = account.avatar_type === "preset" && account.avatar_value === preset;
                return (
                  <label
                    key={preset}
                    className={`icon-pick${selected ? " selected" : ""}`}
                    title={preset}
                    style={{ display: "block" }}
                  >
                    <input
                      type="radio"
                      name="preset"
                      value={preset}
                      defaultChecked={selected}
                      style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
                    />
                    <PresetIcon id={preset} size={58} />
                  </label>
                );
              })}
            </div>
            <div>
              <button className="btn btn-primary btn-sm">{d.profile.save}</button>
            </div>
          </form>

          <hr />
          <AvatarUpload lang={lang} />
        </div>

        <div className="card card-pad stack-sm">
          <h2>{d.profile.password}</h2>
          <PasswordForm lang={lang} />
        </div>
      </div>
    </div>
  );
}
