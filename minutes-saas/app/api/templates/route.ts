import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const f = await req.formData();
  const action = String(f.get("action"));
  const id = String(f.get("id") ?? "");
  const name = String(f.get("name") ?? "").trim();
  const instructions = String(f.get("instructions") ?? "").trim();

  if (action === "create" && name && instructions) {
    await db.from("templates").insert({ name, instructions });
  } else if (action === "update" && id && name && instructions) {
    await db.from("templates").update({ name, instructions }).eq("id", id);
  } else if (action === "default" && id) {
    // 既定は常に1件(部分ユニーク索引)なので、外してから付ける
    await db.from("templates").update({ is_default: false }).eq("is_default", true);
    await db.from("templates").update({ is_default: true }).eq("id", id);
  } else if (action === "delete" && id) {
    await db.from("templates").delete().eq("id", id).eq("is_default", false); // 既定は消せない
  } else {
    return new NextResponse("bad request", { status: 400 });
  }
  return NextResponse.redirect(new URL("/templates", req.url), 303);
}
