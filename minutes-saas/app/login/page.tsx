export default function Login({ searchParams }: { searchParams: { sent?: string; error?: string } }) {
  return (
    <main>
      <h1>分析結果を見る</h1>
      <p>ご登録のメールアドレスを入力してください。ログイン用のリンク(15分有効)をお送りします。</p>
      <form action="/api/login" method="post">
        <input name="email" type="email" required placeholder="mail@example.com" style={{ width: 280 }} />
        <button>ログインリンクを送る</button>
      </form>
      {searchParams.sent && <p>登録済みのアドレスであれば、メールをお送りしました。届かない場合は迷惑メールをご確認ください。</p>}
      {searchParams.error && <p>リンクが無効か、期限切れです。もう一度お試しください。</p>}
    </main>
  );
}
