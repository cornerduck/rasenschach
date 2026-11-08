import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Alles außer statischen Dateien, Bildern und Diagnose-Routen
    "/((?!_next/static|_next/image|favicon.ico|api/sofascore-test|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
