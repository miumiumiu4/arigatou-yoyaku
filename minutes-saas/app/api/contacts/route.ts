import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { flushDeliveries } from "@/lib/deliver";

export const maxDuration = 300;

// 名簿にメールアドレスを入れた瞬間、待機中(承認済み)の分析結果が自動で届く
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const id = String(form.get("id"));
  const email = String(form.get("email") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return new NextResponse("invalid email", { status: 400 });
  await db.from("contacts").update({ email }).eq("id", id);
  await flushDeliveries({ contactId: id });
  return NextResponse.redirect(new URL("/", req.url), 303);
}
