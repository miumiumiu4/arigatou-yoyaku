import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { hashToken } from "@/lib/session";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const done = NextResponse.redirect(new URL("/login?sent=1", req.url), 303); // 登録有無に関わらず同じ応答

  const { data: c } = await db.from("contacts").select("id, name").ilike("email", email).maybeSingle();
  if (!c) return done;

  // 連続送信の抑止(1分に1通)
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db.from("login_tokens").select("*", { count: "exact", head: true }).eq("contact_id", c.id).gt("created_at", since);
  if ((count ?? 0) > 0) return done;

  const token = crypto.randomBytes(32).toString("base64url");
  await db.from("login_tokens").insert({
    token_hash: hashToken(token),
    contact_id: c.id,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
  await sendMail(
    email,
    "ログインリンク",
    `<p>${c.name} 様</p><p>下のリンクからログインできます(15分・1回のみ有効)。</p>` +
      `<p><a href="${process.env.APP_URL}/login/verify?token=${token}">ログインする</a></p>` +
      `<p>心当たりがない場合は、このメールを破棄してください。</p>`,
  );
  return done;
}
