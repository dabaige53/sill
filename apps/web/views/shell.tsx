import React from "react";
import { SelectionBar } from "../atoms/selection.tsx";

export { SelectionAI } from "../atoms/selection.tsx";

import { Icon } from "../atoms/react-primitives.tsx";
import { copy } from "../copy.ts";

export function HomeTop() {
	const tabs = [
		["all", copy("web.all")],
		["unread", copy("web.unread")],
		["todo", copy("web.home.todo")],
		["later", copy("web.later")],
		["saved", copy("web.bookmark")],
	];
	return (
		<header id="home-top" className="home-top">
			<button
				type="button"
				className="home-mark"
				data-action="top"
				aria-label={copy("web.home.top")}
			>
				<Icon name="sill" size={26} />
			</button>
			{/* biome-ignore lint/a11y/useSemanticElements: This group contains navigation filters, not form fields; preserve the existing layout and semantics. */}
			<div className="home-tabs" role="group" aria-label={copy("web.home.tabs")}>
				{tabs.map(([key, label]) => (
					<button
						key={key}
						type="button"
						className="home-tab"
						data-action="home-tab"
						data-extra={key}
						aria-pressed={key === "all"}
					>
						{label}
					</button>
				))}
			</div>
		</header>
	);
}
export function AccountRing() {
	return (
		<>
			<Icon name="sill" size={22} />
			<svg className="orb-arc" viewBox="0 0 64 64" aria-hidden="true">
				<circle cx="32" cy="32" r="30" pathLength="100" />
			</svg>
			<span className="orb-done" aria-hidden="true">
				<Icon name="check" size={16} />
			</span>
		</>
	);
}
export function Navigation() {
	const tabs = [
		["home", "home", copy("web.nav.home")],
		["search", "search", copy("web.nav.search")],
		["ai", "chat", copy("web.nav.ai")],
		["settings", "sill", copy("web.nav.settings")],
	];
	return (
		<nav className="nav-capsule glass" id="nav" aria-label={copy("web.nav.label")}>
			<span className="nav-lens" aria-hidden="true" />
			{tabs.map(([key, glyph, label]) => (
				<button
					key={key}
					type="button"
					className="nav-tab"
					id={key === "settings" ? "account" : undefined}
					data-action="nav"
					data-extra={key}
					aria-label={key === "ai" ? copy("web.nav.aiLabel") : label}
					aria-current={key === "home" ? "page" : undefined}
				>
					<span className="nav-icon">
						{key === "settings" ? (
							<span className="account-wrap">
								<AccountRing />
							</span>
						) : (
							<Icon name={glyph} size={22} />
						)}
					</span>
					{key !== "settings" && (
						<span className="nav-label" aria-hidden="true">
							{label}
						</span>
					)}
				</button>
			))}
		</nav>
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
