import {
	NewContentNotice,
	OfflineNotice,
	ToastSurface,
} from "../../../apps/web/atoms/feedback.tsx";
import { CheckItem } from "../../../apps/web/atoms/react-primitives.tsx";
import { SelectionBar } from "../../../apps/web/atoms/selection.tsx";
import { Title } from "../../../apps/web/cards/card-blocks.tsx";
import { CardView, StackView } from "../../../apps/web/cards/components.tsx";
import { copy } from "../../../apps/web/copy.ts";
import { Store } from "../../../apps/web/data/store.ts";
import { toggle } from "../../../apps/web/interactions/panel-primitives.tsx";
import { PanelViews } from "../../../apps/web/interactions/panels-components.tsx";
import { SettingRow } from "../../../apps/web/interactions/setting-row.tsx";
import { HomeScopeMenu } from "../../../apps/web/views/home-scope-menu.tsx";
import { HomeSearchField } from "../../../apps/web/views/home-search-field.tsx";
import { AIDock } from "../../../apps/web/views/shell.tsx";

export function TaskExample() {
	const card = Store.card("motion-task");
	return <CheckItem cardId={card.id} task={Store.tasks(card)[0]} />;
}
export function ToggleExample() {
	return (
		<SettingRow
			label={copy("web.settings.fadeRead")}
			side={toggle("fadeRead", Store.pref("fadeRead"), copy("web.settings.fadeRead"))}
		/>
	);
}
export function CardMenuExample() {
	const card = Store.card("motion-card-1");
	return (
		<div className="card-body" data-card={card.id}>
			<Title
				card={card}
				ctx={{ state: {}, tasks: [], taskPreviewOrder: [], passive: false, now: 0 }}
			/>
		</div>
	);
}
/** Covers are the same partial component renderers as the interactive examples. */
export function ExampleCover({ id }: { id: string }) {
	const card = Store.card("motion-card-1");
	if (id === "control.press") return PanelViews.bookmark(card, Store.item(card.id));
	if (id === "task.mark") return <TaskExample />;
	if (id === "settings.toggle") return <ToggleExample />;
	if (id === "menu.scope")
		return (
			<div className="home-brand">
				<HomeScopeMenu />
			</div>
		);
	if (id === "menu.card") return <CardMenuExample />;
	if (id === "search.resize") return <HomeSearchField />;
	if (id === "reader.tools" || id === "reader.gesture")
		return PanelViews.tools(card, Store.item(card.id));
	if (id === "feedback.toast") return <ToastSurface />;
	if (id === "notice.offline") return <OfflineNotice />;
	if (id === "notice.new-content") return <NewContentNotice />;
	if (id === "drag.ai-target") return <AIDock />;
	if (id === "drag.selection") return <SelectionBar />;
	if (id === "deck.swipe")
		return <StackView stackKey="motion-stack" cards={Store.state.cards.slice(0, 3)} />;
	return <CardView card={card} options={{ compact: true }} />;
}
