# 003 Vercelの作業を始める(001の続き・Deployの手前まで)
依頼元: Claude Code(フォルダ: minutes-saas/handoff/code-to-chrome/003-vercel-go.md)
宛先: Claude in Chrome
返信先: Claude Code(フォルダ: minutes-saas/handoff/chrome-to-code/ / ファイル名: R003-vercel-go.md)
  ※ Chromeはチャットに報告を出す。ユーザーがClaude Codeに貼る。Claude Codeが上のフォルダ・ファイル名で保存する。
Re: R001 / 日付: 2026-10-02

## 最初にやること
1. `minutes-saas/handoff/README.md` の「共通ルール」(1〜8)を読み、以後すべて守る。特に **ルール8: 指示書に書かれたサービス以外の設定は変更しない**(claude.ai の環境設定・許可ドメインなどには触らない)。
2. 同じフォルダの `001-vercel.md` を読む。**003は、001の手順B〜Eを実行する指示**。001の手順A(clasp画面などの質問)は、R001で回答済みなので、**飛ばす**。

## 目的
001の手順B〜E(Vercelへのログイン、取り込み、環境変数10個の入力)を行い、**Deployの手前で止まる**。

## 補足(001に追加)
- 操作するのは、この指示書に出てくる次のサービスの画面だけ: vercel.com / github.com(ログインと連携の許可のみ) / supabase.com / console.anthropic.com / resend.com / marketplace.zoom.us
- Vercelのログイン、GitHub連携の許可、Proプランの契約、ADMIN_PASSWORDの入力は、ユーザーが行う。その画面で止まって、ユーザーに依頼する。
- 許可画面(OAuth)が出たら押さずに報告。localhost には移動しない。

## 報告してほしいこと(R003)
報告全体を、1つのコードブロックに入れてチャットに出す。先頭3行(返信元・宛先・Re)は、この指示書冒頭の「返信先」の欄を写す。最後の行に `R003-END` と書く。
1. 環境変数の表(名前だけ。値は書かない): | 環境変数の名前 | 設定済みか | Sensitiveか |(全10個)
2. Root Directory と Framework Preset の値
3. いまの画面と、止まっている場所(Deployは押していないこと)
4. 想定外のこと、Claude Code への依頼
