import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { currentAccount } from "@/lib/session";
import { completeOAuth, ensureRootFolder } from "@/lib/drive";
import { getSettings } from "@/lib/settings";
import { log } from "@/lib/activity";
import { DRIVE_STATE_COOKIE } from "../connect/route";

function base() {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

export async function GET(request: NextRequest) {
  const account = await currentAccount();
  if (!account || account.role !== "admin") {
    return NextResponse.redirect(new URL("/login", base()));
  }

  const jar = await cookies();
  const expected = jar.get(DRIVE_STATE_COOKIE)?.value;
  jar.delete(DRIVE_STATE_COOKIE);

  const params = request.nextUrl.searchParams;
  const error = params.get("error");
  const code = params.get("code");
  const state = params.get("state");

  if (error) {
    return NextResponse.redirect(new URL(`/admin/settings?drive=${encodeURIComponent(error)}`, base()));
  }
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL("/admin/settings?drive=state-mismatch", base()));
  }

  try {
    const { email } = await completeOAuth(code);

    // Create the event folder straight away so the organizer can see it worked.
    const settings = await getSettings();
    await ensureRootFolder(settings.event_name);

    await log({
      actorId: account.id,
      actorName: account.name,
      action: "drive.connect",
      meta: { email },
    });

    return NextResponse.redirect(new URL("/admin/settings?drive=ok", base()));
  } catch (err) {
    console.error("drive connect failed", err);
    const message = err instanceof Error ? err.message : "failed";
    return NextResponse.redirect(
      new URL(`/admin/settings?drive=${encodeURIComponent(message.slice(0, 120))}`, base()),
    );
  }
}
