import { createElement, Fragment, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { cancelMotion } from "../interactions/motion-playback.ts";
import {
	wrapPhoneDrawer,
	renderPhoneDrawerChild,
	releasePhoneDrawerChild,
} from "../interactions/phone-drawer.tsx";
import { restoreCompletionChildren } from "./card-state-feedback.ts";

const roots = new Map<Element, { root: Root; revision: number }>();

/** Dispose nested islands before their owning surface is replaced. */
export function releaseView(container: Element) {
	if (releasePhoneDrawerChild(container)) return;
	cancelMotion(container, true);
	for (const [element, entry] of [...roots].reverse()) {
		if (element === container || container.contains(element)) {
			flushSync(() => entry.root.unmount());
			roots.delete(element);
		}
	}
}

/** Imperative geometry and focus code needs the committed DOM before it measures. */
export function renderView(container: Element, content: ReactNode, replace = false) {
	if (renderPhoneDrawerChild(container, content)) return;
	restoreCompletionChildren(container);
	for (const element of [...roots.keys()].reverse()) {
		if (element !== container && container.contains(element)) releaseView(element);
	}
	let entry = roots.get(container);
	if (!entry) {
		entry = { root: createRoot(container), revision: 0 };
		roots.set(container, entry);
	}
	const current = entry;
	// A panel opening resets its uncontrolled inputs. Feed updates retain keyed cards.
	if (replace) {
		cancelMotion(container, true);
		// Media cleanup saves its position; the next surface must read that saved value.
		flushSync(() => current.root.render(null));
		current.revision++;
	}
	flushSync(() =>
		current.root.render(
			createElement(Fragment, { key: current.revision }, wrapPhoneDrawer(container, content)),
		),
	);
}

/** Opening a different panel starts a new input/focus lifecycle. */
export function renderContent(container: Element, content: ReactNode) {
	renderView(container, content, true);
}
