import { createElement } from "react";
import {
	cloudDraftValues,
	confirmCloud,
	discardWorkspace,
	editCloud,
	logoutCloud,
	paintCloudDraft,
	refreshWorkspace,
	saveCloud,
	stashCloudDraft,
} from "./cloud-compose.ts";
import {
	accountView,
	adoptWorkspace,
	clearCloud,
	cloudApi,
	cloudConnection,
	loadCloud,
	paintRecords,
	syncStatus,
	workspaceState,
} from "./cloud-workspace.ts";
import { copy } from "./copy.ts";
import { demoBase, SeedCards, SeedItems } from "./data/cards.ts";
import { Store } from "./data/store.ts";
import { agentFailure } from "./services/agent-handoff.ts";
import { CloudSync, clone } from "./services/cloud-sync.ts";
import { AppController } from "./views/app.ts";
import { CloudSettings, CloudWelcome } from "./views/cloud-views.tsx";

/* Cloud build: cards stay in memory; browser login uses server-set HttpOnly cookies. */
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
Store.save = () => {};
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
	return createElement(CloudWelcome, {
		user: !!Cloud.user,
		host: !!window.__SILL_HOST__,
		connectionError: Cloud.connectionError,
		callbackFailed,
		drafts: [...Cloud.drafts],
	});
}
const app = new AppController();
app.agentScope = () => {
	if (!Cloud.user) throw agentFailure("account_unavailable", copy("web.agent.disconnected"));
	return { kind: "cloud", owner: Cloud.user };
};
app.readAgentCard = async (id, scope) => {
	if (scope.kind !== "cloud" || scope.owner !== Cloud.user)
		throw agentFailure("account_changed", copy("web.agent.accountChanged"));
	const card = await cloudApi("/api/v1/contents/" + encodeURIComponent(id), {
		headers: { "X-Sill-Owner": scope.owner },
	});
	if (scope.owner !== Cloud.user || (card.owner_id && card.owner_id !== scope.owner))
		throw agentFailure("account_changed", copy("web.agent.accountChanged"));
	return card;
};
const originalDeskView = app.deskView.bind(app);
app.deskView = () => {
	if (!Cloud.user || !Store.state.cards.length) return cloudWelcome();
	return originalDeskView();
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
		if (!Cloud.refreshFeedback) app.alert(error.message);
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
	invalid_request: copy("web.agent.invalidRequest"),
	cursor_expired: copy("web.agent.cursorExpired"),
	rate_limited: copy("web.cloudentry.040740f33308"),
	unauthenticated: copy("web.cloudentry.18b4f39557c3"),
	forbidden: copy("web.cloudentry.09bd4dab7584"),
	revision_conflict: copy("web.cloudentry.b942f016ffdc"),
	idempotency_conflict: copy("web.cloudentry.7780180e644e"),
	not_found: copy("web.cloudentry.118d8bd2ba6f"),
	unavailable: copy("web.cloudentry.e88edcc61c1f"),
};
const originalOpen = app.openModal.bind(app);
app.openModal = (...args: any[]) => {
	if (Cloud.pending) {
		app.toast(copy("web.cloudentry.30298242da3c"));
		return;
	}
	stashCloudDraft();
	return originalOpen(...args);
};
const originalClose = app.closeNative.bind(app);
app.closeNative = (...args: any[]) => {
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
app.action = (name?: any, id?: any, ...args: any[]) => {
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
	if (name === "sync-retry") {
		refreshWorkspace();
		return;
	}
	if (name === "refresh") {
		app.gestures.refresh();
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
		app.alert(messages.forbidden);
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
		return;
	}
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
};
const localOpenPanel = app.openPanel.bind(app);
app.openPanel = (kind?: any, ...args: any[]) => {
	// Reject navigation before search can change history or bind a blocked panel.
	if (Cloud.pending) {
		app.toast(copy("web.cloudentry.30298242da3c"));
		return;
	}
	if (kind === "capture") {
		editCloud();
		return;
	}
	return localOpenPanel(kind, ...args);
};
app.cloudSavedAccount = true;
Object.defineProperty(app, "cloudSettingsContent", {
	get: () => {
		const owner = Cloud.user;
		return createElement(CloudSettings, {
			user: !!owner,
			host: !!window.__SILL_HOST__,
			backupOwner: owner,
			backupApi: async (path, options = {}) => {
				if (!owner || owner !== Cloud.user)
					throw agentFailure("account_changed", copy("web.agent.accountChanged"));
				if (options.method === "POST") {
					await sync.flush();
					if (sync.pending.length || Cloud.busy || Cloud.pending)
						throw agentFailure("save_pending", copy("web.cloudentry.30298242da3c"));
					Cloud.writeVersion++;
				}
				const value = await cloudApi(path, {
					...options,
					headers: { ...options.headers, "X-Sill-Owner": owner },
				});
				if (owner !== Cloud.user)
					throw agentFailure("account_changed", copy("web.agent.accountChanged"));
				return value;
			},
			onBackupRestore: async () => {
				if (Cloud.loadPromise) await Cloud.loadPromise;
				if (owner !== Cloud.user || !(await loadCloud()))
					throw Object.assign(new Error("backup_refresh_failed"), {
						code: "backup_refresh_failed",
						status: 503,
					});
			},
		});
	},
});

app.refresh = refreshWorkspace;
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
			try {
				await window.__SILL_HOST__.manageAccess();
			} catch (error) {
				app.alert(error.message || copy("web.agent.linkUnknown"));
			}
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
	logoutCloud,
	messages,
	originalAction,
	originalClose,
	originalDeskView,
	originalOpen,
	paintCloudDraft,
	paintRecords,
	saveCloud,
	stashCloudDraft,
	sync,
};
