import { Fragment } from "react";
import type { Card } from "../../../contracts/card.ts";
import { MediaDetail, type PlaybackApp } from "../cards/media-detail.tsx";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import type { PanelRenderers, PreviewApp } from "./panel-contract.ts";
import { agentAction, button, personalNote, SheetEdges } from "./panel-primitives.tsx";

export function VideoSurface({
	card,
	app,
	renderers,
}: {
	card: Card;
	app?: PreviewApp & PlaybackApp;
	renderers: PanelRenderers;
}) {
	const state = Store.item(card.id);
	return (
		<>
			<div className="sheet preview-sheet detail-media" data-video-surface={card.id}>
				{renderers.head(null, button("x", copy("web.preview.close"), "close"))}
				<SheetEdges />
				{/* biome-ignore lint/a11y/useSemanticElements: Keep the named, focusable scroll region shared with the existing detail surface. */}
				<div
					key="scroll"
					className="sheet-scroll"
					// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users focus the named content region for scrolling.
					tabIndex={0}
					role="region"
					aria-label={copy("web.preview.contentRegion")}
				>
					<div className="preview-body">
						<MediaDetail key={card.id} card={card} app={app} />
						{personalNote(state.note)}
						{renderers.foot(agentAction(app, card))}
					</div>
				</div>
			</div>
			<Fragment key="tools">{renderers.tools(card, state, renderers.own(card))}</Fragment>
		</>
	);
}
