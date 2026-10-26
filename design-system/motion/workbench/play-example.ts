import type { ExampleRuntime } from "./runtime.tsx";

const manual = new Set([
	"drag.selection",
	"drag.ai-target",
	"refresh.pull",
	"deck.swipe",
	"reader.gesture",
]);
export const canPlay = (id: string) => !manual.has(id);
export function playExample(id: string, runtime: ExampleRuntime) {
	const click = (selector: string) => document.querySelector<HTMLElement>(selector)?.click();
	const events: Record<string, string> = {
		"feed.first-entry": "mount",
		"feed.arrival": "receive",
		"feed.departure": "remove",
		"content.fade": "changeContent",
		"feedback.toast": "toast",
		"notice.offline": "offline",
		"notice.new-content": "notify",
	};
	if (events[id]) {
		runtime.event(events[id]);
		return;
	}
	if (id === "feed.reorder") click('[data-id="floatTimely"]');
	else if (id === "task.mark") click('[data-action="task"]');
	else if (id === "settings.toggle") click('[role="switch"]');
	else if (id === "control.press") {
		const button = document.querySelector<HTMLElement>('[data-action="bookmark"]');
		button?.dispatchEvent(
			new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, button: 0, isPrimary: true }),
		);
		window.setTimeout(
			() => document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 })),
			180,
		);
	} else if (id === "menu.scope") click("#home-menu-toggle");
	else if (id === "menu.card") {
		if (document.querySelector(".card-more-menu")) click(".motion-canvas");
		else
			document
				.querySelector("[data-card]")
				?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
	} else if (id === "search.resize") {
		const input = document.querySelector<HTMLInputElement>("#home-search");
		if (document.activeElement === input) input?.blur();
		else input?.focus();
	} else if (id === "detail.resize")
		click(
			document.querySelector('[data-action="reader"]')
				? '[data-action="reader"]'
				: '[data-action="preview"]',
		);
	else if (id === "detail.card-flight" || id === "detail.sheet")
		click(document.querySelector("dialog[open]") ? '[data-action="close"]' : ".card-title-button");
	else if (id === "detail.navigate")
		click(
			!document.querySelector("dialog[open]")
				? ".card-title-button"
				: document.querySelector(".detail-related")
					? '.detail-related [data-id="motion-card-2"]'
					: '[data-action="close"]',
		);
	else if (id === "reader.outline") click(".reader-outline-toggle, .phone-article-outline summary");
	else if (id === "reader.tools" || id === "media.scroll-collapse") {
		if (!document.querySelector("dialog[open]")) click(".card-title-button");
		requestAnimationFrame(() => {
			const scroller = document.querySelector<HTMLElement>("#reader-scroll,.sheet-scroll");
			if (scroller) {
				scroller.scrollTop = scroller.scrollTop > 40 ? 0 : 160;
				scroller.dispatchEvent(new Event("scroll"));
			}
		});
	} else if (id === "selection.bar") {
		if (
			document.querySelector('[data-action="clear-selection"]')?.getAttribute("aria-hidden") !==
				"true" &&
			document.querySelector(".feed-item.is-selected")
		)
			click('[data-action="clear-selection"]');
		else
			document
				.querySelector(".card-title-button")
				?.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
	} else if (id === "ai.context-entry") {
		runtime.event("context");
	} else if (id === "ai.dock-collapse")
		click(
			document.querySelector(".ai-dock-restore")
				? ".ai-dock-restore"
				: '[data-action="ai-collapse"]',
		);
	else if (id === "ai.dock-height") {
		const height = document.querySelector<HTMLElement>("#ai-dock")?.dataset.height;
		click(
			height === "line"
				? '[data-action="ai-open"]'
				: height === "panel"
					? '[data-action="ai-full"]'
					: '[data-action="ai-shrink"]',
		);
	}
}
