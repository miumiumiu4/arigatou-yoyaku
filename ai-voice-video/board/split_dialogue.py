"""場面ごとにまとめて作った Gemini の音声を、セリフ1行ずつに切り分ける。

Gemini は1日に頼める回数に上限がある（1モデル100回）ため、場面の会話をまとめて1回で作る。
返ってきた1本の音声の「無音のすき間」から、セリフの文字数の比率に一番合う切れ目を選ぶ。
切った各行の声の高さ（男性＝三浦、女性＝聞き手）が話者と合っているかも確かめる。
"""
import numpy as np

HOP = 0.01  # 10ms


def envelope(x, sr):
    h = int(sr * HOP)
    n = len(x) // h
    e = np.sqrt((x[:n * h].reshape(n, h) ** 2).mean(1))
    return e


def silences(x, sr, min_len=0.12):
    e = envelope(x, sr)
    th = max(np.percentile(e, 95) * 0.06, 1e-4)
    quiet = e < th
    runs, i = [], 0
    while i < len(quiet):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]:
                j += 1
            if (j - i) * HOP >= min_len and i > 0 and j < len(quiet):
                runs.append(((i + j) / 2 * HOP, (j - i) * HOP, i * HOP, j * HOP))
            i = j
        else:
            i += 1
    return runs, e, th


def split(x, sr, texts, speakers=None, female=("L",)):
    """texts の行数に切り分けた音声のリスト（前後の無音は落とす）を返す。
    speakers（"N"/"L" の並び）を渡すと、声の高さが話者と合う切れ目を優先する。"""
    n = len(texts)
    if n == 1:
        return [trim(x, sr)]
    runs, e, th = silences(x, sr)
    total = len(x) / sr
    w = np.array([reading_weight(t) for t in texts], float)
    exp_dur = w / w.sum() * total
    # 10ms ごとの「高い声／低い声」の累積（話者の確認用）
    hi_cum = lo_cum = None
    if speakers:
        f0 = pitch_track(x, sr)
        hi_cum = np.concatenate([[0], np.cumsum(f0 >= 165)])
        lo_cum = np.concatenate([[0], np.cumsum((f0 > 0) & (f0 < 165))])
    cand = [(r[0], 2.0 * np.log(r[1] / 0.12 + 1)) for r in runs]
    if speakers:
        # 無音がなくても、声の高さが切り替わるところは切れ目の候補にする
        cls = np.where(f0 >= 165, 1.0, np.where(f0 > 0, -1.0, 0.0))
        sm = np.convolve(cls, np.ones(30) / 30, "same")
        for i in np.where(np.sign(sm[1:]) * np.sign(sm[:-1]) < 0)[0]:
            t = (i + 1) * HOP
            if all(abs(t - c[0]) > 0.25 for c in cand):
                cand.append((t, 0.0))
        cand.sort()
    pts = [0.0] + [c[0] for c in cand] + [total]
    bonus = [0.0] + [c[1] for c in cand] + [0.0]

    def seg_cost(k, a, b):
        d = pts[b] - pts[a]
        c = ((d - exp_dur[k]) / (0.25 * exp_dur[k] + 0.4)) ** 2
        if d < 0.35 * exp_dur[k]:
            c += 30.0
        if speakers:
            i, j = int(pts[a] / HOP), int(pts[b] / HOP)
            hi, lo = hi_cum[j] - hi_cum[i], lo_cum[j] - lo_cum[i]
            if hi + lo > 5:
                wrong = lo if speakers[k] in female else hi
                c += 20.0 * wrong / (hi + lo)
        return c - bonus[b]

    P = len(pts)
    if P - 1 < n:
        raise ValueError(f"切れ目の候補が足りない（{P - 2} < {n - 1}）")
    INF = 1e18
    dp = np.full((n + 1, P), INF)
    back = np.zeros((n + 1, P), int)
    dp[0][0] = 0.0
    for k in range(1, n + 1):
        for b in range(k, P):
            if k == n and b != P - 1:
                continue
            for a in range(k - 1, b):
                if dp[k - 1][a] >= INF:
                    continue
                v = dp[k - 1][a] + seg_cost(k - 1, a, b)
                if v < dp[k][b]:
                    dp[k][b], back[k][b] = v, a
    idx, b = [], P - 1
    for k in range(n, 0, -1):
        idx.append(b)
        b = back[k][b]
    idx.append(0)
    idx.reverse()
    return [trim(x[int(pts[idx[k]] * sr):int(pts[idx[k + 1]] * sr)], sr) for k in range(n)]


def reading_weight(text):
    """セリフを読む長さの目安。漢字は読みが長いので、Open JTalk の読み（カナ）の数で測る。"""
    try:
        import pyopenjtalk
        kana = pyopenjtalk.g2p(text, kana=True)
        return len([c for c in kana if c not in "ャュョァィゥェォ、。？！…「」 "]) + 0.25 * sum(c in "、。？！" for c in text) * 4 + 2.0
    except Exception:
        return len(text) + 3.0


def pitch_track(x, sr):
    """10ms ごとの声の高さ（Hz、声のないところは0）。"""
    step = max(1, sr // 16000)          # 計算を軽くするため 16kHz 前後に落とす
    if step > 1:
        x = np.convolve(x, np.ones(step) / step, "same")[::step]
        sr = sr // step
    h, win = int(sr * HOP), int(sr * 0.04)
    lo, hi = int(sr / 400), int(sr / 70)
    out = np.zeros(len(x) // h + 1)
    for n, i in enumerate(range(0, len(x) - win, h)):
        f = x[i:i + win] - x[i:i + win].mean()
        if np.sqrt((f ** 2).mean()) < 0.02:
            continue
        ac = np.correlate(f, f, "full")[win - 1:]
        if ac[0] <= 0:
            continue
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] / ac[0] > 0.45:
            out[n] = sr / k
    return out


def trim(x, sr, pad=0.04):
    e = envelope(x, sr)
    if len(e) == 0:
        return x
    th = max(np.percentile(e, 95) * 0.06, 1e-4)
    idx = np.where(e >= th)[0]
    if len(idx) == 0:
        return x
    a = max(0, int((idx[0] * HOP - pad) * sr))
    b = min(len(x), int(((idx[-1] + 1) * HOP + pad) * sr))
    return x[a:b]


def pitch(x, sr):
    """声の高さ（Hz）の中央値。男性≒80〜160、女性≒170〜300。"""
    h, win = int(sr * 0.02), int(sr * 0.04)
    f0 = []
    lo, hi = int(sr / 400), int(sr / 70)
    for i in range(0, len(x) - win, h):
        f = x[i:i + win] - x[i:i + win].mean()
        if np.sqrt((f ** 2).mean()) < 0.02:
            continue
        ac = np.correlate(f, f, "full")[win - 1:]
        if ac[0] <= 0:
            continue
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] / ac[0] > 0.45:
            f0.append(sr / k)
    return float(np.median(f0)) if f0 else 0.0
