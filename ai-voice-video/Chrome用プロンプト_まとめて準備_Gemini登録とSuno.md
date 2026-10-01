# Claude in Chrome に貼るプロンプト（Gemini の登録と Suno の曲づくりを1回でまとめて）

貼る場所：**Chrome の Claude**。下の枠の中をそのまま貼る。
これが終われば、Mac のローカルの Claude Code を経由しなくても、クラウドの Claude Code が曲を自分で取りに行けるようになる。

```
講座動画を全自動で作るための準備を、3つまとめて手伝ってください。
アカウントは三浦（miumiumiu4@gmail.com）です。

■ 守ること（全部の作業で共通）
・APIキーの「作成」「コピー」「貼り付け」は三浦本人がやります。その画面を開いたら止まって、ボタンや入力欄の場所を私に伝えてください
・キーの文字列を読み上げたり、メモやチャットや報告文に書いたりしないでください
・お金がかかる操作（購入、プランの変更、請求先の変更、クレジットの購入）はしないでください。足りないときは止まって報告してください
・AI Studio に講座の台本を貼らないでください。声を試すときは、下の「試しの文」だけを使ってください
・Suno の曲は公開（Publish・共有）しないでください

━━━━━━━━━━━━━━━━━━━━
■ A. Gemini の声とキーを確認する（Google AI Studio）
1. https://aistudio.google.com を開き、「Get API key」のページを開く
2. 20ドルを購入した（請求先を設定した）プロジェクトを探し、「有料（Paid tier）」か「無料枠（Free tier）」かを報告する
3. そのプロジェクトにキーがなければ「Create API key」の場所を伝えて止まる → 三浦が作成する
4. 「Generate speech」のページを開き、声を選ぶ。すでに選んであればその名前を控える。まだなら候補を3つずつ挙げて、私が聞いて決めるまで止まる
   ・語り手（三浦役）：落ち着いた、聞き疲れしない30〜50代くらいの男性の声
   ・聞き手（受講生役）：明るく素直な声（語り手と聞き分けやすい声）
   試しの文　語り手：「こんにちは。ありがとうグループの三浦です。」　聞き手：「7回で、ロードマップまでできるんですか？」
5. 「Get code」を開き、モデル名（gemini-…-tts のような文字列）をそのまま控える

━━━━━━━━━━━━━━━━━━━━
■ B. Suno で講座BGM（カフェジャズ）を作る
1. https://suno.com を開き、「Create」→「Custom」の形にする。「Instrumental」をオンにする。歌詞の欄は空のまま
2. Styles に次の文をそのまま入れる
smooth cafe jazz instrumental, coffee shop background, soft jazz piano trio, upright bass, brushed drums, mellow and cozy, 85 bpm, relaxed swing, warm and intimate, background music for spoken narration, consistent groove, no big solos
3. Exclude Styles の欄があれば、次の文をそのまま入れる
vocals, scat, saxophone lead, loud drums, fast tempo, big band, fusion, EDM, sudden changes, build-ups
4. 詳しい設定があれば Weirdness 20〜30%、Style Influence 70%前後。タイトルは「講座BGM_カフェジャズ」
5. 「Create」を押す（2曲できる）。再生ボタンの場所を伝えて止まる → 三浦が聞いて選ぶ
6. どちらもいまいちなら、三浦の感想に合わせて Styles を少し変えて作り直す（3回まで）
   例：「もっと静か」→ 85 bpm を 75 bpm に、「ピアノだけがいい」→ solo jazz piano に
7. 選んだ曲のページのURL（https://suno.com/song/… の形）と長さを控える。ダウンロードはしなくてよい

━━━━━━━━━━━━━━━━━━━━
■ C. Claude Code の作業環境に登録する
1. https://claude.ai/code を開き、リポジトリ arigatou-yoyaku のセッション「三浦のAI音声生成」（クラウド）を開く
2. 画面上部のクラウド環境のメニュー →「Edit」（編集）を開く
3. 環境変数の欄に、次の4行を登録する。1行目のキーは三浦が自分で貼る（あなたは入力欄の場所を伝えて止まる）
   GEMINI_API_KEY=（三浦がコピーしたキー）
   GEMINI_TTS_MODEL=（A-5のモデル名）
   GEMINI_VOICE_N=（語り手の声の名前）
   GEMINI_VOICE_L=（聞き手の声の名前）
4. ネットワークの設定（Network access）で、許可するドメインに次の3つを足す（今の設定のほかの項目は変えない）
   suno.com
   cdn1.suno.ai
   cdn2.suno.ai
   ※「許可するドメインを足す」形の欄が見つからないときは、変えずに画面の様子を報告する
5. 保存する

━━━━━━━━━━━━━━━━━━━━
■ D. 最後に、新しい Claude Code のセッションに貼る報告文を作ってください（キーの文字列は入れない）
・キーのプロジェクトが有料（Paid tier）か無料枠か
・モデル名、語り手と聞き手の声の名前
・選んだ Suno の曲のURLと長さ
・環境変数4つと、ネットワークの3ドメインを登録して保存できたか
・報告文の最後に、この文を入れる：
「git pull して ai-voice-video/HANDOFF.md を読んで。Suno の曲を music/06_lesson-bgm-cafejazz.mp3 として取ってきて、Gemini の声とこの曲で 試作_鉛筆と水彩 を作り直して送って。声と曲を確認したら、Q1第1回から新しい見た目で作っていく」
```

## 終わったら（三浦さんがやること）
1. claude.ai/code で arigatou-yoyaku の**新しいセッション**を開く（クラウド）。登録した内容は新しいセッションからしか読み込まれない
2. Chrome の Claude が作った報告文を貼る
