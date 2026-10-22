import { createElement } from "react";
import { app, Cloud, originalOpen, sync } from "./cloud-entry.ts";
import {
	accountView,
	adoptWorkspace,
	clearCloud,
	cloudApi,
	cloudConnection,
	loadCloud,
	paintRecords,
	syncStatus,
} from "./cloud-workspace.ts";
import { copy } from "./copy.ts";
import { cloudCardChanges } from "./data/cloud-card.ts";
import { PanelViews as Panels } from "./interactions/panels-components.tsx";
import { CloudCompose, ConfirmActions } from "./views/cloud-views.tsx";
export function cloudDraftValues() {
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
export function stashCloudDraft() {
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
export function paintCloudDraft() {
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
export function editCloud(id?: any) {
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
		createElement(CloudCompose, {
			id,
			host: !!window.__SILL_HOST__,
			canDelete: !Cloud.scopes || Cloud.scopes.includes("content:delete"),
			values,
		}),
		"cloud-editor",
		null,
		"panel wide",
	);
	paintCloudDraft();
	if (Cloud.editLocked)
		document.getElementById("cloud-save-status").textContent = copy("web.cloudentry.ad946a9727a3");
	document.getElementById("cloud-title").focus({ preventScroll: true });
}
export async function saveCloud(deleting: any = false) {
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
export async function refreshWorkspace({ feedback = "default" } = {}) {
	const quiet = feedback === "pull";
	if (Cloud.refreshFeedback) return false;
	Cloud.refreshFeedback = quiet;
	if (quiet) cloudConnection();
	try {
		if (sync.suspended && !(await loadCloud({ quiet }))) return false;
		if (sync.pending.length) {
			await sync.flush();
			if (sync.pending.length) return false;
		}
		const loaded = await loadCloud({ quiet });
		if (loaded) app.refreshFeedOrder();
		return loaded;
	} finally {
		Cloud.refreshFeedback = false;
	}
}
export async function discardWorkspace() {
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
		Cloud.displayName = session.name || session.email || "";
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
export function confirmCloud(title?: any, detail?: any, label?: any, action?: any, back?: any) {
	if (Cloud.pending || Cloud.busy) return;
	stashCloudDraft();
	Cloud.confirmAction = action;
	app.panelReturn = () => {
		Cloud.confirmAction = null;
		back();
	};
	app.swapPanel(
		Panels.confirm(title, detail, createElement(ConfirmActions, { label, id: "cloud-confirm" })),
		"confirm",
		"panel narrow",
	);
}
export async function logoutCloud() {
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
