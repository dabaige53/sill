import { MotionEngine } from "../interactions/motion.ts";
import type { Playback } from "../interactions/motion-playback.ts";
import type { AppController } from "./app.ts";
import type { Deck, DeckGesture, TargetEvent } from "./app-types.ts";

export const appStacksMethods = {
	bindStacks(this: AppController) {
		this.stackIndex = new Map<string, number>();
		let g: DeckGesture = null;
		this.grid.addEventListener("pointerdown", (e?: TargetEvent<PointerEvent>) => {
			const deck = e.target.closest?.<Deck>(".deck");
			if (!deck || e.button !== 0 || e.isPrimary === false) return;
			// A new hand gesture owns the deck, including while the previous card settles.
			deck._finish?.();
			clearTimeout(deck._wheel?.t);
			deck._wheel = null;
			deck._hold = 0;
			this.stackDragUntil = 0;
			deck._cancelGesture = () => {
				g = null;
				deck.classList.remove("is-dragging");
				clearTimeout(deck._wheel?.t);
				deck._wheel = null;
			};
			g = { deck, id: e.pointerId, x: e.clientX, y: e.clientY, at: Date.now(), live: false, dx: 0 };
		});
		document.addEventListener("pointermove", (e?: TargetEvent<PointerEvent>) => {
			if (!g || e.pointerId !== g.id) return;
			const dx = e.clientX - g.x,
				dy = e.clientY - g.y;
			if (!g.live) {
				if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
				if (Math.abs(dy) > Math.abs(dx) * 1.2) {
					g = null;
					return;
				}
				if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
				g.live = true;
				g.deck.classList.add("is-dragging");
				try {
					g.deck.setPointerCapture(e.pointerId);
				} catch {}
			}
			if (e.cancelable) e.preventDefault();
			g.dx = dx;
			this.deckFollow(g.deck, dx);
		});
		const release = (e?: Pick<PointerEvent, "pointerId">, cancelled?: boolean) => {
			if (!g || e.pointerId !== g.id) return;
			const d = g;
			g = null;
			if (!d.live) return;
			d.deck.classList.remove("is-dragging");
			this.stackDragUntil = Date.now() + 350;
			const w = d.deck.offsetWidth,
				v = d.dx / Math.max(1, Date.now() - d.at);
			const go =
				!cancelled && (Math.abs(d.dx) > w * 0.3 || (Math.abs(v) > 0.45 && Math.abs(d.dx) > 30));
			this.deckSettle(d.deck, go ? (d.dx < 0 ? 1 : -1) : 0);
		};
		document.addEventListener("pointerup", (e?: TargetEvent<PointerEvent>) => release(e, false));
		document.addEventListener("pointercancel", (e?: TargetEvent<PointerEvent>) => release(e, true));
		this.grid.addEventListener("lostpointercapture", (e?: TargetEvent<PointerEvent>) => {
			if (g && e.target === g.deck) release(e, true);
		});
		window.addEventListener("blur", () => {
			if (g) release({ pointerId: g.id }, true);
		});
		// Trackpad: a sideways swipe drags the top card too. Its coasting momentum is ignored until the hand stops.
		this.grid.addEventListener(
			"wheel",
			(e?: TargetEvent<WheelEvent>) => {
				const deck = e.target.closest?.<Deck>(".deck");
				if (!deck || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
				e.preventDefault();
				const now = Date.now();
				const direction = Math.sign(e.deltaX);
				if (deck._hold && direction === deck._wheelDirection && now - deck._hold < 160) {
					deck._hold = now;
					return;
				}
				deck._hold = 0;
				deck._wheelDirection = direction;
				deck._finish?.();
				deck._wheel ||= { dx: 0 };
				const s = deck._wheel,
					w = deck.offsetWidth;
				clearTimeout(s.t);
				s.dx = Math.max(
					-w,
					Math.min(w, s.dx - e.deltaX * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? w : 1)),
				);
				this.deckFollow(deck, s.dx);
				if (Math.abs(s.dx) > w * 0.35) {
					deck._wheel = null;
					deck._hold = now;
					this.deckSettle(deck, s.dx < 0 ? 1 : -1);
					return;
				}
				s.t = window.setTimeout(() => {
					deck._wheel = null;
					this.deckSettle(deck, 0);
				}, 140);
			},
			{ passive: false },
		);
	},
	deckParts(this: AppController, deck?: Deck) {
		const cards = [...deck.children] as HTMLElement[],
			i = Number(deck.dataset.cur || 0);
		return {
			cards,
			i,
			top: cards[i],
			next: cards[i + 1],
			prev: cards[i - 1],
			w: deck.offsetWidth || 1,
		};
	},
	deckFollow(this: AppController, deck?: Deck, dx?: number) {
		const { top, next, prev, w } = this.deckParts(deck);
		if (dx <= 0 || !prev) {
			// At either end the card stays still; only a real neighbor can be revealed.
			const x = dx < 0 && next ? dx : 0,
				f = next ? Math.min(1, -Math.min(0, dx) / w) : 0;
			top.style.transform = `translateX(${x}px)`;
			if (next) next.style.transform = `translateY(${6 * (1 - f)}px)`;
			if (prev) {
				prev.classList.remove("is-prev");
				prev.style.transform = "";
			}
		} else {
			// Back: the previous card slides in from the left, over the top one.
			top.style.transform = "";
			prev.classList.add("is-prev");
			prev.style.visibility = "visible";
			const x = -w - 24 + dx;
			prev.style.transform = `translateX(${x}px)`;
		}
	},
	deckSettle(this: AppController, deck?: Deck, dir?: number) {
		deck._finish?.();
		const { i, top, next, prev, w } = this.deckParts(deck);
		if (!top) return;
		if ((dir === 1 && !next) || (dir === -1 && !prev)) dir = 0;
		const t: KeyframeAnimationOptions = {
				duration: MotionEngine.time("dur-deck"),
				easing: MotionEngine.curve(),
				fill: "forwards",
			},
			anims: Playback[] = [];
		const run = (el?: HTMLElement, to?: string) => {
			if (!el) return;
			const from = getComputedStyle(el).transform;
			const animation = MotionEngine.animate(el, [{ transform: from }, { transform: to }], t);
			if (animation) anims.push(animation);
			el.style.transform = to;
		};
		if (dir === 1) {
			run(top, `translateX(${-w * 1.15}px)`);
			run(next, "none");
		} else if (dir === -1) {
			if (!prev.classList.contains("is-prev")) this.deckFollow(deck, 1);
			run(prev, "none");
		} else {
			run(top, "none");
			if (next) run(next, "translateY(6px)");
			if (prev?.classList.contains("is-prev")) run(prev, `translateX(${-w - 24}px)`);
		}
		deck.dataset.busy = "1";
		let finished = false;
		const done = () => {
			if (finished) return;
			finished = true;
			anims.forEach((a) => {
				a.cancel();
			});
			delete deck.dataset.busy;
			deck._finish = null;
			this.deckShow(deck, i + dir);
		};
		deck._finish = done;
		Promise.all(anims.map((a) => a.finished)).then(done, done);
	},
	deckShow(this: AppController, deck?: Deck, i?: number) {
		const cards = [...deck.children] as HTMLElement[];
		i = Math.max(0, Math.min(cards.length - 1, i));
		const stack = deck.closest<HTMLElement>("[data-stack]");
		if (!stack) return;
		const key = stack.dataset.stack;
		cards.forEach((c: HTMLElement, k: number) => {
			MotionEngine.cancel(c);
			c.style.translate = "";
			c.classList.toggle("is-top", k === i);
			c.classList.toggle("is-next", k === i + 1);
			c.classList.remove("is-prev");
			c.style.transform = "";
			c.style.visibility = "";
			c.setAttribute("aria-hidden", String(k !== i));
		});
		// The one button that spreads the pile out always sits on the card you can see.
		const button = deck.querySelector<HTMLElement>(".card-title-button"),
			h = cards[i].querySelector<HTMLElement>(".card-title");
		if (button && h && !h.contains(button)) {
			const old = button.parentElement;
			old.textContent = button.textContent;
			button.textContent = h.textContent;
			h.textContent = "";
			h.appendChild(button);
		}
		(deck.dataset as Record<string, string | number>).cur = i;
		this.stackIndex.set(key, i);
	},
	restoreStacks(this: AppController) {
		this.grid.querySelectorAll<HTMLElement>("[data-stack] .deck").forEach((deck?: Deck) => {
			const i = this.stackIndex.get(deck.closest<HTMLElement>("[data-stack]").dataset.stack) || 0;
			if (i) this.deckShow(deck, i);
		});
	},
};
