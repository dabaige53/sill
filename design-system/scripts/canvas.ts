// Keeps the canvas index, the two board folders and the local board index in step.
//   node design-system/scripts/canvas.ts layout            re-place boards by group, rebuild boards/index.html
//   node design-system/scripts/canvas.ts retire Board ...  move current boards (and their own image folders) to history
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ds = resolve(import.meta.dirname, "..");
const indexFile = resolve(ds, "boards/canvas.json");
const canvas = JSON.parse(readFileSync(indexFile, "utf8"));
const [command, ...args] = process.argv.slice(2);
const pageOf = (item: any) => item.page || "page-1";
const ROW = 13000,
	GAP = 80,
	TITLE = 280,
	BREAK = 400;

function retire(names: string[]) {
	const current = readdirSync(resolve(ds, "boards")).filter((f) => f.endsWith(".dc.html"));
	for (const name of names) {
		const file = name.endsWith(".dc.html") ? name : name + ".dc.html";
		const board = canvas.boards[file];
		if (!board || pageOf(board) !== "page-1") throw new Error(`${file} is not a current board`);
		const html = readFileSync(resolve(ds, "boards", file), "utf8");
		// Image folders only this board uses move with it.
		for (const folder of new Set(
			[...html.matchAll(/(?:src|href)="([a-z0-9-]+)\//g)].map((m) => m[1]),
		)) {
			const shared = current.some(
				(other) =>
					other !== file &&
					existsSync(resolve(ds, "boards", other)) &&
					readFileSync(resolve(ds, "boards", other), "utf8").includes(`"${folder}/`),
			);
			if (!shared && existsSync(resolve(ds, "boards", folder)))
				execFileSync(
					"git",
					["mv", `design-system/boards/${folder}`, `design-system/history/${folder}`],
					{ cwd: resolve(ds, "..") },
				);
		}
		execFileSync("git", ["mv", `design-system/boards/${file}`, `design-system/history/${file}`], {
			cwd: resolve(ds, ".."),
		});
		board.page = "history";
		board.y = -1; // joins the first history group
		console.log(`retired ${file}`);
	}
	layout();
}

function layout() {
	for (const page of canvas.pages.map((p: any) => p.id)) {
		const notes = Object.entries(canvas.notes)
			.filter(([, n]: any) => pageOf(n) === page)
			.sort(([, a]: any, [, b]: any) => a.y - b.y);
		const boards = canvas.order.filter(
			(f: string) => canvas.boards[f] && pageOf(canvas.boards[f]) === page,
		);
		const groupOf = (f: string) => {
			const y = canvas.boards[f].y;
			let owner = notes[0][0];
			for (const [id, n] of notes as any) if (n.y <= y) owner = id;
			return owner;
		};
		const members = new Map(notes.map(([id]) => [id, [] as string[]]));
		for (const f of boards) members.get(groupOf(f)).push(f);
		let y = 0;
		for (const [id, note] of notes as any) {
			note.y = y;
			let x = 0,
				top = y + TITLE,
				bottom = top,
				width = 0;
			for (const f of members.get(id)) {
				const b = canvas.boards[f];
				if (x > 0 && x + b.w > ROW) (x = 0), (top = bottom + GAP * 2);
				b.x = x;
				b.y = top;
				x += b.w + GAP;
				width = Math.max(width, x - GAP);
				bottom = Math.max(bottom, top + b.h);
			}
			note.x = 0;
			note.maxW = Math.max(width, 4480);
			y = bottom + BREAK;
		}
		// Order follows the layout so the canvas and the local index read the same way.
		const placed = notes.flatMap(([id]) => members.get(id));
		const rest = canvas.order.filter((f: string) => !placed.includes(f));
		canvas.order = page === "page-1" ? [...placed, ...rest] : [...rest, ...placed];
	}
	writeFileSync(indexFile, JSON.stringify(canvas, null, 2) + "\n");
	writeIndex();
}

function writeIndex() {
	const page = resolve(ds, "boards/index.html");
	const html = readFileSync(page, "utf8");
	const head = html.slice(0, html.indexOf("<header>"));
	const foot = html.slice(html.indexOf("</main>") + "</main>".length);
	const notes = Object.values(canvas.notes)
		.filter((n: any) => pageOf(n) === "page-1")
		.sort((a: any, b: any) => a.y - b.y) as any[];
	const current = canvas.order.filter((f: string) => pageOf(canvas.boards[f]) === "page-1");
	const sections = notes.map((note, i) => {
		const next = notes[i + 1]?.y ?? Infinity;
		const cards = current
			.filter((f: string) => canvas.boards[f].y > note.y && canvas.boards[f].y < next)
			.map((f: string) => {
				const b = canvas.boards[f];
				return `<a class="b" href="${f}"><span class="f" style="aspect-ratio:${b.w}/${b.h}"><iframe src="${f}" loading="lazy" tabindex="-1" scrolling="no" style="width:${b.w}px;height:${b.h}px"></iframe></span><b>${b.title}</b>${b.is_interactive ? "<em>可交互</em>" : ""}</a>`;
			})
			.join("");
		return `<section><h2>${note.text}</h2><div class="g">${cards}</div></section>`;
	});
	writeFileSync(
		page,
		`${head}<header><h1>Sill · 设计画板</h1><p>${current.length} 块现行画板，与线上设计画布「现行」页相同。历史画板在 <code>design-system/history/</code>，不作设计依据。用 <code>npm run boards</code> 打开，点任一块查看原尺寸；标「可交互」的可以直接点、滑。</p></header>\n<main>${sections.join("")}</main>${foot}`,
	);
}

if (command === "retire" && args.length) retire(args);
else if (command === "layout") layout();
else throw new Error("Usage: node design-system/scripts/canvas.ts layout | retire Board ...");
