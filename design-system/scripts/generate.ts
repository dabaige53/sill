import fs from "node:fs";
import path from "node:path";
import { buildSync } from "esbuild";
import { Glyphs } from "../../apps/web/atoms/icons.ts";

const D = process.argv[2],
	R = process.argv[3] || process.cwd();
if (!D) throw new Error("Usage: node design-system/scripts/generate.ts DESTINATION [ROOT]");
for (const directory of ["assets/Icons", "components"])
	fs.mkdirSync(path.join(D, directory), { recursive: true });
const src = (f?: any) => fs.readFileSync(path.join(R, f), "utf8");
for (const [k, v] of Object.entries(Glyphs)) {
	fs.writeFileSync(
		path.join(D, "assets/Icons", k + ".svg"),
		`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1d1d1f" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${v}</svg>\n`,
	);
}
console.log(Object.keys(Glyphs).length, "icons");
// bundle.js
const names = [
	"IconButton",
	"ActionButton",
	"ProgressRing",
	"CheckItem",
	"Avatars",
	"Attachment",
	"TagChip",
	"CardMeta",
	"SearchField",
	"Toggle",
	"GlassDock",
	"CardMenu",
	"FeedCard",
	"ReminderCard",
	"TaskCard",
	"QuoteCard",
	"Dialog",
	"Toast",
	"SelectionBar",
	"EmptyState",
	"AIContext",
	"AICompose",
	"AIMessages",
];
const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: "Sill", components: names.map((n?: any) => ({ name: n })) })} */\n`;
const body = buildSync({
	stdin: {
		contents:
			"export {Glyphs,icon} from './apps/web/atoms/icons.ts'; export {esc,button,ring,checkItem,avatars,tagChip,emptyState,timeString,minutes} from './apps/web/atoms/primitives.ts';",
		resolveDir: R,
	},
	bundle: true,
	write: false,
	format: "iife",
	globalName: "Sill",
	platform: "browser",
}).outputFiles[0].text;
if (/<\/script|<!--/i.test(body)) throw new Error("bad bundle");
fs.writeFileSync(path.join(D, "components/bundle.js"), header + body);
// bundle.css
const map = {
	"#d1d1d6": "var(--toggle-off)",
	"#b8b8bd": "var(--check-border)",
	"#c7c7cc": "var(--done-strike)",
	"#0057ad": "var(--accent-pressed)",
	"#dceaff": "var(--accent-soft-hover)",
	"#d8e9ff": "var(--selection)",
};
// Type sizes and the pill radius are not in the hosted tokens yet; carry them from tokens.css.
const local = src("apps/web/styles/tokens.css")
	.split("[data-theme")[0]
	.match(/--(?:text-[\w-]+|pill-radius):[^;]+;/g)
	.join("");
let css = `/* Sill · component styles · from apps/web/styles (base, controls, cards, overlays). Tokens come from tokens.json. */\n:root{--font:var(--font-sans);--ease:cubic-bezier(.2,.75,.25,1);--fast:140ms;--base:220ms;--layout:320ms;${local}}\n`;
for (const f of ["base", "controls", "cards", "overlays"]) {
	let t = src(`apps/web/styles/${f}.css`);
	for (const [k, v] of Object.entries(map)) t = t.split(k).join(v);
	css += t + "\n";
}
css += `/* Preview frame: cards and fixed layers render in flow. */\n.ds-flow .feed-card{position:relative}\n.ds-flow #toast,.ds-flow #selection-bar,.ds-flow .ai-panel,.ds-flow #dock{position:relative;left:auto;right:auto;bottom:auto;transform:none}\n.ds-flow main{padding:0;min-height:0}\n`;
if (/<\/style/i.test(css)) throw new Error("bad css");
fs.writeFileSync(path.join(D, "components/bundle.css"), css);
