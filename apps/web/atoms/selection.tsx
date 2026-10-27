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
		<section className="selection-ai-target glass" hidden aria-label={copy("web.ai.dock")}>
			<Icon name="chat" size={20} />
			<input
				className="selection-ai-input"
				readOnly
				tabIndex={-1}
				aria-label={copy("web.ai.dock")}
				placeholder={copy("web.ai.dockPlaceholder")}
			/>
			<Icon name="up" size={20} />
		</section>
	);
}
// @design selection-bar
export function SelectionBar({ id = "selection-bar" }: { id?: string }) {
	return (
		<div id={id} className="glass" hidden role="toolbar" aria-label={copy("web.app.461e085d5ca2")}>
			<span className="selection-count num" />
			<Action glyph="bookmark" label={copy("web.app.87aeb7040c82")} action="selected-bookmark" />
			<Action glyph="glasses" label={copy("web.app.d108c0a7e2c3")} action="selected-later" />
			<Action glyph="tag" label={copy("web.app.b5816e5fd0be")} action="selected-tag" />
			<Action glyph="chat" label={copy("web.selection.toAI")} action="selected-ai" />
			<span className="toolbar-sep" aria-hidden="true" />
			<Action glyph="x" label={copy("web.app.74966e20df2e")} action="clear-selection" />
			<SelectionAI />
		</div>
	);
}
