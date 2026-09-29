// メールのリンクを開いただけでは消費しない(セキュリティソフトの自動プリフェッチ対策)。ボタンで確定する
export default function Verify({ searchParams }: { searchParams: { token?: string } }) {
  if (!searchParams.token) return <p>リンクが無効です。</p>;
  return (
    <main>
      <h1>ログイン</h1>
      <form action="/api/login/verify" method="post">
        <input type="hidden" name="token" value={searchParams.token} />
        <button>ログインする</button>
      </form>
    </main>
  );
}
