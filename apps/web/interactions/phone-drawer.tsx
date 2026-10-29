import { type PointerEvent, type ReactNode, useLayoutEffect, useRef, useState } from "react";
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
/** The page last prepared and a count, so a late glass restore never undoes a drawer opened on it since. */
let preparations = 0;
let prepared: Element | null = null;

/**
 * Vaul's open offset is the top safe area plus 14px, but its drag frames drop the safe area. In a
 * home-screen app (~59px) the page jumped up on the first drag frame. After Vaul writes a frame,
 * the safe area returns in step with the drag.
 */
function keepSafeArea(percentage: number) {
	const wrapper = document.querySelector<HTMLElement>("[data-vaul-drawer-wrapper]");
	const transform = wrapper?.style.transform;
	const offset = transform?.match(/translate3d\(0(?:px)?, (-?[\d.]+)px, 0(?:px)?\)/);
	if (!wrapper || !offset) return;
	const share = Math.max(0, 1 - percentage);
	wrapper.style.transform = transform.replace(
		offset[0],
		`translate3d(0px, calc(${share} * env(safe-area-inset-top) + ${offset[1]}px), 0px)`,
	);
}

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

/** Freeze the visible page geometry and restore its scroll; Vaul owns the scale and keyboard. */
function prepareBackground(app: AppController) {
	const background = app.searchBackground || document.getElementById("workspace-background");
	if (!background) return () => {};
	const preparation = ++preparations;
	prepared = background;
	const releaseChrome = app.railHide?.hold();
	background.setAttribute("data-vaul-drawer-wrapper", "");
	// The page reveals a fixed backing as it moves, including through the closing transition.
	document.body.classList.add("is-drawer-scaled");
	// The glass and the top bar fill change one frame after the page settles, so iOS does not
	// rebuild the page layers and the glass in the same frame (the dock and card shadows lagged).
	const releaseGlass = () =>
		requestAnimationFrame(() => {
			if (preparation === preparations || prepared !== background) {
				background.removeAttribute("data-vaul-drawer-wrapper");
				releaseChrome?.();
			}
		});
	// Search scales as its own layer; the home page under it would show where the black belongs.
	const desk = app.searchBackground && document.getElementById("workspace-background");
	desk?.classList.add("is-under-drawer");
	const clearRadius = () => {
		background.style.removeProperty("--phone-drawer-roundness");
		document.body.classList.remove("is-drawer-scaled");
		desk?.classList.remove("is-under-drawer");
	};
	// Under search the page is its own layer; under another page the desk is already frozen.
	if (app.searchBackground || background.classList.contains("is-page-frozen")) {
		// Establish the unscaled frame before Vaul writes its opening transform.
		background.getBoundingClientRect();
		return () => {
			releaseGlass();
			clearRadius();
		};
	}
	const main = background.querySelector<HTMLElement>("main");
	const translate = main?.style.translate || "";
	const minHeight = document.body.style.minHeight;
	document.body.style.minHeight = `${document.documentElement.scrollHeight}px`;
	const scroll = window.scrollY;
	background.classList.add("is-drawer-background");
	if (main) {
		main.style.translate = `0 ${-scroll}px`;
		// The cards clip to the screen (base.css); the rest of the page stays unclipped.
		const rect = main.getBoundingClientRect();
		main.style.setProperty("--drawer-clip-top", `${Math.max(0, -rect.top)}px`);
		main.style.setProperty(
			"--drawer-clip-bottom",
			`${Math.max(0, rect.bottom - window.innerHeight)}px`,
		);
	}
	// The document stays as tall as the page so its offset survives, so it must not scroll. Vaul
	// locks it only when the user agent says Safari, and a home-screen app's does not: a finger on
	// the drawer then scrolled the hidden document and iOS dropped the tap as a scroll.
	const overflow = document.documentElement.style.overflow;
	document.documentElement.style.overflow = "hidden";
	// Flush the frozen geometry once; otherwise WebKit can combine it with Vaul's target frame.
	background.getBoundingClientRect();
	return () => {
		releaseGlass();
		clearRadius();
		background.classList.remove("is-drawer-background");
		if (main) {
			main.style.translate = translate;
			main.style.removeProperty("--drawer-clip-top");
			main.style.removeProperty("--drawer-clip-bottom");
		}
		document.body.style.minHeight = minHeight;
		document.documentElement.style.overflow = overflow;
		// The page is visible again in this frame; put the document back where the reader left it.
		if (window.scrollY !== scroll) window.scrollTo({ top: scroll, behavior: "instant" });
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
	const pointerStart = useRef({ x: 0, y: 0 });
	const finish = useRef<(() => void) | null>(null);
	const Root = nested ? Drawer.NestedRoot : Drawer.Root;
	const roundBackground = (progress: number) => {
		if (nested) return;
		const background = app.searchBackground || document.getElementById("workspace-background");
		// phone.css registers the variable as not inherited, so a drag frame restyles only this element.
		background?.style.setProperty(
			"--phone-drawer-roundness",
			String(Math.max(0, Math.min(1, progress))),
		);
	};
	useLayoutEffect(() => {
		const restore = nested ? () => {} : prepareBackground(app);
		dialog.dataset.phoneDrawer = "";
		controls.set(dialog, {
			close(done) {
				if (finish.current) return;
				// Vaul reports the end only while this drawer stays mounted and its state changes. If the
				// content remounts mid-close, its report is lost and Sill would wait forever, ignoring every
				// later close; a timer just past Vaul's 0.5s finishes the close once either way.
				let finished = false;
				const once = () => {
					if (finished) return;
					finished = true;
					done();
				};
				finish.current = once;
				close.current?.click();
				window.setTimeout(once, 650);
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
			setBackgroundColorOnScale={false}
			// prepareBackground already freezes the page. Vaul's iOS body `position: fixed` shifts the
			// page under a home-screen app's status bar, so taps land on the page behind the drawer.
			noBodyStyles
			// Inverted name: false turns off Vaul's iOS window lock, which scrolled the page away and
			// back on every press and release, so iOS read a tap on the close button as a scroll and
			// dropped it. prepareBackground already locks the frozen page.
			disablePreventScroll={false}
			{...(!nested
				? {
						onDrag: (_event: PointerEvent<HTMLDivElement>, percentage: number) => {
							roundBackground(1 - percentage);
							// Vaul writes the page offset right after this callback.
							queueMicrotask(() => keepSafeArea(percentage));
						},
						onRelease: (_event: PointerEvent<HTMLDivElement>, isOpen: boolean) => {
							roundBackground(isOpen ? 1 : 0);
						},
					}
				: {})}
			onOpenChange={(value) => {
				setOpen(value);
				roundBackground(value ? 1 : 0);
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
				<Drawer.Content
					ref={content}
					className="phone-drawer"
					aria-describedby={undefined}
					// @design tag-layer
					// The tags layer floats over the drawer in its own dialog: presses, focus and Escape
					// there belong to the layer, so the drawer must not read them as dismissals. Vaul
					// judges a press only after its click, when adding or removing a tag has already
					// redrawn the pressed chip away, so the open layer decides, not the press target.
					onInteractOutside={(event) => {
						if (app.editorLayer?.open || (event.target as Element)?.closest?.("#tag-layer"))
							event.preventDefault();
					}}
					onEscapeKeyDown={(event) => {
						if (app.editorLayer?.open) event.preventDefault();
					}}
					onPointerDownCapture={(event) => {
						pointerStart.current = { x: event.clientX, y: event.clientY };
					}}
					onPointerCancelCapture={(event) => {
						// Vaul treats the pointerout following cancellation as a release with the last
						// drag velocity. Feed its upward-release path first: it restores the drawer and
						// scaled background, and clears its drag state without dismissing the card.
						const start = pointerStart.current;
						flushSync(() => {
							event.currentTarget.dispatchEvent(
								new window.PointerEvent("pointerup", {
									bubbles: true,
									pointerId: event.pointerId,
									pointerType: event.pointerType,
									clientX: start.x,
									clientY: start.y - 1,
								}),
							);
						});
					}}
				>
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
