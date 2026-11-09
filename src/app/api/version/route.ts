import { NextResponse } from "next/server";
import { connection } from "next/server";

/** Zeigt, welcher Stand (Commit) gerade live ist. Aufruf: /api/version */
export async function GET() {
  await connection();
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "lokal",
    nachricht: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    umgebung: process.env.VERCEL_ENV ?? "lokal",
  });
}
