"""音声1〜3の台本（audio-1-3-script.md）→ 読み上げ＋BGM入りの MP3 を作る。

使い方:
  python3 make_audio.py            # Gemini の声で本番（GEMINI_API_KEY が必要）
  python3 make_audio.py --say      # Mac の読み上げ声で試作（キー不要。間とBGMの確認用）
  python3 make_audio.py --only 2   # 音声2だけ作る

Gemini の設定（環境変数で変えられる）:
  GEMINI_TTS_MODEL  使うモデル名（AI Studio の「Get code」に出ている名前）
  GEMINI_VOICE      声の名前（AI Studio で選んだもの）
  GEMINI_STYLE      話し方の指示（台本の前に付けて送る）
"""
import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "scripts" / "音声1-3_台本.md"
BGM = HERE.parent / "music" / "01_lesson-bgm.mp3"
WORK = HERE / "work"

MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")
VOICE = os.environ.get("GEMINI_VOICE", "Charon")
STYLE = os.environ.get("GEMINI_STYLE", "落ち着いた、温かい声で、語りかけるようにゆっくり話してください：")

RATE = 24000          # Gemini の出力（16bit・モノラル・24kHz）に合わせる
PAUSE_MA = 1.5        # 「（間）」の長さ（秒）
PAUSE_PARA = 0.6      # 段落のあいだ（秒）
BGM_DB = -24          # 声に対するBGMの大きさ（dB）
INTRO, OUTRO = 3.0, 4.0   # 声の前後にBGMだけ流す秒数

# 読み上げだけ直す（台本の文字はそのまま）
READING_FIX = [
    (r"(?<=[いるたのつ])方(?![法向針])", "かた"),   # たくさんの方、独立したい方 → かた
    (r"Zoom", "ズーム"),
]


def parse_script():
    """台本を音声ごとに分け、さらに「（間）」でブロックに分ける。"""
    text = SCRIPT.read_text(encoding="utf-8")
    parts = re.split(r"^## 音声(\d)「(.+?)」.*$", text, flags=re.M)
    voices = {}
    for i in range(1, len(parts), 3):
        num, title, body = parts[i], parts[i + 1], parts[i + 2]
        blocks, skipped = [], []
        for chunk in re.split(r"^（間）$", body, flags=re.M):
            paras = []
            for para in re.split(r"\n\s*\n", chunk):
                lines = [l.strip() for l in para.strip().splitlines()]
                lines = [l for l in lines if l and l != "---"]
                keep = []
                for l in lines:
                    if l.startswith("["):      # [三浦が記入] などは読まない
                        skipped.append(l)
                    else:
                        keep.append(l)
                if keep:
                    paras.append("".join(keep))
            if paras:
                blocks.append(paras)
        voices[num] = {"title": title, "blocks": blocks, "skipped": skipped}
    return voices


def fix_reading(s):
    for pat, rep in READING_FIX:
        s = re.sub(pat, rep, s)
    return s


def tts_gemini(text, out_wav):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("GEMINI_API_KEY が設定されていません。試作なら --say を付けてください。")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
    body = {
        "contents": [{"parts": [{"text": STYLE + "\n" + text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICE}}},
        },
    }
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": key})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.load(r)
            pcm = base64.b64decode(data["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
            with wave.open(str(out_wav), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(RATE)
                w.writeframes(pcm)
            return
        except Exception as e:  # 混雑や一時的な失敗は少し待って再試行
            print(f"  再試行 {attempt + 1}: {e}")
            time.sleep(5 * (attempt + 1))
    sys.exit("Gemini の読み上げに失敗しました。")


def tts_say(text, out_wav):
    aiff = out_wav.with_suffix(".aiff")
    subprocess.run(["say", "-v", "Kyoko", "-r", "190", "-o", str(aiff), text], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(aiff),
                    "-ar", str(RATE), "-ac", "1", str(out_wav)], check=True)
    aiff.unlink()


def silence(sec, out_wav):
    with wave.open(str(out_wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"\x00\x00" * int(RATE * sec))


def build(num, v, engine):
    tts = tts_say if engine == "say" else tts_gemini
    d = WORK / f"voice{num}_{engine}"
    d.mkdir(parents=True, exist_ok=True)
    silence(PAUSE_MA, d / "ma.wav")
    silence(PAUSE_PARA, d / "para.wav")
    pieces = []
    for bi, paras in enumerate(v["blocks"]):
        if bi:
            pieces.append(d / "ma.wav")
        if engine == "say":   # Mac の声は段落ごとに作って間を入れる
            for pi, p in enumerate(paras):
                if pi:
                    pieces.append(d / "para.wav")
                f = d / f"b{bi:02d}_p{pi:02d}.wav"
                tts(fix_reading(p), f)
                pieces.append(f)
        else:                 # Gemini は（間）までをまとめて送り、自然な抑揚にする
            f = d / f"b{bi:02d}.wav"
            if not f.exists():   # 作り直すときは work/ のファイルを消す
                print(f"  音声{num} ブロック{bi + 1}/{len(v['blocks'])}")
                tts("\n".join(fix_reading(p) for p in paras), f)
            pieces.append(f)
    listfile = d / "list.txt"
    listfile.write_text("".join(f"file '{p}'\n" for p in pieces))
    voice_wav = d / "voice.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                    "-i", str(listfile), "-af", "loudnorm=I=-16:TP=-1.5", "-ar", "48000",
                    str(voice_wav)], check=True)
    dur = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
         str(voice_wav)], capture_output=True, text=True).stdout)
    total = INTRO + dur + OUTRO
    suffix = "" if engine == "gemini" else "_試作"
    out = HERE / f"音声{num}_{v['title']}{suffix}.mp3"
    delay = int(INTRO * 1000)
    filt = (
        f"[1:a]aloop=loop=-1:size=2e9,atrim=0:{total},loudnorm=I=-16,volume={BGM_DB}dB,"
        f"afade=t=in:d=2,afade=t=out:st={total - 3}:d=3[bgm];"
        f"[0:a]adelay={delay}|{delay},apad=whole_dur={total}[v];"
        f"[v][bgm]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95"
    )
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(voice_wav), "-i", str(BGM),
                    "-filter_complex", filt, "-ac", "2", "-b:a", "128k", str(out)], check=True)
    print(f"→ {out.name}（{int(total // 60)}分{int(total % 60)}秒）")
    for s in v["skipped"]:
        print(f"  [読まなかった行] {s}")


def main():
    engine = "say" if "--say" in sys.argv else "gemini"
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    if engine == "gemini":
        print(f"モデル: {MODEL} / 声: {VOICE}")
    for num, v in parse_script().items():
        if only and num != only:
            continue
        build(num, v, engine)


if __name__ == "__main__":
    main()
