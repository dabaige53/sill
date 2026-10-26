#!/bin/sh
# Sill 设计材料的统一入口：更新、检查、反查、调整画板、准备发布、记录版本。
# 发布到 claude.ai 由 Claude 完成：先运行 stage，再在 Claude Code 里说「发布设计」。
set -e
cd "$(dirname "$0")/.."

usage() {
	cat <<'EOF'
用法：scripts/design-init.sh <命令>

  status                 线上与仓库的差异、最近一个设计版本
  build                  从变量、产品代码重新生成：tokens、组件包、图标、组件示例、画板目录
  check                  检查印记、变量名、画板、组件示例和文件规范
  trace <编号或变量名>   反查：规则、变量取值、ADR、画板和代码位置
  retire <画板> ...      把现行画板移到历史（连同它专用的图片），重排画布
  layout                 按分组重排画布并重建本地画板目录
  stage [说明]           build + check，然后在 dist/design/ 准备发布文件和 plan.json
  record <DS 版本> <画布版本> [ADR]
                         发布后记录：更新 published.json、索引和设计版本记录
  boards                 本地打开画板（npm run boards）
EOF
}

build() {
	npm run --silent contracts:generate
	node design-system/scripts/generate.ts design-system .
	node --import tsx design-system/scripts/previews.ts
	node --import tsx design-system/scripts/expanded-reading.ts
	node design-system/scripts/motion-library.ts
	node design-system/scripts/canvas.ts layout
}

check() {
	node design-system/scripts/check.ts
	npm run --silent contracts:check
	npm run --silent files:check
}

trace() {
	[ -n "$1" ] || { usage; exit 1; }
	tmp=$(mktemp)
	node -e '
const fs = require("fs");
const key = process.argv[1];
const marks = JSON.parse(fs.readFileSync("design-system/marks.json", "utf8")).marks;
const tokens = JSON.parse(fs.readFileSync("design-system/tokens.json", "utf8"));
const found = [];
for (const family of Object.values(tokens)) if (Array.isArray(family?.tokens))
	for (const t of family.tokens) if (t.name === key) found.push(`变量 ${t.name} = ${JSON.stringify(t.value)}  ${t.usage || ""}`);
for (const group of tokens.type.groups) for (const s of group.styles)
	if (s.name === key || "text-" + s.name === key) found.push(`字号 ${s.name} = ${s.fontSize}/${s.lineHeight} ${s.fontWeight || ""}  ${s.usage || ""}`);
const ids = marks[key] ? [key] : Object.keys(marks).filter((id) => marks[id].tokens.includes(key.replace(/^text-/, "")));
for (const id of ids) {
	const m = marks[id];
	found.push(`印记 ${id}（${m.title}）：规则 design-system/${m.rule} · ADR ${m.adr} · 画板 ${m.boards.join("、")} · 变量 ${m.tokens.join("、") || "无"}`);
}
console.log(found.join("\n") || "marks.json 和 tokens.json 里没有 " + key);
console.log(ids.join(" "));
' "$1" > "$tmp"
	sed '$d' "$tmp"
	ids=$(tail -n 1 "$tmp")
	rm -f "$tmp"
	echo "-- 代码"
	for id in $ids; do git grep -n "@design.*\b$id\b" -- apps || true; done
	git grep -n -F -e "var(--$1)" -e "var(--text-$1)" -e "--$1:" -- 'apps/web/styles/*.css' | head -20 || true
	echo "-- 手册与组件说明"
	git grep -n -F -- "\`$1\`" -- design-system/handbook design-system/components DESIGN.md | head -20 || true
}

status() {
	tail -n 1 docs/design/versions.md
	node design-system/scripts/stage.ts "(status)" >/dev/null
	node -e '
const plan = require("./dist/design/plan.json");
for (const [name, p] of [["Design System", plan.ds], ["设计画布", plan.canvas]]) {
	console.log(`${name}：与上次发布相比 ${p.files.length} 个改动，${p.delete.length} 个删除`);
	for (const f of [...p.files.slice(0, 12), ...p.delete.slice(0, 6).map((d) => d + "（删除）")]) console.log("  " + f);
}
for (const w of plan.warnings) console.log("! " + w);
'
}

case "$1" in
	status) status ;;
	build) build ;;
	check) check ;;
	trace) shift; trace "$@" ;;
	retire) shift; node design-system/scripts/canvas.ts retire "$@"; echo "在 design-system/history/README.md 写一行去向。" ;;
	layout) node design-system/scripts/canvas.ts layout ;;
	stage) shift; build; check; node design-system/scripts/stage.ts "$*" ;;
	record) shift; node design-system/scripts/stage.ts record "$@" ;;
	boards) npm run boards ;;
	*) usage ;;
esac
