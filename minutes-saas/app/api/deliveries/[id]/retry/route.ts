import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { flushDeliveries } from "@/lib/deliver";

export const maxDuration = 60;

// 失敗した配信を1件だけ再送する
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: d } = await db.from("deliveries").select("status, analyses(meeting_id)").eq("id", params.id).maybeSingle();
  if (!d) return new NextResponse("not found", { status: 404 });
  if (d.status === "failed") await flushDeliveries({ deliveryId: params.id });
  return NextResponse.redirect(new URL(`/meetings/${(d as any).analyses.meeting_id}`, req.url), 303);
}
