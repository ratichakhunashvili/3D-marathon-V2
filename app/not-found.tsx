import Link from "next/link";
import { currentLang } from "@/lib/session";
import { dict } from "@/lib/i18n";

export default async function NotFound() {
  const d = dict(await currentLang());

  return (
    <div className="empty" style={{ maxWidth: 480, margin: "10vh auto" }}>
      <h2 style={{ marginBottom: 8 }}>{d.common.notFound}</h2>
      <p className="small muted">
        {d.model.deletedNotice} · {d.common.unauthorized}
      </p>
      <Link className="btn btn-primary" href="/" style={{ marginTop: 12 }}>
        {d.nav.feed}
      </Link>
    </div>
  );
}
