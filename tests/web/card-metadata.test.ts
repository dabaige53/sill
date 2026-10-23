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

const article: Card = {
	id: "explicit-article",
	type: "article",
	title: "Article",
	sources: [{ kind: "readwise", name: "Reader" }],
	authors: [{ name: "Writer" }],
	publisher: { name: "Publisher" },
	body: "Body",
	bodyCoverage: "full",
	readingEstimate: { seconds: 360, origin: "provided", scope: "full" },
	tags: ["Tag"],
};

test("publication, source save and system times stay distinct without aliases", () => {
	const dates = cardDates({
		publishedAt: "2026-10-01",
		savedAt: "2026-10-13",
		created_at: "2026-10-16T01:00:00Z",
		updated_at: "2026-10-17T01:00:00Z",
	});
	assert.equal(dates.published?.text, "2026-10-01");
	assert.equal(dates.saved?.text, "2026-10-13");
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

test("all reading surfaces use the same explicit estimate and never infer notes or legacy metadata", () => {
	Store.state = Store.fresh();
	Store.state.items[article.id] = { note: "Personal <script> & note" };
	const before = JSON.stringify(article);
	const card = new JSDOM(cardHTML(article)).window.document;
	assert.ok(card.body.textContent!.includes("Publisher · Writer · 约 6 分钟阅读"));
	assert.ok(!card.body.textContent!.includes("Personal"));
	const blocks = [Panels.preview({}, article), Panels.reader({}, article)].map((html) => {
		const doc = new JSDOM(html).window.document;
		assert.equal(
			doc.querySelector(".preview-meta")?.textContent,
			"Publisher · Writer · 约 6 分钟阅读",
		);
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

test("scope, missing estimates and explicit clears keep their distinct meaning", () => {
	assert.equal(cardReadingTime({ ...article, readingEstimate: null }), "");
	assert.equal(cardReadingTime({ readingEstimate: undefined }), "");
	assert.equal(
		cardReadingTime({
			...article,
			readingEstimate: { seconds: 61, origin: "provided", scope: "available" },
		}),
		"当前内容约 2 分钟阅读",
	);
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

test("specialized mail and file views retain estimates; podcasts retain personal notes", () => {
	Store.state = Store.fresh();
	for (const card of [
		{
			id: "estimated-mail",
			type: "mail",
			title: "Mail",
			body: "Body",
			readingEstimate: { seconds: 360, origin: "provided" as const, scope: "full" as const },
		},
		{
			id: "estimated-file",
			type: "file",
			title: "File",
			files: [{ name: "report.pdf" }],
			readingEstimate: { seconds: 360, origin: "provided" as const, scope: "full" as const },
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

test("mail identity never borrows sources or assumes the current user is a recipient", () => {
	Store.state = Store.fresh();
	for (const sender of [undefined, "", "Real sender"]) {
		const card = Card.parse({
			id: "mail-identity",
			type: "mail",
			title: "Mail",
			sources: [{ name: "InboxSource", kind: "mail" }],
			...(sender === undefined ? {} : { sender }),
			recipients: ["Actual recipient"],
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
				if (!sender) assert.match(doc.body.textContent!, /InboxSource/);
				if (doc.querySelector(".preview-published"))
					assert.match(doc.body.textContent!, /收件人 · Actual recipient/);
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
					assert.equal(doc.querySelector(".player-times span")?.textContent, "0:00");
					assert.ok(doc.querySelector(".audio-player input[disabled]"));
				}
				assert.equal(
					doc.querySelector(".mini-play,.mini-player .bar,.player-bar,#podcast-played"),
					null,
				);
				if (doc.querySelector(".player")) {
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
			image: "coast",
			chapterCount: 8,
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
		image: "coast",
		location: "Coast",
		takenAt: "2024-03-06",
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
	assert.equal(feed, "Publisher · Writer · 2024/3/5 · 约 6 分钟阅读");
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
			{ type: "note", variant: "quote" },
			{ type: "media", media: "video", image: "coast" },
			{ type: "media", media: "podcast" },
			{ type: "suggestion" },
		]) {
			const card = Card.parse({
				...fields,
				id: "dated-content",
				title: "Title",
				publishedAt,
				publisher: { name: "Source" },
				body: "Body",
			});
			for (const html of [cardHTML(card), Panels.preview({}, card), Panels.reader({}, card)]) {
				const dom = new JSDOM(html);
				try {
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
			image: "coast",
			takenAt: publishedAt,
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
		sender: "Sender",
		sentAt,
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
	assert.doesNotMatch(face.querySelector(".pr-stats")!.textContent!, /[+−]0/);
	const detail = new JSDOM(Panels.preview({}, card)).window.document;
	assert.match(detail.body.textContent!, /记录于.*今天/);
	assert.match(detail.body.textContent!, /已通过/);
	assert.match(detail.body.textContent!, /build/);
	assert.equal(detail.querySelector('[data-action="reader"]'), null);
});

test("mail multiple attachments render links and explicit empty clears the legacy label", () => {
	Store.state = Store.fresh();
	const card = Card.parse({
		id: "mail-files",
		type: "mail",
		title: "Attachments",
		body: "Text",
		attachment: "old.pdf",
		attachments: [
			{ name: "first.pdf", url: "https://example.com/first.pdf" },
			{ name: "second.txt" },
		],
	});
	const detail = new JSDOM(Panels.preview({}, card)).window.document;
	assert.equal(detail.querySelector(".detail-row a"), null);
	assert.ok(detail.querySelector('a.detail-row[href="https://example.com/first.pdf"]'));
	assert.match(detail.body.textContent!, /second.txt/);
	assert.doesNotMatch(detail.body.textContent!, /old.pdf/);
	const cleared = new JSDOM(Panels.preview({}, { ...card, attachments: [] })).window.document;
	assert.doesNotMatch(cleared.body.textContent!, /old.pdf/);
	assert.equal(cleared.querySelector(".detail-row"), null);
});
