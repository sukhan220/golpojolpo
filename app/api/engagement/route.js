import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionUser } from "../../../lib/auth";

function normalizeTargetType(val) {
  const upper = String(val || "").toUpperCase();
  if (upper === "AUDIOBOOK" || upper === "BOOK") return "AUDIOBOOK";
  if (upper === "EBOOK" || upper === "SHORTSTORY") return "EBOOK";
  return null;
}

/**
 * GET /api/engagement?targetType=AUDIOBOOK|EBOOK&targetId=<docId>
 * Returns likes count, average rating, ratings count, user's own like/rating, and comments list.
 */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const targetType = normalizeTargetType(url.searchParams.get("targetType"));
    const targetId = (url.searchParams.get("targetId") || "").trim();

    if (!targetType || !targetId) {
      return NextResponse.json(
        { error: "targetType (AUDIOBOOK|EBOOK) and targetId are required" },
        { status: 400 }
      );
    }

    const user = await getSessionUser(request);

    const [likesCount, ratingAgg, comments, userLike, userRating] = await Promise.all([
      prisma.like.count({ where: { targetType, targetId } }),
      prisma.rating.aggregate({
        where: { targetType, targetId },
        _avg: { score: true },
        _count: { score: true },
      }),
      prisma.comment.findMany({
        where: { targetType, targetId },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          user: { select: { id: true, name: true, avatar: true } },
        },
      }),
      user
        ? prisma.like.findUnique({
            where: {
              userId_targetType_targetId: { userId: user.id, targetType, targetId },
            },
          })
        : null,
      user
        ? prisma.rating.findUnique({
            where: {
              userId_targetType_targetId: { userId: user.id, targetType, targetId },
            },
          })
        : null,
    ]);

    return NextResponse.json({
      likesCount,
      likedByMe: Boolean(userLike),
      averageRating: ratingAgg._avg.score ? Number(ratingAgg._avg.score.toFixed(1)) : 0,
      ratingsCount: ratingAgg._count.score || 0,
      myRating: userRating?.score || 0,
      comments,
    });
  } catch (err) {
    console.error("Engagement GET error:", err);
    return NextResponse.json({ error: "Failed to load engagement" }, { status: 500 });
  }
}

/**
 * POST /api/engagement
 * Body: { action: "like" | "comment" | "rating" | "delete_comment", targetType, targetId, ... }
 */
export async function POST(request) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: "Login required" }, { status: 401 });
    }

    const body = await request.json();
    const action = String(body.action || "").toLowerCase();
    const targetType = normalizeTargetType(body.targetType);
    const targetId = String(body.targetId || "").trim();

    if (action === "delete_comment") {
      const commentId = String(body.commentId || "").trim();
      if (!commentId) {
        return NextResponse.json({ error: "commentId required" }, { status: 400 });
      }
      await prisma.comment.deleteMany({
        where: { id: commentId, userId: user.id },
      });
      return NextResponse.json({ ok: true });
    }

    if (!targetType || !targetId) {
      return NextResponse.json({ error: "targetType and targetId required" }, { status: 400 });
    }

    if (action === "like") {
      const existing = await prisma.like.findUnique({
        where: {
          userId_targetType_targetId: { userId: user.id, targetType, targetId },
        },
      });
      if (existing) {
        await prisma.like.delete({ where: { id: existing.id } });
        return NextResponse.json({ liked: false });
      }
      await prisma.like.create({
        data: { userId: user.id, targetType, targetId },
      });
      return NextResponse.json({ liked: true });
    }

    if (action === "rating") {
      const score = Math.floor(Number(body.score));
      if (isNaN(score) || score < 1 || score > 5) {
        return NextResponse.json({ error: "score must be 1 to 5" }, { status: 400 });
      }
      const review = typeof body.review === "string" ? body.review.trim() || null : null;
      const rating = await prisma.rating.upsert({
        where: {
          userId_targetType_targetId: { userId: user.id, targetType, targetId },
        },
        update: { score, review },
        create: { userId: user.id, targetType, targetId, score, review },
      });
      return NextResponse.json({ rating });
    }

    if (action === "comment") {
      const text = String(body.body || "").trim();
      if (!text || text.length > 2000) {
        return NextResponse.json(
          { error: "Comment must be between 1 and 2000 characters" },
          { status: 400 }
        );
      }
      const parentId = typeof body.parentId === "string" && body.parentId.trim()
        ? body.parentId.trim()
        : null;
      const comment = await prisma.comment.create({
        data: {
          userId: user.id,
          targetType,
          targetId,
          body: text,
          parentId,
        },
        include: {
          user: { select: { id: true, name: true, avatar: true } },
        },
      });
      return NextResponse.json({ comment }, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Engagement POST error:", err);
    return NextResponse.json({ error: "Failed to save engagement" }, { status: 500 });
  }
}
