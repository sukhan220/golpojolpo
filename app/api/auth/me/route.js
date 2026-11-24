import { NextResponse } from "next/server";
import { getCookieOptions, getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function GET(request) {
  try {
    const jwtUser = await getSessionUser(request);
    if (!jwtUser) {
      const res = NextResponse.json({ user: null });
      res.cookies.delete("gj_logged_in");
      return res;
    }

    let resolvedUser = jwtUser;

    // Refresh latest role/profile from Neon (falls back cleanly to JWT claims if DB is unreachable)
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: jwtUser.id },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          role: true,
        },
      });
      if (dbUser) {
        resolvedUser = dbUser;
      }
    } catch {
      // Fallback to verified JWT claims
    }

    const res = NextResponse.json({ user: resolvedUser });
    res.cookies.set("gj_logged_in", "1", {
      ...getCookieOptions(),
      httpOnly: false,
    });
    return res;
  } catch (err) {
    if (err?.digest === "NEXT_PRERENDER_INTERRUPTED") throw err;
    console.error("Auth /me error:", err);
    return NextResponse.json({ user: null });
  }
}
