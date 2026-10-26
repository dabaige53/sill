import React from "react";

// Lines per placeholder card; mixed heights keep the masonry columns uneven like a real desk.
const bootLines = [3, 2, 4, 2, 3, 2];

/**
 * Opening the app waits for its first data response. Until it answers, the desk stays empty
 * instead of offering a login; after `delay-loading` it shows card-shaped placeholders.
 */
export function FeedBoot({ visible }: { visible: boolean }) {
	if (!visible) return <div className="feed-boot" aria-hidden="true" />;
	return bootLines.map((lines, index) => (
		// biome-ignore lint/suspicious/noArrayIndexKey: Placeholders are fixed and stateless.
		<div key={index} className="feed-item feed-card feed-skeleton" aria-hidden="true">
			<div className="card-body">
				<div className="skeleton-lines">
					{Array.from({ length: lines }, (_, line) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: Lines are fixed and stateless.
						<i key={line} />
					))}
				</div>
			</div>
		</div>
	));
}
