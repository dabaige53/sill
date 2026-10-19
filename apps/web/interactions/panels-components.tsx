import { type ReactNode } from "react";
import { copy } from "../copy.ts";
import { panelCard } from "./panel-card.tsx";
import { type PanelRenderers } from "./panel-contract.ts";
import { sillIcon } from "./panel-primitives.tsx";
import { panelSearch } from "./panel-search.tsx";
import { panelSettings } from "./panel-settings.tsx";
import { relativeTime } from "./previews-components.tsx";

const PanelViews: PanelRenderers = { ...panelCard, ...panelSearch, ...panelSettings };

function WelcomeView({
	actions = null,
	detail = "",
}: {
	actions?: ReactNode;
	detail?: ReactNode;
} = {}) {
	return (
		<>
			<section className={"welcome"} aria-labelledby={"welcome-title"}>
				{sillIcon(72)}
				<h1 id={"welcome-title"}>{"Sill"}</h1>
				<p>{copy("web.welcome.tagline")}</p>
				{detail}
				<div className={"welcome-actions"}>
					{actions === null ? (
						<>
							<button type={"button"} className={"solid-button"} data-action={"capture"}>
								{copy("web.capture.title")}
							</button>
							<button type={"button"} className={"text-link"} data-action={"welcome-demo"}>
								{copy("web.welcome.viewDemo")}
							</button>
						</>
					) : (
						actions
					)}
				</div>
			</section>
		</>
	);
}

function formatBytes(n?: number) {
	return n < 1024
		? `${n} B`
		: n < 1048576
			? `${(n / 1024).toFixed(1)} KB`
			: n < 1073741824
				? `${(n / 1048576).toFixed(1)} MB`
				: `${(n / 1073741824).toFixed(1)} GB`;
}

export type { PanelRenderers };
export { formatBytes, PanelViews, relativeTime, WelcomeView };
