# Claude in Chrome 用 プロンプト⑩（My Notes の過去分を取り直す）

````
依頼元：Claude Code
戻し先：Claude Code のスレッド「✅Zoom書き起こし → ドライブ自動保存」（https://claude.ai/code/session_01HWKWMC1xf7xFB1k72NxABC）
作業フォルダ：GitHub miumiumiu4/arigatou-yoyaku（ブランチ claude/stoic-volta-24mepa）の zoom-to-drive フォルダ
保存先：Google ドライブ「マイドライブ」直下の「Zoom書き起こし」フォルダ
Apps Script：プロジェクト「Zoom書き起こし保存」
目的：前回、会議の一覧が0件だったのに「過去分は保存済み」の印が付いてしまった。直した MyNotes.gs に差し替え、印を消して過去分（最大180日・新しい順）を取り直す

■ ルール
・秘密の値は扱わない（今回は貼る必要なし）
・Chrome の操作が安全チェックで止められたら、その手順は公嗣さんに日本語で1つずつ案内して代わりに押してもらい、次の手順から続ける
・英語のボタンは「英語（日本語の意味）」の形で伝える
・GitHub では「Commit changes」と鉛筆マーク（編集）を押さない
・Apps Script の コード.gs・Probe.gs は書き換えない。書き換えるのは MyNotes.gs だけ。Polish.gs は今回は足さない（無くてよい）
・許可画面が出たら、押す前に公嗣さんに確認する（承認は公嗣さん本人）
・ログに人の名前・会話の文章が出たら「＊＊＊」に伏せる

■ 手順
【A】MyNotes.gs を新しい版にする
1. https://github.com/miumiumiu4/arigatou-yoyaku/blob/claude/stoic-volta-24mepa/zoom-to-drive/MyNotes.gs を開く。上部が「334 lines」であることを確かめる（321 のままなら、ページを再読み込みする）
2. 「Raw」の右隣の、四角が2つ重なったボタン（Copy raw file＝中身をコピー）でコピーする
3. Apps Script「Zoom書き起こし保存」→ 左の MyNotes.gs（Mynotes.gs）を開く → 中身を全部選んで消し、貼る → 保存（フロッピーのマーク）
4. 一番下の行番号が 334〜335 であることを確かめる

【B】過去分を取り直す
5. 上の関数の欄（▼）で「redoMyNotesBackfill」を選び、切り替わったことを確かめて「▷ 実行」
6. 許可画面が出たら、押す前に公嗣さんに確認して押してもらう
7. 実行ログを最後まで待つ（最大6分）。全行を記録する（名前・会話は＊＊＊。「保存:」の行は件数だけでよい）
8. ログに「時間切れが近いので、残りは次の回に保存します」と出たら、もう一度だけ「runMyNotes」を選んで「▷ 実行」し、そのログも記録する

【C】ドライブを確かめる
9. Google ドライブ「マイドライブ」→「Zoom書き起こし」フォルダを開き、ファイルの数と、「2026-10-11」で始まるファイルがあるかを確かめる（名前は＊＊＊でよい）

■ 報告（最後にこの形で、コードブロックの中に書く。貼り戻す先：Claude Code のスレッド「✅Zoom書き起こし → ドライブ自動保存」）
【My Notes 取り直し 報告】
A MyNotes.gs 差し替え＝（済/未）、行数＝
B redoMyNotesBackfill のログ＝（全行。「会議 ＿件を確認（取得元: ＿）」の行は必ずそのまま）、「保存:」＝＿件
  runMyNotes 2回目＝（した/しない）、そのログ＝
C 「Zoom書き起こし」フォルダのファイル数＝＿、2026-10-11 のファイル＝（ある/ない）
止まった所・質問：
````
