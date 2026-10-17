#!/bin/zsh
# Mac の LaunchAgent から1時間ごとに動かす：受け口GASから2つのタブを読み → data/ → people/・dashboard.md → push
# 合言葉は ~/.zshrc の PREP_EXPORT_KEY、受け口URLは RECEIVER_URL（どちらもここには書かない）
set -euo pipefail
source ~/.zshrc >/dev/null 2>&1 || true
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "${RECEIVER_URL}?t=prepexport&k=${PREP_EXPORT_KEY}" -o "$tmp/all.json"
python3 - "$tmp" <<'PY'
import json, sys, pathlib
d = pathlib.Path(sys.argv[1]); a = json.loads((d / "all.json").read_text())
if not a.get("ok"):
    sys.exit("受け口が ok を返しませんでした（合言葉かURLを確かめる）")
(d / "prep.json").write_text(json.dumps(a["prep"], ensure_ascii=False))
(d / "survey.json").write_text(json.dumps(a["survey"], ensure_ascii=False))
PY
git pull -q --ff-only
python3 scripts/sync_rows.py "$tmp/prep.json" "$tmp/survey.json"
python3 scripts/build.py
# 更新日時の行だけの変化ならコミットしない
if git diff --quiet -- . ':!dashboard.md' && [ -z "$(git ls-files --others --exclude-standard)" ] \
   && [ "$(git diff -U0 -- dashboard.md | grep -c '^[+-][^+-]' || true)" -le 2 ]; then
  git checkout -q -- dashboard.md
  exit 0
fi
git add -A
git commit -qm "宿題の集計を更新"
git push -q
