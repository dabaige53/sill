import { button, esc } from "./atoms/primitives.ts";
import { copy } from "./copy.ts";
import { cloudCard, cloudCardChanges } from "./data/cloud-card.ts";
import { demoBase, SeedCards, SeedItems } from "./data/cards.ts";
import { CloudSync, clone } from "./services/cloud-sync.ts";
import { Store } from "./data/store.ts";
import { Panels, welcomeHTML } from "./interactions/panels.ts";
import { AppController } from "./views/app.ts";

/* Authenticated cloud build only. No credentials or private cards in browser storage. */
// Invitation/legacy implicit fragments are never accepted as app sessions.
if (/(?:access_token|refresh_token|error_description)=/.test(location.hash))
	history.replaceState(null, "", location.pathname);
window.__QG_LOCAL__ = false;
window.__QG_RUNTIME__ = false;
Store.load = function () {
	this.state = this.fresh();
	this.state.preferences.onboarded = true;
	return this.state;
};
Store.save = function () {};
const Cloud: Record<string, any> = {
	user: null,
	records: new Map<any, any>(),
	drafts: new Map<any, any>(),
	edit: null,
	editOwner: null,
	editLocked: false,
	pending: null,
	busy: false,
	epoch: 0,
	writeVersion: 0,
	loading: false,
	connectionError: false,
	loginUntil: 0,
};
const callbackFailed = new URL(location.href).searchParams.has("login_error");
if (callbackFailed) history.replaceState(null, "", location.pathname + location.hash);
function cloudWelcome() {
	const recovery = [...Cloud.drafts]
		.filter(([, draft]: any) => draft.locked)
		.map(
			([key, draft]: any) =>
				`<button type="button" class="soft-button" data-action="resume-draft" data-id="${esc(key)}">${copy("web.cloudentry.b9e8d3a1bc64")}${esc(draft.values.title || copy("web.unnamedNote"))}</button>`,
		)
		.join("");
	if (window.__SILL_HOST__ && !Cloud.user && !Cloud.connectionError)
		return welcomeHTML({
			actions: recovery,
			detail: `<p class="cloud-detail" role="status">${copy("web.cloudentry.c4b63bd25d98")}</p>`,
		});
	if (window.__SILL_HOST__ && !Cloud.user)
		return welcomeHTML({
			actions:
				`<button type="button" class="solid-button" data-action="refresh">${copy("web.cloudentry.b31296c9c33e")}</button>` +
				recovery,
			detail: `<p class="cloud-detail">${copy("web.cloudentry.8b8a45a6a4a2")}</p>`,
		});
	return welcomeHTML({
		actions:
			(Cloud.user
				? `<button type="button" class="solid-button" data-action="capture">${copy("web.cloudentry.21dfdf7a86e7")}</button><button type="button" class="text-link" data-action="welcome-demo">${copy("web.panels.0245f51ac89a")}</button>`
				: `<a class="solid-button" href="/auth/login">${copy("web.cloudentry.be4ece4b22aa")}</a><form id="cloud-login"><label for="cloud-email">${copy("web.cloudentry.d261be8e9b91")}</label><input id="cloud-email" name="email" type="email" autocomplete="email" required placeholder="${copy("web.cloudentry.27558ddc9803")}" aria-describedby="cloud-login-status"><button class="solid-button" type="submit">${copy("web.cloudentry.92b193fad920")}</button><p id="cloud-login-status" role="status">${callbackFailed ? copy("web.cloudentry.83bf2b73aee3") : copy("web.cloudentry.5eef9638100a")}</p></form>`) +
			recovery,
		detail: recovery
			? `<p class="cloud-detail">${copy("web.cloudentry.a7c0c329d7a1")}</p>`
			: Cloud.user
				? `<p class="cloud-detail">${copy("web.cloudentry.4da32c150cfa")}</p>`
				: "",
	});
}
const app = new AppController();
const originalDeskHTML = app.deskHTML.bind(app);
app.deskHTML = function () {
	if (!Cloud.user || !Store.state.cards.length) return cloudWelcome();
	return originalDeskHTML();
};
app.init();
const sync = new CloudSync({
	snapshot: workspaceState,
	adopt: adoptWorkspace,
	owner: () => Cloud.user,
	request: (body, key, owner) => {
		Cloud.writeVersion++;
		return cloudApi("/api/v1/workspace/operations", {
			method: "POST",
			headers: { "Idempotency-Key": key, "X-Sill-Owner": owner },
			body: JSON.stringify(body),
		});
	},
	canSave: () =>
		!!Cloud.user &&
		!Cloud.busy &&
		!Cloud.pending &&
		!Cloud.discarding &&
		(!Cloud.scopes || Cloud.scopes.includes("content:write")),
	status: syncStatus,
	failure: (error) => {
		if (error.status === 401 || error.status === 403) {
			sync.suspended = true;
			clearCloud({ retainDrafts: true });
		}
		app.toast(error.message);
	},
});
Store.save = () => {
	if (
		Cloud.user &&
		!Cloud.discarding &&
		!sync.suspended &&
		(!Cloud.scopes || Cloud.scopes.includes("content:write"))
	)
		sync.capture();
};
const persistentPatch = Store.patch.bind(Store);
Store.patch = (id: any, values: any) => {
	if (
		Cloud.user &&
		!Cloud.discarding &&
		!sync.suspended &&
		(!Cloud.scopes || Cloud.scopes.includes("content:write"))
	)
		persistentPatch(id, values);
};
const messages: Record<string, any> = {
	rate_limited: copy("web.cloudentry.040740f33308"),
	unauthenticated: copy("web.cloudentry.18b4f39557c3"),
	forbidden: copy("web.cloudentry.09bd4dab7584"),
	revision_conflict: copy("web.cloudentry.b942f016ffdc"),
	idempotency_conflict: copy("web.cloudentry.7780180e644e"),
	not_found: copy("web.cloudentry.118d8bd2ba6f"),
	unavailable: copy("web.cloudentry.e88edcc61c1f"),
};
async function cloudApi(path?: any, options: any = {}) {
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
function accountView() {
	document.body.classList.toggle("cloud-signed-in", !!Cloud.user);
}

function clearCloud({ retainDrafts = false }: any = {}) {
	if (retainDrafts) stashCloudDraft();
	const keepEditor =
		retainDrafts && app.modalKind === "cloud-editor" && Cloud.drafts.has(Cloud.edit?.id || "new");
	Cloud.lastOwner = Cloud.user || Cloud.lastOwner;
	Cloud.epoch++;
	Cloud.user = null;
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
		app.closeNative();
	}
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
function cloudConnection() {
	const refresh = document.querySelector(".dock-tools [data-action=refresh]");
	refresh?.setAttribute("aria-busy", String(Cloud.loading));
	const offline = document.getElementById("offline");
	offline.dataset.action = "refresh";
	offline.hidden = !Cloud.connectionError || !Cloud.user;
	offline.textContent = copy("web.cloudentry.4e0831bcbc99");
}
function workspaceState() {
	const cards = Store.state.cards.map((card: any) => {
		const raw = Cloud.records.get(card.id);
		if (!raw) return card;
		const projected = cloudCard(raw, {
			source: copy("web.cloudentry.e70adb19c721"),
			meta: copy("web.cloudentry.1bd91a7d0c53"),
		});
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
function syncStatus() {
	app.grid.dataset.sync = sync.failed ? "error" : sync.pending.length ? "pending" : "saved";
	let bar = document.getElementById("cloud-sync-status");
	if (!bar) {
		bar = document.createElement("section");
		bar.id = "cloud-sync-status";
		bar.className = "cloud-recovery glass";
		document.body.append(bar);
	}
	bar.hidden = !sync.failed;
	if (sync.failed)
		bar.innerHTML = `<span role="status">${esc(sync.failed.message)}</span><button class="text-link" data-action="sync-retry">${copy("web.localsync.87d53fea3f05")}</button><button class="text-link" data-action="sync-export">${copy("web.localsync.9d43037aecb7")}</button><button class="text-link" data-action="sync-discard">${copy("web.localsync.169c72a6d254")}</button>`;
}
function paintRecords() {
	Store.state.cards = [...Cloud.records.values()]
		.filter((c: any) => !c.deleted)
		.map((c: any) =>
			cloudCard(c, {
				source: copy("web.cloudentry.e70adb19c721"),
				meta: copy("web.cloudentry.1bd91a7d0c53"),
			}),
		);
	app.withFeedAnchor(() => {}, true);
}
function adoptWorkspace(value: any) {
	const editingItems = new Map<string, any>(
		(app.modalKind === "editor" ? app.bulkEditIds || [app.editId] : []).map((id: string) => [
			id,
			clone(Store.state.items[id] || {}),
		]),
	);
	Cloud.records = new Map(value.state.cards.map((c: any) => [c.id, c]));
	Store.state.items = clone(value.state.items);
	Store.state.preferences = { ...Store.fresh().preferences, ...value.state.preferences };
	Store.state.seconds = value.state.seconds;
	Store.state.storageAvailable = true;
	for (const [id, original] of editingItems) {
		const item = Store.state.items[id] || {};
		for (const key of ["note", "tags", "tagsEdited"]) {
			if (key in original) item[key] = original[key];
			else delete item[key];
		}
		Store.state.items[id] = item;
	}
	paintRecords();
	sync.rebase(workspaceState(), value.revision, Cloud.user);
	app.applyPreferences();
	app.grid.dataset.revision = value.revision;
	if (app.modalKind === "settings") app.repaintSettings();
	if (app.modalKind === "preview" && !app.sheetLeaving) {
		const card = Store.card(app.currentId);
		if (!card) app.closeNative();
		else {
			app.replacePanelContent(Panels.preview(app, card));
			app.bindPreview(card.id);
			app.gestures.bindPullDown();
		}
	}
}
async function loadCloud({ initial = false }: any = {}) {
	if (
		Cloud.loading ||
		Cloud.busy ||
		Cloud.pending ||
		sync.busy ||
		(sync.pending.length && !sync.suspended) ||
		app.modalKind === "editor"
	)
		return;
	Cloud.loading = true;
	cloudConnection();
	const epoch = Cloud.epoch,
		writeVersion = Cloud.writeVersion;
	let checkingSession = true;
	try {
		const session = await cloudApi("/auth/session");
		checkingSession = false;
		const value = await cloudApi("/api/v1/workspace", {
			headers: { "X-Sill-Owner": session.userId },
		});
		if (epoch !== Cloud.epoch || writeVersion !== Cloud.writeVersion) return;
		Cloud.connectionError = false;
		Cloud.scopes = session.scopes || null;
		Cloud.user = session.userId;
		if (sync.suspended && sync.owner === Cloud.user) {
			// Authentication cleared the view, not the user's optimistic edits.
			const optimistic = sync.resume(Cloud.user);
			if (optimistic) adoptWorkspace({ state: optimistic, revision: sync.revision });
		}
		if (
			!sync.pending.length &&
			!sync.busy &&
			(!sync.baseline || sync.owner !== Cloud.user || sync.revision !== value.revision)
		)
			adoptWorkspace(value);
		accountView();
	} catch (error) {
		if (epoch !== Cloud.epoch || writeVersion !== Cloud.writeVersion) return;
		Cloud.connectionError = true;
		if (!Cloud.user) app.renderCurrent(false);
		if (error.status === 401 || error.status === 403) clearCloud({ retainDrafts: true });
		if (!(initial && checkingSession && error.status === 401)) app.toast(error.message);
	} finally {
		Cloud.loading = false;
		cloudConnection();
	}
}
function cloudDraftValues() {
	const title = document.getElementById("cloud-title"),
		body = document.getElementById("cloud-body"),
		read = document.getElementById("cloud-read");
	if (!title || !body || !read) return null;
	return {
		title: (title as HTMLInputElement).value,
		body: (body as HTMLInputElement).value,
		read: (read as HTMLInputElement).checked,
	};
}
function stashCloudDraft() {
	if (!Cloud.edit || app.modalKind !== "cloud-editor") return false;
	const values = cloudDraftValues();
	if (!values) return false;
	const key = Cloud.edit.id || "new",
		dirty =
			values.title !== Cloud.edit.title ||
			values.body !== Cloud.edit.body.join("\n") ||
			values.read !== !!Cloud.edit.state.read;
	if (dirty)
		Cloud.drafts.set(key, {
			record: structuredClone(Cloud.edit),
			values,
			owner: Cloud.editOwner,
			locked: Cloud.editLocked,
		});
	else Cloud.drafts.delete(key);
	return dirty;
}
function paintCloudDraft() {
	const dirty = stashCloudDraft(),
		count = document.getElementById("cloud-word-count"),
		label = document.getElementById("cloud-draft-state");
	if (count)
		count.textContent =
			Array.from(
				(document.getElementById("cloud-body") as HTMLInputElement).value,
			).length.toLocaleString() + copy("web.cloudentry.457271dfe88b");
	if (label)
		label.textContent = Cloud.editLocked
			? copy("web.cloudentry.dfa346c0e69c")
			: dirty
				? copy("web.cloudentry.64a851526671")
				: copy("web.cloudentry.0bf312445188");
	const discard = document.getElementById("cloud-discard");
	if (discard) discard.hidden = !dirty;
	const save = document.getElementById("cloud-save");
	if (save) (save as HTMLInputElement).disabled = Cloud.busy || Cloud.editLocked;
}
function editCloud(id?: any) {
	if (id) return; // Existing content is edited by agents, never through a full-card form.
	if (Cloud.pending) {
		app.toast(copy("web.cloudentry.521779325b76"));
		return;
	}
	stashCloudDraft();
	const saved = Cloud.drafts.get(id || "new");
	if (!Cloud.user && !saved) {
		app.toast(copy("web.cloudentry.48144f96c150"));
		return;
	}
	if (!saved && Cloud.scopes && !Cloud.scopes.includes("content:write")) {
		app.toast(copy("web.cloudentry.e702cb114c76"));
		return;
	}
	const record = id ? Cloud.records.get(id) : null;
	if (id && !record && !saved) return;
	Cloud.edit =
		saved?.record ||
		(record
			? structuredClone(record)
			: { id: null, revision: null, title: "", body: [], state: { read: false } });
	Cloud.editOwner = saved?.owner || Cloud.user;
	// A different account must never receive the previous account's recovered draft.
	// The host and web session both expose a stable owner; another account cannot save this draft.
	Cloud.editLocked =
		!Cloud.user ||
		sync.suspended ||
		!!(saved && saved.owner !== Cloud.user) ||
		!!(Cloud.scopes && !Cloud.scopes.includes("content:write"));
	const values = saved?.values || {
		title: Cloud.edit.title,
		body: Cloud.edit.body.join("\n"),
		read: !!Cloud.edit.state.read,
	};
	originalOpen(
		`<div class="sheet cloud-compose"><header class="cloud-compose-head"><h1 id="modal-title">${id ? copy("web.cloudentry.b1c46471ae91") : copy("web.cloudentry.d3d2d99f6003")}</h1><span id="cloud-draft-state" role="status"></span>${button("x", copy("web.cloudentry.48ada7873f17"), "close")}</header><form id="cloud-editor"><div class="cloud-compose-body"><label class="sr-only" for="cloud-title">${copy("web.title")}</label><input id="cloud-title" required maxlength="1000" placeholder="${copy("web.cloudentry.a90371571cc7")}" value="${esc(values.title)}"><label class="sr-only" for="cloud-body">${copy("web.body")}</label><textarea id="cloud-body" rows="10" placeholder="${copy("web.cloudentry.cbef01d0a3d3")}">${esc(values.body)}</textarea><div class="cloud-compose-meta"><label><input id="cloud-read" type="checkbox" ${values.read ? "checked" : ""}>${copy("web.cloudentry.419893e7d756")}</label><span id="cloud-word-count" class="num"></span></div><p id="cloud-save-status" role="status"></p></div><footer class="cloud-compose-actions"><button class="solid-button" type="${window.__SILL_HOST__ ? "button" : "submit"}" id="cloud-save">${copy("web.cloudentry.c6a1f219cdc8")}</button><button type="button" class="soft-button" data-action="close">${copy("web.close")}</button><button type="button" class="text-link" id="cloud-discard" hidden>${copy("web.cloudentry.70403791a994")}</button>${id && (!Cloud.scopes || Cloud.scopes.includes("content:delete")) ? `<button class="text-link cloud-delete" type="button" id="cloud-delete">${copy("web.cloudentry.92d8b5e3dc99")}</button>` : ""}<span class="cloud-save-hint">⌘ / Ctrl + Enter</span></footer></form></div>`,
		"cloud-editor",
		null,
		"panel wide",
	);
	paintCloudDraft();
	if (Cloud.editLocked)
		document.getElementById("cloud-save-status").textContent = copy("web.cloudentry.ad946a9727a3");
	document.getElementById("cloud-title").focus({ preventScroll: true });
}
async function saveCloud(deleting: any = false) {
	if (Cloud.busy || !Cloud.edit || Cloud.editLocked || !Cloud.user) return;
	await sync.flush();
	if (sync.pending.length || sync.suspended) return;
	const draft = Cloud.edit;
	if (!Cloud.pending) {
		const values = cloudDraftValues();
		const changes = cloudCardChanges(draft, values);
		if (!values.title.trim() && !deleting) return;
		if (!deleting && draft.id && !Object.keys(changes).length) {
			Cloud.drafts.delete(draft.id);
			Cloud.edit = null;
			app.closeNative();
			return;
		}
		const payload = deleting
			? { expectedRevision: draft.revision }
			: draft.id
				? { expectedRevision: draft.revision, changes }
				: { type: "note", ...changes };
		Cloud.pending = {
			path: "/api/v1/contents" + (draft.id ? "/" + draft.id : ""),
			method: deleting ? "DELETE" : draft.id ? "PATCH" : "POST",
			body: JSON.stringify(payload),
			key: crypto.randomUUID(),
			owner: Cloud.editOwner,
		};
	}
	stashCloudDraft();
	Cloud.busy = true;
	Cloud.writeVersion++;
	const status = document.getElementById("cloud-save-status");
	status.textContent = deleting
		? copy("web.cloudentry.4fd4f40094d4")
		: copy("web.cloudentry.6bdb4435095e");
	const save = document.getElementById("cloud-save");
	(save as HTMLInputElement).disabled = true;
	save.setAttribute("aria-busy", "true");
	document.querySelectorAll("#cloud-delete,#cloud-discard").forEach((e?: any) => {
		e.disabled = true;
	});
	document.querySelectorAll("#cloud-editor input,#cloud-editor textarea").forEach((e?: any) => {
		e.disabled = true;
	});
	try {
		const pending = Cloud.pending;
		const record = await cloudApi(pending.path, {
			method: pending.method,
			body: pending.body,
			headers: { "Idempotency-Key": pending.key },
		});
		Cloud.pending = null;
		Cloud.drafts.delete(draft.id || "new");
		Cloud.edit = null;
		Cloud.records.set(record.id, record);
		try {
			const workspace = await cloudApi("/api/v1/workspace");
			adoptWorkspace(workspace);
		} catch (error) {
			paintRecords();
			Cloud.connectionError = true;
			app.toast(error.message);
		}
		app.closeNative();
		app.toast(
			record.deleted ? copy("web.cloudentry.6afb6449dd82") : copy("web.cloudentry.f5811c2edf6e"),
		);
	} catch (error) {
		status.textContent =
			error.message +
			(error.status >= 500 || !error.status ? copy("web.cloudentry.870b33df86bc") : "");
		if (error.status === 401 || error.status === 403) {
			clearCloud({ retainDrafts: true });
			app.toast(error.message);
			return;
		}
		if (error.status && error.status < 500) {
			Cloud.pending = null;
			document.querySelectorAll("#cloud-editor input,#cloud-editor textarea").forEach((e?: any) => {
				e.disabled = false;
			});
		}
	} finally {
		Cloud.busy = false;
		if (save.isConnected) {
			(save as HTMLInputElement).disabled = Cloud.editLocked;
			save.setAttribute("aria-busy", "false");
			save.textContent = Cloud.pending
				? copy("web.cloudentry.8709be687fd0")
				: copy("web.cloudentry.c6a1f219cdc8");
			document.querySelectorAll("#cloud-delete,#cloud-discard").forEach((e?: any) => {
				e.disabled = !!Cloud.pending || (e.id === "cloud-delete" && Cloud.editLocked);
			});
		}
	}
}
const originalOpen = app.openModal.bind(app);
app.openModal = function (...args: any[]) {
	if (Cloud.pending) {
		app.toast(copy("web.cloudentry.30298242da3c"));
		return;
	}
	stashCloudDraft();
	return originalOpen(...args);
};
const originalClose = app.closeNative.bind(app);
app.closeNative = function (...args: any[]) {
	if (Cloud.pending) {
		app.toast(copy("web.cloudentry.af697013918b"));
		return;
	}
	const dirty = stashCloudDraft();
	const result = originalClose(...args);
	if (dirty) app.toast(copy("web.cloudentry.8cf11b3b983f"));
	return result;
};
const originalAction = app.action.bind(app);
app.action = function (name?: any, id?: any, ...args: any[]) {
	if (Cloud.pending) {
		app.toast(copy("web.cloudentry.30298242da3c"));
		return;
	}
	if (name === "capture") {
		editCloud();
		return;
	}
	if (name === "resume-draft") {
		editCloud(id === "new" ? null : id);
		return;
	}
	if (name === "edit-content") {
		editCloud(id);
		return;
	}
	if (name === "refresh" || name === "sync-retry") {
		refreshWorkspace();
		return;
	}
	if (Cloud.pending && ["close", "back"].includes(name)) {
		app.toast(copy("web.cloudentry.af697013918b"));
		return;
	}
	const writes = [
		"less-like",
		"bookmark",
		"later",
		"task",
		"save-note",
		"snooze",
		"dismiss-reminder",
		"complete-reminder",
		"restore-reminder",
		"clear-confirm",
		"selected-bookmark",
		"selected-later",
		"selected-tag",
		"archive-all",
		"restore-card",
		"never-show",
		"toggle-read",
		"pref",
		"pref-toggle",
		"demo",
		"welcome-demo",
		"capture-save",
	];
	if (
		writes.includes(name) &&
		(!Cloud.user ||
			sync.suspended ||
			Cloud.discarding ||
			(Cloud.scopes &&
				!Cloud.scopes.includes(name === "clear-confirm" ? "content:delete" : "content:write")))
	) {
		app.toast(messages.forbidden);
		return;
	}
	if (name === "sync-export") {
		app.download(
			"sill-draft.json",
			JSON.stringify({ state: sync.baseline, pending: sync.pending }, null, 2),
			"application/json",
		);
		return;
	}
	if (name === "clear-all") {
		confirmCloud(
			copy("web.cloud.clear"),
			copy("web.cloud.clearDetail"),
			copy("web.cloud.clear"),
			() => app.action("clear-confirm"),
			() => app.openPanel("settings"),
		);
		return;
	}
	if (name === "sync-discard-confirm") {
		discardWorkspace();
		app.closeNative();
		return;
	}
	if (name === "less-like") {
		const before = !!Store.item(id).lessLike;
		Store.patch(id, { lessLike: !before });
		app.closeNative();
		app.withFeedAnchor(() => {}, true);
		app.toast(copy("web.app.0ec82d74e53c"), () => {
			Store.patch(id, { lessLike: before });
			app.withFeedAnchor(() => {}, true);
		});
		return;
	}
	if (name === "restore-card") Store.patch(id, { archived: false });
	if (name === "save-note") {
		originalAction(name, id, ...args);
		app.toast(copy("web.app.5fa0ce52b47e"));
		return;
	}
	return originalAction(name, id, ...args);
};
// Keep the original menus and light actions. A note opens for reading, not content editing.
app.startInlineEdit = (id: any) => app.openCard(id, true);
app.loadDemo = function () {
	const before = Store.state.cards.length;
	const ids = new Map(SeedCards.map((card) => [card.id, crypto.randomUUID()]));
	const offset = Date.now() - demoBase;
	const demo = SeedCards.map((card) => ({
		...clone(card),
		id: ids.get(card.id),
		...(card.related ? { related: card.related.map((id) => ids.get(id) || id) } : {}),
		...(card.start ? { start: card.start + offset, end: card.end + offset } : {}),
		...(card.due ? { due: card.due + offset } : {}),
	}));
	Store.state.preferences.onboarded = true;
	this.closeNative();
	this.withFeedAnchor(() => {
		Store.insert(demo);
		for (const [id, state] of Object.entries(SeedItems)) Store.patch(ids.get(id), clone(state));
	}, true);
	if (!before)
		this.toast(
			copy("web.app.7c8adb347efd"),
			() => {
				Store.remove(demo.map((card) => card.id));
				this.withFeedAnchor(() => {});
			},
			copy("web.app.309edeceecd6"),
		);
};
const localOpenPanel = app.openPanel.bind(app);
app.openPanel = function (kind?: any, ...args: any[]) {
	if (kind === "capture") {
		editCloud();
		return;
	}
	return localOpenPanel(kind, ...args);
};
const localEditor = Panels.editor.bind(Panels);
Panels.editor = function (...args: any[]) {
	const doc = document.createElement("template");
	doc.innerHTML = localEditor(...args);
	const hint = doc.content.querySelector(".panel-footer .muted");
	if (hint) hint.textContent = copy("web.cloud.savedAccount");
	return doc.innerHTML;
};
const localSettings = Panels.settings.bind(Panels);
Panels.settings = function (app?: any, group?: any) {
	const html = localSettings(app, group),
		doc = document.createElement("template");
	doc.innerHTML = html;
	if (group === "data")
		doc.content.querySelector(".settings-main").innerHTML =
			`<h1 id="modal-title">${copy("web.cloudentry.ebdc835e8f87")}</h1><p class="panel-sub">${copy("web.cloudentry.67c5f7479766")}</p><p class="panel-sub">` +
			(window.__SILL_HOST__
				? copy("web.cloudentry.c360ffadc6df")
				: copy("web.cloudentry.adf4e8d0d4f0")) +
			`${copy("web.cloudentry.627f80e390d1")}</p><div class="settings-card"><div class="setting-row"><span>${copy("web.cloud.export")}</span><button type="button" class="text-link" data-action="export-all">${copy("web.cloud.export")}</button></div><div class="setting-row"><span>${copy("web.cloud.clear")}</span><button type="button" class="text-link" data-action="clear-all">${copy("web.cloud.clear")}</button></div></div>` +
			(Cloud.user
				? `<div class="settings-card"><div class="setting-row"><span>${copy("web.cloudentry.4cc5be794516")}</span><button type="button" class="text-link" id="cloud-logout">` +
					(window.__SILL_HOST__
						? copy("web.cloudentry.55cce35fb13e")
						: copy("web.cloudentry.3ab8cc15939f")) +
					"</button></div></div>"
				: "");
	return doc.innerHTML;
};
async function refreshWorkspace() {
	if (sync.suspended) await loadCloud();
	if (sync.pending.length) {
		await sync.flush();
		if (sync.pending.length) return;
	}
	await loadCloud();
}
async function discardWorkspace() {
	if (sync.busy || Cloud.busy || Cloud.discarding) return;
	const epoch = Cloud.epoch,
		version = Cloud.writeVersion;
	Cloud.discarding = true;
	try {
		const session = await cloudApi("/auth/session");
		const value = await cloudApi("/api/v1/workspace", {
			headers: { "X-Sill-Owner": session.userId },
		});
		if (epoch !== Cloud.epoch || version !== Cloud.writeVersion || sync.busy) return;
		sync.reset();
		Cloud.user = session.userId;
		Cloud.scopes = session.scopes;
		adoptWorkspace(value);
		syncStatus();
		accountView();
	} catch (error) {
		app.toast(error.message);
	} finally {
		Cloud.discarding = false;
	}
}

app.refresh = refreshWorkspace;

// The host sandbox may disallow window.confirm. Reuse Sill's existing accessible
// confirmation panel, with an explicit return path to the untouched editor.
function confirmCloud(title?: any, detail?: any, label?: any, action?: any, back?: any) {
	if (Cloud.pending || Cloud.busy) return;
	stashCloudDraft();
	Cloud.confirmAction = action;
	app.panelReturn = () => {
		Cloud.confirmAction = null;
		back();
	};
	app.swapPanel(
		Panels.confirm(
			title,
			detail,
			`<button type="button" class="soft-button" data-action="close">${copy("web.cancel")}</button><button type="button" class="solid-button" id="cloud-confirm">${esc(label)}</button>`,
		),
		"confirm",
		"panel narrow",
	);
}
async function logoutCloud() {
	try {
		const result = await cloudApi("/auth/logout", { method: "POST" });
		clearCloud();
		app.toast(
			result.revoked ? copy("web.cloudentry.d0b8f27a7116") : copy("web.cloudentry.33d70a6c7e59"),
		);
	} catch (error) {
		app.openPanel("settings");
		app.toast(error.message);
	}
}
document.addEventListener("click", async (e?: any) => {
	const target = e.target.closest("button");
	if (!target) return;
	if (target.id === "cloud-confirm") {
		const action = Cloud.confirmAction;
		Cloud.confirmAction = null;
		app.panelReturn = null;
		target.disabled = true;
		if (action) await action();
		return;
	}
	if (target.id === "cloud-discard") {
		if (Cloud.pending || Cloud.busy) return;
		const id = Cloud.edit.id;
		confirmCloud(
			copy("web.cloudentry.436015258157"),
			copy("web.cloudentry.ce2d975f61a5"),
			copy("web.cloudentry.70403791a994"),
			() => {
				Cloud.drafts.delete(id || "new");
				Cloud.edit = null;
				app.closeNative();
				app.renderCurrent(false);
			},
			() => editCloud(id),
		);
		return;
	}
	if (target.id === "cloud-delete") {
		const id = Cloud.edit?.id;
		if (!id || Cloud.editLocked) return;
		confirmCloud(
			copy("web.cloudentry.555c7eeaf5f8"),
			copy("web.cloudentry.5009f055e04d"),
			copy("web.cloudentry.92d8b5e3dc99"),
			async () => {
				editCloud(id);
				await saveCloud(true);
			},
			() => editCloud(id),
		);
		return;
	}
	if (window.__SILL_HOST__ && target.id === "cloud-save") {
		if (target.form.reportValidity()) await saveCloud();
		return;
	}
	if (target.id === "cloud-logout") {
		if (window.__SILL_HOST__) {
			await window.__SILL_HOST__.manageAccess();
			return;
		}
		if (Cloud.drafts.size || sync.pending.length) {
			confirmCloud(
				copy("web.cloudentry.2c31c713d7a9"),
				copy("web.cloudentry.c255fa10f746"),
				copy("web.cloudentry.3ab8cc15939f"),
				logoutCloud,
				() => app.openPanel("settings"),
			);
			return;
		}
		await logoutCloud();
	}
});
document.addEventListener("submit", async (e?: any) => {
	if (e.target.id === "cloud-editor") {
		e.preventDefault();
		await saveCloud();
	}
	if (e.target.id === "cloud-login") {
		e.preventDefault();
		const button = e.target.querySelector("button"),
			status = document.getElementById("cloud-login-status");
		if (Date.now() < Cloud.loginUntil) return;
		button.disabled = true;
		Cloud.loginUntil = Date.now() + 60000;
		const timer = setInterval(() => {
			if (!button.isConnected) {
				clearInterval(timer);
				return;
			}
			const left = Math.ceil((Cloud.loginUntil - Date.now()) / 1000);
			button.disabled = left > 0;
			button.textContent =
				left > 0
					? `${left}${copy("web.cloudentry.e8e0419bd7bc")}`
					: copy("web.cloudentry.92b193fad920");
			if (left <= 0) clearInterval(timer);
		}, 250);
		try {
			const result = await cloudApi("/auth/login", {
				method: "POST",
				body: JSON.stringify({ email: new FormData(e.target).get("email") }),
			});
			status.textContent = result.message + copy("web.cloudentry.bb809dc64a4b");
		} catch (error) {
			status.textContent = error.message;
		}
	}
});
document.addEventListener("input", (e?: any) => {
	if (e.target.closest("#cloud-editor")) paintCloudDraft();
});
document.addEventListener("keydown", (e?: any) => {
	if (
		app.modalKind === "cloud-editor" &&
		!e.isComposing &&
		(e.metaKey || e.ctrlKey) &&
		["Enter", "s"].includes(e.key)
	) {
		e.preventDefault();
		if ((document.getElementById("cloud-editor") as HTMLFormElement).reportValidity()) saveCloud();
	}
});
window.addEventListener("beforeunload", (e?: any) => {
	stashCloudDraft();
	if (Cloud.pending || Cloud.drafts.size || sync.pending.length) {
		e.preventDefault();
		e.returnValue = "";
	}
});
document.addEventListener("visibilitychange", () => {
	if (!document.hidden && Cloud.user) loadCloud();
});
window.addEventListener("online", () => loadCloud());
accountView();
loadCloud({ initial: true });
setInterval(() => {
	if (!document.hidden && Cloud.user && !sync.failed) void loadCloud();
}, 5000);

// MCP App sandboxes can block native form submission; keep saves inside the bridge.
if (window.__SILL_HOST__)
	document.addEventListener("keydown", (e?: any) => {
		if (e.key === "Enter" && !e.isComposing && e.target.matches("#cloud-title")) {
			e.preventDefault();
			if (e.target.form.reportValidity()) saveCloud();
		}
	});

export {
	accountView,
	app,
	Cloud,
	callbackFailed,
	clearCloud,
	cloudApi,
	cloudConnection,
	cloudDraftValues,
	cloudWelcome,
	confirmCloud,
	editCloud,
	loadCloud,
	localOpenPanel,
	localSettings,
	logoutCloud,
	messages,
	originalAction,
	originalClose,
	originalDeskHTML,
	originalOpen,
	paintCloudDraft,
	paintRecords,
	saveCloud,
	stashCloudDraft,
	sync,
};
