# Zoom書き起こし → Googleドライブ 自動保存

Zoomのクラウド録画の書き起こしを、1時間おきにGoogleドライブの「Zoom書き起こし」フォルダへ
Googleドキュメントとして保存します。ファイル名は次の形です。

```
2026-09-28_1457_栗谷さん_個別面談_SEから転身4ヶ月・お金の不安
```

- 名前は、同じ時間のGoogleカレンダーの予定名から取ります（Zoomの表示名は「K」「クリア」のように誤りが多いため）。
- 後ろの「内容の数語」は、`ANTHROPIC_API_KEY` を設定したときだけClaudeが付けます。未設定なら予定名だけで保存します。
- 一度保存した会議は二度保存しません。書き起こしがまだできていない会議は、次の回にまた見に行きます。

次からは Claude に「Zoomの書き起こしをドライブに見に行って、9/28の栗谷さんの分を読んで」と頼めば読めます。

## 前提

- Zoomの「クラウド記録」と「音声トランスクリプト（文字起こし）」が有効になっていること（Zoomの設定 → 記録）。
  ローカル記録（パソコンに保存）の会議は対象外です。

## 設定（最初の1回だけ・約20分）

1. **Zoomでアプリを作る**
   - marketplace.zoom.us → Develop → Build App → **Server-to-Server OAuth** を作成（名前: zoom-to-drive）
   - Scopes に `cloud_recording:read:list_user_recordings:admin` と `cloud_recording:read:recording:admin`（または旧表記の `recording:read:admin`）を追加
   - Activate する
   - App Credentials の **Account ID / Client ID / Client Secret** を控える（チャットやメモ帳には貼らない）
2. **Apps Scriptを作る**
   - script.google.com → 新しいプロジェクト（名前: Zoom書き起こし保存）
   - `Code.gs` の中身をこのフォルダの `Code.gs` で置き換えて保存
3. **スクリプトプロパティを入れる**（プロジェクトの設定 → スクリプト プロパティ）
   | 名前 | 値 |
   | --- | --- |
   | ZOOM_ACCOUNT_ID | 手順1の Account ID |
   | ZOOM_CLIENT_ID | 手順1の Client ID |
   | ZOOM_CLIENT_SECRET | 手順1の Client Secret |
   | ZOOM_USER_EMAIL | Zoomにログインしているメールアドレス |
   | ANTHROPIC_API_KEY | 任意。ファイル名に内容の数語を付けたいとき |
4. 関数 `setup` を選んで実行 → 許可画面でGoogleアカウントを許可
   （ドライブ・カレンダー・外部への接続の許可を求められます）
5. 関数 `run` を選んで実行 → ドライブに「Zoom書き起こし」フォルダができ、直近7日分が入っていれば成功

## 費用の目安

- Zoom・Apps Script：追加費用なし
- Claude（任意）：1時間の面談1本で数十円程度（書き起こし全文を読んでファイル名を作るため）

## よくあるつまずき

- `スクリプトプロパティ ... が未設定です` → 手順3の名前の綴りを確認
- 何も保存されない → その会議がクラウド記録か、文字起こしが有効かを確認。録画直後は文字起こしの完成まで時間がかかります
- 名前が違う人になる → 同じ時間帯に予定が2つあると、開始時刻が近い方を使います

## My Notes も保存する（MyNotes.gs・本人ログイン型）

会社の鍵（Server-to-Server）では My Notes が読めず、このアカウントには Zoom のアーカイブ機能もないため、
三浦さん本人の Zoom ログインで読む General App を別に作ります。

1. Apps Script に `MyNotes.gs` を足す
2. `showMyNotesRedirectUrl` を実行し、出たURLを Zoom の General App の「OAuth Redirect URL」と「Allow List」に入れる
3. General App のスコープは `my_notes:read:note` と `my_notes:read:content`（:admin なし）
4. スクリプトプロパティに `ZOOM_USER_CLIENT_ID` / `ZOOM_USER_CLIENT_SECRET` を入れる
5. `showMyNotesLoginUrl` を実行し、出たURLを開いて Zoom で許可 →「連携できました」
6. `probeMyNotesUser` で形を確認 → `setupMyNotes` で1時間おきの自動保存を開始（初回は過去分もまとめて保存。5分ごとに区切って次の回に続きを保存）

ファイル名の末尾は `_My Notes`（APIキーがない場合）。あとで書き足されたノートは保存し直します。
