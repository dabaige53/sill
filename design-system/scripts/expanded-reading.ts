// Exploration boards reuse the approved card artwork, content and controls.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { icon } from "../../apps/web/atoms/icons.ts";
import { SeedCards } from "../../apps/web/data/cards.ts";
import { Store } from "../../apps/web/data/store.ts";
import { Panels } from "../../apps/web/interactions/panels.ts";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "boards/expanded-reading");
const document = new JSDOM(readFileSync(resolve(root, "boards/CardTypeDetails.dc.html"), "utf8"))
	.window.document;
const readingDocument = new JSDOM(
	readFileSync(resolve(root, "boards/CardTypeReading.dc.html"), "utf8"),
).window.document;
const styles = [...document.querySelectorAll("style")].map((node) => node.textContent).join("\n");
// Keep tokens, reference artwork and prototype layout separate, in cascade order.
writeFileSync(
	resolve(output, "tokens.css"),
	readFileSync(resolve(root, "../apps/web/styles/tokens.css"), "utf8"),
);
const referenceBoundary = styles.indexOf("/* detail sheet */");
if (referenceBoundary < 0) throw new Error("Reference detail styles boundary missing");
writeFileSync(resolve(output, "reference-cards.css"), styles.slice(0, referenceBoundary));
const mediaBoundary = styles.indexOf("/* podcast fullscreen:");
if (mediaBoundary < referenceBoundary) throw new Error("Reference media styles boundary missing");
writeFileSync(
	resolve(output, "reference-details.css"),
	styles.slice(referenceBoundary, mediaBoundary),
);
writeFileSync(resolve(output, "reference-media.css"), styles.slice(mediaBoundary));
writeFileSync(resolve(output, "samples.css"), "");
writeFileSync(
	resolve(output, "styles.css"),
	'@import "tokens.css";\n@import "reference-cards.css";\n@import "reference-details.css";\n@import "reference-media.css";\n@import "layout.css";\n@import "samples.css";\n',
);
const actions = [
	["bookmark", "收藏"],
	["tag", "标签"],
	["glasses", "稍后读"],
	["external", "去原文"],
];
for (const [kind, label] of [
	["podcast", "播客"],
	["video", "视频"],
	["article", "资讯"],
]) {
	if (kind === "podcast") {
		const card = SeedCards.find((card) => card.type === "media" && card.media === "podcast")!;
		Store.state = Store.fresh();
		Store.state.items[card.id] = { playbackPosition: 1841 };
		const stylesheets = JSON.parse(
			readFileSync(resolve(root, "../apps/web/styles/styles.json"), "utf8"),
		) as string[];
		const productDir = resolve(output, "product");
		mkdirSync(productDir, { recursive: true });
		const productStyles = stylesheets
			.map((file) => {
				const name = file.split("/").at(-1)!;
				writeFileSync(resolve(productDir, name), readFileSync(resolve(root, "..", file)));
				return `<link rel="stylesheet" href="product/${name}">`;
			})
			.join("");
		writeFileSync(
			resolve(output, "podcast.html"),
			'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>播客介绍</title>' +
				productStyles +
				'</head><body><dialog id="modal" class="preview" open>' +
				Panels.preview({}, card) +
				"</dialog></body></html>\n",
		);
		continue;
	}
	const row = [...document.querySelectorAll("section.row")].find((node) =>
		(node.querySelector("h2")?.textContent || "").includes(label),
	)!;
	const fullRow =
		kind === "article"
			? [...readingDocument.querySelectorAll("section.row")].find((node) =>
					(node.querySelector("h2")?.textContent || "").includes("资讯"),
				)!
			: row;
	const full = fullRow.querySelector(".fs")!.cloneNode(true) as Element;
	const mini = row
		.querySelector(
			kind === "podcast" ? ".npsheet" : kind === "article" ? ".sheet.cap" : ".sheet.short",
		)!
		.cloneNode(true) as Element;
	for (const view of [full, mini]) {
		view.querySelectorAll(".fstop,.toolbar,.discs,.nphead,.rdfade").forEach((node) => {
			node.remove();
		});
		for (const node of view.querySelectorAll("[style]"))
			node.setAttribute(
				"style",
				node.getAttribute("style")!.replaceAll("url(screens/", "url(../screens/"),
			);
	}
	const toolbar = actions
		.map(
			([name, text]) =>
				`<button type="button" aria-label="${text}" title="${text}" ${name === "bookmark" || name === "glasses" ? `data-toggle aria-pressed="false"` : "disabled"}>${icon(name, 20)}</button>`,
		)
		.join("");
	if (kind === "article") {
		const article = full.querySelector(".rdin")!;
		article.id = "article-scroll";
		const paragraphs = article.querySelectorAll(".body p");
		for (const [index, title] of [
			[1, "少开窗口"],
			[2, "给内容留白"],
		] as const) {
			const heading = document.createElement("h3");
			heading.textContent = title;
			heading.id = `article-section-${index}`;
			paragraphs[index].before(heading);
		}
		const layout = document.createElement("div");
		layout.className = "article-layout";
		const nav = document.createElement("nav");
		nav.className = "article-outline";
		nav.id = "article-outline";
		nav.setAttribute("aria-label", "文章目录");
		nav.innerHTML =
			'<h2>目录</h2><div class="toc-links"><span class="toc-indicator" aria-hidden="true"></span><a href="#article-section-1" aria-current="location">少开窗口</a><a href="#article-section-2">给内容留白</a></div>';
		article.replaceWith(layout);
		layout.append(nav, article);
		const progress = full.querySelector(".rprog")!;
		progress.removeAttribute("style");
		progress.setAttribute("aria-hidden", "true");
	} else {
		const tabset = full.querySelector(".tabset")!;
		for (const [index, item] of [...tabset.children].entries()) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = item.className;
			button.textContent = item.textContent;
			button.dataset.tab = String(index);
			button.setAttribute("role", "tab");
			button.id = `tab-${index}`;
			button.setAttribute("aria-selected", String(index === 0));
			button.setAttribute("aria-controls", `content-${index}`);
			item.replaceWith(button);
		}
		tabset.setAttribute("role", "tablist");
		tabset.setAttribute("aria-label", `${label}内容`);
		const transcript = full.querySelector(".tps")!;
		transcript.id = "content-0";
		transcript.setAttribute("role", "tabpanel");
		transcript.setAttribute("aria-labelledby", "tab-0");
		const chapter = full.querySelector(kind === "podcast" ? ".npchap" : ".vnow")!;
		const chapterPanel = document.createElement("div");
		chapterPanel.className = "content-panel";
		chapterPanel.innerHTML = chapter.outerHTML;
		const notesPanel = document.createElement("div");
		notesPanel.className = "content-panel";
		// Use only the existing sample text; do not invent episode notes or chapters.
		if (kind === "video") notesPanel.innerHTML = row.querySelector(".sheet .sec")!.innerHTML;
		else {
			(tabset.querySelector('[data-tab="2"]') as HTMLButtonElement).disabled = true;
		}
		[chapterPanel, notesPanel].forEach((panel, index) => {
			panel.id = `content-${index + 1}`;
			panel.hidden = true;
			panel.setAttribute("role", "tabpanel");
			panel.setAttribute("aria-labelledby", `tab-${index + 1}`);
			transcript.parentElement!.append(panel);
		});
	}
	const sampleRules: string[] = [];
	for (const view of [full, mini])
		for (const node of view.querySelectorAll("[style]")) {
			const name = `sample-${kind}-${sampleRules.length}`;
			sampleRules.push(`.${name}{${node.getAttribute("style")}}`);
			node.classList.add(name);
			node.removeAttribute("style");
		}
	appendFileSync(resolve(output, "samples.css"), "\n" + sampleRules.join("\n"));
	const markup = (view: Element) => view.outerHTML.replace(/ (hidden|disabled)=""/g, " $1");
	const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${label} · 放大页探索</title><link rel="stylesheet" href="styles.css"></head><body class="exploration ${kind}">
<main class="stage" aria-label="${label}放大与收起原型">
<div class="morph" aria-hidden="true"></div>
<div class="view full-view" aria-hidden="true" inert>${markup(full)}</div>
<div class="view mini-view">${markup(mini)}</div>
<div class="left-tools" role="group" aria-label="卡片操作"><span class="tools-surface" aria-hidden="true"></span>${toolbar}</div>
<div class="right-tools">${kind === "article" ? `<button type="button" id="outline-toggle" aria-label="收起目录" title="收起目录，专注阅读" aria-expanded="true" aria-controls="article-outline" hidden>${icon("list", 20)}</button>` : ""}<button type="button" id="resize" aria-label="放大" title="放大">${icon("expand", 20)}</button><button type="button" disabled aria-label="关闭" title="关闭">${icon("x", 20)}</button></div>
</main><script src="/dist/design/expanded-reading/interactions.js"></script></body></html>\n`;
	writeFileSync(resolve(output, `${kind}.html`), html);
}
const bundleDirectory = resolve(root, "../dist/design/expanded-reading");
mkdirSync(bundleDirectory, { recursive: true });
writeFileSync(
	resolve(output, "interactions.js"),
	"// Motion is built locally by expanded-reading.ts; boards load /dist/design/expanded-reading/interactions.js.\n",
);
await build({
	entryPoints: [resolve(root, "scripts/expanded-reading-motion.ts")],
	bundle: true,
	format: "iife",
	platform: "browser",
	minify: true,
	outfile: resolve(bundleDirectory, "interactions.js"),
});
console.log(
	"expanded reading: article/video from reference boards, podcast from the product introduction component",
);
