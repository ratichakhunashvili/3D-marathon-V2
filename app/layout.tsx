import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { currentAccount, currentLang } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { dict } from "@/lib/i18n";
import { Avatar } from "@/components/Avatar";
import { logoutAction, setLangAction } from "./actions/auth";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return {
    title: { default: settings.event_name, template: `%s · ${settings.event_name}` },
    description: "3D modeling hackathon — upload, version and review student work.",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [lang, account, settings] = await Promise.all([currentLang(), currentAccount(), getSettings()]);
  const d = dict(lang);

  return (
    <html lang={lang}>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              <span className="brand-mark">◈</span>
              <span>
                {settings.event_name}
                <small>{d.brandTagline}</small>
              </span>
            </Link>

            {account && (
              <nav className="nav">
                <Link href="/">{d.nav.feed}</Link>
                <Link href="/teams">{d.nav.teams}</Link>
                {account.role === "team" && <Link href={`/t/${account.slug}`}>{d.nav.myWork}</Link>}
                {account.role === "admin" && <Link href="/admin">{d.nav.admin}</Link>}
              </nav>
            )}

            <span className="spacer" />

            <form action={setLangAction} className="row row-tight">
              <input type="hidden" name="lang" value={lang === "ka" ? "en" : "ka"} />
              <button type="submit" className="btn btn-ghost btn-sm" title="Language">
                {lang === "ka" ? "EN" : "ქარ"}
              </button>
            </form>

            {account ? (
              <div className="row row-tight">
                {account.role === "team" && (
                  <Link href="/new" className="btn btn-primary btn-sm nowrap">
                    + {d.nav.newModel}
                  </Link>
                )}
                <Link href="/profile" className="row row-tight" title={d.nav.profile}>
                  <Avatar account={account} size={30} round />
                </Link>
                <form action={logoutAction} className="inline-form">
                  <button type="submit" className="btn btn-ghost btn-sm">
                    {d.nav.logout}
                  </button>
                </form>
              </div>
            ) : (
              <Link href="/login" className="btn btn-primary btn-sm">
                {d.nav.login}
              </Link>
            )}
          </div>
        </header>

        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
