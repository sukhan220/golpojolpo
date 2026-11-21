import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "../../../../../lib/prisma";
import {
  AUTH_COOKIE_NAME,
  getCookieOptions,
  OAUTH_STATE_COOKIE,
  signAuthJwt,
} from "../../../../../lib/auth";

export async function GET(request) {
  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const redirectUri = `${origin}/api/auth/callback/google`;

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam || !code) {
    return NextResponse.redirect(`${origin}/?auth_error=cancelled`);
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${origin}/?auth_error=invalid_state`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_config`);
  }

  try {
    // 1. Exchange authorization code for Google access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(`${origin}/?auth_error=token_exchange`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch Google user profile
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      return NextResponse.redirect(`${origin}/?auth_error=userinfo_failed`);
    }

    const profile = await profileRes.json();
    const email = profile.email;
    const googleId = profile.sub;
    const name = profile.name || email?.split("@")[0] || "User";
    const avatar = profile.picture || null;

    if (!email || !googleId) {
      return NextResponse.redirect(`${origin}/?auth_error=no_email`);
    }

    // 3. Upsert User in Neon PostgreSQL via Prisma (preserves existing role if already assigned)
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        googleId,
        name,
        avatar,
      },
      create: {
        googleId,
        email,
        name,
        avatar,
      },
    });

    // 4. Sign HS256 JWT & set HttpOnly cookie
    const jwtToken = signAuthJwt(user);

    const response = NextResponse.redirect(`${origin}/`);
    response.cookies.set(AUTH_COOKIE_NAME, jwtToken, getCookieOptions());
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(`${origin}/?auth_error=server_error`);
  }
}
