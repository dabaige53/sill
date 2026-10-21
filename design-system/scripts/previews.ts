// Writes components/<Comp>/preview.html from the product renderers, so the online previews show what
// the app draws. Run: node --import tsx design-system/scripts/previews.ts [--check]
import "./fixed-clock.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	avatars,
	button,
	checkItem,
	emptyState,
	ring,
	tagChip,
} from "../../apps/web/atoms/primitives.ts";
import { SelectionBar } from "../../apps/web/atoms/selection.tsx";
import { cardHTML, stackHTML } from "../../apps/web/cards/templates.ts";
import { copy } from "../../apps/web/copy.ts";
import { SeedCards } from "../../apps/web/data/cards.ts";
import { Store } from "../../apps/web/data/store.ts";
import { pushRingHTML } from "../../apps/web/interactions/gesture-preview.ts";
import { Panels } from "../../apps/web/interactions/panels.ts";
import { cardMenuHTML } from "../../apps/web/views/app-card-actions.ts";
import { AIDock, HomeTop, Navigation } from "../../apps/web/views/shell.tsx";

const check = process.argv.includes("--check");
const root = resolve(import.meta.dirname, "../components");
Store.state = Store.fresh();
const first = new Map<string, (typeof SeedCards)[number]>();
for (const card of SeedCards) if (!first.has(card.type)) first.set(card.type, card);
const article = first.get("article");
// Design sample text: summaries at the 50–60 characters the handbook asks for (文字长度), so the
// preview shows full three-line summaries on the types that show one. Product demo data stays as it is.
const sampleSummaries: Record<string, string> = {
	article:
		"让想法、判断和行动顺畅地连接起来。把 AI 放进已有的工作流程，帮助整理信息、减少重复步骤，并为下一步行动提供依据。",
	mail: "三种方向已经整理好了。比起继续增加功能，我们更想先确认哪些内容应该留下，再围绕这个决定收拢页面结构，完成这周的方案。",
	suggestion:
		"「按需显现」与「卡片即上下文」在回答同一个问题：怎样少做一步。把两张卡放在一起读，比较各自强调的用户意图。",
	reminder:
		"起身，看看窗外，让眼睛和肩膀都休息一会儿。十分钟后再回到桌面，接着处理还没做完的那件事，节奏会更稳。",
	digest:
		"这周读了 12 篇、收藏 5 篇，完成的待办比上周少两项。读到的想法不少，下周试着每天挑一件落到手上。",
};
const sample = (card: (typeof SeedCards)[number]) =>
	sampleSummaries[card.type] ? { ...card, summary: sampleSummaries[card.type] } : card;
const react = (component: (props: never) => unknown) =>
	renderToStaticMarkup(createElement(component as never)).replace(/ hidden=""/, "");
const pick = (html: string, selector: string, count = 1) => {
	const dom = new JSDOM(`<body>${html}</body>`);
	const nodes = [...dom.window.document.querySelectorAll(selector)].slice(0, count);
	const out = nodes.map((node) => node.outerHTML).join("");
	dom.window.close();
	if (!out) throw new Error(`previews: ${selector} not found`);
	return out;
};
const row = (html: string) =>
	`<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">${html}</div>`;

const previews: Record<
	string,
	{ group: string; height: number; width?: number; body: string; background?: string }
> = {
	FeedCard: {
		group: "Cards",
		height: 1400,
		width: 1120,
		body: `<div style="columns:3 340px;column-gap:16px">${[...first.values()]
			.map(
				(card) =>
					`<div style="break-inside:avoid;margin-bottom:16px">${cardHTML(sample(card))}</div>`,
			)
			.join("")}</div>`,
	},
	StackCard: {
		group: "Cards",
		height: 300,
		body: `<div style="width:340px">${stackHTML(
			"preview",
			SeedCards.filter((card) => card.type === "article").slice(0, 3),
		)}</div>`,
	},
	CardMenu: {
		group: "Cards",
		height: 280,
		body: `<div class="card-more-menu" role="group" style="position:relative;inset:auto">${cardMenuHTML(article, Store.item(article.id), false)}</div>`,
	},
	IconButton: {
		group: "Atoms",
		height: 100,
		body: row(
			button("bookmark", copy("web.bookmark"), "x") +
				button("glasses", copy("web.later"), "x") +
				button("tag", copy("web.app.09fe39e89e28"), "x") +
				button("x", copy("web.close"), "x"),
		),
	},
	ActionButton: {
		group: "Atoms",
		height: 100,
		body: row(
			`<button type="button" class="solid-button">${copy("web.bookmark")}</button><button type="button" class="text-button">${copy("web.close")}</button>`,
		),
	},
	CheckItem: {
		group: "Atoms",
		height: 150,
		body: (() => {
			const task = SeedCards.find((card) => card.type === "task" && card.tasks?.length);
			return `<div style="width:320px">${task.tasks
				.slice(0, 3)
				.map((item) => checkItem(task, item))
				.join("")}</div>`;
		})(),
	},
	Avatars: { group: "Atoms", height: 80, body: avatars(["王", "李", "陈", "周"]) },
	TagChip: {
		group: "Atoms",
		height: 90,
		body: `<div class="chips">${tagChip("设计", true)}${tagChip("阅读")}${tagChip("工作")}</div>`,
	},
	ProgressRing: {
		group: "Atoms",
		height: 90,
		body: row([0, 0.25, 0.6, 1].map((p) => ring(p)).join("")),
	},
	Toggle: {
		group: "Forms",
		height: 160,
		background: "var(--card)",
		body: `<div style="width:420px">${pick(Panels.settings({}, "desk"), ".setting-row:has(.toggle)", 2)}</div>`,
	},
	SearchField: {
		group: "Forms",
		height: 100,
		body: `<div style="width:420px">${pick(react(HomeTop), ".home-search")}</div>`,
	},
	Navigation: { group: "Navigation", height: 110, body: react(Navigation) },
	AICompose: {
		group: "Navigation",
		height: 110,
		body: `<div style="width:640px">${react(AIDock)}</div>`,
	},
	SelectionBar: {
		group: "Feedback",
		height: 110,
		body: react(SelectionBar).replace(
			'<span class="selection-count num"></span>',
			'<span class="selection-count num">3</span>',
		),
	},
	Toast: {
		group: "Feedback",
		height: 100,
		body: `<div id="toast" class="glass" role="status"><span id="toast-text">${copy("web.bookmark")}</span><span id="toast-action"><button type="button" class="text-link" data-action="undo">${copy("web.app.926a50b98ece")}</button></span></div>`,
	},
	ReadEndRing: {
		group: "Feedback",
		height: 90,
		body: row(
			`<div class="push-ring" style="position:relative">${pushRingHTML}</div><div class="push-ring is-done" style="position:relative">${pushRingHTML}</div>`,
		),
	},
	EmptyState: {
		group: "Feedback",
		height: 260,
		body: emptyState(
			copy("web.app.4a684ec67af5"),
			"",
			`<button type="button" class="text-link" data-action="clear-filter">${copy("web.app.657d9cbf45ec")}</button>`,
		),
	},
	Dialog: {
		group: "Overlays",
		height: 640,
		width: 880,
		body: `<dialog id="modal" class="panel wide" open style="position:static;margin:0">${Panels.settings({}, "desk")}</dialog>`,
	},
};

let stale = 0;
for (const [name, p] of Object.entries(previews)) {
	const file = resolve(root, name, "preview.html");
	const html = `<!-- @dsCard group="${p.group}" height=${p.height}${p.width ? ` width=${p.width}` : ""} -->
<!-- Generated by design-system/scripts/previews.ts from apps/web. Do not edit by hand. -->
<!doctype html>
<html><head><meta charset="utf-8"></head>
<body class="ds-flow" style="margin:0;min-height:0;padding:16px;background:${p.background || "var(--canvas)"};font-family:var(--font-sans)">
<div id="root">${p.body}</div>
</body></html>
`;
	if (html.length > 256 * 1024) throw new Error(`${name} preview is over 256 KB`);
	const current = (() => {
		try {
			return readFileSync(file, "utf8");
		} catch {
			return "";
		}
	})();
	if (current === html) continue;
	stale++;
	if (check) console.error(`stale: components/${name}/preview.html`);
	else writeFileSync(file, html);
}
if (check && stale) process.exit(1);
console.log(
	check ? "previews up to date" : `${Object.keys(previews).length} previews, ${stale} written`,
);
