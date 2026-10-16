/**
 * Bars step aside while you read on and come back when you pause or turn back.
 * One rule for the desk rail, the preview toolbar and the reader, on phone and desktop:
 * scrolling down tucks the bars away completely; a pause, a scroll up, the top or the end brings them back.
 * Small jitters do nothing, so the bars never flicker.
 */
type Source = Window | HTMLElement;

const HIDE_AFTER = 28; // px of steady downward travel before the bars leave
const SHOW_AFTER = 14; // px of upward travel before they return
const REST_MS = 650; // a pause this long brings them back
const EDGE = 24; // near the top or the end, the bars always show

class ChromeAutoHide {
	declare source: Source;
	declare targets: () => Element[];
	declare last: number;
	declare down: number;
	declare up: number;
	declare timer: number;
	declare hidden: boolean;
	declare paused: () => boolean;
	declare onScroll: () => void;
	declare onFocus: (e: FocusEvent) => void;

	constructor(source: Source, targets: () => Element[], paused: () => boolean = () => false) {
		this.source = source;
		this.targets = targets;
		this.paused = paused;
		this.last = this.position();
		this.down = 0;
		this.up = 0;
		this.timer = 0;
		this.hidden = false;
		this.onScroll = () => this.scrolled();
		// A keyboard user tabbing into a tucked bar gets it back at once.
		this.onFocus = (e) => {
			if (this.targets().some((t) => t.contains(e.target as Node))) this.show();
		};
		source.addEventListener("scroll", this.onScroll, { passive: true });
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
	scrolled() {
		const y = this.position(),
			dy = y - this.last,
			max = this.limit();
		this.last = y;
		clearTimeout(this.timer);
		if (this.paused()) return this.show();
		if (y <= EDGE || y >= max - EDGE) {
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
		if (this.hidden) this.timer = window.setTimeout(() => this.show(), REST_MS);
	}
	hide() {
		if (this.hidden) return;
		const focused = this.targets().some((t) => t.contains(document.activeElement));
		if (focused) return;
		this.hidden = true;
		for (const t of this.targets()) t.classList.add("is-tucked");
	}
	show() {
		this.down = this.up = 0;
		if (!this.hidden) return;
		this.hidden = false;
		for (const t of this.targets()) t.classList.remove("is-tucked");
	}
	destroy() {
		clearTimeout(this.timer);
		this.source.removeEventListener("scroll", this.onScroll);
		document.removeEventListener("focusin", this.onFocus);
		this.show();
	}
}

export { ChromeAutoHide };
