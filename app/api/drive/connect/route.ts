import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { currentAccount } from "@/lib/session";
import { authorizeUrl } from "@/lib/drive";
import { randomToken } from "@/lib/crypto";

export const DRIVE_STATE_COOKIE = "drive_oauth_state";

/** Starts the Google consent flow. Organizers only — this binds the whole event's file vault. */
export async function GET() {
  const account = await currentAccount();
  if (!account || account.role !== "admin") {
    return NextResponse.redirect(new URL("/login", process.env.APP_BASE_URL ?? "http://localhost:3000"));
  }

  const state = randomToken(16);
  const url = authorizeUrl(state);
  if (!url) {
    return NextResponse.redirect(
      new URL("/admin/settings?drive=missing-env", process.env.APP_BASE_URL ?? "http://localhost:3000"),
    );
  }

  // The state cookie is what proves the callback belongs to this browser and this attempt.
  (await cookies()).set(DRIVE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(url);
}
