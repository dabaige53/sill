import { copy } from "../copy.ts";
import { wheelPixels } from "./gesture-input.ts";
import type { Gestures } from "./gestures.ts";
import { MotionEngine } from "./motion.ts";
import type { Playback } from "./motion-playback.ts";
import { refreshBand, refreshConfig, refreshUnband, refreshWheel } from "./refresh-input.ts";

/** Homepage refresh owns one visible displacement, from tracking through request and return. */
// @design pull-refresh
export function bindRefresh(this: Gestures) {
	const ring = document.createElement("button");
	ring.type = "button";
	ring.id = "pull-ring";
	ring.className = "pull-ring glass";
	ring.disabled = true;
	ring.style.opacity = "0";
	ring.setAttribute("aria-hidden", "true");
	ring.innerHTML =
		'<svg class="pull-progress" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" pathLength="100"/></svg><svg class="pull-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><svg class="pull-retry" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 6"/></svg>';
	document.body.appendChild(ring);
	const main = document.querySelector("main"),
		circle = ring.querySelector("circle"),
		wheel = refreshWheel(),
		need = refreshConfig.threshold;
	let pull = 0,
		drawn = 0,
		busy = false,
		frame = 0,
		timer = 0,
		feedbackTimer = 0,
		inset = 16,
		headingTop: number | null = null,
		suppressRing = true,
		resultFade: Playback | null = null,
		start: { x: number; y: number } | null = null,
		mouse: { id: number; x: number; y: number; live: boolean } | null = null,
		gesture: { base: number; velocity: ReturnType<Gestures["velocity"]> } | null = null;
	const labels = {
		idle: copy("web.refresh.pull"),
		pulling: copy("web.refresh.pull"),
		loading: copy("web.refresh.loading"),
		success: copy("web.refresh.success"),
		error: copy("web.refresh.retry"),
	};
	let state: keyof typeof labels = "idle";
	const status = (next: keyof typeof labels) => {
		if (state === next && ring.dataset.state === next) return;
		const glyphs = next === "pulling" ? [] : Array.from(ring.querySelectorAll<SVGElement>("svg"));
		const opacity = glyphs.map((glyph) => getComputedStyle(glyph).opacity);
		state = next;
		ring.dataset.state = next;
		ring.classList.toggle("is-spinning", next === "loading");
		MotionEngine.loading(ring.querySelector(".pull-progress"), next === "loading");
		for (const [index, glyph] of glyphs.entries()) {
			const target = getComputedStyle(glyph).opacity;
			if (opacity[index] !== target)
				MotionEngine.animate(glyph, [{ opacity: opacity[index] }, { opacity: target }], {
					duration: MotionEngine.time("fast"),
				});
		}
		ring.disabled = next !== "error";
		ring.setAttribute("aria-hidden", String(next === "idle" || next === "pulling"));
		ring.setAttribute("aria-label", labels[next]);
		ring.setAttribute("aria-busy", String(next === "loading"));
		if (next === "loading" || next === "success" || next === "error")
			this.app.announce?.(labels[next]);
	};
	const measure = () => {
		inset = parseFloat(getComputedStyle(main).paddingTop) || 16;
		const rect = document.querySelector<HTMLElement>(".home-heading")?.getBoundingClientRect();
		ring.classList.toggle("in-home-heading", !!rect?.height);
		headingTop = rect?.height ? rect.top + (rect.height - ring.offsetHeight) / 2 : null;
		ring.style.top = headingTop === null ? "" : `${headingTop}px`;
		ring.style.left = headingTop === null ? "" : `${rect.left + rect.width / 2}px`;
	};
	const follow = ({ y }: { y: number }) => {
		drawn = y;
		const progress = Math.min(1, Math.max(0, y) / need),
			feedback = state === "loading" || state === "success" || state === "error";
		// Preserve the product's original indicator anchor and reveal; only motion is retuned.
		ring.style.translate =
			headingTop !== null
				? "0 0"
				: y
					? `0 ${Math.round((inset + y) / 2 - 18)}px`
					: feedback
						? "0 12px"
						: "0 -48px";
		if (!resultFade)
			ring.style.opacity = String(
				suppressRing ? 0 : feedback ? 1 : Math.min(1, Math.max(0, y) / 18),
			);
		circle.style.strokeDashoffset = String(100 - (feedback ? 1 : progress) * 100);
		ring.toggleAttribute("data-ready", state === "pulling" && y >= need);
	};
	const drive = (direct = false, velocity?: number) => {
		cancelAnimationFrame(frame);
		frame = 0;
		const body = document.body,
			returning = !direct && drawn !== 0;
		if (returning) body.classList.add("is-pulling");
		const playback = MotionEngine.move(main, pull ? `0 ${pull}px` : "", direct, {
			spring: refreshConfig.settle,
			// Preserve the upward handoff; limit downward travel before the spring returns.
			...(velocity === undefined
				? {}
				: { velocity: { y: Math.min(velocity, refreshConfig.maxDownwardVelocity) } }),
			onUpdate: follow,
		});
		if (returning)
			playback.finished.then(
				() => {
					if (!gesture && drawn === 0) body.classList.remove("is-pulling");
				},
				() => {},
			);
		return playback;
	};
	const schedulePaint = () => {
		if (!frame) frame = requestAnimationFrame(() => drive(true));
	};
	const stopFeedback = () => {
		clearTimeout(feedbackTimer);
		feedbackTimer = 0;
		resultFade?.cancel();
		resultFade = null;
	};
	const begin = () => {
		stopFeedback();
		suppressRing = false;
		pull = drawn;
		gesture = { base: refreshUnband(Math.max(0, drawn)), velocity: this.velocity(drawn) };
		measure();
		status("pulling");
		drive(true);
		document.body.classList.add("is-pulling");
	};
	const track = (distance: number) => {
		if (!gesture) return;
		pull = refreshBand(gesture.base + distance);
		gesture.velocity.feed(pull);
		schedulePaint();
	};
	const clearInput = () => {
		start = mouse = null;
		gesture = null;
		wheel.reset();
		clearTimeout(timer);
		document.body.classList.remove("is-pulling");
	};
	const cancel = () => {
		const velocity = gesture ? gesture.velocity.read() * 1000 : 0;
		clearInput();
		if (state !== "pulling") return;
		status("idle");
		pull = 0;
		drive(false, velocity);
	};
	const refresh = async (fromPull = false, velocity = 0) => {
		if (busy) return;
		stopFeedback();
		const startedAt = performance.now();
		busy = true;
		clearInput();
		suppressRing = false;
		if (!fromPull) measure();
		// Loading keeps its original UI: content returns immediately, the ring owns the request.
		pull = 0;
		status("loading");
		drive(false, velocity);
		try {
			const result = await this.app.refresh({ feedback: "pull" });
			if (result === false) throw new Error("Refresh did not complete");
			const showSuccess = () => {
				status("success");
				follow({ y: drawn });
				feedbackTimer = window.setTimeout(() => {
					feedbackTimer = 0;
					const fading = MotionEngine.animate(ring, [{ opacity: 1 }, { opacity: 0 }], {
						duration: MotionEngine.time("fast"),
					});
					resultFade = fading;
					const idle = () => {
						if (resultFade !== fading || state !== "success") return;
						resultFade = null;
						suppressRing = true;
						status("idle");
						follow({ y: drawn });
					};
					if (fading) fading.finished.then(idle, () => {});
					else idle();
				}, refreshConfig.feedback.successHoldMs);
			};
			const remaining = refreshConfig.feedback.loadingMinMs - (performance.now() - startedAt);
			// The request is already done. These timers only make its feedback readable.
			if (remaining > 0) feedbackTimer = window.setTimeout(showSuccess, remaining);
			else showSuccess();
		} catch {
			status("error");
			pull = 0;
			drive(false, 0);
		} finally {
			busy = false;
		}
	};
	const release = () => {
		if (state !== "pulling") return clearInput();
		if (this.app.dialog.open || this.app.selected.size || this.app.drag?.active || scrollY > 0)
			return cancel();
		if (pull < need) return cancel();
		const velocity = gesture ? gesture.velocity.read() * 1000 : 0;
		// The last input can arrive before its drawing frame. Hand off that exact position.
		drive(true);
		void refresh(true, velocity);
	};
	const blocked = () =>
		busy ||
		this.app.dialog.open ||
		this.app.selected.size ||
		this.app.drag?.active ||
		this.app.drag?.menu?.open;
	const unavailable = () => blocked() || scrollY > 0;
	document.addEventListener("pointerdown", (event: PointerEvent) => {
		if (event.pointerType !== "mouse" || event.button !== 0 || this.phone.matches) return;
		cancel();
		const target = event.target as Element;
		if (
			unavailable() ||
			!target.closest?.("main,.home-heading") ||
			target.closest(
				"[data-card],.deck,button,a,input,textarea,select,[role=button],[contenteditable]",
			)
		)
			return;
		mouse = { id: event.pointerId, x: event.clientX, y: event.clientY, live: false };
	});
	document.addEventListener("pointermove", (event: PointerEvent) => {
		if (!mouse || event.pointerId !== mouse.id) return;
		if (!(event.buttons & 1) || unavailable()) return cancel();
		const dy = event.clientY - mouse.y,
			dx = Math.abs(event.clientX - mouse.x);
		if (!mouse.live) {
			if (dy < -refreshConfig.dragSlop || dx > Math.max(refreshConfig.dragSlop, dy))
				return cancel();
			if (dy <= refreshConfig.dragSlop) return;
			mouse.live = true;
			mouse.y = event.clientY;
			begin();
		}
		event.preventDefault();
		track(event.clientY - mouse.y);
	});
	window.addEventListener("pointerup", (event: PointerEvent) => {
		if (mouse && event.pointerId === mouse.id && event.button === 0) release();
	});
	window.addEventListener("pointercancel", (event: PointerEvent) => {
		if (mouse && event.pointerId === mouse.id) cancel();
	});
	window.addEventListener("blur", cancel);
	document.addEventListener(
		"touchstart",
		(event: TouchEvent) => {
			cancel();
			// A touch may start mid-page or while momentum settles; the top is checked as it moves.
			if (
				blocked() ||
				event.touches.length !== 1 ||
				this.fromHorizontalContent(event) ||
				(event.target as Element).closest?.("#dock,#toast,#pull-ring,.deck")
			)
				return;
			start = this.point(event);
		},
		{ passive: true },
	);
	document.addEventListener(
		"touchmove",
		(event: TouchEvent) => {
			if (!start) return;
			if (blocked() || event.touches.length !== 1) return cancel();
			const point = this.point(event);
			// Until the page reaches the top, the pull origin rides with the finger.
			if (scrollY > 0) {
				if (gesture) cancel();
				start = point;
				return;
			}
			const dy = point.y - start.y,
				dx = Math.abs(point.x - start.x);
			if (!gesture) {
				if (dy <= 0) {
					start = point;
					return;
				}
				if (dx > dy) return cancel();
				// Wider layouts keep the browser's own top edge (base.css); it must not run twice.
				if (!event.cancelable && !this.phone.matches) return cancel();
				begin();
			}
			// A touch that stopped momentum stays uncancelable, but at the top nothing scrolls under it.
			if (event.cancelable) event.preventDefault();
			track(dy);
		},
		{ passive: false },
	);
	document.addEventListener("touchend", () => {
		if (start) release();
	});
	document.addEventListener("touchcancel", cancel, { passive: true });
	window.addEventListener(
		"wheel",
		(event: WheelEvent) => {
			if (mouse || start || event.buttons) return;
			if (
				event.ctrlKey ||
				Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
				this.fromField(event)
			) {
				cancel();
				wheel.reset(false);
				return;
			}
			const delta = -wheelPixels(event, innerHeight),
				eligible = !unavailable() && delta > 0,
				next = wheel.feed(delta, eligible);
			if (!eligible || !event.cancelable) return cancel();
			if (next.phase === "ignore") return;
			event.preventDefault();
			if (next.phase === "start") begin();
			if (next.phase === "release") return release();
			track(next.distance);
			clearTimeout(timer);
			timer = window.setTimeout(release, refreshConfig.wheel.releaseIdleMs);
		},
		{ passive: false },
	);
	ring.addEventListener("click", () => {
		if (state === "error") void refresh();
	});
	this.refresh = refresh;
	status("idle");
	drive(true);
}
