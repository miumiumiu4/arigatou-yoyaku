# 議事録SaaS（書記官の事務所）

Zoomが終わると、全文を清書して金庫(DB)に保存 → 分析 → 自分が承認 → 相手にメール配信。
メール未登録の相手は、後からアドレスを入力した瞬間に自動配信されます。

```
Zoom(文字起こし完了) → /api/zoom/webhook → 清書(全文) → DB
自分用画面(/) → 分析ボタン → 内容を編集 → 承認 → 参加者へメール
アドレス未登録 → 「住所待ち」 → / で入力 → 自動送信
相手用画面(/login → メールのワンタイムリンク → /my) → 自分宛ての承認済み分析だけ閲覧
```

## セットアップ
1. Supabase でプロジェクト作成 → SQL Editor で `supabase/schema.sql` を実行
2. `.env.example` を `.env.local` にコピーして埋める
3. `npm install && npm run dev`
4. Vercel 等にデプロイ後、Zoom Marketplace で **Webhook Only アプリ**を作成
   - Event: `Recording: Recording Transcript Completed`
   - Endpoint URL: `https://<公開URL>/api/zoom/webhook`
   - Secret Token を `ZOOM_WEBHOOK_SECRET_TOKEN` に設定
5. Resend でドメイン認証し、`MAIL_FROM` を設定

## 注意
- Zoom標準の文字起こしは、**クラウド録画の「音声文字起こし」が有効**なときに生成されます（録画ファイルを残さない運用でも、設定で文字起こしのみ取得できるか要確認）。
- 全文はDBのみ。相手用画面には自分宛ての承認済み分析しか出しません。
- 相手ログインはパスワードなしのメールリンク方式(15分・1回限り)。`SESSION_SECRET` を必ず設定してください。
- 既存DBがある場合は `supabase/schema.sql` の差分(`login_tokens` 追加、`analyses.view_token` 削除、`contacts_email_idx`)を適用してください。
- 自分用画面は Basic 認証(`ADMIN_USER`/`ADMIN_PASSWORD`)。本番では必ず設定してください。
- 長い会議は Vercel の実行時間制限に注意（`maxDuration`）。必要ならキュー化します。

## 次の段階
分析テンプレートの切替、会議ごとの「分析不要」フラグ、失敗配信の再送ボタン。
