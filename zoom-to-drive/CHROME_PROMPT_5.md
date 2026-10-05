# Claude in Chrome 用 プロンプト⑤（保管庫の正しい聞き方を探す）

下の枠の中を丸ごとコピーして、前回と同じ Chrome のチャットに貼ってください。

````
依頼元：Claude Code（セッション https://claude.ai/code/session_01HWKWMC1xf7xFB1k72NxABC）
目的：会社全体の保管庫（/docs/archives）は権限が通った（401→400）。正しい聞き方（日付の範囲など）を探す試し用の関数 probeArchives を足したので、Probe.gs を差し替えて実行する。データは保存しない
戻し方：最後の「報告」を埋めて、公嗣さんが Claude Code のセッションに貼り戻す

前回の絶対ルールはそのまま守ってください。特に：
・Zoom の Scopes（権限）の画面は開かない・触らない（今回は Zoom 側の操作はなし）
・許可画面が出たら押さずに止まって公嗣さんに頼む
・ログに会議UUID・メールアドレス・人の名前・会話の文章が出たら「＊＊＊」に伏せる
・Code.gs は変えない

■ 手順

【1】Probe.gs を新しいものに差し替える
- 別のタブで次のURLを開き、「Raw」でコードだけの画面にする
  https://github.com/miumiumiu4/arigatou-yoyaku/blob/claude/stoic-volta-24mepa/zoom-to-drive/Probe.gs
- 全選択してコピーする（秘密の値ではないので Chrome がコピーしてよい）
- Apps Script「Zoom書き起こし保存」→ 左のファイル一覧で「Probe.gs」を開く（Code.gs ではない）
- Probe.gs の中身を全部消して、コピーしたコードを貼る → 保存
- 貼る前に、クリップボードの中身がコードであること（先頭が「/**」）を確かめる。前回、依頼文が貼られたことがあるため
- 保存後、Probe.gs に関数 probeMyNotes と probeArchives の両方があることを確認する

【2】probeArchives を実行する
- 関数の選択を「probeArchives」にする（切り替わったことを目で確かめてから実行）
- 「実行」→ 許可画面が出たら止まって公嗣さんに頼む
- 実行ログを上から下まで全部記録する（伏せるべきものは伏せる）

■ 報告（最後にこの形で、コードブロックの中に書く）
```
【保管庫 聞き方 試し 報告】
1 Probe.gs 差し替え＝（済/未）、関数2つの確認＝（済/未）
2 probeArchives：実行＝（済/未）、ログ＝（全行。伏せた所は＊＊＊）
止まった所・質問：
未確認のもの：
```
````
