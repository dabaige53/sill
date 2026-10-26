import React from "react";
import { copy } from "../copy.ts";
import { Glyphs } from "./icons.ts";
import { avatarTone } from "./primitives.ts";

/** Icons are trusted static SVG from the existing icon registry. */
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
	return (
		<svg
			className="icon"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={size <= 17 ? 2 : size <= 21 ? 1.8 : 1.65}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: Glyphs contains only repository-owned static SVG paths.
			dangerouslySetInnerHTML={{ __html: Glyphs[name] || Glyphs.file }}
		/>
	);
}
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
	return (
		<span
			className="avatar"
			style={{ width: size, height: size, background: avatarTone(name) }}
			aria-hidden="true"
		>
			{String(name).slice(0, 1)}
		</span>
	);
}
export function Avatars({ names }: { names: string[] }) {
	return (
		<span
			className="avatars"
			role="img"
			aria-label={`${names.length}${copy("web.primitives.0b27068f8071")}`}
		>
			{names.map((name, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: Names may repeat; these decorative avatars have no component state.
				<Avatar key={i} name={name} size={24} />
			))}
		</span>
	);
}
export function CheckMark({ done }: { done: boolean }) {
	return <span className="check-dot">{done && <Icon name="check" size={12} />}</span>;
}
/** The same task row in cards, details and isolated component examples. */
export function CheckItem({
	cardId,
	task,
}: {
	cardId: string;
	task: { id: string; text: string; done?: boolean };
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: Preserve the product's delegated button checkbox.
		<button
			type="button"
			className={`check-item ${task.done ? "is-done" : ""}`}
			data-action="task"
			data-id={cardId}
			data-extra={task.id}
			role="checkbox"
			aria-checked={!!task.done}
			aria-label={task.text}
		>
			<CheckMark done={!!task.done} />
			<span>{task.text}</span>
		</button>
	);
}
export function ProgressRing({ progress = 0, size = 22 }: { progress?: number; size?: number }) {
	const p = Math.max(0, Math.min(1, Number(progress) || 0)),
		c = 50.265;
	return (
		<span
			className="progress-ring"
			role="progressbar"
			aria-label={copy("web.primitives.8bf1d0b76278")}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(p * 100)}
			style={{ width: size, height: size }}
		>
			<svg viewBox="0 0 20 20" aria-hidden="true">
				<circle
					cx="10"
					cy="10"
					r="8"
					fill="none"
					stroke="currentColor"
					strokeOpacity=".14"
					strokeWidth="2.4"
				/>
				<circle
					cx="10"
					cy="10"
					r="8"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.4"
					strokeLinecap="round"
					strokeDasharray={c}
					strokeDashoffset={c * (1 - p)}
					transform="rotate(-90 10 10)"
				/>
			</svg>
		</span>
	);
}
