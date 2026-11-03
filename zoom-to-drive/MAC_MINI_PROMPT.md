# Mac mini 用プロンプト（Zoom のローカル録画 → 外付け SSD → YouTube ＋ 文字起こしをドライブへ）

HAPPY が Mac mini の Claude Code（副社長）に渡すためのプロンプトです。

````
■ 戻し先
・Claude Code のスレッド：「✅Zoom書き起こし → ドライブ自動保存」 https://claude.ai/code/session_01HWKWMC1xf7xFB1k72NxABC
・報告先：GitHub miumiumiu4/arigatou の Issue #32（Zoom処理の報告（自動））に HAPPY 宛てで書く
・作業フォルダ：Mac mini の ~/claude/zoom-macmini/（新しく作る）
・関係する Google ドライブのフォルダ：「Zoom書き起こし」（書き起こしを入れる先）、「Zoom書き起こし_清書」（触らない。清書はクラウドの Claude が毎晩作る）

■ 目的（なぜ）
Mac mini で Zoom をローカル録画すると、本体の容量がすぐ埋まる。
録画は外付け SSD に移し、YouTube に上げ、文字起こしをドライブに置く。そうすれば本体は空いたまま、録画も中身も失わずに済む。
文字起こしの清書（文脈を整える作業）は、クラウドの Claude が毎晩「Zoom書き起こし」を見て行う。Mac mini は生の文字起こしを置くところまでを受け持つ。

■ 守ること
・秘密の値（YouTube・Google のログイン情報、トークン）は画面やログに出さない。ファイルの中身を表示しない
・YouTube は unlisted（限定公開）。public にしない。登録者に通知しない（notifySubscribers=False）
・本体の録画を消すのは、次の3つが全部そろった回だけ：
  ① SSD へのコピーが、サイズと sha256 で元と一致した
  ② YouTube に上がり、動画 ID が返ってきた
  ③ 文字起こしをドライブの「Zoom書き起こし」に置けた
  消すときは「ゴミ箱に移す」にする（rm で直接消さない）
・SSD がつながっていない夜は、何も消さずに止める。ログに「SSD なし」と書いて、翌朝 HAPPY に報告する
・最終更新から30分たっていない録画は、書き込み中かもしれないので次回に回す
・YouTube にある既存の動画は消さない・変えない

■ 手順（どうやって）
1. 外付け SSD を確かめる：/Volumes/ にある SSD の名前、空き容量、ファイルシステム（APFS か exFAT か）を控える。
   SSD に「Zoom録画」フォルダを作る。
2. Zoom の録画の保存先を確かめる（Zoom の設定 →「レコーディング」の場所。ふつうは ~/Documents/Zoom/）。
   今ある録画フォルダの数と合計サイズを数える。保存先の設定は変えない（SSD が外れたときに録画が失敗しないように）。
3. 文字起こしの道具を用意する：Apple シリコンなら mlx-whisper（モデルは large-v3、言語 ja）。無ければ whisper.cpp。
   出力は1行ずつ「[H:MM:SS] 文」の形にする（クラウドの清書がこの形を読む）。
4. ドライブへの置き方を決める：Mac mini に「Google ドライブ for desktop」が入っていれば、その中の「Zoom書き起こし」フォルダに .txt を書くだけでよい。
   入っていなければ、HAPPY に「入れてよいか」を聞く（Google アカウントのログインはオーナーが行う）。
5. YouTube へのアップロードは、ほかの Mac で使っている YouTube アップロードの仕組み（upload の権限つき）と同じチャンネルを使う。
   Mac mini にログイン情報が無ければ、許可画面はオーナーに出してもらう（HAPPY 経由で頼む）。
6. ~/claude/zoom-macmini/run.py を作る。1回の実行でやること：
   a. Zoom の録画フォルダ（例「2026-11-03 14.00.12 会議名」）から日付・時刻・会議名を取る
   b. SSD の「Zoom録画/」に同じフォルダ名でコピーし、サイズと sha256 を照らす
   c. SSD 側の音声（無ければ mp4）を文字起こしし、
      ドライブの「Zoom書き起こし」に「2026-11-03_1400_会議名_MacMini.txt」の名前で置く
   d. SSD 側の mp4 を YouTube に上げる：タイトル「2026-11-03 14:00 会議名（Zoom録画）」、説明欄「Zoom の録画。作成元: 自動アップロード（Mac mini）」、
      unlisted、selfDeclaredMadeForKids=False、notifySubscribers=False、resumable。再生リスト「Zoom録画」に入れる
   e. ~/claude/zoom-macmini/done.tsv に「元のパス、SSD のパス、sha256、動画 ID、ドライブのファイル名、日時」を1行足す。ここにあるものは二度と処理しない
   f. 上の「本体の録画を消す」の3条件がそろった録画だけ、本体側をゴミ箱に移す
   g. 1回に処理するのは古い順に最大5本まで（YouTube の1日の上限のため）。残りは翌晩
7. 短い録画1本で試す：SSD にコピーされたか、YouTube で限定公開か、ドライブに .txt が来たか、本体側がゴミ箱に移ったかを確かめる
8. launchd に登録する：~/Library/LaunchAgents/com.miura.zoom-macmini.plist、毎晩 22:40（クラウドの清書は 23:48 に始まるので、その前に置き終える）。
   ログは ~/claude/zoom-macmini/log.txt。スリープしない設定が無ければ、HAPPY に聞いてから足す
9. 同じ種類の作業が2回続けて失敗したら止める（3回目は試さない）。HAPPY に報告する

■ 報告（最後にこの形で、Issue #32 に HAPPY 宛てで書く。秘密の値・メールアドレス・個人名は書かない）
【Mac mini 録画 → SSD・YouTube・ドライブ 報告】
受けた指示：
やったこと：SSD の名前と空き＝　／ 録画の保存先＝　／ 今ある録画の本数・合計サイズ＝
　文字起こしの道具＝　／ ドライブへの置き方＝　／ YouTube の仕組み＝（流用／新しく許可）
　試しの1本＝（SSD ○×・YouTube 限定公開 ○×・ドライブ ○×・本体ゴミ箱 ○×）
　launchd＝（登録済み／エラー：文言）、毎晩の時刻＝
止まっていること：
HAPPY に決めてほしいこと：（無ければ「なし」）
````
