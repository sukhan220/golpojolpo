import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();
const WINDOW_MS = 30 * 60 * 1000;
const MAX_UNIQUE = 6;

async function atomicGrant(actorKey, audioKey) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + WINDOW_MS);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actorKey}))`;
    await tx.$executeRaw`
      DELETE FROM "audio_play_grants"
      WHERE "actorKey" = ${actorKey} AND "expiresAt" <= ${now}
    `;
    const active = await tx.$queryRaw`
      SELECT "audioKey", "expiresAt" FROM "audio_play_grants"
      WHERE "actorKey" = ${actorKey} AND "expiresAt" > ${now}
      ORDER BY "expiresAt" ASC
    `;
    const existing = active.find((g) => g.audioKey === audioKey);
    if (existing) {
      return { allowed: true, reused: true, used: active.length };
    }
    if (active.length >= MAX_UNIQUE) {
      return {
        allowed: false,
        used: active.length,
        nextAvailableAt: new Date(active[0].expiresAt).toISOString(),
      };
    }
    const id = crypto.randomBytes(12).toString("hex");
    await tx.$executeRaw`
      INSERT INTO "audio_play_grants" ("id", "actorKey", "audioKey", "ipHash", "grantedAt", "expiresAt")
      VALUES (${id}, ${actorKey}, ${audioKey}, ${null}, ${now}, ${expiresAt})
      ON CONFLICT ("actorKey", "audioKey")
      DO UPDATE SET "grantedAt" = ${now}, "expiresAt" = ${expiresAt}
    `;
    return { allowed: true, reused: false, used: active.length + 1 };
  });
}

async function run() {
  const testActor = `user:test-concurrency-${Date.now()}`;
  console.log("Running live Neon concurrency & sliding-window verification for:", testActor);

  try {
    // Test 1: Fire 10 CONCURRENT requests for 10 distinct audios
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => atomicGrant(testActor, `audio-key-${i + 1}`))
    );
    const allowedCount = results.filter((r) => r.allowed).length;
    const blockedCount = results.filter((r) => !r.allowed).length;
    console.log(`Test 1 (10 concurrent unique requests): allowed=${allowedCount}, blocked=${blockedCount}`);
    if (allowedCount !== 6 || blockedCount !== 4) {
      throw new Error(`Expected 6 allowed & 4 blocked, got ${allowedCount}/${blockedCount}`);
    }

    // Test 2: Re-request an already-granted audio -> must be allowed with reused=true & used=6
    const grantedKey = results.find((r) => r.allowed) ? "audio-key-1" : null;
    const activeRows = await prisma.$queryRaw`
      SELECT "audioKey" FROM "audio_play_grants" WHERE "actorKey" = ${testActor}
    `;
    const reuseRes = await atomicGrant(testActor, activeRows[0].audioKey);
    console.log("Test 2 (Reuse granted audio):", reuseRes);
    if (!reuseRes.allowed || !reuseRes.reused || reuseRes.used !== 6) {
      throw new Error("Expected reused=true & used=6");
    }

    // Test 3: 7th distinct audio while at limit -> must be blocked with nextAvailableAt
    const seventhRes = await atomicGrant(testActor, "audio-key-999");
    console.log("Test 3 (7th distinct audio blocked):", seventhRes);
    if (seventhRes.allowed || !seventhRes.nextAvailableAt) {
      throw new Error("Expected 7th audio to be blocked with nextAvailableAt");
    }

    // Test 4: Simulate 30 minutes passing for the oldest grant -> slot frees up for 7th audio!
    await prisma.$executeRaw`
      UPDATE "audio_play_grants"
      SET "expiresAt" = ${new Date(Date.now() - 1000)}
      WHERE "actorKey" = ${testActor} AND "audioKey" = ${activeRows[0].audioKey}
    `;
    const afterExpiryRes = await atomicGrant(testActor, "audio-key-999");
    console.log("Test 4 (Sliding window expiry frees 1 slot):", afterExpiryRes);
    if (!afterExpiryRes.allowed || afterExpiryRes.reused || afterExpiryRes.used !== 6) {
      throw new Error("Expected 7th audio to be allowed after oldest grant expired");
    }

    console.log("ALL 4 LIVE NEON CONCURRENCY & SLIDING-WINDOW TESTS PASSED!");
  } finally {
    await prisma.$executeRaw`DELETE FROM "audio_play_grants" WHERE "actorKey" = ${testActor}`;
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
