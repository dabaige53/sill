import type { ReactNode } from "react";
import { panelAI } from "./panel-ai.tsx";
import { panelCard } from "./panel-card.tsx";
import type { PanelRenderers } from "./panel-contract.ts";
import { sillIcon } from "./panel-primitives.tsx";
import { panelSearch } from "./panel-search.tsx";
import { panelSettings } from "./panel-settings.tsx";
import { relativeTime } from "./previews-components.tsx";

const PanelViews: PanelRenderers = { ...panelCard, ...panelSearch, ...panelSettings, ...panelAI };

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
				{detail}
				<div className={"welcome-actions"}>
					{actions}
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
