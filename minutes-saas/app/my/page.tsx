import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentContact } from "@/lib/session";

export const dynamic = "force-dynamic";

// 相手用マイページ: 自分宛て・承認済みの分析だけ
export default async function My() {
  const me = await currentContact();
  if (!me) redirect("/login");
  const { data } = await db
    .from("deliveries")
    .select("analyses!inner(id, approved_at, meetings(topic, started_at))")
    .eq("contact_id", me.id)
    .not("analyses.approved_at", "is", null);
  const items = ((data ?? []) as any[]).map((d) => d.analyses).sort((a, b) => (b.approved_at > a.approved_at ? 1 : -1));
  return (
    <main>
      <h1>{me.name} 様の分析結果</h1>
      <ul>
        {items.map((a) => (
          <li key={a.id}>
            <Link href={`/my/${a.id}`}>{a.meetings?.topic ?? "会議"}</Link> — {a.meetings?.started_at?.slice(0, 10)}
          </li>
        ))}
      </ul>
      {items.length === 0 && <p>まだ届いている分析結果はありません。</p>}
      <form action="/api/logout" method="post">
        <button>ログアウト</button>
      </form>
    </main>
  );
}
