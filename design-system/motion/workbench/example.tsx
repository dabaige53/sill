import { availabilityLabel, catalog, describe, type Platform, t } from "./catalog.ts";
import { initializeExampleStore } from "./fixtures.ts";
import { canPlay, playExample } from "./play-example.ts";
import { applyPreviewOverrides } from "./tuning.ts";
import "./example.css";

const segments = location.pathname.split("/").filter(Boolean);
const id = decodeURIComponent(segments.at(-1) === "index.html" ? segments.at(-2) : segments.at(-1));
const entry = catalog.find((entry) => entry.id === id);
const params = new URLSearchParams(location.search);
const platform: Platform = params.get("platform") === "phone" ? "phone" : "web";
const cover = params.has("cover");
const embedded = params.has("embedded");
const root = document.getElementById("root");

if (!entry) root.textContent = t("emptyExample");
else {
	document.title = `${describe(entry, "title")} · Sill`;
	document.body.className = `motion-example-page${cover ? " is-cover" : ""}`;
	const available = entry.platforms[platform];
	if (available !== "preview") {
		root.className = "motion-unavailable";
		root.textContent =
			available === "missing-native" ? t("nativeExplanation") : availabilityLabel(available);
	} else if (platform === "phone" && matchMedia("(min-width: 651px)").matches) {
		// A narrow iframe gives a standalone phone example the real responsive viewport too.
		root.className = "motion-phone-window";
		const frame = document.createElement("iframe");
		frame.width = "390";
		frame.height = "760";
		frame.title = `${describe(entry, "title")} · ${t("phone")}`;
		frame.src = location.href;
		root.append(frame);
	} else {
		let tuning: unknown = {};
		try {
			tuning = JSON.parse(params.get("tuning") || "{}");
		} catch {}
		applyPreviewOverrides(entry, tuning, document.documentElement.style);
		const { MotionEngine } = await import("../../../apps/web/interactions/motion.ts");
		const { mountExample } = await import("./runtime.tsx");
		initializeExampleStore();
		document.documentElement.dataset.inputModality = "pointer";
		for (const name of ["pointerdown", "wheel"])
			document.addEventListener(
				name,
				() => {
					document.documentElement.dataset.inputModality = "pointer";
				},
				{ capture: true, passive: true },
			);
		document.addEventListener(
			"keydown",
			(event) => {
				if (!["Meta", "Control", "Alt", "Shift"].includes(event.key))
					document.documentElement.dataset.inputModality = "keyboard";
			},
			true,
		);
		if (!cover) MotionEngine.bind();
		const tools = document.createElement("header");
		tools.className = "motion-example-tools";
		const canvas = document.createElement("main");
		canvas.className = `motion-canvas effect-${entry.id.replaceAll(".", "-")}`;
		canvas.setAttribute("aria-label", t("canvas"));
		root.append(tools, canvas);
		const runtime = mountExample(entry, canvas, cover);
		if (!cover) {
			window.addEventListener("message", (event) => {
				if (
					event.origin === location.origin &&
					event.source === window.parent &&
					event.data?.type === "sill-motion-play"
				)
					playExample(entry.id, runtime);
			});
			const actions = document.createElement("div");
			actions.className = "motion-example-actions";
			if (!embedded) {
				const reset = document.createElement("button");
				reset.type = "button";
				reset.className = "text-button";
				reset.textContent = t("reset");
				reset.onclick = () => location.reload();
				actions.append(reset);
			}
			if (!embedded && canPlay(entry.id)) {
				const play = document.createElement("button");
				play.type = "button";
				play.className = "text-button";
				play.textContent = t("playAnimation");
				play.onclick = () => playExample(entry.id, runtime);
				actions.append(play);
			}
			const events: Record<string, string[]> = {
				"feed.first-entry": ["mount"],
				"feed.arrival": ["receive"],
				"feed.departure": ["remove"],
				"content.fade": ["changeContent"],
				"feedback.toast": ["toast", "alert"],
				"notice.offline": ["offline", "online"],
				"notice.new-content": ["notify"],
				"refresh.pull": ["complete", "fail"],
			};
			for (const name of events[id] || []) {
				const button = document.createElement("button");
				button.type = "button";
				button.className = "text-button";
				button.textContent = t(name);
				button.onclick = () => {
					runtime.event(name);
					button.disabled = !runtime.canTrigger(name);
				};
				actions.append(button);
			}
			if (actions.children.length) tools.append(actions);
			if (!tools.children.length) tools.remove();
			if (id === "refresh.pull") {
				const buttons = [...actions.querySelectorAll<HTMLButtonElement>("button")].slice(
					embedded ? 0 : 1,
				);
				const update = () =>
					buttons.forEach((button) => {
						button.disabled = !runtime.pending();
					});
				update();
				window.setInterval(update, 100);
			}
		}
	}
}
