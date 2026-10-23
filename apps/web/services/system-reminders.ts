import type { Card } from "../../../contracts/card.ts";
import { copy } from "../copy.ts";
import { FeedPolicy } from "./feed-policy.ts";

type Context = { owner: string; open: (id: string) => void };
const enabledKey = (owner: string) => `sill-reminders-enabled:${owner}`;
const shownKey = (owner: string) => `sill-reminders-shown:${owner}`;

/** Wait for this registration, not navigator.serviceWorker.ready (which may never settle). */
export function reminderWorkerReady(registration: ServiceWorkerRegistration) {
	if (registration.active?.state === "activated") return Promise.resolve();
	return new Promise<void>((resolve, reject) => {
		const worker = registration.installing || registration.waiting || registration.active;
		if (!worker) {
			reject(new Error("Notification worker unavailable"));
			return;
		}
		const finish = (error?: Error) => {
			clearTimeout(timer);
			worker.removeEventListener("statechange", changed);
			if (error) reject(error);
			else resolve();
		};
		const changed = () => {
			if (worker.state === "activated") finish();
			else if (worker.state === "redundant") finish(new Error("Notification worker failed"));
		};
		const timer = setTimeout(() => finish(new Error("Notification worker timeout")), 10000);
		worker.addEventListener("statechange", changed);
		changed();
	});
}

/** Device preferences and deduplication IDs contain no card content. No background scheduling. */
export class SystemReminderService {
	context: Context | null = null;
	message = "";
	version = 0;
	private listeners = new Set<() => void>();
	private shown = new Map<string, Set<string>>();
	private active = new Map<string, Notification>();
	private desired = new Map<string, Card>();
	private registration: ServiceWorkerRegistration | null = null;
	private sending = new Set<string>();
	private bound = false;
	private epoch = 0;
	private setting = 0;
	private session = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};
	private changed() {
		this.version++;
		for (const listener of this.listeners) listener();
	}
	private failed(epoch: number) {
		if (epoch === this.epoch) {
			this.message = copy("reminders.failed");
			this.changed();
		}
	}
	get supported() {
		return (
			typeof Notification !== "undefined" && globalThis.isSecureContext && window.top === window
		);
	}
	get enabled() {
		if (!this.context || !this.supported || Notification.permission !== "granted") return false;
		try {
			return localStorage.getItem(enabledKey(this.context.owner)) === "true";
		} catch {
			return false;
		}
	}
	bind(context: Context | null) {
		const changed = context?.owner !== this.context?.owner;
		if (changed) {
			this.close();
			this.message = "";
		}
		this.context = context;
		if (changed) this.changed();
		if (!this.bound && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
			this.bound = true;
			navigator.serviceWorker.addEventListener("message", (event) => {
				if (event.data?.type !== "sill-reminder-open") return;
				const { owner, card, key } = event.data;
				const accepted =
					this.enabled &&
					owner === this.context?.owner &&
					typeof key === "string" &&
					this.desired.get(key)?.id === card;
				if (accepted) this.context?.open(card);
				event.ports[0]?.postMessage({ accepted });
			});
		}
	}
	async setEnabled(value: boolean) {
		const owner = this.context?.owner,
			epoch = this.epoch,
			setting = ++this.setting;
		const current = () =>
			epoch === this.epoch && setting === this.setting && owner === this.context?.owner;
		if (!owner) return;
		this.message = "";
		try {
			if (!value) {
				localStorage.setItem(enabledKey(owner), "false");
				this.close();
				return;
			}
			if (!this.supported) {
				this.message = copy("reminders.unsupported");
				return;
			}
			// Only this explicit settings action requests permission, before its first await.
			const permission =
				Notification.permission === "default"
					? await Notification.requestPermission()
					: Notification.permission;
			if (!current()) return;
			if (permission !== "granted") {
				this.message = copy("reminders.deniedWeb");
				return;
			}
			if ("serviceWorker" in navigator) {
				const registration = await navigator.serviceWorker.register("/reminders-worker.js", {
					scope: "/",
				});
				if (!current()) return;
				await reminderWorkerReady(registration);
				if (!current()) return;
				this.registration = registration;
			}
			localStorage.setItem(enabledKey(owner), "true");
		} catch {
			if (current()) this.message = copy("reminders.failed");
		} finally {
			this.changed();
		}
	}
	check(cards: Card[], items: Record<string, unknown>, now = Date.now()) {
		this.desired = new Map(
			this.enabled
				? cards
						.filter((card) => FeedPolicy.eligible(card, items[card.id] || {}, now))
						.map((card) => [FeedPolicy.key(card, items[card.id] || {}), card])
				: [],
		);
		const context = this.context,
			epoch = this.epoch;
		if (!context) return;
		for (const [key, notification] of this.active)
			if (!this.desired.has(key)) {
				notification.close();
				this.active.delete(key);
			}
		void this.cleanup(
			context.owner,
			(notification) => !this.desired.has(notification.data?.key),
			epoch,
		);
		for (const [key, card] of this.desired) {
			const tag = `${epoch}:${context.owner}:${key}`;
			if (this.sending.has(tag)) continue;
			this.sending.add(tag);
			void this.deliver(card, key, context, epoch)
				.catch(() => this.failed(epoch))
				.finally(() => this.sending.delete(tag));
		}
	}
	private valid(owner: string, key: string, epoch: number) {
		return (
			epoch === this.epoch && owner === this.context?.owner && this.enabled && this.desired.has(key)
		);
	}
	private async getRegistration() {
		return (
			this.registration ||
			(typeof navigator !== "undefined" && "serviceWorker" in navigator
				? await navigator.serviceWorker.getRegistration("/")
				: undefined)
		);
	}
	private async deliver(card: Card, key: string, context: Context, epoch: number) {
		const send = async () => {
			if (!this.valid(context.owner, key, epoch)) return;
			const shown = this.shown.get(context.owner) || new Set<string>();
			try {
				const stored: unknown = JSON.parse(localStorage.getItem(shownKey(context.owner)) || "[]");
				if (Array.isArray(stored))
					for (const id of stored) if (typeof id === "string") shown.add(id);
			} catch {}
			this.shown.set(context.owner, shown);
			if (shown.has(key)) return;
			const session = `${this.session}:${epoch}`;
			const options: NotificationOptions = {
				body: copy("reminders.body"),
				tag: `sill:${context.owner}:${key}`,
				data: { owner: context.owner, card: card.id, key, session },
			};
			const registration = await this.getRegistration();
			if (!this.valid(context.owner, key, epoch)) return;
			if (registration) {
				await reminderWorkerReady(registration);
				if (!this.valid(context.owner, key, epoch)) return;
				this.registration = registration;
				await registration.showNotification(card.title, options);
				if (!this.valid(context.owner, key, epoch)) {
					const notifications = await registration.getNotifications({ tag: options.tag });
					for (const notification of notifications)
						if (notification.data?.session === session) notification.close();
					return;
				}
			} else {
				const notification = new Notification(card.title, options);
				this.active.set(key, notification);
				notification.onclick = () => {
					if (this.valid(context.owner, key, epoch)) {
						window.focus();
						this.context?.open(card.id);
					}
					notification.close();
				};
				notification.onerror = () => {
					if (!this.valid(context.owner, key, epoch) || this.active.get(key) !== notification)
						return;
					this.active.delete(key);
					notification.close();
					this.shown.get(context.owner)?.delete(key);
					try {
						localStorage.setItem(
							shownKey(context.owner),
							JSON.stringify([...(this.shown.get(context.owner) || [])]),
						);
					} catch {}
					this.failed(epoch);
				};
			}
			shown.add(key);
			const bounded = [...shown].slice(-1000);
			this.shown.set(context.owner, new Set(bounded));
			localStorage.setItem(shownKey(context.owner), JSON.stringify(bounded));
			if (this.message) {
				this.message = "";
				this.changed();
			}
		};
		if (navigator.locks)
			await navigator.locks.request(`sill-notification:${context.owner}:${key}`, send);
		else await send();
	}
	private async cleanup(
		owner: string,
		shouldClose: (notification: Notification) => boolean,
		epoch?: number,
	) {
		try {
			const registration = await this.getRegistration();
			const notifications = (await registration?.getNotifications()) || [];
			if (epoch !== undefined && epoch !== this.epoch) return;
			for (const notification of notifications)
				if (notification.data?.owner === owner && shouldClose(notification)) notification.close();
		} catch {
			if (epoch !== undefined) this.failed(epoch);
		}
	}
	close() {
		const owner = this.context?.owner;
		this.epoch++;
		this.setting++;
		for (const notification of this.active.values()) notification.close();
		this.active.clear();
		this.desired.clear();
		if (owner)
			void this.cleanup(
				owner,
				(notification) => notification.data?.session !== `${this.session}:${this.epoch}`,
			);
	}
}

export const systemReminders = new SystemReminderService();
