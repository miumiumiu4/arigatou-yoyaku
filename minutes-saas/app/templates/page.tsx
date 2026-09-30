import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Templates() {
  const { data } = await db.from("templates").select("*").order("created_at");
  return (
    <main>
      <Link href="/">← 一覧</Link>
      <h1>分析テンプレート</h1>
      <p>会議ごとに「分析する」時に選べます。指示文には、分析の構成・観点を書いてください。</p>
      {(data ?? []).map((t) => (
        <form key={t.id} action="/api/templates" method="post" style={{ border: "1px solid #ccc", padding: 8, marginBottom: 12 }}>
          <input type="hidden" name="id" value={t.id} />
          <input name="name" defaultValue={t.name} required /> {t.is_default && <strong>[既定]</strong>}
          <textarea name="instructions" defaultValue={t.instructions} rows={4} required style={{ width: "100%" }} />
          <button name="action" value="update">保存</button>{" "}
          {!t.is_default && <button name="action" value="default">既定にする</button>}{" "}
          {!t.is_default && <button name="action" value="delete">削除</button>}
        </form>
      ))}
      <h2>新規作成</h2>
      <form action="/api/templates" method="post">
        <input name="name" placeholder="テンプレート名" required />
        <textarea name="instructions" placeholder="例: 構成: 1.要点 2.懸念 3.次の一手" rows={4} required style={{ width: "100%" }} />
        <button name="action" value="create">作成</button>
      </form>
    </main>
  );
}
