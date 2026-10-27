import tokens from "../../../design-system/tokens.json" with { type: "json" };

export const wheelInput = tokens.motion.wheelInput;

/** Recent displayed movement in px/ms; an expired sample must not revive a stopped gesture. */
export function recentVelocity(position: number, windowMs: number, now = () => performance.now()) {
	const samples = [{ position, time: now() }];
	return {
		feed(position: number) {
			const time = now(),
				cutoff = time - windowMs;
			while (samples.length > 1 && samples[1].time <= cutoff) samples.shift();
			if (samples[0].time < cutoff) samples[0] = { ...samples[0], time: cutoff };
			samples.push({ position, time });
		},
		read(minSampleMs = 1) {
			const last = samples[samples.length - 1];
			if (now() - last.time > windowMs) return 0;
			return (
				(last.position - samples[0].position) / Math.max(minSampleMs, last.time - samples[0].time)
			);
		},
	};
}

export function wheelPixels(event: Pick<WheelEvent, "deltaY" | "deltaMode">, pageHeight: number) {
	return (
		event.deltaY *
		(event.deltaMode === 1 ? wheelInput.linePixels : event.deltaMode === 2 ? pageHeight : 1)
	);
}

/** Observe normal scrolling too: coasting into an edge is not a new pull. */
export function wheelIntent(now = () => performance.now()) {
	let previous = 0,
		last = -Infinity,
		armed = false;
	return {
		feed(delta: number, eligible = true) {
			const time = now();
			const fresh =
				!previous ||
				time - last > wheelInput.sessionGapMs ||
				Math.sign(delta) !== Math.sign(previous) ||
				(Math.abs(delta) > Math.abs(previous) * wheelInput.rearmGain &&
					Math.abs(delta) - Math.abs(previous) > wheelInput.rearmDeltaPixels);
			const slowing = Math.abs(delta) < Math.abs(previous) * 0.9;
			previous = delta;
			last = time;
			armed = eligible && !!delta && (fresh || (armed && !slowing));
			return armed;
		},
		reset(seen = true) {
			armed = false;
			if (seen) last = now();
			else {
				previous = 0;
				last = -Infinity;
			}
		},
		get armed() {
			return armed;
		},
	};
}

/** Only the closing operation's shrinking tail is blocked; new input releases it. */
export function shieldWheelTail(delta: number) {
	if (!delta) return;
	let previous = delta,
		idle = 0;
	const stop = () => {
		clearTimeout(idle);
		clearTimeout(deadline);
		window.removeEventListener("wheel", hold, true);
		for (const type of ["pointerdown", "touchstart", "keydown"])
			window.removeEventListener(type, stop, true);
	};
	const hold = (event: WheelEvent) => {
		const next = wheelPixels(event, innerHeight);
		if (
			Math.abs(event.deltaX) > Math.abs(event.deltaY) ||
			Math.sign(next) !== Math.sign(previous) ||
			Math.abs(next) >= Math.abs(previous)
		)
			return stop();
		previous = next;
		if (event.cancelable) event.preventDefault();
		clearTimeout(idle);
		idle = window.setTimeout(stop, wheelInput.releaseIdleMs);
	};
	const deadline = window.setTimeout(stop, wheelInput.maxShieldMs);
	idle = window.setTimeout(stop, wheelInput.releaseIdleMs);
	window.addEventListener("wheel", hold, { capture: true, passive: false });
	for (const type of ["pointerdown", "touchstart", "keydown"])
		window.addEventListener(type, stop, true);
}
