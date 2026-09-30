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
    import pyopenjtalk
    text = line["text"]
    for wrong, right in READING_FIX.items():
        text = text.replace(wrong, right)
    x, sr = pyopenjtalk.tts(text, **VOICES[line["spk"]])
    assert sr == SR
    return x.astype(np.float32) / 32768.0


def build_audio(lines, wav_path):
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
    mix = voice + make_bgm(len(voice) / SR + 1)[:len(voice)] * 0.06
    f = int(1.5 * SR)
    mix[-f:] *= np.linspace(1, 0, f)
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
    return len(voice) / SR


def timeline(lines, duration):
    scenes = {}
    for i, line in enumerate(lines):
        s = scenes.setdefault(line["scene"], {"start": line["start"], "lines": []})
        s["lines"].append(i)
    return {"duration": round(duration, 3), "scenes": scenes,
            "lines": [{k: l[k] for k in ("spk", "direction", "text", "start", "end", "scene")} for l in lines]}


def write_html(tl, out_html, scenes_js):
    logo = os.path.join(os.path.dirname(HERE), "logo", "ありがとうグループ_ロゴ_白.png")
    logo_uri = "data:image/png;base64," + base64.b64encode(open(logo, "rb").read()).decode()
    html = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
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
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--span", help="一部分だけ書き出す 開始秒,終了秒（見本用）")
    ap.add_argument("--preview", help="確認用に静止画だけ書き出す秒数（カンマ区切り）")
    a = ap.parse_args()
    outdir = os.path.abspath(a.name + "_work")
    os.makedirs(outdir, exist_ok=True)
    lines = parse(a.script)
    wav = os.path.join(outdir, "audio.wav")
    duration = build_audio(lines, wav)
    tl = timeline(lines, duration)
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
