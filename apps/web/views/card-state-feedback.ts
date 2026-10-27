import { icon } from "../atoms/icons.ts";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { MotionEngine } from "../interactions/motion.ts";
import type { AppController } from "./app.ts";

const originalDots = new Map<HTMLElement, Node[]>();
const READ_STATES = ["is-read", "is-ended", "is-complete"];

function readSurface(node: HTMLElement) {
	const style = getComputedStyle(node);
	return {
		states: READ_STATES.filter((name) => node.classList.contains(name)).join(" "),
		frame: {
			backgroundColor: style.backgroundColor,
			borderColor: style.borderColor,
			boxShadow: style.boxShadow,
		},
	};
}

/** Read, ended and completed colors settle over dur-read instead of switching in one frame. */
export function settleReadColors(root: ParentNode, change: () => void) {
	const cards = () => root.querySelectorAll<HTMLElement>(".feed-card[data-card]");
	const before = new Map([...cards()].map((node) => [node.dataset.card, readSurface(node)]));
	change();
	for (const node of cards()) {
		const old = before.get(node.dataset.card);
		if (!old) continue;
		const next = readSurface(node);
		if (old.states !== next.states)
			MotionEngine.animate(node, [old.frame, next.frame], {
				duration: MotionEngine.time("dur-read"),
			});
	}
}

function paintDot(dot: HTMLElement, done: boolean) {
	if (!originalDots.has(dot)) originalDots.set(dot, [...dot.childNodes]);
	dot.innerHTML = done ? icon("check", 12) : "";
}

/** Return React-owned children before its next reconciliation. */
export function restoreCompletionChildren(root: ParentNode) {
	for (const [dot, children] of originalDots) {
		if (!dot.isConnected) originalDots.delete(dot);
		else if (root.contains(dot)) {
			dot.replaceChildren(...children);
			originalDots.delete(dot);
		}
	}
}

/** Completion changes keep the mounted row, its focus and its surrounding scroll surface. */
export function updateCompletionState(root: ParentNode, id: string) {
	const card = Store.card(id);
	if (!card) return;
	const tasks = Store.tasks(card);
	const byId = new Map(tasks.map((task) => [task.id, task]));
	for (const row of root.querySelectorAll<HTMLElement>(
		`[data-action="task"][data-id="${CSS.escape(id)}"]`,
	)) {
		const task = byId.get(row.dataset.extra);
		if (!task) continue;
		const done = !!task.done;
		row.classList.toggle("is-done", done);
		row.setAttribute("aria-checked", String(done));
		const dot = row.querySelector<HTMLElement>(".check-dot");
		if (dot) paintDot(dot, done);
	}
	const reminderDone = !!Store.item(id).reminderDone;
	for (const button of root.querySelectorAll<HTMLElement>(
		`.reminder-check[data-id="${CSS.escape(id)}"]`,
	)) {
		button.dataset.action = reminderDone ? "restore-reminder" : "complete-reminder";
		button.setAttribute("aria-pressed", String(reminderDone));
		button.setAttribute(
			"aria-label",
			reminderDone ? copy("web.reminder.restore") : copy("web.reminder.complete"),
		);
		const dot = button.querySelector<HTMLElement>(".check-dot");
		if (dot) {
			dot.classList.toggle("is-done", reminderDone);
			paintDot(dot, reminderDone);
		}
	}
	settleReadColors(root, () => {
		for (const node of root.querySelectorAll<HTMLElement>(`[data-card="${CSS.escape(id)}"]`)) {
			const done = tasks.filter((task) => task.done).length;
			node.classList.toggle(
				"is-complete",
				card.type === "reminder" ? reminderDone : !!tasks.length && done === tasks.length,
			);
			for (const count of node.querySelectorAll<HTMLElement>(".task-count"))
				count.textContent = `${done}/${tasks.length}`;
		}
	});
}

/** Task and reminder controls change in place; other edits retain the full refresh path. */
export function refreshCompletion(app: AppController, id: string) {
	const status = app.filter?.status;
	const search = app.searchBackground || (app.modalKind === "search" ? app.dialog : null);
	const selector = `[data-card="${CSS.escape(id)}"]`;
	const card =
		app.grid.querySelector<HTMLElement>(selector) || search?.querySelector<HTMLElement>(selector);
	if (!card || ["done", "snoozed", "dismissed"].includes(status)) {
		app.refreshCard(id);
		return;
	}
	updateCompletionState(app.grid, id);
	if (search) updateCompletionState(search, id);
}
