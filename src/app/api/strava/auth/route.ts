import { NextResponse } from "next/server";
import { getAuthorizeUrl, stravaConfigured } from "@/lib/strava";

export async function GET() {
  if (!stravaConfigured()) {
    return NextResponse.json(
      {
        error: "Strava is not configured. Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REDIRECT_URI.",
      },
      { status: 400 },
    );
  }
  return NextResponse.redirect(getAuthorizeUrl());
}
