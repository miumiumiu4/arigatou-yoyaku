import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentContact } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MyAnalysis({ params }: { params: { id: string } }) {
  const me = await currentContact();
  if (!me) redirect("/login");
  // 自分宛ての配信がある分析だけ閲覧可(他人の分析IDを指定しても見えない)
  const { data: d } = await db
    .from("deliveries")
    .select("analyses!inner(content, approved_at, meetings(topic))")
    .eq("contact_id", me.id)
    .eq("analysis_id", params.id)
    .not("analyses.approved_at", "is", null)
    .maybeSingle();
  const a = (d as any)?.analyses;
  if (!a) return <p>ページが見つかりません。</p>;
  return (
    <main>
      <Link href="/my">← 一覧</Link>
      <h1>{a.meetings?.topic}</h1>
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{a.content}</pre>
    </main>
  );
}
