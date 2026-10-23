/** Synthetic notification/worker events only; no OS alerts, browser or user data. */
import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";
import {
	reminderWorkerReady,
	SystemReminderService,
} from "../../apps/web/services/system-reminders.ts";
import { remindersWorker } from "../../contracts/reminders-worker.ts";

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
const card = { id: "due-card", type: "reminder", title: "Reminder", due: 1000 } as const;
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
function fixture() {
	const dom = new JSDOM("", { url: "https://sill.test" });
	const keys = ["window", "navigator", "localStorage", "Notification", "isSecureContext"] as const;
	const originals = keys.map(
		(key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
	);
	const notices: Notice[] = [];
	let requests = 0;
	class Notice {
		static permission: NotificationPermission = "granted";
		static requestPermission = async () => {
			requests++;
			return Notice.permission;
		};
		data: any;
		tag: string;
		closed = false;
		onclick?: () => void;
		onerror?: () => void;
		constructor(_title: string, options: NotificationOptions) {
			this.data = options.data;
			this.tag = options.tag || "";
			notices.push(this);
		}
		close() {
			this.closed = true;
		}
	}
	const registration = {
		active: { state: "activated" },
		showNotification: async (title: string, options: NotificationOptions) => {
			new Notice(title, options);
		},
		getNotifications: async (options?: { tag?: string }) =>
			notices.filter((n) => !n.closed && (!options?.tag || options.tag === n.tag)),
	};
	let listener: (event: any) => void;
	const serviceWorker = {
		register: async () => registration,
		getRegistration: async () => registration,
		addEventListener: (_name: string, handler: (event: any) => void) => {
			listener = handler;
		},
	};
	for (const [key, value] of Object.entries({
		window: dom.window,
		navigator: { serviceWorker },
		localStorage: dom.window.localStorage,
		Notification: Notice,
		isSecureContext: true,
	}))
		Object.defineProperty(globalThis, key, { value, configurable: true });
	const service = new SystemReminderService();
	const opened: string[] = [];
	service.bind({ owner: "a", open: (id) => opened.push(id) });
	return {
		service,
		notices,
		registration,
		serviceWorker,
		Notice,
		requests: () => requests,
		opened,
		message: (data: unknown) => {
			let accepted: boolean | undefined;
			listener({
				data,
				ports: [
					{
						postMessage: (reply: { accepted: boolean }) => {
							accepted = reply.accepted;
						},
					},
				],
			});
			return accepted;
		},
		close() {
			service.bind(null);
			for (const [key, descriptor] of originals) {
				if (descriptor) Object.defineProperty(globalThis, key, descriptor);
				else Reflect.deleteProperty(globalThis, key);
			}
			dom.window.close();
		},
	};
}

test("permission is requested only by an explicit enable; worker must activate first", async () => {
	const f = fixture();
	try {
		f.Notice.permission = "default";
		f.service.check([card], {}, 2000);
		assert.equal(f.requests(), 0);
		const permission = deferred<NotificationPermission>();
		f.Notice.requestPermission = () => permission.promise;
		const worker = new EventTarget() as EventTarget & { state: string };
		worker.state = "installing";
		Object.assign(f.registration, { active: null, installing: worker });
		const enabling = f.service.setEnabled(true);
		permission.resolve("granted");
		f.Notice.permission = "granted";
		await turn();
		assert.equal(f.service.enabled, false);
		worker.state = "activated";
		worker.dispatchEvent(new Event("statechange"));
		await enabling;
		assert.equal(f.service.enabled, true);
	} finally {
		f.close();
	}
});

test("late permission response cannot enable a switched-away and restored account", async () => {
	const f = fixture();
	try {
		f.Notice.permission = "default";
		const permission = deferred<NotificationPermission>();
		f.Notice.requestPermission = () => permission.promise;
		const enabling = f.service.setEnabled(true);
		f.service.bind({ owner: "b", open: () => {} });
		f.service.bind({ owner: "a", open: () => {} });
		f.Notice.permission = "granted";
		permission.resolve("granted");
		await enabling;
		assert.equal(f.service.enabled, false);
	} finally {
		f.close();
	}
});

test("repeat checks deduplicate, and completed/ignored/snoozed cards close old notifications", async () => {
	for (const item of [{ reminderDone: true }, { dismissed: true }, { snoozedUntil: 5000 }]) {
		const f = fixture();
		try {
			await f.service.setEnabled(true);
			f.service.check([card], {}, 2000);
			await turn();
			f.service.check([card], {}, 2000);
			await turn();
			assert.equal(f.notices.length, 1);
			f.service.check([card], { [card.id]: item }, 2000);
			await turn();
			assert.equal(f.notices[0].closed, true);
			assert.equal(
				f.message({
					type: "sill-reminder-open",
					owner: "a",
					card: card.id,
					key: `${card.id}:1000`,
				}),
				false,
			);
		} finally {
			f.close();
		}
	}
});

test("late showNotification is removed after completion or an account switch", async () => {
	for (const switchAccount of [false, true]) {
		const f = fixture();
		try {
			await f.service.setEnabled(true);
			const pending = deferred<void>();
			f.registration.showNotification = async (title, options) => {
				await pending.promise;
				new f.Notice(title, options);
			};
			f.service.check([card], {}, 2000);
			await turn();
			if (switchAccount) f.service.bind({ owner: "b", open: () => {} });
			else f.service.check([card], { [card.id]: { reminderDone: true } }, 2000);
			pending.resolve();
			await turn();
			assert.equal(f.notices.length, 1);
			assert.equal(f.notices[0].closed, true);
			assert.equal(localStorage.getItem("sill-reminders-shown:a"), null);
		} finally {
			f.close();
		}
	}
});

test("notification clicks require the current account and a still-eligible card", async () => {
	const f = fixture();
	try {
		await f.service.setEnabled(true);
		f.service.check([card], {}, 2000);
		await turn();
		const data = { type: "sill-reminder-open", owner: "a", card: card.id, key: `${card.id}:1000` };
		assert.equal(f.message({ ...data, owner: "b" }), false);
		assert.equal(f.message({ ...data, card: "missing" }), false);
		assert.equal(f.message(data), true);
		assert.deepEqual(f.opened, [card.id]);
		await f.service.setEnabled(false);
		await turn();
		assert.equal(f.notices[0].closed, true);
		assert.equal(f.message(data), false);
	} finally {
		f.close();
	}
});

test("a failed worker or rejected notification reports failure without marking delivery", async () => {
	const worker = new EventTarget() as EventTarget & { state: string };
	worker.state = "redundant";
	await assert.rejects(reminderWorkerReady({ installing: worker } as any), /failed/);
	const f = fixture();
	try {
		await f.service.setEnabled(true);
		let changes = 0;
		f.service.subscribe(() => changes++);
		f.registration.showNotification = async () => {
			throw new Error("Unavailable");
		};
		f.service.check([card], {}, 2000);
		await turn();
		assert.notEqual(f.service.message, "");
		assert.ok(changes > 0);
		assert.equal(localStorage.getItem("sill-reminders-shown:a"), null);
	} finally {
		f.close();
	}
});

test("notification worker focuses only a window that accepts the account and card", async () => {
	const handlers = new Map<string, (event: any) => void>();
	const focused: string[] = [];
	class Channel {
		port1 = { onmessage: undefined as undefined | ((event: unknown) => void), close() {} };
		port2 = { postMessage: (data: unknown) => this.port1.onmessage?.({ data }) };
	}
	const client = (id: string, accepted: boolean) => ({
		url: "https://sill.test/",
		postMessage(_message: unknown, ports: any[]) {
			ports[0].postMessage({ accepted });
		},
		async focus() {
			focused.push(id);
		},
	});
	runInNewContext(remindersWorker, {
		URL,
		MessageChannel: Channel,
		setTimeout,
		clearTimeout,
		self: {
			location: { origin: "https://sill.test" },
			addEventListener: (name: string, fn: (event: any) => void) => handlers.set(name, fn),
			clients: {
				matchAll: async () => [client("wrong-account", false), client("current-account", true)],
			},
		},
	});
	let pending: Promise<void> | undefined;
	handlers.get("notificationclick")!({
		notification: { data: { owner: "a", card: card.id, key: "key" }, close() {} },
		waitUntil: (value: Promise<void>) => {
			pending = value;
		},
	});
	await pending;
	assert.deepEqual(focused, ["current-account"]);
});

test("denied permission and embedded pages do not report reminders as enabled", async () => {
	const f = fixture();
	try {
		f.Notice.permission = "denied";
		await f.service.setEnabled(true);
		assert.equal(f.requests(), 0);
		assert.equal(f.service.enabled, false);
		assert.notEqual(f.service.message, "");
		Object.defineProperty(globalThis, "window", { value: { top: {} }, configurable: true });
		assert.equal(f.service.supported, false);
		await f.service.setEnabled(true);
		assert.equal(f.service.enabled, false);
	} finally {
		f.close();
	}
});

test("deduplication survives a new page service and is scoped to the account", async () => {
	const f = fixture();
	try {
		await f.service.setEnabled(true);
		f.service.check([card], {}, 2000);
		await turn();
		const next = new SystemReminderService();
		next.bind({ owner: "a", open: () => {} });
		next.check([card], {}, 2000);
		await turn();
		assert.equal(f.notices.length, 1);
		next.bind({ owner: "b", open: () => {} });
		await next.setEnabled(true);
		next.check([card], {}, 2000);
		await turn();
		assert.equal(f.notices.length, 2);
		next.bind(null);
		await turn();
	} finally {
		f.close();
	}
});

test("fallback Notification errors expose feedback and permit a later retry", async () => {
	const f = fixture();
	try {
		Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
		await f.service.setEnabled(true);
		f.service.check([card], {}, 2000);
		await turn();
		assert.equal(f.notices.length, 1);
		f.notices[0].onerror?.();
		assert.notEqual(f.service.message, "");
		f.service.check([card], {}, 2000);
		await turn();
		assert.equal(f.notices.length, 2);
		f.service.check([card], { [card.id]: { dismissed: true } }, 2000);
		assert.equal(f.notices[1].closed, true);
	} finally {
		f.close();
	}
});

test("a worker that never activates fails within a bounded wait", async (context) => {
	context.mock.timers.enable({ apis: ["setTimeout"] });
	const worker = new EventTarget() as EventTarget & { state: string };
	worker.state = "installing";
	const rejected = assert.rejects(reminderWorkerReady({ installing: worker } as any), /timeout/);
	context.mock.timers.tick(10000);
	await rejected;
});
