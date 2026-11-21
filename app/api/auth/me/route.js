import { NextResponse } from "next/server";
import { getSessionUser } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

export async function GET(request) {
  try {
    const jwtUser = await getSessionUser(request);
    if (!jwtUser) {
      return NextResponse.json({ user: null });
    }

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
        return NextResponse.json({ user: dbUser });
      }
    } catch {
      // Fallback to verified JWT claims
    }

    return NextResponse.json({ user: jwtUser });
  } catch (err) {
    if (err?.digest === "NEXT_PRERENDER_INTERRUPTED") throw err;
    console.error("Auth /me error:", err);
    return NextResponse.json({ user: null });
  }
}
