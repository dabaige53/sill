import {
	attachPhoneDrawerChild,
	closePhoneDrawer,
	configurePhoneDrawer,
} from "../interactions/phone-drawer.tsx";
import type { AppController } from "./app.ts";
import type { ViewDialog } from "./app-types.ts";
import { releaseView } from "./react-renderer.ts";

type Layer = { dialog: ViewDialog; id: string; focus: HTMLElement | null; trail: string[] };
const stacks = new WeakMap<AppController, Layer[]>();

/** Keep the mounted parent, including its scroll position and media, beneath the child. */
export function pushPhonePreview(app: AppController) {
	const layers = stacks.get(app) || [];
	layers.push({
		dialog: app.dialog,
		id: app.currentId,
		focus: document.activeElement as HTMLElement,
		trail: app.previewTrail.slice(0, -1),
	});
	stacks.set(app, layers);
	app.dialog.id = `phone-layer-${layers.length}`;
	app.dialog.classList.add("phone-layer");
	const title = app.dialog.querySelector<HTMLElement>("#modal-title");
	if (title) {
		title.id = `${app.dialog.id}-title`;
		title.classList.add("phone-layer-title");
		app.dialog.setAttribute("aria-labelledby", title.id);
		app.dialog.querySelector("[data-vaul-drawer]")?.setAttribute("aria-labelledby", title.id);
	}
	app.dialog.inert = true;
	const dialog = document.createElement("dialog") as ViewDialog;
	dialog.id = "modal";
	dialog.setAttribute("aria-labelledby", "modal-title");
	document.body.append(dialog);
	attachPhoneDrawerChild(app.dialog, dialog);
	app.dialog = dialog;
	app.bindDialog();
}

export function restorePhonePreview(app: AppController, id: string) {
	const layers = stacks.get(app);
	const index = layers?.findIndex((layer) => layer.id === id) ?? -1;
	if (!layers || index < 0) return false;
	if (app.sheetLeaving) return true;
	app.sheetLeaving = true;
	const restore = () => {
		app.sheetHide?.destroy();
		app.previewSizeObserver?.disconnect();
		configurePhoneDrawer(app, false);
		releaseView(app.dialog);
		app.dialog.close();
		app.dialog.remove();
		for (const layer of layers.splice(index + 1).reverse()) {
			releaseView(layer.dialog);
			layer.dialog.close();
			layer.dialog.remove();
		}
		const parent = layers.pop()!;
		app.dialog = parent.dialog;
		app.dialog.id = "modal";
		app.dialog.classList.remove("phone-layer");
		const title = app.dialog.querySelector<HTMLElement>(".phone-layer-title");
		if (title) {
			title.id = "modal-title";
			title.classList.remove("phone-layer-title");
			app.dialog.setAttribute("aria-labelledby", title.id);
			app.dialog.querySelector("[data-vaul-drawer]")?.setAttribute("aria-labelledby", title.id);
		}
		app.dialog.inert = false;
		app.currentId = parent.id;
		app.modalKind = "preview";
		app.previewTrail = parent.trail;
		app.modalToken++;
		app.sheetLeaving = false;
		app.closingCardRoute = "";
		app.bindPreview(id);
		app.bindSheetChrome();
		parent.focus?.focus({ preventScroll: true });
	};
	if (!closePhoneDrawer(app.dialog, restore)) restore();
	return true;
}

/** Closing to the desk removes every suspended layer as well. */
export function clearPhonePreviews(app: AppController) {
	for (const layer of (stacks.get(app) || []).reverse()) {
		releaseView(layer.dialog);
		layer.dialog.close();
		layer.dialog.remove();
	}
	stacks.delete(app);
}
