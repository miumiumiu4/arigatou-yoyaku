import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// 相手用の窓口: 承認済みの分析結果だけ(全文は見せない)
export default async function Recipient({ params }: { params: { token: string } }) {
  const { data: a } = await db
    .from("analyses")
    .select("content, approved_at, meetings(topic)")
    .eq("view_token", params.token)
    .not("approved_at", "is", null)
    .maybeSingle();
  if (!a) return <p>ページが見つかりません。</p>;
  return (
    <main>
      <h1>{(a as any).meetings?.topic}</h1>
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{a.content}</pre>
    </main>
  );
}
