# ever-prep-data（非公開）

集客戦略会議をご予約いただいた方の「3日間 集客戦略準備」の宿題と、予約フォームのアンケートの集計。三浦さんだけが見るリポジトリです。共同編集者は足さないでください。

## 見るところ
- **[dashboard.md](dashboard.md)**：全体の集計（人数と割合、グラフ）
- **people/**：1人1枚の「会議の準備シート」。ファイル名は `会議日_時刻_番号.md`。会議の30分前に開く

## 更新のしくみ
1. 宿題フォーム（公開リポジトリ ever-prep の GitHub Pages）→ 受け口GAS（type=prep）→ 顧客ログの「3日間宿題」タブ
2. 定期タスクがタブを読んで `data/prep/` `data/survey/` に1人1ファイルで書き出す
3. `python3 scripts/build.py` で people/ と dashboard.md を作り直して push
4. 会議のあとは `data/manual/<番号>.json` に `{"attended":true,"step_decided":true,"franchise_talk":false,"memo":"…"}` を書くと、じょうごに入る

## 決まりごと
- 個人の答えはこのリポジトリと顧客ログだけに置く。ほかのリポジトリ・公開物には出さない
- 加盟金330万円は会議の最初に三浦さんが伝える。すすめない。加盟を考える方には法定の書面を先に渡す
