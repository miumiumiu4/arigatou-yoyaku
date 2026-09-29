import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analyzeTranscript } from "@/lib/claude";

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: m } = await db.from("meetings").select("topic, transcript_clean, skip_analysis").eq("id", params.id).single();
  if (!m?.transcript_clean) return new NextResponse("no transcript", { status: 404 });
  if (m.skip_analysis) return new NextResponse("この会議は分析不要に設定されています", { status: 409 });
  const content = await analyzeTranscript(m.transcript_clean, m.topic ?? "");
  await db.from("analyses").upsert({ meeting_id: params.id, content, approved_at: null }, { onConflict: "meeting_id" });
  await db.from("meetings").update({ status: "analyzed" }).eq("id", params.id);
  return NextResponse.redirect(new URL(`/meetings/${params.id}`, req.url), 303);
}
