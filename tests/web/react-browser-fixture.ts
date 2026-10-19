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
