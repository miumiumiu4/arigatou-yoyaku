import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data: meetings } = await db.from("meetings").select("id, topic, started_at, status, skip_analysis").order("started_at", { ascending: false });
  const { data: contacts } = await db.from("contacts").select("id, name, email").order("created_at", { ascending: false });
  const missing = (contacts ?? []).filter((c) => !c.email);
  return (
    <main>
      <h1>議事録の金庫</h1>
      <p><Link href="/templates">分析テンプレートの管理</Link></p>
      <h2>会議</h2>
      <ul>
        {(meetings ?? []).map((m) => (
          <li key={m.id}>
            <Link href={`/meetings/${m.id}`}>{m.topic ?? "(無題)"}</Link> — {m.started_at?.slice(0, 10)} [{m.skip_analysis ? "分析不要" : m.status}]
          </li>
        ))}
      </ul>
      <h2>メールアドレス未登録の相手 ({missing.length})</h2>
      <p>入力すると、承認済みの分析結果があれば自動で届きます。</p>
      {missing.map((c) => (
        <form key={c.id} action="/api/contacts" method="post" style={{ marginBottom: 8 }}>
          <input type="hidden" name="id" value={c.id} />
          {c.name} <input name="email" type="email" required placeholder="mail@example.com" />
          <button>登録</button>
        </form>
      ))}
    </main>
  );
}
