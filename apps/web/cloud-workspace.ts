import { createElement } from "react";
import { paintCloudDraft, stashCloudDraft } from "./cloud-compose.ts";
import { app, Cloud, callbackFailed, messages, sync } from "./cloud-entry.ts";
import { copy } from "./copy.ts";
import { cloudCard } from "./data/cloud-card.ts";
import { sameData } from "./data/same-data.ts";
import { Store } from "./data/store.ts";
import { clone } from "./services/cloud-sync.ts";
import { cloudViewCard } from "./services/cloud-view-state.ts";
import { systemReminders } from "./services/system-reminders.ts";
import { RecoveryNotice } from "./views/cloud-views.tsx";
import { previewContent } from "./views/preview-controller.ts";
import { renderView } from "./views/react-renderer.ts";
export async function cloudApi(path?: any, options: any = {}) {
	if (path.startsWith("/api/v1/") && Cloud.user)
		options = { ...options, headers: { "X-Sill-Owner": Cloud.user, ...options.headers } };
	const controller = new AbortController();
	let timer: any;
	const request = async () => {
		if (window.__SILL_HOST__) return window.__SILL_HOST__.request(path, options);
		const response = await fetch(path, {
			credentials: "same-origin",
			...options,
			signal: controller.signal,
			headers: { "Content-Type": "application/json", ...options.headers },
		});
		const data = await response.json();
		if (!response.ok)
			throw Object.assign(
				new Error(messages[data.error?.code] || copy("web.cloudentry.0fbd4b71b22a")),
				{ status: response.status, code: data.error?.code },
			);
		return data;
	};
	try {
		return await Promise.race([
			request(),
			new Promise((_?: any, reject?: any) => {
				timer = window.setTimeout(() => {
					reject(
						Object.assign(new Error(copy("web.cloudentry.2c0aea973586")), {
							code: "request_timeout",
						}),
					);
					controller.abort();
				}, 20000);
			}),
		]);
	} catch (error) {
		error.message =
			messages[error.code] ||
			(error.code === "request_timeout"
				? error.message
				: error.status
					? error.message
					: copy("web.cloudentry.46c0485bf936"));
		throw error;
	} finally {
		clearTimeout(timer);
	}
}
export function accountView() {
	document.body.classList.toggle("cloud-signed-in", !!Cloud.user);
	// The rail face shows the signed-in person's initial when the session names them; otherwise a neutral person.
	window.__SILL_ACCOUNT__ = Cloud.user ? Cloud.displayName || "" : "";
	app.paintAccount?.();
}
export function clearCloud({ retainDrafts = false }: any = {}) {
	systemReminders.bind(null);
	app.drag?.cancel();
	app.modalToken++;
	app.previewTrail = [];
	app.detailPositions.clear();
	app.detailScope = "";
	app.panelReturn = null;
	app.lastFocus = null;
	clearTimeout(app.searchTimer);
	clearTimeout(app.navTimer);
	clearTimeout(app.navOpenTimer);
	app.homeSelected.clear();
	app.searchSelected.clear();
	app.aiSelectionIds = [];
	app.aiDraft = "";
	app.renderAIDock?.();
	app.selectAnchor = "";
	app.searchSelectAnchor = "";
	app.searchFilter = { type: "all", status: "all", tag: "", query: "", pinned: false };
	app.searchScroll = 0;
	app.searchLimit = 40;
	app.searchFocus = undefined;
	// Account-bound snapshots must never be restored when the foreground view closes.
	app.discardSearchBackground();
	app.updateSelection();
	if (retainDrafts) stashCloudDraft();
	const keepEditor =
		retainDrafts && app.modalKind === "cloud-editor" && Cloud.drafts.has(Cloud.edit?.id || "new");
	Cloud.lastOwner = Cloud.user || Cloud.lastOwner;
	Cloud.epoch++;
	Cloud.user = null;
	Cloud.displayName = "";
	Cloud.pending = null;
	Cloud.connectionError = retainDrafts;
	Cloud.records.clear();
	if (retainDrafts && sync.pending.length) sync.suspended = true;
	else sync.reset();
	Store.load();
	if (retainDrafts) {
		for (const draft of Cloud.drafts.values()) draft.locked = true;
		Cloud.editLocked = true;
	} else {
		Cloud.edit = null;
		Cloud.editOwner = null;
		Cloud.editLocked = false;
		Cloud.drafts.clear();
	}
	if (!keepEditor) {
		Cloud.edit = null;
		// Finish immediately, even if a drawer dismissal was already animating.
		app.sheetLeaving = false;
		app.closeNative(false);
		app.dialog.replaceChildren();
		app.currentId = "";
		app.previewTrail = [];
		app.lastFocus = null;
		history.replaceState({ glass: true, prev: null }, "", "#feed");
		app.lastRouteHash = "#feed";
	}
	app.searchScroll = 0;
	app.renderCurrent(true);
	accountView();
	if (keepEditor) {
		document.querySelectorAll("#cloud-editor input,#cloud-editor textarea").forEach((e?: any) => {
			e.disabled = false;
		});
		document.getElementById("cloud-save-status").textContent = copy("web.cloudentry.9f5803dd5a71");
		paintCloudDraft();
	}
}
export function cloudConnection() {
	// Loading shows as the thin arc around the face; there is no refresh button.
	document
		.getElementById("dock")
		?.classList.toggle("is-busy", !!Cloud.loading && !Cloud.refreshFeedback);
	const offline = document.getElementById("offline");
	offline.dataset.action = "refresh";
	offline.hidden = !!Cloud.refreshFeedback || !Cloud.connectionError || !Cloud.user;
	offline.textContent = copy("web.cloudentry.4e0831bcbc99");
}
export function workspaceState() {
	const cards = Store.state.cards.map((card: any) => {
		const raw = Cloud.records.get(card.id);
		if (!raw) return card;
		const projected = cloudCard(raw);
		const value = { ...card };
		for (const key of Object.keys(projected))
			if (!(key in raw) && JSON.stringify(value[key]) === JSON.stringify(projected[key]))
				delete value[key];
		return value;
	});
	return {
		cards,
		items: Store.state.items,
		preferences: Store.state.preferences,
		seconds: Store.state.seconds,
	};
}
let saveNoticeTimer: ReturnType<typeof setTimeout> | undefined;
let saveNoticeVisible = false;
let saveNoticeState = "idle";
let observedWrites = 0;

export function syncStatus() {
	app.grid.dataset.sync = sync.failed ? "error" : sync.pending.length ? "pending" : "saved";
	let bar = document.getElementById("cloud-sync-status");
	if (!bar) {
		bar = document.createElement("section");
		bar.id = "cloud-sync-status";
		bar.className = "cloud-recovery glass";
		bar.hidden = true;
		document.body.append(bar);
	}
	const pending = sync.pending.some((batch) =>
		batch.body.operations.some((operation: { op: string }) => operation.op !== "reading.add"),
	);
	const state = sync.failed ? "error" : pending ? "pending" : "idle";
	const confirmed = sync.completedWrites > observedWrites;
	observedWrites = sync.completedWrites;
	if (state === saveNoticeState && state !== "error") return;
	const previous = saveNoticeState;
	saveNoticeState = state;
	clearTimeout(saveNoticeTimer);
	const show = (message: string) => {
		(app.dialog.open ? app.dialog : document.body).append(bar);
		renderView(bar, createElement("span", { role: "status" }, message));
		bar.hidden = false;
	};
	if (state === "error") {
		saveNoticeVisible = false;
		(app.dialog.open ? app.dialog : document.body).append(bar);
		bar.hidden = false;
		renderView(bar, createElement(RecoveryNotice, { message: sync.failed.message }));
	} else if (state === "pending") {
		bar.hidden = true;
		saveNoticeVisible = false;
		// Fast saves stay silent; one notice covers the whole queue of changes.
		saveNoticeTimer = setTimeout(() => {
			saveNoticeVisible = true;
			show(copy("web.cloudentry.6bdb4435095e"));
		}, 800);
	} else {
		// A reset/logout is not a save receipt. Only a drained queue can confirm a save.
		if ((saveNoticeVisible || previous === "error") && confirmed && Cloud.user) {
			show(copy("web.cloudentry.1bd91a7d0c53"));
			saveNoticeTimer = setTimeout(() => {
				bar.hidden = true;
			}, 1800);
		} else bar.hidden = true;
		saveNoticeVisible = false;
	}
}
/** The first session check answered; returns whether this call ended the boot state. */
export function endBoot() {
	if (!Cloud.booting) return false;
	Cloud.booting = false;
	Cloud.bootVisible = false;
	app.grid.removeAttribute("aria-busy");
	return true;
}
export function paintRecords(redraw = true) {
	Store.state.cards = [...Cloud.records.values()]
		.filter((c: any) => !c.deleted)
		.map((c: any) => cloudCard(c));
	if (!redraw) return;
	app.checkReminders();
	// The first snapshot appears together; later updates keep their arrival transition.
	if (endBoot()) {
		app.initializing = true;
		try {
			app.renderCurrent(false);
		} finally {
			app.initializing = false;
		}
	} else app.withFeedAnchor(() => {}, true);
}
/** What the page draws: absent item fields read as their defaults, field order is ignored. */
function drawnState(cards: any[], items: any, preferences: any) {
	return {
		cards: cards.map((card: any) => cloudViewCard(card, items?.[card.id])),
		preferences: { ...Store.fresh().preferences, ...preferences },
	};
}
export function adoptWorkspace(value: any) {
	// A save response that confirms the page's optimistic state keeps the mounted cards and detail.
	const changed =
		Cloud.booting ||
		!sameData(
			drawnState([...Cloud.records.values()], Store.state.items, Store.state.preferences),
			drawnState(value.state.cards, value.state.items, value.state.preferences),
		);
	const detailChanged = !sameData(
		cloudViewCard(Cloud.records.get(app.currentId), Store.state.items[app.currentId]),
		cloudViewCard(
			value.state.cards.find((card: any) => card.id === app.currentId),
			value.state.items[app.currentId],
		),
	);
	const editingIds: string[] = app.editorLayer?.open ? app.bulkEditIds || [app.editId] : [];
	const editingItems = new Map<string, any>(
		editingIds.map((id) => [id, clone(Store.state.items[id] || {})]),
	);
	const editingTags = new Map(editingIds.map((id) => [id, Cloud.records.get(id)?.tags]));
	Cloud.records = new Map(value.state.cards.map((c: any) => [c.id, c]));
	Store.state.items = clone(value.state.items);
	Store.state.preferences = { ...Store.fresh().preferences, ...value.state.preferences };
	Store.state.seconds = value.state.seconds;
	Store.state.storageAvailable = true;
	for (const [id, original] of editingItems) {
		const item = Store.state.items[id] || {};
		if ("note" in original) item.note = original.note;
		else delete item.note;
		Store.state.items[id] = item;
		const record = Cloud.records.get(id);
		if (!record) continue;
		const { tags: _remote, ...card } = record;
		const tags = editingTags.get(id);
		Cloud.records.set(id, tags ? { ...card, tags } : card);
	}
	app.applyPreferences();
	paintRecords(changed);
	sync.rebase(workspaceState(), value.revision, Cloud.user);
	app.grid.dataset.revision = value.revision;
	syncStatus();
	if (!changed) return;
	if (app.modalKind === "settings") app.repaintSettings();
	if (detailChanged && app.modalKind === "preview" && !app.sheetLeaving) {
		const card = Store.card(app.currentId);
		if (!card) app.closeNative();
		else {
			app.replacePanelContent(previewContent(app, card), true);
			app.bindPreview(card.id);
			app.gestures.bindPullDown();
		}
	}
}
export async function loadCloud(options: any = {}) {
	// A foreground pull joins an in-flight read instead of reporting false success/failure.
	if (Cloud.loadPromise) return Cloud.loadPromise;
	const pending = loadCloudOnce(options);
	Cloud.loadPromise = pending;
	try {
		return await pending;
	} finally {
		if (Cloud.loadPromise === pending) Cloud.loadPromise = null;
	}
}
export async function loadCloudOnce({ initial = false, quiet = false }: any = {}) {
	if (
		Cloud.loading ||
		Cloud.busy ||
		Cloud.pending ||
		sync.busy ||
		(sync.pending.length && !sync.suspended) ||
		app.editorLayer?.open
	)
		return false;
	Cloud.loading = true;
	cloudConnection();
	const epoch = Cloud.epoch,
		writeVersion = Cloud.writeVersion;
	let checkingSession = true;
	try {
		const session = await cloudApi("/auth/session");
		checkingSession = false;
		const value = await cloudApi("/api/v1/workspace", {
			headers: {
				"X-Sill-Owner": session.userId,
				...(sync.baseline && sync.owner === session.userId && !sync.suspended
					? { "X-Sill-Revision": String(sync.revision) }
					: {}),
			},
		});
		if (epoch !== Cloud.epoch || writeVersion !== Cloud.writeVersion) return false;
		Cloud.connectionError = false;
		Cloud.scopes = session.scopes || null;
		Cloud.user = session.userId;
		Cloud.displayName = session.name || session.email || "";
		if (sync.suspended && sync.owner === Cloud.user) {
			// Authentication cleared the view, not the user's optimistic edits.
			const optimistic = sync.resume(Cloud.user);
			if (optimistic) adoptWorkspace({ state: optimistic, revision: sync.revision });
		}
		if (
			!value.unchanged &&
			!sync.pending.length &&
			!sync.busy &&
			(!sync.baseline || sync.owner !== Cloud.user || sync.revision !== value.revision)
		)
			adoptWorkspace(value);
		accountView();
		return true;
	} catch (error) {
		if (epoch !== Cloud.epoch || writeVersion !== Cloud.writeVersion) return false;
		Cloud.connectionError = true;
		if (
			initial &&
			checkingSession &&
			error.status === 401 &&
			!window.__SILL_HOST__ &&
			!Cloud.drafts.size &&
			!sync.pending.length
		) {
			Cloud.redirecting = true;
			location.replace("/auth/login" + (callbackFailed ? "?login_error=1" : ""));
			return false;
		}
		endBoot();
		if (!Cloud.user) app.renderCurrent(false);
		if (error.status === 401 || error.status === 403) clearCloud({ retainDrafts: true });
		if (!quiet && !Cloud.refreshFeedback && !(initial && checkingSession && error.status === 401))
			app.alert(error.message);
		return false;
	} finally {
		Cloud.loading = false;
		cloudConnection();
	}
}
