# このリポジトリで作業する Claude へ

## 三浦さんとのやりとりの決まり

- **プロンプトや指示文を渡すときは、どこに貼るものかを必ず先頭に書く**。三浦さんはいくつものタブで同時に作業しているため
  - ウェブ版の Claude（claude.ai のチャット）に貼るもの → 「ウェブ：チャット名」
  - Claude Code に貼るもの → 「コード：セッションのタイトル」と、クラウドか Mac のローカルか
  - Chrome の Claude（Claude in Chrome）に貼るもの → 「Chrome の Claude」
  - 自分のセッションのタイトルは `get_session`（claude-code-remote）で確かめる。推測で書かない
- Mac のファイル（/Users/… や ~/claude/…）を扱うプロンプトは、クラウドのセッションでは実行できない。Mac のローカルの Claude Code に貼るよう伝える
- Google カレンダーに Claude Code の作業予定を入れるときは、タイトルの先頭に「【コード】」を付け、説明欄の最初に「Claude Code で進める作業です。ウェブ版の予定ではありません」と書く

## 主な作業

- AI音声動画（講座・ナーチャリング音声）：`ai-voice-video/HANDOFF.md` を最初に読む。手順とプロンプト集は `.claude/skills/anime-lecture-video/SKILL.md`
