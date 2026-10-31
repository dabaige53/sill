import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createHostActions } from "../../apps/web/cloud-bridge.ts";
import { SeedCards } from "../../apps/web/data/cards.ts";
import { Store } from "../../apps/web/data/store.ts";
import { Panels } from "../../apps/web/interactions/panels.ts";
import {
	type AgentCard,
	AgentHandoff,
	type AgentScope,
	agentKey,
	agentPayload,
	cardLink,
	openCardLink,
} from "../../apps/web/services/agent-handoff.ts";

const scope: AgentScope = { kind: "cloud", owner: "owner-a" };

test("article source links are native links with full query and fragment; missing or unsafe URLs stay disabled", () => {
	const url = "https://example.com/article?view=full&lang=zh#section";
	const card = { id: "source-link", type: "article", title: "Article", body: "Body", url };
	const app = { agentAction: () => "" };
	Store.state = Store.fresh();
	const document = new JSDOM(Panels.preview(app, card)).window.document;
	const link = document.querySelector<HTMLAnchorElement>(".float-bar a.is-own");
	assert.equal(link?.getAttribute("href"), url);
	assert.equal(link?.target, "_blank");
	assert.equal(link?.rel, "noopener noreferrer");
	assert.equal(link?.dataset.action, "external");
	for (const value of [undefined, "", "javascript:alert(1)", "not a URL"]) {
		assert.equal(cardLink(value), null);
		const unavailable = new JSDOM(Panels.preview(app, { ...card, url: value })).window.document;
		assert.ok(unavailable.querySelector('[data-action="external"][disabled]'));
		assert.equal(unavailable.querySelector(".float-bar a.is-own"), null);
	}
});
const card = {
	id: "card-a",
	revision: 7,
	type: "note",
	title: "讨论卡片",
	summary: "需要核对的结论",
};
const payload = agentPayload(card, scope);
const key = agentKey(card.id, scope);

function fixture() {
	const messages: any[] = [];
	const contexts: any[] = [];
	const links: string[] = [];
	const flags = {
		message: true,
		context: true,
		reject: false,
		loseReceipt: false,
		rejectLink: false,
	};
	const bridge = {
		getHostCapabilities: () => ({
			...(flags.message ? { message: { text: {} } } : {}),
			...(flags.context
				? { experimental: { "openai/modelContext": {} }, updateModelContext: { text: {} } }
				: {}),
			openLinks: {},
		}),
		async updateModelContext(value) {
			contexts.push(value);
			if (flags.loseReceipt) throw new Error("Synthetic receipt loss");
			if (flags.reject) throw new Error("Rejected context");
			return {};
		},
		async sendMessage(value) {
			messages.push(value);
			if (flags.loseReceipt) throw new Error("Synthetic receipt loss");
			return { isError: flags.reject };
		},
		async openLink({ url }) {
			links.push(url);
			return { isError: flags.rejectLink };
		},
	};
	return {
		bridge,
		actions: createHostActions(bridge, Promise.resolve()),
		flags,
		messages,
		contexts,
		links,
	};
}

test("attachments include full content without personal state or unknown fields", () => {
	const prepared = agentPayload(
		{
			...card,
			body: "Full body",
			summary: "长".repeat(1000),
			state: { note: "private" },
			unknown: "secret",
		} as AgentCard,
		scope,
	);
	assert.equal(prepared.reference.card.body, "Full body");
	assert.equal(prepared.reference.card.summary.length, 1000);
	assert.doesNotMatch(prepared.text, /private|secret/);
});

test("attachments accumulate without sending and follow host removal", async () => {
	const f = fixture();
	await Promise.all([
		f.actions.discuss(payload, () => true),
		f.actions.discuss(payload, () => true),
	]);
	assert.equal(f.messages.length, 0);
	assert.equal(f.contexts[1].content.length, 2);
	f.actions.syncContext({ "openai/modelContext": null });
	await f.actions.discuss(payload, () => true);
	assert.equal(f.contexts[2].content.length, 1);
});

test("unsupported hosts, rejected updates and changed accounts never send", async () => {
	const f = fixture();
	f.flags.context = false;
	await assert.rejects(
		f.actions.discuss(payload, () => true),
		{ code: "host_unavailable" },
	);
	f.flags.context = true;
	await assert.rejects(
		f.actions.discuss(payload, () => false),
		{ code: "account_changed" },
	);
	f.flags.reject = true;
	await assert.rejects(
		f.actions.discuss(payload, () => true),
		{ code: "message_unknown" },
	);
	assert.equal(f.messages.length, 0);
});

test("host navigation never falls back to blocked popups, and browser ambiguity is not an acknowledged open", async () => {
	const f = fixture();
	let popups = 0;
	const popup = () => {
		popups++;
		return null;
	};
	assert.equal(await openCardLink("https://example.com/card", f.actions, popup), true);
	assert.deepEqual(f.links, ["https://example.com/card"]);
	f.flags.rejectLink = true;
	await assert.rejects(openCardLink("https://example.com/card", f.actions, popup), {
		code: "link_rejected",
	});
	await assert.rejects(openCardLink("https://example.com/card", {}, popup), {
		code: "link_unavailable",
	});
	await assert.rejects(openCardLink("javascript:alert(1)", f.actions, popup), {
		code: "invalid_link",
	});
	assert.equal(popups, 0);
	assert.equal(await openCardLink("https://example.com/card", undefined, popup), false);
	assert.equal(popups, 1);
});

test("each card detail has one handoff in its content footer, including digests, readers and photo pages", () => {
	Store.state = Store.fresh();
	const app = {
		agentAction: (card: AgentCard) =>
			`<button type="button" data-action="agent-handoff" data-id="${card.id}">Discuss</button>`,
	};
	const cards = [
		...SeedCards,
		{ id: "future", type: "future", title: "Future card", body: "Future detail" },
	];
	for (const card of cards) {
		const html = card.type === "photo" ? Panels.lightbox(card, 0, app) : Panels.preview(app, card);
		const dom = new JSDOM(html);
		try {
			const document = dom.window.document;
			assert.equal(document.querySelectorAll('[data-action="agent-handoff"]').length, 1, card.type);
			assert.equal(
				document.querySelectorAll('.preview-foot [data-action="agent-handoff"]').length,
				1,
				card.type,
			);
			assert.equal(document.querySelectorAll(".preview-foot .preview-foot").length, 0, card.type);
			// Shared verbs, then at most three of the card's own (ADR 0037).
			assert.ok(
				document.querySelectorAll(".float-bar .icon-button:not(.is-own)").length <= 3,
				card.type,
			);
			assert.ok(document.querySelectorAll(".float-bar .icon-button.is-own").length <= 3, card.type);
		} finally {
			dom.window.close();
		}
	}
	const digest = {
		id: "digest-detail",
		type: "digest",
		title: "Review",
		summary: "Actual summary",
		body: "1. Actual point\n\n## Detail\n\nFull **detail**",
	};
	const detail = new JSDOM(Panels.preview(app, digest));
	try {
		const doc = detail.window.document;
		assert.equal(doc.body.textContent.includes(digest.summary), false);
		assert.equal(doc.querySelector(".preview-full ol li").textContent, "Actual point");
		assert.equal(doc.querySelector(".preview-full h2").textContent, "Detail");
		assert.equal(doc.querySelector(".preview-full strong").textContent, "detail");
		assert.equal(detail.window.document.querySelector(".stats-trio"), null);
	} finally {
		detail.window.close();
	}
	const reader = new JSDOM(
		Panels.reader(
			app,
			cards.find((card) => card.type === "article"),
		),
	);
	try {
		assert.equal(
			reader.window.document.querySelectorAll(
				'.reader-body .preview-foot [data-action="agent-handoff"]',
			).length,
			1,
		);
	} finally {
		reader.window.close();
	}
	const photo = cards.find((card) => card.type === "photo");
	for (const index of [0, 1, 2]) {
		const page = new JSDOM(Panels.lightbox(photo, index, app));
		try {
			assert.equal(
				page.window.document.querySelectorAll('[data-action="agent-handoff"]').length,
				1,
			);
			assert.equal(
				page.window.document.querySelector('[data-action="agent-handoff"]').getAttribute("data-id"),
				photo.id,
			);
		} finally {
			page.window.close();
		}
	}
});
