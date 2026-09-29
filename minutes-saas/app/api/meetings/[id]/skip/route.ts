import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const skip = (await req.formData()).get("skip") === "1";
  const { data: a } = await db.from("analyses").select("id").eq("meeting_id", params.id).maybeSingle();
  if (a) return new NextResponse("分析済みの会議は切り替えられません", { status: 409 });
  await db.from("meetings").update({ skip_analysis: skip }).eq("id", params.id);
  return NextResponse.redirect(new URL(`/meetings/${params.id}`, req.url), 303);
}
