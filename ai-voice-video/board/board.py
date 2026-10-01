"""二人の掛け合い台本 → 黒板アニメの MP4 を作る。

使い方:
  cd ai-voice-video/board && npm install   # 手書き風フォント（初回だけ）
  python3 board.py ../scripts/Q1第1回_掛け合い.txt 出力名 --scenes scenes/Q1第1回.js [--fps 30] [--preview 秒,秒,...]

声は今は仮の合成音声（Open JTalk）。語り手（N）と聞き手（L）で高さを変えている。
Gemini TTS に替えるときは tts_line() を差し替える（台本の演技の指示はそのまま使える）。
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from build import FFMPEG, READING_FIX, SR, make_bgm  # noqa: E402

LEAD_IN = 1.0      # 最初に話し始めるまで
SAME_GAP = 0.25    # 同じ人が続けて話すときの間
SWAP_GAP = 0.35    # 話し手が替わるときの間
SCENE_GAP = 0.9    # 場面が替わるときの間
TAIL = 1.8         # 最後の余韻
VOICES = {"N": dict(speed=1.05, half_tone=0.0), "L": dict(speed=1.12, half_tone=4.0)}


def parse(path):
    lines, scene = [], None
    for raw in open(path, encoding="utf-8"):
        raw = raw.strip()
        if raw.startswith("# scene:"):
            scene = raw.split(":", 1)[1].strip()
        elif raw.startswith("# wait:") and lines:
            lines[-1]["wait"] = lines[-1].get("wait", 0) + float(raw.split(":", 1)[1])
        elif raw and not raw.startswith("#"):
            spk, direction, text = [x.strip() for x in raw.split("|", 2)]
            lines.append({"spk": spk, "direction": direction, "text": text, "scene": scene})
    return lines


def tts_line(line):
    """1行分の声を作る。GEMINI_API_KEY があれば Gemini の声、なければ仮の声（Open JTalk）。"""
    text = line["text"]
    if os.environ.get("GEMINI_API_KEY"):
        return gemini_tts(text, line["direction"], line["spk"])
    import pyopenjtalk
    for wrong, right in READING_FIX.items():
        text = text.replace(wrong, right)
    x, sr = pyopenjtalk.tts(text, **VOICES[line["spk"]])
    assert sr == SR
    return x.astype(np.float32) / 32768.0


# Gemini の声の設定。必要なのは GEMINI_API_KEY だけ。ほかは省略できる
#   GEMINI_TTS_MODEL … モデル名。なければ、キーで使えるモデルの一覧から「tts」の付いたものを自動で選ぶ
#   GEMINI_VOICE_N / GEMINI_VOICE_L … 語り手（三浦役）／聞き手（受講生役）の声の名前。なければ下の初期値
GEMINI_CACHE = os.path.join(HERE, ".tts_cache")   # 同じセリフを二度お金をかけて作らない
GEMINI_VOICE_DEFAULT = {"N": "Charon", "L": "Leda"}   # 三浦＝男性、聞き手＝女性（10/1 三浦さん）
_gemini_model = None


def gemini_model():
    """使う TTS モデル名。環境変数がなければ ListModels から選ぶ（pro より flash を優先＝安い）。"""
    global _gemini_model
    if _gemini_model:
        return _gemini_model
    _gemini_model = os.environ.get("GEMINI_TTS_MODEL")
    if not _gemini_model:
        import urllib.request
        req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
                                     headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]})
        with urllib.request.urlopen(req, timeout=60) as r:
            names = [m["name"].split("/")[-1] for m in json.load(r).get("models", [])
                     if "tts" in m["name"] and "generateContent" in m.get("supportedGenerationMethods", [])]
        if not names:
            raise SystemExit("このキーで使える Gemini の TTS モデルが見つかりません")
        names.sort(key=lambda n: ("pro" in n, n))   # flash（安い方）を先に
        _gemini_model = names[0]
        print("Gemini のモデル:", _gemini_model, "（候補:", ", ".join(names), "）")
    return _gemini_model


def gemini_tts(text, direction, spk):
    import hashlib
    import urllib.request
    model = gemini_model()
    voice = os.environ.get("GEMINI_VOICE_" + spk) or GEMINI_VOICE_DEFAULT[spk]
    prompt = f"Read the following Japanese line in a {direction} tone, naturally, as a spoken lecture: {text}"
    key = hashlib.sha256(f"{model}|{voice}|{prompt}".encode()).hexdigest()[:24]
    os.makedirs(GEMINI_CACHE, exist_ok=True)
    cache = os.path.join(GEMINI_CACHE, key + ".pcm")
    if not os.path.exists(cache):
        body = {"contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"responseModalities": ["AUDIO"],
                                     "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            data=json.dumps(body).encode(), method="POST",
            headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
        with urllib.request.urlopen(req, timeout=120) as r:
            res = json.load(r)
        part = res["candidates"][0]["content"]["parts"][0]["inlineData"]
        with open(cache, "wb") as f:
            f.write(base64.b64decode(part["data"]))
    pcm = np.frombuffer(open(cache, "rb").read(), dtype=np.int16).astype(np.float32) / 32768.0
    # Gemini は 24kHz で返すので 48kHz にそろえる
    return np.interp(np.arange(0, len(pcm), 0.5), np.arange(len(pcm)), pcm).astype(np.float32)


def load_bgm(path, seconds, level):
    """BGM（Suno の曲など）を読み込み、長さに合わせて繰り返し、音量を下げる。最初と最後はフェード。"""
    raw = subprocess.run([FFMPEG, "-loglevel", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    x = x / max(1e-6, np.max(np.abs(x)))
    n = int(seconds * SR)
    x = np.tile(x, n // len(x) + 1)[:n] * level
    f = int(2.0 * SR)
    x[:f] *= np.linspace(0, 1, f)
    x[-f * 2:] *= np.linspace(1, 0, f * 2)
    return x


def build_audio(lines, wav_path, bgm_path=None, bgm_level=0.06, opening=None, intro=0.0, ending=None, outro=0.0):
    chunks, t = [np.zeros(int(LEAD_IN * SR), np.float32)], LEAD_IN
    for i, line in enumerate(lines):
        x = tts_line(line)
        x = 0.9 * x / max(1e-6, np.max(np.abs(x)))
        line["start"], line["end"] = round(t, 3), round(t + len(x) / SR, 3)
        chunks.append(x)
        t += len(x) / SR
        if i + 1 < len(lines):
            nxt = lines[i + 1]
            gap = SCENE_GAP if nxt["scene"] != line["scene"] else SAME_GAP if nxt["spk"] == line["spk"] else SWAP_GAP
            gap += line.get("wait", 0)
            chunks.append(np.zeros(int(gap * SR), np.float32))
            t += gap
    chunks.append(np.zeros(int(TAIL * SR), np.float32))
    voice = np.concatenate(chunks)
    if bgm_path:
        mix = voice + load_bgm(bgm_path, len(voice) / SR, bgm_level)
    else:
        mix = voice + make_bgm(len(voice) / SR + 1)[:len(voice)] * 0.06
    f = int(1.5 * SR)
    mix[-f:] *= np.linspace(1, 0, f)
    # オープニング曲（頭の intro 秒）とエンディング曲（outro 秒）をつける。セリフの時刻はその分うしろへずらす
    if opening and intro > 0:
        op = load_bgm(opening, intro, 0.45)
        k = int(1.2 * SR)
        op[-k:] *= np.linspace(1, 0, k)
        mix = np.concatenate([op, mix])
        for line in lines:
            line["start"] = round(line["start"] + intro, 3)
            line["end"] = round(line["end"] + intro, 3)
    if ending and outro > 0:
        ed = load_bgm(ending, outro, 0.42)
        mix = np.concatenate([mix, ed])
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
    return len(mix) / SR


def timeline(lines, duration, meta=None):
    scenes = {}
    for i, line in enumerate(lines):
        s = scenes.setdefault(line["scene"], {"start": line["start"], "lines": []})
        s["lines"].append(i)
    tl = {"duration": round(duration, 3), "scenes": scenes,
          "lines": [{k: l[k] for k in ("spk", "direction", "text", "start", "end", "scene")} for l in lines]}
    tl.update(meta or {})
    return tl


def write_html(tl, out_html, scenes_js):
    logo = os.path.join(os.path.dirname(HERE), "logo", "ありがとうグループ_ロゴ_白.png")
    logo_uri = "data:image/png;base64," + base64.b64encode(open(logo, "rb").read()).decode()
    html = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
    navy = os.path.join(os.path.dirname(HERE), "logo", "ありがとうグループ_ロゴ_紺.png")
    html = html.replace("__LOGO_NAVY__", "data:image/png;base64," + base64.b64encode(open(navy, "rb").read()).decode())
    html = html.replace("__TIMELINE__", json.dumps(tl, ensure_ascii=False)).replace("__LOGO__", logo_uri)
    html = html.replace("__SCENES__", open(scenes_js, encoding="utf-8").read())
    html = html.replace("__CHARS__", open(os.path.join(HERE, "characters.js"), encoding="utf-8").read())
    with open(out_html, "w", encoding="utf-8") as f:
        f.write(html)


def open_page(pw, html_path):
    exe = "/opt/pw-browsers/chromium"   # この環境に入っている Chromium
    browser = pw.chromium.launch(executable_path=exe if os.path.exists(exe) else None,
                                 args=["--allow-file-access-from-files"])
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto("file://" + html_path)
    page.evaluate("window.warmup()")
    if errors:
        raise RuntimeError("HTMLのエラー: " + "; ".join(errors))
    return browser, page


def preview(html_path, times, outdir):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser, page = open_page(pw, html_path)
        for t in times:
            page.evaluate(f"window.seek({t})")
            page.screenshot(path=os.path.join(outdir, f"preview_{t:06.1f}.png"))
        browser.close()


def render(html_path, wav_path, duration, fps, mp4_path, span=None):
    from playwright.sync_api import sync_playwright
    a, b = span if span else (0, duration)   # 一部分だけ書き出す（見本づくり用）
    n = int((b - a) * fps)
    enc = subprocess.Popen([FFMPEG, "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(fps),
                            "-c:v", "mjpeg", "-i", "-", "-ss", str(a), "-t", str(b - a), "-i", wav_path, "-c:v", "libx264", "-preset", "medium",
                            "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest",
                            mp4_path], stdin=subprocess.PIPE)
    with sync_playwright() as pw:
        browser, page = open_page(pw, html_path)
        for i in range(n):
            page.evaluate(f"window.seek({a + i / fps})")
            enc.stdin.write(page.screenshot(type="jpeg", quality=92))
            if i % (fps * 10) == 0:
                print(f"  {i / fps:.0f}秒 / {duration:.0f}秒", flush=True)
        browser.close()
    enc.stdin.close()
    enc.wait()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script")
    ap.add_argument("name")
    ap.add_argument("--scenes", default=os.path.join(HERE, "scenes", "Q1第1回.js"), help="場面ごとの絵（JS）")
    ap.add_argument("--bgm", help="BGMの音声ファイル（Suno の曲など）。話している間ずっと小さく流す")
    ap.add_argument("--bgm-level", type=float, default=0.06, help="BGMの音量（0〜1）。6%が「ちょうど良い」の基準")
    ap.add_argument("--opening", help="オープニング曲（頭の --intro 秒を使う）")
    ap.add_argument("--intro", type=float, default=7.0, help="オープニングの長さ（秒）")
    ap.add_argument("--ending", help="エンディング曲（頭の --outro 秒を使う）")
    ap.add_argument("--outro", type=float, default=8.0, help="エンディングの長さ（秒）")
    ap.add_argument("--series", default="未経験からエアコン清掃で独立するロードマップ", help="オープニングに出すシリーズ名")
    ap.add_argument("--number", default="", help="オープニングに出す回（例：第3回）")
    ap.add_argument("--title", default="", help="オープニングに出すタイトル")
    ap.add_argument("--next", default="", help="エンディングに出す次回の案内")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--span", help="一部分だけ書き出す 開始秒,終了秒（見本用）")
    ap.add_argument("--preview", help="確認用に静止画だけ書き出す秒数（カンマ区切り）")
    a = ap.parse_args()
    outdir = os.path.abspath(a.name + "_work")
    os.makedirs(outdir, exist_ok=True)
    lines = parse(a.script)
    wav = os.path.join(outdir, "audio.wav")
    intro = a.intro if a.opening else 0.0
    outro = a.outro if a.ending else 0.0
    duration = build_audio(lines, wav, a.bgm, a.bgm_level, a.opening, intro, a.ending, outro)
    meta = {"intro": intro, "outro": round(duration - outro, 3) if outro else 0,
            "series": a.series, "number": a.number, "title": a.title, "next": a.next}
    tl = timeline(lines, duration, meta)
    json.dump(tl, open(os.path.join(outdir, "timeline.json"), "w"), ensure_ascii=False, indent=1)
    html = os.path.join(HERE, "_render.html")   # フォント（node_modules）を読むため、このフォルダに置く
    write_html(tl, html, a.scenes)
    print(f"長さ {duration:.1f}秒、{len(lines)}行、場面 {list(tl['scenes'])}")
    if a.preview:
        preview(html, [float(x) for x in a.preview.split(",")], outdir)
    else:
        span = [float(x) for x in a.span.split(",")] if a.span else None
        render(html, wav, duration, a.fps, os.path.abspath(a.name + ".mp4"), span)


if __name__ == "__main__":
    main()
