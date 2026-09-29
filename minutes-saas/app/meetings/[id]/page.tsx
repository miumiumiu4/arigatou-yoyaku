import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Meeting({ params }: { params: { id: string } }) {
  const { data: m } = await db.from("meetings").select("*").eq("id", params.id).single();
  const { data: a } = await db.from("analyses").select("*").eq("meeting_id", params.id).maybeSingle();
  const { data: ds } = a
    ? await db.from("deliveries").select("id, status, error, contacts(name, email)").eq("analysis_id", a.id)
    : { data: [] as any[] };
  if (!m) return <p>見つかりません</p>;
  return (
    <main>
      <Link href="/">← 一覧</Link>
      <h1>{m.topic}</h1>
      <h2>分析</h2>
      {!a && (
        <form action={`/api/meetings/${m.id}/analyze`} method="post">
          <button>分析する</button>
        </form>
      )}
      {a && (
        <form action={`/api/meetings/${m.id}/approve`} method="post">
          <textarea name="content" defaultValue={a.content} rows={20} style={{ width: "100%" }} />
          <button>{a.approved_at ? "修正して再承認" : "承認して相手に送信"}</button>
        </form>
      )}
      {a && (
        <>
          <h3>配信状況</h3>
          <ul>
            {(ds ?? []).map((d: any, i: number) => (
              <li key={i}>
                {d.contacts?.name} ({d.contacts?.email ?? "メール未登録"}) — {d.status === "waiting_email" ? (d.contacts?.email ? "送信待ち" : "住所待ち") : d.status}
                {d.status === "failed" && (
                  <form action={`/api/deliveries/${d.id}/retry`} method="post" style={{ display: "inline", marginLeft: 8 }}>
                    <small style={{ color: "crimson" }}>{d.error}</small> <button>再送</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <h2>清書した全文</h2>
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{m.transcript_clean}</pre>
    </main>
  );
}
