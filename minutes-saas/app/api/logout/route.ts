import { NextRequest, NextResponse } from "next/server";
import { clearedCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set(clearedCookie);
  return res;
}
