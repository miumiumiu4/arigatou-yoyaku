# ever-prep

集客戦略会議をご予約いただいた方向けの「3日間 集客戦略準備」の宿題フォーム（GitHub Pages）。

- `index.html?d=1` 宿題1「設計図」／`?d=2` 宿題2「集客の棚卸し」／`?d=3` 宿題3「会議の準備」
- UTAGEのメールには `?d=1&m=%mail%&n=%name%` を付けてリンクする（メール欄が埋まった状態で開く）
- 送信先は受け口GAS（`type=prep`）。答えはスプレッドシートの「3日間宿題」タブに入り、非公開リポジトリ ever-prep-data で集計する。このリポジトリに答えは置かない
- 質問とキー名は `questions.js`。変えるときは ever-prep-data の `scripts/build.py` もそろえる
