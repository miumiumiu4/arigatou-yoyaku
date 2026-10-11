# Claude in Chrome 用 プロンプト⑫（栗谷さんの清書で、話者「K」を「栗谷」に直す）

````
依頼元：Claude Code
戻し先：Claude Code のスレッド「✅Zoom書き起こし → ドライブ自動保存」（https://claude.ai/code/session_01HWKWMC1xf7xFB1k72NxABC）
作業フォルダ：GitHub miumiumiu4/arigatou-yoyaku（ブランチ claude/stoic-volta-24mepa）の zoom-to-drive フォルダ
対象ファイル：Google ドライブ「Zoom書き起こし_清書」フォルダの「2026-10-05_2030_栗谷さん ロードマップ作成会_清書」
  https://docs.google.com/document/d/1Z5ylwwO_ZOGpzFsxdcOSoVmDG7kuOkLDuc7HiAdhcTU/edit
目的：話者名「K」をすべて「栗谷」に置き換える。ほかの所は一切変えない

■ ルール
・直すのは話者名だけ。ほかの文字・書式・共有設定は触らない
・英語のボタンは「英語（日本語の意味）」の形で伝える
・Chrome の操作が安全チェックで止められたら、その手順は公嗣さんに日本語で1つずつ案内して代わりに押してもらう

■ 手順
1. 上の対象ファイルを開く
2. 「編集」→「検索と置換」（Mac は ⌘+Shift+H）を開き、「正規表現を使用」にチェック
3. 検索：(\d\d:\d\d:\d\d) K:
4. 置換後：$1 栗谷:
5. 検索欄の右の件数（数百件のはず）を記録してから「すべて置換」
6. 検索欄に「 K:」（半角スペース＋K＋コロン）と入れ、0件になったことを確かめる。最初の数段落を目で見て「栗谷:」になっているか確かめる

■ 報告（コードブロックの中に。貼り戻す先：Claude Code のスレッド「✅Zoom書き起こし → ドライブ自動保存」）
【栗谷さん清書 話者名 報告】
置換前の件数＝＿、置換＝（済/未）、残り「 K:」＝＿件
止まった所・質問：
````
