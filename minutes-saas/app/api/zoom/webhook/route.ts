import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifySignature, urlValidationResponse, downloadTranscript, parseVtt } from "@/lib/zoom";
import { polishTranscript } from "@/lib/claude";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const evt = JSON.parse(body);

  // Zoom のエンドポイント検証(署名なしで来る)
  if (evt.event === "endpoint.url_validation") {
    return NextResponse.json(urlValidationResponse(evt.payload.plainToken));
  }
  if (!verifySignature(body, req.headers.get("x-zm-request-timestamp") ?? "", req.headers.get("x-zm-signature") ?? "")) {
    return new NextResponse("bad signature", { status: 401 });
  }
  if (evt.event !== "recording.transcript_completed") return NextResponse.json({ ok: true, ignored: true });

  const obj = evt.payload.object;
  const file = (obj.recording_files ?? []).find((f: any) => f.file_type === "TRANSCRIPT");
  if (!file) return NextResponse.json({ ok: true, ignored: "no transcript" });

  const raw = parseVtt(await downloadTranscript(file.download_url, evt.download_token));
  const clean = await polishTranscript(raw.text);

  const { data: meeting, error } = await db
    .from("meetings")
    .upsert(
      { zoom_uuid: obj.uuid, topic: obj.topic, started_at: obj.start_time, transcript_raw: raw.text, transcript_clean: clean },
      { onConflict: "zoom_uuid" },
    )
    .select("id")
    .single();
  if (error) throw error;

  // 話者名 -> 名簿(無ければ email 空欄で新規作成。後から email を入れれば自動配信)
  for (const name of raw.speakers) {
    let { data: c } = await db.from("contacts").select("id").ilike("zoom_name", name).maybeSingle();
    if (!c) {
      const ins = await db.from("contacts").insert({ name, zoom_name: name }).select("id").single();
      c = ins.data;
    }
    if (c) await db.from("meeting_participants").upsert({ meeting_id: meeting.id, contact_id: c.id });
  }
  return NextResponse.json({ ok: true, meeting_id: meeting.id });
}
