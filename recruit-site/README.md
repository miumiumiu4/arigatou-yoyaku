# 業務委託スタッフ募集ページ セットアップ手順

例え話でいうと、このフォルダは **求人掲示板だけを切り出した「独立店舗」の開店セット** です。
予約サイト（arigatou-yoyaku）は9月30日で閉まるキャンペーン用ですが、こちらは期限なくずっと掲示しておけます。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | 募集ページ本体（YouTube埋め込み＋面接申込フォーム） |
| `Code.gs` | 面接申込だけを受け付ける受付プログラム（**任意**。予約サイトの受付係をそのまま使う場合は不要） |
| `README.md` | この手順書 |

---

## STEP 1：看板（新しいリポジトリ＋GitHub Pages）　所要 約10分

1. GitHub右上 **＋ → New repository**
   - Repository name：`arigatou-recruit`
   - **Public** を選択 → **Create repository**
2. 「uploading an existing file」のリンクをクリック → このフォルダの `index.html` `README.md` `Code.gs` をドラッグ＆ドロップ → **Commit changes**
   （`index.html` はフォルダの外に出して、リポジトリの一番上に置いてください）
3. リポジトリの **Settings → Pages**
   - Source：Deploy from a branch ／ Branch：`main` ／ フォルダ：`/ (root)` → Save
4. 1〜2分待つと、**`https://miumiumiu4.github.io/arigatou-recruit/`** で公開されます。
   応募者に案内するURLはこれ1本です。

### 貼り替える箇所（必須）
- `index.html` の `【YouTube動画ID】` を実際の動画IDに差し替える
  （`https://www.youtube.com/watch?v=XXXXXXXX` の `XXXXXXXX` の部分）
- GitHub上で編集する場合：ファイルを開く → 鉛筆アイコン → 修正 → Commit changes（数十秒で反映）

## STEP 2：受付係（面接申込の送り先）　所要 0〜15分

### そのまま使う（おすすめ・作業なし）
`index.html` の `CONFIG.GAS_URL` には、予約サイトで使っている受付係のURLが既に入っています。
申込は予約サイトと同じスプレッドシートの **「面接申込」シート** に記録され、確認メールも今までどおり届きます。
何もしなくて動きます。

### 募集専用のスプレッドシートに分けたい場合
1. Googleドライブで **スプレッドシートを新規作成**。名前は「面接申込管理」など。
2. メニュー **拡張機能 → Apps Script** を開き、最初のコードを全部消して `Code.gs` の中身を貼り付け → 保存。
3. 関数選択で **`setup`** を選び **▶ 実行**（初回は権限の確認を許可）。
4. **プロジェクトの設定（歯車）→ スクリプト プロパティ** に `NOTIFY_EMAIL` ＝ 申込通知を受け取る自分のメールアドレス を追加。
5. **デプロイ → 新しいデプロイ → 種類：ウェブアプリ**（実行ユーザー：自分 ／ アクセスできるユーザー：全員）→ 表示される **…/exec のURL** をコピー。
6. `index.html` の `CONFIG.GAS_URL` をそのURLに貼り替えて Commit。

> コードを直したあとは、**デプロイ → デプロイを管理 → 編集 → バージョン「新バージョン」→ デプロイ** が必要です（URLは変わりません）。

---

## 運用のしかた

### 面接申込が入ったら
- `NOTIFY_EMAIL` に通知メールが届く → 「面接申込」シートに候補日3つが入っているので、日程を決めて「面接日確定」列に記入 → 応募者へ連絡
- 結果は「結果」列に記入しておくと後から見返せます

### 募集を一時停止したいとき
- GitHub上で `index.html` を開き、`<form id="f" class="card">` の直前に
  `<div class="card"><b>現在、募集は一時停止しています。</b></div>` を追加し、フォーム部分（`<form … </form>`）を削除して Commit
- 再開するときは、このリポジトリの履歴（History）から元の `index.html` を戻せます
