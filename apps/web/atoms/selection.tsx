import React from "react";
import { copy } from "../copy.ts";
import { Icon } from "./react-primitives.tsx";

function Action({ glyph, label, action }: { glyph: string; label: string; action: string }) {
	return (
		<button type="button" className="icon-button " aria-label={label} data-action={action}>
			<Icon name={glyph} />
		</button>
	);
}
export function SelectionAI() {
	return (
		<button
			type="button"
			className="selection-ai-target glass"
			data-action="selected-ai"
			aria-label={copy("web.selection.aiOpen")}
		>
			<span className="selection-ai-wave" aria-hidden="true">
				<i />
				<i />
				<i />
			</span>
			<span data-ai-label="">{copy("web.selection.aiDrop")}</span>
		</button>
	);
}
export function SelectionBar({ id = "selection-bar" }: { id?: string }) {
	return (
		<div id={id} className="glass" hidden role="toolbar" aria-label={copy("web.app.461e085d5ca2")}>
			<span className="selection-count num" />
			<Action glyph="bookmark" label={copy("web.app.87aeb7040c82")} action="selected-bookmark" />
			<Action glyph="glasses" label={copy("web.app.d108c0a7e2c3")} action="selected-later" />
			<Action glyph="tag" label={copy("web.app.b5816e5fd0be")} action="selected-tag" />
			<span className="toolbar-sep" aria-hidden="true" />
			<Action glyph="x" label={copy("web.app.74966e20df2e")} action="clear-selection" />
			<SelectionAI />
		</div>
	);
}
