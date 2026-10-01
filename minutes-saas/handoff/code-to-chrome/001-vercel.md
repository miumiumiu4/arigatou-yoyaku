# 001 Vercelにアプリを取り込む(Deployの手前まで)
依頼元: Claude Code(フォルダ: minutes-saas/handoff/code-to-chrome/001-vercel.md)
宛先: Claude in Chrome
返信先: Claude Code(フォルダ: minutes-saas/handoff/chrome-to-code/ / ファイル名: R001-vercel.md)
  ※ Chromeはチャットに報告を出す。ユーザーがClaude Codeに貼る。Claude Codeが上のフォルダ・ファイル名で保存する。
Re: なし / 日付: 2026-10-01

## 最初にやること
`minutes-saas/handoff/README.md` を読み、そこの「共通ルール」を、以後すべての作業で守ってください。
報告は、`minutes-saas/handoff/chrome-to-code/TEMPLATE.md` の形で、チャットに出してください(ファイルには書かないでください)。報告番号は `R001` です。

## 目的
議事録SaaSを、Vercelに取り込み、環境変数を入れて、**Deployの手前で止まる**。

## 前提情報
- GitHubリポジトリ: miumiumiu4/arigatou-yoyaku / ブランチ: main(議事録アプリは合流済み)
- Root Directory: minutes-saas(Framework Preset は Next.js のはず)
- 公開URL: https://minutes.arigatouosouji.com
- メール送信ドメイン: mail.arigatouosouji.com(Resendで認証済み)
- 環境変数の一覧の元: minutes-saas/.env.example

## 完了済み(再作業は不要)
Supabase(DB作成・スキーマ実行済み)/ Anthropic API(クレジット購入済み)/ Resend(ドメイン認証済み)/ Zoom(Webhook Onlyアプリ作成済み・Secret Token確認済み)

## 手順

### A. 先に報告してほしい質問(操作はしないで、一言で答える)
先日、次の2つの画面が出ました。あなたが開いたかどうかを、分かる範囲で教えてください。開いていないなら「開いていない」でかまいません。
1. Googleの許可画面「clasp - The Apps Script CLI」
2. 「localhost で接続が拒否されました (ERR_CONNECTION_REFUSED)」

### B. ログインとプラン
- vercel.com にログインが必要なら、止まって、ユーザーに依頼する(GitHubでログイン)。
- Proプランが必要(仕事で使うため)。契約・支払い画面の前で止まって、ユーザーに確認する。
- GitHub連携の許可画面が出たら、ユーザーが操作する。

### C. 取り込み
- Add New → Project で miumiumiu4/arigatou-yoyaku を選ぶ。ブランチは main のまま。
- Root Directory を minutes-saas にする。

### D. 環境変数(Deployの前に、取り込み画面で入れる)
秘密の値は、チャットに書かない。1つずつ、元の画面でコピー → Vercelに貼り付け → 追加。可能なら Sensitive を有効にする。
- SUPABASE_URL: Supabase の Project Settings → API の Project URL
- SUPABASE_SERVICE_ROLE_KEY: 同じ画面の API Keys → Legacy タブの service_role キー(Reveal してコピー)
- ANTHROPIC_API_KEY: console.anthropic.com で新規作成(名前: minutes-saas)。作成直後の画面でコピーして貼る。
- ZOOM_WEBHOOK_SECRET_TOKEN: Zoomアプリ minutes-saas の Feature 画面の Secret Token
- RESEND_API_KEY: Resend の API keys で新規作成(名前: minutes-saas / Permission: Sending access / Domain: mail.arigatouosouji.com)。作成直後の画面でコピーして貼る。
- MAIL_FROM: 議事録 <minutes@mail.arigatouosouji.com>
- APP_URL: https://minutes.arigatouosouji.com
- SESSION_SECRET: ランダムな40文字以上の英数字を生成して入力
- ADMIN_USER: admin
- ADMIN_PASSWORD: **ユーザーが自分で決めて入力する。** この欄に来たら止まって、ユーザーに依頼する。

### E. ここで止まる
**「Deploy」は押さない。**

## 報告してほしいこと(R001)
1. 手順Aの質問への答え
2. 環境変数の表(名前だけ。値は書かない)
| 環境変数の名前 | 設定済みか | Sensitiveか |
3. Root Directory と Framework Preset の値
4. 想定外のことがあれば、その内容(Claude Code への依頼があれば、それも)
