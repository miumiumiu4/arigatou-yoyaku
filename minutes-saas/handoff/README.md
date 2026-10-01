# Claude Code ⇔ Claude in Chrome 連絡フォルダ

2つのClaudeが、お互いへの指示・報告を渡し合うための決まりです。ユーザー(公嗣さん)が運び役です。

| 誰 | 役割 | できること |
|---|---|---|
| **Claude Code** | このリポジトリの担当(コード・設計・手順書) | コードの修正、GitHub操作、指示書(`code-to-chrome/`)の作成 |
| **Claude in Chrome** | ブラウザ操作の担当 | Supabase・Resend・Zoom・Vercel・Xserverなどの画面操作、画面の確認と報告 |
| **ユーザー** | 運び役・最終判断 | ログイン、支払い、パスワード入力、許可画面の操作、2つのClaudeの橋渡し |

## フォルダ
- `code-to-chrome/` : Claude Code → Claude in Chrome への指示書。番号つき(`001-…md`)。
- `chrome-to-code/` : Claude in Chrome → Claude Code への報告・依頼。`TEMPLATE.md` の形で書く。返信番号は指示書の番号に合わせる(指示`001` → 報告`R001`)。

## 運び方
1. Claude Code が `code-to-chrome/NNN-….md` を書いてpushする。
2. ユーザーが Claude in Chrome に「このURLの指示書を読んで実行して」と、URLだけ貼る。
3. Claude in Chrome は、指示書を読み、`chrome-to-code/TEMPLATE.md` の形で、**チャットに**報告を出す。
4. ユーザーがその報告を Claude Code に貼る。Claude Code は、次の指示書(`NNN+1`)を書く。

## 共通ルール(両方のClaudeが必ず守る)
1. **秘密の値は、ファイルにも、チャットにも書かない。** パスワード、APIキー、`service_role`キー、Secret Token、認証コード、ログイン後のURLに付く `code=` `token=` など。「設定済み」「取得済み」とだけ書く。
2. **パスワード・2段階認証・支払い・同意(許可)ボタンは、ユーザーが操作する。** 画面がそこに来たら止まって、ユーザーに依頼する。
3. **有料契約・削除・既存設定の上書きの前には、必ず止まってユーザーに確認する。**
4. **既存のDNSレコードやホームページ関連の設定は、変更・削除しない。** 追加のみ。
5. **Googleなどの許可画面(OAuth)が出たら、押さずに報告する。** `localhost` のURLには移動しない。
6. **確認できたことと、推測を分ける。** 画面で実際に見たことだけを「完了」と書く。
7. 分からないときは、推測で進めず、ユーザーに質問する。

## 指示書の形式
```
# 001 件名
From: Claude Code / To: Claude in Chrome / Re: (前の番号) / 日付

## 目的
## 前提情報
## 手順(この順番で。止まる場所を明記)
## 報告してほしいこと(表の形)
```

## 報告の形式
`chrome-to-code/TEMPLATE.md` を参照。
