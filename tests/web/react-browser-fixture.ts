import { MessageChannel } from "node:worker_threads";

/** JSDOM omits browser streams and message channels required by React's renderers. */
export function installReactBrowserAPIs(window: any) {
	const channels: MessageChannel[] = [];
	window.TextEncoder = TextEncoder;
	window.TextDecoder = TextDecoder;
	window.ReadableStream = ReadableStream;
	window.TransformStream = TransformStream;
	window.MessageChannel = class extends MessageChannel {
		constructor() {
			super();
			channels.push(this);
		}
	};
	const close = window.close.bind(window);
	window.close = () => {
		for (const channel of channels) {
			channel.port1.close();
			channel.port2.close();
		}
		close();
	};
}

/** Advance one synthetic window's timeouts without changing process-wide timers. */
export function installTimers(window: any) {
	let now = 0;
	let nextId = 0;
	const timers = new Map<number, { at: number; run: () => void }>();
	window.setTimeout = (callback: (...args: any[]) => void, delay = 0, ...args: any[]) => {
		const id = ++nextId;
		timers.set(id, { at: now + delay, run: () => callback(...args) });
		return id;
	};
	window.clearTimeout = (id: number) => timers.delete(id);
	return {
		advance(ms: number) {
			const end = now + ms;
			while (timers.size) {
				const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
				if (next[1].at > end) break;
				timers.delete(next[0]);
				now = next[1].at;
				next[1].run();
			}
			now = end;
		},
	};
}
