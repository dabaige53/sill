import React, { useLayoutEffect, useRef, useState } from "react";
import { SelectionBar } from "../atoms/selection.tsx";

export { SelectionAI } from "../atoms/selection.tsx";

import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import { MotionEngine } from "../interactions/motion.ts";
import { sillIcon } from "../interactions/panel-primitives.tsx";

const homeTabs = [
	["all", "web.all"],
	["unread", "web.unread"],
	["todo", "web.home.todo"],
	["later", "web.later"],
	["saved", "web.bookmark"],
] as const;

/**
 * Phone: title, avatar and a row of solid tabs (ADR 0048).
 * Desktop: brand, a ⌄ tab menu, the search field and the avatar on one 40px line (ADR 0049).
 */
export function HomeTop() {
	const header = useRef<HTMLElement>(null);
	useLayoutEffect(() => {
		const node = header.current;
		if (!node) return;
		if (matchMedia("(min-width: 651px)").matches) {
			MotionEngine.change(
				node,
				() => node.classList.remove("is-entering"),
				MotionEngine.time("dur-reveal"),
				{ easing: MotionEngine.curve("ease-reveal") },
			);
		} else {
			node.classList.remove("is-entering");
		}
		return () => {
			MotionEngine.cancel(node);
			node.style.visibility = "";
		};
	}, []);
	return (
		<header ref={header} id="home-top" className="home-top is-entering">
			<span className="home-edge-blur" aria-hidden="true" />
			<div className="home-heading">
				<div className="home-brand">
					<button
						type="button"
						className="home-mark"
						data-action="top"
						aria-label={copy("web.home.top")}
					>
						<span className="home-logo">{sillIcon(40)}</span>
						Sill
					</button>
					<button
						type="button"
						className="home-menu-toggle"
						id="home-menu-toggle"
						data-action="home-menu"
						aria-haspopup="menu"
						aria-expanded="false"
						aria-controls="home-menu"
						aria-label={copy("web.home.filterMenu")}
					>
						<Icon name="chevron" size={20} />
					</button>
					<div className="home-menu" id="home-menu" role="menu" hidden>
						{homeTabs.map(([key, label], i) => (
							<button
								key={key}
								type="button"
								role="menuitemradio"
								className="home-menu-item"
								data-action="home-tab"
								data-extra={key}
								aria-checked={key === "all"}
							>
								<span className="home-menu-check" aria-hidden="true">
									<Icon name="check" size={16} />
								</span>
								<span className="home-menu-label">{copy(label)}</span>
								<span className="home-menu-key" aria-hidden="true">
									⌘{i + 1}
								</span>
							</button>
						))}
					</div>
				</div>
				<div className="home-search" id="home-search-field">
					<Icon name="search" size={16} />
					<button
						type="button"
						className="home-search-token"
						id="home-search-token"
						data-action="home-tab"
						data-extra="all"
						hidden
					/>
					<span className="home-search-marks" id="home-search-marks" />
					<input
						type="search"
						id="home-search"
						data-input="home-search"
						autoComplete="off"
						aria-label={copy("web.search.inputLabel")}
						placeholder={copy("web.home.searchPlaceholder")}
					/>
					<span className="home-search-key" aria-hidden="true">
						⌘K
					</span>
					<button
						type="button"
						className="home-search-clear"
						data-action="home-search-clear"
						aria-label={copy("web.search.clear")}
						hidden
					>
						<Icon name="x" size={12} />
					</button>
					<div className="home-hash-slot" id="home-hash-slot" />
				</div>
				<button
					type="button"
					className="home-account"
					id="account"
					data-action="nav"
					data-extra="settings"
					aria-label={copy("web.nav.settings")}
				>
					<span className="account-wrap">
						<AccountRing />
					</span>
				</button>
			</div>
			{/* biome-ignore lint/a11y/useSemanticElements: This group contains navigation filters, not form fields; preserve the existing layout and semantics. */}
			<div className="home-tabs" role="group" aria-label={copy("web.home.tabs")}>
				{homeTabs.map(([key, label]) => (
					<button
						key={key}
						type="button"
						className="home-tab"
						data-action="home-tab"
						data-extra={key}
						aria-pressed={key === "all"}
					>
						{copy(label)}
					</button>
				))}
			</div>
			<div className="home-kinds" id="home-kinds" hidden />
		</header>
	);
}
export function AccountRing() {
	return (
		<>
			<Icon name="person" size={22} />
			<svg className="orb-arc" viewBox="0 0 64 64" aria-hidden="true">
				<circle cx="32" cy="32" r="30" pathLength="100" />
			</svg>
			<span className="orb-done" aria-hidden="true">
				<Icon name="check" size={16} />
			</span>
		</>
	);
}
// @design nav-capsule
export function Navigation() {
	const tabs = [
		["home", "home", copy("web.nav.home")],
		["ai", "chat", copy("web.nav.ai")],
		["search", "search", copy("web.nav.search")],
	];
	return (
		<nav className="nav-capsule glass" id="nav" aria-label={copy("web.nav.label")}>
			<span className="nav-lens" aria-hidden="true" />
			{tabs.map(([key, glyph, label]) => (
				<button
					key={key}
					type="button"
					className="nav-tab"
					data-action="nav"
					data-extra={key}
					aria-label={key === "ai" ? copy("web.nav.aiLabel") : label}
					aria-current={key === "home" ? "page" : undefined}
				>
					<span className="nav-icon">
						<Icon name={glyph} size={22} />
					</span>
				</button>
			))}
		</nav>
	);
}
/**
 * Desktop bottom rail (ADR 0049): one AI box in place of the navigation capsule. With a session it
 * grows into the panel and the full view (ADR 0064); the controller paints those parts.
 * The built-in AI is not connected, so add, voice and send stay disabled.
 */
export function AIDock() {
	const [collapsed, setCollapsed] = useState(false);
	const positionRef = useRef(0);
	const [, setPosition] = useState(0);
	const dock = useRef<HTMLDivElement>(null);
	const drag = useRef<{ x: number; position: number; moved: boolean } | null>(null);
	const moved = useRef(false);
	const before = useRef<DOMRect | null>(null);
	const animation = useRef<Animation | null>(null);
	const toggle = (value: boolean) => {
		before.current = dock.current?.getBoundingClientRect() ?? null;
		animation.current?.cancel();
		setCollapsed(value);
		if (value) {
			positionRef.current = positionRef.current < 0 ? -1 : 1;
			setPosition(positionRef.current);
		}
	};
	const range = () =>
		Math.max(
			0,
			((dock.current?.parentElement?.clientWidth ?? 0) - (dock.current?.offsetWidth ?? 0)) / 2,
		);
	const expand = () => {
		toggle(false);
		requestAnimationFrame(() => document.getElementById("ai-dock-input")?.focus());
	};
	useLayoutEffect(() => {
		const node = dock.current;
		if (!node) return;
		const update = () => {
			node.style.translate = positionRef.current * range() + "px 0";
		};
		update();
		if (before.current) {
			const old = before.current;
			before.current = null;
			const next = node.getBoundingClientRect();
			const surface = node.querySelector<HTMLElement>(".ai-dock-surface")!;
			const dx = old.left + old.width / 2 - next.left - next.width / 2;
			const scale = old.width / next.width;
			animation.current = surface.animate(
				[
					{ transform: "translateX(" + dx + "px) scaleX(" + scale + ")" },
					{ transform: "translateX(0) scaleX(1)" },
				],
				{ duration: MotionEngine.time("dur-state"), easing: MotionEngine.curve("ease-reveal") },
			);
			for (const child of node.children) {
				if (!(child instanceof HTMLElement) || child === surface) continue;
				for (const active of child.getAnimations()) active.cancel();
				child.animate(
					[
						{ opacity: 0, transform: "translateX(" + dx + "px)" },
						{ opacity: 1, transform: "translateX(0)" },
					],
					{
						duration: MotionEngine.time("dur-state"),
						easing: MotionEngine.curve("ease-reveal"),
					},
				);
			}
		}
		const observer = new ResizeObserver(update);
		observer.observe(node);
		if (node.parentElement) observer.observe(node.parentElement);
		return () => observer.disconnect();
	});
	useLayoutEffect(() => {
		const open = () => setCollapsed(false);
		window.addEventListener("sill:expand-ai", open);
		return () => window.removeEventListener("sill:expand-ai", open);
	}, []);
	const pointer = {
		onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
			if (e.button !== 0 || dock.current?.dataset.height !== "line") return;
			const target = e.target as HTMLElement;
			if (
				target.closest(".ai-dock-tools, .ai-dock-context") ||
				(target.closest("button") && !target.closest(".ai-dock-restore"))
			)
				return;
			e.preventDefault();
			e.stopPropagation();
			moved.current = false;
			animation.current?.finish();
			drag.current = { x: e.clientX, position: positionRef.current, moved: false };
			(target.closest<HTMLElement>(".ai-dock-restore") ?? e.currentTarget).setPointerCapture(
				e.pointerId,
			);
		},
		onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
			if (!drag.current) return;
			const delta = e.clientX - drag.current.x;
			if (Math.abs(delta) > 4) drag.current.moved = true;
			moved.current = drag.current.moved;
			if (drag.current.moved) dock.current?.classList.add("is-moving");
			if (drag.current.moved) {
				const next = Math.max(-1, Math.min(1, drag.current.position + delta / (range() || 1)));
				positionRef.current = next;
				if (dock.current) dock.current.style.translate = next * range() + "px 0";
				// Rebase at the boundary so reversing direction responds immediately.
				drag.current.x = e.clientX;
				drag.current.position = next;
			}
		},
		onPointerUp: () => {
			if (!drag.current) return;
			dock.current?.classList.remove("is-moving");
			if (!moved.current && !collapsed) document.getElementById("ai-dock-input")?.focus();
			drag.current = null;
		},
		onPointerCancel: () => {
			dock.current?.classList.remove("is-moving");
			drag.current = null;
		},
		onLostPointerCapture: () => {
			dock.current?.classList.remove("is-moving");
			drag.current = null;
		},
		onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
			if (!collapsed && !e.altKey) return;
			if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
			e.preventDefault();
			positionRef.current = Math.max(
				-1,
				Math.min(1, positionRef.current + (e.key === "ArrowLeft" ? -0.1 : 0.1)),
			);
			setPosition(positionRef.current);
		},
	};
	return (
		<div
			{...pointer}
			ref={dock}
			id="ai-dock"
			className={"ai-dock" + (collapsed ? " is-collapsed" : "")}
			data-height="line"
		>
			<div className="ai-dock-surface glass" aria-hidden="true" />
			<button
				type="button"
				className="ai-dock-restore ai-dock-button"
				aria-label={copy("web.ai.expand")}
				title={copy("web.ai.expand")}
				onClick={() => {
					if (!moved.current) expand();
				}}
			>
				<Icon name="chat" size={20} />
			</button>

			<aside
				className="ai-dock-sessions"
				id="ai-dock-sessions"
				aria-label={copy("ai.sessions")}
				hidden
			/>
			<section
				className="ai-dock-thread"
				id="ai-dock-thread"
				aria-label={copy("ai.thread")}
				hidden
			/>
			<div className="ai-dock-context" id="ai-dock-context" />
			<div className="ai-dock-row">
				<span className="ai-dock-session-slot" id="ai-dock-session" />
				<button
					type="button"
					className="ai-dock-button"
					disabled
					aria-label={copy("web.ai.addUnavailable")}
				>
					<Icon name="plus" size={20} />
				</button>
				<input
					type="text"
					id="ai-dock-input"
					className="ai-dock-input"
					maxLength={4000}
					autoComplete="off"
					aria-label={copy("web.ai.dock")}
					placeholder={copy("web.ai.dockPlaceholder")}
				/>
				<button type="button" className="ai-dock-button" disabled aria-label={copy("web.ai.speak")}>
					<Icon name="mic" size={20} />
				</button>
				<button
					type="button"
					className="ai-dock-button ai-dock-send"
					disabled
					aria-label={copy("web.ai.sendUnavailable")}
				>
					<span>
						<Icon name="up" size={20} />
					</span>
				</button>
			</div>
			<div className="ai-dock-tools">
				<button
					type="button"
					className="ai-dock-button glass"
					aria-label={copy("web.ai.collapse")}
					title={copy("web.ai.collapse")}
					onClick={() => {
						toggle(true);
						requestAnimationFrame(() =>
							dock.current?.querySelector<HTMLButtonElement>(".ai-dock-restore")?.focus(),
						);
					}}
				>
					<Icon name="ai-minimize" size={20} />
				</button>
			</div>
		</div>
	);
}
export function WorkspaceShell() {
	return (
		<>
			<HomeTop />
			<main aria-label={copy("web.app.75db60dcb6ad")}>
				<h1 className="sr-only" id="page-title">
					{copy("web.common.desk")}
				</h1>
				<div className="feed-grid" id="feed-grid" />
				<div className="feed-end" aria-hidden="true" />
			</main>
			<div id="dock">
				<button type="button" id="offline" className="glass" data-action="retry" hidden>
					{copy("web.app.3d52574ce150")}
				</button>
				<SelectionBar />
				<AIDock />
				<Navigation />
			</div>
			<button
				type="button"
				id="new-count"
				className="glass"
				data-action="show-new"
				hidden
				aria-label={copy("web.app.3fa133e511d1")}
			/>
			<div className="scroll-edge" id="scroll-edge" aria-hidden="true" />
			<div className="drop-hint" id="drop-hint" hidden>
				<span>{copy("web.app.2c8fe7be9774")}</span>
				<small>{copy("web.app.4cb50c8338fe")}</small>
			</div>
			<dialog id="modal" aria-labelledby="modal-title" />
			<div id="toast" className="glass" role="status" aria-live="polite" hidden>
				<span id="toast-text" />
				<span id="toast-action" />
			</div>
			<div className="sr-only" id="announcer" aria-live="polite" />
		</>
	);
}
