import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { cardHTML } from "../../apps/web/cards/templates.ts";
import {
	cardDate,
	cardDates,
	cardReadingTime,
	detailDate,
	detailSource,
} from "../../apps/web/data/card-source.ts";
import { Store } from "../../apps/web/data/store.ts";
import { Panels } from "../../apps/web/interactions/panels.ts";
import { Card } from "../../contracts/card.ts";

/** About six minutes at 400 Chinese characters per minute (ADR 0086). */
const sixMinutes = `Body ${"字".repeat(2396)}`;

const article: Card = {
	id: "explicit-article",
	type: "article",
	title: "Article",
	sources: [{ kind: "readwise", name: "Reader" }],
	authors: [{ name: "Writer" }],
	body: sixMinutes,
	tags: ["Tag"],
};

test("publication and system times stay distinct without aliases", () => {
	const dates = cardDates({
		publishedAt: "2026-10-01",
		created_at: "2026-10-16T01:00:00Z",
		updated_at: "2026-10-17T01:00:00Z",
	});
	assert.equal(dates.published?.text, "2026-10-01");
	assert.equal(dates.created?.datetime, "2026-10-16T01:00:00.000Z");
	assert.equal(cardDates({ published_at: "2026-10-01" }).published, null);
});

test("invalid and ambiguous content dates never become invented timestamps", () => {
	for (const value of [
		null,
		undefined,
		"",
		false,
		"2026-02-30",
		"2026-02-30T12:00:00Z",
		"2026-10-13T12:00:00",
		Infinity,
		-1,
	])
		assert.equal(cardDate(value), null, String(value));
	assert.equal(cardDate("2024-02-29")?.text, "2024-02-29");
});

test("all reading surfaces use the same calculated estimate and never show notes on the face", () => {
	Store.state = Store.fresh();
	Store.state.items[article.id] = { note: "Personal <script> & note" };
	const before = JSON.stringify(article);
	const card = new JSDOM(cardHTML(article)).window.document;
	assert.ok(card.body.textContent!.includes("Writer · 约 6 分钟阅读"));
	assert.ok(!card.body.textContent!.includes("Personal"));
	const blocks = [Panels.preview({}, article), Panels.reader({}, article)].map((html) => {
		const doc = new JSDOM(html).window.document;
		assert.equal(doc.querySelector(".preview-meta")?.textContent, "Writer · 约 6 分钟阅读");
		assert.equal(doc.querySelector(".preview-published"), null);
		assert.equal(doc.querySelectorAll(".preview-meta").length, 1);
		const note = doc.querySelector("aside.preview-note")!;
		assert.equal(note.querySelector(".preview-note-label")?.textContent, "备注");
		assert.equal(note.querySelector("p")?.textContent, "Personal <script> & note");
		assert.equal(doc.querySelector("script"), null);
		const body = doc.querySelector(".preview-body,.reader-body") as HTMLElement;
		assert.ok(body.textContent!.indexOf("Body") < body.textContent!.indexOf("Personal"));
		return Array.from(body.children)
			.filter((n) => n.id !== "reader-end")
			.map((n) => [n.tagName, n.className, n.textContent]);
	});
	assert.deepEqual(blocks[0], blocks[1]);
	assert.equal(JSON.stringify(article), before);
	assert.equal(detailSource(article), "Reader");
	assert.equal(Card.safeParse({ ...article, meta: "6min" }).success, false);
});

test("reading time counts Chinese characters and English words from the Markdown body", () => {
	assert.equal(cardReadingTime({ type: "article", body: "" }), "");
	assert.equal(cardReadingTime({ type: "article", body: "字".repeat(401) }), "约 2 分钟阅读");
	assert.equal(cardReadingTime({ type: "article", body: "word ".repeat(200) }), "约 1 分钟阅读");
	assert.equal(
		cardReadingTime({ type: "note", body: `## ${"字".repeat(400)}\n\n${"**word** ".repeat(201)}` }),
		"约 3 分钟阅读",
	);
	assert.equal(cardReadingTime({ type: "task", body: "字".repeat(4000) }), "");
});

test("date-only precision stays unchanged across device zones", () => {
	const original = process.env.TZ;
	try {
		process.env.TZ = "Asia/Shanghai";
		assert.equal(cardDate("2026-10-13T20:30:00Z")?.text, "2026-10-14 04:30 UTC+08:00");
		assert.equal(cardDate("2026-10-13")?.text, "2026-10-13");
		process.env.TZ = "America/Los_Angeles";
		assert.equal(cardDate("2026-10-13T01:30:00Z")?.text, "2026-10-12 18:30 UTC-07:00");
	} finally {
		if (original === undefined) delete process.env.TZ;
		else process.env.TZ = original;
	}
});

test("specialized mail and file views show reading time; podcasts retain personal notes", () => {
	Store.state = Store.fresh();
	for (const card of [
		{
			id: "estimated-mail",
			type: "mail",
			title: "Mail",
			body: sixMinutes,
		},
		{
			id: "estimated-file",
			type: "file",
			title: "File",
			files: [{ name: "report.pdf" }],
			body: sixMinutes,
		},
	]) {
		assert.match(
			new JSDOM(Panels.preview({}, card)).window.document.body.textContent!,
			/约 6 分钟阅读/,
		);
		assert.match(new JSDOM(cardHTML(card)).window.document.body.textContent!, /约 6 分钟阅读/);
	}
	const podcast: Card = {
		id: "noted-podcast",
		type: "media",
		media: "podcast",
		title: "Podcast",
		body: "",
	};
	Store.state.items[podcast.id] = { note: "Personal podcast note" };
	const doc = new JSDOM(Panels.preview({}, podcast)).window.document;
	assert.equal(doc.querySelector("aside.preview-note p")?.textContent, "Personal podcast note");
	assert.equal(doc.querySelector(".preview-note-label")?.textContent, "备注");
});

test("mail identity never borrows sources", () => {
	Store.state = Store.fresh();
	for (const sender of [undefined, "", "Real sender"]) {
		const card = Card.parse({
			id: "mail-identity",
			type: "mail",
			title: "Mail",
			sources: [{ name: "InboxSource", kind: "mail" }],
			...(sender ? { authors: [{ name: sender }] } : {}),
		});
		for (const html of [cardHTML(card), Panels.preview({}, card)]) {
			const dom = new JSDOM(html);
			try {
				const doc = dom.window.document;
				assert.equal(
					doc.querySelector(".sender b,.preview-sender b")?.textContent,
					sender || undefined,
				);
				assert.ok(!doc.body.textContent!.includes("发给你"));
				assert.equal(doc.querySelector(":is(.sender, .preview-sender) .source-mark"), null);
				if (!sender) assert.match(doc.body.textContent!, /InboxSource/);
			} finally {
				dom.window.close();
			}
		}
	}
	const noIdentity = new JSDOM(
		Panels.preview({}, { id: "mail-empty", type: "mail", title: "Mail" }),
	);
	assert.equal(noIdentity.window.document.querySelector(".preview-sender"), null);
	assert.ok(!noIdentity.window.document.body.textContent!.includes("本地"));
	noIdentity.window.close();
});

test("podcast duration stays unknown when absent and never derives playback from reading progress", () => {
	Store.state = Store.fresh();
	for (const seconds of [undefined, 0, 240]) {
		const card = Card.parse({
			id: "duration-podcast",
			type: "media",
			media: "podcast",
			title: "Podcast",
			body: "Actual podcast notes",
			...(seconds === undefined ? {} : { duration: seconds }),
		});
		Store.state.items[card.id] = { progress: 0.75, note: "Personal note" };
		const expected = seconds === undefined ? "时长未知" : seconds === 0 ? "0:00" : "4:00";
		for (const html of [cardHTML(card), Panels.preview({}, card)]) {
			const dom = new JSDOM(html);
			try {
				const doc = dom.window.document;
				if (doc.querySelector(".mini-player")) {
					assert.equal(doc.querySelector(".mini-player .num")?.textContent, expected);
					assert.equal(doc.querySelector(".media-card-progress")?.getAttribute("value"), "0");
				} else {
					assert.equal(
						doc.querySelector(".podcast-listening")?.textContent,
						`收听 0:00 / ${expected}`,
					);
					assert.equal(
						doc.querySelector("audio, .audio-player, [role=tablist], [data-action=reader]"),
						null,
					);
				}
				assert.equal(
					doc.querySelector(".mini-play,.mini-player .bar,.player-bar,#podcast-played"),
					null,
				);
				if (doc.querySelector(".podcast-detail")) {
					assert.match(doc.body.textContent!, /Actual podcast notes/);
					assert.equal(doc.querySelector("aside.preview-note p")?.textContent, "Personal note");
				}
			} finally {
				dom.window.close();
			}
		}
	}
});

test("valid media without body opens and prose never becomes media chapters or playback steps", () => {
	Store.state = Store.fresh();
	for (const body of [undefined, "", "First paragraph\n\nSecond paragraph"]) {
		const card = Card.parse({
			id: "video-facts",
			type: "media",
			media: "video",
			title: "Video",
			images: ["coast"],
			duration: 125,
			url: "https://example.com/video",
			...(body === undefined ? {} : { body }),
		});
		Store.state.items[card.id] = { progress: 0.25, note: "Video note" };
		Store.item(card.id);
		const before = JSON.stringify(Store.state);
		const dom = new JSDOM(Panels.preview({}, card));
		try {
			const doc = dom.window.document;
			assert.equal(doc.querySelector("#modal-title")?.textContent, "Video");
			assert.equal(
				doc.querySelector(".media-step,.media-slide,.media-controls,[data-action='media-play']"),
				null,
			);
			assert.equal(doc.querySelector(".preview-published"), null);
			assert.match(cardHTML(card), /剩 3 分钟/);
			assert.ok(doc.querySelector(".unavailable-video button[disabled]"));
			assert.deepEqual(
				[...doc.querySelectorAll(".preview-full p")].map((p) => p.textContent),
				body ? body.split("\n\n") : [],
			);
			assert.ok(doc.querySelector(".unavailable-video img"));
			assert.ok(doc.querySelector("[data-action='external']"));
			assert.equal(doc.querySelector("aside.preview-note p")?.textContent, "Video note");
			assert.equal(JSON.stringify(Store.state), before);
		} finally {
			dom.window.close();
		}
	}
});

test("article and photo heads name their day like the preview head", () => {
	const story = Card.parse({ ...article, id: "dated-article", publishedAt: "2024-03-05" });
	const photo = Card.parse({
		id: "dated-photo",
		type: "photo",
		title: "Trip",
		images: ["coast"],
		location: "Coast",
		publishedAt: "2024-03-06",
	});
	const head = (html: string) => {
		const dom = new JSDOM(html);
		try {
			return dom.window.document.querySelector(".card-src, .preview-meta > span:last-child")
				?.textContent;
		} finally {
			dom.window.close();
		}
	};
	const feed = head(cardHTML(story));
	assert.equal(feed, "Writer · 2024/3/5 · 约 6 分钟阅读");
	assert.equal(head(Panels.preview({}, story)), feed);
	assert.equal(head(cardHTML(photo)), "Coast · 2024/3/6");
});

test("content dates stay identical on card faces, previews and readers", (t) => {
	t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 9, 22, 12) });
	Store.state = Store.fresh();
	for (const [publishedAt, label] of [
		["2026-10-22", "今天"],
		["2026-10-21", "昨天"],
		["2026-10-18", "10/18"],
		["2025-10-18", "2025/10/18"],
		["2026-10-23", "10/23"],
	]) {
		for (const fields of [
			{ type: "article" },
			{ type: "note" },
			{ type: "note", form: "quote" as const },
			{ type: "media", media: "video", images: ["coast"] },
			{ type: "media", media: "podcast" },
			{ type: "suggestion" },
		]) {
			const card = Card.parse({
				...fields,
				id: "dated-content",
				title: "Title",
				publishedAt,
				authors: [{ name: "Source" }],
				body: "",
			});
			for (const html of [cardHTML(card), Panels.preview({}, card), Panels.reader({}, card)]) {
				const dom = new JSDOM(html);
				try {
					if (dom.window.document.querySelector(".podcast-detail")) {
						assert.equal(dom.window.document.querySelector(".podcast-date")?.textContent, label);
						assert.equal(
							dom.window.document.querySelector(".podcast-byline")?.textContent,
							"Source",
						);
						continue;
					}
					assert.equal(
						dom.window.document.querySelector(".card-src, .preview-meta")?.textContent?.trim(),
						`Source · ${label}`,
						`${fields.type}/${fields.media || ""}: ${publishedAt}`,
					);
				} finally {
					dom.window.close();
				}
			}
		}
		const photo = Card.parse({
			id: "dated-photo",
			type: "photo",
			title: "Photo",
			images: ["coast"],
			publishedAt,
		});
		const dom = new JSDOM(Panels.lightbox(photo));
		try {
			assert.equal(
				dom.window.document.querySelector(".lightbox-caption small")?.textContent,
				label,
			);
		} finally {
			dom.window.close();
		}
	}
	const sentAt = new Date(2026, 9, 22, 9, 30).toISOString();
	const mail = Card.parse({
		id: "dated-mail",
		type: "mail",
		title: "Mail",
		authors: [{ name: "Sender" }],
		publishedAt: sentAt,
	});
	for (const html of [cardHTML(mail), Panels.preview({}, mail), Panels.reader({}, mail)]) {
		const dom = new JSDOM(html);
		try {
			assert.match(dom.window.document.body.textContent!, /今天 09:30/);
		} finally {
			dom.window.close();
		}
	}
	assert.equal(detailDate("2026-10-22", true), "今天");
});

test("PR has its own snapshot layout and never invents missing statistics", (t) => {
	t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-22T12:00:00+08:00") });
	Store.state = Store.fresh();
	const card = Card.parse({
		id: "pr-layout",
		type: "pr",
		title: "Review snapshot",
		summary: "Small change",
		sources: [{ name: "GitHub", kind: "github" }],
		url: "https://github.com/owner/repo/pull/4",
		pullRequest: {
			repository: "owner/repo",
			number: 4,
			state: "open",
			observedAt: "2026-10-22T10:00:00+08:00",
			headBranch: "fix",
			baseBranch: "main",
			reviewRequested: true,
			reviewers: [{ login: "reviewer", decision: "approved" }],
			checks: [{ name: "build", status: "completed", conclusion: "success" }],
		},
	});
	const face = new JSDOM(cardHTML(card)).window.document;
	assert.match(face.body.textContent!, /owner\/repo #4/);
	assert.match(face.body.textContent!, /待你审阅/);
	assert.match(face.body.textContent!, /fix → main/);
	assert.match(face.body.textContent!, /审阅/);
	// Unknown line counts leave no slot, never a made-up +0 −0.
	assert.equal(face.querySelector(".pr-stats"), null);
	// The card shows checks as a tick and a count only; the label lives in the tooltip.
	assert.equal(face.querySelector(".pr-check-count")?.textContent, "1/1");
	const detail = new JSDOM(Panels.preview({}, card)).window.document;
	assert.match(detail.body.textContent!, /记录于.*今天/);
	assert.match(detail.body.textContent!, /已通过/);
	assert.match(detail.body.textContent!, /build/);
	assert.equal(detail.querySelector('[data-action="reader"]'), null);
});

test("PR detail opens its rows with the state and leaves rows without data out", () => {
	Store.state = Store.fresh();
	const sparse = Card.parse({
		id: "pr-sparse",
		type: "pr",
		title: "Sparse snapshot",
		sources: [{ name: "GitHub", kind: "github" }],
		tags: ["work"],
		pullRequest: {
			repository: "owner/repo",
			number: 5,
			state: "open",
			observedAt: "2026-10-22T10:00:00+08:00",
			changedFiles: 3,
		},
	});
	const detail = new JSDOM(Panels.preview({}, sparse)).window.document;
	const header = detail.querySelector(".pr-detail > .detail-header")!;
	assert.equal(header.querySelector(".pr-state, .pr-status"), null);
	const rows = [...detail.querySelectorAll(".pr-detail > .detail-rows > .detail-row")];
	assert.match(rows[0].textContent!, /^待合并$/);
	assert.equal(detail.querySelector(".pr-check-details"), null);
	assert.doesNotMatch(detail.body.textContent!, /0\/0|—/);
	// Without line counts the file count is the row's main text, not a trailing note.
	const files = rows.find((row) => /个文件/.test(row.textContent!))!;
	assert.equal(files.querySelector(":scope > .row-icon + span")?.textContent, "3 个文件");
	assert.ok(rows.every((row) => row.firstElementChild?.classList.contains("row-icon")));
});

test("mail files render links and an empty list shows no file rows", () => {
	Store.state = Store.fresh();
	const card = Card.parse({
		id: "mail-files",
		type: "mail",
		title: "Attachments",
		body: "Text",
		files: [{ name: "first.pdf", url: "https://example.com/first.pdf" }, { name: "second.txt" }],
	});
	const detail = new JSDOM(Panels.preview({}, card)).window.document;
	assert.equal(detail.querySelector(".detail-row a"), null);
	assert.ok(detail.querySelector('a.detail-row[href="https://example.com/first.pdf"]'));
	assert.match(detail.body.textContent!, /second.txt/);
	const face = new JSDOM(cardHTML(card)).window.document;
	assert.match(face.body.textContent!, /first.pdf/);
	assert.doesNotMatch(face.body.textContent!, /second.txt/);
	const cleared = new JSDOM(Panels.preview({}, { ...card, files: [] })).window.document;
	assert.equal(cleared.querySelector(".detail-row"), null);
});

test("PR card face starts its counts at the left when the PR has no branch", () => {
	Store.state = Store.fresh();
	const card = Card.parse({
		id: "pr-no-branch",
		type: "pr",
		title: "Fold the ring",
		sources: [{ name: "GitHub", kind: "github" }],
		pullRequest: {
			repository: "owner/repo",
			number: 7,
			state: "open",
			observedAt: "2026-10-22T10:00:00+08:00",
			changedFiles: 3,
		},
	});
	const face = new JSDOM(cardHTML(card)).window.document;
	// An empty line-count slot once pushed a lone file count to the right edge.
	const row = face.querySelector(".pr-branch-row")!;
	assert.equal(row.querySelector(".pr-branches, .pr-stats"), null);
	assert.equal(row.textContent, "3 个文件");
	const bare = new JSDOM(
		cardHTML({ ...card, pullRequest: { ...card.pullRequest!, changedFiles: undefined } }),
	).window.document;
	assert.equal(bare.querySelector(".pr-branch-row"), null);
});
