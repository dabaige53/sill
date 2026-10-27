import { Fragment } from "react";
import type { Card } from "../../../contracts/card.ts";
import { MediaDetail, type PlaybackApp } from "../cards/media-detail.tsx";
import { copy } from "../copy.ts";
import { Store } from "../data/store.ts";
import type { PanelRenderers, PreviewApp } from "./panel-contract.ts";
import { agentAction, button, personalNote, SheetEdges } from "./panel-primitives.tsx";

/** The player stays at the same React position while only its surrounding layout changes. */
export function VideoSurface({
	card,
	app,
	full = false,
	expandable = false,
	renderers,
}: {
	card: Card;
	app?: PreviewApp & PlaybackApp;
	full?: boolean;
	expandable?: boolean;
	renderers: PanelRenderers;
}) {
	const state = Store.item(card.id);
	return (
		<>
			<div
				className={full ? "reader-layout is-workspace" : "sheet preview-sheet detail-media"}
				data-video-surface={card.id}
			>
				{!full
					? renderers.head(
							expandable
								? button("expand", copy("web.preview.fullscreen"), "reader", card.id)
								: null,
							button("x", copy("web.preview.close"), "close"),
						)
					: null}
				{!full ? <SheetEdges /> : null}
				{/* biome-ignore lint/a11y/useSemanticElements: Keep the named, focusable scroll region shared with the existing detail surface. */}
				<div
					key="scroll"
					className={full ? "reader-scroll reader-workspace is-media-reader" : "sheet-scroll"}
					id={full ? "reader-scroll" : undefined}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users focus the named content region for scrolling.
					tabIndex={0}
					role="region"
					aria-label={copy("web.preview.contentRegion")}
				>
					<div className={full ? "reader-body" : "preview-body"}>
						<MediaDetail key={card.id} card={card} app={app} full={full} />
						{personalNote(state.note)}
						{renderers.foot(agentAction(app, card))}
						{full ? <div className="reader-end" id="reader-end" aria-hidden="true" /> : null}
					</div>
				</div>
			</div>
			{full ? (
				<div className="reader-head glass" role="toolbar" aria-label={copy("web.readerTools")}>
					{button("collapse", copy("web.reader.exitFullscreen"), "preview", card.id)}
					{button("x", copy("web.reader.close"), "close-all")}
				</div>
			) : null}
			<Fragment key="tools">{renderers.tools(card, state, renderers.own(card))}</Fragment>
		</>
	);
}
