import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAccount, currentLang } from "@/lib/session";
import { dict } from "@/lib/i18n";

export const metadata = { title: "Admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const account = await currentAccount();
  if (!account) redirect("/login");
  if (account.role !== "admin") redirect("/");

  const d = dict(await currentLang()).admin;

  return (
    <>
      <h1 style={{ marginBottom: 14 }}>{d.title}</h1>
      <nav className="tabs">
        <Link href="/admin">{d.tabs.dashboard}</Link>
        <Link href="/admin/teams">{d.tabs.teams}</Link>
        <Link href="/admin/scores">{d.tabs.scores}</Link>
        <Link href="/admin/activity">{d.tabs.activity}</Link>
        <Link href="/admin/settings">{d.tabs.settings}</Link>
      </nav>
      {children}
    </>
  );
}
