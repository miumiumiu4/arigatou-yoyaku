#!/usr/bin/env python3
"""スプレッドシートの2つのタブ（行の配列、1行目が見出し）を data/ の1人1ファイルに書き出す。

  python3 scripts/sync_rows.py <3日間宿題.json> <会議アンケート.json>

どちらも Google Sheets の values（[[見出し...], [値...], ...]）をそのまま保存した JSON。
同じメールの行が複数あれば、下（新しい）ほうを使う。
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build import ROOT, pid  # noqa: E402

SURVEY_SKIP = {"受信日時", "メール", "名前", "会議の日時", "台本（Claudeが記入）", "メモ"}


def rows(path):
    vals = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    vals = vals.get("values", vals) if isinstance(vals, dict) else vals
    if not vals:
        return []
    head = vals[0]
    return [dict(zip(head, r + [""] * (len(head) - len(r)))) for r in vals[1:] if any(str(x).strip() for x in r)]


def write(sub, key, obj):
    p = ROOT / "data" / sub / f"{key}.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")


def main(prep_path, survey_path):
    keep = {"prep": set(), "survey": set()}
    for r in rows(prep_path):
        mail = str(r.get("メール", "")).strip()
        if not mail:
            continue
        days = {}
        for d in "123":
            raw = r.get(f"d{d}_json", "")
            if raw:
                try:
                    days[d] = {"at": r.get(f"d{d}_at", ""), "answers": json.loads(raw)}
                except json.JSONDecodeError:
                    pass
        k = pid(mail)
        write("prep", k, {"mail": mail, "name": r.get("名前", ""), "days": days})
        keep["prep"].add(k)
    for r in rows(survey_path):
        mail = str(r.get("メール", "")).strip()
        if not mail:
            continue
        k = pid(mail)
        write("survey", k, {"mail": mail, "name": r.get("名前", ""), "meeting_at": r.get("会議の日時", ""),
                            "booked_at": r.get("受信日時", ""),
                            "answers": {q: v for q, v in r.items() if q not in SURVEY_SKIP and str(v).strip()}})
        keep["survey"].add(k)
    # シートから消えた人（テスト行など）はリポジトリからも消す
    for sub, ks in keep.items():
        for p in (ROOT / "data" / sub).glob("*.json"):
            if p.stem not in ks:
                p.unlink()
    print(f"宿題 {len(keep['prep'])}人・アンケート {len(keep['survey'])}人")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
