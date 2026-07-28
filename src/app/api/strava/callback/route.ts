import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/strava";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const origin = req.nextUrl.origin;

  if (error) {
    return NextResponse.redirect(`${origin}/?strava=denied`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/?strava=missing_code`);
  }

  try {
    await exchangeCode(code);
    return NextResponse.redirect(`${origin}/?strava=connected`);
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(`${origin}/?strava=error`);
  }
}
