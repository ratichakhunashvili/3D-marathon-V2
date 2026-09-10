"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Last line of defence: a form action that throws lands here instead of a blank screen. */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isAccess = /login required|admin access/i.test(error.message);

  return (
    <div className="empty" style={{ maxWidth: 520, margin: "10vh auto" }}>
      <h2 style={{ marginBottom: 8 }}>{isAccess ? "Access denied" : "Something went wrong"}</h2>
      <p className="small muted">
        {isAccess
          ? "Log in again and retry — your session may have expired."
          : "The action did not complete. Nothing was saved."}
      </p>
      <div className="row row-tight" style={{ justifyContent: "center", marginTop: 14 }}>
        <button className="btn" onClick={reset}>
          Retry
        </button>
        <Link className="btn btn-primary" href={isAccess ? "/login" : "/"}>
          {isAccess ? "Log in" : "Back to the feed"}
        </Link>
      </div>
      {error.digest && <p className="tiny faint mono" style={{ marginTop: 12 }}>{error.digest}</p>}
    </div>
  );
}
