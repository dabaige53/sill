import { icon } from "../atoms/icons.ts";
import { esc } from "../atoms/primitives.ts";
import { copy, errorMessage } from "../copy.ts";
import { Store } from "../data/store.ts";
import { PanelViews as Panels } from "../interactions/panels-components.tsx";

/** Page and agents share one loopback service. Browser storage remains a migration backup. */
const LocalSync: Record<string, any> = {
	revision: 0,
	baseline: null,
	pending: [],
	busy: false,
	app: null,
	ready: false,
	failed: false,
	snapshot() {
		return JSON.parse(
			JSON.stringify({
				cards: Store.state.cards,
				items: Store.state.items,
				seconds: Store.state.seconds,
				preferences: Store.state.preferences,
				...Store.legacyFields,
			}),
		);
	},
	async request(path?: any, body?: any) {
		const response = await fetch("/api/local/" + path, {
			signal: AbortSignal.timeout(5000),
			...(body
				? {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(body),
					}
				: {}),
		});
		const value = await response.json();
		if (!response.ok) throw new Error(errorMessage(value.error));
		return value;
	},
	persist() {
		try {
			localStorage.setItem(
				"sill-unsynced",
				JSON.stringify({
					state: this.snapshot(),
					pending: this.pending,
					revision: this.unversioned ? null : this.revision,
				}),
			);
			this.durable = true;
			return true;
		} catch {
			this.durable = false;
			this.app.toast(copy("web.localsync.a71ccc92334c"));
			return false;
		}
	},
	status(message?: any) {
		let bar = document.getElementById("sync-status");
		let panel = document.getElementById("sync-status-panel");
		if (!bar) {
			bar = document.createElement("section");
			bar.id = "sync-status";
			bar.setAttribute("aria-label", copy("web.localsync.850476dde139"));
			const search = document.getElementById("home-search-field");
			if (search) search.before(bar);
			else document.body.append(bar);
			panel = document.createElement("div");
			panel.id = "sync-status-panel";
			panel.setAttribute("popover", "auto");
			panel.setAttribute("role", "dialog");
			panel.setAttribute("aria-labelledby", "sync-status-title");
			document.body.append(panel);
			const position = () => {
				const gap = parseFloat(
					getComputedStyle(document.documentElement).getPropertyValue("--space-8"),
				);
				panel.style.setProperty(
					"--sync-panel-top",
					`${bar.getBoundingClientRect().bottom + gap}px`,
				);
			};
			bar.addEventListener("click", position);
			window.addEventListener("resize", position);
			panel.addEventListener("toggle", () => {
				bar
					.querySelector("button")
					?.setAttribute("aria-expanded", String(panel.matches(":popover-open")));
			});
		}
		bar.hidden = !message;
		if (!message) {
			panel.hidePopover();
			return;
		}
		const title = copy(
			this.pending.length ? "web.localsync.01a354fa55b5" : "web.localsync.e43a56d649b4",
		);
		const expanded = panel.matches(":popover-open") || this.durable === false;
		bar.innerHTML = `<button type="button" class="icon-button" popovertarget="sync-status-panel" aria-expanded="${expanded}" aria-label="${esc(title)}" title="${esc(title)}">${icon("info")}</button><span class="sr-only" role="status">${esc(title)}。${esc(message)}</span>`;
		panel.innerHTML = `<div class="sync-status-copy"><strong id="sync-status-title">${esc(title)}</strong><p>${esc(message)}</p></div>
			<div class="sync-status-actions">
				<button type="button" class="icon-button sync-status-retry" data-action="sync-retry" aria-label="${copy("web.localsync.87d53fea3f05")}" title="${copy("web.localsync.87d53fea3f05")}">${icon("refresh")}</button>
				<button type="button" class="icon-button" data-action="sync-export" aria-label="${copy("web.localsync.9d43037aecb7")}" title="${copy("web.localsync.9d43037aecb7")}">${icon("download")}</button>
				<button type="button" class="text-button sync-status-discard" data-action="sync-discard">${copy("web.localsync.169c72a6d254")}</button>
				<button type="button" class="icon-button" popovertarget="sync-status-panel" popovertargetaction="hide" aria-label="${copy("web.close")}">${icon("x")}</button>
			</div>`;
		if (expanded) {
			bar.dispatchEvent(new Event("click"));
			panel.showPopover();
		}
	},
	async discard() {
		const value = await this.request("state");
		this.pending = [];
		this.failed = false;
		this.unversioned = false;
		this.recovering = false;
		localStorage.removeItem("sill-unsynced");
		this.adopt(value);
		this.status("");
		this.app.setOffline(false);
	},
	connect(app?: any) {
		if (this.connection) return this.connection;
		this.connection = this.connectOnce(app).finally(() => {
			this.connection = null;
		});
		return this.connection;
	},
	async connectOnce(app?: any) {
		this.app = app;
		// Restore and journal before any request: a read outage must not disable saving.
		if (!this.saveWrapped) {
			let draft: any,
				revision = null;
			try {
				draft = JSON.parse(localStorage.getItem("sill-unsynced") || "null");
				revision = JSON.parse(localStorage.getItem("sill-sync-revision") || "null");
			} catch {}
			if (draft?.state && Array.isArray(draft.pending) && draft.pending.length) {
				this.pending = draft.pending;
				this.recovering = true;
				this.unversioned = !Number.isInteger(draft.revision);
				this.adopt({ state: draft.state, revision: draft.revision }, { draft: true });
			} else {
				this.baseline = this.snapshot();
				this.revision = revision;
				this.unversioned = !Number.isInteger(revision);
			}
			const save = Store.save.bind(Store);
			Store.save = () => {
				save();
				this.capture();
			};
			this.saveWrapped = true;
			if (this.pending.length) this.status(copy("web.localsync.75cb8d103bf3"));
		}
		try {
			let value = await this.request("state");
			if (!value.state) {
				if (this.pending.length) throw new Error(copy("web.localsync.dad2dac11daa"));
				value = await this.request("initialize", this.snapshot());
			}
			// In-memory edits made during this request are newer than the initial journal.
			if (!this.pending.length) {
				this.adopt(value);
				this.unversioned = false;
			}
			this.ready = true;
			clearInterval(this.timer);
			this.timer = setInterval(() => this.refresh().catch(() => {}), 1000);
			if (!this.focusListener) {
				window.addEventListener("focus", () => this.refresh().catch(() => {}));
				this.focusListener = true;
			}
			if (this.pending.length) await this.flush();
			else {
				this.failed = false;
				this.status("");
				app.setOffline(false);
			}
		} catch (error) {
			this.failed = true;
			app.grid.dataset.sync = "error";
			if (!app.pullRefreshFeedback) app.setOffline(true);
			this.status(copy("web.localsync.915294ca4e9a"));
			if (!app.pullRefreshFeedback) app.toast(copy("web.localsync.d32966c7535e") + error.message);
		}
	},
	capture() {
		if (!this.baseline) return;
		const next = this.snapshot(),
			before = this.baseline,
			operations = [];
		// Cards created or edited on the page (capture, inline notes) travel as whole cards.
		const oldCards = new Map<any, any>(
				before.cards.map((card?: any) => [card.id, JSON.stringify(card)]),
			),
			newIds = new Set<any>(next.cards.map((card?: any) => card.id));
		for (const card of next.cards.slice().reverse())
			if (oldCards.get(card.id) !== JSON.stringify(card))
				operations.push({
					op: "card.upsert",
					card,
					before: oldCards.has(card.id) ? JSON.parse(oldCards.get(card.id)) : null,
				});
		for (const id of oldCards.keys())
			if (!newIds.has(id))
				operations.push({ op: "card.delete", id, before: JSON.parse(oldCards.get(id)) });
		for (const [id, item] of Object.entries(next.items)) {
			if (!next.cards.some((card?: any) => card.id === id)) continue;
			const values: Record<string, any> = {},
				previous: Record<string, any> = {};
			for (const [key, value] of Object.entries(item))
				if (JSON.stringify(value) !== JSON.stringify(before.items[id]?.[key])) {
					values[key] = value;
					previous[key] = before.items[id]?.[key];
				}
			if (Object.keys(values).length)
				operations.push({ op: "item.patch", id, values, before: previous });
		}
		const values: Record<string, any> = {},
			previous: Record<string, any> = {};
		for (const [key, value] of Object.entries(next.preferences))
			if (JSON.stringify(value) !== JSON.stringify(before.preferences[key])) {
				values[key] = value;
				if (before.preferences[key] !== undefined) previous[key] = before.preferences[key];
			}
		if (Object.keys(values).length)
			operations.push({ op: "preferences.patch", values, before: previous });
		const seconds = next.seconds - before.seconds;
		if (seconds > 0) operations.push({ op: "reading.add", seconds });
		this.baseline = next;
		if (operations.length) {
			this.app.grid.dataset.sync = "pending";
			this.pending.push({ operations });
			if (!this.ready) this.recovering = true;
			this.persist();
			if (this.failed || !this.ready)
				this.status(
					this.durable ? copy("web.localsync.d533dff610de") : copy("web.localsync.99c07641f231"),
				);
			else this.flush();
		}
	},
	async flush() {
		if (this.busy || !this.pending.length) return;
		this.busy = true;
		try {
			while (this.pending.length) {
				if (this.unversioned) throw new Error(copy("web.localsync.2cc04acca32d"));
				// Whole-card writes carry their original card. Independent reading
				// observations can still merge without invalidating unrelated edits.
				const batch: Record<string, any> = {
					...this.pending[0],
					...(this.recovering ? { expectedRevision: this.revision } : {}),
				};
				this.persist();
				const value = await this.request("operations", batch);
				this.pending.shift();
				this.revision = value.revision;
				this.persist();
				if (!this.pending.length) this.adopt(value);
			}
			localStorage.removeItem("sill-unsynced");
			this.status("");
			this.failed = false;
			this.recovering = false;
			this.app.grid.dataset.sync = "saved";
			this.app.setOffline(false);
			const inline = document.getElementById("inline-state");
			if (inline) inline.textContent = copy("web.localsync.7eebbcad84fe");
		} catch (error) {
			this.failed = true;
			this.recovering = true;
			this.persist();
			this.status(
				error.message +
					(this.durable ? copy("web.localsync.70a127f4ad3b") : copy("web.localsync.a6df691251ec")),
			);
			this.app.grid.dataset.sync = "error";
			if (!this.app.pullRefreshFeedback) this.app.setOffline(true);
			if (!this.app.pullRefreshFeedback)
				this.app.toast(
					copy("web.localsync.1f2cebc0e229") +
						error.message +
						(this.durable
							? copy("web.localsync.6977ea101328")
							: copy("web.localsync.6851027b3171")),
				);
		} finally {
			this.busy = false;
		}
	},
	async refresh(manual: any = false) {
		if (!this.ready) {
			if (manual) {
				await this.connect(this.app);
				return !!this.ready && !this.failed;
			}
			throw new Error(copy("web.localsync.e43a56d649b4"));
		}
		if (this.busy) return false;
		if (this.failed && !manual) return;
		if (manual) this.failed = false;
		if (this.pending.length) {
			await this.flush();
			if (this.pending.length) throw new Error(copy("web.localsync.01a354fa55b5"));
			return;
		}
		// Keep an editor's original values until its save can be checked for conflicts.
		if (this.app.modalKind === "editor" || this.app.editingId) return false;
		const value = await this.request("state");
		if (
			!this.busy &&
			!this.pending.length &&
			this.app.modalKind !== "editor" &&
			!this.app.editingId &&
			value.revision !== this.revision
		)
			this.adopt(value);
	},
	adopt(value?: any, { draft = false }: any = {}) {
		if (!value.state) return;
		const app = this.app;
		const previewBefore = JSON.stringify([
			Store.card(app.currentId),
			Store.state.items[app.currentId],
		]);
		const changed =
			JSON.stringify([Store.state.cards, Store.state.items, Store.state.preferences]) !==
			JSON.stringify([value.state.cards, value.state.items, value.state.preferences]);
		this.revision = value.revision;
		if (!draft)
			try {
				localStorage.setItem("sill-sync-revision", JSON.stringify(value.revision));
			} catch {}
		const editingCard = app.editingId ? Store.card(app.editingId) : null;
		const editingItems = new Map<string, Record<string, any>>(
			(app.modalKind === "editor" ? app.bulkEditIds || [app.editId] : []).map((id: string) => [
				id,
				{ ...Store.state.items[id] },
			]),
		);
		const { sources, ...state } = value.state;
		Object.assign(Store.state, state);
		Store.legacyFields = Object.hasOwn(value.state, "sources") ? { sources } : {};
		Store.state.storageAvailable = true;
		// A response to an unrelated reading observation may include external edits.
		// Keep the inline editor's original card until its conditional save finishes.
		if (editingCard) {
			const index = Store.state.cards.findIndex((c?: any) => c.id === editingCard.id);
			if (index >= 0) Store.state.cards[index] = editingCard;
			else Store.state.cards.push(editingCard);
		}
		// Keep the note/tag editor's original fields, including absent values.
		// Unrelated save responses must not turn stale input into a valid overwrite.
		for (const [id, original] of editingItems) {
			const item = { ...Store.state.items[id] };
			for (const key of ["note", "tags", "tagsEdited"]) {
				if (Object.hasOwn(original, key)) item[key] = original[key];
				else delete item[key];
			}
			Store.state.items[id] = item;
		}
		this.baseline = this.snapshot();
		// Write the browser backup without enqueueing another remote operation.
		try {
			localStorage.setItem(Store.key, JSON.stringify(Store.serialized()));
		} catch {}
		app.grid.dataset.sync = "saved";
		app.grid.dataset.revision = value.revision;
		if (!changed) return;
		app.feedNow = Date.now();
		app.applyPreferences();
		if (!app.editingId) app.withFeedAnchor(() => {}, true);
		if (app.modalKind === "settings") app.repaintSettings();
		if (app.modalKind === "preview" && !app.sheetLeaving) {
			const card = Store.card(app.currentId);
			if (!card) {
				app.closeNative();
				history.replaceState({ glass: true, prev: null }, "", "#feed");
			} else if (previewBefore !== JSON.stringify([card, Store.state.items[app.currentId]])) {
				app.modalToken++;
				app.replacePanelContent(Panels.preview(app, card));
				app.bindPreview(card.id);
				app.gestures.bindPullDown();
			}
		}
		app.checkReminders();
		app.grid.dataset.sync = "saved";
		app.grid.dataset.revision = value.revision;
	},
};

export { LocalSync };
