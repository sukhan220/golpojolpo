import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "../../../../lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(AUTH_COOKIE_NAME);
  response.cookies.delete("gj_session");
  return response;
}
