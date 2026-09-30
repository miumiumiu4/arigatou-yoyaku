import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashToken, sessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  const token = String((await req.formData()).get("token") ?? "");
  // 未使用かつ期限内のものだけを「使用済み」に更新できた場合のみ成功(二重使用防止)
  const { data } = await db
    .from("login_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hashToken(token))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("contact_id")
    .maybeSingle();
  if (!data) return NextResponse.redirect(new URL("/login?error=1", req.url), 303);
  const res = NextResponse.redirect(new URL("/my", req.url), 303);
  res.cookies.set(sessionCookie(data.contact_id));
  return res;
}
