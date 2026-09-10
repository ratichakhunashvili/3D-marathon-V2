import { redirect } from "next/navigation";
import { currentAccount, currentLang } from "@/lib/session";
import { dict } from "@/lib/i18n";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const account = await currentAccount();
  if (account) redirect(account.role === "admin" ? "/admin" : "/");

  const [lang, settings] = await Promise.all([currentLang(), getSettings()]);
  const d = dict(lang);

  return (
    <div style={{ maxWidth: 400, margin: "6vh auto" }}>
      <div className="center stack-sm" style={{ marginBottom: 22 }}>
        <h1>{settings.event_name}</h1>
        <p className="muted small">{d.login.subtitle}</p>
      </div>

      <div className="card card-pad">
        <LoginForm lang={lang} />
      </div>

      <p className="faint tiny center" style={{ marginTop: 16 }}>
        {d.login.adminNote}
      </p>
    </div>
  );
}
