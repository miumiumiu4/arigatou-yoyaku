import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { flushDeliveries } from "@/lib/deliver";

export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const form = await req.formData();
  const content = String(form.get("content") ?? "");
  // 編集済みの本文で承認 → 参加者全員ぶんの配信を作り、email のある人へ即送信
  const { data: a } = await db
    .from("analyses")
    .update({ content, approved_at: new Date().toISOString() })
    .eq("meeting_id", params.id)
    .select("id")
    .single();
  if (!a) return new NextResponse("no analysis", { status: 404 });
  const { data: ps } = await db.from("meeting_participants").select("contact_id").eq("meeting_id", params.id);
  for (const p of ps ?? []) {
    await db.from("deliveries").upsert({ analysis_id: a.id, contact_id: p.contact_id }, { onConflict: "analysis_id,contact_id", ignoreDuplicates: true });
  }
  await db.from("meetings").update({ status: "approved" }).eq("id", params.id);
  await flushDeliveries({ analysisId: a.id });
  return NextResponse.redirect(new URL(`/meetings/${params.id}`, req.url), 303);
}
