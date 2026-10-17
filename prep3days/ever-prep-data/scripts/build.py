#!/usr/bin/env python3
"""data/ の答えから people/（1人1枚）と dashboard.md（全体の集計）を作る。

入力（定期タスクがスプレッドシートから書き出す。1人1ファイル、ファイル名はメールのハッシュ）
  data/prep/<id>.json    {"mail","name","rid","days":{"1":{"at":..., "answers":{...}}, "2":..., "3":...}}
  data/survey/<id>.json  {"mail","name","rid","meeting_at","booked_at","answers":{質問: 答え, ...}}
  data/manual/<id>.json  {"attended":bool,"step_decided":bool,"franchise_talk":bool,"memo":str}（任意、手入力）
id はメールを小文字にした sha256 の先頭12字（scripts/build.py の pid()）。

使い方: python3 scripts/build.py   （リポジトリの一番上で）
"""
import hashlib
import json
import pathlib
import re
from collections import Counter
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
JST = timezone(timedelta(hours=9))

# 宿題のキー → 質問（ever-prep の questions.js と同じ）
LABELS = {
    "1": [("sales_now", "今の月の売上"), ("jobs_now", "今の月の現場の件数"), ("target_sales", "目標の年商"),
          ("target_when", "いつまでに"), ("unit_price", "客単価"), ("people_needed", "必要な現場の人数（本人の計算）"),
          ("missing", "足りないもの"), ("hw1_note", "計算してみて思ったこと")],
    "2": [("channels", "集客の入口"), ("reviews_count", "Googleの口コミ"), ("inquiries_month", "月の問い合わせ・予約"),
          ("ask_review", "口コミを頼んでいるか"), ("spend_time", "集客の時間（週）"), ("spend_money", "集客のお金（月）"),
          ("quit_channel", "やめた集客と理由"), ("gap", "いちばんの穴（本人）")],
    "3": [("budget_ok", "次の一歩に使ってよい額"), ("budget_line", "手をつけないお金の線"), ("loan", "融資・分割の相談"),
          ("box", "迷いの箱"), ("box_detail", "箱の中身（情報・日付）"), ("kangaemasu", "「考えます」の理由"),
          ("reasons", "目標の年商が要る理由"), ("decide_one", "最後に一歩を決めるか"), ("wish", "会議でいちばん聞きたいこと")],
}

# 本人が選んだ「足りないもの」→ 加盟で手に入るもの（企画書00 2.）
OFFER = {
    "現場の人": "求人と採用の型／研修（スタッフと同じ流れ）",
    "集客": "集客と口コミの型／メールで予約を集める型",
    "研修・教える型": "研修／教育の型",
    "求人・採用の型": "求人と採用の型",
    "お金": "融資の申請サポート",
    "自分の時間": "教育の型（任せる）／本部と仲間",
    "決める力": "本部と仲間",
    "分からない": "（会議で一緒に整理する）",
}

# 帯の真ん中の値（万円）。距離の目安を出すためだけに使う
SALES_NOW_MONTH = {"まだ売上はない": 0, "10万円まで": 5, "10〜30万円": 20, "30〜60万円": 45,
                   "60〜100万円": 80, "100〜200万円": 150, "200万円より多い": 250}
TARGET_YEAR = {"1,000万円まで": 800, "1,000〜3,000万円": 2000, "3,000〜5,000万円": 4000,
               "5,000万〜1億円": 7500, "1億円より多い": 12000}


def pid(mail):
    return hashlib.sha256(mail.strip().lower().encode()).hexdigest()[:12]


def load(sub):
    out = {}
    for p in sorted((ROOT / "data" / sub).glob("*.json")):
        try:
            out[p.stem] = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print(f"読めないファイル: {p}")
    return out


def as_list(v):
    if isinstance(v, list):
        return [str(x) for x in v if str(x).strip()]
    return [x for x in re.split(r"[、,]\s*", str(v or "")) if x.strip()] if v else []


def show(v):
    v = as_list(v) if isinstance(v, list) else v
    if isinstance(v, list):
        return "、".join(v) if v else "—"
    return str(v).strip() or "—"


def md_cell(s):
    return str(s).replace("|", "｜").replace("\n", " ")


def stage(a2):
    """口コミ件数・問い合わせ数から見た段階（認知／実績／信頼／仕組み）"""
    inq, rev = a2.get("inquiries_month", ""), a2.get("reviews_count", "")
    if inq in ("", "0件"):
        return "認知（まだ知られていない）"
    if rev in ("0件", "1〜5件", "分からない"):
        return "実績（見せられる実績が少ない）"
    if rev == "6〜19件":
        return "信頼（最初の20件の手前）"
    return "仕組み（人と型で広げる段階）"


def distance(a1):
    now = SALES_NOW_MONTH.get(a1.get("sales_now"))
    tgt = TARGET_YEAR.get(a1.get("target_sales"))
    if now is None or tgt is None:
        return None
    return tgt - now * 12


def fmt_man(v):
    if v >= 10000:
        return f"約{v / 10000:.1f}億円".replace(".0億", "億")
    return f"約{v:,}万円"


def person_md(key, sv, pr, mn):
    mail = (pr or sv or {}).get("mail", "")
    name = (sv or {}).get("name") or (pr or {}).get("name") or "（名前なし）"
    days = (pr or {}).get("days", {})
    a = {d: days.get(d, {}).get("answers", {}) for d in "123"}
    L = [f"# {name} さん", ""]
    L += ["| 項目 | 内容 |", "|---|---|",
          f"| 会議日時 | {md_cell((sv or {}).get('meeting_at') or '未定')} |",
          f"| 予約日 | {md_cell((sv or {}).get('booked_at') or '—')} |",
          f"| メール | {md_cell(mail)} |"]
    for d in "123":
        at = days.get(d, {}).get("at")
        L.append(f"| 宿題{d} | {'○ ' + md_cell(at) if at else '×'} |")
    L.append("")

    # 会議の準備シート（自動）
    L += ["## 会議の準備シート（自動）", ""]
    dist = distance(a["1"])
    L.append("### 距離")
    if a["1"]:
        L.append(f"- 目標の年商「{show(a['1'].get('target_sales'))}」／今の月の売上「{show(a['1'].get('sales_now'))}」"
                 + (f" → 年で{fmt_man(dist)}の差（帯の真ん中で計算した目安）" if dist is not None else ""))
        L.append(f"- 本人の計算：必要な現場の人数 **{show(a['1'].get('people_needed'))}人**／期限 {show(a['1'].get('target_when'))}")
    else:
        L.append("- 宿題1がまだ")
    L += ["", "### 穴"]
    if a["2"]:
        L.append(f"- 本人の見立て：{show(a['2'].get('gap'))}")
        L.append(f"- 数字から見た段階：{stage(a['2'])}（口コミ {show(a['2'].get('reviews_count'))}・問い合わせ {show(a['2'].get('inquiries_month'))}）")
        if a["2"].get("quit_channel"):
            L.append(f"- やめた集客：「{show(a['2'].get('quit_channel'))}」")
    else:
        L.append("- 宿題2がまだ")
    L += ["", "### お金と決め方"]
    if a["3"]:
        L.append(f"- 使ってよい額 {show(a['3'].get('budget_ok'))}／線 {show(a['3'].get('budget_line'))}／融資の相談 {show(a['3'].get('loan'))}")
        L.append(f"- 箱：{show(a['3'].get('box'))}" + (f"（{show(a['3'].get('box_detail'))}）" if a['3'].get('box_detail') else ""))
        L.append(f"- 「考えます」と言うなら：**{show(a['3'].get('kangaemasu'))}**")
    else:
        L.append("- 宿題3がまだ")
    L += ["", "### 足りないもの → 加盟で手に入るもの", "", "| 本人が選んだもの | 当たるもの |", "|---|---|"]
    miss = as_list(a["1"].get("missing"))
    L += [f"| {md_cell(m)} | {OFFER.get(m, '—')} |" for m in miss] or ["| — | — |"]
    L += ["", "### 最初の5分（本人の言葉）"]
    reasons = as_list(a["3"].get("reasons")) if a["3"] else []
    if reasons:
        L.append("「目標の年商が要る理由を、3つ書いてくださいましたね。」")
        L += [f"{i}. {r}" for i, r in enumerate(reasons, 1)]
    else:
        L.append("- （宿題3の理由がまだ。アンケートの答えから入る）")
    L += ["", "### 最後の5分（下書き）",
          f"- 一歩を決めて終わる：{show(a['3'].get('decide_one')) if a['3'] else '—'}",
          f"- いちばん聞きたいこと：{show(a['3'].get('wish')) if a['3'] else '—'}",
          "- 決める一歩の候補と日付：（会議で）", "",
          "> 注意：最初に加盟金330万円を正直に伝える／すすめない／加盟を考える方には法定の書面を先に渡して説明する", ""]

    # 元の答え
    if sv and sv.get("answers"):
        L += ["## 予約フォームのアンケート（本人の言葉のまま）", "", "| 質問 | 答え |", "|---|---|"]
        L += [f"| {md_cell(q)} | {md_cell(show(v))} |" for q, v in sv["answers"].items()]
        L.append("")
    for d in "123":
        if not a[d]:
            continue
        L += [f"## 宿題{d}", "", "| 質問 | 答え |", "|---|---|"]
        L += [f"| {lab} | {md_cell(show(a[d].get(k, '')))} |" for k, lab in LABELS[d]]
        L.append("")
    L += ["## 面談のあと（手で書く）", ""]
    mn = mn or {}
    L += [f"- 参加：{'○' if mn.get('attended') else '—'}", f"- 一歩を決めた：{'○' if mn.get('step_decided') else '—'}",
          f"- 加盟の相談：{'○' if mn.get('franchise_talk') else '—'}", f"- メモ：{mn.get('memo', '')}", ""]
    return "\n".join(L)


def file_name(key, sv, pr):
    m = str((sv or {}).get("meeting_at") or "")
    digits = re.sub(r"\D", "", m)
    when = f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}_{digits[8:12]}" if len(digits) >= 12 else "未定"
    return f"{when}_{key[:6]}.md"


def bar(title, counter, order=None):
    items = [(k, counter.get(k, 0)) for k in order] if order else counter.most_common()
    items = [(k, v) for k, v in items if v or order]
    if not items:
        return [f"**{title}**：まだ答えがありません", ""]
    total = sum(counter.values()) or 1
    L = [f"**{title}**", "", "| 答え | 人数 | 割合 |", "|---|---:|---:|"]
    L += [f"| {md_cell(k)} | {v} | {v * 100 // total}% |" for k, v in items]
    labels = ", ".join(json.dumps(k[:12], ensure_ascii=False) for k, _ in items)
    L += ["", "```mermaid", "xychart-beta", f'  title "{title}"', f"  x-axis [{labels}]",
          f"  y-axis \"人数\" 0 --> {max(v for _, v in items) + 1}", f"  bar [{', '.join(str(v) for _, v in items)}]", "```", ""]
    return L


def pie(title, counter):
    if not counter:
        return [f"**{title}**：まだ答えがありません", ""]
    L = ["```mermaid", f"pie title {title}"]
    L += [f'  {json.dumps(k, ensure_ascii=False)} : {v}' for k, v in counter.most_common()]
    return L + ["```", ""]


def dashboard(people):
    n = len(people)
    sub = {d: sum(1 for p in people if p["a"][d]) for d in "123"}
    all3 = sum(1 for p in people if all(p["a"][d] for d in "123"))
    c = lambda d, k: Counter(v for p in people for v in ([show(p["a"][d].get(k))] if p["a"][d].get(k) else []))
    cm = lambda d, k: Counter(v for p in people for v in as_list(p["a"][d].get(k)))
    now = datetime.now(JST).strftime("%Y-%m-%d %H:%M")
    L = ["# 3日間 集客戦略準備 ダッシュボード", "",
         f"更新：{now}（日本時間）／人数と割合だけの集計。個人の答えは people/ にあります。", "",
         "## 宿題の提出", "", "| | 人数 | 割合 |", "|---|---:|---:|", f"| 予約・登録 | {n} | 100% |"]
    for d in "123":
        L.append(f"| 宿題{d} | {sub[d]} | {sub[d] * 100 // (n or 1)}% |")
    L += [f"| 3つそろった | {all3} | {all3 * 100 // (n or 1)}% |", ""]
    L += ["## 距離（宿題1）", ""]
    L += bar("目標の年商", c("1", "target_sales"), list(TARGET_YEAR))
    L += bar("今の月の売上", c("1", "sales_now"), list(SALES_NOW_MONTH))
    L += bar("いつまでに", c("1", "target_when"), ["1年以内", "2年以内", "3年以内", "5年以内", "決めていない"])
    cross = Counter((p["a"]["1"].get("sales_now"), p["a"]["1"].get("target_sales")) for p in people if p["a"]["1"])
    if cross:
        tg = list(TARGET_YEAR)
        L += ["**今の売上 × 目標の年商**", "", "| 今 ＼ 目標 | " + " | ".join(tg) + " |", "|---|" + "---:|" * len(tg)]
        L += [f"| {s} | " + " | ".join(str(cross.get((s, t), 0)) for t in tg) + " |" for s in SALES_NOW_MONTH]
        L.append("")
    L += bar("足りないもの（複数）", cm("1", "missing"))
    L += ["## 集客（宿題2）", ""]
    L += bar("集客の入口（複数）", cm("2", "channels"))
    L += bar("Googleの口コミ", c("2", "reviews_count"), ["0件", "1〜5件", "6〜19件", "20〜49件", "50〜99件", "100件より多い", "分からない"])
    L += bar("いちばんの穴（本人）", c("2", "gap"))
    L += bar("数字から見た段階", Counter(stage(p["a"]["2"]) for p in people if p["a"]["2"]))
    L += ["## お金と決め方（宿題3）", ""]
    L += bar("次の一歩に使ってよい額", c("3", "budget_ok"), ["0円", "50万円まで", "50〜150万円", "150〜300万円", "300万円より多い", "まだ決めていない", "答えたくない"])
    L += pie("手をつけないお金の線", c("3", "budget_line"))
    L += pie("融資・分割の相談", c("3", "loan"))
    L += bar("迷いの箱", c("3", "box"), ["今日決める", "調べてから決める", "いつまでに決める", "箱に入れず止まっている"])
    L += bar("「考えます」の理由", c("3", "kangaemasu"))
    L += pie("最後に一歩を決めるか", c("3", "decide_one"))
    m = [p["m"] for p in people]
    L += ["## 会議の流れ（参加より先は manual の手入力）", "", "| 段階 | 人数 |", "|---|---:|",
          f"| 予約・登録 | {n} |", f"| 宿題3つそろった | {all3} |",
          f"| 参加 | {sum(1 for x in m if x.get('attended'))} |",
          f"| 一歩を決めた | {sum(1 for x in m if x.get('step_decided'))} |",
          f"| 加盟の相談 | {sum(1 for x in m if x.get('franchise_talk'))} |", ""]
    return "\n".join(L)


def main():
    prep, survey, manual = load("prep"), load("survey"), load("manual")
    keys = sorted(set(prep) | set(survey))
    out = ROOT / "people"
    out.mkdir(exist_ok=True)
    for old in out.glob("*.md"):
        old.unlink()
    people = []
    for k in keys:
        sv, pr, mn = survey.get(k), prep.get(k), manual.get(k, {})
        (out / file_name(k, sv, pr)).write_text(person_md(k, sv, pr, mn), encoding="utf-8")
        days = (pr or {}).get("days", {})
        people.append({"a": {d: days.get(d, {}).get("answers", {}) for d in "123"}, "m": mn})
    (ROOT / "dashboard.md").write_text(dashboard(people), encoding="utf-8")
    print(f"people {len(keys)}人・dashboard.md を書き出しました")


if __name__ == "__main__":
    main()
