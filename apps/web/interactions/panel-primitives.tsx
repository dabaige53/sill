import React, { cloneElement, isValidElement, type ReactElement } from "react";
import { sillIcon as sillIconHTML } from "../atoms/icons.ts";
import { Avatar, Icon } from "../atoms/react-primitives.tsx";
import { SourceMark } from "../cards/source-mark.tsx";
import { copy } from "../copy.ts";
/** Only trusted, generated SVG/avatar fragments cross this boundary; panel content uses JSX. */
export function TrustedFragment({ html }: { html: string }) {
	// biome-ignore lint/security/noDangerouslySetInnerHtml: Compatibility callers supply trusted renderer output; user text is escaped before this boundary.
	return <span style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: html || "" }} />;
}
export const icon = (name?: string, size = 18) => <Icon name={name} size={size} />;
export const sillIcon = (size = 64) => (
	<svg
		className="sill-icon"
		width={size}
		height={size}
		viewBox="0 0 160 160"
		aria-hidden="true"
		style={{
			borderRadius: Math.round(size * 0.225),
			boxShadow: "0 0 0 1px rgba(0,0,0,.05),0 6px 16px rgba(0,0,0,.1)",
			flex: "none",
		}}
		// biome-ignore lint/security/noDangerouslySetInnerHtml: Only the repository-owned Sill SVG renderer supplies this icon body.
		dangerouslySetInnerHTML={{
			__html: sillIconHTML(size)
				.replace(/^<svg[^>]*>/, "")
				.replace(/<\/svg>$/, ""),
		}}
	/>
);
export const avatar = (name = "", size = 28) => <Avatar name={name} size={size} />;
export function button(
	glyph?: string,
	label?: string,
	action?: string,
	id = "",
	extra = "",
	className = "",
) {
	return (
		<button
			type="button"
			className={`icon-button ${className}`}
			aria-label={label}
			data-action={action}
			data-id={id || undefined}
			data-extra={extra || undefined}
		>
			{icon(glyph)}
		</button>
	);
}
export function ownButton(node: ReactElement) {
	return isValidElement<{ className?: string }>(node)
		? cloneElement(node, {
				className: `icon-button is-own ${(node.props.className || "").replace("icon-button ", "")}`,
			})
		: node;
}
export function toggle(
	name?: string,
	on?: unknown,
	label?: string,
	action = "pref-toggle",
	descriptionId = "",
) {
	return (
		<button
			className="toggle"
			type="button"
			role="switch"
			aria-label={label}
			aria-describedby={descriptionId || undefined}
			aria-checked={!!on}
			data-action={action}
			data-id={name}
		/>
	);
}
export function segmented(name: string, options: string[][], value: string, label: string) {
	return (
		<span className="segmented" role="radiogroup" aria-label={label}>
			{options.map(([v, t]) => (
				// biome-ignore lint/a11y/useSemanticElements: Keep the existing button radio group and delegated preference keyboard handling.
				<button
					key={v}
					type="button"
					role="radio"
					tabIndex={v === value ? 0 : -1}
					aria-checked={v === value}
					className={v === value ? "on" : ""}
					data-action="pref"
					data-id={name}
					data-extra={v}
				>
					{t}
				</button>
			))}
		</span>
	);
}
export function checkItem(c: { id: string }, t: { id: string; done?: boolean; text: string }) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: The full task row is the existing checkbox button and delegated action target.
		<button
			className={`check-item ${t.done ? "is-done" : ""}`}
			data-action="task"
			data-id={c.id}
			data-extra={t.id}
			type="button"
			role="checkbox"
			aria-checked={!!t.done}
			aria-label={t.text}
		>
			<span className="check-dot">{t.done ? icon("check", 12) : null}</span>
			<span>{t.text}</span>
		</button>
	);
}

export function agentAction(
	app:
		| { agentAction?: (card: any) => string; agentActionView?: (card: any) => React.ReactNode }
		| undefined,
	card: any,
) {
	return app?.agentActionView ? (
		app.agentActionView(card)
	) : app?.agentAction ? (
		<TrustedFragment html={app.agentAction(card)} />
	) : null;
}

export function reminderMark(c: { id: string }, done: boolean) {
	return (
		<button
			type="button"
			className="reminder-check"
			data-action={done ? "restore-reminder" : "complete-reminder"}
			data-id={c.id}
			aria-pressed={done}
			aria-label={done ? copy("web.reminder.restore") : copy("web.reminder.complete")}
		>
			<span className={`check-dot ${done ? "is-done" : ""}`} aria-hidden="true">
				{done ? icon("check", 12) : null}
			</span>
		</button>
	);
}

export function sourceIcon(c: any, size = 16): React.ReactNode {
	return <SourceMark card={c} size={size} />;
}

/** Preserve stable sibling identity for lists assembled by the panel recipe helpers. */
export function keyed(nodes: React.ReactNode): React.ReactNode {
	if (!Array.isArray(nodes)) return nodes;
	return nodes.map((node, index) =>
		Array.isArray(node) ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: Nested arrays are fixed recipe slots, not reorderable domain items; child keys are preserved.
			<React.Fragment key={index}>{keyed(node)}</React.Fragment>
		) : React.isValidElement(node) ? (
			React.cloneElement(node, { key: node.key ?? index })
		) : (
			node
		),
	);
}

export function personalNote(note?: string) {
	return note ? (
		<aside className="preview-note" aria-label={copy("web.metadata.note")}>
			<span className="preview-note-label">{copy("web.metadata.note")}</span>
			<p>{note}</p>
		</aside>
	) : null;
}
