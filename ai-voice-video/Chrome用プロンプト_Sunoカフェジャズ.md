# Claude in Chrome に貼るプロンプト（Suno で講座BGMのカフェジャズ版を作る）

貼る場所：**Chrome の Claude**。下の枠の中をそのまま貼る。

```
Suno（https://suno.com）で、講座動画のBGMを作る作業を手伝ってください。
アカウントは三浦（miumiumiu4@gmail.com）のものです。
講座の話の下にずっと小さく流す曲です。雰囲気は「スタバにいるような、落ち着いたジャズ」です。

■ 守ること
・お金がかかる操作（プランの変更、クレジットの購入）はしないでください。クレジットが足りなければ、その画面で止まって私に報告してください
・曲の公開（Publish・共有）はしないでください
・歌詞の欄には何も書かないでください（歌なしの曲です）

■ 1. 曲を作る
1. Suno を開き、「Create」を開く。「Custom」（カスタム）の形にする
2. 「Instrumental」（インスト＝歌なし）をオンにする
3. Styles の欄に、次の文をそのまま入れる
smooth cafe jazz instrumental, coffee shop background, soft jazz piano trio, upright bass, brushed drums, mellow and cozy, 85 bpm, relaxed swing, warm and intimate, background music for spoken narration, consistent groove, no big solos
4. Exclude Styles（除外するスタイル）の欄があれば、次の文をそのまま入れる
vocals, scat, saxophone lead, loud drums, fast tempo, big band, fusion, EDM, sudden changes, build-ups
5. 詳しい設定があれば、Weirdness は20〜30%、Style Influence は70%前後にする
6. タイトルは「講座BGM_カフェジャズ」にする
7. 「Create」を押す（2曲できる）

■ 2. 三浦が聞いて選ぶ
1. できた2曲の再生ボタンの場所を伝えて止まる → 三浦が聞いて決める
2. どちらもいまいちなら、三浦の感想に合わせて Styles を少し変えて、もう一度作る（作り直しは3回まで）
   例：「もっと静か」→ 85 bpm を 75 bpm に、「ピアノだけがいい」→ solo jazz piano に

■ 3. 選んだ1曲をダウンロードする
1. 選んだ曲の「…」メニューから Download を開く。WAV があれば WAV、なければ MP3
2. ダウンロードの回数に上限がある場合は、押す前に残りの回数を私に伝えて止まる
3. 保存したファイル名と、曲のページのURL、長さを控える

■ 4. 最後に、Mac のローカルの Claude Code に貼る報告文を作ってください
・保存したファイル名（ダウンロードフォルダの中の名前）
・曲のURLと長さ
・報告文の最後に、この文を入れる：
「このファイルを ai-voice-video/music/06_lesson-bgm-cafejazz.（拡張子はそのまま）という名前でリポジトリ arigatou-yoyaku のブランチ claude/vigilant-gauss-alhcf6 に追加して push して。WAV なら同じ名前の mp3（192k）も作って一緒に入れて。music/suno-styles.md の表にも1行足して」
```

## そのあと
- 報告文は **Mac のローカルの Claude Code** に貼る（ダウンロードしたファイルは Mac にあるので、クラウドのセッションでは受け取れない）
- push されたら、クラウドの「三浦のAI音声生成」（または Gemini 登録後の新しいセッション）で「06 のカフェジャズを講座BGMにして」と頼む
