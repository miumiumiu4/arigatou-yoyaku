# Claude in Chrome 用 プロンプト③（My Notes が読めるかの試し）

下の枠の中を丸ごとコピーして、前回と同じ Chrome のチャットに貼ってください。

````
依頼元：Claude Code（セッション https://claude.ai/code/session_01HWKWMC1xf7xFB1k72NxABC）
目的：Zoom の My Notes を、いまの Zoom アプリ（zoom-to-drive）で読めるかを試す。データは保存しない試しだけ
戻し方：最後の「報告」を埋めて、公嗣さんが Claude Code のセッションに貼り戻す

前回の絶対ルールはすべてそのまま守ってください。特に：
・許可画面が出たら押さずに止まって公嗣さんに頼む
・Client Secret・APIキーなどの値は読まない・書かない
・既存のコード（Code.gs）は変えない。消さない
・確認できないものは「未確認」と書く

■ 手順（この順番で）

【1】Zoomアプリに My Notes を読む権限を3つ足す
- marketplace.zoom.us → 右上「Manage」→ zoom-to-drive → 左の「Scopes」→「Add Scopes」
- 検索欄に my_notes と入れ、次の3つにチェックを付ける（読み取りだけ。ほかは付けない）
  ・my_notes:read:note:admin
  ・my_notes:read:content:admin
  ・my_notes:read:notes_transcript:admin
- 「Done」→ Scopes の一覧に、前からある cloud_recording の2つと、この3つの計5つが並んでいることを確認する
- 画面上に「Save」や「Continue」があれば押して保存する。アプリが「Deactivated（無効）」になっていたら、左の「Activation」で有効に戻す

【2】Apps Script に試し用のファイルを足す
- 別のタブで次のURLを開き、「Raw」でコードだけの画面にする
  https://github.com/miumiumiu4/arigatou-yoyaku/blob/claude/stoic-volta-24mepa/zoom-to-drive/Probe.gs
- 全選択してコピーする（これは秘密の値ではないので、Chrome がコピーしてよい）
- Apps Script「Zoom書き起こし保存」のエディタで、左の「ファイル」の横の「＋」→「スクリプト」→ 名前を Probe にする
- できた Probe.gs の中身を全部消して、コピーしたコードを貼る → 保存（フロッピーのマーク、または Ctrl+S / ⌘+S）
- Probe.gs の1行目が「/**」で、関数 probeMyNotes があることを確認する。Code.gs は触らない

【3】試しを実行する
- 上の関数の選択で「probeMyNotes」を選ぶ（選択が切り替わったことを、実行前に目で確かめる。setup や run のままなら実行しない）
- 「実行」→ 許可画面が出たら止まって公嗣さんに頼む
- 実行ログを、上から下まで全部そのまま報告する
  ログには「応答コード（200・401・404 など）」「URLの形」「項目名」だけが出る作りになっている。もしメールアドレスや人の名前、会話の文章が見えたら、その部分は「＊＊＊」に伏せる

■ 報告（最後にこの形で、コードブロックの中に書く）
```
【My Notes 試し 報告】
1 スコープ：足した3つ＝（済/未）、一覧の合計＝（5つ/それ以外：名前）、保存・有効化＝（済/不要/未）
2 Probe.gs：作成＝（済/未）、1行目と関数名の確認＝（済/未）
3 probeMyNotes：実行＝（済/未）、ログ＝（全行そのまま）
止まった所・質問：
未確認のもの：
```
````
