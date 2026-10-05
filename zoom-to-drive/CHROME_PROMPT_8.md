# Claude in Chrome 用 プロンプト⑧（My Notes を本人ログインで読む準備）

````
依頼元：Claude Code（セッション https://claude.ai/code/session_01HWKWMC1xf7xFB1k72NxABC）
目的：Zoom の My Notes を Google ドライブに保存するため、三浦さん本人のログインで読む Zoom アプリ（General App）を作り、Apps Script とつなぐ。今回は「つないで、形を確かめる」まで。自動保存の開始（setupMyNotes）はまだしない
戻し方：最後の「報告」を埋めて、公嗣さんが Claude Code のセッションに貼り戻す

■ ルール
・秘密の値（Client Secret など）は Chrome は扱わない。コピーも貼り付けも公嗣さんが行う。Chrome は読まない・書かない
・Chrome の操作が安全チェックで止められたら、その手順は公嗣さんに日本語で1つずつ案内して代わりに押してもらい、次の手順から続ける
・英語のボタンは「英語（日本語の意味）」の形で伝える
・GitHub では「Commit changes」と鉛筆マーク（編集）を押さない
・Apps Script の既存ファイル（コード.gs・Probe.gs）は書き換えない。新しく MyNotes.gs を足すだけ
・Zoom で「Publish（公開）」「Submit（審査に出す）」は押さない。自分用のまま使う
・許可画面が出たら、押す前に公嗣さんに確認する（承認は公嗣さん本人）
・ログにメールアドレス・人の名前・会話の文章が出たら「＊＊＊」に伏せる

■ 手順

【A】Apps Script に MyNotes.gs を足す
1. https://github.com/miumiumiu4/arigatou-yoyaku/blob/claude/stoic-volta-24mepa/zoom-to-drive/MyNotes.gs を開く。上部が「214 lines」であることを確かめる
2. 「Raw」の右隣の、四角が2つ重なったボタン（Copy raw file＝中身をコピー）でコピーする
3. Apps Script「Zoom書き起こし保存」→ 左の「ファイル」の横の「＋」→「スクリプト」→ 名前を MyNotes にする
4. できた MyNotes.gs の中身を全部消して貼る → 保存。先頭が「/**」で、一番下が「function shapeOf_」の終わりであることを確かめる

【B】戻り先のURLを調べる
5. 関数の欄（▼）で「showMyNotesRedirectUrl」を選び、切り替わったことを確かめて「▷ 実行」
6. 許可画面が出たら、公嗣さんに押してもらう：Review permissions（権限を確認）→ アカウントを選ぶ → Advanced（詳細）→ Go to Zoom書き起こし保存 (unsafe)（安全ではないページに移動）→ Allow（許可）
7. ログに出た「https://script.google.com/macros/d/…/usercallback」のURLを記録する（秘密ではない）

【C】Zoom で本人ログイン用のアプリを作る
8. https://marketplace.zoom.us →「Develop」（開発）→「Build App」（アプリを作る）
9. 「General App」（一般アプリ）を選ぶ →「Create」（作成）
10. アプリ名を zoom-mynotes-to-drive にする（名前の鉛筆マークから変更）
11. 「Basic Information」（基本情報）で、アプリの管理方法を聞かれたら「User-managed」（ユーザー管理）を選ぶ
12. 「OAuth Information」（OAuth情報）の欄で：
    ・「OAuth Redirect URL」（戻り先URL）に、7で記録したURLを入れる
    ・「OAuth Allow Lists」（許可するURL一覧）にも、同じURLを追加する
13. 「Scopes」（権限）→「Add Scopes」（権限を追加）→ 検索欄で my_notes と入れて、次にチェックを付ける
    ・my_notes:read:note
    ・my_notes:read:content
    ・名前に「transcript」と「read」が入っていて、末尾に「:admin」が付かないものがあれば、それも付ける
    ・「:admin」が付いたもの、「write」「delete」が入ったものは付けない
    →「Done」（完了）→ 保存
14. 左の「App Credentials」（アプリの鍵）に、開発用（Development）の Client ID と Client Secret があることだけ確かめる（値は読まない）

【D】鍵を Apps Script に入れる（公嗣さんの番）
15. 公嗣さんに次を案内して、終わるまで待つ：
    「Apps Script の歯車『プロジェクトの設定』→『スクリプト プロパティを編集』→『スクリプト プロパティを追加』で、
     名前 ZOOM_USER_CLIENT_ID に、Zoom の App Credentials の Client ID の Copy で貼る
     名前 ZOOM_USER_CLIENT_SECRET に、Client Secret の Copy で貼る
     →『スクリプト プロパティを保存』」

【E】Zoom と連携する
16. 関数の欄で「showMyNotesLoginUrl」を選び、切り替わったことを確かめて「▷ 実行」
17. ログに出た「https://zoom.us/oauth/authorize?…」のURLを、公嗣さんに新しいタブで開いてもらう
18. Zoom の画面で「Allow」（許可）を押すのは公嗣さん。押したあと「連携できました」と出たか確かめる
    ・エラーが出たら、画面の文言をそのまま記録する（URLの中の文字列は伏せてよい）

【F】形を確かめる
19. 関数の欄で「probeMyNotesUser」を選び、切り替わったことを確かめて「▷ 実行」
20. 実行ログを全部、右端まで記録する（中身ではなく項目名と件数だけが出る作り）
21. ここで終了。setupMyNotes は実行しない

■ 報告（最後にこの形で、コードブロックの中に書く）
【My Notes 本人ログイン 準備 報告】
A MyNotes.gs 追加＝（済/未）、行数＝
B 戻り先URLの取得＝（済/未）
C Zoomアプリ作成＝（済/未）、User-managed＝（はい/選択肢なし）、Redirect URL と Allow List＝（入れた/未）、足したスコープ＝（名前）
D 鍵の貼り付け（公嗣さん）＝（済/未）
E 連携＝（「連携できました」が出た/エラー：文言）
F probeMyNotesUser のログ＝（全行）
止まった所・質問：
未確認のもの：
````
