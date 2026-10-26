import { NewContentNotice, OfflineNotice, ToastSurface } from "../atoms/feedback.tsx";
import { CheckItem } from "../atoms/react-primitives.tsx";
import { SelectionBar } from "../atoms/selection.tsx";
import { Title } from "../cards/card-blocks.tsx";
import { CardView, StackView } from "../cards/components.tsx";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import { toggle } from "../interactions/panel-primitives.tsx";
import { PanelViews } from "../interactions/panels-components.tsx";
import { SettingRow } from "../interactions/setting-row.tsx";
import { HomeScopeMenu } from "../views/home-scope-menu.tsx";
import { HomeSearchField } from "../views/home-search-field.tsx";
import { AIDock } from "../views/shell.tsx";

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
