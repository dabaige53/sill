import tokens from "../../../design-system/tokens.json" with { type: "json" };
import { MotionEngine } from "./motion.ts";

/**
 * Bars step aside while you read on and come back when you pause or turn back.
 * One rule for the desk rail, the preview toolbar and the reader, on phone and desktop:
 * scrolling down tucks the bars away completely; a pause, a scroll up, the top or the end brings them back.
 * Small jitters do nothing, so the bars never flicker.
 */
type Source = Window | HTMLElement;

const HIDE_AFTER = 28; // px of steady downward travel before the bars leave
const SHOW_AFTER = 14; // px of upward travel before they return
const REST_MS = Number.parseFloat(
	tokens.timing.tokens.find((token) => token.name === "rest-show")!.value,
); // a pause this long brings them back
const EDGE = 24; // near the top or the end, the bars always show
const FINISH_ZONE = 120; // the last stretch before a read-end push, kept clear for the check

class ChromeAutoHide {
	declare source: Source;
	declare targets: () => Element[];
	declare last: number;
	declare down: number;
	declare up: number;
	declare timer: number;
	declare hidden: boolean;
	declare paused: () => boolean;
	declare endOwned: () => boolean;
	declare onScroll: () => void;
	declare onFocus: (e: FocusEvent) => void;
	declare onKeyDown: (e: KeyboardEvent) => void;

	/**
	 * Scroll rules are shared; the desktop header has a gentler independent reveal.
	 * `endOwned`: a read-end push waits at the end, so reaching it or pausing near it keeps the bars away.
	 */
	constructor(
		source: Source,
		targets: () => Element[],
		paused: () => boolean = () => false,
		endOwned: () => boolean = () => false,
	) {
		this.source = source;
		this.targets = targets;
		this.paused = paused;
		this.endOwned = endOwned;
		this.last = this.position();
		this.down = 0;
		this.up = 0;
		this.timer = 0;
		this.hidden = false;
		this.onScroll = () => this.scrolled();
		// Hidden controls are absent from the tab order. Reveal them before the browser
		// chooses the next focus target, including the app's dialog focus trap.
		this.onKeyDown = (e) => {
			if (e.key === "Tab" && !e.isComposing && !this.paused()) this.show();
		};
		this.onFocus = (e) => {
			if (!this.paused() && this.targets().some((t) => t.contains(e.target as Node))) this.show();
		};
		source.addEventListener("scroll", this.onScroll, { passive: true });
		document.addEventListener("keydown", this.onKeyDown, true);
		document.addEventListener("focusin", this.onFocus);
	}
	isWindow() {
		return typeof (this.source as Window).scrollY === "number";
	}
	position() {
		return this.isWindow()
			? (this.source as Window).scrollY
			: (this.source as HTMLElement).scrollTop;
	}
	limit() {
		if (this.isWindow())
			return document.documentElement.scrollHeight - (this.source as Window).innerHeight;
		const el = this.source as HTMLElement;
		return el.scrollHeight - el.clientHeight;
	}
	/** Near the top the bars sit above the cards and never need to step aside. */
	atTop() {
		return this.position() <= EDGE;
	}
	/** Adopt a restored reading position without treating it as a scroll gesture. */
	syncPosition() {
		this.last = this.position();
		this.down = this.up = 0;
	}
	/** Keep the currently drawn chrome attached to the page during a phone drawer transition. */
	hold() {
		clearTimeout(this.timer);
		this.timer = 0;
		const animations = this.targets()
			.flatMap((target) => target.getAnimations())
			.filter((animation) => animation.playState === "running");
		for (const animation of animations) animation.pause();
		return () => {
			this.syncPosition();
			for (const animation of animations) {
				if (animation.playState === "paused") animation.play();
			}
		};
	}
	scrolled() {
		// Background controls keep their state while a modal or a gesture owns input.
		if (this.paused()) {
			clearTimeout(this.timer);
			this.down = this.up = 0;
			return;
		}
		const y = this.position(),
			dy = y - this.last,
			max = this.limit();
		this.last = y;
		if (!dy) return;
		clearTimeout(this.timer);
		const finishing = y >= max - FINISH_ZONE && this.endOwned();
		if (y <= EDGE || (y >= max - EDGE && !finishing)) {
			this.down = this.up = 0;
			this.show();
			return;
		}
		if (dy > 0) {
			this.down += dy;
			this.up = 0;
			if (this.down > HIDE_AFTER) this.hide();
		} else if (dy < 0) {
			this.up -= dy;
			this.down = 0;
			if (this.up > SHOW_AFTER) this.show();
		}
		if (this.hidden && !finishing)
			this.timer = window.setTimeout(() => {
				if (!this.paused()) this.show();
			}, REST_MS);
	}
	/** `force` tucks even a focused bar: an opened card takes the focus over. */
	hide(force = false) {
		if (this.hidden) return;
		const focused =
			!force &&
			document.activeElement?.matches(":focus-visible") &&
			this.targets().some((t) => t.contains(document.activeElement));
		if (focused) return;
		this.hidden = true;
		for (const t of this.targets()) {
			(t as HTMLElement).inert = true;
			MotionEngine.change(
				t as HTMLElement,
				() => t.classList.add("is-tucked"),
				MotionEngine.time("dur-tuck"),
			);
		}
	}
	/** `withCard`: the bars return with a closing card, on the same card spring and from its first frame. */
	show(withCard = false) {
		clearTimeout(this.timer);
		this.timer = 0;
		this.down = this.up = 0;
		if (!this.hidden) return;
		this.hidden = false;
		const reveal = !withCard;
		for (const t of this.targets()) {
			(t as HTMLElement).inert = false;
			// Top bars, on the desk and in a detail alike, return at the gentler desktop pace.
			const duration =
				t.matches(
					"#home-top, .reader-head, .sheet-head-tools, :is(.reader-edge, .sheet-edge).is-top",
				) && matchMedia("(min-width: 651px)").matches
					? "dur-top-reveal"
					: "dur-reveal";
			MotionEngine.change(
				t as HTMLElement,
				() => t.classList.remove("is-tucked"),
				reveal ? MotionEngine.time(duration) : MotionEngine.time("dur-show"),
				withCard ? { spring: "card" } : reveal ? { easing: MotionEngine.curve("ease-reveal") } : {},
			);
		}
	}
	destroy() {
		clearTimeout(this.timer);
		this.source.removeEventListener("scroll", this.onScroll);
		document.removeEventListener("keydown", this.onKeyDown, true);
		document.removeEventListener("focusin", this.onFocus);
		for (const target of this.targets()) {
			MotionEngine.cancel(target);
			target.classList.remove("is-tucked");
			(target as HTMLElement).inert = false;
			(target as HTMLElement).style.visibility = "";
		}
	}
}

/**
 * Toolbar icons carry no words; a long press on a touch screen shows the name from aria-label
 * for a moment, and that press does not act. A mouse sees the same name on hover (CSS).
 */
const TIP_AFTER = 450;
const TIP_FOR = 1400;
function toolbarTips(root: Document) {
	let hoverTimer = 0;
	let hoverButton: HTMLElement | null = null;
	let warmBar: Element | null = null;
	root.addEventListener("pointerover", (e: PointerEvent) => {
		if (e.pointerType !== "mouse") return;
		const button = (e.target as Element).closest?.<HTMLElement>(":is(.float-bar, #selection-bar, #search-selection-bar) .icon-button");
		if (!button || button === hoverButton) return;
		hoverButton = button;
		const bar = button.closest(".float-bar, #selection-bar, #search-selection-bar");
		const instant = warmBar === bar;
		const show = () => {
			if (
				hoverButton !== button ||
				!button.isConnected ||
				button.closest(".is-hidden,.is-tucked") ||
				(button.closest("dialog") && !button.closest("dialog").open)
			)
				return;
			warmBar = bar;
			button.classList.toggle("is-instant-tip", instant);
			button.classList.add("is-hover-tipping");
		};
		if (instant) show();
		else hoverTimer = window.setTimeout(show, 500);
	});
	root.addEventListener("pointerout", (e: PointerEvent) => {
		if (warmBar && !warmBar.contains(e.relatedTarget as Node)) warmBar = null;
		if (!hoverButton || hoverButton.contains(e.relatedTarget as Node)) return;
		clearTimeout(hoverTimer);
		if (!warmBar?.contains(e.relatedTarget as Node)) warmBar = null;
		hoverButton.classList.remove("is-hover-tipping", "is-instant-tip");
		hoverButton = null;
	});
	let timer = 0;
	let shown: HTMLElement | null = null;
	const hide = () => {
		shown?.classList.remove("is-tipping");
		shown = null;
	};
	root.addEventListener("pointerdown", (e: PointerEvent) => {
		const button = (e.target as Element).closest?.<HTMLElement>(":is(.float-bar, #selection-bar, #search-selection-bar) .icon-button");
		clearTimeout(timer);
		hide();
		if (!button || e.pointerType === "mouse") return;
		timer = window.setTimeout(() => {
			shown = button;
			button.classList.add("is-tipping");
		}, TIP_AFTER);
	});
	const release = () => {
		clearTimeout(timer);
		if (shown) timer = window.setTimeout(hide, TIP_FOR);
	};
	root.addEventListener("pointerup", release);
	root.addEventListener("pointercancel", release);
	root.addEventListener(
		"click",
		(e: MouseEvent) => {
			if (!shown || !shown.contains(e.target as Node)) return;
			e.preventDefault();
			e.stopPropagation();
		},
		true,
	);
}

export { ChromeAutoHide, toolbarTips };
