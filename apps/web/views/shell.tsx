import type React from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import accountAvatar from "../../../design-system/mascot/avatar.png";
import { NewContentNotice, OfflineNotice, ToastSurface } from "../atoms/feedback.tsx";
import { SelectionBar } from "../atoms/selection.tsx";

export { SelectionAI } from "../atoms/selection.tsx";

import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";
import {
	anchoredBubble,
	animateAIDock,
	type CollapseCapture,
	type CollapseVisual,
	captureAIDock,
	collapseDockAnchor,
} from "../interactions/ai-collapse.ts";
import { sillIcon } from "../interactions/panel-primitives.tsx";

import { HomeScopeMenu, homeTabs } from "./home-scope-menu.tsx";
import { HomeSearchField } from "./home-search-field.tsx";

/**
 * Phone: title, avatar and a row of solid tabs (ADR 0048).
 * Desktop: brand, a ⌄ tab menu, the search field and the avatar on one 40px line (ADR 0049).
 */
export function HomeTop() {
	return (
		<header id="home-top" className="home-top">
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
					<HomeScopeMenu />
				</div>
				<HomeSearchField />
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
			<img className="account-avatar" src={accountAvatar} alt="" />
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
			<span className="nav-lens" aria-hidden="true">
				{tabs.map(([key, glyph]) => (
					<span key={key} className="nav-lens-tab">
						<span className="nav-icon">
							<Icon name={glyph} size={22} />
						</span>
					</span>
				))}
			</span>
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
	const before = useRef<CollapseCapture | null>(null);
	const animation = useRef<CollapseVisual | null>(null);
	const anchor = useRef<Pick<DOMRect, "left" | "top" | "width" | "height"> | null>(null);
	// Restore from the same edge used when collapsing.
	const collapseLeft = useRef(false);
	const expandFrom = useRef<number | null>(null);
	const bubbleY = useRef(0);
	// The bubble's place before a card drag opened the box without animation.
	const dragBubble = useRef<{ position: number; y: number } | null>(null);
	const toggle = useCallback((value: boolean, instant = false) => {
		const node = dock.current;
		if (!node || node.classList.contains("is-collapsed") === value) return;
		before.current = instant ? null : captureAIDock(node, animation.current);
		const box = node.getBoundingClientRect();
		if (value) {
			const target = collapseDockAnchor(box, innerWidth);
			collapseLeft.current = target.left;
			anchor.current = instant ? null : target.rect;
		} else expandFrom.current = collapseLeft.current ? box.left : box.right;
		animation.current?.cancel();
		animation.current = null;
		setCollapsed(value);
	}, []);
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
			if (collapsed && anchor.current) {
				node.style.translate = "none";
				const natural = node.getBoundingClientRect();
				const target = anchoredBubble(anchor.current, natural.width);
				positionRef.current = (target.left - natural.left) / (range() || 1);
				bubbleY.current = target.top - natural.top;
				anchor.current = null;
			}
			if (!collapsed && expandFrom.current !== null) {
				node.style.translate = "none";
				const natural = node.getBoundingClientRect();
				positionRef.current = Math.max(
					-1,
					Math.min(
						1,
						(expandFrom.current - (collapseLeft.current ? natural.left : natural.right)) /
							(range() || 1),
					),
				);
				expandFrom.current = null;
			}
			node.style.translate = `${positionRef.current * range()}px ${collapsed ? bubbleY.current : 0}px`;
		};
		update();
		if (before.current) {
			const captured = before.current;
			before.current = null;
			animation.current = animateAIDock(node, captured, collapsed);
		}
		const observer = new ResizeObserver(update);
		observer.observe(node);
		if (node.parentElement) observer.observe(node.parentElement);
		return () => observer.disconnect();
	});
	useLayoutEffect(() => {
		const open = (e: Event) => {
			if (!dock.current?.classList.contains("is-collapsed")) return;
			const instant = !!(e as CustomEvent<{ instant?: boolean }>).detail?.instant;
			dragBubble.current = instant ? { position: positionRef.current, y: bubbleY.current } : null;
			toggle(false, instant);
		};
		const close = () => {
			const bubble = dragBubble.current;
			dragBubble.current = null;
			if (!bubble) return;
			toggle(true, true);
			positionRef.current = bubble.position;
			bubbleY.current = bubble.y;
		};
		window.addEventListener("sill:expand-ai", open);
		window.addEventListener("sill:collapse-ai", close);
		return () => {
			window.removeEventListener("sill:expand-ai", open);
			window.removeEventListener("sill:collapse-ai", close);
		};
	}, [toggle]);
	useLayoutEffect(() => () => animation.current?.cancel(), []);
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
			drag.current = { x: e.clientX, position: positionRef.current, moved: false };
			(target.closest<HTMLElement>(".ai-dock-restore") ?? e.currentTarget).setPointerCapture(
				e.pointerId,
			);
		},
		onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
			if (!drag.current) return;
			const delta = e.clientX - drag.current.x;
			if (!drag.current.moved && Math.abs(delta) > 4) {
				// A tap may reverse the current collapse. Finish it only when an actual drag takes over.
				animation.current?.complete();
				animation.current = null;
				drag.current.moved = true;
			}
			moved.current = drag.current.moved;
			if (drag.current.moved) dock.current?.classList.add("is-moving");
			if (drag.current.moved) {
				const next = Math.max(-1, Math.min(1, drag.current.position + delta / (range() || 1)));
				positionRef.current = next;
				if (dock.current)
					dock.current.style.translate = `${next * range()}px ${collapsed ? bubbleY.current : 0}px`;
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
			hidden={!!window.__SILL_HOST__}
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
			<div id="workspace-background">
				<HomeTop />
				<main aria-label={copy("web.app.75db60dcb6ad")}>
					<h1 className="sr-only" id="page-title">
						{copy("web.common.desk")}
					</h1>
					<div className="feed-grid" id="feed-grid" />
					<div className="feed-end" aria-hidden="true" />
				</main>
				<div id="dock">
					<OfflineNotice />
					<SelectionBar />
					<AIDock />
					<Navigation />
				</div>
				<NewContentNotice />
				<div className="scroll-edge" id="scroll-edge" aria-hidden="true" />
			</div>
			<dialog id="modal" aria-labelledby="modal-title" />
			<dialog id="tag-layer" className="panel narrow" aria-labelledby="editor-title" />
			<ToastSurface />
			<div className="sr-only" id="announcer" aria-live="polite" />
		</>
	);
}
