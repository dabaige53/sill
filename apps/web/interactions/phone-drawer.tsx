import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Drawer } from "vaul";
import { copy } from "../copy.ts";
import type { AppController } from "../views/app.ts";

const hosts = new WeakMap<Element, AppController>();
type Child = { dialog: HTMLDialogElement; children: ReactNode };
const controls = new WeakMap<
	Element,
	{
		close: (done: () => void) => void;
		child: (value: Child | null) => void;
	}
>();
const childParents = new WeakMap<Element, Element>();

export function configurePhoneDrawer(app: AppController, enabled: boolean) {
	if (enabled) hosts.set(app.dialog, app);
	else hosts.delete(app.dialog);
}

export function wrapPhoneDrawer(container: Element, children: ReactNode) {
	const app = hosts.get(container);
	return app && app.modalKind === "preview" ? (
		<PhoneDrawer app={app} dialog={app.dialog}>
			{children}
		</PhoneDrawer>
	) : (
		children
	);
}

/** A nested surface stays in its parent's React/Vaul context, even across portals. */
export function attachPhoneDrawerChild(parent: Element, child: Element) {
	childParents.set(child, parent);
}
export function renderPhoneDrawerChild(dialog: Element, children: ReactNode) {
	const parent = childParents.get(dialog);
	const control = parent && controls.get(parent);
	if (!control) return false;
	flushSync(() => control.child({ dialog: dialog as HTMLDialogElement, children }));
	return true;
}
export function releasePhoneDrawerChild(dialog: Element) {
	const parent = childParents.get(dialog);
	if (!parent) return false;
	childParents.delete(dialog);
	flushSync(() => controls.get(parent)?.child(null));
	return true;
}
export function closePhoneDrawer(dialog: Element, done: () => void) {
	const control = controls.get(dialog);
	if (!control) return false;
	control.close(done);
	return true;
}

/** Freeze the visible page geometry; Vaul owns its scale and the body/keyboard handling. */
function prepareBackground(app: AppController) {
	const background = app.searchBackground || document.getElementById("workspace-background");
	if (!background) return () => {};
	background.setAttribute("data-vaul-drawer-wrapper", "");
	if (app.searchBackground) return () => background.removeAttribute("data-vaul-drawer-wrapper");
	const main = background.querySelector<HTMLElement>("main");
	const translate = main?.style.translate || "";
	const minHeight = document.body.style.minHeight;
	document.body.style.minHeight = `${document.documentElement.scrollHeight}px`;
	const scroll = window.scrollY;
	background.classList.add("is-drawer-background");
	if (main) main.style.translate = `0 ${-scroll}px`;
	return () => {
		background.removeAttribute("data-vaul-drawer-wrapper");
		background.classList.remove("is-drawer-background");
		if (main) main.style.translate = translate;
		document.body.style.minHeight = minHeight;
	};
}

// @design phone-detail-drawer
/** Sill retains navigation; Root/NestedRoot own modality, motion, scroll and keyboard. */
function PhoneDrawer({
	app,
	dialog,
	children,
	nested = false,
}: {
	app: AppController;
	dialog: HTMLDialogElement;
	children: ReactNode;
	nested?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [child, setChild] = useState<Child | null>(null);
	const ownerId = useRef(app.currentId).current;
	const trigger = useRef<HTMLButtonElement>(null);
	const close = useRef<HTMLButtonElement>(null);
	const content = useRef<HTMLDivElement>(null);
	const finish = useRef<(() => void) | null>(null);
	const Root = nested ? Drawer.NestedRoot : Drawer.Root;
	useLayoutEffect(() => {
		const restore = nested ? () => {} : prepareBackground(app);
		dialog.dataset.phoneDrawer = "";
		controls.set(dialog, {
			close(done) {
				if (finish.current) return;
				finish.current = done;
				close.current?.click();
			},
			child: setChild,
		});
		// Use the library's trigger path so its open lifecycle and mobile handling run.
		trigger.current?.click();
		return () => {
			finish.current = null;
			controls.delete(dialog);
			delete dialog.dataset.phoneDrawer;
			restore();
		};
	}, [app, dialog, nested]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Replaced card markup needs its tool exclusions applied after Content mounts.
	useLayoutEffect(() => {
		content.current?.querySelector(".preview-sheet")?.classList.add("is-full");
		for (const tool of content.current?.querySelectorAll(".float-bar, .sheet-head-tools") || [])
			tool.setAttribute("data-vaul-no-drag", "");
	}, [open, children]);
	return (
		<Root
			shouldScaleBackground={!nested}
			onOpenChange={(value) => {
				setOpen(value);
				if (!value && !finish.current && app.dialog === dialog && app.currentId === ownerId)
					app.closeModal();
			}}
			onAnimationEnd={(value) => {
				if (value) return;
				const callback = finish.current;
				finish.current = null;
				callback?.();
			}}
		>
			<Drawer.Trigger ref={trigger} hidden tabIndex={-1} aria-hidden="true" />
			<Drawer.Portal container={dialog}>
				<Drawer.Overlay className="phone-drawer-overlay" />
				<Drawer.Content ref={content} className="phone-drawer" aria-describedby={undefined}>
					<Drawer.Title className="sr-only">{copy("web.preview.contentRegion")}</Drawer.Title>
					<Drawer.Handle preventCycle />
					{children}
					<Drawer.Close ref={close} hidden tabIndex={-1} aria-hidden="true" />
				</Drawer.Content>
			</Drawer.Portal>
			{child && (
				<PhoneDrawer app={app} dialog={child.dialog} nested>
					{child.children}
				</PhoneDrawer>
			)}
		</Root>
	);
}
