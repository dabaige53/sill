import type { AnimationEntry } from "./catalog.ts";
import { demoKind } from "./tuning.ts";

// Verified official live-example pages. These are pattern references, not claims of source reuse.
const references = {
	press: ["Press", "https://motion.dev/examples/js-press"],
	check: ["Base UI: Checkbox", "https://motion.dev/examples/react-base-checkbox"],
	menu: ["Base UI: Dropdown menu", "https://motion.dev/examples/react-base-menu"],
	stack: ["Card stack", "https://motion.dev/examples/react-card-stack"],
	fade: ["AnimatePresence modes", "https://motion.dev/examples/react-animate-presence-modes"],
	search: ["Layout animation (Vue)", "https://motion.dev/examples/vue-layout-animation"],
	sheet: ["Sheet Modal", "https://motion.dev/examples/react-sheet-modal"],
	resize: ["Shared layout animation", "https://motion.dev/examples/js-shared-layout-animation"],
	drag: ["Drag", "https://motion.dev/examples/js-drag"],
	switch: ["Base UI: Switch", "https://motion.dev/examples/react-base-switch"],
	scroll: ["Scroll Direction: Hide Header", "https://motion.dev/examples/react-scroll-hide-header"],
	toast: ["Toast: Stacked notifications", "https://motion.dev/examples/react-toast-stack"],
	list: ["Reorder items", "https://motion.dev/examples/js-reorder-items"],
} as const;
export const motionReference = (entry: AnimationEntry) =>
	references[demoKind(entry)] as readonly [string, string] | undefined;
