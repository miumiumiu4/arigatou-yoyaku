# Claude in Chrome 用 プロンプト④（会社全体の保管庫の権限を試す）

下の枠の中を丸ごとコピーして、前回と同じ Chrome のチャットに貼ってください。

````
依頼元：Claude Code（セッション https://claude.ai/code/session_01HWKWMC1xf7xFB1k72NxABC）
目的：My Notes を「会社全体の保管庫（/docs/archives）」から読めるかを試す。前回のログで Zoom が求めた権限 docs:read:archive:admin を足して、probeMyNotes をもう一度実行する
戻し方：最後の「報告」を埋めて、公嗣さんが Claude Code のセッションに貼り戻す

前回の絶対ルールはすべてそのまま守ってください。特に：
・許可画面が出たら押さずに止まって公嗣さんに頼む
・秘密の値は読まない・書かない。ログに会議UUID・メールアドレス・人の名前・会話の文章が出たら「＊＊＊」に伏せる
・Code.gs と Probe.gs は変えない
・確認できないものは「未確認」と書く

■ 手順（この順番で）

【1】Add Scopes で archive の権限を探す（まず見るだけ）
- marketplace.zoom.us → Manage → zoom-to-drive → Scopes →「Add Scopes」
- 検索欄で次の言葉を順に検索し、出てきたスコープ名をすべて控える（Scroll for more が出たら最後までスクロールする）
  ・archive
  ・docs
- 控えた名前を報告に書く

【2】読み取りの archive 権限だけを足す
- 【1】で見つかった中から、次に当てはまるものにだけチェックを付ける
  ・名前に「docs」と「archive」の両方が入っていて、「read」が入っているもの（例：docs:read:archive:admin、docs:read:archive_attachment:admin）
- 「write」「delete」「update」が入っているものは付けない
- 当てはまるものが1つも無ければ、何も付けずに閉じて、【3】は飛ばして報告する
- 付けたら「Done」→ 一覧に増えたことを確認 → Save や Continue があれば押す。Activation が有効のままか確認する

【3】probeMyNotes をもう一度実行する
- Apps Script「Zoom書き起こし保存」→ 関数の選択を「probeMyNotes」にする（切り替わったことを目で確かめてから実行）
- 「実行」→ 許可画面が出たら止まって公嗣さんに頼む
- 実行ログを上から下まで全部報告する（伏せるべきものは伏せる）
- 特に最後の行「/docs/archives?products=my_notes…」の応答コードとメッセージを、そのまま書く

■ 報告（最後にこの形で、コードブロックの中に書く）
```
【archive 権限 試し 報告】
1 検索結果：archive＝（名前を全部）、docs＝（名前を全部）
2 足した権限＝（名前/なし）、保存・有効化＝（済/不要/未）
3 probeMyNotes：実行＝（済/未/飛ばした）、ログ＝（全行。伏せた所は＊＊＊）
止まった所・質問：
未確認のもの：
```
````
