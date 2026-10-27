import { animate, motionValue } from "motion";
import { useEffect, useRef } from "react";
import foundation from "../../../design-system/tokens/foundation.json" with { type: "json" };

const config = foundation.motion.webInteraction;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Adapted from xevrion/ui-lab toggle-switch. MIT, Copyright (c) 2026 Yash Bavadiya.
 * Full license: docs/adr/0082-web-ui-lab-motion.md. Uses Sill delegated actions. */
export function ToggleControl({ name, on, label, action, descriptionId }: {
	name?: string; on: boolean; label?: string; action: string; descriptionId: string;
}) {
	const button = useRef<HTMLButtonElement>(null);
	const thumb = useRef<HTMLSpanElement>(null);
	const fill = useRef<HTMLSpanElement>(null);
	const target = useRef(on);
	const state = useRef<ReturnType<typeof createState> | null>(null);
	const checked = useRef(on);
	checked.current = on;
	const swallow = useRef(false);
	const gesture = useRef<{ id: number; x: number; start: number; dragged: boolean } | null>(null);
	function createState() {
		const progress = motionValue(on ? 1 : 0);
		const stretch = motionValue(0);
		const draw = () => {
			if (!thumb.current) return;
			const p = progress.get();
			if (fill.current) fill.current.style.opacity = String(clamp(p));
			const squash = Math.min(Math.max(-p, p - 1, 0) * config.toggleTravel, config.toggleSquash);
			const width = config.toggleWidth + stretch.get() - squash;
			const x = clamp(p) * (config.toggleTravel - width + config.toggleWidth);
			thumb.current.style.transform = `translateX(${x}px) scaleX(${width / config.toggleWidth})`;
		};
		const off = [progress.on("change", draw), stretch.on("change", draw)];
		return { progress, stretch, draw, destroy: () => { off.forEach(fn => fn()); progress.destroy(); stretch.destroy(); } };
	}
	useEffect(() => {
		const current = createState(); state.current = current; current.draw();
		const cancel = () => restore(true);
		window.addEventListener("blur", cancel);
		return () => { window.removeEventListener("blur", cancel); current.destroy(); state.current = null; };
	}, []);
	useEffect(() => {
		if (target.current !== on) travel(on);
	}, [on]);
	function travel(next: boolean) {
		const current = state.current;
		if (!current) return;
		target.current = next;
		if (document.documentElement.dataset.inputModality === "keyboard") current.progress.jump(next ? 1 : 0);
		else animate(current.progress, next ? 1 : 0, {
			type: "spring", ...config.toggleSpring, velocity: current.progress.getVelocity(),
		});
	}
	function restore(cancelled = false) {
		gesture.current = null;
		const current = state.current;
		if (!current) return;
		animate(current.stretch, 0, { type: "spring", ...config.toggleSpring });
		if (cancelled) travel(checked.current);
	}
	return <button ref={button} className="toggle" data-live-toggle="" type="button" role="switch"
		aria-label={label} aria-describedby={descriptionId || undefined} aria-checked={on}
		data-action={action} data-id={name}
		onPointerDown={event => {
			if (event.button !== 0 || !event.isPrimary || gesture.current || !state.current) return;
			swallow.current = false;
			document.documentElement.dataset.inputModality = "pointer";
			event.currentTarget.setPointerCapture(event.pointerId);
			gesture.current = { id: event.pointerId, x: event.clientX, start: clamp(state.current.progress.get()), dragged: false };
			animate(state.current.stretch, config.toggleStretch, { type: "spring", ...config.toggleLean });
		}}
		onPointerMove={event => {
			const g = gesture.current; const current = state.current;
			if (!g || !current || event.pointerId !== g.id) return;
			const dx = event.clientX - g.x;
			if (!g.dragged && Math.abs(dx) < config.toggleSlop) return;
			current.progress.stop();
			g.dragged = true;
			current.progress.set(clamp(g.start + dx / Math.max(1, config.toggleTravel - current.stretch.get())));
		}}
		onPointerUp={event => {
			const g = gesture.current;
			if (!g || event.pointerId !== g.id) return;
			const next = state.current.progress.get() > 0.5;
			if (g.dragged) {
				travel(next);
				if (next !== checked.current) button.current.click();
			}
			swallow.current = g.dragged;
			restore();
		}}
		onPointerCancel={() => { swallow.current = true; restore(true); }}
		onLostPointerCapture={() => { if (gesture.current) restore(true); }}
		onKeyDown={() => { swallow.current = false; }}
		onClickCapture={event => {
			if (swallow.current) { swallow.current = false; event.preventDefault(); event.stopPropagation(); return; }
			if (!gesture.current?.dragged) travel(!checked.current);
		}}
	><span ref={fill} className="toggle-fill" aria-hidden="true" style={{ opacity: on ? 1 : 0 }} /><span ref={thumb} className="toggle-knob" aria-hidden="true" /></button>;
}
