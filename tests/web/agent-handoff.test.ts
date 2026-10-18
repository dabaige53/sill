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
	openCardLink,
} from "../../apps/web/services/agent-handoff.ts";

const scope: AgentScope = { kind: "cloud", owner: "owner-a" };
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
			...(flags.context ? { updateModelContext: { text: {} } } : {}),
			openLinks: {},
		}),
		async updateModelContext(value) {
			contexts.push(value);
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

test("handoff includes only a bounded current-card reference and keeps local and cloud identities separate", () => {
	const large = {
		...card,
		title: "标".repeat(1000),
		summary: "要点".repeat(3000),
		body: ["Private full body must stay in Sill"],
		state: { note: "Private annotation", tags: ["Private tag"] },
		owner_id: "untrusted-card-owner",
		unknown: { secret: "never include this field" },
	};
	const prepared = agentPayload(large, scope);
	assert.equal(prepared.reference.expected_owner, "owner-a");
	assert.equal(prepared.reference.card.revision, 7);
	assert.equal(Array.from(prepared.reference.card.title).length, 200);
	assert.equal(Array.from(prepared.reference.card.summary).length, 240);
	assert.ok(prepared.text.length < 1300);
	assert.doesNotMatch(prepared.text, /Private|secret|untrusted-card-owner/);
	const local = agentPayload(card, { kind: "local" });
	assert.equal(local.reference.workspace, "local");
	assert.equal("expected_owner" in local.reference, false);
	assert.match(local.text, /不是云端卡片/);
	assert.notEqual(agentKey(card.id, scope), agentKey(card.id, { kind: "cloud", owner: "owner-b" }));
});

test("only an explicit handoff sends once, with context followed by a self-contained user message", async () => {
	const f = fixture();
	const handoff = new AgentHandoff();
	let release: () => void;
	const ready = new Promise<void>((resolve) => {
		release = resolve;
	});
	const run = () =>
		handoff.run(
			key,
			async () => {
				await ready;
				return payload;
			},
			f.actions,
			() => true,
		);
	assert.equal(handoff.state(key, f.actions), "discuss");
	assert.equal(f.messages.length, 0);
	const first = run();
	assert.equal(handoff.state(key, f.actions), "sending");
	await run();
	release();
	assert.equal(await first, "sent");
	assert.equal(f.messages.length, 1);
	assert.equal(f.contexts.length, 1);
	assert.equal(f.messages[0].role, "user");
	assert.match(f.messages[0].content[0].text, /card-a/);
	assert.match(f.messages[0].content[0].text, /owner-a/);
	assert.equal(handoff.state(key, f.actions), "sent");
	await run();
	assert.equal(f.messages.length, 1);
	handoff.beginDetail(key);
	assert.equal(handoff.state(key, f.actions), "discuss");
	assert.equal(f.messages.length, 1, "reopening a card never sends by itself");
	assert.equal(await run(), "sent");
	assert.equal(
		f.messages.length,
		2,
		"an explicit discussion in a new detail session can send again",
	);
});

test("a lost message receipt is not resent; later actions stay disabled", async () => {
	const f = fixture();
	f.flags.loseReceipt = true;
	const handoff = new AgentHandoff();
	const run = () =>
		handoff.run(
			key,
			async () => payload,
			f.actions,
			() => true,
		);
	await assert.rejects(run(), { code: "message_unknown" });
	assert.equal(f.messages.length, 1);
	assert.equal(handoff.state(key, f.actions), "unknown");
	handoff.beginDetail(key);
	assert.equal(
		handoff.state(key, f.actions),
		"unknown",
		"reopening never retries an uncertain delivery",
	);
	assert.equal(await run(), undefined);
	assert.equal(f.messages.length, 1);
});

test("a definite host rejection stays recoverable and an unsupported host offers no handoff", async () => {
	const f = fixture();
	f.flags.reject = true;
	const handoff = new AgentHandoff();
	const run = () =>
		handoff.run(
			key,
			async () => payload,
			f.actions,
			() => true,
		);
	await assert.rejects(run(), { code: "message_rejected" });
	assert.equal(f.messages.length, 1);
	assert.equal(handoff.state(key, f.actions), "discuss");
	f.flags.message = false;
	assert.equal(handoff.state(key, f.actions), "unavailable");
	assert.equal(await run(), undefined);
	assert.equal(f.messages.length, 1);
});

test("changing accounts during preparation or context update prevents message delivery", async () => {
	const f = fixture();
	const handoff = new AgentHandoff();
	let current = true;
	await assert.rejects(
		handoff.run(
			key,
			async () => {
				current = false;
				return payload;
			},
			f.actions,
			() => current,
		),
		{ code: "account_changed" },
	);
	assert.equal(f.contexts.length, 0);
	assert.equal(f.messages.length, 0);
	current = true;
	f.bridge.updateModelContext = async () => {
		current = false;
		return {};
	};
	await assert.rejects(
		f.actions.discuss(payload, () => current),
		{ code: "account_changed" },
	);
	assert.equal(f.messages.length, 0);
});

test("optional model context is not required; standalone pages never prepare or send a handoff", async () => {
	const f = fixture();
	f.flags.context = false;
	await f.actions.discuss(payload, () => true);
	assert.equal(f.contexts.length, 0);
	assert.equal(f.messages[0].content[0].text, payload.text);
	const handoff = new AgentHandoff();
	assert.equal(handoff.state(key), "unavailable");
	assert.equal(
		await handoff.run(
			key,
			async () => {
				assert.fail("must not read a card without a host");
			},
			undefined,
			() => true,
		),
		undefined,
	);
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
		{ id: "future", type: "future", title: "Future card", body: ["Future detail"] },
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
			assert.ok(document.querySelectorAll(".float-bar button:not(.is-own)").length <= 3, card.type);
			assert.ok(document.querySelectorAll(".float-bar button.is-own").length <= 3, card.type);
		} finally {
			dom.window.close();
		}
	}
	const digest = {
		id: "digest-detail",
		type: "digest",
		title: "Review",
		summary: "Actual summary",
		points: ["Actual point"],
		body: ["Full detail"],
	};
	const detail = new JSDOM(Panels.preview(app, digest));
	try {
		assert.equal(detail.window.document.querySelector(".preview-lead").textContent, digest.summary);
		assert.equal(
			detail.window.document.querySelector(".key-points li span").textContent,
			digest.points[0],
		);
		assert.equal(detail.window.document.querySelector(".preview-full").textContent, digest.body[0]);
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
