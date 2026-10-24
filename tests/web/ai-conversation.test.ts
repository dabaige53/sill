/** AI conversation rules: heights, statuses, history groups, the phone page and the desktop box. */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { buildSync } from "esbuild";
import { JSDOM } from "jsdom";
import {
	type AISession,
	nextHeight,
	othersRunning,
	sessionGroups,
	sessionStatus,
} from "../../apps/web/data/ai-conversation.ts";
import { installReactBrowserAPIs } from "./react-browser-fixture.ts";

const now = new Date(2026, 9, 23, 12, 0).getTime();
const session = (over: Partial<AISession>): AISession => ({
	id: "s",
	title: "Session",
	updatedAt: now,
	running: false,
	messages: [],
	...over,
});
const withResult = (state: "written" | "failed" | "unknown") =>
	session({
		messages: [
			{
				id: "m",
				role: "ai",
				text: "done",
				results: [{ cardId: "c", title: "Card", type: "task", change: "x", state }],
			},
		],
	});

test("without a session the box never grows", () => {
	for (const event of ["open", "full", "shrink", "escape"] as const)
		assert.equal(nextHeight("line", event, false), "line");
});

test("heights follow the handbook table", () => {
	assert.equal(nextHeight("line", "open", true), "panel");
	assert.equal(nextHeight("panel", "full", true), "full");
	assert.equal(nextHeight("full", "shrink", true), "panel");
	assert.equal(nextHeight("full", "escape", true), "panel", "Esc steps back one level");
	assert.equal(nextHeight("panel", "escape", true), "line");
	assert.equal(nextHeight("panel", "collapse", true), "line");
	for (const event of ["outside", "detail", "select"] as const) {
		assert.equal(nextHeight("panel", event, true), "line");
		assert.equal(nextHeight("full", event, true), "full", `${event} leaves the full view`);
	}
});

test("only a failed or unknown write asks for attention; a receipt is needed for a check", () => {
	assert.equal(sessionStatus(null), "idle");
	assert.equal(sessionStatus(session({ running: true })), "running");
	assert.equal(sessionStatus(session({ unseen: true })), "unseen");
	assert.equal(sessionStatus(withResult("written")), "idle");
	assert.equal(sessionStatus(withResult("failed")), "attention");
	assert.equal(sessionStatus({ ...withResult("unknown"), running: true }), "attention");
});

test("the session list puts running first, then history by day, and drops empty groups", () => {
	const day = 86400000;
	const list = [
		session({ id: "old", updatedAt: now - 5 * day }),
		session({ id: "run", running: true, updatedAt: now - 3 * day }),
		session({ id: "today", updatedAt: now - 3600000 }),
		session({ id: "yesterday", updatedAt: now - day }),
	];
	const groups = sessionGroups(list, now);
	assert.deepEqual(
		groups.map((g) => [g.key, g.sessions.map((s) => s.id)]),
		[
			["running", ["run"]],
			["today", ["today"]],
			["yesterday", ["yesterday"]],
			["earlier", ["old"]],
		],
	);
	assert.deepEqual(
		sessionGroups([session({ id: "a" })], now).map((g) => g.key),
		["today"],
	);
	assert.equal(othersRunning(list, "run"), 0);
	assert.equal(othersRunning(list, "today"), 1);
});

const bundle = buildSync({
	stdin: {
		contents:
			"export {PanelViews} from './apps/web/interactions/panels-components.tsx'; export {Panels} from './apps/web/interactions/panels.ts'; export {AppController} from './apps/web/views/app.ts'; export {Store} from './apps/web/data/store.ts'; export {AIDock} from './apps/web/views/shell.tsx'; export {renderView} from './apps/web/views/react-renderer.ts'; export {createElement} from 'react';",
		resolveDir: path.resolve(import.meta.dirname, "../.."),
		loader: "ts",
	},
	bundle: true,
	alias: {
		"motion/mini": path.resolve(import.meta.dirname, "motion-fixture.ts"),
		motion: path.resolve(import.meta.dirname, "motion-fixture.ts"),
	},
	write: false,
	format: "iife",
	platform: "browser",
	globalName: "AITest",
	logLevel: "silent",
}).outputFiles[0].text;

function fixture(desktop = true) {
	const dom = new JSDOM(`<!doctype html><div id="dock"></div>`, {
		url: "http://ai.test/",
		runScripts: "outside-only",
		pretendToBeVisual: true,
	});
	const w = dom.window as any;
	w.matchMedia = (q: string) => ({
		matches: desktop ? q.includes("min-width") : q.includes("max-width"),
		addEventListener() {},
	});
	w.structuredClone = structuredClone;
	w.ResizeObserver = class {
		observe() {}
		disconnect() {}
	};
	installReactBrowserAPIs(w);
	w.eval(bundle);
	const { Store } = w.AITest;
	Store.load();
	Store.state.cards = [
		{ id: "task-1", type: "task", title: "Task one" },
		{ id: "mail-1", type: "mail", title: "Mail one" },
	];
	return { dom, w, Store };
}

const sessions = (): AISession[] => [
	session({
		id: "a",
		title: "Week",
		running: true,
		messages: [
			{ id: "1", role: "you", text: "Tidy the week", cards: ["task-1"] },
			{
				id: "2",
				role: "ai",
				text: "Moved two.",
				results: [
					{
						cardId: "task-1",
						title: "Task one",
						type: "task",
						change: "Due today",
						state: "written",
					},
					{ cardId: "mail-1", title: "Mail one", type: "mail", change: "", state: "unknown" },
				],
			},
		],
	}),
	session({ id: "b", title: "Earlier", updatedAt: now - 86400000 }),
];

test("the phone AI page shows the conversation, real write states and nothing that sends", () => {
	const f = fixture(false);
	try {
		const page = f.w.document.createElement("div");
		page.innerHTML = f.w.AITest.Panels.ai({
			aiSelectionIds: ["mail-1"],
			aiSessions: sessions(),
			aiSessionId: "a",
		});
		assert.ok(page.querySelector(".ai-conversation.has-session"));
		assert.equal(page.querySelector("h1").textContent, "Week");
		assert.equal(page.querySelectorAll(".ai-result").length, 2);
		assert.ok(page.querySelector(".ai-result.is-unknown [data-action='ai-result-open']"));
		assert.equal(page.querySelector(".ai-result.is-written .ai-result-action"), null);
		assert.ok(page.querySelector(".ai-stop:disabled"), "stop waits for the built-in AI");
		assert.equal(page.querySelector(".ai-send"), null);
		assert.ok(page.querySelector("[data-action='ai-history']:not(:disabled)"));
		assert.equal(page.querySelectorAll(".ai-context .ai-dock-chip").length, 1);
		assert.equal(page.querySelector(".ai-history"), null, "the drawer opens on request");
		page.innerHTML = f.w.AITest.Panels.ai({
			aiSelectionIds: [],
			aiSessions: sessions(),
			aiSessionId: "a",
			aiHistoryOpen: true,
		});
		const history = page.querySelector(".ai-history");
		assert.ok(history);
		assert.ok(history.querySelector(".ai-session-new:disabled"), "new chat needs the built-in AI");
		assert.equal(history.querySelectorAll("[data-action='ai-session']").length, 2);
		const empty = f.w.document.createElement("div");
		empty.innerHTML = f.w.AITest.Panels.ai({ aiSelectionIds: [] });
		assert.equal(empty.querySelector(".has-session, .ai-messages, .ai-history"), null);
		assert.ok(empty.querySelector("[data-action='ai-history']:disabled"));
	} finally {
		f.dom.window.close();
	}
});

test("the desktop box grows and folds back by the table, and stays one line without a session", () => {
	const f = fixture();
	try {
		const { w } = f;
		const { AppController, AIDock, renderView } = w.AITest;
		renderView(w.document.getElementById("dock"), w.AITest.createElement(AIDock));
		const app = new AppController();
		app.dialog = { open: false, querySelectorAll: () => [] };
		const dock = w.document.getElementById("ai-dock");
		assert.ok(
			dock
				.querySelector("#ai-dock-input")
				.compareDocumentPosition(dock.querySelector(".ai-dock-tools button")) &
				w.Node.DOCUMENT_POSITION_FOLLOWING,
			"Tab reaches the input before the collapse control",
		);
		app.renderAIConversation();
		assert.equal(w.document.querySelector("#ai-dock-session button"), null);
		app.aiHeightEvent("open");
		assert.equal(dock.dataset.height, "line", "nothing to show, nothing invented");

		app.aiSessions = sessions();
		app.renderAIConversation();
		assert.ok(w.document.querySelector("#ai-dock-session [data-action='ai-open']"));
		assert.ok(
			dock.querySelector(".ai-dock-send.is-stop"),
			"a running session turns send into stop",
		);
		app.action("ai-open");
		assert.equal(dock.dataset.height, "panel");
		assert.equal(w.document.getElementById("ai-dock-thread").hidden, false);
		assert.ok(w.document.querySelector(".ai-thread-others") === null, "no other session runs");
		app.action("ai-sessions");
		assert.equal(w.document.getElementById("ai-dock-sessions").hidden, false);
		const esc = () => app.aiKey(new w.KeyboardEvent("keydown", { key: "Escape" }));
		assert.equal(esc(), true);
		assert.equal(
			w.document.getElementById("ai-dock-sessions").hidden,
			true,
			"Esc closes the list first",
		);
		assert.equal(dock.dataset.height, "panel");
		app.action("ai-full");
		assert.equal(dock.dataset.height, "full");
		assert.equal(
			w.document.getElementById("ai-dock-sessions").hidden,
			false,
			"the full view lists sessions",
		);
		app.aiHeightEvent("detail");
		assert.equal(dock.dataset.height, "full", "a card opens over the full view");
		assert.equal(esc(), true);
		assert.equal(dock.dataset.height, "panel");
		app.aiHeightEvent("detail");
		assert.equal(dock.dataset.height, "line", "a card folds the panel");
		assert.equal(esc(), false, "one line leaves Esc to the rest of the page");
		app.action("ai-open");
		app.action("ai-session", "b");
		assert.equal(app.aiSessionId, "b");
		assert.equal(dock.dataset.height, "panel", "switching keeps the height");
		assert.equal(
			app.aiSessions.find((s: AISession) => s.id === "a").running,
			true,
			"others keep running",
		);
	} finally {
		f.dom.window.close();
	}
});
