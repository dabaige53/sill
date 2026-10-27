/** Deterministic Motion boundary for controller tests; browser suites run the real package. */
export function motionValue<T>(initial: T) {
	let value = initial;
	const listeners = new Set<(value: T) => void>();
	const set = (next: T) => {
		value = next;
		for (const listener of listeners) listener(next);
	};
	return {
		get: () => value,
		set,
		jump: set,
		destroy: () => listeners.clear(),
		on: (_event: string, listener: (value: T) => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}
export function spring() {}

export function animate(el: any, values: any, options: any = {}) {
	let resolve!: () => void;
	const finished = new Promise<void>((done) => {
		resolve = done;
	});
	let stopped = false;
	const isValue = typeof el.set === "function";
	const keys = !isValue && typeof values === "object" ? Object.keys(values) : [];
	const count = keys.length
		? Math.max(...keys.map((key) => (Array.isArray(values[key]) ? values[key].length : 1)))
		: 0;
	const frames = Array.from({ length: count }, (_, index) =>
		Object.fromEntries(
			keys.map((key) => [key, Array.isArray(values[key]) ? values[key][index] : values[key]]),
		),
	);
	const finish = () => {
		if (stopped) return;
		stopped = true;
		if (isValue) {
			el.set(Array.isArray(values) ? values.at(-1) : values);
			options.onComplete?.();
		} else {
			if (!options.pseudoElement) {
				for (const [key, value] of Object.entries(frames.at(-1) || {}))
					el.style[key] = String(value);
			}
			// motion/mini reports one completion for each animated CSS property.
			keys.forEach(() => {
				options.onComplete?.();
			});
		}
		resolve();
	};
	const control = {
		target: el,
		destination: values,
		frames,
		options: { ...options, duration: options.duration * 1000 },
		finished,
		finish,
		complete: finish,
		stop() {
			stopped = true;
		},
		cancel() {
			stopped = true;
		},
	};
	const queue = (globalThis as any).__motionAnimations;
	const valueQueue = (globalThis as any).__motionValueAnimations;
	if (isValue && valueQueue) valueQueue.push(control);
	else if (isValue) {
		if (queue && (globalThis as any).__recordMotionValues) queue.push(control);
		finish();
	} else if (queue) queue.push(control);
	else if (options.autoplay !== false) queueMicrotask(finish);
	return control;
}
