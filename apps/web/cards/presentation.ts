import { icon } from "../atoms/icons.ts";
import { button, esc } from "../atoms/primitives.ts";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { sourceMarkHtml } from "./source-mark.tsx";

/** One renderer for the live feed; design-system/ documents the same blocks. Rendering never mutates Store.
 * A card is a stack of blocks: head · media · text · data · list · act. Content is read here; actions go back to the source.
 */
const CardPresentation: Record<string, any> = {
	state(c?: any, options: any = {}) {
		const defaults: Record<string, any> = {
			seen: false,
			read: false,
			bookmarked: false,
			later: false,
			selected: false,
			progress: 0,
			snoozedUntil: 0,
			dismissed: false,
			reminderDone: false,
		};
		return {
			...defaults,
			...(options.state !== undefined ? options.state : Store.state.items[c.id] || {}),
		};
	},
	tasks(c?: any, state?: any) {
		return (c.tasks || []).map((t?: any) => ({
			...t,
			done: Array.isArray(state.taskDone) && state.taskDone.includes(t.id),
		}));
	},
	action(
		ctx?: any,
		glyph?: any,
		label?: any,
		action?: any,
		id: any = "",
		extra: any = "",
		className: any = "",
	) {
		return ctx.passive
			? `<span class="icon-button ${className}" role="img" aria-label="${esc(label)}">${icon(glyph)}</span>`
			: button(glyph, label, action, id, extra, className);
	},
	sourceIcon(c?: any, size: any = 16) {
		return sourceMarkHtml(c, size);
	},
};

export { CardPresentation };
