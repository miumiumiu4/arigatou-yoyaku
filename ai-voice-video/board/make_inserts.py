"""講座動画に差し込む「実際の方の声」を作る（2026-10-14、Fable の精査結果の最終案6場面＋三浦さんの撮りおろし）。

使い方:
  ~/claude/arigatou-yoyaku/ai-voice-video/.venv/bin/python make_inserts.py [M1 M2 ...]   （なしで全部）

出すもの（video/inserts/）:
  <ID>.wav  … 声（48kHz mono。前後0.15秒のフェード）。講座の声と同じ大きさにそろえるのは board.py がする
  <ID>.mp4  … 映像（1920×1080・30fps・音なし）。紺地の黒板の位置に本人のタイル（顔が使える場面）か名前カード（声のみ）、
              左に名前・肩書・打消し、下の字幕バーに本人の言葉
台本では、つなぎの一言の行のあとに「# insert: <ID>」と書くと、board.py がその長さだけ間をあけて重ねる。

守ること：元動画の三浦さんの声（質問）・名札・三浦さんのタイル・ほかの出席者は入れない。字幕は Whisper の聞き違いを直したもの。
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path.home() / "claude/ever-offer/video"   # 動画の置き場（このファイルの控えは GitHub の board にもある）
SRC = HERE / "source"
OUT = HERE / "inserts"
BOARD = Path.home() / "claude/arigatou-yoyaku/ai-voice-video/board"
FFMPEG = "ffmpeg"
SR = 48000
FADE = 0.15
DISCLAIMER = "※ご本人の体験です。同じ結果をお約束するものではありません"

# parts：元動画の秒（[始め, 終わり]）。subs：元動画の秒と、その時から出す字幕。crop：元動画のタイルの x, y, w, h（None は声のみ）
CLIPS = {
    "M1": dict(src="mkqBiCNi0JY", name="悟さん", role=["三浦の会社のスタッフから独立", "加盟店オーナー"],
               crop=(272, 180, 368, 340), parts=[[783.75, 807.75]], subs=[
                   (783.75, "人から受けた言葉とか、人が「こうやってやったら、こういう技術が身につくよ」っていうのを、"),
                   (791.4, "とにかくやってみた。とにかくゼロから、自分は無の状態にしてから、"),
                   (798.0, "全てやってみた。で、やってダメなものは捨てる。"),
                   (802.8, "できたものに関しては、そのまま継続する、っていうのを繰り返して。")]),
    "M2": dict(src="qhJFpLX-nak", name="向井さん", role=["元 引っ越し会社勤務15年", "加盟店オーナー", "本部トレーナー"],
               crop=(0, 180, 640, 340), parts=[[42.6, 59.55], [65.3, 74.6]], subs=[
                   (42.6, "辞めるときは、子供も3人いましたので、"),
                   (47.6, "ちょっと怖い気持ちもあったんですけども、"),
                   (52.2, "ちょっと挑戦したいという気持ちで、"),
                   (55.9, "ちょっとワクワクしてる気持ちもありました。"),
                   (65.3, "その時はもう、上司も後輩も部下も、"),
                   (70.2, "家族も、みんな反対っていう感じですね。")]),
    "M3": dict(src="7sL9Sz40pUo", name="田岡さん", role=["元 便利屋", "加盟店オーナー", "本部トレーナー"],
               crop=None, parts=[[470.3, 515.5]], subs=[
                   (470.3, "そうですね。僕もともと、ノウハウコレクターって言って、"),
                   (474.6, "知ってる人は知ってると思うんですけど、"),
                   (477.2, "いろんなとこ学びに行ったりとか、勉強したりとかするんですけど、"),
                   (481.8, "全く結果が出せない、みたいなのを、ずっと繰り返してたんですよね。"),
                   (486.7, "もうさすがに50手前で、もう絶対結果出さないと、"),
                   (496.5, "もうやばい、みたいなのがあって。"),
                   (498.5, "今までのとこを振り返ると、いろんな情報をちょっと取りすぎてて、"),
                   (504.7, "混線してたっていうとこに気づいたので、"),
                   (508.6, "もう一旦、一切情報は入らないようにしようっていう。"),
                   (512.4, "そのエアコンクリーニング以外の情報。")]),
    "B2": dict(src="mkqBiCNi0JY", name="風花さん", role=["悟さんの妻", "一緒に現場へ"],
               crop=(0, 180, 640, 340), parts=[[329.0, 363.1]], subs=[
                   (329.0, "現場に入ってました。一緒に作業させていただいて。"),
                   (333.1, "同じように、やっぱり最後には「ありがとう」って。"),
                   (336.0, "最初はね、やっぱり警戒心のあるお客様とか、いろんな方がいらっしゃるんで、"),
                   (340.7, "ちょっと不安な部分あったんですけど、"),
                   (342.9, "「ありがとう」って、とにかくニコニコして、"),
                   (345.5, "「いやー本当によかった、これで夏過ごせる」とか、"),
                   (348.3, "言っていただく、そういう言葉っていうのは、今までなかったので、"),
                   (352.4, "すごい心に染みて、"),
                   (357.0, "また綺麗にしてあげたいなって、思うぐらいの経験はさせていただきました。")]),
    "M4": dict(src="FcEE56Oe7mA", name="橋口さん", role=["加盟店オーナー"],
               crop=(0, 0, 640, 340), parts=[[29.95, 93.3]], subs=[
                   (29.95, "座骨神経痛を急遽発症しまして、1ヶ月半ぐらい動けなかったもので。"),
                   (40.9, "その時ちょうど、エアコンの繁忙期に入りかけていたので、"),
                   (46.2, "1ヶ月半ぐらい棒に振っちゃったというのが、正直ありました。"),
                   (52.2, "その時に、売上がもちろん落ちるんですけども、どう取り戻そうかとなった時に、"),
                   (58.9, "普通だったら、がむしゃらに現場に出るしかないんですけど、"),
                   (64.5, "僕の場合は、幸い、技術研修というものをできる体制があったので、"),
                   (70.5, "それをやって、取り戻そうというので、研修事業をやっていました。"),
                   (83.5, "要は、教育ビジネスをやっぱり持っていると、いざ体調を壊した時にでも、"),
                   (89.4, "収益が立つというのがあるので。")]),
    "M9": dict(src="TPEKBiRko_8", name="松本さん", role=["クリーニングベース代表", "本部トレーナー"],
               crop=None, parts=[[991.1, 1044.15]], subs=[
                   (991.1, "任せるってことは、100%信頼することだよ、っていうことを教えてもらって。"),
                   (1000.1, "当時は最初は、やっぱり口出ししたりとか、"),
                   (1006.2, "ちょっと気になる点があったら、やっぱり言ってしまうんですよね。"),
                   (1011.9, "離れよう離れようとは、任せようとは思ってるけど、"),
                   (1016.5, "やっぱりこう、ずっと現場でやってた自分のこだわりとかが出てしまって、"),
                   (1021.9, "口出しをしちゃってたんですけど。"),
                   (1025.7, "でもそこから、その言葉を信じて、"),
                   (1029.1, "「あ、そうか、100%信頼できてなかったんだなぁ」と思って、"),
                   (1034.2, "100%信頼すると決めて、まずは任してみて、"),
                   (1038.2, "任してみて何か起きたら、そこはもう自分が責任を取ればいいやと思って。")]),
    # 三浦さんの撮りおろし（2026-10-15 Zoom で収録。左下の名札は切る）。講師本人なので「ご本人の体験です」の打消しは出さない
    "R1": dict(file="R1_miura_zoom.mp4", name="三浦さとし", role=["この講座の講師", "ありがとうグループ代表"],
               label="講師より", disc="",
               crop=(0, 0, 1280, 690), parts=[[3.7, 43.4]], subs=[
                   (3.7, "少しだけ、私自身の話をさせてください。"),
                   (7.6, "私は2017年に、心筋梗塞を経験しました。"),
                   (14.4, "病院のベッドの上で、真っ先に浮かんだのは、家族の顔でした。"),
                   (20.1, "この先、自分が動けなくなったら、家族はどうなるんだろう。"),
                   (25.4, "そう思った時、一人で全部を背負うやり方には、限りがあると気づきました。"),
                   (32.3, "そこから、一人で頑張るのをやめて、人に頼ることを覚えました。"),
                   (38.0, "だから、あなたに伝えたいんです。"),
                   (41.0, "一人で、抱えなくていい。")]),
}

# 黒板（board.py の画面と同じ位置）：#bw は translate(173,24) scale(.82)
BOARD_BOX = (242, 76, 1437, 617)
VIDEO_BOX = (692, 116, 960, 537)      # タイル・名前カードを置く枠（黒板の右側）

HTML = """<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="node_modules/@fontsource/klee-one/600.css">
<link rel="stylesheet" href="node_modules/@fontsource/zen-maru-gothic/700.css">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1920px;height:1080px;overflow:hidden;background:transparent}
.bg{position:absolute;inset:0;background:#0E1B2C}
#frame{position:absolute;left:222px;top:57px;width:1476px;height:656px;border-radius:15px;background:#6B4A2F;box-shadow:0 16px 40px rgba(0,0,0,.45),inset 0 0 0 3px #4E341F}
#board{position:absolute;left:242px;top:76px;width:1437px;height:617px;border-radius:7px;background:#17304D}
#tray{position:absolute;left:247px;top:701px;width:1427px;height:18px;background:#7A5536;border-radius:4px}
.chalk{position:absolute;font-family:"Klee One",serif;font-weight:600;color:#F3F0E6;text-shadow:0 0 1px rgba(255,255,255,.9),0 0 6px rgba(255,255,255,.18);line-height:1.3}
.or{color:#F4A765}
#vbox{position:absolute;border-radius:10px;border:4px solid rgba(243,240,230,.55);background:#0F2238}
#caption{position:absolute;left:60px;top:872px;width:1800px;height:168px;display:flex;align-items:center;gap:28px;padding:0 40px;background:rgba(8,16,28,.82);border-radius:18px;border:2px solid rgba(255,255,255,.08)}
#who{flex:none;min-width:190px;height:64px;padding:0 26px;border-radius:32px;display:flex;align-items:center;justify-content:center;font-family:"Zen Maru Gothic",sans-serif;font-weight:700;font-size:30px;color:#fff;background:#2E6B5E;border:2px solid #7CC3AE}
#line{font-family:"Zen Maru Gothic",sans-serif;font-weight:700;font-size:42px;color:#fff;line-height:1.35;letter-spacing:.02em}
.vo{position:absolute;font-family:"Klee One",serif;font-weight:600;color:#F3F0E6;text-align:center;width:100%}
</style></head><body><div id="root"></div>
<script>
const P = __P__;
function set(mode, text){
  const r = document.getElementById('root');
  if (mode === 'bg') {
    const vb = P.vbox;
    let vo = '';
    if (!P.face) vo = `<div class="vo" style="top:${vb[1]+150}px;left:${vb[0]}px;width:${vb[2]}px;font-size:96px">${P.name}</div>
      <div class="vo or" style="top:${vb[1]+290}px;left:${vb[0]}px;width:${vb[2]}px;font-size:38px;color:#F4A765">音声のみ</div>`;
    r.innerHTML = `<div class="bg"></div><div id="frame"></div><div id="board"></div><div id="tray"></div>
      <div class="chalk or" style="left:282px;top:116px;font-size:36px">${P.label}</div>
      <div class="chalk" style="left:282px;top:186px;font-size:70px">${P.name}</div>
      <div style="position:absolute;left:286px;top:296px;width:380px;display:flex;flex-direction:column;gap:14px">
      ${P.role.map((x,i)=>`<div class="chalk ${x.includes('オーナー')||x.includes('トレーナー')||x.includes('代表')?'or':''}" style="position:static;font-size:${x.length>12?28:32}px;white-space:nowrap">${x}</div>`).join('')}</div>
      <div class="chalk" style="left:286px;top:560px;width:370px;font-size:22px;white-space:normal;opacity:.8">${P.disc}</div>
      <div id="vbox" style="left:${vb[0]-4}px;top:${vb[1]-4}px;width:${vb[2]+8}px;height:${vb[3]+8}px"></div>${vo}
      <div id="caption"><div id="who">${P.name}</div><div id="line"></div></div>`;
  } else {
    r.innerHTML = `<div id="caption" style="background:transparent;border-color:transparent"><div id="who" style="visibility:hidden">${P.name}</div><div id="line">${text}</div></div>`;
    const l = document.getElementById('line');
    if (l.scrollWidth > 1480 || l.offsetHeight > 120) l.style.fontSize = '36px';
  }
}
</script></body></html>"""


def run(*a):
    subprocess.run([str(x) for x in a], check=True)


def video_box(c):
    """タイルを置く枠（タイルの縦横比に合わせて、VIDEO_BOX の中で一番大きく）"""
    vx, vy, vw, vh = VIDEO_BOX
    if not c["crop"]:
        return [vx, vy, vw, vh]
    cw, ch = c["crop"][2], c["crop"][3]
    s = min(vw / cw, vh / ch)
    w, h = int(cw * s) // 2 * 2, int(ch * s) // 2 * 2
    return [vx + (vw - w) // 2, vy + (vh - h) // 2, w, h]


def make_pngs(cid, c, work):
    from playwright.sync_api import sync_playwright
    face = c["crop"] is not None
    p = {"name": c["name"], "role": c["role"], "disc": c.get("disc", DISCLAIMER), "label": c.get("label", "実際の方の声"),
         "face": face, "vbox": video_box(c)}
    html = BOARD / f"_insert_{cid}.html"
    html.write_text(HTML.replace("__P__", json.dumps(p, ensure_ascii=False)))
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 1920, "height": 1080})
        pg.goto(html.as_uri())
        pg.evaluate("document.fonts.ready")
        pg.evaluate("set('bg')")
        pg.wait_for_timeout(300)
        pg.screenshot(path=str(work / "bg.png"))
        for i, (_, text) in enumerate(c["subs"]):
            pg.evaluate("([m,t]) => set(m,t)", ["sub", text])
            pg.wait_for_timeout(60)
            pg.screenshot(path=str(work / f"sub{i}.png"), omit_background=True)
        b.close()
    html.unlink()


def make(cid):
    c = CLIPS[cid]
    work = OUT / f"_{cid}"
    work.mkdir(parents=True, exist_ok=True)
    src = SRC / c["file"] if c.get("file") else SRC / f"yt_{c['src']}.mp4"
    # 1. 部分ごとに切り出す（声は 48kHz mono、前後にフェード。映像は 30fps）
    segs, t_out, mapping = [], 0.0, []
    for k, (a, b) in enumerate(c["parts"]):
        d = b - a
        vf = f"fps=30,crop={c['crop'][2]}:{c['crop'][3]}:{c['crop'][0]}:{c['crop'][1]}," if c["crop"] else "fps=30,crop=16:16:0:0,"
        run(FFMPEG, "-v", "error", "-y", "-ss", a, "-i", src, "-t", d,
            "-vf", vf + f"fade=in:st=0:d={FADE}:color=black,fade=out:st={d - FADE}:d={FADE}:color=black",
            "-af", f"aresample={SR},afade=in:st=0:d={FADE},afade=out:st={d - FADE}:d={FADE}", "-ac", "1",
            "-c:v", "libx264", "-crf", "16", "-c:a", "pcm_s16le", work / f"part{k}.mkv")
        segs.append(work / f"part{k}.mkv")
        mapping.append((a, b, t_out))
        t_out += d
    lst = work / "list.txt"
    lst.write_text("".join(f"file '{s}'\n" for s in segs))
    run(FFMPEG, "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", work / "joined.mkv")
    run(FFMPEG, "-v", "error", "-y", "-i", work / "joined.mkv", "-vn", "-ac", "1", "-ar", SR, "-c:a", "pcm_s16le", OUT / f"{cid}.wav")
    dur = t_out

    # 2. 字幕の出る時刻を、切り出したあとの時刻に直す
    def to_out(ts):
        for a, b, o in mapping:
            if a - 0.01 <= ts <= b:
                return o + ts - a
        raise ValueError(f"{cid}: 字幕の時刻 {ts} が切り出しの外です")
    starts = [max(0.0, to_out(ts)) for ts, _ in c["subs"]]
    ends = starts[1:] + [dur]

    # 3. 背景・字幕の画像（講座と同じフォント）
    make_pngs(cid, c, work)

    # 4. 重ねる
    vx, vy, vw, vh = video_box(c)
    inputs = ["-loop", "1", "-framerate", "30", "-i", work / "bg.png", "-i", work / "joined.mkv"]
    fl = []
    if c["crop"]:
        fl.append(f"[1:v]scale={vw}:{vh}:flags=lanczos[t]")
        fl.append(f"[0:v][t]overlay={vx}:{vy}[b0]")
    else:   # 声のみ：名前カードの下に、声の波形（見やすい大きさにそろえてから描く）
        fl.append(f"[1:a]dynaudnorm=f=150:g=15,showwaves=s=760x150:mode=cline:scale=sqrt:rate=30:colors=white,format=rgba[w]")
        fl.append(f"[0:v][w]overlay={vx + (vw - 760) // 2}:{vy + 330}[b0]")
    last = "b0"
    for i, (a, b) in enumerate(zip(starts, ends)):
        inputs += ["-loop", "1", "-framerate", "30", "-i", work / f"sub{i}.png"]
        fl.append(f"[{last}][{i + 2}:v]overlay=0:0:enable='between(t,{a:.3f},{b - 0.001:.3f})'[s{i}]")
        last = f"s{i}"
    fl.append(f"[{last}]fade=in:st=0:d=0.3,fade=out:st={dur - 0.3:.3f}:d=0.3,format=yuv420p[v]")
    run(FFMPEG, "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fl), "-map", "[v]", "-t", f"{dur:.3f}",
        "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-an", OUT / f"{cid}.mp4")
    print(f"{cid} {c['name']}：{dur:.1f}秒 → {OUT / (cid + '.mp4')}")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for cid in (sys.argv[1:] or list(CLIPS)):
        make(cid)
